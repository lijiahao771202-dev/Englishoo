/**
 * @file 数据源切换层 (data-source.ts) [Refactored for Local-First with DataService]
 * @description 本地优先架构核心
 * - 核心数据操作通过 DataService 单例 (自动同步)
 * - 缓存操作直接使用 localDB (无需同步)
 */
import * as localDB from './db';
import { dataService, forceSyncNow } from './DataService';
import { syncManager } from './sync-manager';

// ============================================================
// 核心操作 (通过 DataService - 自动同步)
// ============================================================

// 卡包操作
export const getAllDecks = () => dataService.getAllDecks();
export const createDeck = (deck: Parameters<typeof localDB.createDeck>[0]) => dataService.saveDeck(deck);
export const deleteDeck = (id: string) => dataService.deleteDeck(id);
export const getDeckById = (id: string) => dataService.getDeckById(id);

// 卡片操作 (核心 - 通过 DataService)
export const getAllCards = (deckId?: string) => dataService.getAllCards(deckId);
export const saveCard = (card: Parameters<typeof localDB.saveCard>[0]) => dataService.saveCard(card);
export const saveCards = (cards: Parameters<typeof localDB.saveCards>[0]) => dataService.saveCards(cards);
export const deleteCard = (id: string) => dataService.deleteCard(id);
export const getNewCards = (deckId?: string) => dataService.getNewCards(deckId);
export const getDueCards = (deckId?: string) => dataService.getDueCards(deckId);
export const getActiveCards = (deckId?: string) => dataService.getActiveCards(deckId);
export const getCardsByIds = (ids: string[]) => dataService.getCardsByIds(ids);
export const getCardByWord = (word: string) => dataService.getCardByWord(word);
export const getCardCount = (deckId?: string) => dataService.getCardCount(deckId);

// 日志操作
export const addReviewLog = (log: Parameters<typeof localDB.addReviewLog>[0]) => dataService.addReviewLog(log);
export const getAllLogs = localDB.getAllLogs;

// ============================================================
// 缓存操作 (直接使用 localDB - 无需云端同步)
// ============================================================

export const getSemanticConnections = localDB.getSemanticConnections;
export const saveSemanticConnections = localDB.saveSemanticConnections;
export const getGroupGraphCache = localDB.getGroupGraphCache;
export const saveGroupGraphCache = localDB.saveGroupGraphCache;
export const getAIGraphCache = localDB.getAIGraphCache;
export const saveAIGraphCache = localDB.saveAIGraphCache;

// ============================================================
// 初始化 & 系统操作
// ============================================================

export const initDB = async () => {
    // 1. Init Local DB
    await localDB.initDB();

    // 2. SyncManager is already initialized via import singleton
    console.log('[DataSource] Init complete (Local-First Mode with DataService)');
};

// 系统常量
export const SYSTEM_DECK_GUIDED = localDB.SYSTEM_DECK_GUIDED;

// 特殊操作
export const resetDatabase = localDB.resetDatabase;
export const addToVocabularyDeck = localDB.addToVocabularyDeck;

// 导出同步相关
export { syncManager, forceSyncNow, dataService };
