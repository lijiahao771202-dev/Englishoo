import { useEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Layers, Loader2, Target, AlertCircle, X, Network, List, CheckCircle2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WordCard } from '@/types';
import { EmbeddingService } from '@/lib/embedding';
import { getAllCards } from '@/lib/data-source';
import { State } from 'ts-fsrs';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';

interface Cluster {
    label: string;
    items: WordCard[];
}

interface DeckClustersProps {
    deckId: string;
    cards?: WordCard[]; // Optional cards prop to avoid re-fetching
    onBack: () => void;
    onStartSession: (groups: Cluster[], startIndex?: number) => void;
}

interface EnrichedCluster extends Cluster {
    total: number;
    learned: number;
    progress: number;
    debugMissing?: string[];
}

/**
 * @description 卡包语义聚类视图 (Deck Clusters View)
 * 展示整个卡包内的单词如何基于语义知识网络被分组
 */
export function DeckClusters({ deckId, cards, onBack, onStartSession }: DeckClustersProps) {
    const [clusters, setClusters] = useState<Cluster[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMessage, setLoadingMessage] = useState("正在读取分组数据...");
    const [selectedCluster, setSelectedCluster] = useState<Cluster | null>(null);
    const [selectedClusters, setSelectedClusters] = useState<Set<string>>(new Set());
    const [currentPage, setCurrentPage] = useState(0); // [PAGINATION] 当前页码，从 0 开始
    const PAGE_SIZE = 5; // 每页显示 5 个分组
    const [cardsMap, setCardsMap] = useState<Record<string, WordCard>>({});

    // Graph State
    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
    const [isGraphLoading, setIsGraphLoading] = useState(false);
    const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph');
    const graphRef = useRef<ForceGraphMethods | undefined>(undefined);
    const [containerDimensions, setContainerDimensions] = useState({ width: 400, height: 400 });
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null); // [NEW] 滚动容器引用

    // Fetch cards to track progress - Always fetch on mount and when cards change
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Trigger refresh on mount
    useEffect(() => {
        setRefreshTrigger(prev => prev + 1);
    }, []); // Run once on mount

    useEffect(() => {
        const fetchCards = async () => {
            try {
                // Always fetch fresh cards from DB to ensure progress is up-to-date
                console.log('[DeckClusters] 刷新卡片数据以更新进度...');
                const allCards = await getAllCards(deckId);

                const map: Record<string, WordCard> = {};

                // [FIX] Robust Map Construction: Handle duplicates by prioritizing Learned status
                let duplicateCount = 0;
                let recoveredProgressCount = 0;

                allCards.forEach(c => {
                    if (!c.word) return;
                    const key = c.word.trim().toLowerCase();
                    const existing = map[key];

                    if (existing) {
                        duplicateCount++;
                        // If current card has progress (not New or Familiar), and existing doesn't, take current.
                        // State.New is usually 0. Check if imported, otherwise assume 0.
                        const currentHasProgress = c.state !== State.New || c.isFamiliar;
                        const existingHasProgress = existing.state !== State.New || existing.isFamiliar;

                        if (currentHasProgress && !existingHasProgress) {
                            map[key] = c;
                            recoveredProgressCount++;
                        } else if (!currentHasProgress && existingHasProgress) {
                            // Keep existing (Learned wins)
                        } else {
                            // Both have progress or both don't. Keep the one with higher state just in case.
                            if ((c.state || 0) > (existing.state || 0)) {
                                map[key] = c;
                            }
                        }
                    } else {
                        map[key] = c;
                    }
                });

                if (duplicateCount > 0) {
                    console.warn(`[DeckClusters] Found ${duplicateCount} duplicate cards. Recovered progress for ${recoveredProgressCount} cards.`);
                }

                setCardsMap(map);
                console.log(`[DeckClusters] Loaded ${allCards.length} cards -> ${Object.keys(map).length} unique words.`);
            } catch (error) {
                console.error("Failed to load cards for progress tracking:", error);
            }
        };
        fetchCards();
    }, [deckId, refreshTrigger]); // [FIX] 使用 refreshTrigger 确保每次挂载时都刷新

    // Calculate enriched clusters with progress
    const enrichedClusters = useMemo(() => {
        if (clusters.length === 0) return [];

        return clusters.map(cluster => {
            const items = cluster.items;
            const total = items.length;
            let learned = 0;
            const debugMissing: string[] = [];

            items.forEach(item => {
                const key = item.word.trim().toLowerCase();
                const card = cardsMap[key];

                // [FIX] 进度包括：已学习(state非New) 或 标记熟悉(isFamiliar)
                if (card && (card.state !== State.New || card.isFamiliar)) {
                    learned++;
                } else {
                    // Collect missing for bulk log to reduce console noise
                    const status = !card ? 'Missing' : `State:${card.state},Fam:${card.isFamiliar}`;
                    debugMissing.push(`${item.word} (${status})`);
                }
            });

            // Log details for selected cluster OR the first unfinished one (for global debugging)
            if (debugMissing.length > 0) {
                if (cluster.label === selectedCluster?.label) {
                    console.log(`[Progress Debug] Selected Cluster "${cluster.label}" unfinished items (${debugMissing.length}):`, debugMissing.slice(0, 5));
                } else if (Math.random() < 0.05) { // Sample logs occasionally or logic to log once?
                    // Let's rely on user clicking "Refresh" which triggers re-calc
                    // But we can't easily track "first" across map iterations without outer scope var
                    // console.log(`[Progress Debug] Unfinished items in "${cluster.label}":`, debugMissing.slice(0, 3));
                }
            }

            return {
                ...cluster,
                total,
                learned,
                progress: total > 0 ? Math.round((learned / total) * 100) : 0,
                debugMissing // Attach for potential access
            } as EnrichedCluster;
        });
    }, [clusters, cardsMap, selectedCluster]);

    // [NEW] Effect to log the FIRST unfinished cluster details explicitly when cards change
    useEffect(() => {
        const incomplete = enrichedClusters.find(c => c.progress < 100);
        if (incomplete && incomplete.debugMissing && incomplete.debugMissing.length > 0) {
            console.warn(`[DeckClusters Global Debug] Found unfinished cluster "${incomplete.label}" (${incomplete.progress}%). Top 5 unfinished items:`, incomplete.debugMissing.slice(0, 5));
        }
    }, [enrichedClusters]);

    // Find current active cluster (first one not fully learned)
    const currentClusterIndex = useMemo(() => {
        const idx = enrichedClusters.findIndex(c => c.learned < c.total);
        return idx === -1 ? -1 : idx; // -1 means all completed
    }, [enrichedClusters]);

    useEffect(() => {
        loadClusters();
    }, [deckId]);

    // Reset page when clusters change
    useEffect(() => {
        setCurrentPage(0);
    }, [clusters]);

    // Load graph data when selected cluster changes
    useEffect(() => {
        if (selectedCluster && viewMode === 'graph') {
            loadGraphData(selectedCluster);
        }
    }, [selectedCluster, viewMode]);

    // Measure container size
    useEffect(() => {
        if (containerRef.current && selectedCluster) {
            const updateSize = () => {
                if (containerRef.current) {
                    setContainerDimensions({
                        width: containerRef.current.offsetWidth,
                        height: containerRef.current.offsetHeight
                    });
                }
            };

            updateSize();
            window.addEventListener('resize', updateSize);
            return () => window.removeEventListener('resize', updateSize);
        }
    }, [selectedCluster, viewMode]);
    const loadClusters = async (forceRefresh = false) => {
        // Only reset state on force refresh to avoid flickering on normal load
        if (forceRefresh) {
            setClusters([]);
            setSelectedCluster(null);
            setLoading(true);
            setLoadingMessage("正在读取分组数据...");
        } else if (clusters.length === 0) {
            // Initial load
            setLoading(true);
            setLoadingMessage("正在读取分组数据...");
        }

        // Timer to switch message if loading takes too long
        const timer = setTimeout(() => {
            if (loading) setLoadingMessage("正在构建语义网络...");
        }, 2000);

        try {
            const service = EmbeddingService.getInstance();
            // Pass cards to getDeckClusters for hydration
            const result = await service.getDeckClusters(deckId, cards, forceRefresh);
            setClusters(result as Cluster[]);
        } catch (error) {
            console.error("Failed to cluster cards:", error);
        } finally {
            clearTimeout(timer);
            setLoading(false);
        }
    };

    const loadGraphData = async (cluster: Cluster) => {
        setIsGraphLoading(true);
        try {
            const service = EmbeddingService.getInstance();
            const words = cluster.items.map(item => item.word);

            // Use computeGroupConnections directly to match GuidedLearningSession
            // [MODIFIED] Lower threshold to 0.6 to allow more connections
            const allConnections = await service.computeGroupConnections(words, 0.6);

            // [MODIFIED] Simplify Graph Logic: Keep only top-4 strongest connections per node
            const simplifiedLinks: any[] = [];
            const linkSet = new Set<string>();
            const getLinkKey = (a: string, b: string) => [a, b].sort().join(':');

            // Create map for ID lookup
            const nodeIdMap = new Map(cluster.items.map(item => [item.word.toLowerCase(), item.id]));

            words.forEach(word => {
                const w = word.toLowerCase();
                const myConnections = allConnections.filter(c => c.source === w || c.target === w);
                myConnections.sort((a, b) => b.similarity - a.similarity);
                // [MODIFIED] Take top 4
                const topK = myConnections.slice(0, 4);

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
                                similarity: conn.similarity,
                                label: '' // Placeholder for potential future labels
                            });
                        }
                    }
                });
            });

            // Calculate degree for sizing
            const degree: Record<string, number> = {};
            simplifiedLinks.forEach(link => {
                const s = typeof link.source === 'object' ? link.source.id : link.source;
                const t = typeof link.target === 'object' ? link.target.id : link.target;
                degree[s] = (degree[s] || 0) + 1;
                degree[t] = (degree[t] || 0) + 1;
            });

            const nodes = cluster.items.map(item => ({
                ...item,
                id: item.id,
                label: item.word,
                val: degree[item.id] || 1
            }));

            setGraphData({ nodes, links: simplifiedLinks } as any);
        } catch (error) {
            console.error("Failed to load graph data:", error);
        } finally {
            setIsGraphLoading(false);
        }
    };

    // [NEW] Sort clusters: in-progress first, then new, then completed
    const sortedClusters = useMemo(() => {
        return [...enrichedClusters].sort((a, b) => {
            // Priority 1: In-progress (has some progress but not complete)
            const aInProgress = a.progress > 0 && a.progress < 100;
            const bInProgress = b.progress > 0 && b.progress < 100;
            if (aInProgress && !bInProgress) return -1;
            if (!aInProgress && bInProgress) return 1;

            // Priority 2: New (0% progress) before completed (100%)
            const aCompleted = a.progress === 100;
            const bCompleted = b.progress === 100;
            if (!aCompleted && bCompleted) return -1;
            if (aCompleted && !bCompleted) return 1;

            // Same status: sort by progress descending within group
            return b.progress - a.progress;
        });
    }, [enrichedClusters]);

    // Calculate stats
    // const totalGroups = clusters.length;
    const totalWords = clusters.reduce((acc, c) => acc + c.items.length, 0);

    // [PAGINATION] 计算分页
    const totalPages = Math.ceil(sortedClusters.length / PAGE_SIZE);
    const startIndex = currentPage * PAGE_SIZE;
    const visibleClusters = sortedClusters.slice(startIndex, startIndex + PAGE_SIZE);

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            {/* Header - Redesigned: Centered & Clean */}
            <div className="relative mb-10 pt-4 px-4">
                {/* Back Button - Absolute Left */}
                <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10">
                    <button
                        onClick={onBack}
                        aria-label="返回"
                        className="p-3 rounded-full bg-white/50 hover:bg-white/80 border border-white/60 shadow-sm hover:shadow-md text-slate-600 transition-all backdrop-blur-md group"
                    >
                        <ArrowLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
                    </button>
                </div>

                {/* Centered Title & Stats */}
                <div className="text-center flex flex-col items-center">
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-3 mb-2"
                    >
                        <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 shadow-inner">
                            <Layers className="w-6 h-6" />
                        </div>
                        <h1 className="text-3xl font-bold text-slate-800 tracking-tight">
                            语义知识分组
                        </h1>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.1 }}
                        className="flex items-center gap-3 text-sm font-medium text-slate-500 bg-white/40 px-4 py-1.5 rounded-full border border-white/50 backdrop-blur-sm"
                    >
                        <span>共 <span className="text-slate-800 font-bold">{totalWords}</span> 个单词</span>
                        <span className="w-1 h-1 rounded-full bg-slate-300" />
                        <span><span className="text-slate-800 font-bold">{clusters.length}</span> 个语义主题</span>
                    </motion.div>
                </div>
            </div>

            {/* Tip for Unconnected */}
            {!loading && clusters.some(c => c.label.includes('未关联单词')) && (
                <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-100 flex items-start gap-3 text-amber-700">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
                    <div className="text-sm">
                        <p className="font-bold text-amber-800">发现大量未关联单词？</p>
                        <p>语义分组依赖于知识图谱。请返回详情页，点击 <strong>"构建知识图谱"</strong> 来生成单词间的语义连接，从而获得更精准的分组效果。</p>
                    </div>
                </div>
            )}

            {/* Content */}
            {loading ? (
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                    <span className="ml-3 text-slate-500">{loadingMessage}</span>
                </div>
            ) : (
                <div className="flex-1 overflow-hidden flex gap-6">
                    {/* Cluster Grid */}
                    <div
                        ref={scrollContainerRef}
                        className={cn(
                            "flex-1 overflow-y-auto pr-2 transition-all duration-500 custom-scrollbar",
                            selectedCluster ? "w-1/2" : "w-full"
                        )}
                    >
                        <motion.div
                            className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5 pb-20 p-1"
                            initial="hidden"
                            animate="visible"
                            variants={{
                                visible: {
                                    transition: {
                                        staggerChildren: 0.1
                                    }
                                }
                            }}
                        >
                            {visibleClusters.map((cluster, idx) => {
                                const isCurrent = idx === currentClusterIndex;
                                const isCompleted = cluster.learned === cluster.total && cluster.total > 0;
                                const isSelected = selectedClusters.has(cluster.label);

                                const numberStr = String(idx + 1).padStart(2, '0');

                                // Animation Variants
                                const itemVariants = {
                                    hidden: { opacity: 0, y: 50, scale: 0.9 },
                                    visible: {
                                        opacity: 1,
                                        y: 0,
                                        scale: 1,
                                        transition: {
                                            type: "spring" as const,
                                            stiffness: 300,
                                            damping: 20,
                                            mass: 0.8
                                        }
                                    }
                                };

                                return (
                                    <motion.div
                                        key={idx}
                                        variants={itemVariants}
                                        onClick={() => {
                                            setSelectedCluster(cluster);
                                            setViewMode('graph');
                                        }}
                                        className={cn(
                                            "relative overflow-hidden rounded-2xl p-6 transition-all duration-500 cursor-pointer group select-none min-h-[220px] flex flex-col",
                                            "border backdrop-blur-xl shadow-sm hover:shadow-xl hover:-translate-y-2", // Floating Effect
                                            // Base styles - Floating Islands Theme
                                            selectedCluster === cluster
                                                ? "bg-indigo-50/80 border-indigo-200 shadow-[0_10px_40px_rgba(99,102,241,0.15)] ring-1 ring-indigo-400/30"
                                                : isSelected
                                                    ? "bg-indigo-50/60 border-indigo-200"
                                                    : "bg-white/60 border-white/60 hover:bg-white/80"
                                        )}
                                    >
                                        {/* 1. Perspective Watermark Number (Subtle Dark Indentation) */}
                                        <div className="absolute -top-4 -right-1 z-0 pointer-events-none transition-transform duration-700 group-hover:scale-110 group-hover:-rotate-6">
                                            <span className="text-[6rem] font-black text-slate-900/5 font-sans tracking-tighter leading-none">
                                                {numberStr}
                                            </span>
                                        </div>

                                        {/* 2. Selection Hit Area */}
                                        <div
                                            className="absolute top-4 right-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const newSet = new Set(selectedClusters);
                                                if (newSet.has(cluster.label)) {
                                                    newSet.delete(cluster.label);
                                                } else {
                                                    newSet.add(cluster.label);
                                                }
                                                setSelectedClusters(newSet);
                                            }}
                                        >
                                            <div className={cn(
                                                "w-6 h-6 rounded-full border flex items-center justify-center transition-all",
                                                isSelected
                                                    ? "bg-indigo-500 border-indigo-500 text-white shadow-[0_0_10px_rgba(99,102,241,0.3)]"
                                                    : "border-slate-300 hover:border-slate-400 bg-white/50 backdrop-blur-sm"
                                            )}>
                                                {isSelected && <Check className="w-3.5 h-3.5" />}
                                            </div>
                                        </div>
                                        {/* Always show selection if selected */}
                                        {isSelected && (
                                            <div className="absolute top-4 right-4 z-20">
                                                <div className="w-6 h-6 rounded-full bg-indigo-500 border-indigo-500 text-white shadow-[0_0_10px_rgba(99,102,241,0.3)] flex items-center justify-center">
                                                    <Check className="w-3.5 h-3.5" />
                                                </div>
                                            </div>
                                        )}

                                        {/* 3. Card Content */}
                                        <div className="relative z-10 flex flex-col h-full">
                                            {/* Header */}
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className={cn(
                                                    "w-8 h-8 rounded-lg flex items-center justify-center backdrop-blur-md shadow-sm border border-white/40",
                                                    isCurrent ? "bg-sky-100 text-sky-600" : (isCompleted ? "bg-emerald-100 text-emerald-600" : "bg-white/50 text-slate-500")
                                                )}>
                                                    {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : (isCurrent ? <Target className="w-5 h-5" /> : <Layers className="w-4 h-4" />)}
                                                </div>

                                                {/* Mini Tag */}
                                                <div className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-500">
                                                    {cluster.items.length} 词
                                                </div>
                                            </div>

                                            {/* Title - Clean Slate-800 */}
                                            <h3 className="text-2xl font-bold text-slate-800 mb-4 tracking-tight">
                                                {cluster.label}
                                            </h3>

                                            {/* Word Pills - Light Glass */}
                                            <div className="flex flex-wrap gap-2 mb-6">
                                                {cluster.items.slice(0, 4).map(item => (
                                                    <span key={item.id} className="text-xs font-medium bg-white/40 border border-slate-200 px-2 py-1 rounded-md text-slate-600 group-hover:bg-white/60 group-hover:text-slate-800 transition-colors shadow-sm">
                                                        {item.word}
                                                    </span>
                                                ))}
                                                {cluster.items.length > 4 && (
                                                    <span className="text-xs px-1 py-1 text-slate-400">...</span>
                                                )}
                                            </div>

                                            {/* Status Footer & Glow Line */}
                                            <div className="mt-auto">
                                                <div className="flex justify-between items-end mb-2">
                                                    <span className={cn(
                                                        "text-xs font-bold uppercase tracking-wider",
                                                        isCurrent ? "text-sky-600" : (isCompleted ? "text-emerald-600" : "text-slate-400")
                                                    )}>
                                                        {isCurrent ? '当前目标' : (isCompleted ? '已掌握' : '以太网络')}
                                                    </span>
                                                    <span className="text-xs font-mono text-slate-500 font-bold">
                                                        {(cluster.progress).toFixed(0)}%
                                                    </span>
                                                </div>

                                                {/* Progress Bar (MacOS Style) */}
                                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden relative shadow-inner">
                                                    {/* Actual Bar */}
                                                    <div
                                                        className={cn(
                                                            "h-full transition-all duration-700 relative z-10",
                                                            isCompleted ? "bg-emerald-400" : (isCurrent ? "bg-sky-400" : "bg-indigo-400")
                                                        )}
                                                        style={{ width: `${cluster.progress}%` }}
                                                    />
                                                </div>

                                                {/* Action Buttons */}
                                                <div className="flex gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setViewMode('list'); // 直接显示列表视图
                                                            setSelectedCluster(cluster);
                                                        }}
                                                        className="flex-1 py-1.5 px-3 rounded-lg bg-white/50 hover:bg-white/80 text-slate-600 hover:text-slate-900 text-xs font-medium transition-all border border-slate-200 shadow-sm hover:shadow"
                                                    >
                                                        查看单词
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            // 如果该组已完成，传递整个列表让用户复习；否则从该组开始学习
                                                            onStartSession([cluster], 0);
                                                        }}
                                                        className={cn(
                                                            "flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all border shadow-sm hover:shadow",
                                                            isCompleted
                                                                ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border-emerald-200"
                                                                : cluster.progress > 0
                                                                    ? "bg-sky-50 hover:bg-sky-100 text-sky-600 border-sky-200"
                                                                    : "bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border-indigo-200"
                                                        )}
                                                    >
                                                        {isCompleted ? "再学一遍" : (cluster.progress > 0 ? "继续学习" : "开始学习")}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )
                            })}

                            {/* [PAGINATION] 分页控件 */}
                            {totalPages > 1 && (
                                <div className="col-span-full flex items-center justify-center gap-4 py-8">
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                                        disabled={currentPage === 0}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/50 hover:bg-white/80 disabled:opacity-30 disabled:cursor-not-allowed transition-all border border-slate-200 text-slate-600 hover:text-slate-900 shadow-sm"
                                    >
                                        <ArrowLeft className="w-4 h-4" />
                                        上一页
                                    </button>

                                    <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/50 border border-slate-200 shadow-sm">
                                        <span className="text-slate-400 text-sm">第</span>
                                        <span className="text-slate-800 font-bold">{currentPage + 1}</span>
                                        <span className="text-slate-400 text-sm">/</span>
                                        <span className="text-slate-600">{totalPages}</span>
                                        <span className="text-slate-400 text-sm">页</span>
                                    </div>

                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                                        disabled={currentPage >= totalPages - 1}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/50 hover:bg-white/80 disabled:opacity-30 disabled:cursor-not-allowed transition-all border border-slate-200 text-slate-600 hover:text-slate-900 shadow-sm"
                                    >
                                        下一页
                                        <ArrowLeft className="w-4 h-4 rotate-180" />
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    </div>

                    {/* Detail Modal (Centered) via Portal */}
                    {
                        createPortal(
                            <AnimatePresence>
                                {selectedCluster && (
                                    <>
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="fixed inset-0 bg-white/30 backdrop-blur-md z-[9999]"
                                            onClick={() => setSelectedCluster(null)}
                                        />
                                        {/* Modal */}
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.9, y: "-40%", x: "-50%" }}
                                            animate={{ opacity: 1, scale: 1, y: "-50%", x: "-50%" }}
                                            exit={{ opacity: 0, scale: 0.9, y: "-40%", x: "-50%" }}
                                            className="fixed left-1/2 top-1/2 w-[90vw] max-w-[600px] h-[80vh] max-h-[700px] bg-white/80 backdrop-blur-xl border border-white/60 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-[10000]"
                                        >
                                            <div className="p-6 border-b border-slate-100 bg-white/50">
                                                <div className="flex justify-between items-center mb-4">
                                                    <h2 className="text-2xl font-bold text-slate-800 truncate pr-4">{selectedCluster.label}</h2>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <button
                                                            onClick={() => setViewMode(viewMode === 'graph' ? 'list' : 'graph')}
                                                            className="p-2 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
                                                            title={viewMode === 'graph' ? "切换到列表视图" : "切换到知识网络"}
                                                        >
                                                            {viewMode === 'graph' ? <List className="w-5 h-5" /> : <Network className="w-5 h-5" />}
                                                        </button>
                                                        <button
                                                            onClick={() => setSelectedCluster(null)}
                                                            className="p-2 hover:bg-slate-100 rounded-full text-slate-500 hover:text-slate-800 transition-colors"
                                                        >
                                                            <X className="w-5 h-5" />
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="flex gap-4 text-sm text-slate-500">
                                                    <span>包含 {selectedCluster.items.length} 个相关词汇</span>
                                                </div>
                                            </div>

                                            <div className="flex-1 overflow-hidden relative bg-slate-50/50" ref={containerRef}>
                                                {viewMode === 'graph' ? (
                                                    isGraphLoading ? (
                                                        <div className="absolute inset-0 flex items-center justify-center">
                                                            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                                                        </div>
                                                    ) : (
                                                        <ForceGraph2D
                                                            ref={graphRef}
                                                            width={containerDimensions.width}
                                                            height={containerDimensions.height}
                                                            graphData={graphData}
                                                            nodeLabel="label"
                                                            nodeRelSize={6}
                                                            linkColor={() => 'rgba(148, 163, 184, 0.4)'} // Slate-400 with opacity
                                                            nodeColor={(node: any) => {
                                                                const item = selectedCluster.items.find(i => i.id === node.id);
                                                                const isLearned = item && (item.state !== State.New || item.isFamiliar);
                                                                return isLearned ? '#4ade80' : '#60a5fa'; // Green if learned, Blue if not
                                                            }}
                                                            nodeCanvasObject={(node: any, ctx, globalScale) => {
                                                                const label = node.label;
                                                                const item = selectedCluster.items.find(i => i.id === node.id);
                                                                const isLearned = item && (item.state !== State.New || item.isFamiliar); // Check learning status
                                                                const fontSize = 12 / globalScale;
                                                                ctx.font = `${fontSize}px Sans-Serif`;
                                                                const textWidth = ctx.measureText(label).width;
                                                                const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2); // some padding

                                                                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; // Light background for text
                                                                ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);

                                                                ctx.textAlign = 'center';
                                                                ctx.textBaseline = 'middle';
                                                                ctx.fillStyle = isLearned ? '#166534' : '#1e40af'; // Darker text for contrast (Emerald-800 / Blue-800)
                                                                ctx.fillText(label, node.x, node.y);

                                                                // Draw circle
                                                                ctx.beginPath();
                                                                ctx.arc(node.x, node.y, node.val * 2, 0, 2 * Math.PI, false);
                                                                ctx.fillStyle = isLearned ? '#4ade80' : '#60a5fa';
                                                                ctx.fill();
                                                            }}
                                                            nodeCanvasObjectMode={() => 'after'} // Draw after nodes
                                                            enableNodeDrag={true}
                                                            onNodeClick={() => {
                                                                // Optional: Show card detail?
                                                            }}
                                                            onEngineStop={() => {
                                                                if (graphRef.current) {
                                                                    graphRef.current.zoomToFit(400);
                                                                }
                                                            }}
                                                            d3VelocityDecay={0.3}
                                                            cooldownTicks={100}
                                                            backgroundColor="rgba(0,0,0,0)"
                                                        />
                                                    )
                                                ) : (
                                                    <div className="h-full overflow-y-auto p-4 space-y-3">
                                                        {selectedCluster.items.map((item) => (
                                                            <div
                                                                key={item.id}
                                                                className="p-4 rounded-lg bg-white/40 hover:bg-white/60 transition-colors border border-slate-100 group shadow-sm"
                                                            >
                                                                <div className="flex justify-between items-baseline mb-1">
                                                                    <span className="font-bold text-lg text-slate-800">{item.word}</span>
                                                                    <span className="text-xs text-slate-400 font-mono">{item.phonetic}</span>
                                                                </div>
                                                                <p className="text-sm text-slate-600 line-clamp-2">{item.meaning}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    </>
                                )}
                            </AnimatePresence>,
                            document.body
                        )
                    }
                </div >
            )
            }
        </div >
    );
}
