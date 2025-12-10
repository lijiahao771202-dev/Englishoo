/**
 * @file 数据源切换层 (data-source.ts) [Refactored for Local-First]
 * @description 本地优先架构核心
 * - 所有 UI 操作 -> IndexedDB (0 Latency)
 * - 后台 SyncManager -> Unifies Cloud Data
 */
import * as localDB from './db';
import { syncManager } from './sync-manager'; // Import starts the auto-sync logic

// ============================================================
// 统一接口 (全部指向 LocalDB)
// ============================================================

// 卡包操作
export const getAllDecks = localDB.getAllDecks;
export const createDeck = localDB.createDeck;
export const deleteDeck = localDB.deleteDeck;
export const getDeckById = localDB.getDeckById;

// 卡片操作
export const getAllCards = localDB.getAllCards;
export const saveCard = localDB.saveCard;
export const saveCards = localDB.saveCards;
export const deleteCard = localDB.deleteCard;
export const getNewCards = localDB.getNewCards;
export const getDueCards = localDB.getDueCards;
export const getActiveCards = localDB.getActiveCards;
export const getCardsByIds = localDB.getCardsByIds;
export const getCardByWord = localDB.getCardByWord;
export const getCardCount = localDB.getCardCount;

// 日志操作
export const addReviewLog = localDB.addReviewLog;
export const getAllLogs = localDB.getAllLogs;

// 缓存操作
export const getSemanticConnections = localDB.getSemanticConnections;
export const saveSemanticConnections = localDB.saveSemanticConnections;
export const getGroupGraphCache = localDB.getGroupGraphCache;
export const saveGroupGraphCache = localDB.saveGroupGraphCache;
export const getAIGraphCache = localDB.getAIGraphCache;
export const saveAIGraphCache = localDB.saveAIGraphCache;

// 初始化
export const initDB = async () => {
    // 1. Init Local DB
    await localDB.initDB();

    // 2. SyncManager is already initialized via import singleton
    // We can explicitly trigger an initial sync if needed, 
    // but SyncManager constructor handles 'auto manual sync' on login check.
    console.log('[DataSource] Init complete (Local-First Mode)');
};

// 系统常量
export const SYSTEM_DECK_GUIDED = localDB.SYSTEM_DECK_GUIDED;

// 特殊操作
export const resetDatabase = localDB.resetDatabase;
export const addToVocabularyDeck = localDB.addToVocabularyDeck;

// Export sync manager for UI controls
export { syncManager };

