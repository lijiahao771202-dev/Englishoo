import React, { useEffect, useState, useRef } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import { EmbeddingService } from '@/lib/embedding';
import { getCardByWord } from '@/lib/db';

interface LocalGraphProps {
  word: string;
  className?: string;
}

/**
 * @description 局部知识网络组件 (Local Knowledge Graph)
 * 展示特定单词的语义关联网络 (Liquid Glass Style)
 */
export const LocalGraph: React.FC<LocalGraphProps> = ({ word, className }) => {
  const graphRef = useRef<ForceGraphMethods | undefined>(undefined);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [meanings, setMeanings] = useState<Record<string, string>>({});
  const [hoverNode, setHoverNode] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 300, height: 300 });

  // Update dimensions
  useEffect(() => {
    if (containerRef.current) {
      setDimensions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight || 300
      });
    }
  }, [loading]);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      setLoading(true);
      try {
        const service = EmbeddingService.getInstance();
        const network = await service.getNetwork(word);
        
        if (!isMounted) return;

        if (network && network.connections.length > 0) {
          const nodes = [{ id: word, group: 1, val: 10 }]; // Central node
          const links: any[] = [];
          const relatedWords = [word];

          network.connections.slice(0, 10).forEach(conn => { // Top 10 connections
            nodes.push({ id: conn.target, group: 2, val: 5 });
            links.push({ source: word, target: conn.target, value: conn.similarity });
            relatedWords.push(conn.target);
          });

          setGraphData({ nodes, links } as any);

          // Fetch meanings for all related words
          const loadedMeanings: Record<string, string> = {};
          await Promise.all(relatedWords.map(async (w) => {
            const card = await getCardByWord(w);
            if (card) {
              loadedMeanings[w] = card.meaning;
            }
          }));
          
          if (isMounted) {
            setMeanings(loadedMeanings);
          }

        } else {
           setGraphData({ nodes: [{ id: word, group: 1, val: 10 }], links: [] } as any);
           // Fetch meaning for the single word
           const card = await getCardByWord(word);
           if (isMounted && card) {
             setMeanings({ [word]: card.meaning });
           }
        }
      } catch (error) {
        console.error('Failed to load local graph:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();
    return () => { isMounted = false; };
  }, [word]);

  return (
    <div ref={containerRef} className={`relative w-full h-full min-h-[300px] rounded-xl overflow-hidden bg-slate-900/50 backdrop-blur-sm border border-white/10 ${className}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && (
        <ForceGraph2D
          ref={graphRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          nodeLabel={() => ""} // Disable default tooltip
          backgroundColor="transparent"
          // showNavInfo={false} // Removing property that doesn't exist on ForceGraphProps
          enableZoomInteraction={false} // Disable zoom for local graph
          enablePanInteraction={false}  // Disable pan for local graph
          onNodeHover={(node) => setHoverNode(node)}
          nodeCanvasObject={(node, ctx, globalScale) => {
            // Safety check: Ensure coordinates are finite numbers
            if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
                return;
            }

            const label = node.id as string;
            const fontSize = (node.group === 1 ? 14 : 12) / globalScale;
            ctx.font = `${fontSize}px Sans-Serif`;
            
            // Node body (Liquid Sphere)
            ctx.beginPath();
            const r = (node.val as number || 5);

            // Safety check for radius
            if (!Number.isFinite(r) || r <= 0) {
                return;
            }

            ctx.arc(node.x!, node.y!, r, 0, 2 * Math.PI, false);
            
            // Gradient for 3D Liquid effect
            try {
                const gradient = ctx.createRadialGradient(
                    node.x! - r/3, node.y! - r/3, r/10,
                    node.x!, node.y!, r
                );
                gradient.addColorStop(0, node.group === 1 ? '#c4b5fd' : '#ddd6fe'); // Highlight
                gradient.addColorStop(1, node.group === 1 ? '#7c3aed' : '#8b5cf6'); // Base
                ctx.fillStyle = gradient;
            } catch (e) {
                ctx.fillStyle = node.group === 1 ? '#7c3aed' : '#8b5cf6';
            }
            
            ctx.fill();
            
            // Glow
            ctx.shadowColor = '#8b5cf6';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            
            // Text Label
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowBlur = 0; // No shadow for text
            ctx.fillText(label, node.x!, node.y! + r + fontSize);

            // Show Chinese meaning on hover
            if (node === hoverNode && meanings[label]) {
              const meaningFontSize = fontSize * 0.8;
              ctx.font = `${meaningFontSize}px Sans-Serif`;
              ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
              // Draw below the English label
              ctx.fillText(meanings[label], node.x!, node.y! + r + fontSize * 2.2);
            }
          }}
        />
      )}
      
      {/* Overlay Info */}
      <div className="absolute bottom-2 right-2 text-[10px] text-white/40 pointer-events-none">
        Semantic Network
      </div>
    </div>
  );
};
