import React, { useState, useRef, useEffect, useCallback } from 'react';
import ForceGraph2D, { type ForceGraphMethods, type NodeObject } from 'react-force-graph-2d';
import * as d3 from 'd3-hierarchy';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Sparkles, RotateCcw, BrainCircuit, Lock, Unlock, Star, Map as MapIcon, Volume2, CheckCircle, Check, X, Clock, Target, ArrowRight, Loader2 } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { generateCurriculum, getLevelDetail, type CurriculumLevel } from '@/lib/curriculum';
import { getAllDecks, saveCard, getSemanticConnections, saveSemanticConnections, getCardsByIds } from '@/lib/db';
import { cn } from '@/lib/utils';
import { speak } from '@/lib/tts';
import { playClickSound, playSuccessSound, playFailSound, playPassSound, playSpellingSuccessSound } from '@/lib/sounds';
import { Flashcard } from '@/components/Flashcard';
import type { WordCard } from '@/types';
import { enrichWord, generateExample, generateMnemonic, generateMeaning, generatePhrases, generateDerivatives, generateRoots, generateSyllables, generateEdgeLabels, generateBridgingExample } from '@/lib/deepseek';
import { EmbeddingService } from '@/lib/embedding';
import { Rating, State } from 'ts-fsrs';

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
}

// 扩展 NodeObject 类型以包含自定义属性
interface CustomNode extends NodeObject {
  id: string;
  label: string;
  meaning?: string;
  type: 'root' | 'topic' | 'related' | 'other';
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

export default function GuidedLearningSession({ onBack, apiKey, cards, onRate, sessionGroups, onUpdateCard }: GuidedLearningSessionProps) {
  const [mode, setMode] = useState<'map' | 'session'>('map');
  const [levels, setLevels] = useState<CurriculumLevel[]>([]);
  const [currentLevel, setCurrentLevel] = useState<CurriculumLevel | null>(null);
  const [deckName, setDeckName] = useState('');
  
  // Session State
  const [graphData, setGraphData] = useState<{ nodes: CustomNode[], links: any[] } | null>(null);
  const graphRef = useRef<ForceGraphMethods | undefined>(undefined);
  // [NEW] 存储语义引力连接 (Semantic Gravity Links)
  const semanticLinksRef = useRef<Array<{source: string, target: string, similarity: number}>>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  // 记录上一次处理的组标签，避免因卡片内容更新导致的重复图谱生成
  const lastProcessedGroupLabelRef = useRef<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Learning State
  const [phase, setPhase] = useState<LearningPhase>('overview');
  const [queue, setQueue] = useState<SessionItem[]>([]);
  const [completedNodeIds, setCompletedNodeIds] = useState<Set<string>>(new Set());
  const [sessionStats, setSessionStats] = useState({ correct: 0, total: 0, startTime: 0 });
  
  // Group State
  const [activeGroupIndex, setActiveGroupIndex] = useState<number>(-1);

  // Connection Learning State
  const [connectionQueue, setConnectionQueue] = useState<any[]>([]); // Links to learn
  const [currentConnectionIndex, setCurrentConnectionIndex] = useState(0);
  
  // Interaction State
  const [hoveredLink, setHoveredLink] = useState<any>(null);
  const [hoveredNode, setHoveredNode] = useState<any>(null);
  const [isHoveringCard, setIsHoveringCard] = useState(false); // [NEW] Track if hovering card to prevent graph interaction
  const [justLearnedNodeId, setJustLearnedNodeId] = useState<string | null>(null);
  // Highlighted Neighbor State (Cross-Highlighting)
  const [highlightedNeighborId, setHighlightedNeighborId] = useState<string | null>(null);
  const [isGraphGenerating, setIsGraphGenerating] = useState(false);

  // Interleaved Learning State
  const [isEnriching, setIsEnriching] = useState(false);
  const [choiceOptions, setChoiceOptions] = useState<WordCard[]>([]);
  const [choiceResult, setChoiceResult] = useState<'correct' | 'incorrect' | null>(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [testResult, setTestResult] = useState<'correct' | 'incorrect' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentItem = queue[0];

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

  // Monitor Queue to Switch Groups
  useEffect(() => {
      if (!queue.length || !sessionGroups || sessionGroups.length === 0) return;
      // currentItem is queue[0]
      const currentCard = queue[0].card; 
      
      const groupIndex = sessionGroups.findIndex(g => g.items.some(c => c.id === currentCard.id));
      if (groupIndex !== -1 && groupIndex !== activeGroupIndex) {
          setActiveGroupIndex(groupIndex);
      }
  }, [queue, sessionGroups]);

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
          
          const links: Array<{source: string, target: string, similarity: number}> = [];
          
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
            const hasUnlearned = group.items.some(c => c.state === State.New);
            if (hasUnlearned) {
                startGroupIndex = i;
                break;
            }
        }
        
        // If all learned, start at 0
        const allLearned = sessionGroups.every(g => g.items.every(c => c.state !== State.New));
        if (allLearned) {
            startGroupIndex = 0; 
        }

        setActiveGroupIndex(startGroupIndex);
        
        // 3. Load Queue for the Start Group ONLY
        await loadGroupQueue(startGroupIndex);

        setMode('session');
    } else {
        // Review Mode: Queue follows input order (FSRS)
        const newQueue: SessionItem[] = sessionCards.map(card => ({
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
      // But if we are in a "Review All" context, we might want all.
      // Assuming "Guided Learning" = Learn New.
      const unlearnedItems = sortedItems.filter(c => c.state === State.New);
      
      const newQueue: SessionItem[] = unlearnedItems.map(card => ({
          card,
          type: 'learn',
          nodeId: card.id
      }));
      
      setQueue(newQueue);
      
      // Graph update is handled by useEffect monitoring activeGroupIndex
  };

  const updateGraphForGroup = async (group: { label: string; items: WordCard[] }, forceRefresh = false) => {
      setIsGraphGenerating(true);
      try {
          const db = EmbeddingService.getInstance();
          
          // 1. Create Nodes
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

          // 2. Compute Internal Connections (Real-time)
          // [MODIFIED] Lower threshold to 0.6 to allow more connections
          const groupWords = group.items.map(c => c.word);
          const allConnections = await db.computeGroupConnections(groupWords, 0.6); 

          // [MODIFIED] Simplify Graph Logic: Keep only top-4 strongest connections per node
          const simplifiedLinks: any[] = [];
          const linkSet = new Set<string>(); // Track unique "source-target" keys

          // Helper to get sorted key
          const getLinkKey = (a: string, b: string) => [a, b].sort().join(':');

          // For each word, pick its top 4 connections
          groupWords.forEach(word => {
              const w = word.toLowerCase();
              // Find connections involving this word
              const myConnections = allConnections.filter(c => c.source === w || c.target === w);
              // Sort by similarity
              myConnections.sort((a, b) => b.similarity - a.similarity);
              // Take top 4
              const topK = myConnections.slice(0, 4);
              
              topK.forEach(conn => {
                  const key = getLinkKey(conn.source, conn.target);
                  if (!linkSet.has(key)) {
                      linkSet.add(key);
                      
                      // Map back to Node IDs
                      const sourceId = nodeIdMap.get(conn.source);
                      const targetId = nodeIdMap.get(conn.target);

                      if (sourceId && targetId) {
                          simplifiedLinks.push({
                              source: sourceId,
                              target: targetId,
                              label: '', // To be filled
                              similarity: conn.similarity
                          });
                      }
                  }
              });
          });

          // 3. Check Persistence & Generate Missing Labels
          const pairsToLabel: { source: string; target: string }[] = [];
          const linksWithLabels = [...simplifiedLinks];

          // Load stored connections
          if (!forceRefresh) {
              // We need to check each link for an existing label
              // Optimization: Load all source words involved? 
              // Or just check one by one. Given limited size (e.g. 20 words * 4 links = 80 links), it's fast enough.
              // Even better: getSemanticConnections returns ALL connections for a source.
              
              const sourceWords = new Set(simplifiedLinks.map(l => {
                  const node = nodes.find(n => n.id === l.source);
                  return node?.label.toLowerCase();
              }));
              
              const storedConnectionsMap = new Map<string, any>(); // word -> { connections: [] }
              
              await Promise.all(Array.from(sourceWords).map(async (word) => {
                  if (!word) return;
                  const stored = await getSemanticConnections(word);
                  if (stored) storedConnectionsMap.set(word, stored);
              }));

              // Apply stored labels
              linksWithLabels.forEach(link => {
                  const sourceLabel = nodes.find(n => n.id === link.source)?.label;
                  const targetLabel = nodes.find(n => n.id === link.target)?.label;
                  
                  if (!sourceLabel || !targetLabel) return;

                  let foundLabel = '';
                  
                  // Check source -> target
                  const storedSrc = storedConnectionsMap.get(sourceLabel.toLowerCase());
                  if (storedSrc) {
                      const conn = storedSrc.connections.find((c: any) => c.target === targetLabel.toLowerCase());
                      if (conn && conn.label) foundLabel = conn.label;
                  }
                  
                  // Check target -> source (if undirected)
                  if (!foundLabel) {
                      const storedTgt = storedConnectionsMap.get(targetLabel.toLowerCase());
                      if (storedTgt) {
                          const conn = storedTgt.connections.find((c: any) => c.target === sourceLabel.toLowerCase());
                          if (conn && conn.label) foundLabel = conn.label;
                      }
                  }

                  if (foundLabel) {
                      link.label = foundLabel;
                  } else {
                      pairsToLabel.push({ source: sourceLabel, target: targetLabel });
                  }
              });
          } else {
              // Force Refresh: Treat all as needing labels
               simplifiedLinks.forEach(link => {
                  const sourceLabel = nodes.find(n => n.id === link.source)?.label;
                  const targetLabel = nodes.find(n => n.id === link.target)?.label;
                  if (sourceLabel && targetLabel) {
                      pairsToLabel.push({ source: sourceLabel, target: targetLabel });
                  }
               });
          }

          // 4. Generate Labels for Missing Pairs (Blocking)
          if (pairsToLabel.length > 0 && apiKey) {
              // Increased limit to 100 to ensure better coverage
              const batchSize = 100;
              const batches = [];
              for (let i = 0; i < pairsToLabel.length; i += batchSize) {
                  batches.push(pairsToLabel.slice(i, i + batchSize));
              }
              
              const results = await Promise.all(batches.map(batch => generateEdgeLabels(batch, apiKey)));
              const allLabeledPairs = results.flat();

              // Update links with new labels
              linksWithLabels.forEach(link => {
                   const srcId = typeof link.source === 'object' ? link.source.id : link.source;
                   const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
                   const srcLabel = nodes.find(n => n.id === srcId)?.label;
                   const tgtLabel = nodes.find(n => n.id === tgtId)?.label;
                   
                   const match = allLabeledPairs.find(p => 
                       (p.source === srcLabel && p.target === tgtLabel) || 
                       (p.source === tgtLabel && p.target === srcLabel)
                   );
                   if (match) link.label = match.label;
              });

              // Save to DB (Async)
              (async () => {
                  for (const pair of allLabeledPairs) {
                      const sourceWord = pair.source.toLowerCase();
                      const targetWord = pair.target.toLowerCase();
                      const label = pair.label;

                      // Update Source -> Target
                      const stored = await getSemanticConnections(sourceWord) || { source: sourceWord, connections: [] };
                      const existingConnIndex = stored.connections.findIndex(c => c.target === targetWord);
                      
                      if (existingConnIndex !== -1) {
                          stored.connections[existingConnIndex].label = label;
                          await saveSemanticConnections(stored);
                      }

                      // Also update Target -> Source (Bidirectional logic)
                      const storedTgt = await getSemanticConnections(targetWord) || { source: targetWord, connections: [] };
                      const existingConnIndexTgt = storedTgt.connections.findIndex(c => c.target === sourceWord);
                      if (existingConnIndexTgt !== -1) {
                          storedTgt.connections[existingConnIndexTgt].label = label;
                          await saveSemanticConnections(storedTgt);
                      }
                  }
              })();
          }

          setGraphData({ nodes, links: linksWithLabels });
      } finally {
          setIsGraphGenerating(false);
      }
  };

  const updateGraphForContext = async (card: WordCard) => {
      const db = EmbeddingService.getInstance();
      const neighbors = await db.getNeighbors(card.word);
      
      // Center Node
      const nodes: CustomNode[] = [{
          id: card.id,
          label: card.word,
          meaning: card.meaning,
          type: 'topic',
          val: 30,
          group: 1,
          data: card
      }];

      // Add neighbors (limit to 5-8 to avoid clutter)
      const contextNeighbors = neighbors.slice(0, 6);
      
      contextNeighbors.forEach(n => {
           // Only add if not already present (though unlikely for neighbors)
           if (!nodes.some(existing => existing.id === n.card.id)) {
               nodes.push({
                   id: n.card.id,
                   label: n.card.word,
                   meaning: n.card.meaning,
                   type: 'related',
                   val: 15,
                   group: 2,
                   data: n.card
               });
           }
      });

      const links = contextNeighbors.map(n => ({
          source: card.id,
          target: n.card.id,
          label: ''
      }));
      
      const pairs = contextNeighbors.map(n => ({
          source: card.word,
          target: n.card.word
      }));

      setGraphData({ nodes, links });
      
      if (pairs.length > 0 && apiKey) {
           generateEdgeLabels(pairs, apiKey).then(labeledPairs => {
               setGraphData(prev => {
                   if (!prev) return null;
                   const newLinks = prev.links.map(link => {
                       const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
                       const tgtLabel = prev.nodes.find(n => n.id === tgtId)?.label;
                       
                       // Since all links are from source card, we just match target or source
                       const match = labeledPairs.find(p => 
                           (p.source === card.word && p.target === tgtLabel) || 
                           (p.source === tgtLabel && p.target === card.word)
                       );
                       return match ? { ...link, label: match.label } : link;
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
      // 考虑左侧面板遮挡 (默认面板在左侧，宽度约 500px)
      // [MODIFIED] Only account for panel if it's actually visible
      const isPanelVisible = mode === 'session' && phase === 'word-learning';
      const isDesktop = dimensions.width > 768;
      const PANEL_WIDTH = (isDesktop && isPanelVisible) ? 520 : 0; 
      
      // 计算剩余可用空间的尺寸
      const availableW = dimensions.width - PANEL_WIDTH - padding * 2;
      const availableH = dimensions.height - padding * 2;
      
      const safeW = Math.max(bboxW, 1);
      const safeH = Math.max(bboxH, 1);

      // 目标缩放: 适应可用空间，限制在 [0.8, 5] 之间
      let targetZoom = Math.min(availableW / safeW, availableH / safeH);
      targetZoom = Math.min(Math.max(targetZoom, 0.8), 5);
      
      // 如果是单点聚焦，强制最小缩放以保证清晰度
      if (nodesToFit.length === 1) {
          targetZoom = Math.max(targetZoom, 3.5);
      }

      // 3. 构图感知运镜 (Composition-Aware Framing)
      // 计算"安全可视区域"的中心 (Safe Zone Center)
      // 默认面板在左侧，安全区域从 PANEL_WIDTH 开始
      const safeZoneStart = PANEL_WIDTH;
      const safeZoneCenter = safeZoneStart + (dimensions.width - safeZoneStart) / 2;
      
      // 计算屏幕偏移量 (从屏幕物理中心到安全区域中心的距离)
      // ScreenCenter = dimensions.width / 2
      // Offset = SafeZoneCenter - ScreenCenter
      const screenOffset = safeZoneCenter - (dimensions.width / 2);
      
      // 反推摄像机位置
      // 我们希望 GraphCenter 显示在 SafeZoneCenter
      // CameraX = GraphCenter - (ScreenOffset / Zoom)
      const newCameraX = centerX - (screenOffset / targetZoom);
      
      graphRef.current.centerAt(newCameraX, centerY, duration);
      graphRef.current.zoom(targetZoom, duration);
  }, [dimensions]);

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
    playPassSound();
    
    // Trigger "Light Up" animation
    if (currentItem) {
        setJustLearnedNodeId(currentItem.nodeId);
        setTimeout(() => setJustLearnedNodeId(null), 1000); // [MODIFIED] Reduced from 2000ms to 1000ms to avoid distraction
    }

    // Note: We don't mark as completed here yet, only after passing the test/choice
    // But if "Known" means skipped, maybe we should?
    // User flow: Learn -> Choice -> Test -> Done.
    // So we only mark complete at the end of the chain (Spelling).
    
    setQueue(prev => {
      const [current, ...rest] = prev;
      const insertIndex = Math.min(rest.length, 3);
      const newItem: SessionItem = { ...current, type: 'choice' };
      const newQueue = [...rest];
      newQueue.splice(insertIndex, 0, newItem);
      return newQueue;
    });
  }, []);

  // 2. Learn -> Learn (Loop)
  const handleLoop = () => {
    playFailSound();
    setQueue(prev => {
        const [first, ...rest] = prev;
        return [...rest, first]; // Keep type as 'learn'
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

  useEffect(() => {
    if (currentItem?.type === 'choice') {
      setChoiceOptions(generateOptions(currentItem.card));
      setChoiceResult(null);
      setSelectedChoiceId(null);
      speak(currentItem.card.word);
    }
  }, [currentItem, generateOptions]);

  const handleChoiceSelect = (selectedCard: WordCard) => {
    if (choiceResult || !currentItem) return;
    setSelectedChoiceId(selectedCard.id);

    if (selectedCard.id === currentItem.card.id) {
        setChoiceResult('correct');
        playPassSound();
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
  };

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

  const handleCheckSpelling = async () => {
    if (!inputValue.trim() || !currentItem) return;
    const isCorrect = inputValue.trim().toLowerCase() === currentItem.card.word.toLowerCase();

    if (isCorrect) {
      setTestResult('correct');
      playSpellingSuccessSound();
      
      // Mark as Completed
      setCompletedNodeIds(prev => new Set(prev).add(currentItem.nodeId));
      setSessionStats(prev => ({ ...prev, correct: prev.correct + 1, total: prev.total + 1 }));

      // If FSRS handler is provided (Session Mode), call it
      if (onRate) {
          await onRate(currentItem.card, Rating.Good);
      }

      setTimeout(async () => {
        // Update Connections
        EmbeddingService.getInstance().updateConnections(currentItem.card.word).catch(console.error);
        // Remove from queue
        setQueue(prev => prev.slice(1));
      }, 1000);
    } else {
      setTestResult('incorrect');
      playFailSound();
      setSessionStats(prev => ({ ...prev, total: prev.total + 1 }));
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
                  setPhase('connection-learning');
              }
          } else {
              setPhase('connection-learning');
          }
      }
  }, [queue, phase, graphData, sessionGroups, activeGroupIndex, completedNodeIds]);

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
    }

    // Update total
    setSessionStats(prev => ({ ...prev, total: prev.total + 1 }));

    // Call external handler
    await onRate(currentItem.card, rating);

    // Remove from queue (Review cards don't loop in session usually, unless Again?)
    // For now, remove to keep it simple. If Again, FSRS schedules it for <1min, 
    // but we might not re-show it in this exact session queue unless we re-fetch.
    setQueue(prev => prev.slice(1));
  };

  const handleCardPositionChange = useCallback((point: { x: number; y: number }) => {
    if (!graphRef.current) return;
    
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
  }, [graphData, currentItem]);

  const renderSessionItem = () => {
    if (!currentItem) return null;

    // 1. Learn Mode (Flashcard)
    if (currentItem.type === 'learn') {
        const isReview = currentItem.card.state === State.Review;

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
                    alwaysShowContent={true}
                    isEnriching={isEnriching}
                    semanticNeighbors={neighbors}
                    onSemanticNeighborClick={handleSemanticNeighborClick}
                    onSemanticNeighborHover={(word) => setHighlightedNeighborId(word ? (graphData?.nodes.find(n => n.label === word)?.id || null) : null)}
                    onPositionChange={handleCardPositionChange}
                    onFlip={() => {}}
                    onKnow={isReview ? undefined : handleKnow}
                    onForgot={isReview ? undefined : handleLoop}
                    onRate={isReview && onRate ? handleFSRSRate : undefined}
                    onEnrich={() => handleEnrich(currentItem.card)}
                    onUpdateCard={handleUpdateCard}
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
            </div>
        );
    }

    // 2. Choice Mode
    if (currentItem.type === 'choice') {
        return (
            <div className="w-full max-w-xl mx-auto min-h-[500px] flex flex-col items-center justify-center p-8 relative">
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
        );
    }

    // 3. Test Mode (Spelling)
    if (currentItem.type === 'test') {
        return (
            <div className="w-full max-w-xl mx-auto min-h-[500px] flex flex-col items-center justify-center p-8 relative">
                <div className="text-center w-full max-w-xs">
                    <div className="mb-8">
                        <div className="text-sm text-white/40 mb-2">请拼写出该单词</div>
                        <div className="text-2xl font-bold text-white/90 mb-4 line-clamp-3">
                            {currentItem.card.meaning || '暂无释义'}
                        </div>
                    </div>

                    <button 
                        onClick={() => speak(currentItem.card.word)}
                        className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center mb-8 mx-auto hover:bg-blue-500/30 transition-colors"
                    >
                        <Volume2 className="w-8 h-8 text-blue-400" />
                    </button>

                    <div className="relative w-full mb-8">
                        <input
                            ref={inputRef}
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCheckSpelling()}
                            className={cn(
                                "w-full bg-transparent border-b-2 text-center text-3xl font-mono py-2 focus:outline-none transition-colors",
                                testResult === 'correct' ? "border-green-500 text-green-400" :
                                testResult === 'incorrect' ? "border-red-500 text-red-400" :
                                "border-white/20 text-white focus:border-blue-500"
                            )}
                            placeholder="Type here..."
                            autoFocus
                            autoComplete="off"
                        />
                        {testResult === 'incorrect' && (
                            <div className="mt-4 text-red-400 animate-in slide-in-from-top-2">
                                正确答案: <span className="font-bold">{currentItem.card.word}</span>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handleCheckSpelling}
                        disabled={!inputValue.trim()}
                        className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        提交
                    </button>
                </div>
            </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950 text-white overflow-hidden flex flex-col z-50">
      {/* Header */}
      <header className="h-16 border-b border-white/10 flex items-center px-6 bg-slate-900/50 backdrop-blur-md z-10">
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
                        className="p-2 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-colors"
                        title="重新生成联系"
                    >
                        <RotateCcw className="w-4 h-4" />
                    </button>
                )}

                {phase === 'word-learning' && groupLabel && (
                     <div className="px-3 py-1 rounded-full bg-blue-500/20 text-xs font-bold text-blue-300 border border-blue-500/30 flex items-center gap-1">
                        <Target className="w-3 h-3" />
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
        
        {/* Legend (Top Right) */}
        <div className="absolute right-6 top-6 z-20 bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-xl p-4 text-xs pointer-events-none select-none">
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
                                本组包含 {queue.length} 个核心词汇。<br/>
                                {sessionGroups && sessionGroups.length > 0 
                                    ? `共 ${sessionGroups.length} 组，当前进度: ${Math.round(((activeGroupIndex) / sessionGroups.length) * 100)}%`
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

                    linkDirectionalParticleWidth={4}
                    linkDirectionalParticleColor={() => '#e0f2fe'} // [MODIFIED] Light Blue/White particles
                    nodeCanvasObject={(node: any, ctx, globalScale) => {
                        // Validate coordinates to prevent crash
                        if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;

                        const label = node.label;
                        
                        // State Flags
                        const isCompleted = completedNodeIds.has(node.id);
                        const isActive = currentItem?.nodeId === node.id;
                        const isNeighbor = activeNeighborIds.has(node.id);
                        const isJustLearned = justLearnedNodeId === node.id;
                        const isHighlighted = highlightedNeighborId === node.id;
                        const isHovered = hoveredNode === node;

                        // [MODIFIED] Check if this node is a neighbor of the hovered node
                        // This enables lighting up the "other end" of the connection when hovering
                        let isHoveredNeighbor = false;
                        if (hoveredNode && hoveredNode !== node) {
                            // Check if there is a link between hoveredNode and this node
                            // Note: Accessing graphData.links in render loop. For small graphs (learning session) this is fine.
                            isHoveredNeighbor = graphData.links.some((link: any) => {
                                const sId = typeof link.source === 'object' ? link.source.id : link.source;
                                const tId = typeof link.target === 'object' ? link.target.id : link.target;
                                return (sId === hoveredNode.id && tId === node.id) || 
                                       (sId === node.id && tId === hoveredNode.id);
                            });
                        }

                        // [MODIFIED] Extreme Focus Mode
                        // Only show: Current Item, Active Neighbors (Choices), Hovered Node, Hovered Neighbors, Highlighted Node, Learned Words
                        // Everything else (Future, Background) is hidden (Ghost Mode)
                        const isRelevant = isActive || isNeighbor || isHovered || isHoveredNeighbor || isHighlighted || isJustLearned || isCompleted;

                        // 1. Ghost Mode (Hidden Nodes)
                        if (!isRelevant) {
                            // Draw tiny faint dot for structure hint
                            // This ensures they are still "there" for hovering, but visually unobtrusive
                            const ghostR = 1.5;
                            ctx.beginPath();
                            ctx.arc(node.x, node.y, ghostR, 0, 2 * Math.PI, false);
                            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'; // Very faint
                            ctx.fill();
                            return; // STOP rendering (No text, no glow, no processing cost)
                        }

                        // [MODIFIED] Dynamic Depth of Field (DoF)
                        // Background nodes (not focused) recede in size to simulate depth
                        const isFocused = phase === 'overview' || isActive || isCompleted || isNeighbor || isJustLearned || isHighlighted || isHovered || isHoveredNeighbor;
                        const dofScale = isFocused ? 1 : 0.6;
                        
                        const r = Math.sqrt(node.val || 1) * dofScale;

                        // [MODIFIED] Calculate Neighbor Color based on Relationship
                        let neighborRelationColor: string | null = null;
                        if (isNeighbor && currentItem?.nodeId) {
                            const link = graphData.links.find((l: any) => {
                                const sId = typeof l.source === 'object' ? l.source.id : l.source;
                                const tId = typeof l.target === 'object' ? l.target.id : l.target;
                                return (sId === currentItem.nodeId && tId === node.id) || 
                                       (sId === node.id && tId === currentItem.nodeId);
                            });
                            if (link && link.label) {
                                 const lbl = link.label.toLowerCase();
                                 if (lbl.includes('近义') || lbl.includes('synonym')) neighborRelationColor = '#4ade80'; // Green
                                 else if (lbl.includes('反义') || lbl.includes('antonym')) neighborRelationColor = '#f87171'; // Red
                                 else if (lbl.includes('派生') || lbl.includes('derivative')) neighborRelationColor = '#a78bfa'; // Purple
                                 else if (lbl.includes('形似') || lbl.includes('look-alike')) neighborRelationColor = '#facc15'; // Yellow
                                 else if (lbl.includes('搭配') || lbl.includes('collocation')) neighborRelationColor = '#60a5fa'; // Blue
                                 else if (lbl.includes('场景') || lbl.includes('scenario')) neighborRelationColor = '#22d3ee'; // Cyan
                                 else if (lbl.includes('相关') || lbl.includes('related') || lbl.includes('关联')) neighborRelationColor = '#94a3b8'; // Slate (Generic)
                                 else neighborRelationColor = '#cbd5e1'; // Light Slate (Unknown)
                            }
                        }
                        
                        // Animation Pulse (Breathing Effect)
                        const time = Date.now();
                        const pulse = (Math.sin(time * 0.003) + 1) / 2; // 0 to 1
                        const breathingScale = 1 + pulse * 0.2; // 1.0 to 1.2
                        
                        // "Light Up" Effect Scale
                        const finalScale = (isJustLearned || isHighlighted) ? breathingScale * 1.5 : breathingScale;

                        // Visibility Logic (Focus Mode)
                        // Active, Completed, and Neighbors are visible. Others are dimmed.
                        // [MODIFIED] In Overview phase, everything is visible
                        const isVisible = isFocused;
                        const opacity = isVisible ? 1 : 0.1;

                        ctx.save(); // Save context state for alpha and shadow
                        ctx.globalAlpha = opacity;

                        if (isActive || isJustLearned || isHighlighted || isHovered || isHoveredNeighbor) {
                            // --- Microsoft Diffuse Light Ball (Active/Highlighted/Hovered Node) ---
                            // [MODIFIED] Eye-catching Active Node (Pure White for clean look)
                            // White (Active) vs Yellow (Highlighted) vs Blue (Hovered/Neighbor) vs Emerald (Just Learned)
                            const baseColor = isActive ? '#ffffff' : (isHighlighted ? '#facc15' : ((isHovered || isHoveredNeighbor) ? '#60a5fa' : '#10b981'));
                            const glowColor = isActive ? 'rgba(255, 255, 255, 0.5)' : (isHighlighted ? 'rgba(250, 204, 21, 0.5)' : ((isHovered || isHoveredNeighbor) ? 'rgba(96, 165, 250, 0.5)' : 'rgba(16, 185, 129, 0.4)'));
                            
                            // 1. Outer Halo (Large, diffuse, pulsing)
                            // [MODIFIED] Slightly reduce halo for neighbors to keep focus on the hovered node
                            const haloScale = (isHoveredNeighbor) ? 0.7 : 1.0;
                            const haloRadius = r * 5 * finalScale * haloScale; // Increased size
                            const haloGradient = ctx.createRadialGradient(node.x, node.y, r, node.x, node.y, haloRadius);
                            haloGradient.addColorStop(0, glowColor);
                            haloGradient.addColorStop(1, 'rgba(0,0,0,0)');
                            
                            ctx.beginPath();
                            ctx.arc(node.x, node.y, haloRadius, 0, 2 * Math.PI, false);
                            ctx.fillStyle = haloGradient;
                            ctx.fill();

                            // 2. Ripple Rings (Animated)
                            if (isActive || isHighlighted || isHovered) {
                                const rippleRadius = r * 3 * (1 + (Math.sin(time * 0.002) + 1) * 0.3);
                                ctx.beginPath();
                                ctx.arc(node.x, node.y, rippleRadius, 0, 2 * Math.PI, false);
                                const rippleColor = isActive ? '255, 255, 255' : (isHighlighted ? '250, 204, 21' : '96, 165, 250');
                                ctx.strokeStyle = `rgba(${rippleColor}, ${0.6 - (Math.sin(time * 0.002) + 1) * 0.3})`; // Fade out
                                ctx.lineWidth = 1;
                                ctx.stroke();

                                const rippleRadius2 = r * 2 * (1 + (Math.cos(time * 0.002) + 1) * 0.2);
                                ctx.beginPath();
                                ctx.arc(node.x, node.y, rippleRadius2, 0, 2 * Math.PI, false);
                                ctx.strokeStyle = `rgba(${rippleColor}, ${0.5 - (Math.cos(time * 0.002) + 1) * 0.2})`;
                                ctx.lineWidth = 0.5;
                                ctx.stroke();
                            }

                            // 3. Mid Glow (Soft, bridge)
                            const glowRadius = r * 3;
                            const glowGradient = ctx.createRadialGradient(node.x, node.y, r * 0.5, node.x, node.y, glowRadius);
                            const midGlowColor = isActive ? 'rgba(255, 255, 255, 0.8)' : (isHighlighted ? 'rgba(250, 204, 21, 0.6)' : ((isHovered || isHoveredNeighbor) ? 'rgba(96, 165, 250, 0.6)' : 'rgba(52, 211, 153, 0.6)'));
                            glowGradient.addColorStop(0, midGlowColor); 
                            glowGradient.addColorStop(1, 'rgba(0,0,0,0)');
                            
                            ctx.beginPath();
                            ctx.arc(node.x, node.y, glowRadius, 0, 2 * Math.PI, false);
                            ctx.fillStyle = glowGradient;
                            ctx.fill();

                            // 4. Core Orb (Solid, bright center)
                            const coreRadius = r * 1.5; // Larger core
                            const coreGradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, coreRadius);
                            coreGradient.addColorStop(0, '#ffffff');       // Pure White Center
                            const coreMidColor = isActive ? '#f8fafc' : (isHighlighted ? '#fde047' : ((isHovered || isHoveredNeighbor) ? '#bfdbfe' : '#6ee7b7'));
                            coreGradient.addColorStop(0.3, coreMidColor);     // White-50 / Yellow-300 / Light Green
                            coreGradient.addColorStop(0.7, baseColor);     // Base Color
                            coreGradient.addColorStop(1, 'rgba(0,0,0,0)'); // Soft edge
                            
                            ctx.beginPath();
                            ctx.arc(node.x, node.y, coreRadius, 0, 2 * Math.PI, false);
                            ctx.fillStyle = coreGradient;
                            ctx.fill();
                            
                        } else {
                            // --- Standard Rendering for Neighbors/Others ---
                            
                            // Color logic
                            let color = '#94a3b8'; 
                            if (isNeighbor) {
                                color = neighborRelationColor || '#ffffff'; // Neighbor White or Relation Color
                            } else if (isCompleted) {
                                color = '#ec4899'; // [MODIFIED] Pink for History (was Emerald #10b981)
                            } else if (node.type === 'root') {
                                color = '#f472b6'; 
                            } else if (node.type === 'topic') {
                                // [MODIFIED] Use Indigo/Blue for standard topic nodes (unlearned)
                                color = '#6366f1'; 
                            }
                            
                            // Shadow/Glow
                            if (isNeighbor) {
                                ctx.shadowColor = neighborRelationColor || 'rgba(255, 255, 255, 0.6)'; 
                                ctx.shadowBlur = 30; 
                            } else if (isCompleted) {
                                ctx.shadowBlur = 20; 
                                ctx.shadowColor = color;
                            } else if (phase === 'overview') {
                                // In overview, give them a subtle glow
                                ctx.shadowBlur = 10;
                                ctx.shadowColor = color;
                            } else {
                                ctx.shadowBlur = 0;
                            }

                            // Draw Node
                            ctx.beginPath();
                            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
                            
                            // Gradient Fill
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
                        // [MODIFIED] Only show text for Relevant nodes (which we are currently rendering)
                        const showLabel = true; // Since we already filtered by isRelevant, we can always show label for visible nodes

                        if (showLabel) {
                            const fontSize = isActive ? 12 : (node.type === 'root' ? 10 : (node.type === 'topic' ? 8 : 6));
                            
                            ctx.font = `${(isCompleted || isActive || isHighlighted) ? 'bold ' : ''}${fontSize}px Sans-Serif`;
                            ctx.textAlign = 'left';
                            ctx.textBaseline = 'middle';
                            
                            if (isNeighbor || isActive || isJustLearned || isHighlighted) {
                                ctx.fillStyle = (isHighlighted) ? '#facc15' : ((isNeighbor && neighborRelationColor) ? neighborRelationColor : '#ffffff'); 
                                ctx.shadowColor = (isHighlighted) ? '#facc15' : ((isNeighbor && neighborRelationColor) ? neighborRelationColor : 'rgba(255, 255, 255, 0.6)'); 
                                ctx.shadowBlur = 4;
                            } else {
                                ctx.fillStyle = isCompleted ? '#fff' : 'rgba(255, 255, 255, 0.7)';
                                ctx.shadowBlur = 0;
                            }
                            
                            ctx.fillText(label, node.x + r + 8, node.y);
                        }
                        
                        ctx.restore(); // Restore globalAlpha
                    }}
                    nodeLabel="meaning" // Show meaning on hover
                    onNodeHover={(node) => {
                        if (isHoveringCard) {
                            setHoveredNode(null);
                            return;
                        }
                        setHoveredNode(node);
                    }}
                    onLinkHover={(link) => {
                        if (isHoveringCard) {
                            setHoveredLink(null);
                            return;
                        }
                        setHoveredLink(link);
                    }}
                    nodeColor={(node: any) => {
                        if (currentItem?.nodeId === node.id) return '#ffffff'; // White (Active)
                        if (activeNeighborIds.has(node.id)) return '#ffffff'; // White (Neighbor base)
                        if (node.type === 'root') return '#ef4444';
                        if (node.type === 'topic') return '#f59e0b';
                        return '#10b981';
                    }}
                    nodeVal={(node: any) => node.val}
                    linkCanvasObject={(link: any, ctx, globalScale) => {
                        const source = link.source;
                        const target = link.target;
                        
                        if (!source || !target || typeof source !== 'object' || typeof target !== 'object') return;
                        // Validate coordinates
                        if (!Number.isFinite(source.x) || !Number.isFinite(source.y) || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return;

                        const isActiveConnection = currentItem?.nodeId === source.id || currentItem?.nodeId === target.id;
                        // const isHighlightedConnection = highlightedNeighborId && (source.id === highlightedNeighborId || target.id === highlightedNeighborId);
                        const isHoveredConnection = hoveredNode && (source.id === hoveredNode.id || target.id === hoveredNode.id);
                        
                        // [MODIFIED] Spotlight Logic
                        // 用户要求: 悬浮卡片语义邻居时，只高亮单词球，不显示连接线
                        const isInFocus = isActiveConnection || isHoveredConnection;
                        
                        // Base Visibility
                        const sourceVisible = completedNodeIds.has(source.id) || activeNeighborIds.has(source.id) || currentItem?.nodeId === source.id;
                        const targetVisible = completedNodeIds.has(target.id) || activeNeighborIds.has(target.id) || currentItem?.nodeId === target.id;
                        const isStructurallyVisible = isActiveConnection || (sourceVisible && targetVisible);

                        // Opacity Calculation
                        let opacity = 0.05; // Default: Ghost Mode
                        
                        if (isInFocus) {
                            opacity = isActiveConnection || isHoveredConnection ? 1 : 0.8;
                        } else if (isStructurallyVisible) {
                            opacity = 0.15; 
                        }
                        
                        const time = Date.now();
                        if (isActiveConnection) {
                            const pulse = (Math.sin(time * 0.002) + 1) / 2;
                            const breathingOpacity = 0.6 + pulse * 0.4;
                            ctx.globalAlpha = breathingOpacity;
                        } else {
                            ctx.globalAlpha = opacity;
                        }

                        // --- Color Logic ---
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
                        
                        // 1. Draw Main Line (Glow/Base)
                        ctx.beginPath();
                        ctx.moveTo(source.x, source.y);
                        ctx.lineTo(target.x, target.y);
                        
                        // Gradient Stroke
                        const gradient = ctx.createLinearGradient(source.x, source.y, target.x, target.y);
                        
                        if (relationColor) {
                            gradient.addColorStop(0, relationColor);
                            gradient.addColorStop(1, relationColor);
                        } else {
                            const getColor = (node: any) => {
                                 if (currentItem?.nodeId === node.id) return '#ffffff';
                                 if (activeNeighborIds.has(node.id)) return '#ffffff'; 
                                 if (completedNodeIds.has(node.id)) return '#ec4899'; // [MODIFIED] Pink for History
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
                                // [Refined Hover] "Liquid Light" Effect
                                ctx.lineWidth = 2.5; // Elegant thickness
                                ctx.shadowColor = relationColor || '#60a5fa';
                                ctx.shadowBlur = 15; // Soft glow
                            } else {
                                ctx.lineWidth = 1.5;
                                ctx.shadowColor = relationColor || 'rgba(255,255,255,0.3)';
                                ctx.shadowBlur = 5;
                            }
                        } else {
                            ctx.lineWidth = 0.5;
                            ctx.shadowBlur = 0;
                        }
                        
                        ctx.stroke();

                        // 2. [New] Core Line (Glass Tube Effect) for Active & Hover
                        // This adds a white "filament" inside the colored glow, making it look like neon/glass
                        if (isActiveConnection || isHoveredConnection) {
                            ctx.save();
                            ctx.beginPath();
                            ctx.moveTo(source.x, source.y);
                            ctx.lineTo(target.x, target.y);
                            ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
                            ctx.lineWidth = isActiveConnection ? 1.5 : 1.0; // Thinner core
                            ctx.shadowBlur = 0; // Sharp core
                            ctx.stroke();
                            ctx.restore();
                        }
                        
                        ctx.restore();
                    }}
                    backgroundColor="#020617"
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
      </div>
    </div>
  );
}
