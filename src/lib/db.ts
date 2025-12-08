import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { WordCard, Deck } from '@/types';
import { type ReviewLog, State } from 'ts-fsrs';

/**
 * @description 数据库模式定义
 */
interface MyDB extends DBSchema {
    decks: {
        key: string;
        value: Deck;
    };
    cards: {
        key: string;
        value: WordCard;
        indexes: { 'due': string; 'deckId': string; 'word': string };
    };
    logs: {
        key: number;
        value: ReviewLog & { cardId: string };
        autoIncrement: true;
        indexes: { 'cardId': string };
    };
    // v3 新增: 存储单词的语义向量
    embeddings: {
        key: string; // word
        value: { word: string; vector: number[] };
    };
    // v3 新增: 存储单词间的语义连接
    semantic_connections: {
        key: string; // source word
        value: { source: string; connections: Array<{ target: string; similarity: number; label?: string; example?: string; example_cn?: string }> };
    };
    // v5 新增: 缓存卡包的语义聚类结果
    deck_clusters: {
        key: string; // deckId
        value: { deckId: string; clusters: any[]; updatedAt: number; totalDeckSize?: number };
    };
    // v6 新增: 缓存分组学习的图谱结构
    group_graphs: {
        key: string; // cacheKey (hash of words)
        value: {
            id: string;
            nodes: any[];
            links: any[];
            timestamp: number;
        };
    };
    // v7 新增: 缓存 AI 生成的单词关联数据 (用于复习模式)
    ai_graph_cache: {
        key: string; // word
        value: {
            word: string;
            relatedItems: Array<{ word: string; meaning: string; relation: string }>;
            timestamp: number;
        };
    };
}

const DB_NAME = 'englishoo-db';
const DB_VERSION = 9; // Incremented version to 9 to resolve mismatch

let dbPromise: Promise<IDBPDatabase<MyDB>>;

import { createNewWordCard } from '@/lib/fsrs';

export const SYSTEM_DECK_GUIDED = 'system-mindmap-guided';

/**
 * @description 获取/初始化数据库
 */
export function getDB() {
    if (!dbPromise) {
        dbPromise = openDB<MyDB>(DB_NAME, DB_VERSION, {
            upgrade(db, oldVersion, _newVersion, transaction) {
                if (oldVersion < 1) {
                    // Decks store
                    if (!db.objectStoreNames.contains('decks')) {
                        db.createObjectStore('decks', { keyPath: 'id' });
                    }

                    // Create Cards Store with deckId index
                    if (!db.objectStoreNames.contains('cards')) {
                        const cardStore = db.createObjectStore('cards', { keyPath: 'id' });
                        cardStore.createIndex('due', 'due');
                        cardStore.createIndex('deckId', 'deckId');
                        cardStore.createIndex('word', 'word', { unique: false }); // Add word index
                    }

                    // Create Logs Store
                    if (!db.objectStoreNames.contains('logs')) {
                        const logStore = db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true } as any);
                        logStore.createIndex('cardId', 'cardId');
                    }
                }

                // v3: Create Embeddings Store
                if (oldVersion < 3) {
                    if (!db.objectStoreNames.contains('embeddings')) {
                        db.createObjectStore('embeddings', { keyPath: 'word' });
                    }
                    if (!db.objectStoreNames.contains('semantic_connections')) {
                        db.createObjectStore('semantic_connections', { keyPath: 'source' });
                    }
                }

                // v4: Add word index to existing store if missing
                if (oldVersion >= 1 && oldVersion < 4) {
                    const cardStore = transaction.objectStore('cards');
                    if (!cardStore.indexNames.contains('word')) {
                        cardStore.createIndex('word', 'word', { unique: false });
                    }
                }

                // v5: Create Deck Clusters Cache Store
                if (oldVersion < 5) {
                    if (!db.objectStoreNames.contains('deck_clusters')) {
                        db.createObjectStore('deck_clusters', { keyPath: 'deckId' });
                    }
                }

                // v6: Create Group Graphs Cache Store
                if (oldVersion < 6) {
                    if (!db.objectStoreNames.contains('group_graphs')) {
                        db.createObjectStore('group_graphs', { keyPath: 'id' });
                    }
                }

                // v7: Create AI Graph Cache Store
                if (oldVersion < 7) {
                    if (!db.objectStoreNames.contains('ai_graph_cache')) {
                        db.createObjectStore('ai_graph_cache', { keyPath: 'word' });
                    }
                }
            },
        });
    }
    return dbPromise;
}

export const initDB = async () => {
    const db = await getDB();

    // Post-upgrade: Ensure default "Vocabulary Book" exists
    const defaultDeckId = 'vocabulary-book';
    // Use put instead of add to prevent ConstraintError if it exists but get() missed it due to race conditions
    try {
        // Check if we should preserve existing data (optional, but put overwrites keys)
        // Ideally we want to create if not exists. 
        // db.put will overwrite if exists. For a deck metadata, it's fine to ensure it exists.
        // But we don't want to overwrite user changes to the deck name/desc if it exists.
        // So we stick to existence check but catch the add error more gracefully or use a transaction.

        // Better approach: Just try to get it. If not, try to add. If add fails, it's fine.
        const existing = await db.get('decks', defaultDeckId);
        if (!existing) {
            await db.put('decks', {
                id: defaultDeckId,
                name: '生词本',
                description: '默认生词本，用于存放日常收集的单词',
                createdAt: new Date(),
            });
            console.log('Created/Ensured default vocabulary deck');
        }
    } catch (e) {
        console.warn('Default deck creation skipped:', e);
    }

    // Ensure Guided Learning deck exists (System Deck)
    try {
        const guidedDeck = await db.get('decks', SYSTEM_DECK_GUIDED);
        if (!guidedDeck) {
            await db.put('decks', {
                id: SYSTEM_DECK_GUIDED,
                name: '思维导图引导学习',
                description: '基于场景的沉浸式引导学习模式，通过思维导图串联知识点。',
                createdAt: new Date(),
            });
            console.log('Created/Ensured system guided deck');
        }
    } catch (e) {
        console.warn('System guided deck creation skipped:', e);
    }

    return db;
};

/**
 * @description 添加单词到生词本
 */
export async function addToVocabularyDeck(word: string) {
    const db = await getDB();
    const deckId = 'vocabulary-book';

    // Check if word already exists in this deck
    const existingCards = await db.getAllFromIndex('cards', 'deckId', deckId);
    const exists = existingCards.some(c => c.word.toLowerCase() === word.toLowerCase());

    if (exists) {
        return { success: false, message: '单词已存在于生词本中' };
    }

    // Create new card using helper
    const newCard = createNewWordCard(
        word,
        "正在生成释义...", // Placeholder
        "unknown",
        deckId
    );

    await db.put('cards', newCard);
    return { success: true, message: '已添加到生词本', card: newCard };
}

// --- Deck Operations ---

export async function createDeck(deck: Deck) {
    const db = await getDB();
    return db.add('decks', deck);
}

export async function getAllDecks() {
    const db = await getDB();
    return db.getAll('decks');
}

export async function getDeckById(id: string) {
    const db = await getDB();
    return db.get('decks', id);
}

export async function getAllLogs() {
    const db = await getDB();
    return db.getAll('logs');
}

export async function deleteDeck(id: string) {
    if (id === SYSTEM_DECK_GUIDED) {
        throw new Error('无法删除系统预设的引导学习卡包');
    }
    if (id === 'vocabulary-book') {
        throw new Error('无法删除默认生词本');
    }
    const db = await getDB();
    const tx = db.transaction(['decks', 'cards'], 'readwrite');

    // Delete deck
    await tx.objectStore('decks').delete(id);

    // Delete associated cards
    const index = tx.objectStore('cards').index('deckId');
    let cursor = await index.openCursor(IDBKeyRange.only(id));

    while (cursor) {
        await cursor.delete();
        cursor = await cursor.continue();
    }

    await tx.done;
}

// --- Card Operations ---

/**
 * @description 保存或更新卡片
 */
export async function saveCard(card: WordCard) {
    const db = await getDB();
    return db.put('cards', card);
}

/**
 * @description 删除卡片
 */
export async function deleteCard(id: string) {
    const db = await getDB();
    return db.delete('cards', id);
}

/**
 * @description 获取所有卡片 (可按 deckId 过滤)
 */
export async function getAllCards(deckId?: string) {
    const db = await getDB();
    if (deckId) {
        return db.getAllFromIndex('cards', 'deckId', deckId);
    }
    return db.getAll('cards');
}

export async function getCardCount(deckId?: string): Promise<number> {
    const db = await getDB();
    if (deckId) {
        return db.countFromIndex('cards', 'deckId', deckId);
    }
    return db.count('cards');
}

/**
 * @description 根据单词文本获取卡片 (不区分大小写)
 */
export async function getCardByWord(word: string) {
    const db = await getDB();
    // Use 'word' index for O(1) lookup
    // Note: The index is non-unique but we typically expect one card per word in a deck.
    // If duplicates exist across decks, this returns the first one found by index.
    // Since we want ANY card matching the word (usually for context), this is fine.
    const card = await db.getFromIndex('cards', 'word', word);

    // Fallback for case-insensitive search if exact match fails (index is case-sensitive usually)
    if (!card) {
        // Try lowercase
        const lowerCard = await db.getFromIndex('cards', 'word', word.toLowerCase());
        if (lowerCard) return lowerCard;

        // Last resort: Linear scan (only if index fails completely)
        // const allCards = await db.getAll('cards');
        // return allCards.find(c => c.word.toLowerCase() === word.toLowerCase());
    }
    return card;
}

/**
 * @description 获取所有新卡片 (State.New) (可按 deckId 过滤)
 */
export async function getNewCards(deckId?: string) {
    const db = await getDB();
    let allCards: WordCard[];

    if (deckId) {
        allCards = await db.getAllFromIndex('cards', 'deckId', deckId);
    } else {
        allCards = await db.getAll('cards');
    }

    return allCards.filter(card => card.state === State.New && !card.isFamiliar);
}

/**
 * @description 获取所有待学习或正在学习的卡片 (New + Learning + Relearning)
 * 用于分组学习模式，确保能够包含未完成的分组。
 */
export async function getActiveCards(deckId?: string) {
    const db = await getDB();
    let allCards: WordCard[];

    if (deckId) {
        allCards = await db.getAllFromIndex('cards', 'deckId', deckId);
    } else {
        allCards = await db.getAll('cards');
    }

    return allCards.filter(card =>
        (card.state === State.New || card.state === State.Learning || card.state === State.Relearning)
        && !card.isFamiliar
    );
}

/**
 * @description 获取所有到期复习的卡片
 */
export async function getDueCards(deckId?: string) {
    const db = await getDB();
    const now = new Date();
    let allCards: WordCard[];

    if (deckId) {
        allCards = await db.getAllFromIndex('cards', 'deckId', deckId);
    } else {
        allCards = await db.getAll('cards');
    }

    return allCards.filter(card =>
        card.due.getTime() <= now.getTime() &&
        card.state !== State.New &&
        !card.isFamiliar
    );
}

/**
 * @description 添加复习日志
 */
export async function addReviewLog(log: ReviewLog & { cardId: string }) {
    const db = await getDB();
    // Manual ID generation to ensure keyPath 'id' is satisfied even if autoIncrement is missing in legacy DBs
    const logWithId = {
        ...log,
        id: Date.now() // Use timestamp as ID
    };
    return db.add('logs', logWithId);
}

/**
 * @description 批量获取卡片
 */
export async function getCardsByIds(ids: string[]): Promise<WordCard[]> {
    const db = await getDB();
    // IDB doesn't support batch get by keys natively in all browsers efficiently without a transaction loop
    // But since we have a small number of cards usually (10-20 per session), a loop is fine.
    const cards: WordCard[] = [];
    const tx = db.transaction('cards', 'readonly');
    const store = tx.objectStore('cards');

    for (const id of ids) {
        const card = await store.get(id);
        if (card) cards.push(card);
    }

    await tx.done;
    return cards;
}

/**
 * @description 获取语义连接
 */
export async function getSemanticConnections(source: string) {
    const db = await getDB();
    return db.get('semantic_connections', source);
}

/**
 * @description 保存语义连接
 */
export async function saveSemanticConnections(data: { source: string; connections: Array<{ target: string; similarity: number; label?: string; example?: string }> }) {
    const db = await getDB();
    return db.put('semantic_connections', data);
}

/**
 * @description 获取分组图谱缓存
 */
export async function getGroupGraphCache(cacheKey: string) {
    const db = await getDB();
    return db.get('group_graphs', cacheKey);
}

export async function saveGroupGraphCache(data: { id: string; nodes: any[]; links: any[]; timestamp: number }) {
    const db = await getDB();
    return db.put('group_graphs', data);
}

/**
 * @description 重置数据库 (清空所有数据)
 * 用于完全重置应用状态，包括删除所有卡片、日志、分组缓存等。
 */
export async function resetDatabase() {
    const db = await getDB();
    db.close();

    // Delete the underlying SimpleDB
    const req = indexedDB.deleteDatabase(DB_NAME);

    return new Promise<void>((resolve, reject) => {
        req.onsuccess = () => {
            console.log('Database deleted successfully');
            dbPromise = null as any; // Reset promise
            resolve();
        };
        req.onerror = () => {
            console.error('Failed to delete database');
            reject(req.error);
        };
        req.onblocked = () => {
            console.warn('Database delete blocked');
            // Force reload might be needed if blocked
        };
    });
}

/**
 * @description 获取 AI 生成的关联词缓存
 */
export async function getAIGraphCache(word: string) {
    const db = await getDB();
    return db.get('ai_graph_cache', word);
}

/**
 * @description 保存 AI 生成的关联词缓存
 */
export async function saveAIGraphCache(data: { word: string; relatedItems: Array<{ word: string; meaning: string; relation: string }>; timestamp: number }) {
    const db = await getDB();
    return db.put('ai_graph_cache', data);
}
