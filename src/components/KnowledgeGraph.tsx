import React, { useEffect, useRef, useState, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Check } from 'lucide-react';
import { addToVocabularyDeck } from '@/lib/db';
import { cn } from '@/lib/utils';

interface GraphData {
  nodes: Array<{ id: string; label: string; type: string; level?: number; meaning?: string }>;
  links: Array<{ source: string; target: string; label: string }>;
}

interface KnowledgeGraphProps {
  data: GraphData;
  isOpen: boolean;
  onClose: () => void;
}

interface GraphNode {
  id: string;
  label: string;
  type: string;
  level?: number;
  meaning?: string;
  x?: number;
  y?: number;
}

interface GraphLink {
  source: GraphNode & { x: number; y: number };
  target: GraphNode & { x: number; y: number };
  label?: string;
}



/**
 * @description 知识图谱组件 (Liquid Glass Style)
 * 使用 react-force-graph-2d 渲染，配合自定义的 Canvas 绘制实现液态玻璃效果
 */
export function KnowledgeGraph({ data, isOpen, onClose }: KnowledgeGraphProps) {
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ w: 300, h: 300 });
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const hoverTimeoutRef = useRef<any>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [addedWords, setAddedWords] = useState<Set<string>>(new Set());

  // Optimization: Limit to top 500 nodes to prevent lag
  const processedData = useMemo(() => {
    if (!data || !data.nodes) return { nodes: [], links: [] };

    // Calculate degree for each node
    const degree: Record<string, number> = {};
    data.links.forEach(link => {
      const source = typeof link.source === 'object' ? (link.source as any).id : link.source;
      const target = typeof link.target === 'object' ? (link.target as any).id : link.target;
      degree[source] = (degree[source] || 0) + 1;
      degree[target] = (degree[target] || 0) + 1;
    });
    
    // Sort nodes by degree
    const sortedNodes = [...data.nodes].sort((a, b) => (degree[b.id] || 0) - (degree[a.id] || 0));
    
    // Take top 500 nodes
    const limit = 500;
    const topNodes = sortedNodes.slice(0, limit);
    const topNodeIds = new Set(topNodes.map(n => n.id));
    
    // Filter links
    const filteredLinks = data.links.filter(l => {
      const source = typeof l.source === 'object' ? (l.source as any).id : l.source;
      const target = typeof l.target === 'object' ? (l.target as any).id : l.target;
      return topNodeIds.has(source) && topNodeIds.has(target);
    });

    return { nodes: topNodes, links: filteredLinks };
  }, [data]);

  // 响应式调整大小
  useEffect(() => {
    if (isOpen && containerRef.current) {
      setDimensions({
        w: containerRef.current.clientWidth,
        h: containerRef.current.clientHeight
      });
    }
  }, [isOpen]);

  const handleAddWord = async (word: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (addedWords.has(word) || isAdding) return;

    setIsAdding(true);
    try {
        const result = await addToVocabularyDeck(word);
        if (result.success) {
            setAddedWords(prev => new Set(prev).add(word));
        }
    } catch (error) {
        console.error("Failed to add word:", error);
    } finally {
        setIsAdding(false);
    }
  };

  // 节点绘制函数 (Liquid Glass Effect)
  const paintNode = (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    // Cast node to GraphNode with coordinates
    const n = node as GraphNode;
    // Safety check for coordinates
    if (n.x === undefined || n.y === undefined || !Number.isFinite(n.x) || !Number.isFinite(n.y)) return;

    const label = n.label;
    const fontSize = (n.level === 1 ? 14 : n.level === 2 ? 12 : 10) / globalScale;
    
    // Calculate dynamic radius based on text width
    ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
    const textMetrics = ctx.measureText(label);
    const textWidth = textMetrics.width;
    
    const level = n.level || (n.type === 'main' ? 1 : 2);
    const baseRadius = level === 1 ? 18 : (level === 2 ? 12 : 8);
    // Ensure radius is large enough to contain text with some padding
    const radius = Math.max(baseRadius, (textWidth / 2) + (8 / globalScale));

    // --- 1. Outer Glow (Soft Shadow) ---
    if (level === 1) {
        ctx.shadowColor = 'rgba(255, 200, 100, 0.6)';
    } else if (level === 2) {
        ctx.shadowColor = 'rgba(100, 200, 255, 0.4)';
    } else {
        ctx.shadowColor = 'rgba(150, 100, 255, 0.3)';
    }
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    // --- 2. Base Sphere (Glassy Gradient) ---
    ctx.beginPath();
    ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI, false);
    
    // Complex Radial Gradient for 3D Glass Effect
    const gradient = ctx.createRadialGradient(
        n.x - radius * 0.3, n.y - radius * 0.3, radius * 0.1, 
        n.x, n.y, radius
    );
    
    if (level === 1) {
        // Warm Gold / Amber for Main Node
        gradient.addColorStop(0, 'rgba(255, 255, 240, 0.95)');   // Core highlight
        gradient.addColorStop(0.4, 'rgba(255, 220, 100, 0.8)');  // Body color
        gradient.addColorStop(0.8, 'rgba(200, 150, 50, 0.6)');   // Darker edge
        gradient.addColorStop(1, 'rgba(150, 100, 0, 0.4)');     // Rim shadow
    } else if (level === 2) {
        // Icy Blue / Cyan for Secondary Nodes
        gradient.addColorStop(0, 'rgba(240, 255, 255, 0.9)');    // Core highlight
        gradient.addColorStop(0.4, 'rgba(100, 220, 255, 0.7)');  // Body color
        gradient.addColorStop(0.8, 'rgba(50, 150, 220, 0.5)');   // Darker edge
        gradient.addColorStop(1, 'rgba(0, 80, 150, 0.3)');       // Rim shadow
    } else {
        // Lavender / Soft Purple for Tertiary Nodes
        gradient.addColorStop(0, 'rgba(250, 240, 255, 0.9)');    // Core highlight
        gradient.addColorStop(0.4, 'rgba(200, 180, 255, 0.7)');  // Body color
        gradient.addColorStop(0.8, 'rgba(150, 100, 220, 0.5)');  // Darker edge
        gradient.addColorStop(1, 'rgba(100, 50, 180, 0.3)');     // Rim shadow
    }
    
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // Reset shadow for next operations to avoid performance hit/messy look
    ctx.shadowBlur = 0;

    // --- 3. Label Text (Inside Node) ---
    ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Use darker colors for text inside the light bubbles for better contrast
    if (level === 1) {
        ctx.fillStyle = 'rgba(100, 70, 0, 0.9)'; // Dark Brown for Gold
    } else if (level === 2) {
        ctx.fillStyle = 'rgba(0, 60, 100, 0.9)'; // Dark Blue for Cyan
    } else {
        ctx.fillStyle = 'rgba(70, 30, 100, 0.9)'; // Dark Purple for Lavender
    }
    
    // Center text
    ctx.fillText(label, n.x, n.y);

    // --- 4. Inner Specular Highlight (Reflection) ---
    // Simulates overhead light reflection on the glass surface
    // Draw reflection ON TOP of text for "embedded" look
    ctx.beginPath();
    ctx.ellipse(
        n.x - radius * 0.35, 
        n.y - radius * 0.35, 
        radius * 0.25, 
        radius * 0.15, 
        Math.PI / 4, 
        0, 2 * Math.PI
    );
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'; // Slightly more transparent to not obscure text too much
    ctx.fill();

    // --- 5. Rim Light (Edge Definition) ---
    // Sharp, thin white border to define the glass edge
    ctx.beginPath();
    ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI, false);
    ctx.lineWidth = 1.5 / globalScale;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.stroke();
    
    // Bottom highlight (Secondary reflection)
    ctx.beginPath();
    ctx.arc(n.x, n.y, radius - 1, 0.2 * Math.PI, 0.8 * Math.PI, false);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2 / globalScale;
    ctx.stroke();
    
    // Reset shadow
    ctx.shadowBlur = 0;
  };

  // 连线绘制 (Glowing Neon Line)
  const paintLink = (link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const l = link as GraphLink;
    const start = l.source;
    const end = l.target;

    // Safety check for coordinates
    if (start.x === undefined || start.y === undefined || end.x === undefined || end.y === undefined ||
        !Number.isFinite(start.x) || !Number.isFinite(start.y) || !Number.isFinite(end.x) || !Number.isFinite(end.y)) return;

    // Glow Effect for Link
    ctx.shadowColor = 'rgba(100, 200, 255, 0.5)';
    ctx.shadowBlur = 5;
    
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.lineWidth = 1.5 / globalScale;
    
    // Gradient Stroke (Simulating energy flow)
    const gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
    gradient.addColorStop(0, 'rgba(100, 200, 255, 0.2)');
    gradient.addColorStop(0.5, 'rgba(150, 220, 255, 0.6)');
    gradient.addColorStop(1, 'rgba(100, 200, 255, 0.2)');
    
    ctx.strokeStyle = gradient;
    ctx.stroke();
    
    // Reset shadow
    ctx.shadowBlur = 0;

    // 关系标签 (中文)
    if (l.label) {
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2;
        const fontSize = 10 / globalScale;
        
        // Draw pill background for label
        const textWidth = ctx.measureText(l.label).width;
        const padding = 4 / globalScale;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.roundRect(
            midX - textWidth/2 - padding, 
            midY - fontSize/2 - padding, 
            textWidth + padding*2, 
            fontSize + padding*2, 
            4
        );
        ctx.fill();

        // Draw text
        ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(l.label, midX, midY);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-4xl aspect-square md:aspect-video glass-panel overflow-hidden flex flex-col">
            {/* Header */}
            <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-10 pointer-events-none">
                <h3 className="text-xl font-bold text-white/80 pointer-events-auto bg-black/20 px-4 py-2 rounded-full backdrop-blur-md border border-white/10">
                    单词知识图谱
                </h3>
                <button 
                    onClick={onClose}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white pointer-events-auto transition-colors"
                >
                    <X className="w-6 h-6" />
                </button>
            </div>

            {/* Graph Container */}
            <div ref={containerRef} className="flex-1 w-full h-full cursor-move relative">
                <ForceGraph2D
                    ref={fgRef}
                    width={dimensions.w}
                    height={dimensions.h}
                    graphData={processedData}
                    nodeLabel={() => ''} // Disable default tooltip
                    nodeCanvasObject={paintNode}
                    linkCanvasObject={paintLink}
                    linkDirectionalParticles={2}
                    linkDirectionalParticleWidth={2}
                    linkDirectionalParticleSpeed={0.005}
                    backgroundColor="rgba(0,0,0,0)" // 透明背景
                    d3AlphaDecay={0.05} // 较慢的衰减，使动画更平滑
                    d3VelocityDecay={0.3}
                    cooldownTicks={100}
                    onEngineStop={() => fgRef.current?.zoomToFit(400)}
                    onNodeHover={(node) => {
                        if (node) {
                            if (hoverTimeoutRef.current) {
                                clearTimeout(hoverTimeoutRef.current);
                                hoverTimeoutRef.current = null;
                            }
                            setHoveredNode(node);
                            if (fgRef.current) {
                                const coords = fgRef.current.graph2ScreenCoords(node.x, node.y);
                                setTooltipPos(coords);
                            }
                        } else {
                            // Delay hiding to allow moving to tooltip
                            hoverTimeoutRef.current = setTimeout(() => {
                                setHoveredNode(null);
                            }, 300);
                        }
                    }}
                />
                
                {/* Custom Liquid Glass Tooltip */}
                <AnimatePresence>
                    {hoveredNode && hoveredNode.meaning && (
                        <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            style={{ 
                                left: tooltipPos.x, 
                                top: tooltipPos.y + 30, // Offset further below node
                                position: 'absolute',
                                transform: 'translateX(-50%)' // Center horizontally
                            }}
                            className="z-50 pointer-events-auto"
                            onMouseEnter={() => {
                                if (hoverTimeoutRef.current) {
                                    clearTimeout(hoverTimeoutRef.current);
                                    hoverTimeoutRef.current = null;
                                }
                            }}
                            onMouseLeave={() => {
                                hoverTimeoutRef.current = setTimeout(() => {
                                    setHoveredNode(null);
                                }, 300);
                            }}
                        >
                            <div className="bg-slate-900/90 backdrop-blur-xl border border-white/20 px-4 py-3 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] text-center min-w-[140px] flex flex-col items-center gap-2">
                                <div>
                                    <div className="font-bold text-white text-base mb-1.5 tracking-wide select-text">{hoveredNode.label}</div>
                                    <div className="text-sm text-yellow-300 font-medium bg-white/5 px-3 py-1.5 rounded-lg border border-white/5 select-text">
                                        {hoveredNode.meaning}
                                    </div>
                                </div>
                                
                                {/* Add to Vocabulary Button */}
                                <button
                                    onClick={(e) => handleAddWord(hoveredNode.label, e)}
                                    disabled={addedWords.has(hoveredNode.label)}
                                    className={cn(
                                        "w-full py-1.5 rounded-lg text-xs flex items-center justify-center gap-1 transition-colors",
                                        addedWords.has(hoveredNode.label)
                                            ? "bg-green-500/20 text-green-300 cursor-default"
                                            : "bg-white/10 hover:bg-blue-500/20 text-white hover:text-blue-300"
                                    )}
                                >
                                    {addedWords.has(hoveredNode.label) ? (
                                        <>
                                            <Check className="w-3 h-3" /> 已添加
                                        </>
                                    ) : (
                                        <>
                                            <Plus className="w-3 h-3" /> 加入生词本
                                        </>
                                    )}
                                </button>

                                {/* Tooltip Arrow */}
                                <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[8px] border-b-slate-900/90"></div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            
            <div className="absolute bottom-4 left-4 text-xs text-white/40 pointer-events-none">
                * 可拖拽节点与画布，滚轮缩放，悬浮查看中文，点击加入生词本
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
