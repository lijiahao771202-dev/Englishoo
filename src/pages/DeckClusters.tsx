import { useEffect, useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Layers, Loader2, Target, AlertCircle, X, RefreshCw, Network, List, BookOpen, CheckCircle2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WordCard } from '@/types';
import { EmbeddingService } from '@/lib/embedding';
import { getAllCards } from '@/lib/db';
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
    onStartSession: (groups: Cluster[]) => void;
}

interface EnrichedCluster extends Cluster {
    total: number;
    learned: number;
    progress: number;
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
    const [visibleCount, setVisibleCount] = useState(24);
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const [cardsMap, setCardsMap] = useState<Record<string, WordCard>>({});

    // Graph State
    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
    const [isGraphLoading, setIsGraphLoading] = useState(false);
    const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph');
    const graphRef = useRef<ForceGraphMethods | undefined>(undefined);
    const [containerDimensions, setContainerDimensions] = useState({ width: 400, height: 400 });
    const containerRef = useRef<HTMLDivElement>(null);

    // Fetch cards to track progress - Run in parallel with cluster loading
    useEffect(() => {
        const fetchCards = async () => {
            try {
                // Always fetch fresh cards from DB to ensure progress is up-to-date
                // The 'cards' prop is used for fast hydration of clusters, but we need fresh state for progress
                const allCards = await getAllCards(deckId);

                const map: Record<string, WordCard> = {};
                allCards.forEach(c => {
                    if (c.word) map[c.word.toLowerCase()] = c;
                });
                setCardsMap(map);
            } catch (error) {
                console.error("Failed to load cards for progress tracking:", error);
            }
        };
        fetchCards();
    }, [deckId]); // Remove 'cards' dependency to avoid re-running when prop changes (we want DB truth)

    // Calculate enriched clusters with progress
    const enrichedClusters = useMemo(() => {
        if (clusters.length === 0) return [];

        return clusters.map(cluster => {
            const items = cluster.items;
            const total = items.length;
            let learned = 0;

            items.forEach(item => {
                const card = cardsMap[item.word.toLowerCase()];
                // If card exists and state is NOT New, count as learned
                if (card && card.state !== State.New) {
                    learned++;
                }
            });

            return {
                ...cluster,
                total,
                learned,
                progress: total > 0 ? (learned / total) * 100 : 0
            } as EnrichedCluster;
        });
    }, [clusters, cardsMap]);

    // Find current active cluster (first one not fully learned)
    const currentClusterIndex = useMemo(() => {
        const idx = enrichedClusters.findIndex(c => c.learned < c.total);
        return idx === -1 ? -1 : idx; // -1 means all completed
    }, [enrichedClusters]);

    useEffect(() => {
        loadClusters();
    }, [deckId]);

    // Reset visible count when clusters change
    useEffect(() => {
        setVisibleCount(24);
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

    // Infinite scroll observer
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && visibleCount < clusters.length) {
                    setVisibleCount(prev => Math.min(prev + 24, clusters.length));
                }
            },
            { threshold: 0.1, rootMargin: '200px' }
        );

        if (loadMoreRef.current) {
            observer.observe(loadMoreRef.current);
        }

        return () => observer.disconnect();
    }, [clusters.length, visibleCount]);

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

    // Calculate stats
    const totalGroups = clusters.length;
    const totalWords = clusters.reduce((acc, c) => acc + c.items.length, 0);
    const visibleClusters = enrichedClusters.slice(0, visibleCount);

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-2 rounded-full hover:bg-white/10 transition-colors"
                    >
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Layers className="w-6 h-6 text-blue-400" />
                            语义知识分组
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            共 {totalWords} 个单词，聚类为 {totalGroups} 个语义主题组
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Global Start Button (Standard Flow) */}
                    {selectedClusters.size === 0 && (
                        <button
                            onClick={() => {
                                // Start from the first unlearned cluster, but pass ALL clusters so status is "Group X / Total"
                                // If they are all learned, maybe start from beginning or alert?
                                // Let's pass all clusters. GuidedLearningSession handles skipping learned ones or `activeGroupIndex`
                                // Finding start index:
                                const effectiveIndex = currentClusterIndex === -1 ? 0 : currentClusterIndex;
                                // We need to re-order? No, keep order.
                                // Just pass all clusters. The session will start at `activeGroupIndex` if we can pass it,
                                // BUT `onStartSession` signature in this file is just `(groups)`.
                                // Let's check App.tsx for how it handles `onStartSession`.
                                // If App.tsx just takes the list and resets index to 0, then we should slice?
                                // User wants "Group 5/10". If we slice, it becomes "Group 1/6".
                                // Ideally we pass ALL, and tell App to start at X.
                                // For now, let's assume filtering:
                                // If we pass ALL, the user has to skip manualy?
                                // Let's filter to "From Current to End".
                                const clustersToStudy = clusters.slice(effectiveIndex);
                                onStartSession(clustersToStudy);
                            }}
                            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-lg shadow-blue-500/20 transition-all hover:scale-105"
                        >
                            <BookOpen className="w-4 h-4" />
                            开始学习 (从第 {currentClusterIndex + 1} 组起)
                        </button>
                    )}

                    {selectedClusters.size > 0 && (
                        <motion.button
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            onClick={() => {
                                const selectedGroups = clusters.filter(c => selectedClusters.has(c.label));
                                onStartSession(selectedGroups);
                            }}
                            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-semibold shadow-lg shadow-blue-500/20 transition-all"
                        >
                            <BookOpen className="w-4 h-4" />
                            复习选中 ({selectedClusters.size} 组)
                        </motion.button>
                    )}

                    <button
                        onClick={() => loadClusters(true)}
                        disabled={loading}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-white/70 transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                        刷新分组
                    </button>
                </div>
            </div>

            {/* Tip for Unconnected */}
            {!loading && clusters.some(c => c.label.includes('未关联单词')) && (
                <div className="mb-6 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-start gap-3 text-yellow-200/80">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div className="text-sm">
                        <p className="font-bold text-yellow-200">发现大量未关联单词？</p>
                        <p>语义分组依赖于知识图谱。请返回详情页，点击 <strong>"构建知识图谱"</strong> 来生成单词间的语义连接，从而获得更精准的分组效果。</p>
                    </div>
                </div>
            )}

            {/* Content */}
            {loading ? (
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    <span className="ml-3 text-muted-foreground">{loadingMessage}</span>
                </div>
            ) : (
                <div className="flex-1 overflow-hidden flex gap-6">
                    {/* Cluster Grid */}
                    <div className={cn(
                        "flex-1 overflow-y-auto pr-2 transition-all duration-500 custom-scrollbar",
                        selectedCluster ? "w-1/2" : "w-full"
                    )}>
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5 pb-20 p-1">
                            {visibleClusters.map((cluster, idx) => {
                                const isCurrent = idx === currentClusterIndex;
                                const isCompleted = cluster.learned === cluster.total && cluster.total > 0;
                                const isSelected = selectedClusters.has(cluster.label);

                                // Format number for watermark (e.g., 01, 02)
                                const numberStr = String(idx + 1).padStart(2, '0');

                                return (
                                    <motion.div
                                        key={idx}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.4, delay: idx * 0.05 }}
                                        onClick={() => {
                                            setSelectedCluster(cluster);
                                            setViewMode('graph');
                                        }}
                                        className={cn(
                                            "relative overflow-hidden rounded-2xl p-6 transition-all duration-500 cursor-pointer group select-none min-h-[220px] flex flex-col",
                                            "border backdrop-blur-xl shadow-lg",
                                            // Base styles - Premium Glass
                                            selectedCluster === cluster
                                                ? "bg-blue-500/10 border-blue-400/50 shadow-[0_0_30px_rgba(59,130,246,0.25)] ring-1 ring-blue-400/30"
                                                : isSelected
                                                    ? "bg-blue-500/10 border-blue-500/30"
                                                    : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 hover:-translate-y-1 hover:shadow-[0_10px_30px_rgba(0,0,0,0.3)]"
                                        )}
                                    >
                                        {/* 1. Perspective Watermark Number */}
                                        <div className="absolute -top-4 -right-1 z-0 pointer-events-none transition-transform duration-700 group-hover:scale-110 group-hover:-rotate-6">
                                            <span className="text-[6rem] font-black text-white/5 font-sans tracking-tighter leading-none">
                                                {numberStr}
                                            </span>
                                        </div>

                                        {/* 2. Selection Hit Area (Full Card Click handles entry, this handles selection) */}
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
                                                    ? "bg-blue-500 border-blue-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                                                    : "border-white/30 hover:border-white/60 bg-black/40 backdrop-blur-sm"
                                            )}>
                                                {isSelected && <Check className="w-3.5 h-3.5" />}
                                            </div>
                                        </div>
                                        {/* Always show selection if selected */}
                                        {isSelected && (
                                            <div className="absolute top-4 right-4 z-20">
                                                <div className="w-6 h-6 rounded-full bg-blue-500 border-blue-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.5)] flex items-center justify-center">
                                                    <Check className="w-3.5 h-3.5" />
                                                </div>
                                            </div>
                                        )}

                                        {/* 3. Card Content */}
                                        <div className="relative z-10 flex flex-col h-full">
                                            {/* Header */}
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className={cn(
                                                    "w-8 h-8 rounded-lg flex items-center justify-center backdrop-blur-md shadow-inner",
                                                    isCurrent ? "bg-cyan-500/20 text-cyan-300" : (isCompleted ? "bg-green-500/20 text-green-300" : "bg-white/10 text-blue-200")
                                                )}>
                                                    {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : (isCurrent ? <Target className="w-5 h-5" /> : <Layers className="w-4 h-4" />)}
                                                </div>

                                                {/* Mini Tag */}
                                                <div className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/5 border border-white/5 text-white/50">
                                                    {cluster.items.length} 词
                                                </div>
                                            </div>

                                            {/* Title */}
                                            <h3 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-white to-white/60 mb-4 group-hover:to-white transition-all">
                                                {cluster.label}
                                            </h3>

                                            {/* Word Pills */}
                                            <div className="flex flex-wrap gap-2 mb-6">
                                                {cluster.items.slice(0, 4).map(item => (
                                                    <span key={item.id} className="text-xs font-medium bg-white/5 border border-white/5 px-2 py-1 rounded-md text-white/60 group-hover:bg-white/10 group-hover:text-white/80 transition-colors">
                                                        {item.word}
                                                    </span>
                                                ))}
                                                {cluster.items.length > 4 && (
                                                    <span className="text-xs px-1 py-1 text-white/30">...</span>
                                                )}
                                            </div>

                                            {/* Status Footer & Glow Line */}
                                            <div className="mt-auto">
                                                <div className="flex justify-between items-end mb-2">
                                                    <span className={cn(
                                                        "text-xs font-bold uppercase tracking-wider",
                                                        isCurrent ? "text-cyan-400" : (isCompleted ? "text-green-400" : "text-white/30")
                                                    )}>
                                                        {isCurrent ? '当前目标' : (isCompleted ? '已掌握' : '以太网络')}
                                                    </span>
                                                    <span className="text-xs font-mono text-white/40">
                                                        {(cluster.progress).toFixed(0)}%
                                                    </span>
                                                </div>

                                                {/* Bottom Glow Line */}
                                                <div className="h-1 w-full bg-black/20 rounded-full overflow-hidden relative">
                                                    {/* Background Glow */}
                                                    <div className={cn(
                                                        "absolute inset-0 opacity-50 blur-sm transition-all duration-700",
                                                        isCompleted ? "bg-green-500" : "bg-blue-500",
                                                        { "w-0": cluster.progress === 0 }
                                                    )} style={{ width: `${cluster.progress}%` }} />

                                                    {/* Actual Bar */}
                                                    <div
                                                        className={cn(
                                                            "h-full transition-all duration-700 relative z-10",
                                                            isCompleted ? "bg-green-400" : (isCurrent ? "bg-cyan-400" : "bg-blue-500")
                                                        )}
                                                        style={{ width: `${cluster.progress}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )
                            })}

                            {/* Sentinel for infinite scroll */}
                            {visibleCount < clusters.length && (
                                <div ref={loadMoreRef} className="col-span-full flex justify-center py-8">
                                    <Loader2 className="w-8 h-8 animate-spin text-white/20" />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Detail Panel (Right Side) */}
                    <AnimatePresence>
                        {selectedCluster && (
                            <motion.div
                                initial={{ opacity: 0, x: 50 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 50 }}
                                className="w-1/3 min-w-[400px] glass-panel border-l border-white/10 flex flex-col h-full"
                            >
                                <div className="p-6 border-b border-white/10 bg-white/5">
                                    <div className="flex justify-between items-center mb-4">
                                        <h2 className="text-2xl font-bold text-blue-300 truncate pr-4">{selectedCluster.label}</h2>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button
                                                onClick={() => setViewMode(viewMode === 'graph' ? 'list' : 'graph')}
                                                className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                                                title={viewMode === 'graph' ? "切换到列表视图" : "切换到知识网络"}
                                            >
                                                {viewMode === 'graph' ? <List className="w-5 h-5" /> : <Network className="w-5 h-5" />}
                                            </button>
                                            <button
                                                onClick={() => setSelectedCluster(null)}
                                                className="p-2 hover:bg-white/10 rounded-full text-white/70 hover:text-white transition-colors"
                                            >
                                                <X className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex gap-4 text-sm text-muted-foreground">
                                        <span>包含 {selectedCluster.items.length} 个相关词汇</span>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-hidden relative bg-slate-900/50" ref={containerRef}>
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
                                                nodeLabel="id"
                                                nodeRelSize={6}
                                                nodeColor={() => '#a78bfa'}
                                                linkCanvasObject={(link: any, ctx) => {
                                                    const source = link.source;
                                                    const target = link.target;

                                                    if (!source || !target || typeof source !== 'object' || typeof target !== 'object') return;

                                                    // 1. Draw Line
                                                    ctx.beginPath();
                                                    ctx.moveTo(source.x, source.y);
                                                    ctx.lineTo(target.x, target.y);

                                                    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
                                                    ctx.lineWidth = 1;
                                                    ctx.stroke();

                                                    // 2. Draw Label (Liquid Glass Style)
                                                    if (link.label) {
                                                        const midX = (source.x + target.x) / 2;
                                                        const midY = (source.y + target.y) / 2;

                                                        const label = link.label;
                                                        const fontSize = 3;
                                                        ctx.font = `${fontSize}px Sans-Serif`;
                                                        const textWidth = ctx.measureText(label).width;
                                                        const paddingX = 3;
                                                        const paddingY = 1.5;
                                                        const bckgW = textWidth + paddingX * 2;
                                                        const bckgH = fontSize + paddingY * 2;

                                                        ctx.save();
                                                        ctx.translate(midX, midY);

                                                        // Background (Glass)
                                                        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                                                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                                                        ctx.lineWidth = 0.5;

                                                        // Rounded Rect
                                                        const r = 2;
                                                        const x = -bckgW / 2;
                                                        const y = -bckgH / 2;

                                                        ctx.beginPath();
                                                        ctx.moveTo(x + r, y);
                                                        ctx.lineTo(x + bckgW - r, y);
                                                        ctx.quadraticCurveTo(x + bckgW, y, x + bckgW, y + r);
                                                        ctx.lineTo(x + bckgW, y + bckgH - r);
                                                        ctx.quadraticCurveTo(x + bckgW, y + bckgH, x + bckgW - r, y + bckgH);
                                                        ctx.lineTo(x + r, y + bckgH);
                                                        ctx.quadraticCurveTo(x, y + bckgH, x, y + bckgH - r);
                                                        ctx.lineTo(x, y + r);
                                                        ctx.quadraticCurveTo(x, y, x + r, y);
                                                        ctx.closePath();

                                                        ctx.fill();
                                                        ctx.stroke();

                                                        // Text
                                                        ctx.textAlign = 'center';
                                                        ctx.textBaseline = 'middle';
                                                        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                                                        ctx.shadowColor = 'rgba(0,0,0,0.5)';
                                                        ctx.shadowBlur = 2;
                                                        ctx.fillText(label, 0, 0);

                                                        ctx.restore();
                                                    }
                                                }}
                                                backgroundColor="rgba(0,0,0,0)"

                                                // Liquid Glass Effect (Same as KnowledgeGraph)
                                                nodeCanvasObject={(node, ctx, globalScale) => {
                                                    const label = (node as any).label || '';
                                                    const nodeValue = (node as any).val || 1;
                                                    const baseRadius = Math.min(Math.max(nodeValue * 2, 4), 10);

                                                    // Check learning status
                                                    const word = label.toLowerCase();
                                                    const card = cardsMap[word];
                                                    const isLearned = card && card.state !== State.New;

                                                    // [MODIFIED] Enhance visuals to match GuidedLearning style
                                                    // Color logic
                                                    let color = '#6366f1'; // default indigo (unlearned)
                                                    if (isLearned) color = '#10b981'; // green (learned)

                                                    // Glow
                                                    ctx.shadowColor = color;
                                                    ctx.shadowBlur = isLearned ? 15 : 10;

                                                    ctx.beginPath();
                                                    ctx.arc(node.x!, node.y!, baseRadius, 0, 2 * Math.PI, false);
                                                    ctx.fillStyle = color;
                                                    ctx.fill();

                                                    // Glass shine
                                                    ctx.shadowBlur = 0;
                                                    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                                                    ctx.beginPath();
                                                    ctx.arc(node.x! - baseRadius * 0.3, node.y! - baseRadius * 0.3, baseRadius * 0.4, 0, 2 * Math.PI, false);
                                                    ctx.fill();

                                                    // Text Label (Liquid style)
                                                    if (globalScale >= 1.5) { // Only show label when zoomed in
                                                        const fontSize = 12 / globalScale;
                                                        ctx.font = `${fontSize}px Sans-Serif`;

                                                        ctx.textAlign = 'center';
                                                        ctx.textBaseline = 'middle';
                                                        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                                                        ctx.fillText(label, node.x!, node.y! + baseRadius + fontSize);
                                                    }
                                                }}

                                                d3VelocityDecay={0.3}
                                                cooldownTicks={100}
                                            />
                                        )
                                    ) : (
                                        <div className="h-full overflow-y-auto p-4 space-y-3">
                                            {selectedCluster.items.map((item) => (
                                                <div
                                                    key={item.id}
                                                    className="p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/5 group"
                                                >
                                                    <div className="flex justify-between items-baseline mb-1">
                                                        <span className="font-bold text-lg">{item.word}</span>
                                                        <span className="text-xs text-white/40 font-mono">{item.phonetic}</span>
                                                    </div>
                                                    <p className="text-sm text-white/70 line-clamp-2">{item.meaning}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}
