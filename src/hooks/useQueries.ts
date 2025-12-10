/**
 * @file React Query Hooks (数据查询钩子)
 * @description 使用 @tanstack/react-query 实现数据缓存和自动重新获取
 * @context 性能优化 - P1: 减少重复数据获取，提升页面切换体验
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAllDecks, getAllCards, getDueCards, getNewCards, saveCard, deleteCard, deleteDeck } from '@/lib/data-source';


// ==================== Query Keys ====================
export const queryKeys = {
    decks: ['decks'] as const,
    cards: (deckId: string) => ['cards', deckId] as const,
    dueCards: (deckId: string) => ['dueCards', deckId] as const,
    newCards: (deckId: string) => ['newCards', deckId] as const,
};

// ==================== Deck Queries ====================

/**
 * 获取所有卡包 (带缓存)
 * @param staleTime 缓存时间(ms)，默认 5 分钟
 */
export function useDecks(staleTime = 5 * 60 * 1000) {
    return useQuery({
        queryKey: queryKeys.decks,
        queryFn: getAllDecks,
        staleTime,
        gcTime: 30 * 60 * 1000, // 30 分钟后垃圾回收
    });
}

// ==================== Card Queries ====================

/**
 * 获取指定卡包的所有卡片 (带缓存)
 */
export function useCards(deckId: string | undefined, enabled = true) {
    return useQuery({
        queryKey: queryKeys.cards(deckId || ''),
        queryFn: () => getAllCards(deckId!),
        enabled: !!deckId && enabled,
        staleTime: 2 * 60 * 1000, // 2 分钟
        gcTime: 10 * 60 * 1000,
    });
}

/**
 * 获取到期卡片
 */
export function useDueCards(deckId: string | undefined, enabled = true) {
    return useQuery({
        queryKey: queryKeys.dueCards(deckId || ''),
        queryFn: () => getDueCards(deckId!),
        enabled: !!deckId && enabled,
        staleTime: 30 * 1000, // 30 秒 (复习状态变化快)
    });
}

/**
 * 获取新卡片
 */
export function useNewCards(deckId: string | undefined, enabled = true) {
    return useQuery({
        queryKey: queryKeys.newCards(deckId || ''),
        queryFn: () => getNewCards(deckId!),
        enabled: !!deckId && enabled,
        staleTime: 60 * 1000, // 1 分钟
    });
}

// ==================== Mutations ====================

/**
 * 保存卡片 Mutation (自动失效缓存)
 */
export function useSaveCardMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: saveCard,
        onSuccess: (_data, card) => {
            // 失效相关缓存
            queryClient.invalidateQueries({ queryKey: queryKeys.cards(card.deckId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.dueCards(card.deckId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.newCards(card.deckId) });
        },
    });
}

/**
 * 删除卡片 Mutation
 */
export function useDeleteCardMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ cardId, deckId: _deckId }: { cardId: string; deckId: string }) => deleteCard(cardId),
        onSuccess: (_data, { deckId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.cards(deckId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.dueCards(deckId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.newCards(deckId) });
        },
    });
}

/**
 * 删除卡包 Mutation
 */
export function useDeleteDeckMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: deleteDeck,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.decks });
        },
    });
}
