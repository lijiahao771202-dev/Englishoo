/**
 * @file DataService.ts
 * @component 数据服务 (DataService)
 * @description 本地优先架构的核心服务 - 所有数据操作的唯一入口
 * 
 * 架构设计:
 * 1. 所有读写操作即时写入 IndexedDB (0 延迟)
 * 2. 变更加入同步队列
 * 3. 防抖批量推送到云端 (5秒)
 * 4. 支持强制立即同步
 * 
 * @author Trae-Architect
 */

import * as localDB from './db';
import * as supabaseDB from './supabase-db';
import { supabase } from './supabase';
import type { WordCard, Deck } from '@/types';

/**
 * 防抖函数
 */
function debounce<T extends (...args: unknown[]) => unknown>(
    fn: T,
    delay: number
): T & { cancel: () => void } {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const debounced = (...args: Parameters<T>) => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            fn(...args);
            timeoutId = null;
        }, delay);
    };

    (debounced as T & { cancel: () => void }).cancel = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    };

    return debounced as T & { cancel: () => void };
}

/**
 * 单例数据服务 - 所有数据操作的唯一入口
 */
class DataService {
    private static instance: DataService;

    // 待同步的卡片变更队列
    private pendingCardChanges: Map<string, WordCard> = new Map();
    // 待同步的卡包变更队列
    private pendingDeckChanges: Map<string, Deck> = new Map();

    // 同步状态
    private isSyncing = false;
    private lastSyncTime = 0;

    // 同步延迟 (毫秒)
    private readonly SYNC_DELAY = 5000;

    private constructor() {
        // 页面卸载时尽力同步
        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', () => {
                this.forceSyncNow();
            });

            // 可见性变化时同步 (切换标签页)
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') {
                    this.forceSyncNow();
                }
            });
        }
    }

    /**
     * 获取单例实例
     */
    static getInstance(): DataService {
        if (!DataService.instance) {
            DataService.instance = new DataService();
        }
        return DataService.instance;
    }

    // ========================================
    // 卡片操作 (Cards)
    // ========================================

    /**
     * 保存/更新卡片 (本地优先)
     * 1. 即时写入 IndexedDB
     * 2. 加入同步队列
     * 3. 触发防抖同步
     */
    async saveCard(card: WordCard): Promise<void> {
        // 1. 即时写入本地
        await localDB.saveCard(card);
        console.log(`[DataService] 已保存到本地: ${card.word}`);

        // 2. 加入同步队列
        this.pendingCardChanges.set(card.id, card);

        // 3. 触发防抖同步
        this.scheduleSyncDebounced();
    }

    /**
     * 批量保存卡片
     */
    async saveCards(cards: WordCard[]): Promise<void> {
        // 1. 批量写入本地
        await localDB.saveCards(cards);
        console.log(`[DataService] 已批量保存到本地: ${cards.length} 张卡片`);

        // 2. 加入同步队列
        cards.forEach(card => {
            this.pendingCardChanges.set(card.id, card);
        });

        // 3. 触发防抖同步
        this.scheduleSyncDebounced();
    }

    /**
     * 获取所有卡片 (从本地读取)
     */
    async getAllCards(deckId?: string): Promise<WordCard[]> {
        return localDB.getAllCards(deckId);
    }

    /**
     * 根据 ID 获取卡片
     */
    async getCardsByIds(ids: string[]): Promise<WordCard[]> {
        return localDB.getCardsByIds(ids);
    }

    /**
     * 根据单词获取卡片
     */
    async getCardByWord(word: string): Promise<WordCard | undefined> {
        return localDB.getCardByWord(word);
    }

    /**
     * 获取新卡片 (state = New)
     */
    async getNewCards(deckId?: string): Promise<WordCard[]> {
        return localDB.getNewCards(deckId);
    }

    /**
     * 获取待复习卡片
     */
    async getDueCards(deckId?: string): Promise<WordCard[]> {
        return localDB.getDueCards(deckId);
    }

    /**
     * 获取活跃卡片 (New + Learning + Relearning)
     */
    async getActiveCards(deckId?: string): Promise<WordCard[]> {
        return localDB.getActiveCards(deckId);
    }

    /**
     * 删除卡片
     */
    async deleteCard(id: string): Promise<void> {
        await localDB.deleteCard(id);
        // 注意: 删除操作也需要同步到云端
        // 这里简化处理，实际可能需要记录删除事件
    }

    // ========================================
    // 卡包操作 (Decks)
    // ========================================

    /**
     * 获取所有卡包
     */
    async getAllDecks(): Promise<Deck[]> {
        return localDB.getAllDecks();
    }

    /**
     * 根据 ID 获取卡包
     */
    async getDeckById(id: string): Promise<Deck | undefined> {
        return localDB.getDeckById(id);
    }

    /**
     * 创建/更新卡包
     */
    async saveDeck(deck: Deck): Promise<void> {
        await localDB.createDeck(deck);
        this.pendingDeckChanges.set(deck.id, deck);
        this.scheduleSyncDebounced();
    }

    /**
     * 删除卡包
     */
    async deleteDeck(id: string): Promise<void> {
        await localDB.deleteDeck(id);
    }

    // ========================================
    // 同步逻辑
    // ========================================

    /**
     * 防抖同步 (5秒延迟)
     */
    private scheduleSyncDebounced = debounce(() => {
        this.syncToCloud();
    }, this.SYNC_DELAY);

    /**
     * 推送变更到云端
     */
    private async syncToCloud(): Promise<void> {
        // 检查是否有待同步的变更
        if (this.pendingCardChanges.size === 0 && this.pendingDeckChanges.size === 0) {
            return;
        }

        // 防止并发同步
        if (this.isSyncing) {
            console.log('[DataService] 已有同步任务进行中，跳过');
            return;
        }

        // 检查用户是否登录
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            console.log('[DataService] 用户未登录，跳过云端同步');
            return;
        }

        this.isSyncing = true;
        const startTime = Date.now();

        try {
            // 同步卡片
            if (this.pendingCardChanges.size > 0) {
                const cards = Array.from(this.pendingCardChanges.values());
                this.pendingCardChanges.clear();

                await supabaseDB.saveCards(cards);
                console.log(`[DataService] 已同步 ${cards.length} 张卡片到云端`);
            }

            // 同步卡包 (如需要)
            if (this.pendingDeckChanges.size > 0) {
                const decks = Array.from(this.pendingDeckChanges.values());
                this.pendingDeckChanges.clear();

                for (const deck of decks) {
                    await supabaseDB.createDeck(deck);
                }
                console.log(`[DataService] 已同步 ${decks.length} 个卡包到云端`);
            }

            this.lastSyncTime = Date.now();
            console.log(`[DataService] 同步完成，耗时 ${Date.now() - startTime}ms`);

        } catch (error) {
            console.error('[DataService] 同步失败:', error);
            // 失败的变更会在下次同步时重试 (已被清空, 可考虑重新加入)
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * 强制立即同步 (会话结束时调用)
     */
    async forceSyncNow(): Promise<void> {
        this.scheduleSyncDebounced.cancel();
        await this.syncToCloud();
    }

    /**
     * 获取待同步数量 (用于 UI 显示)
     */
    getPendingChangesCount(): number {
        return this.pendingCardChanges.size + this.pendingDeckChanges.size;
    }

    /**
     * 获取上次同步时间
     */
    getLastSyncTime(): number {
        return this.lastSyncTime;
    }

    // ========================================
    // 其他操作 (透传)
    // ========================================

    async addReviewLog(log: Parameters<typeof localDB.addReviewLog>[0]): Promise<void> {
        await localDB.addReviewLog(log);
    }

    async getSemanticConnections(source: string) {
        return localDB.getSemanticConnections(source);
    }

    async getCardCount(deckId?: string): Promise<number> {
        return localDB.getCardCount(deckId);
    }
}

// 导出单例实例
export const dataService = DataService.getInstance();

// 为了向后兼容，也导出一些直接函数
export const {
    saveCard,
    saveCards,
    getAllCards,
    getCardsByIds,
    getCardByWord,
    getNewCards,
    getDueCards,
    getActiveCards,
    deleteCard,
    getAllDecks,
    getDeckById,
    saveDeck,
    deleteDeck,
    addReviewLog,
    getSemanticConnections,
    getCardCount,
    forceSyncNow,
    getPendingChangesCount,
} = {
    saveCard: (card: WordCard) => dataService.saveCard(card),
    saveCards: (cards: WordCard[]) => dataService.saveCards(cards),
    getAllCards: (deckId?: string) => dataService.getAllCards(deckId),
    getCardsByIds: (ids: string[]) => dataService.getCardsByIds(ids),
    getCardByWord: (word: string) => dataService.getCardByWord(word),
    getNewCards: (deckId?: string) => dataService.getNewCards(deckId),
    getDueCards: (deckId?: string) => dataService.getDueCards(deckId),
    getActiveCards: (deckId?: string) => dataService.getActiveCards(deckId),
    deleteCard: (id: string) => dataService.deleteCard(id),
    getAllDecks: () => dataService.getAllDecks(),
    getDeckById: (id: string) => dataService.getDeckById(id),
    saveDeck: (deck: Deck) => dataService.saveDeck(deck),
    deleteDeck: (id: string) => dataService.deleteDeck(id),
    addReviewLog: (log: Parameters<typeof localDB.addReviewLog>[0]) => dataService.addReviewLog(log),
    getSemanticConnections: (source: string) => dataService.getSemanticConnections(source),
    getCardCount: (deckId?: string) => dataService.getCardCount(deckId),
    forceSyncNow: () => dataService.forceSyncNow(),
    getPendingChangesCount: () => dataService.getPendingChangesCount(),
};
