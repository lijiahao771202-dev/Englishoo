/**
 * @file Supabase 数据库操作层 (supabase-db.ts)
 * @description 云端数据存储，替代本地 IndexedDB
 * 所有操作以 Supabase 为数据源，支持用户隔离 (RLS)
 */
import { supabase } from './supabase';
import type { WordCard, Deck } from '@/types';
import { type ReviewLog, State } from 'ts-fsrs';

// ============================================================
// 卡包操作 (Decks)
// ============================================================

/**
 * @description 获取当前用户的所有卡包
 */
export async function getAllDecks(): Promise<Deck[]> {
    const { data, error } = await supabase
        .from('decks')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('获取卡包失败:', error);
        return [];
    }

    return (data || []).map(d => ({
        id: d.id,
        name: d.name,
        description: d.description,
        theme: d.theme,
        createdAt: new Date(d.created_at),
        updatedAt: d.updated_at ? new Date(d.updated_at).getTime() : undefined,
    }));
}

/**
 * @description 获取自上次同步以来更新的卡包
 */
export async function getDecksUpdatedSince(timestamp: number): Promise<Deck[]> {
    const timeStr = new Date(timestamp).toISOString();
    const { data, error } = await supabase
        .from('decks')
        .select('*')
        .or(`updated_at.gt.${timeStr},created_at.gt.${timeStr}`)
        .order('updated_at', { ascending: true, nullsFirst: false });

    if (error) {
        console.error('获取增量卡包失败:', error);
        return [];
    }

    return (data || []).map(d => ({
        id: d.id,
        name: d.name,
        description: d.description,
        theme: d.theme,
        createdAt: new Date(d.created_at),
        updatedAt: d.updated_at ? new Date(d.updated_at).getTime() : undefined,
    }));
}

/**
 * @description 创建新卡包
 */
export async function createDeck(deck: Deck): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('用户未登录');

    const { error } = await supabase.from('decks').insert({
        id: deck.id,
        user_id: user.id,
        name: deck.name,
        description: deck.description || null,
        theme: deck.theme || null,
        created_at: deck.createdAt?.toISOString() || new Date().toISOString(),
    });

    if (error) throw error;
}

/**
 * @description 批量保存卡包 (For Sync)
 */
export async function saveDecks(decks: Deck[]) {
    if (decks.length === 0) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const dbDecks = decks.map(d => ({
        id: d.id,
        user_id: user.id,
        name: d.name,
        description: d.description,
        theme: d.theme,
        created_at: d.createdAt instanceof Date ? d.createdAt.toISOString() : new Date(d.createdAt).toISOString(),
        updated_at: new Date().toISOString()
    }));

    const { error } = await supabase.from('decks').upsert(dbDecks, { onConflict: 'id' });
    if (error) throw error;
}

/**
 * @description 删除卡包及其关联卡片
 */
export async function deleteDeck(deckId: string): Promise<void> {
    const { error } = await supabase.from('decks').delete().eq('id', deckId);
    if (error) throw error;
    // Cards with deck_id FK will cascade delete
}

/**
 * @description 根据 ID 获取卡包
 */
export async function getDeckById(id: string): Promise<Deck | undefined> {
    const { data, error } = await supabase.from('decks').select('*').eq('id', id).single();
    if (error || !data) return undefined;

    return {
        id: data.id,
        name: data.name,
        description: data.description,
        theme: data.theme,
        createdAt: new Date(data.created_at),
    };
}

// ============================================================
// 卡片操作 (Cards)
// ============================================================

/**
 * @description 获取所有卡片 (可按 deckId 过滤)
 * 注意: Supabase 默认限制 1000 条，这里使用 range 提升到 10000
 */
export async function getAllCards(deckId?: string): Promise<WordCard[]> {
    const allCards: WordCard[] = [];
    const PAGE_SIZE = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
        let query = supabase.from('cards').select('*').range(offset, offset + PAGE_SIZE - 1);
        if (deckId) {
            query = query.eq('deck_id', deckId);
        }

        const { data, error } = await query;
        if (error) {
            console.error('获取卡片失败:', error);
            break;
        }

        if (data && data.length > 0) {
            allCards.push(...data.map(mapDbCardToWordCard));
            offset += PAGE_SIZE;
            // If we got < PAGE_SIZE, it's the last page.
            hasMore = data.length === PAGE_SIZE;
        } else {
            hasMore = false;
        }
    }

    console.log(`[Supabase] getAllCards pulled total: ${allCards.length}`);
    return allCards;
}

/**
 * @description 获取自上次同步以来更新的卡片 (增量同步)
 */
export async function getCardsUpdatedSince(timestamp: number): Promise<WordCard[]> {
    const allCards: WordCard[] = [];
    const PAGE_SIZE = 1000;
    let offset = 0;
    let hasMore = true;
    const timeStr = new Date(timestamp).toISOString();

    while (hasMore) {
        // Query: updated_at > timestamp OR created_at > timestamp
        // Supabase PostgREST syntax for OR is: .or(column1.gt.val,column2.gt.val)
        let query = supabase
            .from('cards')
            .select('*')
            .or(`updated_at.gt.${timeStr},created_at.gt.${timeStr}`)
            .range(offset, offset + PAGE_SIZE - 1);

        const { data, error } = await query;
        if (error) {
            console.error('获取增量卡片失败:', error);
            break;
        }

        if (data && data.length > 0) {
            allCards.push(...data.map(mapDbCardToWordCard));
            offset += PAGE_SIZE;
            hasMore = data.length === PAGE_SIZE;
        } else {
            hasMore = false;
        }
    }

    console.log(`[Supabase] getCardsUpdatedSince pulled: ${allCards.length}`);
    return allCards;
}

/**
 * @description 保存/更新卡片
 */
export async function saveCard(card: WordCard): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('用户未登录');

    const dbCard = mapWordCardToDb(card, user.id);
    const { error } = await supabase.from('cards').upsert(dbCard, { onConflict: 'id' });
    if (error) throw error;
}

/**
 * @description 批量保存卡片（性能优化）
 * 每批最多 100 张卡片
 */
export async function saveCards(cards: WordCard[]): Promise<void> {
    if (cards.length === 0) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('用户未登录');

    const BATCH_SIZE = 100;
    const dbCards = cards.map(card => mapWordCardToDb(card, user.id));

    // 分批插入
    for (let i = 0; i < dbCards.length; i += BATCH_SIZE) {
        const batch = dbCards.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from('cards').upsert(batch, { onConflict: 'id' });
        if (error) throw error;
    }
}

/**
 * @description 删除卡片
 */
export async function deleteCard(id: string): Promise<void> {
    const { error } = await supabase.from('cards').delete().eq('id', id);
    if (error) throw error;
}

/**
 * @description 获取新卡片 (State.New) - 使用分页获取全部
 */
export async function getNewCards(deckId?: string): Promise<WordCard[]> {
    const allCards: WordCard[] = [];
    const PAGE_SIZE = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
        let query = supabase
            .from('cards')
            .select('*')
            .eq('state', State.New)
            .eq('is_familiar', false)
            .range(offset, offset + PAGE_SIZE - 1);

        if (deckId) {
            query = query.eq('deck_id', deckId);
        }

        const { data, error } = await query;
        if (error) {
            console.error('获取新卡片失败:', error);
            break;
        }

        if (data && data.length > 0) {
            allCards.push(...data.map(mapDbCardToWordCard));
            offset += PAGE_SIZE;
            hasMore = data.length === PAGE_SIZE;
        } else {
            hasMore = false;
        }
    }

    console.log(`[Supabase] getNewCards returned ${allCards.length} cards (paginated)`);
    return allCards;
}

/**
 * @description 获取待复习卡片
 */
export async function getDueCards(deckId?: string): Promise<WordCard[]> {
    const now = new Date().toISOString();
    const allCards: WordCard[] = [];
    const PAGE_SIZE = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
        let query = supabase
            .from('cards')
            .select('*')
            .lte('due', now)
            .neq('state', State.New)
            .eq('is_familiar', false)
            .range(offset, offset + PAGE_SIZE - 1);

        if (deckId) {
            query = query.eq('deck_id', deckId);
        }

        const { data, error } = await query;
        if (error) {
            console.error('获取待复习卡片失败:', error);
            break;
        }

        if (data && data.length > 0) {
            allCards.push(...data.map(mapDbCardToWordCard));
            offset += PAGE_SIZE;
            hasMore = data.length === PAGE_SIZE;
        } else {
            hasMore = false;
        }
    }
    return allCards;
}

/**
 * @description 获取活跃卡片 (New + Learning + Relearning)
 */
export async function getActiveCards(deckId?: string): Promise<WordCard[]> {
    const allCards: WordCard[] = [];
    const PAGE_SIZE = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
        let query = supabase
            .from('cards')
            .select('*')
            .in('state', [State.New, State.Learning, State.Relearning])
            .eq('is_familiar', false)
            .range(offset, offset + PAGE_SIZE - 1);

        if (deckId) {
            query = query.eq('deck_id', deckId);
        }

        const { data, error } = await query;
        if (error) {
            console.error('获取活跃卡片失败:', error);
            break;
        }

        if (data && data.length > 0) {
            allCards.push(...data.map(mapDbCardToWordCard));
            offset += PAGE_SIZE;
            hasMore = data.length === PAGE_SIZE;
        } else {
            hasMore = false;
        }
    }
    return allCards;
}

/**
 * @description 批量获取卡片
 */
export async function getCardsByIds(ids: string[]): Promise<WordCard[]> {
    if (ids.length === 0) return [];

    const { data, error } = await supabase.from('cards').select('*').in('id', ids);
    if (error) {
        console.error('批量获取卡片失败:', error);
        return [];
    }

    return (data || []).map(mapDbCardToWordCard);
}

/**
 * @description 根据单词获取卡片
 */
export async function getCardByWord(word: string): Promise<WordCard | undefined> {
    const { data, error } = await supabase
        .from('cards')
        .select('*')
        .ilike('word', word)
        .limit(1)
        .single();

    if (error || !data) return undefined;
    return mapDbCardToWordCard(data);
}

/**
 * @description 获取卡片数量
 */
export async function getCardCount(deckId?: string): Promise<number> {
    let query = supabase.from('cards').select('id', { count: 'exact', head: true });
    if (deckId) {
        query = query.eq('deck_id', deckId);
    }

    const { count, error } = await query;
    if (error) return 0;
    return count || 0;
}

// ============================================================
// 学习日志 (Review Logs)
// ============================================================

/**
 * @description 添加复习日志
 */
export async function addReviewLog(log: ReviewLog & { cardId: string }): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('用户未登录');

    const { error } = await supabase.from('review_logs').insert({
        user_id: user.id,
        card_id: log.cardId,
        rating: log.rating,
        state: log.state,
        due: log.due?.toISOString() || null,
        stability: log.stability,
        difficulty: log.difficulty,
        elapsed_days: log.elapsed_days,
        last_elapsed_days: log.last_elapsed_days,
        scheduled_days: log.scheduled_days,
        review: log.review?.toISOString() || new Date().toISOString(),
    });

    if (error) throw error;
}

/**
 * @description 批量保存日志 (For Sync)
 */
export async function saveLogs(logs: (ReviewLog & { cardId: string })[]) {
    if (logs.length === 0) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Filter out minimal valid logs
    const validLogs = logs.map(log => ({
        user_id: user.id,
        card_id: log.cardId,
        rating: log.rating,
        state: log.state,
        due: log.due?.toISOString() || null,
        stability: log.stability,
        difficulty: log.difficulty,
        elapsed_days: log.elapsed_days,
        last_elapsed_days: log.last_elapsed_days,
        scheduled_days: log.scheduled_days,
        review: log.review instanceof Date ? log.review.toISOString() : new Date(log.review).toISOString(),
    }));

    // Logs are usually append-only. But ID collision should be ignored?
    // We typically want to IGNORE duplicates for logs.
    const { error } = await supabase.from('review_logs').upsert(validLogs, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw error;
}

/**
 * @description 获取所有日志
 */
export async function getAllLogs(): Promise<(ReviewLog & { cardId: string })[]> {
    const { data, error } = await supabase.from('review_logs').select('*');
    if (error) return [];

    return (data || []).map(d => ({
        rating: d.rating,
        state: d.state,
        due: d.due ? new Date(d.due) : new Date(),
        stability: d.stability,
        difficulty: d.difficulty,
        elapsed_days: d.elapsed_days,
        last_elapsed_days: d.last_elapsed_days,
        scheduled_days: d.scheduled_days,
        review: d.review ? new Date(d.review) : new Date(),
        learning_steps: 0, // Default value for compatibility
        cardId: d.card_id,
    })) as (ReviewLog & { cardId: string })[];
}

// ============================================================
// 用户设置 (User Settings)
// ============================================================

export interface UserSettings {
    apiKey?: string;
    theme?: string;
    dailyNewLimit?: number;
    dailyReviewLimit?: number;
}

/**
 * @description 获取用户设置
 */
export async function getUserSettings(): Promise<UserSettings | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

    if (error || !data) return null;

    return {
        apiKey: data.api_key,
        theme: data.theme,
        dailyNewLimit: data.daily_new_limit,
        dailyReviewLimit: data.daily_review_limit,
    };
}

/**
 * @description 保存用户设置
 */
export async function saveUserSettings(settings: UserSettings): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('用户未登录');

    const { error } = await supabase.from('user_settings').upsert({
        user_id: user.id,
        api_key: settings.apiKey,
        theme: settings.theme,
        daily_new_limit: settings.dailyNewLimit,
        daily_review_limit: settings.dailyReviewLimit,
        updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    if (error) throw error;
}

// ============================================================
// 缓存操作 (Caches - embeddings, connections, clusters, graphs)
// ============================================================

/**
 * @description 获取语义连接
 */
export async function getSemanticConnections(source: string) {
    const { data, error } = await supabase
        .from('semantic_connections')
        .select('*')
        .eq('source', source)
        .single();

    if (error || !data) return undefined;
    return { source: data.source, connections: data.connections };
}

/**
 * @description 保存语义连接
 */
export async function saveSemanticConnections(data: { source: string; connections: any[] }): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('用户未登录');

    const { error } = await supabase.from('semantic_connections').upsert({
        source: data.source,
        user_id: user.id,
        connections: data.connections,
        created_at: new Date().toISOString(),
    }, { onConflict: 'source' });

    if (error) throw error;
}

/**
 * @description 获取卡包分组缓存
 */
export async function getDeckClustersCache(deckId: string) {
    const { data, error } = await supabase
        .from('deck_clusters')
        .select('*')
        .eq('deck_id', deckId)
        .single();

    if (error || !data) return undefined;
    return { deckId: data.deck_id, clusters: data.clusters, updatedAt: new Date(data.updated_at).getTime(), totalDeckSize: data.total_deck_size };
}

/**
 * @description 保存卡包分组缓存
 */
export async function saveDeckClustersCache(data: { deckId: string; clusters: any[]; updatedAt: number; totalDeckSize?: number }): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('用户未登录');

    const { error } = await supabase.from('deck_clusters').upsert({
        deck_id: data.deckId,
        user_id: user.id,
        clusters: data.clusters,
        total_deck_size: data.totalDeckSize,
        updated_at: new Date(data.updatedAt).toISOString(),
    }, { onConflict: 'deck_id' });

    if (error) throw error;
}

/**
 * @description 获取图谱缓存
 */
export async function getGroupGraphCache(cacheKey: string) {
    const { data, error } = await supabase
        .from('group_graphs')
        .select('*')
        .eq('id', cacheKey)
        .single();

    if (error || !data) return undefined;
    return { id: data.id, nodes: data.nodes, links: data.links, timestamp: data.timestamp };
}

/**
 * @description 保存图谱缓存
 */
export async function saveGroupGraphCache(data: { id: string; nodes: any[]; links: any[]; timestamp: number }): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('用户未登录');

    const { error } = await supabase.from('group_graphs').upsert({
        id: data.id,
        user_id: user.id,
        nodes: data.nodes,
        links: data.links,
        timestamp: data.timestamp,
    }, { onConflict: 'id' });

    if (error) throw error;
}

/**
 * @description 获取 AI 图谱缓存
 */
export async function getAIGraphCache(word: string) {
    const { data, error } = await supabase
        .from('ai_graph_cache')
        .select('*')
        .eq('word', word)
        .single();

    if (error || !data) return undefined;
    return { word: data.word, relatedItems: data.related_items, timestamp: data.timestamp };
}

/**
 * @description 保存 AI 图谱缓存
 */
export async function saveAIGraphCache(data: { word: string; relatedItems: any[]; timestamp: number }): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('用户未登录');

    const { error } = await supabase.from('ai_graph_cache').upsert({
        word: data.word,
        user_id: user.id,
        related_items: data.relatedItems,
        timestamp: data.timestamp,
    }, { onConflict: 'word' });

    if (error) throw error;
}

// ============================================================
// 辅助函数 (Helpers)
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDbCardToWordCard(d: any): WordCard {
    return {
        id: d.id,
        word: d.word,
        meaning: d.meaning,
        phonetic: d.pronunciation, // DB uses pronunciation, type uses phonetic
        partOfSpeech: d.pos || 'unknown', // DB uses pos, type uses partOfSpeech
        example: d.example,
        exampleMeaning: d.example_meaning,
        mnemonic: d.mnemonic,
        phrases: d.phrases,
        derivatives: d.derivatives,
        roots: d.roots,
        syllables: d.syllables,
        deckId: d.deck_id,
        // FSRS fields
        due: new Date(d.due),
        stability: d.stability,
        difficulty: d.difficulty,
        elapsed_days: d.elapsed_days,
        scheduled_days: d.scheduled_days,
        reps: d.reps,
        lapses: d.lapses,
        state: d.state,
        last_review: d.last_review ? new Date(d.last_review) : undefined,
        learning_steps: 0, // Default for compatibility
        // Custom
        isFamiliar: d.is_familiar,
        createdAt: d.created_at ? new Date(d.created_at).getTime() : Date.now(),
    };
}

function mapWordCardToDb(card: WordCard, userId: string) {
    return {
        id: card.id,
        user_id: userId,
        deck_id: card.deckId,
        word: card.word,
        meaning: card.meaning,
        pronunciation: card.phonetic, // Type uses phonetic, DB uses pronunciation
        pos: card.partOfSpeech, // Type uses partOfSpeech, DB uses pos
        example: card.example,
        example_meaning: card.exampleMeaning,
        mnemonic: card.mnemonic,
        phrases: card.phrases,
        derivatives: card.derivatives,
        roots: card.roots,
        syllables: card.syllables,
        // FSRS fields
        due: card.due.toISOString(),
        stability: card.stability,
        difficulty: card.difficulty,
        elapsed_days: card.elapsed_days,
        scheduled_days: card.scheduled_days,
        reps: card.reps,
        lapses: card.lapses,
        state: card.state,
        last_review: card.last_review?.toISOString() || null,
        // Custom
        is_familiar: card.isFamiliar || false,
        created_at: card.createdAt ? new Date(card.createdAt).toISOString() : new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
}

// ============================================================
// 初始化 (确保默认卡包存在)
// ============================================================

export async function initSupabaseDB(): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return; // Not logged in, skip init

    // Ensure default "Vocabulary Book" deck exists using upsert to avoid conflicts
    await supabase.from('decks').upsert({
        id: 'vocabulary-book',
        user_id: user.id,
        name: '生词本',
        description: '默认生词本，用于存放日常收集的单词',
        created_at: new Date().toISOString(),
    }, { onConflict: 'id' });
}
