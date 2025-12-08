/**
 * @file 数据源切换层 (data-source.ts)
 * @description 根据用户登录状态自动选择数据源
 * - 已登录: 使用 Supabase (云端)
 * - 未登录: 使用 IndexedDB (本地)
 */
import { supabase } from './supabase';
import * as localDB from './db';
import * as cloudDB from './supabase-db';

// 当前会话的用户状态缓存
let isAuthenticated = false;

// 初始化: 检测登录状态
supabase.auth.onAuthStateChange((_event, session) => {
    isAuthenticated = !!session?.user;
    console.log(`[DataSource] Auth state changed: ${isAuthenticated ? 'Logged In' : 'Logged Out'}`);
});

// 初始检测
supabase.auth.getSession().then(({ data: { session } }) => {
    isAuthenticated = !!session?.user;
});

/**
 * @description 检查是否应使用云端数据源
 */
export function useCloud(): boolean {
    return isAuthenticated;
}

// ============================================================
// 导出统一接口 (自动选择数据源)
// ============================================================

// 卡包操作
export const getAllDecks = async () => useCloud() ? cloudDB.getAllDecks() : localDB.getAllDecks();
export const createDeck = async (deck: Parameters<typeof localDB.createDeck>[0]) => useCloud() ? cloudDB.createDeck(deck) : localDB.createDeck(deck);
export const deleteDeck = async (id: string) => useCloud() ? cloudDB.deleteDeck(id) : localDB.deleteDeck(id);
export const getDeckById = async (id: string) => useCloud() ? cloudDB.getDeckById(id) : localDB.getDeckById(id);

// 卡片操作
export const getAllCards = async (deckId?: string) => useCloud() ? cloudDB.getAllCards(deckId) : localDB.getAllCards(deckId);
export const saveCard = async (card: Parameters<typeof localDB.saveCard>[0]) => useCloud() ? cloudDB.saveCard(card) : localDB.saveCard(card);
export const deleteCard = async (id: string) => useCloud() ? cloudDB.deleteCard(id) : localDB.deleteCard(id);
export const getNewCards = async (deckId?: string) => useCloud() ? cloudDB.getNewCards(deckId) : localDB.getNewCards(deckId);
export const getDueCards = async (deckId?: string) => useCloud() ? cloudDB.getDueCards(deckId) : localDB.getDueCards(deckId);
export const getActiveCards = async (deckId?: string) => useCloud() ? cloudDB.getActiveCards(deckId) : localDB.getActiveCards(deckId);
export const getCardsByIds = async (ids: string[]) => useCloud() ? cloudDB.getCardsByIds(ids) : localDB.getCardsByIds(ids);
export const getCardByWord = async (word: string) => useCloud() ? cloudDB.getCardByWord(word) : localDB.getCardByWord(word);
export const getCardCount = async (deckId?: string) => useCloud() ? cloudDB.getCardCount(deckId) : localDB.getCardCount(deckId);

// 日志操作
export const addReviewLog = async (log: Parameters<typeof localDB.addReviewLog>[0]) => useCloud() ? cloudDB.addReviewLog(log) : localDB.addReviewLog(log);
export const getAllLogs = async () => useCloud() ? cloudDB.getAllLogs() : localDB.getAllLogs();

// 缓存操作
export const getSemanticConnections = async (source: string) => useCloud() ? cloudDB.getSemanticConnections(source) : localDB.getSemanticConnections(source);
export const saveSemanticConnections = async (data: Parameters<typeof localDB.saveSemanticConnections>[0]) => useCloud() ? cloudDB.saveSemanticConnections(data) : localDB.saveSemanticConnections(data);
export const getGroupGraphCache = async (key: string) => useCloud() ? cloudDB.getGroupGraphCache(key) : localDB.getGroupGraphCache(key);
export const saveGroupGraphCache = async (data: Parameters<typeof localDB.saveGroupGraphCache>[0]) => useCloud() ? cloudDB.saveGroupGraphCache(data) : localDB.saveGroupGraphCache(data);
export const getAIGraphCache = async (word: string) => useCloud() ? cloudDB.getAIGraphCache(word) : localDB.getAIGraphCache(word);
export const saveAIGraphCache = async (data: Parameters<typeof localDB.saveAIGraphCache>[0]) => useCloud() ? cloudDB.saveAIGraphCache(data) : localDB.saveAIGraphCache(data);

// 初始化
export const initDB = async () => {
    if (useCloud()) {
        await cloudDB.initSupabaseDB();
    } else {
        await localDB.initDB();
    }
};

// 系统常量
export const SYSTEM_DECK_GUIDED = localDB.SYSTEM_DECK_GUIDED;
