/// <reference lib="webworker" />

/**
 * @file sync.worker.ts
 * @description Background Worker for processing Sync Logic off-main-thread.
 * Handles extensive JSON parsing and Loop processing.
 */

import { createClient } from '@supabase/supabase-js';
import * as localDB from './db';
import type { WordCard, Deck } from '@/types';
import type { ReviewLog } from 'ts-fsrs';

// Supabase URL & Key will be passed from main thread
// const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
// const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// -------------------------------------------------------------
// TYPES
// -------------------------------------------------------------
type SyncMessage = {
    type: 'START_SYNC';
    accessToken: string;
    lastSync: number;
    userId: string;
    supabaseUrl: string;
    supabaseKey: string;
    syncMode?: 'push-only' | 'full-sync';
};

type WorkerResponse = {
    type: 'STATUS' | 'SUCCESS' | 'ERROR';
    status?: 'syncing' | 'idle' | 'success' | 'error';
    message?: string;
    newLastSync?: number;
};

// -------------------------------------------------------------
// WORKER STATE
// -------------------------------------------------------------
// Explicitly type client as 'any' to bypass strict DB schema checks in worker
// preventing 'never' inference on upsert
let supabase: ReturnType<typeof createClient<any>> | null = null;
let currentUserId: string | null = null;

// -------------------------------------------------------------
// DB MAPPERS (Duplicated from supabase-db.ts to stay isolated in worker)
// -------------------------------------------------------------
// Note: In a real project we might extract these to a shared 'utils/mappers.ts'
// For now, we inline to avoid complex worker bundling configuraton issues if possible.

// Helper: Map DB Card -> WordCard
function mapDbCardToWordCard(d: any): WordCard {
    return {
        id: d.id,
        word: d.word,
        meaning: d.meaning,
        phonetic: d.pronunciation,
        partOfSpeech: d.pos || 'unknown',
        example: d.example,
        exampleMeaning: d.example_meaning,
        mnemonic: d.mnemonic,
        phrases: d.phrases,
        derivatives: d.derivatives,
        roots: d.roots,
        syllables: d.syllables,
        deckId: d.deck_id,
        due: new Date(d.due),
        stability: d.stability,
        difficulty: d.difficulty,
        elapsed_days: d.elapsed_days,
        scheduled_days: d.scheduled_days,
        reps: d.reps,
        lapses: d.lapses,
        state: d.state,
        last_review: d.last_review ? new Date(d.last_review) : undefined,
        learning_steps: 0,
        isFamiliar: d.is_familiar,
        createdAt: d.created_at ? new Date(d.created_at).getTime() : Date.now(),
        updatedAt: d.updated_at ? new Date(d.updated_at).getTime() : undefined,
    };
}

// Helper: Map WordCard -> DB
function mapWordCardToDb(card: WordCard, userId: string) {
    return {
        id: card.id,
        user_id: userId,
        deck_id: card.deckId,
        word: card.word,
        meaning: card.meaning,
        pronunciation: card.phonetic,
        pos: card.partOfSpeech,
        example: card.example,
        example_meaning: card.exampleMeaning,
        mnemonic: card.mnemonic,
        phrases: card.phrases,
        derivatives: card.derivatives,
        roots: card.roots,
        syllables: card.syllables,
        due: card.due.toISOString(),
        stability: card.stability,
        difficulty: card.difficulty,
        elapsed_days: card.elapsed_days,
        scheduled_days: card.scheduled_days,
        reps: card.reps,
        lapses: card.lapses,
        state: card.state,
        last_review: card.last_review?.toISOString() || null,
        is_familiar: card.isFamiliar || false,
        created_at: card.createdAt ? new Date(card.createdAt).toISOString() : new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
}


// -------------------------------------------------------------
// SYNC LOGIC
// -------------------------------------------------------------

async function fetchDecksUpdatedSince(lastSync: number) {
    if (!supabase) return [];
    const timeStr = new Date(lastSync).toISOString();
    const { data, error } = await supabase
        .from('decks')
        .select('*')
        .or(`updated_at.gt.${timeStr},created_at.gt.${timeStr}`)
        .order('updated_at', { ascending: true, nullsFirst: false });

    if (error) throw error;

    return (data || []).map((d: any) => ({
        id: d.id,
        name: d.name,
        description: d.description,
        theme: d.theme,
        createdAt: new Date(d.created_at),
        updatedAt: d.updated_at ? new Date(d.updated_at).getTime() : undefined,
    }));
}

async function fetchCardsUpdatedSince(lastSync: number) {
    if (!supabase) return [];
    const allCards: WordCard[] = [];
    const PAGE_SIZE = 1000;
    let offset = 0;
    let hasMore = true;
    const timeStr = new Date(lastSync).toISOString();

    while (hasMore) {
        let query = supabase
            .from('cards')
            .select('*')
            .or(`updated_at.gt.${timeStr},created_at.gt.${timeStr}`)
            .range(offset, offset + PAGE_SIZE - 1);

        const { data, error } = await query;
        if (error) throw error;

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

// Bulk Save Wrappers for Worker
async function saveDecksToCloud(decks: Deck[]) {
    if (!supabase || !currentUserId || decks.length === 0) return;
    const dbDecks = decks.map(d => ({
        id: d.id,
        user_id: currentUserId,
        name: d.name,
        description: d.description,
        theme: d.theme,
        created_at: d.createdAt instanceof Date ? d.createdAt.toISOString() : new Date(d.createdAt).toISOString(),
        updated_at: new Date().toISOString()
    }));
    const { error } = await supabase.from('decks').upsert(dbDecks, { onConflict: 'id' });
    if (error) throw error;
}

async function saveCardsToCloud(cards: WordCard[]) {
    if (!supabase || !currentUserId || cards.length === 0) return;
    const BATCH_SIZE = 100;
    const dbCards = cards.map(c => mapWordCardToDb(c, currentUserId!));
    for (let i = 0; i < dbCards.length; i += BATCH_SIZE) {
        const batch = dbCards.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from('cards').upsert(batch, { onConflict: 'id' });
        if (error) throw error;
    }
}

async function saveLogsToCloud(logs: (ReviewLog & { cardId: string })[]) {
    if (!supabase || !currentUserId || logs.length === 0) return;
    const validLogs = logs.map(log => ({
        user_id: currentUserId,
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
    const { error } = await supabase.from('review_logs').upsert(validLogs, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw error;
}

// Fetch clusters updated since timestamp
async function fetchClustersUpdatedSince(lastSync: number) {
    if (!supabase) return [];
    const timeStr = new Date(lastSync).toISOString();
    const { data, error } = await supabase
        .from('deck_clusters')
        .select('*')
        .gt('updated_at', timeStr);

    if (error) throw error;
    return (data || []).map((c: any) => ({
        deckId: c.deck_id,
        clusters: c.clusters,
        updatedAt: new Date(c.updated_at).getTime(),
        totalDeckSize: c.total_deck_size
    }));
}

// Save clusters to cloud
async function saveClustersToCloud(clusters: Array<{ deckId: string; clusters: any[]; updatedAt: number; totalDeckSize?: number }>) {
    if (!supabase || !currentUserId || clusters.length === 0) return;
    const dbClusters = clusters.map(c => ({
        deck_id: c.deckId,
        user_id: currentUserId,
        clusters: c.clusters,
        total_deck_size: c.totalDeckSize,
        updated_at: new Date(c.updatedAt).toISOString(),
    }));
    const { error } = await supabase.from('deck_clusters').upsert(dbClusters, { onConflict: 'deck_id' });
    if (error) throw error;
}

// -------------------------------------------------------------
// MESSAGE HANDLER
// -------------------------------------------------------------

self.onmessage = async (e: MessageEvent<SyncMessage>) => {
    const { type, accessToken, lastSync, userId, supabaseUrl, supabaseKey, syncMode } = e.data;

    if (type === 'START_SYNC') {
        try {
            // 1. Initialize Supabase with the token provided by main thread
            // Check if we need to re-init (if user changed OR if client is null)
            if (!supabase || currentUserId !== userId) {
                console.log('[Sync Worker] Initializing Supabase client...');
                if (!supabaseUrl || !supabaseKey) {
                    throw new Error("Missing Supabase credentials in worker Start message");
                }

                supabase = createClient(supabaseUrl, supabaseKey, {
                    global: {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                        },
                    },
                });
                currentUserId = userId;
                console.log('[Sync Worker] Supabase client initialized.');
            }

            self.postMessage({ type: 'STATUS', status: 'syncing', message: 'Analyzing local changes...' } as WorkerResponse);

            // --------------------------------------------------
            // PUSH LOGIC
            // --------------------------------------------------

            // NOTE: Worker needs to access IndexedDB. 'idb' lib works in worker.
            // We reuse localDB functions. Ensure localDB.ts doesn't import any DOM-only stuff.

            console.log('[Sync Worker] Checking local decks...');
            const allLocalDecks = await localDB.getAllDecks();
            const dirtyDecks = allLocalDecks.filter(d => (d.updatedAt || d.createdAt.getTime()) > lastSync);
            if (dirtyDecks.length > 0) {
                console.log(`[Sync Worker] Pushing ${dirtyDecks.length} dirty decks...`);
                self.postMessage({ type: 'STATUS', status: 'syncing', message: `Pushing ${dirtyDecks.length} decks...` } as WorkerResponse);
                await saveDecksToCloud(dirtyDecks);
            }

            console.log('[Sync Worker] Checking local cards...');
            const allLocalCards = await localDB.getAllCards();
            const dirtyCards = allLocalCards.filter(c => {
                const ts = c.updatedAt ? c.updatedAt : (c.createdAt ? c.createdAt : 0);
                return ts > lastSync;
            });
            if (dirtyCards.length > 0) {
                console.log(`[Sync Worker] Pushing ${dirtyCards.length} dirty cards...`);
                self.postMessage({ type: 'STATUS', status: 'syncing', message: `Pushing ${dirtyCards.length} cards...` } as WorkerResponse);
                await saveCardsToCloud(dirtyCards);
            }

            console.log('[Sync Worker] Checking local logs...');
            const allLogs = await localDB.getAllLogs();
            // Filter logs to only those whose card_id exists in local cards (avoids FK violation)
            const allLocalCardIds = new Set(allLocalCards.map(c => c.id));
            const validLogs = allLogs.filter(l => allLocalCardIds.has(l.cardId));
            const dirtyLogs = validLogs.filter(l => new Date(l.review).getTime() > lastSync);
            if (dirtyLogs.length > 0) {
                console.log(`[Sync Worker] Pushing ${dirtyLogs.length} new logs (filtered from ${allLogs.length} total)...`);
                self.postMessage({ type: 'STATUS', status: 'syncing', message: `PushingLogs (${dirtyLogs.length})...` } as WorkerResponse);
                await saveLogsToCloud(dirtyLogs);
            }

            // Push Clusters
            console.log('[Sync Worker] Checking local clusters...');
            const allLocalClusters = await localDB.getAllDeckClusters();
            const dirtyClusters = allLocalClusters.filter(c => c.updatedAt > lastSync);
            if (dirtyClusters.length > 0) {
                console.log(`[Sync Worker] Pushing ${dirtyClusters.length} dirty clusters...`);
                self.postMessage({ type: 'STATUS', status: 'syncing', message: `Pushing ${dirtyClusters.length} clusters...` } as WorkerResponse);
                await saveClustersToCloud(dirtyClusters);
            }

            // --------------------------------------------------
            // PULL LOGIC (Incremental)
            // --------------------------------------------------

            const currentSyncMode = syncMode || 'push-only'; // Default to push-only per user request

            if (currentSyncMode === 'full-sync') {
                // 全量同步：使用 lastSync=0 拉取所有云端数据 (忽略时间过滤)
                const pullTimestamp = 0; // Pull EVERYTHING from cloud
                console.log('[Sync Worker] [Full Sync] Pulling ALL remote decks (lastSync=0)...');
                const remoteDecks = await fetchDecksUpdatedSince(pullTimestamp);
                if (remoteDecks.length > 0) {
                    console.log(`[Sync Worker] Pulled ${remoteDecks.length} decks.`);
                    for (const d of remoteDecks) {
                        await localDB.createDeck(d as Deck);
                    }
                }

                console.log('[Sync Worker] [Full Sync] Pulling ALL remote cards (lastSync=0)...');
                self.postMessage({ type: 'STATUS', status: 'syncing', message: 'Pulling all cloud data...' } as WorkerResponse);
                const remoteCards = await fetchCardsUpdatedSince(pullTimestamp);
                if (remoteCards.length > 0) {
                    console.log(`[Sync Worker] Pulled ${remoteCards.length} cards. Saving to IDB...`);
                    self.postMessage({ type: 'STATUS', status: 'syncing', message: `Updating ${remoteCards.length} cards...` } as WorkerResponse);
                    await localDB.saveCards(remoteCards);
                } else {
                    console.log('[Sync Worker] No remote updates.');
                }

                // Pull Clusters
                console.log('[Sync Worker] [Full Sync] Pulling remote clusters...');
                const remoteClusters = await fetchClustersUpdatedSince(pullTimestamp);
                if (remoteClusters.length > 0) {
                    console.log(`[Sync Worker] Pulled ${remoteClusters.length} clusters. Saving to IDB...`);
                    self.postMessage({ type: 'STATUS', status: 'syncing', message: `Updating ${remoteClusters.length} clusters...` } as WorkerResponse);
                    for (const c of remoteClusters) {
                        await localDB.saveDeckClustersCache(c);
                    }
                }
            } else {
                console.log('[Sync Worker] Check-Only Mode (Push-Only). Skipping Pull.');
            }

            // SUCCESS
            console.log('[Sync Worker] Sync complete.');
            self.postMessage({ type: 'SUCCESS', newLastSync: Date.now() } as WorkerResponse);

        } catch (error: any) {
            console.error('[Sync Worker] Error:', error);
            self.postMessage({ type: 'ERROR', message: error.message } as WorkerResponse);
        }
    }
};
