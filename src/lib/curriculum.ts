import { getAllCards, getDB } from './db';
import type { WordCard } from '@/types';

export interface CurriculumLevel {
  id: string;
  title: string;
  mainWordId: string;
  mainWord: string;
  wordIds: string[];
  status: 'locked' | 'unlocked' | 'completed';
  /** 关卡内的核心主题词列表 (用于构建多根节点思维导图) */
  topicWords?: Array<{ id: string; word: string }>;
}

/**
 * @description 生成基于关联的课程体系 (优化版: 更少关卡，更多词汇，组块化)
 * @param deckId 卡包 ID
 */
export async function generateCurriculum(deckId: string): Promise<CurriculumLevel[]> {
  const cards = await getAllCards(deckId);
  if (!cards || cards.length === 0) return [];

  // 1. Sort by Rank (Difficulty)
  const sortedCards = [...cards].sort((a, b) => {
    const rankA = a.rank ?? 999999;
    const rankB = b.rank ?? 999999;
    return rankA - rankB;
  });

  const db = await getDB();
  const visitedIds = new Set<string>();
  const levels: CurriculumLevel[] = [];
  let levelCount = 1;

  // Helper to get connections from DB
  const getConnections = async (word: string) => {
    try {
        const record = await db.get('semantic_connections', word.toLowerCase());
        return record?.connections || [];
    } catch (e) {
        return [];
    }
  };

  // Create a map for quick lookup of card by word
  const wordToCardMap = new Map<string, WordCard>();
  cards.forEach(c => wordToCardMap.set(c.word.toLowerCase(), c));

  // Target size for each level
  const TARGET_LEVEL_SIZE = 15;

  for (const candidateCard of sortedCards) {
    if (visitedIds.has(candidateCard.id)) continue;

    // Start a new Level
    const levelWordIds: string[] = [];
    const topicWords: Array<{ id: string; word: string }> = [];
    
    // We will try to fill this level with multiple "Chunks" (Topic Clusters)
    // Initialize with current candidate as first topic
    let currentSeed = candidateCard;
    
    while (levelWordIds.length < TARGET_LEVEL_SIZE) {
        // Add seed
        if (!visitedIds.has(currentSeed.id)) {
            levelWordIds.push(currentSeed.id);
            visitedIds.add(currentSeed.id);
            topicWords.push({ id: currentSeed.id, word: currentSeed.word });
        }

        // Add connections for this seed
        const connections = await getConnections(currentSeed.word);
        const validConnections = connections
            .filter(c => wordToCardMap.has(c.target))
            .map(c => wordToCardMap.get(c.target)!)
            .filter(c => !visitedIds.has(c.id));

        // Take related words (up to 6 per topic to keep topics balanced)
        for (const related of validConnections.slice(0, 6)) {
            levelWordIds.push(related.id);
            visitedIds.add(related.id);
        }

        // Check if we need more words
        if (levelWordIds.length >= TARGET_LEVEL_SIZE) break;

        // Find next seed from sorted list that hasn't been visited
        const nextSeed = sortedCards.find(c => !visitedIds.has(c.id));
        if (!nextSeed) break; // No more cards
        
        currentSeed = nextSeed;
    }

    levels.push({
        id: `level-${levelCount}`,
        title: `第 ${levelCount} 关: ${topicWords.map(t => t.word).slice(0, 2).join(' & ')}${topicWords.length > 2 ? '...' : ''}`,
        mainWordId: topicWords[0].id, // Primary ID for reference
        mainWord: topicWords[0].word,
        wordIds: levelWordIds,
        status: levelCount === 1 ? 'unlocked' : 'locked',
        topicWords: topicWords
    });

    levelCount++;
  }

  return levels;
}

export async function buildGraphFromCards(cards: WordCard[]) {
    if (!cards || cards.length === 0) return null;

    // Use EmbeddingService to cluster cards based on semantic connections (connected components)
    // This ensures true "Knowledge Network" based grouping
    const { EmbeddingService } = await import('./embedding');
    const clusters = await EmbeddingService.getInstance().clusterCards(cards);

    // Build Virtual Root
    const virtualRoot = {
        id: 'session-root',
        label: '本次学习', // "Current Session"
        type: 'root',
        children: [] as any[]
    };

    clusters.forEach((cluster) => {
        // Find the card that represents the label (if exists in the items)
        // If the label is not one of the items (unlikely with current clusterCards logic), pick the first item.
        let topicCard = cluster.items.find(c => c.word.toLowerCase() === cluster.label.toLowerCase());
        
        // If topic card not found (or label is abstract), pick the first one as topic
        if (!topicCard) {
            topicCard = cluster.items[0];
        }

        const otherCards = cluster.items.filter(c => c.id !== topicCard!.id);

        const topicNode = {
            id: topicCard.id,
            label: topicCard.word,
            meaning: topicCard.meaning,
            type: 'topic',
            data: topicCard,
            children: otherCards.map(child => ({
                id: child.id,
                label: child.word,
                meaning: child.meaning,
                type: 'related',
                data: child
            }))
        };
        virtualRoot.children.push(topicNode);
    });

    return virtualRoot;
}

/**
 * @description 获取关卡详情（用于构建思维导图）
 * @returns MindMap Data Structure adapted for multiple topics
 */
export async function getLevelDetail(deckId: string, level: CurriculumLevel) {
    const cards = await getAllCards(deckId);
    const levelCardsMap = new Map<string, WordCard>();
    cards.filter(c => level.wordIds.includes(c.id)).forEach(c => levelCardsMap.set(c.id, c));

    if (levelCardsMap.size === 0) return null;

    // If we have explicit topic words, use them. Otherwise fallback to mainWordId.
    const topics = level.topicWords || [{ id: level.mainWordId, word: level.mainWord }];

    // Build a "Virtual Root" for the Level
    const virtualRoot = {
        id: 'level-root',
        label: level.title,
        type: 'root', // Special type for visualization
        children: [] as any[]
    };

    const db = await getDB();
    const assignedCardIds = new Set<string>();

    for (const topic of topics) {
        const topicCard = levelCardsMap.get(topic.id);
        if (!topicCard) continue;

        assignedCardIds.add(topic.id);

        // Find connections for this topic WITHIN the level
        const connections = await db.get('semantic_connections', topic.word.toLowerCase());
        const connectedTargets = new Set(connections?.connections.map(c => c.target) || []);

        const topicChildren: any[] = [];
        
        // Iterate all cards in level to see if they belong to this topic
        // Prefer assigning to the first matching topic
        for (const [id, card] of levelCardsMap) {
            if (id === topic.id) continue; // Skip self
            if (assignedCardIds.has(id)) continue; // Already assigned

            if (connectedTargets.has(card.word.toLowerCase())) {
                topicChildren.push({
                    id: card.id,
                    label: card.word,
                    meaning: card.meaning,
                    type: 'related',
                    data: card // Store full card data
                });
                assignedCardIds.add(id);
            }
        }

        virtualRoot.children.push({
            id: topicCard.id,
            label: topicCard.word,
            meaning: topicCard.meaning,
            type: 'topic', // Topic Core
            data: topicCard,
            children: topicChildren
        });
    }

    // Handle "Orphans" (cards in level not connected to any topic)
    // Attach them to the nearest topic or just the first topic?
    // Or create a "Misc" group?
    // Let's attach them to the first topic for simplicity, or distribute them.
    const orphans: any[] = [];
    for (const [id, card] of levelCardsMap) {
        if (!assignedCardIds.has(id)) {
            orphans.push({
                id: card.id,
                label: card.word,
                meaning: card.meaning,
                type: 'related',
                data: card
            });
        }
    }

    if (orphans.length > 0 && virtualRoot.children.length > 0) {
        // Append orphans to the first topic (or spread them?)
        // Let's just add them to the first topic to keep tree clean
        virtualRoot.children[0].children.push(...orphans);
    } else if (orphans.length > 0) {
        // Fallback if no topics found (shouldn't happen)
         virtualRoot.children.push(...orphans);
    }

    return virtualRoot;
}
