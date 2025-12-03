import React, { useEffect, useState, useRef } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import { EmbeddingService } from '@/lib/embedding';
import { getCardByWord } from '@/lib/db';
import { cn, fuzzyMatch } from '@/lib/utils';
import type { WordCard } from '@/types';
import { ArrowLeft, Share2, Search, ExternalLink, X, BookOpen, Activity, Pause, Play, RefreshCw } from 'lucide-react';
import { State } from 'ts-fsrs';
import { motion, AnimatePresence } from 'framer-motion';

interface KnowledgeGraphProps {
  onBack: () => void;
  deckId?: string;
}

/**
 * @description 全局/卡包知识网络页面
 * 展示单词的语义关联网络
 */
const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ onBack, deckId }) => {
  const graphRef = useRef<ForceGraphMethods | undefined>(undefined);
  // Background Particles for "Cosmic Dust" effect
  const bgParticles = useRef(
    Array.from({ length: 200 }).map(() => ({
        x: (Math.random() - 0.5) * 4000, 
        y: (Math.random() - 0.5) * 4000,
        size: Math.random() * 2 + 0.5,
        alpha: Math.random() * 0.3 + 0.1
    }))
  );
  // Data State
  const [fullData, setFullData] = useState<{ nodes: any[], links: any[] }>({ nodes: [], links: [] });
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [batchIndex, setBatchIndex] = useState(0);
  const BATCH_SIZE = 100;

  // Interaction State
  const [highlightNodes, setHighlightNodes] = useState(new Set());
  const [highlightLinks, setHighlightLinks] = useState(new Set());
  const [hoverNode, setHoverNode] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  
  // Detail Modal State
  const [selectedCard, setSelectedCard] = useState<WordCard | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Responsive resize
  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load Graph Data
  useEffect(() => {
    const loadData = async () => {
      try {
        const service = EmbeddingService.getInstance();
        const data = deckId 
            ? await service.getGraphForDeck(deckId)
            : await service.getGlobalGraph();
        
        // Optimization: Calculate degree for visual sizing (Galaxy Effect)
        const degree: Record<string, number> = {};
        data.links.forEach(link => {
             const source = typeof link.source === 'object' ? (link.source as any).id : link.source;
             const target = typeof link.target === 'object' ? (link.target as any).id : link.target;
             degree[source] = (degree[source] || 0) + 1;
             degree[target] = (degree[target] || 0) + 1;
        });

        // Assign degree to nodes for visual importance
        const nodesWithDegree = data.nodes.map(n => ({
            ...n,
            val: degree[n.id] || 1 // React-Force-Graph uses 'val' for radius by default
        })).sort((a, b) => (b as any).val - (a as any).val); // Sort by importance
        
        setFullData({ nodes: nodesWithDegree, links: data.links } as any);
        
        // Initial batch
        updateGraphBatch(nodesWithDegree, data.links, 0);
        
      } catch (error) {
        console.error('Failed to load knowledge graph:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [deckId]); // Added deckId dependency

  const updateGraphBatch = (nodes: any[], links: any[], batchIdx: number) => {
      const start = batchIdx * BATCH_SIZE;
      const end = start + BATCH_SIZE;
      
      // If we reached the end, loop back
      const actualStart = start >= nodes.length ? 0 : start;
      const actualEnd = start >= nodes.length ? BATCH_SIZE : end;
      
      const currentNodes = nodes.slice(actualStart, actualEnd);
      const currentNodeIds = new Set(currentNodes.map(n => n.id));
      
      // Filter links relevant to current nodes
      const currentLinks = links.filter(l => {
          const source = typeof l.source === 'object' ? l.source.id : l.source;
          const target = typeof l.target === 'object' ? l.target.id : l.target;
          return currentNodeIds.has(source) && currentNodeIds.has(target);
      });
      
      setGraphData({ nodes: currentNodes, links: currentLinks });
      setBatchIndex(start >= nodes.length ? 0 : batchIdx);
  };

  const handleNextBatch = () => {
      updateGraphBatch(fullData.nodes, fullData.links, batchIndex + 1);
      setIsPaused(false); // Resume animation for new data
      graphRef.current?.d3ReheatSimulation();
  };

  // Handle Search
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    
    // 1. Exact Match in FULL DATA
    let targetNode = (fullData.nodes as any[]).find(n => n.id.toLowerCase() === searchTerm.toLowerCase());
    
    // 2. Fuzzy Match (if exact match fails)
    if (!targetNode) {
        // Sort by similarity to find best match
        const matches = (fullData.nodes as any[])
            .filter(n => fuzzyMatch(searchTerm, n.id))
            .sort((a, b) => {
                // Simple length diff heuristic for tie-breaking if fuzzyMatch doesn't return score
                return Math.abs(a.id.length - searchTerm.length) - Math.abs(b.id.length - searchTerm.length);
            });
            
        if (matches.length > 0) {
            targetNode = matches[0];
        }
    }
    
    if (targetNode) {
        // Reconstruct graph data to focus on this node and its context
        const neighbors = new Set<string>();
        neighbors.add(targetNode.id);
        
        // Find neighbors in full links
        (fullData.links as any[]).forEach(link => {
             const source = typeof link.source === 'object' ? link.source.id : link.source;
             const target = typeof link.target === 'object' ? link.target.id : link.target;
             if (source === targetNode.id) neighbors.add(target);
             if (target === targetNode.id) neighbors.add(source);
        });

        // Construct new node list (Target + Neighbors + High Value Nodes to fill BATCH_SIZE)
        let newNodes = [targetNode];
        const neighborNodes = (fullData.nodes as any[]).filter(n => neighbors.has(n.id) && n.id !== targetNode.id);
        newNodes = [...newNodes, ...neighborNodes];

        if (newNodes.length < BATCH_SIZE) {
             const existingIds = new Set(newNodes.map(n => n.id));
             const fillerNodes = (fullData.nodes as any[])
                .filter(n => !existingIds.has(n.id))
                .sort((a, b) => (b.val || 0) - (a.val || 0))
                .slice(0, BATCH_SIZE - newNodes.length);
             newNodes = [...newNodes, ...fillerNodes];
        } else {
             newNodes = newNodes.slice(0, BATCH_SIZE);
        }

        const newNodeIds = new Set(newNodes.map(n => n.id));
        const newLinks = (fullData.links as any[]).filter(l => {
             const source = typeof l.source === 'object' ? l.source.id : l.source;
             const target = typeof l.target === 'object' ? l.target.id : l.target;
             return newNodeIds.has(source) && newNodeIds.has(target);
        });

        setGraphData({ nodes: newNodes, links: newLinks });
        setSearchTerm('');
        
        // Focus view on node after update
        setTimeout(() => {
            handleNodeClick(targetNode);
            graphRef.current?.centerAt(targetNode.x, targetNode.y, 1000);
            graphRef.current?.zoom(6, 2000);
        }, 100);
    }
  };

  const handleViewDetails = async () => {
      if (!hoverNode) return;
      setIsLoadingDetail(true);
      try {
          const card = await getCardByWord(hoverNode.id);
          if (card) {
              setSelectedCard(card);
              setIsDetailOpen(true);
          } else {
              alert('未找到该卡片详细信息');
          }
      } catch (e) {
          console.error(e);
      } finally {
          setIsLoadingDetail(false);
      }
  };

  // Handle Node Click (Focus & Isolate)
  const handleNodeClick = (node: any) => {
    setHoverNode(node);
    
    // Identify neighbors
    const neighbors = new Set();
    const links = new Set();
    
    if (node) {
        neighbors.add(node.id);
        (graphData.links as any[]).forEach(link => {
            if (link.source.id === node.id || link.target.id === node.id) {
                links.add(link);
                neighbors.add(link.source.id);
                neighbors.add(link.target.id);
            }
        });
    }

    setHighlightNodes(neighbors);
    setHighlightLinks(links);

    // Camera Animation
    if (node) {
        graphRef.current?.centerAt(node.x, node.y, 1000);
        graphRef.current?.zoom(4, 2000);
    }
  };

  // Handle Background Click (Reset)
  const handleBackgroundClick = () => {
      setHoverNode(null);
      setHighlightNodes(new Set());
      setHighlightLinks(new Set());
      graphRef.current?.zoomToFit(1000);
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-slate-900 text-white">
      {/* Liquid Glass Background */}
      <div className="absolute inset-0 pointer-events-none">
         <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-500/20 rounded-full blur-[120px]" />
         <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-500/20 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-50 p-6 flex items-center justify-between pointer-events-none">
        <button 
          onClick={onBack}
          className="pointer-events-auto p-3 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 hover:bg-white/10 transition-all group"
        >
          <ArrowLeft className="w-6 h-6 text-white/80 group-hover:text-white" />
        </button>
        
        <div className="flex items-center gap-4 pointer-events-auto">
             {/* Search Bar */}
            <form onSubmit={handleSearch} className="relative group">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <Search className="w-4 h-4 text-white/40 group-focus-within:text-purple-400 transition-colors" />
                </div>
                <input 
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="搜索节点..."
                    className="w-40 focus:w-64 transition-all duration-300 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 placeholder:text-white/20"
                />
            </form>

            <h1 className="hidden md:block text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-200 to-blue-200 tracking-wide">
            知识网络
            </h1>
        </div>

        <div className="w-12" /> {/* Spacer */}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-40">
          <div className="text-white/50 animate-pulse">正在构建神经网络...</div>
        </div>
      )}

      {/* Force Graph */}
      {!loading && (
        <ForceGraph2D
          ref={graphRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          nodeLabel="id"
          nodeRelSize={4}
          
          // Background Effect: Cosmic Dust
          onRenderFramePre={(ctx) => {
            ctx.save();
            bgParticles.current.forEach(p => {
                ctx.beginPath();
                // Draw particles in graph space
                ctx.arc(p.x, p.y, p.size, 0, 2 * Math.PI);
                ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
                ctx.fill();
            });
            ctx.restore();
          }}

          // Node Styling
          nodeColor={node => 
             hoverNode && !highlightNodes.has(node.id) 
               ? 'rgba(167, 139, 250, 0.2)' 
               : '#a78bfa' 
          }

          // Physics Optimization for Large Graphs
          d3VelocityDecay={0.2}
          d3AlphaDecay={0.02}
          warmupTicks={100}
          cooldownTicks={200}
          onEngineStop={() => setIsPaused(true)}
          
          // Link Styling
          linkColor={link => 
             hoverNode && !highlightLinks.has(link)
               ? 'rgba(255, 255, 255, 0.05)' 
               : 'rgba(255, 255, 255, 0.2)' 
          }
          linkWidth={link => highlightLinks.has(link) ? 2 : 0.5}
          
          // Link Optimization: Custom Canvas Object for LOD
          linkCanvasObject={(link, ctx, globalScale) => {
            // LOD: Hide non-highlighted links when zoomed out
            const isHighlighted = highlightLinks.has(link);
            
            if (!isHighlighted && globalScale < 1.5) {
                return; // Skip rendering
            }

            const source = link.source as any;
            const target = link.target as any;

            ctx.beginPath();
            ctx.moveTo(source.x, source.y);
            ctx.lineTo(target.x, target.y);

            if (isHighlighted) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.lineWidth = 2 / globalScale;
            } else {
                // Faint lines for background
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                ctx.lineWidth = 0.5 / globalScale;
            }
            
            ctx.stroke();
          }}
          
          // Particles - Only show when highlighted to save perf
          linkDirectionalParticles={link => highlightLinks.has(link) ? 4 : 0}
          linkDirectionalParticleSpeed={0.01}
          linkDirectionalParticleWidth={2}
          linkDirectionalParticleColor={() => '#a78bfa'}

          // Link Optimization: Custom Canvas Object for LOD
          // Liquid Glass Glow Effect
          nodeCanvasObject={(node, ctx, globalScale) => {
            const label = node.id as string;
            const isHighlighted = !hoverNode || highlightNodes.has(node.id);
            const isPrimary = hoverNode && hoverNode.id === node.id;
            const nodeValue = (node as any).val || 1;
            const baseRadius = Math.min(Math.max(nodeValue * 0.5, 3), 8); 

            // 1. Glow / Shadow
            if (isHighlighted) {
                 ctx.shadowColor = isPrimary ? '#8b5cf6' : '#6366f1';
                 ctx.shadowBlur = isPrimary ? 20 : 10;
            } else {
                 ctx.shadowBlur = 0;
            }

            // 2. Base Circle
            ctx.beginPath();
            ctx.arc(node.x!, node.y!, baseRadius, 0, 2 * Math.PI, false);
            ctx.fillStyle = isPrimary ? '#a78bfa' : (isHighlighted ? '#6366f1' : 'rgba(99, 102, 241, 0.15)');
            ctx.fill();
            
            // 3. "Liquid" Reflection (Top Left) - Only visible when zoomed in a bit
            if (isHighlighted && globalScale > 1.0) {
                ctx.beginPath();
                ctx.ellipse(node.x! - baseRadius*0.3, node.y! - baseRadius*0.3, baseRadius*0.4, baseRadius*0.2, Math.PI / 4, 0, 2 * Math.PI);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.fill();
            }

            // LOD 0: Galaxy View (Zoomed Out)
            // If scale is small, just draw a dot. Skip text.
            if (globalScale < 1.5 && !isHighlighted && !isPrimary) {
                return;
            }

            // LOD 1: Detailed View - Text
            const fontSize = (isPrimary ? 16 : 12) / globalScale;
            ctx.font = `${fontSize}px Sans-Serif`;
            
            // Only show text for important nodes or when zoomed in
            if (globalScale > 2 || isHighlighted || nodeValue > 5) {
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                // Text Outline/Glow for readability
                ctx.shadowColor = 'black';
                ctx.shadowBlur = 4;
                ctx.lineWidth = 2;
                ctx.strokeStyle = 'rgba(0,0,0,0.8)';
                ctx.strokeText(label, node.x!, node.y! + baseRadius + (fontSize/2) + 2);
                
                ctx.fillStyle = isPrimary ? '#fff' : 'rgba(255,255,255,0.9)';
                ctx.fillText(label, node.x!, node.y! + baseRadius + (fontSize/2) + 2);
            }
          }} 
          backgroundColor="rgba(0,0,0,0)"
          onNodeClick={handleNodeClick}
          onBackgroundClick={handleBackgroundClick}
        />
      )}
      
      {/* Top Right Controls */}
      <div className="absolute top-8 right-8 flex flex-col gap-3 z-10">
          {/* Switch Batch Button */}
          <button
            onClick={handleNextBatch}
            className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors backdrop-blur-md border border-white/10 group"
            title="Switch View (Next 1000 nodes)"
          >
            <RefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
          </button>

          {/* Pause/Resume Button */}
          <button
            onClick={() => {
                if (isPaused) {
                    graphRef.current?.resumeAnimation();
                    setIsPaused(false);
                } else {
                    graphRef.current?.pauseAnimation();
                    setIsPaused(true);
                }
            }}
            className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors backdrop-blur-md border border-white/10"
            title={isPaused ? "Resume Simulation" : "Pause Simulation"}
          >
            {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
          </button>
      </div>
      
      {/* Stats Panel (Bottom Left) */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute bottom-8 left-8 p-4 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 max-w-xs pointer-events-none"
      >
        <div className="flex items-center gap-3 mb-2">
            <Share2 className="w-4 h-4 text-purple-300" />
            <span className="text-sm font-medium text-purple-100">网络统计</span>
        </div>
        <div className="text-xs text-white/60 space-y-1">
            <p>已连接节点: <span className="text-white">{graphData.nodes.length}</span></p>
            <p>语义突触: <span className="text-white">{graphData.links.length}</span></p>
        </div>
      </motion.div>

      {/* Selected Node Actions (Bottom Right) */}
      <AnimatePresence>
        {hoverNode && (
            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.9 }}
                className="absolute bottom-8 right-8 flex flex-col items-end gap-2"
            >
                <div className="p-4 rounded-2xl bg-slate-900/80 backdrop-blur-xl border border-purple-500/30 shadow-[0_0_30px_rgba(139,92,246,0.2)] max-w-xs text-right">
                    <h3 className="text-xl font-bold text-white mb-1 flex items-center justify-end gap-2">
                        {hoverNode.id}
                        <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                    </h3>
                    <p className="text-xs text-purple-200/60 mb-3">已发现 {highlightNodes.size - 1} 个关联词</p>
                    
                    <button 
                        onClick={handleViewDetails}
                        disabled={isLoadingDetail}
                        className="w-full py-2 px-4 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white text-xs font-medium transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {isLoadingDetail ? (
                            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <ExternalLink className="w-3 h-3" />
                        )}
                        查看卡片详情
                    </button>
                </div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* Detail Modal */}
      <AnimatePresence>
        {isDetailOpen && selectedCard && (
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsDetailOpen(false)}
            >
                <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    onClick={e => e.stopPropagation()}
                    className="w-full max-w-md bg-slate-900/90 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
                >
                    {/* Header */}
                    <div className="relative h-32 bg-gradient-to-br from-indigo-900 to-purple-900 p-6 flex flex-col justify-end">
                        <button 
                            onClick={() => setIsDetailOpen(false)}
                            className="absolute top-4 right-4 p-2 rounded-full bg-black/20 text-white/70 hover:bg-black/40 hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        <h2 className="text-4xl font-bold text-white mb-1">{selectedCard.word}</h2>
                        <div className="flex items-center gap-2 text-white/60 text-sm">
                            {selectedCard.phonetic && <span>/{selectedCard.phonetic}/</span>}
                            <span className="px-2 py-0.5 rounded-full bg-white/10 text-xs border border-white/10">
                                {selectedCard.state === State.New ? '新词' : '复习中'}
                            </span>
                        </div>
                    </div>
                    
                    {/* Content */}
                    <div className="p-6 space-y-6">
                         {/* Meaning */}
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-xs font-bold text-purple-400 uppercase tracking-wider">
                                <BookOpen className="w-3 h-3" /> 释义
                            </label>
                            <p className="text-lg text-white/90 leading-relaxed">{selectedCard.meaning}</p>
                        </div>
                        
                        {/* Example */}
                        {selectedCard.example && (
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-xs font-bold text-blue-400 uppercase tracking-wider">
                                    <Activity className="w-3 h-3" /> 例句
                                </label>
                                <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-white/80 italic">
                                    "{selectedCard.example}"
                                    {selectedCard.exampleTranslate && (
                                        <div className="mt-2 text-sm text-white/50 not-italic">
                                            {selectedCard.exampleTranslate}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        
                        {/* Stats */}
                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
                             <div className="text-center p-3 rounded-lg bg-white/5">
                                <div className="text-xs text-white/40 mb-1">下次复习</div>
                                <div className="text-sm font-bold text-purple-300">
                                    {new Date(selectedCard.due).toLocaleDateString()}
                                </div>
                             </div>
                             <div className="text-center p-3 rounded-lg bg-white/5">
                                <div className="text-xs text-white/40 mb-1">熟悉度</div>
                                <div className="text-sm font-bold text-blue-300">
                                    {selectedCard.isFamiliar ? '已掌握' : '学习中'}
                                </div>
                             </div>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default KnowledgeGraph;
