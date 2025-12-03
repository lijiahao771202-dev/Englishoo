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
                            开始学习 ({selectedClusters.size} 组)
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
                        "flex-1 overflow-y-auto pr-2 transition-all duration-500",
                        selectedCluster ? "w-1/2" : "w-full"
                    )}>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
                            {visibleClusters.map((cluster, idx) => {
                                const isCurrent = idx === currentClusterIndex;
                                const isCompleted = cluster.learned === cluster.total && cluster.total > 0;
                                const isSelected = selectedClusters.has(cluster.label);
                                
                                return (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3 }}
                                    onClick={() => {
                                        setSelectedCluster(cluster);
                                        setViewMode('graph'); // Default to graph view
                                    }}
                                    className={cn(
                                        "text-left group relative overflow-hidden rounded-xl p-5 transition-all duration-300 cursor-pointer",
                                        "border border-white/5 hover:border-white/20",
                                        selectedCluster === cluster 
                                            ? "bg-blue-500/10 border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.2)]" 
                                            : (isCurrent 
                                                ? "bg-blue-500/5 border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.1)]" 
                                                : "glass-panel hover:bg-white/5"),
                                        isSelected && "ring-2 ring-blue-500/50 bg-blue-500/5"
                                    )}
                                >
                                    {/* Selection Checkbox */}
                                    <div 
                                        className="absolute top-3 left-3 z-10"
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
                                            "w-5 h-5 rounded border transition-all flex items-center justify-center",
                                            isSelected 
                                                ? "bg-blue-500 border-blue-500 text-white" 
                                                : "border-white/20 hover:border-white/40 bg-black/20"
                                        )}>
                                            {isSelected && <Check className="w-3.5 h-3.5" />}
                                        </div>
                                    </div>

                                    {/* Current Indicator */}
                                    {isCurrent && (
                                        <div className="absolute top-3 right-3 flex h-2.5 w-2.5">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
                                        </div>
                                    )}
                                    
                                    {/* Completed Indicator */}
                                    {isCompleted && (
                                        <div className="absolute top-3 right-3 text-green-400/80">
                                            <CheckCircle2 className="w-4 h-4" />
                                        </div>
                                    )}

                                    <div className="flex justify-between items-start mb-3">
                                        <div className={cn(
                                            "p-2 rounded-lg transition-colors",
                                            isCurrent ? "bg-cyan-500/20 text-cyan-300" : (isCompleted ? "bg-green-500/20 text-green-300" : "bg-blue-500/20 text-blue-300")
                                        )}>
                                            {isCurrent ? <BookOpen className="w-5 h-5" /> : <Target className="w-5 h-5" />}
                                        </div>
                                        {!isCurrent && !isCompleted && (
                                            <span className="text-xs font-mono text-white/40 bg-black/20 px-2 py-1 rounded-full">
                                                {cluster.items.length} 词
                                            </span>
                                        )}
                                    </div>
                                    
                                    <h3 className="text-lg font-bold text-white mb-1 group-hover:text-blue-300 transition-colors pr-4">
                                        {cluster.label}
                                    </h3>
                                    
                                    <div className="flex flex-wrap gap-1 mt-3 opacity-60 mb-3">
                                        {cluster.items.slice(0, 3).map(item => (
                                            <span key={item.id} className="text-xs bg-white/5 px-1.5 py-0.5 rounded">
                                                {item.word}
                                            </span>
                                        ))}
                                        {cluster.items.length > 3 && (
                                            <span className="text-xs px-1">...</span>
                                        )}
                                    </div>

                                    {/* Progress Bar */}
                                    <div className="space-y-1.5 mt-auto pt-2 border-t border-white/5">
                                        <div className="flex justify-between text-[10px] font-medium uppercase tracking-wider text-white/40">
                                            <span>{isCurrent ? '正在学习' : (isCompleted ? '已完成' : '进度')}</span>
                                            <span>{cluster.learned} / {cluster.total}</span>
                                        </div>
                                        <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                                            <div 
                                                className={cn(
                                                    "h-full transition-all duration-500",
                                                    isCompleted ? "bg-green-500" : "bg-gradient-to-r from-cyan-400 to-blue-500"
                                                )}
                                                style={{ width: `${cluster.progress}%` }}
                                            />
                                        </div>
                                    </div>
                                </motion.div>
                            )})}
                            
                            {/* Sentinel for infinite scroll */}
                            {visibleCount < clusters.length && (
                                <div ref={loadMoreRef} className="col-span-full flex justify-center py-8">
                                    <Loader2 className="w-6 h-6 animate-spin text-white/30" />
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
