import React, { useState, useRef, useEffect, useCallback } from 'react';
import ForceGraph2D, { type ForceGraphMethods, type NodeObject } from 'react-force-graph-2d';
import * as d3 from 'd3-hierarchy';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Sparkles, RotateCcw, BrainCircuit, Lock, Unlock, Star, Map as MapIcon, Volume2, Check, X, Clock, Target, ArrowRight, Loader2 } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { generateCurriculum, getLevelDetail, type CurriculumLevel } from '@/lib/curriculum';
import { getAllDecks, saveCard, getAllCards, getSemanticConnections, getCardsByIds, getGroupGraphCache, saveGroupGraphCache, getAIGraphCache, saveAIGraphCache } from '@/lib/data-source';
import { cn } from '@/lib/utils';
import { speak } from '@/lib/tts';
import { playClickSound, playSuccessSound, playFailSound, playPassSound, playSpellingSuccessSound, playSessionCompleteSound, playKnowSound } from '@/lib/sounds';
import { Flashcard } from '@/components/Flashcard';
import type { WordCard } from '@/types';
import { enrichWord, generateExample, generateMnemonic, generateMeaning, generatePhrases, generateDerivatives, generateRoots, generateSyllables, generateEdgeLabels, generateEdgeLabelsOnly, generateBridgingExample, generateRelatedWords } from '@/lib/deepseek';
import { EmbeddingService } from '@/lib/embedding';
import { SessionReport } from '@/components/SessionReport';
import { Rating, State } from 'ts-fsrs';
import { ReviewControls } from '@/components/ReviewControls';
import { getReviewPreviews } from '@/lib/fsrs';
import { FloatingAIChat } from '@/components/FloatingAIChat';
import { InteractiveMascot, type MascotReaction } from '@/components/InteractiveMascot';
import { loadMascotConfig } from '@/lib/mascot-config';
import { mascotEventBus } from '@/lib/mascot-event-bus';
import { getMascotDialogue } from '@/lib/mascot-dialogues';

/**
 * @description 引导式学习会话页面 (Guided Learning Session)
 * 重构版: 核心基于 "关联组块 (Chunking)" 和 "关卡地图 (Level Map)"
 * 
 * 更新日志 (2025-12-01):
 * 1. 优化思维导图缩放逻辑，展示更多层级上下文 (Zoom Level 2.2)
 * 2. 集成 Flashcard 组件，保持 UI 设计一致性
 * 3. 实现穿插学习模式 (Interleaved Learning): 学习 -> 选择 -> 拼写
 * 4. 支持外部传入 cards 进行学习/复习 (通用模式)
 * 5. 集成 FSRS 复习模式 (Review Mode Integration)
 * 6. 新增按组学习模式与动态知识图谱展示
 */

export interface GuidedLearningSessionProps {
    onBack: () => void;
    apiKey: string;
    cards?: WordCard[]; // Optional: If provided, uses these cards instead of curriculum
    onRate?: (card: WordCard, rating: Rating) => Promise<void>; // FSRS Rating Handler
    sessionGroups?: Array<{ label: string; items: WordCard[] }>;
    onUpdateCard?: (card: WordCard) => Promise<void | WordCard>;
    sessionMode?: 'new' | 'review' | 'mixed'; // [NEW] Explicit session mode
}

// 扩展 NodeObject 类型以包含自定义属性
interface CustomNode extends NodeObject {
    id: string;
    label: string;
    meaning?: string;
    type: 'root' | 'topic' | 'related' | 'context' | 'other';
    val: number;
    group?: number;
    data?: WordCard; // Store full card data
    parentId?: string;
    parentLabel?: string;
}

type LearningPhase = 'overview' | 'word-learning' | 'connection-learning' | 'summary';

type SessionItemType = 'learn' | 'test' | 'choice';

interface SessionItem {
    card: WordCard;
    type: SessionItemType;
    nodeId: string; // Keep track of graph node ID for focus
}

export default function GuidedLearningSession({ onBack, apiKey, cards, onRate, sessionGroups, onUpdateCard, sessionMode = 'mixed' }: GuidedLearningSessionProps) {
    const [mode, setMode] = useState<'map' | 'session'>('map');
    const [levels, setLevels] = useState<CurriculumLevel[]>([]);
    const [currentLevel, setCurrentLevel] = useState<CurriculumLevel | null>(null);
    const [deckName, setDeckName] = useState('');

    // Session State
    const [graphData, setGraphData] = useState<{ nodes: CustomNode[], links: any[] } | null>(null);
    const graphRef = useRef<ForceGraphMethods | undefined>(undefined);
    // [NEW] 存储语义引力连接 (Semantic Gravity Links)
    const semanticLinksRef = useRef<Array<{ source: string, target: string, similarity: number }>>([]);
    const containerRef = useRef<HTMLDivElement>(null);
    // 记录上一次处理的组标签，避免因卡片内容更新导致的重复图谱生成
    const lastProcessedGroupLabelRef = useRef<string | null>(null);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

    // Learning State
    const [phase, setPhase] = useState<LearningPhase>('overview');
    const [queue, setQueue] = useState<SessionItem[]>([]);
    const currentItem = queue[0]; // Define early to avoid TDZ in effects
    const [completedNodeIds, setCompletedNodeIds] = useState<Set<string>>(new Set());
    const [sessionStats, setSessionStats] = useState({ correct: 0, total: 0, startTime: 0 });
    const [showReport, setShowReport] = useState(false);
    const [showGroupCompletion, setShowGroupCompletion] = useState(false); // [NEW] Pause for group report
    const [isQueueInitialized, setIsQueueInitialized] = useState(false); // [FIX] Prevent race condition on load

    // Group State
    const [activeGroupIndex, setActiveGroupIndex] = useState<number>(-1);

    // Connection Learning State
    const [connectionQueue, setConnectionQueue] = useState<any[]>([]); // Links to learn
    const [currentConnectionIndex, setCurrentConnectionIndex] = useState(0);

    // Interaction State
    const [hoveredLink, setHoveredLink] = useState<any>(null);
    const [hoveredNode, setHoveredNode] = useState<any>(null);
    const [isHoveringCard, setIsHoveringCard] = useState(false); // [NEW] Track if hovering card to prevent graph interaction
    const [isCardFlipped, setIsCardFlipped] = useState(false); // [NEW] Track card flip state for controls
    const [justLearnedNodeId, setJustLearnedNodeId] = useState<string | null>(null);
    const [animationTime, setAnimationTime] = useState(0); // [FIX] For smooth canvas animations
    // Highlighted Neighbor State (Cross-Highlighting)
    const [highlightedNeighborId, setHighlightedNeighborId] = useState<string | null>(null);
    const [isGraphGenerating, setIsGraphGenerating] = useState(false);
    const [generatingLinks, setGeneratingLinks] = useState<Set<string>>(new Set());
    const [cardPosition, setCardPosition] = useState<{ x: number; y: number } | undefined>(undefined);
    const [mascotReaction, setMascotReaction] = useState<MascotReaction>('idle');
    const [comboCount, setComboCount] = useState(0); // 连击计数
    const lastActivityRef = useRef<number>(Date.now()); // 最后活动时间
    // [NEW] Context Tracking
    const cardLoadedTimeRef = useRef<number>(Date.now());
    // [Feature I] 老师模式状态
    const [isTeacherMode, setIsTeacherMode] = useState(false);

    // [NEW] AI Graph Cache (L1 - Memory)
    const aiCacheRef = useRef<Map<string, any>>(new Map());

    // [NEW] Prefetch AI Content
    const prefetchRelatedWords = useCallback(async (word: string) => {
        if (!apiKey || !word) return;

        // 1. Check L1 Cache (Memory)
        if (aiCacheRef.current.has(word)) return;

        // 2. Check L2 Cache (DB)
        const cached = await getAIGraphCache(word);
        if (cached && (Date.now() - cached.timestamp < 30 * 24 * 60 * 60 * 1000)) { // 30 days valid
            aiCacheRef.current.set(word, cached.relatedItems);
            return;
        }

        // 3. Fetch from API (Queue it effectively)
        // Note: We don't await here to avoid blocking UI, but we should limit concurrency if possible.
        // For simplicity in this version, we just fire and forget, relying on internal logic.
        // However, to avoid redundant calls, we mark it as 'fetching' in L1.
        aiCacheRef.current.set(word, 'fetching');

        try {
            const relatedItems = await generateRelatedWords(word, apiKey);
            if (relatedItems && relatedItems.length > 0) {
                aiCacheRef.current.set(word, relatedItems);
                await saveAIGraphCache({ word, relatedItems, timestamp: Date.now() });
            } else {
                aiCacheRef.current.delete(word); // Retry later if failed
            }
        } catch (e) {
            console.error(`Prefetch failed for ${word}`, e);
            aiCacheRef.current.delete(word);
        }
    }, [apiKey]);

    // [NEW] Monitor Queue for Prefetching
    useEffect(() => {
        if (!queue.length || !apiKey) return;

        // Prefetch next 4 items
        const itemsToPrefetch = queue.slice(1, 5); // Next 4 items
        itemsToPrefetch.forEach(async (item) => {
            prefetchRelatedWords(item.card.word);

            // 预生成词根词缀（如果没有）
            if (!item.card.roots) {
                try {
                    const roots = await generateRoots(item.card.word, apiKey);
                    if (roots && roots.length > 0) {
                        const updated = { ...item.card, roots };
                        handleUpdateCard(updated);
                    }
                } catch (e) { /* 静默失败 */ }
            }

            // 预生成音节切分（如果没有）
            if (!item.card.syllables) {
                try {
                    const syllables = await generateSyllables(item.card.word, apiKey);
                    if (syllables) {
                        const updated = { ...item.card, syllables };
                        handleUpdateCard(updated);
                    }
                } catch (e) { /* 静默失败 */ }
            }
        });
    }, [queue, apiKey, prefetchRelatedWords, currentItem]); // Trigger when queue changes or current item advances

    // Reset card flip state when item changes
    useEffect(() => {
        setIsCardFlipped(false);
    }, [currentItem]);

    // [FIX] Animation loop for smooth ripple/pulse effects at ~30fps
    useEffect(() => {
        let rafId: number;
        let lastUpdate = 0;
        const targetFps = 30; // 30fps for smooth but efficient animation
        const frameInterval = 1000 / targetFps;

        const animate = (timestamp: number) => {
            if (timestamp - lastUpdate >= frameInterval) {
                setAnimationTime(timestamp);
                lastUpdate = timestamp;
            }
            rafId = requestAnimationFrame(animate);
        };

        rafId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(rafId);
    }, []);


    // [NEW] Real-time Example Generation Effect
    useEffect(() => {
        if (!hoveredLink || !apiKey || hoveredLink.example) return;

        const sourceId = typeof hoveredLink.source === 'object' ? hoveredLink.source.id : hoveredLink.source;
        const targetId = typeof hoveredLink.target === 'object' ? hoveredLink.target.id : hoveredLink.target;
        const linkId = `${sourceId}-${targetId}`;

        if (generatingLinks.has(linkId)) return;

        // Only generate if BOTH nodes are 'topic' (learned/learning)
        // Exclude 'context' nodes (unlearned) from example generation
        const sourceNode = graphData?.nodes.find(n => n.id === sourceId);
        const targetNode = graphData?.nodes.find(n => n.id === targetId);

        if (!sourceNode || !targetNode) return;
        if (sourceNode.type !== 'topic' || targetNode.type !== 'topic') return;

        const generate = async () => {
            setGeneratingLinks(prev => new Set(prev).add(linkId));

            try {
                const result = await generateBridgingExample(
                    sourceNode.label,
                    targetNode.label,
                    hoveredLink.label || 'related',
                    apiKey
                );

                // Update Graph Data
                setGraphData(prev => {
                    if (!prev) return null;
                    const newLinks = prev.links.map(l => {
                        const lSourceId = typeof l.source === 'object' ? l.source.id : l.source;
                        const lTargetId = typeof l.target === 'object' ? l.target.id : l.target;

                        if ((lSourceId === sourceId && lTargetId === targetId) || (lSourceId === targetId && lTargetId === sourceId)) {
                            const updated = { ...l, example: result.example, example_cn: result.exampleMeaning };
                            if (l === hoveredLink) setHoveredLink(updated);
                            return updated;
                        }
                        return l;
                    });
                    return { ...prev, links: newLinks };
                });
            } catch (e) {
                console.error(e);
            } finally {
                setGeneratingLinks(prev => {
                    const next = new Set(prev);
                    next.delete(linkId);
                    return next;
                });
            }
        };

        const timer = setTimeout(generate, 500); // Debounce slightly to avoid rapid hover triggers
        return () => clearTimeout(timer);
    }, [hoveredLink, apiKey, graphData, generatingLinks]);

    // Interleaved Learning State
    const [isEnriching, setIsEnriching] = useState(false);
    const [choiceOptions, setChoiceOptions] = useState<WordCard[]>([]);
    const [choiceResult, setChoiceResult] = useState<'correct' | 'incorrect' | null>(null);
    const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
    const [inputValue, setInputValue] = useState('');
    const [testResult, setTestResult] = useState<'correct' | 'incorrect' | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Helper to identify neighbors of the current active node for focus mode
    const activeNeighborIds = React.useMemo(() => {
        if (!currentItem || !graphData) return new Set<string>();
        const neighborIds = new Set<string>();
        graphData.links.forEach((link: any) => {
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;

            if (sourceId === currentItem.nodeId) neighborIds.add(targetId);
            if (targetId === currentItem.nodeId) neighborIds.add(sourceId);
        });
        return neighborIds;
    }, [currentItem, graphData]);

    const groupLabel = React.useMemo(() => {
        if (!currentItem || !graphData) return null;
        const node = graphData.nodes.find(n => n.id === currentItem.nodeId);
        if (!node) return null;

        const label = node.type === 'topic' ? node.label : node.parentLabel;
        return label === '本次学习' ? null : label;
    }, [currentItem, graphData]);

    // Initialize Curriculum or Session from Cards
    const isInitialized = useRef(false);
    useEffect(() => {
        const init = async () => {
            if (isInitialized.current) return;
            isInitialized.current = true;

            if (cards && cards.length > 0) {
                // Custom Session Mode (Review/Learn specific cards)
                setDeckName('本次学习');
                await initSessionFromCards(cards);
            } else {
                // Default Curriculum Mode
                try {
                    const decks = await getAllDecks();
                    const targetDeck = decks.find(d => d.name.includes('专八')) || decks.find(d => d.id === 'vocabulary-book');

                    if (targetDeck) {
                        setDeckName(targetDeck.name);
                        const curriculum = await generateCurriculum(targetDeck.id);
                        setLevels(curriculum);
                    }
                } catch (e) {
                    console.error("Failed to load curriculum", e);
                }
            }
        };
        init();
    }, []);

    // Monitor Active Group Change & Generate Graph
    useEffect(() => {
        if (!sessionGroups || sessionGroups.length === 0 || activeGroupIndex === -1) return;
        const group = sessionGroups[activeGroupIndex];

        // 避免重复生成: 只有当组标签发生变化时才重新生成图谱
        // 这样可以防止 handleUpdateCard 触发 sessionGroups 更新时导致的意外 loading
        if (group && group.label !== lastProcessedGroupLabelRef.current) {
            lastProcessedGroupLabelRef.current = group.label;
            updateGraphForGroup(group);
        }
    }, [activeGroupIndex, sessionGroups]);

    // Monitor Current Item for Review Mode Graph Update
    useEffect(() => {
        // Only run if NOT in group mode (i.e. no sessionGroups)
        if (sessionGroups && sessionGroups.length > 0) return;

        // Only run if we have a current item
        if (!currentItem) return;

        // Avoid updating if we already have the graph for this item
        if (graphData && graphData.nodes.length > 0 && graphData.nodes[0].id === currentItem.nodeId) return;

        updateGraphForContext(currentItem.card);
    }, [currentItem, sessionGroups]); // Removed graphData from dependency to avoid loops, handled inside check

    // Monitor Queue to Switch Groups & Auto-Advance
    useEffect(() => {
        if (!sessionGroups || sessionGroups.length === 0) return;

        // Case 1: Queue is empty -> Finished current group
        if (queue.length === 0) {
            // [FIX] Don't trigger completion if we haven't even initialized the queue yet
            if (!isQueueInitialized) return;

            // Only act if we correspond to a valid active group
            if (activeGroupIndex !== -1) {
                // Check if we already finished (to avoid loops if we stay in this state)
                if (showGroupCompletion || showReport) return;

                const nextIndex = activeGroupIndex + 1;
                if (nextIndex < sessionGroups.length) {
                    console.log(`[Session] Group ${activeGroupIndex} complete. Waiting for user to advance...`);
                    // [FIX] Pause for Group Report instead of auto-advancing
                    setShowGroupCompletion(true);
                } else {
                    console.log('[Session] All groups complete.');
                    setShowReport(true);
                }
            }
            return;
        }

        // Case 2: Queue has items -> Ensure Active Group matches current item
        // This handles if we manually injected random items, but standard flow relies on Case 1.
        const currentCard = queue[0].card;
        const groupIndex = sessionGroups.findIndex(g => g.items.some(c => c.id === currentCard.id));
        if (groupIndex !== -1 && groupIndex !== activeGroupIndex) {
            // Only update if strictly different and valid. 
            // Usually we shouldn't change groups mid-queue unless we mixed them.
            // But for safety:
            setActiveGroupIndex(groupIndex);
        }
    }, [queue, sessionGroups, activeGroupIndex, showGroupCompletion, showReport]);

    const handleAdvanceGroup = () => {
        if (!sessionGroups) return;
        const nextIndex = activeGroupIndex + 1;
        if (nextIndex < sessionGroups.length) {
            setActiveGroupIndex(nextIndex);
            loadGroupQueue(nextIndex);
            setShowGroupCompletion(false);
            setPhase('overview'); // Show overview for the new group
        }
    };

    // [NEW] 语义磁力布局 (Semantic Magnetism Layout)
    // 计算节点间的语义相似度，并应用自定义引力，使相关单词聚集
    useEffect(() => {
        if (!graphData || !graphData.nodes.length) return;

        const calculateSemanticForces = async () => {
            const nodes = graphData.nodes;
            const words = nodes.map(n => n.label);

            const service = EmbeddingService.getInstance();
            // 获取所有单词的 Embedding
            const embeddings = await service.getEmbeddingsMap(words);

            const links: Array<{ source: string, target: string, similarity: number }> = [];

            // 计算两两之间的相似度
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const u = nodes[i];
                    const v = nodes[j];
                    const vecU = embeddings.get(u.label);
                    const vecV = embeddings.get(v.label);

                    if (vecU && vecV) {
                        const sim = service.cosineSimilarity(vecU, vecV);
                        // 阈值 0.5: 只对中等以上相似度的单词施加引力
                        if (sim > 0.5) {
                            links.push({ source: u.id, target: v.id, similarity: sim });
                        }
                    }
                }
            }

            semanticLinksRef.current = links;

            // 更新力导向图引擎
            if (graphRef.current) {
                const fg = graphRef.current;

                // 注册自定义力: 语义引力 (Semantic Gravity)
                fg.d3Force('semantic-gravity', (alpha) => {
                    // 力度系数，随 alpha 衰减
                    const k = alpha * 0.15;

                    // 建立 ID 到 Node 对象的映射 (因为 d3 会修改 node 对象)
                    const nodeMap = new Map(nodes.map(n => [n.id, n]));

                    semanticLinksRef.current.forEach(link => {
                        const source = nodeMap.get(link.source);
                        const target = nodeMap.get(link.target);
                        // 确保节点存在且有坐标 (初始化时可能无坐标)
                        if (!source || !target || source.x === undefined || target.x === undefined || source.y === undefined || target.y === undefined) return;

                        // 计算当前距离
                        const dx = target.x - source.x;
                        const dy = target.y - source.y;
                        let l = Math.sqrt(dx * dx + dy * dy);
                        if (l === 0) l = 0.001;

                        // 目标距离: 相似度越高，距离越近
                        // sim 1.0 -> dist 50
                        // sim 0.5 -> dist 250
                        const targetDist = 50 + (1 - link.similarity) * 400;

                        // 施加弹簧引力 (仅当距离大于目标距离时)
                        if (l > targetDist) {
                            const strength = link.similarity;
                            const f = (l - targetDist) * strength * k;
                            const fx = (dx / l) * f;
                            const fy = (dy / l) * f;

                            // 更新速度
                            source.vx! += fx;
                            source.vy! += fy;
                            target.vx! -= fx;
                            target.vy! -= fy;
                        }
                    });
                });

                // 重启模拟以应用新力
                fg.d3ReheatSimulation();
            }
        };

        calculateSemanticForces();
    }, [graphData]);

    const initSessionFromCards = async (sessionCards: WordCard[]) => {
        if (sessionGroups && sessionGroups.length > 0) {
            // Group Mode: Persistence & Semantic Order

            // 1. Identify already learned cards across all groups (Fetch latest state from DB)
            const allItems = sessionGroups.flatMap(g => g.items);
            const allIds = allItems.map(c => c.id);

            // Fetch fresh cards to ensure state is up-to-date
            const freshCardsMap = new Map<string, WordCard>();
            try {
                const freshCards = await getCardsByIds(allIds);
                freshCards.forEach(c => freshCardsMap.set(c.id, c));
            } catch (e) {
                console.error("Failed to fetch fresh cards", e);
            }

            const learnedIds = new Set<string>();

            // Update items in groups with fresh data
            sessionGroups.forEach(group => {
                group.items.forEach((item, index) => {
                    const freshCard = freshCardsMap.get(item.id);
                    if (freshCard) {
                        // Update reference if possible, or just use it for check
                        group.items[index] = freshCard;
                        if (freshCard.state !== State.New) {
                            learnedIds.add(item.id);
                        }
                    } else {
                        if (item.state !== State.New) {
                            learnedIds.add(item.id);
                        }
                    }
                });
            });

            setCompletedNodeIds(learnedIds);

            // 2. Find first incomplete group
            let startGroupIndex = 0;
            for (let i = 0; i < sessionGroups.length; i++) {
                const group = sessionGroups[i];
                // Check against fresh data (which we updated into group.items)
                // [FIX] Consider Learning/Relearning as "Incomplete" too
                const hasUnlearned = group.items.some(c => c.state === State.New || c.state === State.Learning || c.state === State.Relearning);
                if (hasUnlearned) {
                    startGroupIndex = i;
                    break;
                }
            }

            // If all learned, start at 0
            const allLearned = sessionGroups.every(g => g.items.every(c => c.state !== State.New && c.state !== State.Learning && c.state !== State.Relearning));
            if (allLearned) {
                startGroupIndex = 0;
            }

            setActiveGroupIndex(startGroupIndex);

            // 3. Load Queue for the Start Group ONLY
            await loadGroupQueue(startGroupIndex);

            setMode('session');
        } else {
            // Review Mode: Queue follows input order (FSRS)
            // [FIX] Filter out familiar cards
            const newQueue: SessionItem[] = sessionCards
                .filter(card => !card.isFamiliar)
                .map(card => ({
                    card,
                    type: 'learn',
                    nodeId: card.id
                }));
            setQueue(newQueue);
            setMode('session');

            // Initial Graph for first card (Review Context)
            if (sessionCards.length > 0) {
                updateGraphForContext(sessionCards[0]);
            }
        }

        setPhase('overview');
        setCurrentConnectionIndex(0);
        setSessionStats({ correct: 0, total: 0, startTime: Date.now() });
    };

    // Helper to load a specific group into the queue
    const loadGroupQueue = async (groupIndex: number) => {
        if (!sessionGroups || !sessionGroups[groupIndex]) return;

        const group = sessionGroups[groupIndex];
        const words = group.items.map(c => c.word);

        // Sort by Semantic Chain
        const sortedWords = await EmbeddingService.getInstance().sortWordsBySemanticChain(words);

        // Reorder items based on sortedWords
        const sortedItems: WordCard[] = [];
        sortedWords.forEach(w => {
            const item = group.items.find(c => c.word.toLowerCase() === w.toLowerCase());
            if (item) sortedItems.push(item);
        });

        // Add any missing items (fallback)
        group.items.forEach(item => {
            if (!sortedItems.some(si => si.id === item.id)) sortedItems.push(item);
        });

        // Filter UNLEARNED items for the queue
        // [FIX] Include Learning/Relearning cards so incomplete groups can be finished
        const unlearnedItems = sortedItems.filter(c =>
            (c.state === State.New || c.state === State.Learning || c.state === State.Relearning)
            && !c.isFamiliar
        );

        const newQueue: SessionItem[] = unlearnedItems.map(card => ({
            card,
            type: 'learn',
            nodeId: card.id
        }));

        setQueue(newQueue);
        setIsQueueInitialized(true); // Queue is ready

        // Graph update is handled by useEffect monitoring activeGroupIndex
    };

    const updateGraphForGroup = async (group: { label: string; items: WordCard[] }, forceRefresh = false) => {
        setIsGraphGenerating(true);
        try {
            // Cache Key: Unique based on sorted words in the group
            const groupWords = group.items.map(c => c.word).sort();
            const cacheKey = `group_graph_${groupWords.join('_')}`;

            // 1. Try Load from Cache
            if (!forceRefresh) {
                const cached = await getGroupGraphCache(cacheKey);
                if (cached) {
                    console.log('Loaded graph from cache:', cacheKey);
                    // Re-hydrate nodes with fresh card data
                    const restoredNodes = cached.nodes.map((n: any) => {
                        const currentCard = group.items.find(c => c.id === n.id);
                        return {
                            ...n,
                            data: currentCard || n.data
                        };
                    });
                    setGraphData({ nodes: restoredNodes, links: cached.links });
                    setIsGraphGenerating(false);
                    return;
                }
            }

            const db = EmbeddingService.getInstance();

            // 2. Create Topic Nodes
            const nodes: CustomNode[] = group.items.map(card => ({
                id: card.id,
                label: card.word,
                meaning: card.meaning,
                type: 'topic',
                val: 20,
                group: 1,
                data: card
            }));

            const nodeIdMap = new Map(nodes.map(n => [n.label.toLowerCase(), n.id]));

            // 3. Fetch Context Nodes (Unlearned, Related)
            let contextNodes: CustomNode[] = [];
            try {
                const decks = await getAllDecks();
                const targetDeck = decks.find(d => d.name === deckName) || decks.find(d => d.name.includes('专八')) || decks.find(d => d.id === 'vocabulary-book');

                if (targetDeck) {
                    const allCards = await getAllCards(targetDeck.id);
                    const groupWordSet = new Set(groupWords.map(w => w.toLowerCase()));

                    // Candidates: New words NOT in current group
                    const candidates = allCards.filter(c =>
                        c.state === State.New && !groupWordSet.has(c.word.toLowerCase())
                    );

                    // Find top 15 related context words
                    const relatedWords = await db.findContextWords(groupWords, 15, candidates.map(c => c.word));

                    relatedWords.forEach(w => {
                        const card = candidates.find(c => c.word.toLowerCase() === w.toLowerCase());
                        if (card) {
                            contextNodes.push({
                                id: card.id,
                                label: card.word,
                                meaning: card.meaning,
                                type: 'context',
                                val: 12,
                                group: 2,
                                data: card
                            });
                            nodeIdMap.set(w.toLowerCase(), card.id);
                        }
                    });
                }
            } catch (e) {
                console.error("Failed to fetch context nodes", e);
            }

            const allNodes = [...nodes, ...contextNodes];
            const allWords = allNodes.map(n => n.label);

            // 4. Compute Internal Connections (Real-time)
            const allConnections = await db.computeGroupConnections(allWords, 0.6);

            const simplifiedLinks: any[] = [];
            const linkSet = new Set<string>();
            const getLinkKey = (a: string, b: string) => [a, b].sort().join(':');

            allWords.forEach(word => {
                const w = word.toLowerCase();
                const myConnections = allConnections.filter(c => c.source === w || c.target === w);
                myConnections.sort((a, b) => b.similarity - a.similarity);

                // Limit: Topic nodes 4, Context nodes 2
                const isTopic = nodes.some(n => n.label.toLowerCase() === w);
                const limit = isTopic ? 4 : 2;

                const topK = myConnections.slice(0, limit);

                topK.forEach(conn => {
                    const key = getLinkKey(conn.source, conn.target);
                    if (!linkSet.has(key)) {
                        linkSet.add(key);
                        const sourceId = nodeIdMap.get(conn.source);
                        const targetId = nodeIdMap.get(conn.target);

                        if (sourceId && targetId) {
                            simplifiedLinks.push({
                                source: sourceId,
                                target: targetId,
                                label: '',
                                similarity: conn.similarity
                            });
                        }
                    }
                });
            });

            // 5. Check Persistence & Generate Missing Labels
            const linksWithLabels = [...simplifiedLinks];

            // Load stored connections
            if (!forceRefresh) {
                const sourceWords = new Set(simplifiedLinks.map(l => {
                    const node = allNodes.find(n => n.id === l.source);
                    return node?.label.toLowerCase();
                }));

                const storedConnectionsMap = new Map<string, any>();

                await Promise.all(Array.from(sourceWords).map(async (word) => {
                    if (!word) return;
                    const stored = await getSemanticConnections(word);
                    if (stored) storedConnectionsMap.set(word, stored);
                }));

                linksWithLabels.forEach(link => {
                    const sourceLabel = allNodes.find(n => n.id === link.source)?.label;
                    const targetLabel = allNodes.find(n => n.id === link.target)?.label;

                    if (!sourceLabel || !targetLabel) return;

                    let foundLabel = '';
                    const storedSrc = storedConnectionsMap.get(sourceLabel.toLowerCase());
                    if (storedSrc) {
                        const conn = storedSrc.connections.find((c: any) => c.target === targetLabel.toLowerCase());
                        if (conn && conn.label) {
                            foundLabel = conn.label;
                            if (conn.example) link.example = conn.example;
                            if (conn.example_cn) link.example_cn = conn.example_cn;
                        }
                    }

                    if (!foundLabel) {
                        const storedTgt = storedConnectionsMap.get(targetLabel.toLowerCase());
                        if (storedTgt) {
                            const conn = storedTgt.connections.find((c: any) => c.target === sourceLabel.toLowerCase());
                            if (conn && conn.label) {
                                foundLabel = conn.label;
                                if (conn.example) link.example = conn.example;
                                if (conn.example_cn) link.example_cn = conn.example_cn;
                            }
                        }
                    }

                    if (foundLabel) {
                        link.label = foundLabel;
                    }
                });
            }

            // [REMOVED] Batch Generation (Step 6) - Now handled on-hover

            // [NEW] Synchronous Label Generation (Prioritize Colors)
            // User requested to wait for colors before rendering
            const missingLabelLinks = linksWithLabels.filter(l => !l.label && l.source && l.target);
            if (missingLabelLinks.length > 0 && apiKey) {
                const pairs = missingLabelLinks.map(l => {
                    const sNode = allNodes.find(n => n.id === l.source);
                    const tNode = allNodes.find(n => n.id === l.target);
                    return { source: sNode?.label || '', target: tNode?.label || '' };
                }).filter(p => p.source && p.target);

                try {
                    console.log('Generating labels for colors (waiting)...');
                    const labeledPairs = await generateEdgeLabelsOnly(pairs, apiKey);

                    // Update linksWithLabels
                    linksWithLabels.forEach(link => {
                        const sId = typeof link.source === 'object' ? link.source.id : link.source;
                        const tId = typeof link.target === 'object' ? link.target.id : link.target;
                        const sNode = allNodes.find(n => n.id === sId);
                        const tNode = allNodes.find(n => n.id === tId);

                        if (!sNode || !tNode) return;

                        const match = labeledPairs.find(p =>
                            (p.source === sNode.label && p.target === tNode.label) ||
                            (p.source === tNode.label && p.target === sNode.label)
                        );

                        if (match) {
                            link.label = match.label;
                        }
                    });
                } catch (err) {
                    console.error("Label generation failed, proceeding with default colors", err);
                }
            }

            setGraphData({ nodes: allNodes, links: linksWithLabels });

            await saveGroupGraphCache({
                id: cacheKey,
                nodes: allNodes,
                links: linksWithLabels,
                timestamp: Date.now()
            });
            console.log('Graph cached:', cacheKey);

        } finally {
            setIsGraphGenerating(false);
        }
    };

    /**
     * @description 更新复习模式下的知识网络
     * 使用全局知识网络中的局部位置 (Subgraph)
     */
    const updateGraphForContext = async (card: WordCard) => {
        // [NEW] Review Mode - Real-time AI Graph Generation
        if (apiKey) {
            setIsGraphGenerating(true);
            try {
                let relatedItems = [];

                // 1. Check L1 Cache
                if (aiCacheRef.current.has(card.word)) {
                    const cached = aiCacheRef.current.get(card.word);
                    if (cached !== 'fetching') {
                        relatedItems = cached;
                    } else {
                        // Wait for it? Or just proceed to fetch again (it will handle promise overlap if we used a promise cache, but here simple lock)
                        // For now, if fetching, we wait a bit or just let it finish and update? 
                        // Simplest: just await the generation function again, but we need to make sure we don't double call if we can help it.
                        // Actually, let's just call generate directly if cache is not ready, 
                        // but we should check DB first if L1 missed (in case prefetch didn't run).

                        // But wait, if it is 'fetching', we should probably wait for it. 
                        // But implementing a wait queue is complex. 
                        // Let's just try to fetch from DB/API again, assuming prefetch might be slow.
                    }
                }

                if (relatedItems.length === 0) {
                    // 2. Check L2 Cache (DB)
                    const dbCached = await getAIGraphCache(card.word);
                    if (dbCached && (Date.now() - dbCached.timestamp < 30 * 24 * 60 * 60 * 1000)) {
                        relatedItems = dbCached.relatedItems;
                        aiCacheRef.current.set(card.word, relatedItems);
                    }
                }

                if (relatedItems.length === 0) {
                    // 3. Fetch from API
                    relatedItems = await generateRelatedWords(card.word, apiKey);
                    if (relatedItems.length > 0) {
                        aiCacheRef.current.set(card.word, relatedItems);
                        await saveAIGraphCache({ word: card.word, relatedItems, timestamp: Date.now() });
                    }
                }

                // [Feature I] 老师模式主动讲解
                // This useEffect hook cannot be placed inside an async function.
                // Assuming it should be placed at the top level of the component.
                // The provided 'd' and '};' at the end of the useEffect block are syntactically incorrect
                // if placed inside this function or if '};' is meant to close this function.
                // I will place the useEffect at the top level of the component (outside this function)
                // and remove the trailing 'd' and '};' to maintain syntactic correctness.

                // Center Node
                const centerNode: CustomNode = {
                    id: card.id,
                    label: card.word,
                    meaning: card.meaning,
                    type: 'topic',
                    val: 45, // Prominent center
                    group: 1,
                    data: card
                };

                // Related Nodes (AI Generated)
                const relatedNodes: CustomNode[] = relatedItems.map((item: any) => ({
                    id: item.word, // Use word as ID for simplicity in this mode
                    label: item.word,
                    meaning: item.meaning,
                    type: 'related',
                    val: 20, // Smaller, secondary
                    group: 2,
                    // Create a minimal card data structure for compatibility
                    data: {
                        ...card,
                        id: item.word,
                        word: item.word,
                        meaning: item.meaning,
                        state: State.New // Treat as new for now
                    }
                }));

                const nodes = [centerNode, ...relatedNodes];

                // Links
                const links = relatedItems.map((item: any) => ({
                    source: card.id,
                    target: item.word,
                    label: item.relation, // Directly use AI provided relation
                    value: 1
                }));

                setGraphData({ nodes, links });

            } catch (e) {
                console.error("AI Graph Generation Failed, falling back to DB", e);
                // Fallback to DB logic below if AI fails
                await generateFromDB(card);
            } finally {
                setIsGraphGenerating(false);
            }
            return;
        }

        // Fallback: Local DB Logic (Original)
        await generateFromDB(card);
    };

    const generateFromDB = async (card: WordCard) => {
        const db = EmbeddingService.getInstance();
        // 1. 获取核心词的邻居 (Expanded to 12 for better local context)
        const neighbors = await db.getNeighbors(card.word);
        const contextNeighbors = neighbors.slice(0, 12);

        // 2. 准备所有涉及的单词列表
        const allCardsMap = new Map<string, WordCard>();
        allCardsMap.set(card.word.toLowerCase(), card);
        contextNeighbors.forEach(n => allCardsMap.set(n.card.word.toLowerCase(), n.card));

        const wordList = [card.word, ...contextNeighbors.map(n => n.card.word)];

        // 3. 获取子图结构 (包含所有节点间的连接)
        // 这将返回所有选中单词之间的相互连接，形成网状结构而非星型结构
        const subGraph = await db.getGraphForWords(wordList);

        // 4. 转换为 UI 节点 (使用 Card ID)
        const nodes: CustomNode[] = [];

        // 确保中心词在节点列表中 (且样式突出)
        nodes.push({
            id: card.id,
            label: card.word,
            meaning: card.meaning,
            type: 'topic',
            val: 40, // Bigger for center
            group: 1,
            data: card
        });

        // 添加其他节点
        subGraph.nodes.forEach(n => {
            const lowerWord = n.id.toLowerCase(); // getGraphForWords returns word as id
            if (lowerWord === card.word.toLowerCase()) return; // Skip center (added above)

            const neighborCard = allCardsMap.get(lowerWord);
            if (neighborCard) {
                nodes.push({
                    id: neighborCard.id,
                    label: neighborCard.word,
                    meaning: neighborCard.meaning,
                    type: 'related',
                    val: 15,
                    group: 2,
                    data: neighborCard
                });
            }
        });

        // 5. 转换 Links (Word -> UUID)
        // subGraph.links use words as source/target
        const links = subGraph.links.map(link => {
            const sourceWord = (typeof link.source === 'object' ? (link.source as any).id : link.source).toLowerCase();
            const targetWord = (typeof link.target === 'object' ? (link.target as any).id : link.target).toLowerCase();

            const sourceCard = allCardsMap.get(sourceWord);
            const targetCard = allCardsMap.get(targetWord);

            if (sourceCard && targetCard) {
                return {
                    source: sourceCard.id,
                    target: targetCard.id,
                    value: link.value,
                    label: '' // Initially empty
                };
            }
            return null;
        }).filter(l => l !== null) as any[];

        // 6. 设置数据
        setGraphData({ nodes, links });

        // 7. 生成中心词连接的标签 (仅中心词)
        // 避免 API 调用过多，仅为直接连接生成解释
        const pairs = contextNeighbors.map(n => ({
            source: card.word,
            target: n.card.word
        }));

        if (pairs.length > 0 && apiKey) {
            generateEdgeLabels(pairs, apiKey).then(labeledPairs => {
                setGraphData(prev => {
                    if (!prev) return null;
                    const newLinks = prev.links.map(link => {
                        const srcId = typeof link.source === 'object' ? (link.source as any).id : link.source;
                        const tgtId = typeof link.target === 'object' ? (link.target as any).id : link.target;

                        const srcNode = prev.nodes.find(n => n.id === srcId);
                        const tgtNode = prev.nodes.find(n => n.id === tgtId);

                        if (!srcNode || !tgtNode) return link;

                        // Check if this link matches any labeled pair
                        const match = labeledPairs.find(p =>
                            (p.source.toLowerCase() === srcNode.label.toLowerCase() && p.target.toLowerCase() === tgtNode.label.toLowerCase()) ||
                            (p.source.toLowerCase() === tgtNode.label.toLowerCase() && p.target.toLowerCase() === srcNode.label.toLowerCase())
                        );

                        return match ? { ...link, label: match.label, example: match.example } : link;
                    });
                    return { ...prev, links: newLinks };
                });
            });
        }
    };



    // Resize observer
    useEffect(() => {
        if (!containerRef.current) return;
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                console.log('ResizeObserver:', entry.contentRect.width, entry.contentRect.height);
                setDimensions({
                    width: entry.contentRect.width,
                    height: entry.contentRect.height
                });
            }
        });
        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, [mode]);

    // Enter Level
    const handleEnterLevel = async (level: CurriculumLevel) => {
        if (level.status === 'locked') return;

        setCurrentLevel(level);
        setMode('session');

        // Prepare Graph Data
        const decks = await getAllDecks();
        const targetDeck = decks.find(d => d.name.includes('专八')) || decks.find(d => d.id === 'vocabulary-book');
        if (!targetDeck) return;

        const treeRoot = await getLevelDetail(targetDeck.id, level);
        if (!treeRoot) return;

        // Force-Directed Layout Setup
        const hierarchyRoot = d3.hierarchy(treeRoot);

        // Flatten to Graph Data (No fixed coordinates, let force engine handle layout)
        const nodes: CustomNode[] = [];
        const links: any[] = [];

        hierarchyRoot.descendants().forEach((d) => {
            const data = d.data as any;
            const parentData = d.parent?.data as any;

            nodes.push({
                id: data.id,
                label: data.label,
                meaning: data.meaning,
                type: data.type,
                val: data.type === 'root' ? 30 : (data.type === 'topic' ? 20 : 10),
                group: data.type === 'root' ? 0 : (data.type === 'topic' ? 1 : 2),
                data: data.data, // Contains WordCard
                parentId: parentData?.id,
                parentLabel: parentData?.label
                // No fx/fy, dynamic layout
            });

            if (d.parent) {
                links.push({
                    source: d.parent.data.id,
                    target: d.data.id
                });
            }
        });

        setGraphData({ nodes, links });

        // Prepare Learning Queues (SessionItem[])
        const learningNodes = nodes.filter(n => n.type === 'topic' || n.type === 'related');
        const initialQueue: SessionItem[] = learningNodes.map(n => ({
            card: n.data!, // Ensure data is present
            type: 'learn',
            nodeId: n.id
        }));
        setQueue(initialQueue);

        // Filter links for Topic -> Related connections
        const learningLinks = links.filter(l => {
            const source = nodes.find(n => n.id === l.source);
            const target = nodes.find(n => n.id === l.target);
            return (source?.type === 'topic' && target?.type === 'related');
        });
        setConnectionQueue(learningLinks);

        setPhase('overview');
        setCurrentConnectionIndex(0);
        setCompletedNodeIds(new Set());
        setSessionStats({ correct: 0, total: 0, startTime: Date.now() });
    };

    const handleStartLearning = () => {
        playClickSound();
        setPhase('word-learning');
    };

    // 智能聚焦核心逻辑 (Composition-Aware Framing + Elastic Zoom)
    const smartFocus = useCallback((nodesToFit: any[], duration = 1000, padding = 100) => {
        if (!graphRef.current || nodesToFit.length === 0) return;

        // 1. 计算包围盒 (Bounding Box)
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        nodesToFit.forEach(n => {
            if (Number.isFinite(n.x) && Number.isFinite(n.y)) {
                minX = Math.min(minX, n.x);
                maxX = Math.max(maxX, n.x);
                minY = Math.min(minY, n.y);
                maxY = Math.max(maxY, n.y);
            }
        });

        if (minX === Infinity) return;

        const bboxW = maxX - minX;
        const bboxH = maxY - minY;
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        // 2. 计算最佳缩放 (Elastic Adaptive Zoom)
        // [MODIFIED] Dynamic Panel Obstruction Calculation
        // Calculate the actual obstructed area based on card position
        const isDesktop = dimensions.width > 768;
        let panelWidth = 0;
        let panelX = 0;

        if (mode === 'session' && phase === 'word-learning') {
            if (cardPosition) {
                // If card is moved, use its actual position
                // Assuming card width is roughly 450px (matches Flashcard default/min)
                // If card is roughly centered, x is offset. 
                // But Flashcard uses x/y as transform from 0,0 (top-left) if using absolute positioning?
                // Flashcard uses relative position with x/y transform. 
                // If initialPosition is set, it renders at that x/y.
                // We'll assume the card covers from x to x + 500.
                panelX = cardPosition.x;
                panelWidth = 500;
            } else {
                // Default position (usually centered or left-aligned depending on layout)
                // If standard layout, panel is on the left.
                panelWidth = (isDesktop) ? 520 : 0;
            }
        }

        // Calculate Safe Zone (Area NOT covered by card)
        // If card is on the left (x < width/2), safe zone is to the right.
        // If card is on the right, safe zone is to the left.
        const isCardOnLeft = panelX < dimensions.width / 2;

        // 计算剩余可用空间的尺寸
        // Simple heuristic: subtract panel width from total width
        const availableW = Math.max(dimensions.width - panelWidth - padding * 2, 100);
        const availableH = dimensions.height - padding * 2;

        const safeW = Math.max(bboxW, 1);
        const safeH = Math.max(bboxH, 1);

        // 目标缩放
        let targetZoom = Math.min(availableW / safeW, availableH / safeH);
        targetZoom = Math.min(Math.max(targetZoom, 0.8), 5);

        if (nodesToFit.length === 1) {
            targetZoom = Math.max(targetZoom, 3.5);
        }

        // 3. 构图感知运镜 (Composition-Aware Framing)
        // Calculate Center of Safe Zone
        let safeZoneCenter = dimensions.width / 2;

        if (mode === 'session' && phase === 'word-learning') {
            if (isCardOnLeft) {
                // Card on left, safe zone is [PanelEnd, ScreenWidth]
                const panelEnd = (cardPosition ? panelX + panelWidth : panelWidth);
                safeZoneCenter = panelEnd + (dimensions.width - panelEnd) / 2;
            } else {
                // Card on right, safe zone is [0, PanelStart]
                const panelStart = (cardPosition ? panelX : dimensions.width - panelWidth);
                safeZoneCenter = panelStart / 2;
            }
        }

        // Screen Offset
        const screenOffset = safeZoneCenter - (dimensions.width / 2);

        // New Camera X
        const newCameraX = centerX - (screenOffset / targetZoom);

        graphRef.current.centerAt(newCameraX, centerY, duration);
        graphRef.current.zoom(targetZoom, duration);
    }, [dimensions, cardPosition, mode, phase]);

    // Focus Effect (Smart Zoom with Right-Side Bias)
    useEffect(() => {
        if (!graphRef.current || !graphData) return;

        if (phase === 'word-learning' && currentItem) {
            // Find active node and neighbors
            const nodes = graphData.nodes.filter(n =>
                n.id === currentItem.nodeId || activeNeighborIds.has(n.id)
            );
            // 使用新版智能聚焦
            smartFocus(nodes, 1200, 120);
        } else if (phase === 'connection-learning' && connectionQueue[currentConnectionIndex]) {
            const link = connectionQueue[currentConnectionIndex];
            const sId = typeof link.source === 'object' ? link.source.id : link.source;
            const tId = typeof link.target === 'object' ? link.target.id : link.target;
            const nodes = graphData.nodes.filter(n => n.id === sId || n.id === tId);
            smartFocus(nodes, 1200, 150);
        } else if (phase === 'overview') {
            // Overview: Show everything, slightly centered
            setTimeout(() => {
                if (graphRef.current) {
                    graphRef.current.zoomToFit(1000, 50);
                }
            }, 200);
        }
    }, [phase, currentItem, currentConnectionIndex, activeNeighborIds, graphData, smartFocus]);

    // Configure Force Simulation
    useEffect(() => {
        if (graphRef.current) {
            // Configure physics
            graphRef.current.d3Force('charge')?.strength(-150);
            graphRef.current.d3Force('link')?.distance(70);
            // Re-heat simulation if data changes (handled by warmupTicks, but good to ensure)
            graphRef.current.d3ReheatSimulation();
        }
    }, [graphData, mode]);

    // --- Interleaved Learning Logic ---

    const updateCardInQueue = (updatedCard: WordCard) => {
        setQueue(prev => prev.map(item =>
            item.card.id === updatedCard.id
                ? { ...item, card: updatedCard }
                : item
        ));
    };

    const handleUpdateCard = async (updatedCard: WordCard) => {
        await saveCard(updatedCard);
        updateCardInQueue(updatedCard);
        if (onUpdateCard) {
            await onUpdateCard(updatedCard);
        }
        return updatedCard;
    };

    // Handlers for Flashcard generators
    const handleGenerateExample = async (card: WordCard) => {
        if (!apiKey) { alert("请配置 API Key"); return undefined; }
        try {
            const { example, exampleMeaning } = await generateExample(card.word, apiKey);
            const updatedCard = { ...card, example, exampleMeaning };
            await handleUpdateCard(updatedCard);
            return updatedCard;
        } catch (e) { return undefined; }
    };
    // ... (We can implement other generators similarly, or pass them)
    // For brevity, I will implement the key ones used in Flashcard

    const handleGenerateMnemonic = async (card: WordCard) => {
        if (!apiKey) { alert("请配置 API Key"); return undefined; }
        try {
            const mnemonic = await generateMnemonic(card.word, apiKey);
            const updatedCard = { ...card, mnemonic };
            await handleUpdateCard(updatedCard);
            return updatedCard;
        } catch (e) { return undefined; }
    };

    const handleGenerateMeaning = async (card: WordCard) => {
        if (!apiKey) { alert("请配置 API Key"); return undefined; }
        try {
            // Parallel generation for Meaning and Roots
            const [meaningData, roots] = await Promise.all([
                generateMeaning(card.word, apiKey),
                generateRoots(card.word, apiKey)
            ]);

            const { meaning, partOfSpeech } = meaningData;
            const updatedCard = { ...card, meaning, partOfSpeech, roots };
            await handleUpdateCard(updatedCard);
            return updatedCard;
        } catch (e) { return undefined; }
    };

    const handleEnrich = async (card: WordCard) => {
        if (!apiKey) { alert("请配置 API Key"); return undefined; }
        setIsEnriching(true);
        try {
            const data = await enrichWord(card.word, apiKey);
            const updatedCard = { ...card, ...data };
            await handleUpdateCard(updatedCard);
            return updatedCard;
        } catch (e) { return undefined; } finally { setIsEnriching(false); }
    };

    // Learning Flow Handlers

    // 1. Learn -> Choice
    const handleKnow = useCallback(() => {
        playKnowSound();
        lastActivityRef.current = Date.now(); // 更新活动时间

        // [NEW] 连击检测
        const newCombo = comboCount + 1;
        setComboCount(newCombo);

        if (newCombo >= 3) {
            // 连击 3 次及以上 → 疯狂庆祝
            mascotEventBus.say(
                getMascotDialogue('streak', { streak: newCombo }),
                'combo'
            );
        } else {
            // 普通开心
            const speed = Date.now() - cardLoadedTimeRef.current < 2000 ? 'fast' : 'slow';
            mascotEventBus.say(
                getMascotDialogue('correct', { streak: newCombo, speed }),
                speed === 'fast' ? 'surprised' : 'happy'
            );
        }

        // Trigger "Light Up" animation
        if (currentItem) {
            setJustLearnedNodeId(currentItem.nodeId);
            setTimeout(() => setJustLearnedNodeId(null), 1000);
        }

        setQueue(prev => {
            const [current, ...rest] = prev;
            const insertIndex = Math.min(rest.length, 3);
            const newItem: SessionItem = { ...current, type: 'choice' };
            const newQueue = [...rest];
            newQueue.splice(insertIndex, 0, newItem);
            return newQueue;
        });
    }, [comboCount, currentItem]);

    // 2. Learn -> Learn (Loop / 不认识)
    const handleLoop = () => {
        playFailSound();
        lastActivityRef.current = Date.now();

        // [NEW] 答错 → 伤心
        mascotEventBus.say(
            getMascotDialogue('incorrect'),
            'sad'
        );
        setComboCount(0); // 重置连击

        setQueue(prev => {
            const [first, ...rest] = prev;
            return [...rest, first];
        });
    };

    // Choice Logic
    // Generate Options
    const generateOptions = useCallback((correctCard: WordCard) => {
        // Use cards from graphData (all cards in this level)
        if (!graphData) return [correctCard];

        const allCards = graphData.nodes
            .filter(n => n.data && n.data.id !== correctCard.id)
            .map(n => n.data as WordCard);

        let pool = allCards;
        if (pool.length < 3) {
            while (pool.length < 3 && pool.length > 0) pool = [...pool, ...pool];
        }
        if (pool.length === 0) return [correctCard];

        const shuffled = [...pool].sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, 3);
        const options = [...selected, correctCard].sort(() => 0.5 - Math.random());
        return options;
    }, [graphData]);

    // [NEW] Mascot Greeting for New Words (Feature G)
    useEffect(() => {
        if (currentItem?.type === 'learn') {
            cardLoadedTimeRef.current = Date.now();

            // [Feature I] 老师模式：始终讲解 (无论是新词还是复习词)
            if (isTeacherMode) {
                mascotEventBus.requestExplanation(currentItem.card.word, {
                    meaning: currentItem.card.meaning
                });
            }
            // 如果不是老师模式，仅在新词时打招呼
            else if (currentItem.card.state === State.New) {
                mascotEventBus.say(
                    getMascotDialogue('greeting'),
                    'happy'
                );
            }
        }
    }, [currentItem, isTeacherMode]);

    useEffect(() => {
        if (currentItem?.type === 'choice') {
            setChoiceOptions(generateOptions(currentItem.card));
            setChoiceResult(null);
            setSelectedChoiceId(null);
            speak(currentItem.card.word);
        }
    }, [currentItem, generateOptions]);

    const handleChoiceSelect = useCallback((selectedCard: WordCard) => {
        if (choiceResult || !currentItem) return;
        setSelectedChoiceId(selectedCard.id);

        if (selectedCard.id === currentItem.card.id) {
            setChoiceResult('correct');
            playPassSound();
            if (!isTeacherMode) {
                mascotEventBus.say(
                    getMascotDialogue('correct', { streak: comboCount }),
                    'happy'
                );
            }
            // Stats update for correct choice? Maybe keep it simple and track total completion
            setTimeout(() => {
                setQueue(prev => {
                    const [current, ...rest] = prev;
                    const newItem: SessionItem = { ...current, type: 'test' }; // Move to Spelling
                    const insertIndex = Math.min(rest.length, 2);
                    const newQueue = [...rest];
                    newQueue.splice(insertIndex, 0, newItem);
                    return newQueue;
                });
            }, 800);
        } else {
            setChoiceResult('incorrect');
            playFailSound();
            if (!isTeacherMode) {
                mascotEventBus.say(
                    getMascotDialogue('incorrect'),
                    'thinking'
                );
            }
            setSessionStats(prev => ({ ...prev, total: prev.total + 1 })); // Wrong attempt counts as part of total
            setTimeout(() => {
                setQueue(prev => {
                    const [current, ...rest] = prev;
                    const newItem: SessionItem = { ...current, type: 'learn' }; // Back to Learn
                    const insertIndex = Math.min(rest.length, 2);
                    const newQueue = [...rest];
                    newQueue.splice(insertIndex, 0, newItem);
                    return newQueue;
                });
            }, 1500);
        }
    }, [choiceResult, currentItem]);

    // [User Request]: Number key selection for Choice Mode
    useEffect(() => {
        if (currentItem?.type !== 'choice' || choiceResult) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            const num = parseInt(e.key);
            if (!isNaN(num) && num >= 1 && num <= choiceOptions.length) {
                e.preventDefault();
                handleChoiceSelect(choiceOptions[num - 1]);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentItem, choiceResult, choiceOptions]);

    // Test Logic (Spelling)
    useEffect(() => {
        if (currentItem?.type === 'test' && inputRef.current) {
            setInputValue('');
            setTestResult(null);
            setTimeout(() => {
                inputRef.current?.focus();
                speak(currentItem.card.word);
            }, 100);
        }
    }, [currentItem]);

    // [User Request] Auto-submit when length matches
    useEffect(() => {
        if (currentItem?.type === 'test' && inputValue && currentItem.card.word) {
            if (inputValue.length === currentItem.card.word.length) {
                handleCheckSpelling(inputValue);
            }
        }
    }, [inputValue, currentItem]);

    const handleCheckSpelling = async (overrideValue?: string) => {
        const checkValue = typeof overrideValue === 'string' ? overrideValue : inputValue;
        if (!checkValue.trim() || !currentItem) return;
        const isCorrect = checkValue.trim().toLowerCase() === currentItem.card.word.toLowerCase();

        if (isCorrect) {
            setIsCardFlipped(false); // 翻回正面

            // 播放单词发音
            if (currentItem.card.pronunciation && currentItem.card.audio) {
                // TODO: Play Audio
            }

            // [NEW] 答对 -> 开心 / 连击
            const newCombo = comboCount + 1;
            setComboCount(newCombo);

            if (!isTeacherMode) {
                mascotEventBus.say(
                    getMascotDialogue(newCombo >= 3 ? 'streak' : 'correct', { streak: newCombo }),
                    newCombo >= 3 ? 'combo' : 'happy'
                );
            }

            setTestResult('correct');
            playSpellingSuccessSound();
            // mascotEventBus.say( // This was moved above
            //     getMascotDialogue(comboCount >= 3 ? 'streak' : 'correct', { streak: comboCount }),
            //     comboCount >= 3 ? 'combo' : 'happy'
            // );

            // Mark as Completed (but don't advance yet)
            setCompletedNodeIds(prev => new Set(prev).add(currentItem.nodeId));

            // Only rate if first time correct? For simplicity, we rate every time they submit correctly.
            // Or maybe check if we already rated? 
            // For now, let's allow re-rating or just assume it's fine.
            setSessionStats(prev => ({ ...prev, correct: prev.correct + 1, total: prev.total + 1 }));

            // If FSRS handler is provided (Session Mode), call it
            // If FSRS handler is provided (Session Mode), call it
            if (onRate) {
                // [FIX]: Do not await this. Let it run in background.
                // alert("[DEBUG] Triggering Save..."); // Debug
                onRate(currentItem.card, Rating.Good).catch(e => {
                    console.error(e);
                    alert("保存失败: " + e.message);
                });
            } else {
                alert("Error: onRate handler missing!");
            }

            // Update Connections in background
            EmbeddingService.getInstance().updateConnections(currentItem.card.word).catch(console.error);

            // [User Request] Auto-submit and Jump
            setTimeout(() => {
                setQueue(prev => {

                    // If test is passed, remove it or move to next logic?
                    // Usually if passed, we are done with this word for this session loop?
                    // Or check if we have more steps? Current flow: Learn -> Choice -> Test -> Done.
                    // So we should remove it from queue.

                    // If using session groups, we might want to advance to next word in group?
                    // Logic: queue.slice(1)

                    // However, the 'handleNextWord' does slice(1).
                    return prev.slice(1);
                });
                setInputValue('');
                setTestResult(null);
            }, 1000); // 1s delay to see the "Correct" green state
        } else {
            setTestResult('incorrect');
            playFailSound();
            mascotEventBus.say(
                getMascotDialogue('incorrect'),
                'determined'
            );
            setSessionStats(prev => ({ ...prev, total: prev.total + 1 }));

            // Auto-reset for incorrect answer after delay? 
            // User wants repetitive practice, so maybe just let them clear it?
            // But if incorrect, usually we want to show the right answer then let them try again or move back to learn.
            // Current logic sends back to learn after 2s.
            setTimeout(() => {
                setQueue(prev => {
                    const [current, ...rest] = prev;
                    const newItem: SessionItem = { ...current, type: 'learn' }; // Back to Learn
                    const insertIndex = Math.min(rest.length, 2);
                    const newQueue = [...rest];
                    newQueue.splice(insertIndex, 0, newItem);
                    return newQueue;
                });
                setInputValue('');
                setTestResult(null);
            }, 2000);
        }
    };

    const handleNextWord = useCallback(() => {
        setQueue(prev => prev.slice(1));
        setInputValue('');
        setTestResult(null);
    }, []);

    const handleRetrySpelling = useCallback(() => {
        setInputValue('');
        setTestResult(null);
        setTimeout(() => inputRef.current?.focus(), 100);
    }, []);

    // Check Phase Completion
    useEffect(() => {
        if (phase === 'word-learning' && queue.length === 0 && graphData) {
            playSuccessSound();

            // Auto-advance to next group if available
            if (sessionGroups && sessionGroups.length > 0) {
                // Find next group with unlearned words
                let nextIndex = activeGroupIndex + 1;
                let foundNext = false;

                while (nextIndex < sessionGroups.length) {
                    const group = sessionGroups[nextIndex];
                    // Check against completedNodeIds instead of stale group item state
                    const hasUnlearned = group.items.some(c => !completedNodeIds.has(c.id));
                    if (hasUnlearned) {
                        foundNext = true;
                        break;
                    }
                    nextIndex++;
                }

                if (foundNext) {
                    setActiveGroupIndex(nextIndex);
                    loadGroupQueue(nextIndex);
                    setPhase('overview'); // Show overview for next group
                } else {
                    // All groups completed
                    if (connectionQueue.length > 0) {
                        setPhase('connection-learning');
                    } else {
                        playSessionCompleteSound();
                        setPhase('summary');
                    }
                }
            } else {
                // Single session completed
                if (connectionQueue.length > 0) {
                    setPhase('connection-learning');
                } else {
                    playSessionCompleteSound();
                    setPhase('summary');
                }
            }
        }
    }, [queue, phase, graphData, sessionGroups, activeGroupIndex, completedNodeIds, connectionQueue.length]);

    const handleNextConnection = () => {
        if (currentConnectionIndex < connectionQueue.length - 1) {
            setCurrentConnectionIndex(prev => prev + 1);
            playClickSound();
        } else {
            playSuccessSound();
            setPhase('summary');
        }
    };

    // --- Render Helpers ---

    // [OPTIMIZED] Memoized Graph Handlers
    const handleNodeCanvas = useCallback((node: any, ctx: CanvasRenderingContext2D) => {
        if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;

        const label = node.label;

        // State Flags
        const isCompleted = completedNodeIds.has(node.id);
        const isActive = currentItem?.nodeId === node.id;
        const isNeighbor = activeNeighborIds.has(node.id);
        const isJustLearned = justLearnedNodeId === node.id;
        const isHighlighted = highlightedNeighborId === node.id;
        const isHovered = hoveredNode === node;
        const isContext = node.type === 'context'; // [NEW] Context Node

        // Check if this node is a neighbor of the hovered node
        let isHoveredNeighbor = false;
        if (hoveredNode && hoveredNode !== node) {
            isHoveredNeighbor = graphData?.links.some((link: any) => {
                const sId = typeof link.source === 'object' ? link.source.id : link.source;
                const tId = typeof link.target === 'object' ? link.target.id : link.target;
                return (sId === hoveredNode.id && tId === node.id) ||
                    (sId === node.id && tId === hoveredNode.id);
            }) || false;
        }

        const isRelevant = isActive || isNeighbor || isHovered || isHoveredNeighbor || isHighlighted || isJustLearned || isCompleted || isContext;

        // 1. Ghost Mode (Inactive but Visible)
        // [User Request]: Show unselected words as inactive/ghost nodes with visible word balls and labels.
        if (!isRelevant) {
            // [FIX]: Dimmed Ghost Mode (Waiting to be lit up)
            // User requested "gray/dim mode" for unselected words.

            const ghostR = Math.sqrt(node.val || 1) * 1.2; // Slightly reduced size (was 2.0)

            ctx.save(); // Protect context
            ctx.globalAlpha = 0.4; // Low opacity (Dimmed)

            // 1. Very Subtle Glow (Just to separate from background)
            const ghostGlowRadius = ghostR * 1.5;
            const ghostGradient = ctx.createRadialGradient(node.x, node.y, ghostR * 0.2, node.x, node.y, ghostGlowRadius);
            ghostGradient.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
            ghostGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

            ctx.beginPath();
            ctx.arc(node.x, node.y, ghostGlowRadius, 0, 2 * Math.PI, false);
            ctx.fillStyle = ghostGradient;
            ctx.fill();

            // 2. Ghost Body (Gray/Glassy)
            ctx.beginPath();
            ctx.arc(node.x, node.y, ghostR, 0, 2 * Math.PI, false);
            ctx.fillStyle = 'rgba(200, 200, 200, 0.15)'; // Very faint gray
            ctx.strokeStyle = 'rgba(200, 200, 200, 0.3)'; // Faint stroke
            ctx.lineWidth = 1; // Thin line
            ctx.fill();
            ctx.stroke();

            // 3. Ghost Label (Subtle but readable)
            if (true) {
                const fontSize = 12; // Standard font size
                ctx.font = `${fontSize}px Sans-Serif`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = 'rgba(220, 220, 220, 0.5)'; // Dimmed white text
                // No strong shadow, just a faint outline for contrast if needed
                ctx.shadowColor = 'rgba(0,0,0,0.5)';
                ctx.shadowBlur = 2;
                ctx.fillText(label, node.x + ghostR + 4, node.y);
            }

            ctx.restore();
            // Return early since we handled the drawing for this node
            return;
        }

        // Dynamic Depth of Field (DoF)
        const isFocused = phase === 'overview' || isActive || isCompleted || isNeighbor || isJustLearned || isHighlighted || isHovered || isHoveredNeighbor;
        const dofScale = isFocused ? 1 : (isContext ? 0.6 : 0.6);

        const r = Math.sqrt(node.val || 1) * dofScale;

        // Neighbor Color Logic
        let neighborRelationColor: string | null = null;
        if (isNeighbor && currentItem?.nodeId) {
            const link = graphData?.links.find((l: any) => {
                const sId = typeof l.source === 'object' ? l.source.id : l.source;
                const tId = typeof l.target === 'object' ? l.target.id : l.target;
                return (sId === currentItem.nodeId && tId === node.id) ||
                    (sId === node.id && tId === currentItem.nodeId);
            });
            if (link && link.label) {
                const lbl = link.label.toLowerCase();
                if (lbl.includes('近义') || lbl.includes('synonym')) neighborRelationColor = '#4ade80';
                else if (lbl.includes('反义') || lbl.includes('antonym')) neighborRelationColor = '#f87171';
                else if (lbl.includes('派生') || lbl.includes('derivative')) neighborRelationColor = '#a78bfa';
                else if (lbl.includes('形似') || lbl.includes('look-alike')) neighborRelationColor = '#facc15';
                else if (lbl.includes('搭配') || lbl.includes('collocation')) neighborRelationColor = '#60a5fa';
                else if (lbl.includes('场景') || lbl.includes('scenario')) neighborRelationColor = '#22d3ee';
                else if (lbl.includes('相关') || lbl.includes('related') || lbl.includes('关联')) neighborRelationColor = '#94a3b8';
                else neighborRelationColor = '#cbd5e1';
            }
        }

        const time = Date.now();
        const pulse = (Math.sin(time * 0.003) + 1) / 2;
        const breathingScale = 1 + pulse * 0.2;

        const finalScale = (isJustLearned || isHighlighted) ? breathingScale * 1.5 : breathingScale;

        // Visibility Logic
        const isVisible = isFocused || (isContext);
        const opacity = isVisible ? 1 : 0.1;

        ctx.save();
        ctx.globalAlpha = opacity;

        if (isActive || isJustLearned || isHighlighted || isHovered || isHoveredNeighbor) {
            const baseColor = isActive ? '#ffffff' : (isHighlighted ? '#facc15' : ((isHovered || isHoveredNeighbor) ? '#60a5fa' : '#10b981'));
            const glowColor = isActive ? 'rgba(255, 255, 255, 0.5)' : (isHighlighted ? 'rgba(250, 204, 21, 0.5)' : ((isHovered || isHoveredNeighbor) ? 'rgba(96, 165, 250, 0.5)' : 'rgba(16, 185, 129, 0.4)'));

            // Halo
            const haloScale = (isHoveredNeighbor) ? 0.7 : 1.0;
            const haloRadius = r * 5 * finalScale * haloScale;
            const haloGradient = ctx.createRadialGradient(node.x, node.y, r, node.x, node.y, haloRadius);
            haloGradient.addColorStop(0, glowColor);
            haloGradient.addColorStop(1, 'rgba(0,0,0,0)');

            ctx.beginPath();
            ctx.arc(node.x, node.y, haloRadius, 0, 2 * Math.PI, false);
            ctx.fillStyle = haloGradient;
            ctx.fill();

            // Ripple
            if (isActive || isHighlighted || isHovered) {
                const rippleRadius = r * 3 * (1 + (Math.sin(time * 0.002) + 1) * 0.3);
                ctx.beginPath();
                ctx.arc(node.x, node.y, rippleRadius, 0, 2 * Math.PI, false);
                const rippleColor = isActive ? '255, 255, 255' : (isHighlighted ? '250, 204, 21' : '96, 165, 250');
                ctx.strokeStyle = `rgba(${rippleColor}, ${0.6 - (Math.sin(time * 0.002) + 1) * 0.3})`;
                ctx.lineWidth = 1;
                ctx.stroke();

                const rippleRadius2 = r * 2 * (1 + (Math.cos(time * 0.002) + 1) * 0.2);
                ctx.beginPath();
                ctx.arc(node.x, node.y, rippleRadius2, 0, 2 * Math.PI, false);
                ctx.strokeStyle = `rgba(${rippleColor}, ${0.5 - (Math.cos(time * 0.002) + 1) * 0.2})`;
                ctx.lineWidth = 0.5;
                ctx.stroke();
            }

            // Mid Glow
            const glowRadius = r * 3;
            const glowGradient = ctx.createRadialGradient(node.x, node.y, r * 0.5, node.x, node.y, glowRadius);
            const midGlowColor = isActive ? 'rgba(255, 255, 255, 0.8)' : (isHighlighted ? 'rgba(250, 204, 21, 0.6)' : ((isHovered || isHoveredNeighbor) ? 'rgba(96, 165, 250, 0.6)' : 'rgba(52, 211, 153, 0.6)'));
            glowGradient.addColorStop(0, midGlowColor);
            glowGradient.addColorStop(1, 'rgba(0,0,0,0)');

            ctx.beginPath();
            ctx.arc(node.x, node.y, glowRadius, 0, 2 * Math.PI, false);
            ctx.fillStyle = glowGradient;
            ctx.fill();

            // Core Orb
            const coreRadius = r * 1.5;
            const coreGradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, coreRadius);
            coreGradient.addColorStop(0, '#ffffff');
            const coreMidColor = isActive ? '#f8fafc' : (isHighlighted ? '#fde047' : ((isHovered || isHoveredNeighbor) ? '#bfdbfe' : '#6ee7b7'));
            coreGradient.addColorStop(0.3, coreMidColor);
            coreGradient.addColorStop(0.7, baseColor);
            coreGradient.addColorStop(1, 'rgba(0,0,0,0)');

            ctx.beginPath();
            ctx.arc(node.x, node.y, coreRadius, 0, 2 * Math.PI, false);
            ctx.fillStyle = coreGradient;
            ctx.fill();
        } else {
            // Standard Rendering
            let color = '#94a3b8';
            if (isContext) {
                color = '#cbd5e1'; // Light Gray for Context
            } else if (isNeighbor) {
                color = neighborRelationColor || '#ffffff';
            } else if (isCompleted) {
                color = '#ec4899';
            } else if (node.type === 'root') {
                color = '#f472b6';
            } else if (node.type === 'topic') {
                color = '#6366f1';
            }

            // Shadow
            if (isNeighbor) {
                ctx.shadowColor = neighborRelationColor || 'rgba(255, 255, 255, 0.6)';
                ctx.shadowBlur = 30;
            } else if (isCompleted) {
                ctx.shadowBlur = 20;
                ctx.shadowColor = color;
            } else if (phase === 'overview') {
                ctx.shadowBlur = 10;
                ctx.shadowColor = color;
            } else {
                ctx.shadowBlur = 0;
            }

            // Draw Node
            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);

            const gradient = ctx.createRadialGradient(node.x, node.y, r * 0.1, node.x, node.y, r);
            gradient.addColorStop(0, '#ffffff');
            gradient.addColorStop(0.4, color);
            gradient.addColorStop(1, color);
            ctx.fillStyle = gradient;
            ctx.fill();

            ctx.shadowBlur = 0;

            // Rings
            if (isNeighbor) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, r + 4, 0, 2 * Math.PI, false);
                ctx.strokeStyle = neighborRelationColor || 'rgba(255, 255, 255, 0.4)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }

        // Draw Label
        if (true) { // Always show if relevant
            const fontSize = isActive ? 12 : (node.type === 'root' ? 10 : (node.type === 'topic' ? 8 : 6));

            ctx.font = `${(isCompleted || isActive || isHighlighted) ? 'bold ' : ''}${fontSize}px Sans-Serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';

            if (isNeighbor || isActive || isJustLearned || isHighlighted) {
                ctx.fillStyle = (isHighlighted) ? '#facc15' : ((isNeighbor && neighborRelationColor) ? neighborRelationColor : '#ffffff');
                ctx.shadowColor = (isHighlighted) ? '#facc15' : ((isNeighbor && neighborRelationColor) ? neighborRelationColor : 'rgba(255, 255, 255, 0.6)');
                ctx.shadowBlur = 4;
            } else if (isContext) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'; // Faint text for context
                ctx.shadowBlur = 0;
            } else {
                ctx.fillStyle = isCompleted ? '#fff' : 'rgba(255, 255, 255, 0.7)';
                ctx.shadowBlur = 0;
            }

            ctx.fillText(label, node.x + r + 8, node.y);
        }

        ctx.restore();
    }, [completedNodeIds, activeNeighborIds, currentItem, justLearnedNodeId, highlightedNeighborId, hoveredNode, graphData, phase]);

    const handleLinkCanvas = useCallback((link: any, ctx: CanvasRenderingContext2D) => {
        const source = link.source;
        const target = link.target;

        if (!source || !target || typeof source !== 'object' || typeof target !== 'object') return;
        if (!Number.isFinite(source.x) || !Number.isFinite(source.y) || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return;

        const isActiveConnection = currentItem?.nodeId === source.id || currentItem?.nodeId === target.id;
        const isHoveredConnection = hoveredNode && (source.id === hoveredNode.id || target.id === hoveredNode.id);

        const isInFocus = isActiveConnection || isHoveredConnection;

        const sourceVisible = completedNodeIds.has(source.id) || activeNeighborIds.has(source.id) || currentItem?.nodeId === source.id;
        const targetVisible = completedNodeIds.has(target.id) || activeNeighborIds.has(target.id) || currentItem?.nodeId === target.id;
        const isStructurallyVisible = isActiveConnection || (sourceVisible && targetVisible);

        const isContextConnection = source.type === 'context' || target.type === 'context';

        // Opacity Calculation
        let opacity = 0.05;

        if (isInFocus) {
            opacity = isActiveConnection || isHoveredConnection ? 1 : 0.8;
        } else if (isStructurallyVisible) {
            opacity = 0.15;
        } else if (isContextConnection) {
            opacity = 0.02; // Very faint for context connections
        }

        const time = Date.now();
        if (isActiveConnection) {
            const pulse = (Math.sin(time * 0.002) + 1) / 2;
            const breathingOpacity = 0.6 + pulse * 0.4;
            ctx.globalAlpha = breathingOpacity;
        } else {
            ctx.globalAlpha = opacity;
        }

        // Color Logic
        const getRelationColor = (lbl: string) => {
            if (!lbl) return null;
            const l = lbl.toLowerCase();
            if (l.includes('近义') || l.includes('synonym')) return '#4ade80';
            if (l.includes('反义') || l.includes('antonym')) return '#f87171';
            if (l.includes('派生') || l.includes('derivative')) return '#a78bfa';
            if (l.includes('形似') || l.includes('look-alike')) return '#facc15';
            if (l.includes('搭配') || l.includes('collocation')) return '#60a5fa';
            if (l.includes('场景') || l.includes('scenario')) return '#22d3ee';
            if (l.includes('相关') || l.includes('related') || l.includes('关联')) return '#94a3b8';
            return null;
        };

        const relationColor = getRelationColor(link.label);

        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);

        const gradient = ctx.createLinearGradient(source.x, source.y, target.x, target.y);

        if (relationColor) {
            gradient.addColorStop(0, relationColor);
            gradient.addColorStop(1, relationColor);
        } else {
            const getColor = (node: any) => {
                if (currentItem?.nodeId === node.id) return '#ffffff';
                if (activeNeighborIds.has(node.id)) return '#ffffff';
                if (completedNodeIds.has(node.id)) return '#ec4899';
                if (node.type === 'context') return '#94a3b8'; // Context color
                return '#64748b';
            };
            gradient.addColorStop(0, getColor(source));
            gradient.addColorStop(1, getColor(target));
        }

        ctx.strokeStyle = gradient;

        if (isInFocus) {
            if (isActiveConnection) {
                const pulse = (Math.sin(time * 0.003) + 1) / 2;
                const breathingWidth = 2.5 + pulse * 1.5;
                ctx.lineWidth = breathingWidth;
                ctx.shadowColor = relationColor || '#ffffff';
                ctx.shadowBlur = 20;
            } else if (isHoveredConnection) {
                ctx.lineWidth = 2.5;
                ctx.shadowColor = relationColor || '#60a5fa';
                ctx.shadowBlur = 15;
            }
        } else {
            ctx.lineWidth = isContextConnection ? 0.5 : 1; // Thinner for context
            ctx.shadowBlur = 0;
        }

        ctx.stroke();
        ctx.globalAlpha = 1; // Reset
    }, [currentItem, hoveredNode, completedNodeIds, activeNeighborIds]);

    const handleLinkHover = useCallback((link: any) => {
        if (isHoveringCard) {
            setHoveredLink(null);
            return;
        }
        if (link) {
            setHoveredLink(link);
        } else {
            setHoveredLink(null);
        }
    }, [isHoveringCard]);

    const handleNodeHover = useCallback((node: any) => {
        if (isHoveringCard) {
            setHoveredNode(null);
            return;
        }
        setHoveredNode(node);
    }, [isHoveringCard]);

    const renderMap = () => (
        <div className="w-full h-full overflow-y-auto p-8 pb-32 relative scroll-smooth">
            <div className="max-w-2xl mx-auto space-y-8 relative">
                {/* Title */}
                <div className="text-center mb-12">
                    <h1 className="text-3xl font-bold text-white mb-2 flex items-center justify-center gap-3">
                        <MapIcon className="w-8 h-8 text-blue-400" />
                        <span>学习地图</span>
                    </h1>
                    <p className="text-blue-200/60">当前课程: {deckName} | {levels.length} 个关卡</p>
                </div>

                {/* Path Line */}
                <div className="absolute left-1/2 top-32 bottom-0 w-1 bg-white/10 -translate-x-1/2 rounded-full" />

                {/* Levels */}
                {levels.map((level, index) => {
                    const isLeft = index % 2 === 0;
                    const isLocked = level.status === 'locked';

                    return (
                        <motion.div
                            key={level.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className={cn(
                                "relative flex items-center gap-8",
                                isLeft ? "flex-row" : "flex-row-reverse"
                            )}
                        >
                            <div className={cn(
                                "flex-1 p-4 rounded-xl border backdrop-blur-md transition-all duration-300 cursor-pointer group",
                                isLocked
                                    ? "bg-white/5 border-white/5 opacity-50 grayscale"
                                    : "bg-gradient-to-br from-blue-500/10 to-purple-500/10 border-white/20 hover:border-blue-400/50 hover:shadow-[0_0_30px_rgba(59,130,246,0.2)]"
                            )}
                                onClick={() => !isLocked && handleEnterLevel(level)}
                            >
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="text-lg font-bold text-white mb-1 group-hover:text-blue-300 transition-colors">
                                            {level.title}
                                        </h3>
                                        <p className="text-xs text-white/50">
                                            包含 {level.wordIds.length} 个关联词汇
                                        </p>
                                    </div>
                                    {isLocked ? <Lock className="w-5 h-5 text-white/20" /> : <Unlock className="w-5 h-5 text-green-400" />}
                                </div>
                            </div>
                            <div className={cn(
                                "w-4 h-4 rounded-full border-2 z-10 transition-colors",
                                isLocked ? "bg-slate-900 border-white/20" : "bg-blue-500 border-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                            )} />
                            <div className="flex-1" />
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );

    const handleSemanticNeighborClick = useCallback((word: string) => {
        if (!graphData || !graphRef.current) return;
        // Robust finding: exact label, case-insensitive label, or data.word
        const node = graphData.nodes.find(n =>
            n.label === word ||
            n.label?.toLowerCase() === word.toLowerCase() ||
            (n.data as WordCard)?.word === word
        );

        if (node && node.x !== undefined && node.y !== undefined) {
            // Just jump to the node in the graph, do not switch the card
            // [MODIFIED] Use smartFocus for consistent framing
            smartFocus([node], 1500, 120);
        }
    }, [graphData, smartFocus]);

    const handleFSRSRate = async (rating: Rating) => {
        if (!currentItem || !onRate) return;

        // Play sound
        if (rating === Rating.Again) playFailSound();
        else playPassSound();

        // Mark as completed in graph if Good/Easy
        if (rating !== Rating.Again) {
            setCompletedNodeIds(prev => new Set(prev).add(currentItem.nodeId));
            setSessionStats(prev => ({ ...prev, correct: prev.correct + 1 }));

            // [NEW] Mascot Happy Reaction
            setMascotReaction('happy');
            setTimeout(() => setMascotReaction('idle'), 2000);
        }

        // Update total
        setSessionStats(prev => ({ ...prev, total: prev.total + 1 }));

        try {
            // Call external handler
            await onRate(currentItem.card, rating);
        } catch (e) {
            console.error("Failed to save rating", e);
            // Proceed to remove from queue even if save fails to prevent blocking user
        }

        // Remove from queue (Review cards don't loop in session usually, unless Again?)
        // For now, remove to keep it simple. If Again, FSRS schedules it for <1min, 
        // but we might not re-show it in this exact session queue unless we re-fetch.
        setQueue(prev => prev.slice(1));
    };

    const handleCardPositionChange = useCallback((data: { point: { x: number; y: number }; transform: { x: number; y: number } }) => {
        if (!graphRef.current) return;

        const { point, transform } = data;

        // [MODIFIED] Composition-Aware Pan based on Card Dragging
        // 获取当前焦点锚点 (如果存在当前节点，以此为基准；否则默认为 (0,0))
        const currentNode = graphData?.nodes.find(n => n.id === currentItem?.nodeId);
        const anchorX = currentNode?.x || 0;
        const anchorY = currentNode?.y || 0;

        const currentZoom = graphRef.current.zoom();
        const W = window.innerWidth;
        const CARD_WIDTH = 520; // 估算值，对应 max-w-xl

        // 动态计算安全区域中心 (Safe Zone Center)
        let safeCenter;
        if (point.x < W / 2) {
            // 卡片在左，留白在右 -> 视口中心应在右侧
            // 安全区从 [卡片右边缘, W]
            const leftEdge = point.x + CARD_WIDTH / 2;
            safeCenter = leftEdge + (W - leftEdge) / 2;
        } else {
            // 卡片在右，留白在左 -> 视口中心应在左侧
            // 安全区从 [0, 卡片左边缘]
            const rightEdge = point.x - CARD_WIDTH / 2;
            safeCenter = rightEdge / 2;
        }

        const screenDeltaX = safeCenter - W / 2;
        // Camera X = Anchor X - (ScreenDelta / Zoom)
        // 这样可以将 Anchor 节点放置在 SafeCenter 的位置
        const targetCenterX = anchorX - screenDeltaX / currentZoom;

        // 仅平滑移动 X 轴，保持 Y 轴和 Zoom 不变，响应拖拽
        graphRef.current.centerAt(targetCenterX, anchorY, 800);

        // Persist position
        setCardPosition(transform);
    }, [graphData, currentItem]);

    const renderSessionItem = () => {
        if (!currentItem) return null;

        // 1. Learn Mode (Flashcard)
        if (currentItem.type === 'learn') {
            // [MODIFIED] Strict Mode Logic
            // If sessionMode is 'review', treat all cards as review (Ghost Mode + FSRS)
            // If sessionMode is 'new', treat all cards as new (Learning + Know/Forgot)
            // If 'mixed', rely on card state.
            const isReview = sessionMode === 'review' ? true : (sessionMode === 'new' ? false : currentItem.card.state === State.Review);

            const reviewPreviews = isReview ? getReviewPreviews(currentItem.card) : undefined;

            // Calculate semantic neighbors for the card
            const neighbors = Array.from(activeNeighborIds).map(id => {
                const node = graphData?.nodes.find(n => n.id === id);
                if (!node || !node.data) return null;
                return node.data as WordCard;
            }).filter(Boolean) as WordCard[];

            return (
                <div className="w-full max-w-xl mx-auto h-[600px] relative perspective-1000">
                    <Flashcard
                        key={`learn-${currentItem.card.id}`}
                        card={currentItem.card}
                        alwaysShowContent={!isReview}
                        initialGhostMode={true} // [User Request] Always enable guided input (ghost mode) for both new and review
                        initialPosition={cardPosition}
                        isEnriching={isEnriching}
                        semanticNeighbors={neighbors}
                        onSemanticNeighborClick={handleSemanticNeighborClick}
                        onSemanticNeighborHover={(word) => setHighlightedNeighborId(word ? (graphData?.nodes.find(n => n.label === word)?.id || null) : null)}
                        onPositionChange={handleCardPositionChange}
                        onFlip={(val) => setIsCardFlipped(typeof val === 'boolean' ? val : true)}
                        onKnow={isReview ? undefined : handleKnow}
                        onForgot={isReview ? undefined : handleLoop}
                        onRate={isReview && onRate ? handleFSRSRate : undefined}
                        onEnrich={() => handleEnrich(currentItem.card)}
                        onUpdateCard={async (updatedCard) => {
                            // [FIX] ID Persistence Safeguard
                            if (!updatedCard.id && currentItem.card.id) {
                                console.warn("Fixed missing ID in updated card");
                                updatedCard.id = currentItem.card.id;
                            }

                            // 1. Call parent handler to save to DB
                            if (onUpdateCard) {
                                await onUpdateCard(updatedCard);
                            }

                            // 2. [User Request] Familiar Skip Logic
                            if (updatedCard.isFamiliar) {
                                playSuccessSound(); // Feedback
                                // Remove from queue immediately
                                setQueue(prev => prev.filter(item => item.card.id !== updatedCard.id));
                                // Also ensure we don't show it again if it was looping
                                return;
                            }

                            // 3. Normal Update (update local queue state)
                            setQueue(prev => prev.map(item =>
                                item.card.id === updatedCard.id
                                    ? { ...item, card: updatedCard }
                                    : item
                            ));
                        }}
                        onGenerateExample={handleGenerateExample}
                        onGenerateMnemonic={handleGenerateMnemonic}
                        onGenerateMeaning={handleGenerateMeaning}
                        onGeneratePhrases={async (c) => {
                            const phrases = await generatePhrases(c.word, apiKey);
                            const u = { ...c, phrases };
                            await handleUpdateCard(u);
                            return u;
                        }}
                        onGenerateDerivatives={async (c) => {
                            const derivatives = await generateDerivatives(c.word, apiKey);
                            const u = { ...c, derivatives };
                            await handleUpdateCard(u);
                            return u;
                        }}
                        onGenerateRoots={async (c) => {
                            const roots = await generateRoots(c.word, apiKey);
                            const u = { ...c, roots };
                            await handleUpdateCard(u);
                            return u;
                        }}
                        onGenerateSyllables={async (c) => {
                            const syllables = await generateSyllables(c.word, apiKey);
                            const u = { ...c, syllables };
                            await handleUpdateCard(u);
                            return u;
                        }}
                        onGenerateBridgingExample={async (c, targetWord, relation) => {
                            const result = await generateBridgingExample(c.word, targetWord, relation, apiKey);
                            const u = { ...c, example: result.example, exampleMeaning: result.exampleMeaning };
                            await handleUpdateCard(u);
                            return u;
                        }}
                    />

                    {/* FSRS Controls (Review Mode Only) */}
                    {isReview && isCardFlipped && onRate && (
                        <div className="absolute bottom-0 left-0 right-0 p-4 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
                            <ReviewControls
                                onRate={handleFSRSRate}
                                previews={reviewPreviews}
                            />
                        </div>
                    )}
                </div>
            );
        }

        // 2. Choice Mode
        if (currentItem.type === 'choice') {
            return (
                <motion.div
                    drag
                    dragMomentum={false}
                    initial={{
                        x: cardPosition?.x || 0,
                        y: cardPosition?.y || 0
                    }}
                    whileDrag={{ scale: 1.01, cursor: 'grabbing', zIndex: 100 }}
                    onDragEnd={(_, info) => {
                        const currentX = (cardPosition?.x || 0) + info.offset.x;
                        const currentY = (cardPosition?.y || 0) + info.offset.y;
                        handleCardPositionChange({ point: info.point, transform: { x: currentX, y: currentY } });
                    }}
                    style={{ x: cardPosition?.x, y: cardPosition?.y }}
                    className="w-full max-w-xl mx-auto h-[600px] relative perspective-1000 cursor-grab"
                >
                    <div className="relative w-full h-full flex flex-col p-6 md:p-8 overflow-hidden rounded-3xl border border-white/20 bg-white/10 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3)] transition-all duration-500 hover:border-white/30">
                        {/* Ambient Light Effects */}
                        <div className="absolute -top-20 -left-20 w-64 h-64 bg-blue-500/20 rounded-full blur-[100px] pointer-events-none" />
                        <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-purple-500/20 rounded-full blur-[100px] pointer-events-none" />

                        <div className="flex flex-col items-center justify-center h-full relative z-10 w-full">
                            <div className="text-center w-full max-w-sm">
                                <div className="mb-8">
                                    <div className="text-sm text-white/40 mb-2">请选择正确的释义</div>
                                    <h2 className="text-4xl font-bold text-white mb-4">{currentItem.card.word}</h2>
                                    <div className="flex justify-center gap-2">
                                        <span className="text-sm px-2 py-0.5 rounded-full bg-white/10 text-white/60">
                                            {currentItem.card.partOfSpeech}
                                        </span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); speak(currentItem.card.word); }}
                                            className="p-1 rounded-full bg-white/5 hover:bg-white/10 text-blue-400 transition-colors"
                                        >
                                            <Volume2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-3 w-full">
                                    {choiceOptions.map((option, index) => {
                                        const isSelected = selectedChoiceId === option.id;
                                        const isCorrect = option.id === currentItem.card.id;

                                        let statusClass = "bg-black/20 border-white/10 hover:bg-white/5";
                                        if (choiceResult) {
                                            if (isCorrect) statusClass = "bg-green-500/20 border-green-500/50 text-green-200";
                                            else if (isSelected && !isCorrect) statusClass = "bg-red-500/20 border-red-500/50 text-red-200";
                                            else statusClass = "opacity-50 bg-black/20 border-white/5";
                                        }

                                        return (
                                            <button
                                                key={option.id}
                                                onClick={() => handleChoiceSelect(option)}
                                                disabled={!!choiceResult}
                                                className={cn(
                                                    "relative w-full p-4 rounded-xl border text-left transition-all duration-200 flex items-center gap-3 group",
                                                    statusClass
                                                )}
                                            >
                                                <span className={cn(
                                                    "flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold border transition-colors",
                                                    choiceResult && isCorrect ? "border-green-500 bg-green-500 text-black" :
                                                        choiceResult && isSelected && !isCorrect ? "border-red-500 bg-red-500 text-white" :
                                                            "border-white/20 text-white/40 group-hover:border-white/40"
                                                )}>
                                                    {index + 1}
                                                </span>
                                                <span className="flex-1 line-clamp-2 text-sm">
                                                    {option.meaning}
                                                </span>
                                                {choiceResult && isCorrect && <Check className="w-5 h-5 text-green-400" />}
                                                {choiceResult && isSelected && !isCorrect && <X className="w-5 h-5 text-red-400" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            );
        }

        // 3. Test Mode (Spelling)
        if (currentItem.type === 'test') {
            return (
                <motion.div
                    drag
                    dragMomentum={false}
                    initial={{
                        x: cardPosition?.x || 0,
                        y: cardPosition?.y || 0
                    }}
                    whileDrag={{ scale: 1.01, cursor: 'grabbing', zIndex: 100 }}
                    onDragEnd={(_, info) => {
                        const currentX = (cardPosition?.x || 0) + info.offset.x;
                        const currentY = (cardPosition?.y || 0) + info.offset.y;
                        handleCardPositionChange({ point: info.point, transform: { x: currentX, y: currentY } });
                    }}
                    style={{ x: cardPosition?.x, y: cardPosition?.y }}
                    className="w-full max-w-xl mx-auto h-[600px] relative perspective-1000 cursor-grab"
                >
                    <div className="relative w-full h-full flex flex-col p-6 md:p-8 overflow-hidden rounded-3xl border border-white/20 bg-white/10 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3)] transition-all duration-500 hover:border-white/30">
                        {/* Ambient Light Effects */}
                        <div className="absolute -top-20 -left-20 w-64 h-64 bg-blue-500/20 rounded-full blur-[100px] pointer-events-none" />
                        <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-purple-500/20 rounded-full blur-[100px] pointer-events-none" />

                        <div className="flex flex-col items-center justify-center h-full relative z-10 w-full">
                            <div className="text-center w-full max-w-xs">
                                <div className="mb-8">
                                    <div className="text-sm text-white/40 mb-2">请拼写出该单词</div>
                                    <div className="text-2xl font-bold text-white/90 mb-4 line-clamp-3">
                                        {currentItem.card.meaning || '暂无释义'}
                                    </div>
                                </div>

                                <button
                                    onClick={() => speak(currentItem.card.word)}
                                    className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mb-8 mx-auto hover:bg-blue-500/20 border border-blue-500/20 transition-all duration-300 group"
                                >
                                    <Volume2 className="w-8 h-8 text-blue-400 group-hover:scale-110 transition-transform" />
                                </button>

                                <div className="relative w-full mb-10 min-h-[80px] flex items-center justify-center">
                                    {/* Input Visualization (Slots) - Clean & Liquid */}
                                    <div className="relative z-10 flex flex-wrap justify-center gap-2">
                                        {currentItem.card.word.split('').map((_, i) => {
                                            const userChar = inputValue[i];
                                            const isActive = i === inputValue.length;
                                            const isFilled = !!userChar;

                                            return (
                                                <motion.div
                                                    key={i}
                                                    layout
                                                    initial={false}
                                                    animate={{
                                                        scale: isActive ? 1.15 : 1,
                                                        y: isActive ? -8 : 0,
                                                        filter: isActive ? 'drop-shadow(0 0 8px rgba(59,130,246,0.5))' : 'none'
                                                    }}
                                                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                                                    className={cn(
                                                        "w-12 h-16 rounded-xl flex items-center justify-center text-3xl font-bold font-mono transition-all duration-300 relative overflow-hidden",
                                                        "backdrop-blur-md",
                                                        testResult === 'correct' ? "bg-green-500/20 border-2 border-green-400 text-green-400" :
                                                            testResult === 'incorrect' ? "bg-red-500/20 border-2 border-red-400 text-red-400" :
                                                                isActive ? "bg-blue-500/20 border-2 border-blue-400 text-white" :
                                                                    isFilled ? "bg-white/10 border border-white/30 text-white" :
                                                                        "bg-white/5 border border-white/10 text-white/20"
                                                    )}
                                                >
                                                    {userChar || ''}
                                                    {isActive && (
                                                        <motion.div
                                                            layoutId="cursor"
                                                            className="absolute bottom-2 w-6 h-1 bg-blue-400 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.8)]"
                                                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                                        />
                                                    )}
                                                    {/* Subtle sheen for glass effect */}
                                                    <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                                                </motion.div>
                                            );
                                        })}
                                    </div>

                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={inputValue}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            // Limit input length to word length (optional, but good for UI)
                                            if (val.length <= currentItem.card.word.length) {
                                                setInputValue(val);
                                            }
                                            // [User Request]: Auto-submit for Spelling Test is requested again.
                                            if (val.length === currentItem.card.word.length) {
                                                // Pass val directly because state update is async
                                                handleCheckSpelling(val);
                                            }
                                        }}
                                        onKeyDown={(e) => e.key === 'Enter' && !testResult && handleCheckSpelling()}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-text font-mono z-20"
                                        autoFocus
                                        autoComplete="off"
                                        disabled={testResult === 'correct'}
                                    />

                                    {testResult === 'incorrect' && (
                                        <div className="absolute -bottom-16 left-0 right-0 text-center animate-in slide-in-from-top-2 fade-in duration-300">
                                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/10 border border-red-500/20 text-red-300 text-sm backdrop-blur-md shadow-lg">
                                                <X className="w-4 h-4" />
                                                <span>正确答案: <span className="font-bold font-mono tracking-widest ml-1 text-red-200">{currentItem.card.word}</span></span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {testResult === 'correct' ? (
                                    <div className="flex gap-3 w-full animate-in slide-in-from-bottom-4 fade-in duration-300">
                                        <button
                                            onClick={handleRetrySpelling}
                                            className="flex-1 py-3.5 rounded-xl font-bold text-lg bg-white/10 hover:bg-white/20 text-white border border-white/10 transition-all duration-300"
                                        >
                                            <RotateCcw className="w-5 h-5 mx-auto" />
                                        </button>
                                        <button
                                            onClick={handleNextWord}
                                            className="flex-[3] py-3.5 rounded-xl font-bold text-lg bg-green-600 hover:bg-green-500 text-white shadow-[0_0_20px_rgba(34,197,94,0.3)] hover:shadow-[0_0_30px_rgba(34,197,94,0.5)] transition-all duration-300 flex items-center justify-center gap-2 group"
                                        >
                                            <span>下一个</span>
                                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => handleCheckSpelling()}
                                        disabled={!inputValue.trim()}
                                        className={cn(
                                            "w-full py-3.5 rounded-xl font-bold text-lg transition-all duration-300 relative overflow-hidden group",
                                            "disabled:opacity-50 disabled:cursor-not-allowed",
                                            inputValue.trim()
                                                ? "bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)] hover:scale-[1.02]"
                                                : "bg-white/10 text-white/40 border border-white/5"
                                        )}
                                    >
                                        <span className="relative z-10">提交</span>
                                        {inputValue.trim() && (
                                            <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12" />
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </motion.div>
            );
        }
    };

    // Background image from settings (synced with homepage)
    const [backgroundImage, setBackgroundImage] = useState<string>('');
    useEffect(() => {
        try {
            const saved = localStorage.getItem('glass-settings');
            if (saved) {
                const settings = JSON.parse(saved);
                if (settings.backgroundImage) {
                    setBackgroundImage(settings.backgroundImage);
                }
            }
        } catch (e) { /* ignore */ }
    }, []);

    return (
        <div
            className="fixed inset-0 text-white overflow-hidden flex flex-col z-50"
            style={backgroundImage ? {
                backgroundImage: `url(${backgroundImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundAttachment: 'fixed',
                backgroundRepeat: 'no-repeat'
            } : {}}
        >
            {/* 高斯模糊背景层 - 学习/复习时激活 */}
            {(phase === 'word-learning' || phase === 'connection-learning') && (
                <div className="absolute inset-0 backdrop-blur-md bg-black/30 z-0 transition-all duration-500" />
            )}

            {/* Header - Glass Style */}
            <header className="h-16 border-b border-white/10 flex items-center px-6 bg-white/5 backdrop-blur-xl z-10">
                <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors mr-4">
                    <ArrowLeft className="w-5 h-5 text-white/70" />
                </button>
                <div>
                    <h1 className="font-bold flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-yellow-400" />
                        引导式学习
                    </h1>
                    <p className="text-xs text-white/40">{currentLevel?.title || "选择关卡"}</p>
                </div>
                <div className="flex-1" />
                <div className="flex items-center gap-4 mr-4">
                    {/* [Feature I] 老师模式开关 */}
                    <button
                        onClick={() => {
                            const newValue = !isTeacherMode;
                            setIsTeacherMode(newValue);
                            mascotEventBus.setTeacherMode(newValue);
                            mascotEventBus.say(newValue ? "老师模式已开启！" : "老师模式已关闭", newValue ? "happy" : "slight_smile");
                        }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-300 ${isTeacherMode
                            ? "bg-yellow-500/20 border-yellow-500/50 text-yellow-300 shadow-[0_0_15px_rgba(234,179,8,0.3)]"
                            : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white/60"
                            }`}
                        title="开启/关闭老师讲解模式"
                    >
                        <span className="text-lg">👓</span>
                        <span className="text-xs font-bold">讲解模式</span>
                        <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${isTeacherMode ? "bg-yellow-500" : "bg-white/20"}`}>
                            <div className={`w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${isTeacherMode ? "translate-x-4" : "translate-x-0"}`} />
                        </div>
                    </button>
                </div>
                {mode === 'session' && (
                    <div className="flex items-center gap-4">
                        {/* Regenerate Button */}
                        {phase === 'word-learning' && sessionGroups && sessionGroups[activeGroupIndex] && (
                            <button
                                onClick={() => {
                                    if (window.confirm("确定要重新生成当前组的关联关系吗？这可能需要一些时间。")) {
                                        const group = sessionGroups[activeGroupIndex];
                                        updateGraphForGroup(group, true); // Force refresh
                                    }
                                }}
                                className="p-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/30 backdrop-blur-md text-white/60 hover:text-white hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] transition-all duration-300 group"
                                title="重新生成联系"
                            >
                                <RotateCcw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-700" />
                            </button>
                        )}

                        {phase === 'word-learning' && groupLabel && (
                            <div className="px-3 py-1 rounded-full bg-blue-500/20 text-xs font-bold text-blue-300 border border-blue-500/30 flex items-center gap-1">
                                <Target className="w-3 h-3" />
                                {sessionGroups && sessionGroups.length > 0 && (
                                    <span className="mr-1 pr-1 border-r border-blue-400/30 font-mono">
                                        {activeGroupIndex + 1}/{sessionGroups.length}
                                    </span>
                                )}
                                {groupLabel}
                            </div>
                        )}
                        <div className="px-3 py-1 rounded-full bg-white/5 text-xs font-mono text-white/60">
                            {phase === 'word-learning' ? `剩余 ${queue.length} 个` :
                                phase === 'connection-learning' ? `关联 ${currentConnectionIndex + 1}/${connectionQueue.length}` :
                                    phase === 'overview' ? '总览' : '完成'}
                        </div>
                    </div>
                )}
            </header>

            {/* Content */}
            <div className="flex-1 relative overflow-hidden">

                {/* Legend (Top Right) - 默认隐藏，悬浮显示 */}
                <div className="absolute right-6 top-6 z-20 group">
                    {/* 悬浮触发器 */}
                    <div className="bg-slate-900/40 backdrop-blur-md border border-white/10 rounded-lg px-3 py-2 text-xs text-white/50 cursor-pointer
                        group-hover:opacity-0 group-hover:scale-95 transition-all duration-300">
                        图例 ℹ️
                    </div>
                    {/* 完整图例 */}
                    <div className="absolute right-0 top-0 bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-xl p-4 text-xs
                        opacity-0 scale-95 pointer-events-none select-none
                        group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto
                        transition-all duration-300 origin-top-right">
                        <h3 className="text-white/40 font-bold mb-3 uppercase tracking-wider text-[10px]">关系图例 Legend</h3>
                        <div className="space-y-2.5">
                            <div className="flex items-center gap-2.5">
                                <span className="w-2 h-2 rounded-full bg-[#4ade80] shadow-[0_0_8px_rgba(74,222,128,0.6)]"></span>
                                <span className="text-white/80">近义 (Synonym)</span>
                            </div>
                            <div className="flex items-center gap-2.5">
                                <span className="w-2 h-2 rounded-full bg-[#f87171] shadow-[0_0_8px_rgba(248,113,113,0.6)]"></span>
                                <span className="text-white/80">反义 (Antonym)</span>
                            </div>
                            <div className="flex items-center gap-2.5">
                                <span className="w-2 h-2 rounded-full bg-[#a78bfa] shadow-[0_0_8px_rgba(167,139,250,0.6)]"></span>
                                <span className="text-white/80">派生 (Derivative)</span>
                            </div>
                            <div className="flex items-center gap-2.5">
                                <span className="w-2 h-2 rounded-full bg-[#facc15] shadow-[0_0_8px_rgba(250,204,21,0.6)]"></span>
                                <span className="text-white/80">形似 (Look-alike)</span>
                            </div>
                            <div className="flex items-center gap-2.5">
                                <span className="w-2 h-2 rounded-full bg-[#60a5fa] shadow-[0_0_8px_rgba(96,165,250,0.6)]"></span>
                                <span className="text-white/80">搭配 (Collocation)</span>
                            </div>
                            <div className="flex items-center gap-2.5">
                                <span className="w-2 h-2 rounded-full bg-[#22d3ee] shadow-[0_0_8px_rgba(34,211,238,0.6)]"></span>
                                <span className="text-white/80">场景 (Scenario)</span>
                            </div>
                            <div className="flex items-center gap-2.5">
                                <span className="w-2 h-2 rounded-full bg-[#94a3b8] shadow-[0_0_8px_rgba(148,163,184,0.6)]"></span>
                                <span className="text-white/80">关联 (Related)</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Left: Learning Panel (Floating Overlay) */}
                <div className={cn(
                    "absolute left-4 top-4 bottom-4 z-10 transition-all duration-500 ease-out flex flex-col pointer-events-none",
                    mode === 'map' ? "-translate-x-[120%] opacity-0" : "translate-x-0 opacity-100",
                    "w-full max-w-[520px] md:max-w-[580px]"
                )}>
                    <div
                        className="w-full h-full pointer-events-auto flex flex-col items-center justify-center"
                        onMouseEnter={() => setIsHoveringCard(true)}
                        onMouseLeave={() => setIsHoveringCard(false)}
                    >
                        <AnimatePresence mode="wait">
                            {phase === 'overview' && (
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    className="text-center max-w-md bg-slate-900/50 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl p-8"
                                >
                                    <BrainCircuit className="w-24 h-24 text-blue-500 mx-auto mb-6" />
                                    <h2 className="text-3xl font-bold text-white mb-4">
                                        {sessionGroups && sessionGroups.length > 0
                                            ? `准备开始第 ${activeGroupIndex + 1} 组: ${sessionGroups[activeGroupIndex]?.label}`
                                            : "准备好了吗？"}
                                    </h2>
                                    <p className="text-white/60 mb-8">
                                        本组包含 {queue.length} 个核心词汇。<br />
                                        {sessionGroups && sessionGroups.length > 0
                                            // [MODIFIED] Clearer Group Progress Indicator
                                            ? <span className="text-blue-300 font-bold mt-2 block bg-blue-500/10 py-1 px-3 rounded-full w-fit mx-auto border border-blue-500/20">
                                                当前进度: 第 {activeGroupIndex + 1} / {sessionGroups.length} 组
                                            </span>
                                            : "我们将通过思维导图引导你探索它们的联系。"}
                                    </p>
                                    <div className="flex flex-col gap-3 w-full max-w-xs mx-auto">
                                        <button
                                            onClick={handleStartLearning}
                                            className="w-full py-4 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-lg shadow-blue-500/20 transition-all hover:scale-105"
                                        >
                                            开始探索
                                        </button>
                                        {sessionGroups && activeGroupIndex < sessionGroups.length - 1 && (
                                            <button
                                                onClick={() => {
                                                    const next = activeGroupIndex + 1;
                                                    setActiveGroupIndex(next);
                                                    loadGroupQueue(next);
                                                }}
                                                className="w-full py-2 rounded-full bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/80 text-sm font-bold transition-all"
                                            >
                                                跳过本组
                                            </button>
                                        )}
                                    </div>
                                </motion.div>
                            )}

                            {phase === 'word-learning' && (
                                <motion.div
                                    key={currentItem?.card.id || 'empty'}
                                    initial={{ opacity: 0, x: 50 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -50 }}
                                    className="w-full"
                                >
                                    {renderSessionItem()}
                                </motion.div>
                            )}

                            {phase === 'connection-learning' && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="w-full max-w-md text-center"
                                >
                                    <div className="mb-8">
                                        <h3 className="text-xl font-bold text-white mb-2">关联回顾</h3>
                                        <p className="text-white/50">观察右侧地图，理解单词间的联系</p>
                                    </div>

                                    <div className="p-6 rounded-xl bg-white/5 border border-white/10 mb-8">
                                        {connectionQueue[currentConnectionIndex] && (() => {
                                            const link = connectionQueue[currentConnectionIndex];
                                            const source = graphData?.nodes.find(n => n.id === (typeof link.source === 'object' ? link.source.id : link.source));
                                            const target = graphData?.nodes.find(n => n.id === (typeof link.target === 'object' ? link.target.id : link.target));
                                            return (
                                                <div className="flex items-center justify-center gap-4 text-lg">
                                                    <span className="font-bold text-yellow-400">{source?.label}</span>
                                                    <ArrowLeft className="w-5 h-5 text-white/30 rotate-180" />
                                                    <span className="font-bold text-green-400">{target?.label}</span>
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    <button
                                        onClick={handleNextConnection}
                                        className="px-8 py-3 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 transition-colors"
                                    >
                                        {currentConnectionIndex < connectionQueue.length - 1 ? "下一个关联" : "完成学习"}
                                    </button>
                                </motion.div>
                            )}

                            {phase === 'summary' && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="w-full max-w-lg"
                                >
                                    <GlassPanel className="p-8" variant="dark">
                                        <div className="text-center mb-8">
                                            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-green-500/30">
                                                <Star className="w-10 h-10 text-white fill-white" />
                                            </div>

                                            {/* 吉祥物庆祝 */}
                                            <div className="flex justify-center mb-6">
                                                <InteractiveMascot
                                                    size={120}
                                                    reaction="combo"
                                                    skinId={loadMascotConfig().skinId}
                                                />
                                            </div>

                                            <h2 className="text-3xl font-bold text-white mb-2">关卡完成！</h2>
                                            <p className="text-white/60">思维网络已建立</p>
                                        </div>

                                        {/* Stats Grid */}
                                        <div className="grid grid-cols-2 gap-4 mb-8">
                                            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                                                <div className="flex items-center gap-2 text-white/60 text-xs mb-1">
                                                    <Target className="w-3 h-3" /> 准确率
                                                </div>
                                                <div className="text-2xl font-bold text-white">
                                                    {sessionStats.total > 0 ? Math.round((sessionStats.correct / sessionStats.total) * 100) : 0}%
                                                </div>
                                            </div>
                                            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                                                <div className="flex items-center gap-2 text-white/60 text-xs mb-1">
                                                    <Clock className="w-3 h-3" /> 用时
                                                </div>
                                                <div className="text-2xl font-bold text-white">
                                                    {Math.floor((Date.now() - sessionStats.startTime) / 1000 / 60)}分
                                                    {Math.floor((Date.now() - sessionStats.startTime) / 1000 % 60)}秒
                                                </div>
                                            </div>
                                        </div>

                                        {/* Word Grid (Mini Map) */}
                                        <div className="mb-8">
                                            <h3 className="text-sm font-bold text-white/80 mb-3 flex items-center gap-2">
                                                <MapIcon className="w-4 h-4" /> 掌握词汇
                                            </h3>
                                            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                                {Array.from(completedNodeIds).map(id => {
                                                    const node = graphData?.nodes.find(n => n.id === id);
                                                    if (!node || !node.data) return null;
                                                    return (
                                                        <div key={id} className="px-2 py-1 rounded bg-green-500/20 border border-green-500/30 text-green-200 text-xs">
                                                            {node.label}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => {
                                                if (cards) {
                                                    onBack();
                                                } else {
                                                    setMode('map');
                                                    setGraphData(null); // Clear graph to show level path
                                                    // Here we could unlock next level logic
                                                }
                                            }}
                                            className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] flex items-center justify-center gap-2"
                                        >
                                            <span>{cards ? "完成学习" : "返回地图"}</span>
                                            <ArrowRight className="w-5 h-5" />
                                        </button>
                                    </GlassPanel>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Right: Mind Map (Background Layer) */}
                <div className={cn(
                    "absolute inset-0 z-0 transition-all duration-500 ease-in-out w-full h-full"
                )} ref={containerRef}>
                    {graphData && (
                        <ForceGraph2D
                            ref={graphRef}
                            graphData={graphData}
                            width={dimensions.width} // Use container width directly (ResizeObserver handles the 50% logic)
                            height={dimensions.height}
                            warmupTicks={50}
                            cooldownTicks={100}
                            d3AlphaDecay={0.02}
                            d3VelocityDecay={0.3}
                            enableNodeDrag={true}

                            linkDirectionalParticleWidth={4}
                            linkDirectionalParticleColor={() => '#e0f2fe'} // [MODIFIED] Light Blue/White particles
                            nodeCanvasObject={handleNodeCanvas}
                            linkCanvasObject={handleLinkCanvas}
                            nodeLabel="meaning" // Show meaning on hover
                            onNodeHover={handleNodeHover}
                            onLinkHover={handleLinkHover}
                            nodeColor={(node: any) => {
                                if (currentItem?.nodeId === node.id) return '#ffffff'; // White (Active)
                                if (activeNeighborIds.has(node.id)) return '#ffffff'; // White (Neighbor base)
                                if (node.type === 'root') return '#ef4444';
                                if (node.type === 'topic') return '#f59e0b';
                                return '#10b981';
                            }}
                            nodeVal={(node: any) => node.val}

                            backgroundColor="rgba(0,0,0,0)"
                            onNodeClick={(node) => {
                                if (node.x && node.y && graphRef.current) {
                                    // [MODIFIED] Use smartFocus for consistent interaction
                                    smartFocus([node], 1000, 120);
                                }
                            }}
                            linkDirectionalParticles={(link: any) => {
                                const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
                                const targetId = typeof link.target === 'object' ? link.target.id : link.target;

                                // "Light Up" Animation: Burst particles from the learned node
                                if (justLearnedNodeId && (sourceId === justLearnedNodeId || targetId === justLearnedNodeId)) {
                                    return 3; // [MODIFIED] Reduced burst count from 6 to 3 to be less jarring
                                }

                                // [MODIFIED] Flowing Trajectory: Add subtle particles to completed connections
                                const isCompletedConnection = completedNodeIds.has(sourceId) && completedNodeIds.has(targetId);
                                if (isCompletedConnection) {
                                    return 1; // Single particle flowing along the path
                                }

                                return 0;
                            }}
                            linkDirectionalParticleSpeed={(link: any) => {
                                const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
                                const targetId = typeof link.target === 'object' ? link.target.id : link.target;
                                const isCompletedConnection = completedNodeIds.has(sourceId) && completedNodeIds.has(targetId);

                                return isCompletedConnection ? 0.002 : 0.005; // Slower, calm flow for history
                            }}
                        />
                    )}

                    {/* Connection Tooltip (Liquid Glass) */}
                    <AnimatePresence>
                        {hoveredLink && graphRef.current && (
                            (() => {
                                // Calculate position
                                const source = typeof hoveredLink.source === 'object' ? hoveredLink.source : graphData?.nodes.find(n => n.id === hoveredLink.source);
                                const target = typeof hoveredLink.target === 'object' ? hoveredLink.target : graphData?.nodes.find(n => n.id === hoveredLink.target);

                                if (!source || !target || typeof source.x !== 'number' || typeof target.x !== 'number') return null;

                                // Check generation status
                                const linkId = `${source.id}-${target.id}`;
                                const isGenerating = generatingLinks.has(linkId);

                                // Only show if we have an example OR are generating it
                                if (!hoveredLink.example && !isGenerating) return null;

                                const mx = (source.x + target.x) / 2;
                                const my = (source.y + target.y) / 2;
                                const coords = graphRef.current.graph2ScreenCoords(mx, my);

                                return (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.8, y: 10 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.8, y: 10 }}
                                        style={{
                                            left: coords.x,
                                            top: coords.y
                                        }}
                                        className="absolute z-30 pointer-events-none transform -translate-x-1/2 -translate-y-full pb-4 max-w-xs"
                                    >
                                        <div className="relative overflow-hidden rounded-xl bg-white/10 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.3)] p-4">
                                            {/* Chromatic Aberration Effect */}
                                            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent mix-blend-overlay" />
                                            <div className="absolute -inset-1 bg-gradient-to-r from-transparent via-white/10 to-transparent blur-sm opacity-30 animate-pulse" />

                                            {/* Content */}
                                            <div className="relative z-10">
                                                <div className="flex items-center justify-between gap-4 mb-2 text-xs text-white/50 uppercase tracking-wider">
                                                    <span>{hoveredLink.label || 'Connection'}</span>
                                                    {isGenerating ? (
                                                        <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                                                    ) : (
                                                        <Sparkles className="w-3 h-3 text-yellow-400" />
                                                    )}
                                                </div>
                                                {isGenerating ? (
                                                    <div className="text-sm text-white/70 italic">
                                                        Thinking of a good example...
                                                    </div>
                                                ) : (
                                                    <div className="space-y-2">
                                                        <p
                                                            className="text-sm text-white leading-relaxed font-medium"
                                                            dangerouslySetInnerHTML={{ __html: hoveredLink.example.replace(/\*\*/g, '') }}
                                                        />
                                                        {hoveredLink.example_cn && (
                                                            <p className="text-xs text-white/60 border-t border-white/10 pt-2 mt-1">
                                                                {hoveredLink.example_cn.replace(/\*\*/g, '')}
                                                            </p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })()
                        )}
                    </AnimatePresence>

                    {mode === 'map' && renderMap()}
                </div>

                {/* Loading Overlay */}
                {isGraphGenerating && (
                    <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-300">
                        <Loader2 className="w-12 h-12 text-blue-400 animate-spin mb-4" />
                        <div className="text-xl font-bold text-white mb-2">正在构建语义网络...</div>
                        <div className="text-sm text-white/50">AI 正在分析 {sessionGroups?.[activeGroupIndex]?.items.length || 0} 个单词的深层联系</div>
                    </div>
                )}

                {/* Group Completion Modal */}
                {showGroupCompletion && !showReport && (
                    <div className="absolute inset-0 z-50 bg-slate-950 animate-in fade-in duration-300">
                        <SessionReport
                            isOpen={showGroupCompletion}
                            type="learn" // Or 'group' if we supported it
                            startTime={sessionStats.startTime} // Use session start or track group start? Session start is ok.
                            cardsCount={sessionGroups?.[activeGroupIndex]?.items.length || 0}
                            onClose={handleAdvanceGroup}
                        />
                    </div>
                )}

                {/* Session Report (Final) */}
                {showReport && (
                    <div className="absolute inset-0 z-50 bg-slate-950 animate-in fade-in duration-300">
                        <SessionReport
                            isOpen={showReport}
                            type="learn"
                            startTime={sessionStats.startTime}
                            cardsCount={sessionStats.total} // Total for session
                            onClose={onBack}
                        />
                    </div>
                )}

                {/* 悬浮 AI 聊天助手 */}
                <FloatingAIChat
                    apiKey={apiKey}
                    currentWord={currentItem?.card?.word}
                    currentMeaning={currentItem?.card?.meaning}
                    mascotReaction={mascotReaction}
                    onInsertToNotes={(text) => {
                        if (currentItem?.card && onUpdateCard) {
                            const newNotes = currentItem.card.notes
                                ? `${currentItem.card.notes}\n\n---\n${text}`
                                : text;
                            const updatedCard = { ...currentItem.card, notes: newNotes };

                            // 实时更新本地队列状态
                            setQueue(prev => prev.map(item =>
                                item.card.id === currentItem.card.id
                                    ? { ...item, card: updatedCard }
                                    : item
                            ));

                            // 持久化到数据库
                            onUpdateCard(updatedCard);
                        }
                    }}
                    // [Feature I] Direct State Sync for Teacher Mode
                    isTeacher={isTeacherMode}
                />
            </div>
        </div>
    );
}
