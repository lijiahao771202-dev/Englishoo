import { createNewWordCard } from './fsrs';
import { createDeck, getDeckById, saveCards, saveSemanticConnections } from './data-source';
import type { Deck, WordCard } from '@/types';

// Supported Official Decks
export type OfficialDeckType = 'CET4' | 'CET6' | 'TEM4' | 'TEM8' | 'IELTS' | 'TOEFL';

interface OfficialDeckConfig {
    id: string;
    name: string;
    file: string;
    theme: string;
}

export const OFFICIAL_DECKS: Record<OfficialDeckType, OfficialDeckConfig> = {
    'CET4': { id: 'official-deck-cet4', name: '大学英语四级', file: 'CET4luan_2.json', theme: 'blue' },
    'CET6': { id: 'official-deck-cet6', name: '大学英语六级', file: 'CET6_2.json', theme: 'indigo' },
    'TEM4': { id: 'official-deck-tem4', name: '英语专业四级', file: 'Level4luan_2.json', theme: 'teal' },
    'TEM8': { id: 'official-deck-tem8', name: '英语专业八级', file: 'Level8luan_2.json', theme: 'purple' },
    'IELTS': { id: 'official-deck-ielts', name: '雅思核心词汇', file: 'IELTSluan_2.json', theme: 'orange' },
    'TOEFL': { id: 'official-deck-toefl', name: '托福核心词汇', file: 'TOEFLluan_2.json', theme: 'red' },
};

// Interface for 'Luan' JSON format (used by qibingqibing/kajweb)
interface LuanWord {
    wordRank: number;
    headWord: string;
    content: {
        word: {
            wordHead: string;
            content: {
                trans?: Array<{ pos: string; tranCn: string }>;
                sentence?: { sentences: Array<{ sContent: string; sCn: string }> };
                syno?: { synos: Array<{ pos: string; hwds: Array<{ w: string }> }> };
                relWord?: { rels: Array<{ pos: string; words: Array<{ hwd: string; tran: string }> }> };
                phrase?: { phrases: Array<{ pContent: string; pCn: string }> };
                remMethod?: { val: string };
            };
        };
    };
}

export interface OfficialImportProgress {
    count: number;
    total: number;
    currentWord: string;
}

export async function importOfficialDeck(
    type: OfficialDeckType,
    file?: File,
    onProgress?: (progress: OfficialImportProgress) => void
) {
    const config = OFFICIAL_DECKS[type];
    console.log(`[Import] Starting import for ${type} (${config.id})...`);

    // 1. Get raw text content
    let text = '';
    if (file) {
        text = await file.text();
    } else {
        const fileUrl = '/' + config.file;
        const res = await fetch(fileUrl);
        if (!res.ok) {
            if (res.status === 404) {
                const error = new Error(`File not found: ${config.file}`);
                (error as any).code = 'FILE_NOT_FOUND';
                throw error;
            }
            throw new Error(`Failed to fetch ${config.file}: ${res.statusText}`);
        }
        text = await res.text();
    }

    // 2. Parse Content (Robust: Array or NDJSON)
    let items: LuanWord[] = [];
    text = text.trim();

    if (text.startsWith('[')) {
        try {
            items = JSON.parse(text);
        } catch (e) {
            console.warn('[Import] JSON parse failed, trying NDJSON fallback...', e);
        }
    }

    if (items.length === 0) {
        // Try NDJSON (NewLine Delimited JSON)
        const lines = text.split('\n');
        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                items.push(JSON.parse(line));
            } catch (e) {
                // Ignore malformed lines
            }
        }
    }

    if (items.length === 0) {
        throw new Error('No valid vocabulary data found in file.');
    }

    console.log(`[Import] Parsed ${items.length} words.`);

    // 3. Create or Update Deck (Preserve creation time if exists)
    const existingDeck = await getDeckById(config.id);
    const deck: Deck = {
        id: config.id,
        name: config.name,
        description: `${config.name} 核心词汇 (共 ${items.length} 词)`,
        theme: config.theme,
        createdAt: existingDeck ? existingDeck.createdAt : new Date(),
        updatedAt: Date.now()
    };

    await createDeck(deck);

    // 4. Batch Process Cards
    const BATCH_SIZE = 100;
    const cardsToSave: WordCard[] = [];
    // Semantic connections handled directly below

    let processedCount = 0;

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);

        for (const item of batch) {
            const word = item.headWord || item.content?.word?.wordHead;
            if (!word) continue;

            // Extract Data
            const content = item.content?.word?.content;
            const meanings = content?.trans?.map(t => `${t.pos} ${t.tranCn}`).join('; ') || '暂无释义';
            const partOfSpeech = content?.trans?.[0]?.pos || 'unknown';

            // Example
            let example: string | undefined;
            if (content?.sentence?.sentences && content.sentence.sentences.length > 0) {
                example = content.sentence.sentences[0].sContent + '\n' + content.sentence.sentences[0].sCn;
            }

            // Mnemonic
            const mnemonic = content?.remMethod?.val;

            // Deterministic ID: card-{deckId}-{word}
            const cleanWord = word.toLowerCase().trim().replace(/[^a-z0-9]/g, '-');
            const cardId = `card-${config.id.replace('official-deck-', '')}-${cleanWord}`;

            // Create Word Card
            const card = createNewWordCard(
                word,
                meanings,
                partOfSpeech,
                config.id,
                example,
                mnemonic,
                undefined, // initial associations
                cardId // Custom Deterministic ID
            );

            // Use Rank from file for sorting order
            if (item.wordRank) {
                card.rank = item.wordRank;
            }

            cardsToSave.push(card);

            // Extract Explicit Semantic Connections (Synonyms/Antonyms)
            if (content?.syno?.synos) {
                for (const group of content.syno.synos) {
                    if (group.hwds) {
                        for (const _s of group.hwds) {
                            // Save logic is async, we can await it or fire and forget? 
                            // For reliability we should await, but for speed we wait for batch.
                            // Actually saveSemanticConnections is a single op. We'll do it sequentially for now inside the batch loop.
                            // OR we can push to a list and Promise.all? 
                            // Let's Promise.all per batch to be safe.
                        }
                    }
                }
            }
        }

        // Save Batch
        if (cardsToSave.length > 0) {
            await saveCards([...cardsToSave]); // Clone to be safe

            // Process semantic connections for this batch
            // We re-iterate the batch to extract connections and save them efficiently
            // Actually, we need the 'word' from the item.
            for (const item of batch) {
                const word = item.headWord || item.content?.word?.wordHead;
                const content = item.content?.word?.content;
                if (!word || !content) continue;

                // Synonyms
                if (content.syno?.synos) {
                    for (const group of content.syno.synos) {
                        if (group.hwds) {
                            for (const s of group.hwds) {
                                await saveSemanticConnections({
                                    source: word,
                                    connections: [{
                                        target: s.w,
                                        similarity: 0.8,
                                        label: 'synonym'
                                    }]
                                });
                            }
                        }
                    }
                }
                // Related Words
                if (content.relWord?.rels) {
                    for (const group of content.relWord.rels) {
                        if (group.words) {
                            for (const w of group.words) {
                                await saveSemanticConnections({
                                    source: word,
                                    connections: [{
                                        target: w.hwd,
                                        similarity: 0.6,
                                        label: 'derivative'
                                    }]
                                });
                            }
                        }
                    }
                }
            }

            cardsToSave.length = 0; // Clear buffer
        }

        processedCount += batch.length;
        if (onProgress) {
            onProgress({
                count: Math.min(processedCount, items.length),
                total: items.length,
                currentWord: batch[batch.length - 1]?.headWord || ''
            });
        }
    }

    console.log(`[Import] Completed ${type}. Total: ${items.length}`);
}
