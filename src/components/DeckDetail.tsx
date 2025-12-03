/**
 * @description 单词本详情页 (Deck Detail Page)
 * 包含单词列表、学习入口、阅读练习入口等。
 * 实现了分页加载、多维度筛选（已学、未学、熟悉、重点）以及液态玻璃 UI 风格。
 */
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { ArrowLeft, BookOpen, Plus, Brain, Search, Trash2, X, ChevronDown, ChevronUp, Eye, Heart, CheckCircle, Clock, RefreshCw, Sparkles, Network } from 'lucide-react';
import { Flashcard } from '@/components/Flashcard';
import { saveCard, getDeckById, getAllCards, getDueCards, getNewCards, deleteCard, getAllLogs, deleteDeck } from '@/lib/db';
import { EmbeddingService } from '@/lib/embedding';
import type { Deck, WordCard } from '@/types';
import { type ReviewLog } from 'ts-fsrs';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { FormattedText } from './FormattedText';
import { DeckStatistics } from './DeckStatistics';
import { State } from 'ts-fsrs';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface DeckDetailProps {
  deckId: string;
  onBack: () => void;
  onStartSession: (limits: { newLimit: number; reviewLimit: number; newGroupLimit?: number }) => void;
  onStartTeaching: (limits: { newLimit: number }) => void;
  onReadingPractice: () => void;
  onAddWord: () => void;
  // Callbacks for Flashcard functionality
  onUpdateCard?: (card: WordCard) => Promise<WordCard | void>;
  onGenerateExample?: (card: WordCard) => Promise<WordCard | undefined>;
  onGenerateMnemonic?: (card: WordCard) => Promise<WordCard | undefined>;
  onGenerateMeaning?: (card: WordCard) => Promise<WordCard | undefined>;
  onGenerateKnowledgeGraph?: (card: WordCard) => Promise<WordCard | undefined>;
  onGenerateMindMap?: (card: WordCard) => Promise<WordCard | undefined>;
  onGeneratePhrases?: (card: WordCard) => Promise<WordCard | undefined>;
  onGenerateDerivatives?: (card: WordCard) => Promise<WordCard | undefined>;
  onGenerateRoots?: (card: WordCard) => Promise<WordCard | undefined>;
  onGenerateSyllables?: (card: WordCard) => Promise<WordCard | undefined>;
  onSaveMindMap?: (card: WordCard, mindMapData: NonNullable<WordCard['mindMap']>) => Promise<WordCard | undefined>;
  onEnrich?: (card: WordCard) => Promise<WordCard | undefined>;
  isEnriching?: boolean;
  onOpenKnowledgeGraph?: () => void;
  onOpenDeckClusters?: () => void;
}

type TabType = 'learned' | 'unlearned' | 'familiar' | 'important';

export function DeckDetail({ 
    deckId, 
    onBack, 
    onStartSession, 
    onStartTeaching: _onStartTeaching,
    onReadingPractice, 
    onAddWord,
    onUpdateCard,
    onGenerateExample,
    onGenerateMnemonic,
    onGenerateMeaning,
    onGenerateKnowledgeGraph: _onGenerateKnowledgeGraph,
    onGenerateMindMap,
    onGeneratePhrases,
    onGenerateDerivatives,
    onGenerateRoots,
    onGenerateSyllables,
    onSaveMindMap: _onSaveMindMap,
    onEnrich,
    isEnriching,
    onOpenKnowledgeGraph,
    onOpenDeckClusters
}: DeckDetailProps) {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [stats, setStats] = useState({ total: 0, due: 0, new: 0 });
  const [cards, setCards] = useState<WordCard[]>([]);
  // @ts-ignore
  const [logs, setLogs] = useState<(ReviewLog & { cardId: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [isListExpanded, setIsListExpanded] = useState(true);
  const [previewCardId, setPreviewCardId] = useState<string | null>(null);
  const [isPreviewFlipped, setIsPreviewFlipped] = useState(false);
  
  // New state for tabs and pagination
  const [activeTab, setActiveTab] = useState<TabType>('learned');
  const [displayLimit, setDisplayLimit] = useState(100);
  
  // Session configuration state
  const [reviewLimit, setReviewLimit] = useState(20);
  const [newGroupLimit, setNewGroupLimit] = useState(1);

  // Graph Generation State
  const [isGeneratingGraph, setIsGeneratingGraph] = useState(false);
  const [graphProgress, setGraphProgress] = useState(0);
  const [graphTotal, setGraphTotal] = useState(0);
  const [generationStage, setGenerationStage] = useState<'embedding' | 'connection'>('embedding');

  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    console.log("DeckDetail mounted, deckId:", deckId);
    loadData();
  }, [deckId]);

  const handleGenerateGraph = async () => {
      if (isGeneratingGraph) return;
      if (cards.length === 0) return;

      if (!confirm(`即将为 ${cards.length} 个单词生成知识图谱连接。\n这可能需要几分钟时间，请勿关闭页面。\n\n建议在电脑端进行此操作以获得最佳性能。`)) {
          return;
      }

      setIsGeneratingGraph(true);
      setGraphTotal(cards.length);
      setGraphProgress(0);
      setGenerationStage('embedding');
      
      try {
          const embeddingService = EmbeddingService.getInstance();
          const initialized = await embeddingService.init();
          
          if (!initialized) {
              throw new Error("Embedding model failed to initialize. Please check your internet connection.");
          }

          // Use new batch process
          const words = cards.map(c => c.word);
          await embeddingService.batchProcess(words, (current, total, currentStage) => {
              setGraphProgress(current);
              setGraphTotal(total);
              setGenerationStage(currentStage);
          });
          
          if (confirm('知识图谱生成完成！是否立即查看？')) {
              onOpenKnowledgeGraph?.();
          }
      } catch (error) {
          console.error("Failed to generate graph:", error);
          alert('生成失败：' + (error instanceof Error ? error.message : '未知错误'));
      } finally {
          setIsGeneratingGraph(false);
      }
  };

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setDisplayLimit((prev) => prev + 100);
        }
      },
      { threshold: 0.5 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [observerTarget.current]);

  // Reset display limit when tab or search changes
  useEffect(() => {
    setDisplayLimit(100);
  }, [activeTab, searchTerm]);

  const loadData = async () => {
    console.log("Loading data for deck:", deckId);
    setIsLoading(true);
    try {
      const [deckData, allCards, dueCards, newCards, allLogs] = await Promise.all([
        getDeckById(deckId),
        getAllCards(deckId),
        getDueCards(deckId),
        getNewCards(deckId),
        getAllLogs()
      ]);
      
      console.log("Data loaded:", { deckData, allCardsCount: allCards.length });

      if (!deckData) {
        console.error("Deck data is null for id:", deckId);
      }

      setDeck(deckData || null);
      setCards(allCards.sort((a, b) => b.createdAt - a.createdAt));
      // @ts-ignore
      setLogs(allLogs);
      setStats({
        total: allCards.length,
        due: dueCards.length,
        new: newCards.length
      });
    } catch (error) {
      console.error("Failed to load deck details:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteDeck = async () => {
      if (!deck) return;
      if (confirm(`确定要删除整个 "${deck.name}" 词库吗？\n此操作将删除包含的 ${cards.length} 个单词，且无法恢复！`)) {
          try {
              await deleteDeck(deckId);
              onBack(); // Return to deck list
          } catch (e) {
              console.error("Failed to delete deck", e);
              alert("删除失败");
          }
      }
  };

  const handleDeleteCard = async (e: React.MouseEvent, cardId: string) => {
      e.stopPropagation();
      if (confirm("确定要删除这个单词吗？")) {
          await deleteCard(cardId);
          await loadData();
      }
  }

  // Filter logic
  const filteredCards = useMemo(() => {
    let result = cards.filter(card => 
      (card.word || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
      (card.meaning || '').includes(searchTerm)
    );

    switch (activeTab) {
      case 'learned':
        // 已学习: 状态不是 New 且 不是熟悉
        result = result.filter(card => card.state !== State.New && !card.isFamiliar);
        break;
      case 'unlearned':
        // 未学习: 状态是 New 且 不是熟悉
        result = result.filter(card => card.state === State.New && !card.isFamiliar);
        break;
      case 'familiar':
        // 熟悉: isFamiliar 为 true
        result = result.filter(card => card.isFamiliar);
        break;
      case 'important':
        // 重点: isImportant 为 true (不考虑学习状态)
        result = result.filter(card => card.isImportant);
        break;
    }

    return result;
  }, [cards, searchTerm, activeTab]);

  const visibleCards = filteredCards.slice(0, displayLimit);

  if (isLoading) {
      return <div className="text-center py-20 text-white/50">加载中...</div>;
  }

  if (!deck) {
      return (
          <div className="text-center py-20">
              <p className="text-white/50">未找到该卡包</p>
              <button onClick={onBack} className="mt-4 text-blue-400 hover:underline">返回</button>
          </div>
      );
  }

  const toggleExpand = (cardId: string) => {
      setExpandedCardId(expandedCardId === cardId ? null : cardId);
  };

  const handleOpenPreview = (e: React.MouseEvent, cardId: string) => {
    e.stopPropagation();
    setPreviewCardId(cardId);
    setIsPreviewFlipped(false); // Reset flip state
  };

  // Helper to format next review time
  const getNextReviewTime = (due: Date | number) => {
    if (!due) return '-';
    const date = new Date(due);
    if (date < new Date()) return '现在';
    return formatDistanceToNow(date, { addSuffix: true, locale: zhCN });
  };

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <motion.div 
        className="flex items-center gap-4"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <button 
          onClick={onBack}
          className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-white">{deck.name || '未命名卡包'}</h1>
          <p className="text-white/50 text-sm mt-1">
             {stats.total} 个单词 · {deck.description || "暂无描述"}
          </p>
        </div>
        <button 
            onClick={handleDeleteDeck}
            className="ml-auto p-2 rounded-full hover:bg-red-500/20 text-red-400/50 hover:text-red-400 transition-colors"
            title="删除整个词库"
        >
            <Trash2 className="w-5 h-5" />
        </button>
      </motion.div>

      {/* Action Grid */}
      <motion.div 
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
        variants={{
          hidden: { opacity: 0 },
          show: {
            opacity: 1,
            transition: {
              staggerChildren: 0.1
            }
          }
        }}
        initial="hidden"
        animate="show"
      >
        {/* New Words Session */}
        <motion.div 
          variants={{
            hidden: { opacity: 0, y: 20 },
            show: { opacity: 1, y: 0 }
          }}
          className="glass-panel p-6 flex flex-col justify-between min-h-48 group relative overflow-hidden"
        >
            <div className="absolute -right-10 -top-10 w-32 h-32 bg-cyan-500/20 blur-2xl rounded-full" />
            
            <div className="flex justify-between items-start relative z-10 mb-4">
                <div className="p-3 rounded-2xl bg-cyan-500/20 text-cyan-200">
                    <Sparkles className="w-6 h-6" />
                </div>
                <div className="text-right">
                    <span className="text-3xl font-bold text-white">{stats.new}</span>
                    <span className="text-xs text-white/50 block">新词待学</span>
                </div>
            </div>
            
            <div className="relative z-10 space-y-3">
                <button 
                    onClick={() => onStartSession({ newLimit: 20, reviewLimit: 0, newGroupLimit: 1 })}
                    disabled={stats.new === 0}
                    className="w-full py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    开始新词学习
                </button>
                
                <button 
                    onClick={onOpenDeckClusters}
                    className="w-full py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white text-xs font-medium transition-colors flex items-center justify-center gap-2"
                >
                    <Brain className="w-3 h-3" />
                    查看分组
                </button>

            </div>
        </motion.div>

        {/* Review Session */}
        <motion.div 
          variants={{
            hidden: { opacity: 0, y: 20 },
            show: { opacity: 1, y: 0 }
          }}
          className="glass-panel p-6 flex flex-col justify-between min-h-48 group relative overflow-hidden"
        >
            <div className="absolute -right-10 -top-10 w-32 h-32 bg-blue-500/20 blur-2xl rounded-full group-hover:bg-blue-500/30 transition-colors" />
            
            <div className="flex justify-between items-start relative z-10 mb-4">
                <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-200">
                    <RefreshCw className="w-6 h-6" />
                </div>
                <div className="text-right">
                    <span className="text-3xl font-bold text-white">{stats.due}</span>
                    <span className="text-xs text-white/50 block">待复习</span>
                </div>
            </div>
            
            <div className="relative z-10 space-y-3">
                <div className="flex items-center justify-between text-xs text-white/50">
                    <span>复习数量</span>
                    <span>{reviewLimit} 个</span>
                </div>
                <input 
                    type="range" 
                    min="5" 
                    max={stats.due > 0 ? stats.due : 50} 
                    step="5"
                    value={reviewLimit}
                    onChange={(e) => setReviewLimit(Number(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-blue-400 [&::-webkit-slider-thumb]:rounded-full"
                />
                <button 
                    onClick={() => onStartSession({ newLimit: 0, reviewLimit })}
                    disabled={stats.due === 0}
                    className="w-full py-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    开始复习
                </button>
            </div>
        </motion.div>

        {/* Reading Practice */}
        <motion.div 
            variants={{
              hidden: { opacity: 0, y: 20 },
              show: { opacity: 1, y: 0 }
            }}
            onClick={() => stats.total > 0 && onReadingPractice()}
            className={cn(
                "glass-panel p-6 flex flex-col justify-between h-40 cursor-pointer transition-all hover:scale-[1.02] active:scale-95 group relative overflow-hidden",
                stats.total === 0 && "opacity-50 cursor-not-allowed hover:scale-100"
            )}
        >
             <div className="absolute -right-10 -top-10 w-32 h-32 bg-blue-500/20 blur-2xl rounded-full group-hover:bg-blue-500/30 transition-colors" />

            <div className="flex justify-between items-start relative z-10">
                <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-200">
                    <BookOpen className="w-6 h-6" />
                </div>
            </div>
            <div className="relative z-10">
                <h3 className="font-bold text-lg text-white group-hover:text-blue-200 transition-colors">阅读练习</h3>
                <p className="text-xs text-white/50">基于本词库生成短文</p>
            </div>
        </motion.div>

        {/* Add Word */}
        <motion.div 
            variants={{
              hidden: { opacity: 0, y: 20 },
              show: { opacity: 1, y: 0 }
            }}
            onClick={onAddWord}
            className="glass-panel p-6 flex flex-col justify-between h-40 cursor-pointer transition-all hover:scale-[1.02] active:scale-95 group relative overflow-hidden hover:bg-white/10 border-dashed border-2 border-white/20 hover:border-green-400/50"
        >
            <div className="flex justify-between items-start relative z-10">
                <div className="p-3 rounded-2xl bg-green-500/10 text-green-200 group-hover:bg-green-500/20">
                    <Plus className="w-6 h-6" />
                </div>
            </div>
            <div className="relative z-10">
                <h3 className="font-bold text-lg text-white group-hover:text-green-200 transition-colors">添加单词</h3>
                <p className="text-xs text-white/50">手动录入新词</p>
            </div>
        </motion.div>

        {/* Generate Knowledge Graph */}
        <motion.div 
            variants={{
              hidden: { opacity: 0, y: 20 },
              show: { opacity: 1, y: 0 }
            }}
            onClick={handleGenerateGraph}
            className={cn(
                "glass-panel p-6 flex flex-col justify-between h-40 cursor-pointer transition-all hover:scale-[1.02] active:scale-95 group relative overflow-hidden hover:bg-white/10 border-dashed border-2 border-white/20 hover:border-purple-400/50",
                isGeneratingGraph && "opacity-80 cursor-not-allowed pointer-events-none"
            )}
        >
            <div className="flex justify-between items-start relative z-10">
                <div className="p-3 rounded-2xl bg-purple-500/10 text-purple-200 group-hover:bg-purple-500/20">
                    <Network className={cn("w-6 h-6", isGeneratingGraph && "animate-pulse")} />
                </div>
                {isGeneratingGraph && (
                    <span className="text-xs text-purple-300 animate-pulse">生成中...</span>
                )}
            </div>
            <div className="relative z-10">
                <h3 className="font-bold text-lg text-white group-hover:text-purple-200 transition-colors">构建知识图谱</h3>
                <p className="text-xs text-white/50">
                    {isGeneratingGraph 
                        ? `${generationStage === 'embedding' ? '生成向量' : '计算连接'}: ${graphProgress} / ${graphTotal}` 
                        : "批量生成语义连接"}
                </p>
                {isGeneratingGraph && (
                    <div className="mt-2 w-full h-1 bg-white/10 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-purple-500 transition-all duration-300" 
                            style={{ width: `${(graphProgress / Math.max(graphTotal, 1)) * 100}%` }}
                        />
                    </div>
                )}
            </div>
        </motion.div>

        {/* View Knowledge Graph */}
        <motion.div 
            variants={{
              hidden: { opacity: 0, y: 20 },
              show: { opacity: 1, y: 0 }
            }}
            onClick={onOpenKnowledgeGraph}
            className="glass-panel p-6 flex flex-col justify-between h-40 cursor-pointer transition-all hover:scale-[1.02] active:scale-95 group relative overflow-hidden hover:bg-white/10 border-dashed border-2 border-white/20 hover:border-indigo-400/50"
        >
             <div className="absolute -right-10 -top-10 w-32 h-32 bg-indigo-500/20 blur-2xl rounded-full group-hover:bg-indigo-500/30 transition-colors" />
            
            <div className="flex justify-between items-start relative z-10">
                <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-200 group-hover:bg-indigo-500/20">
                    <Network className="w-6 h-6" />
                </div>
            </div>
            <div className="relative z-10">
                <h3 className="font-bold text-lg text-white group-hover:text-indigo-200 transition-colors">查看知识图谱</h3>
                <p className="text-xs text-white/50">探索单词语义网络</p>
            </div>
        </motion.div>

        {/* View Clusters */}
        <motion.div 
            variants={{
              hidden: { opacity: 0, y: 20 },
              show: { opacity: 1, y: 0 }
            }}
            onClick={onOpenDeckClusters}
            className="glass-panel p-6 flex flex-col justify-between h-40 cursor-pointer transition-all hover:scale-[1.02] active:scale-95 group relative overflow-hidden hover:bg-white/10 border-dashed border-2 border-white/20 hover:border-pink-400/50"
        >
            <div className="flex justify-between items-start relative z-10">
                <div className="p-3 rounded-2xl bg-pink-500/10 text-pink-200 group-hover:bg-pink-500/20">
                    <Brain className="w-6 h-6" />
                </div>
            </div>
            <div className="relative z-10">
                <h3 className="font-bold text-lg text-white group-hover:text-pink-200 transition-colors">查看语义分组</h3>
                <p className="text-xs text-white/50">浏览所有单词的语义聚类</p>
            </div>
        </motion.div>
      </motion.div>

      // Statistics Section
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <DeckStatistics cards={cards} logs={logs} />
      </motion.div>

      {/* Word List Section */}
      <div className="space-y-4">
          <div className="flex flex-col gap-4">
              {/* Title and Search */}
              <div className="flex items-center justify-between">
                <button 
                  onClick={() => setIsListExpanded(!isListExpanded)}
                  className="flex items-center gap-2 text-xl font-bold text-white hover:text-blue-400 transition-colors"
                >
                  单词列表
                  {isListExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>
                <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                    <input 
                        type="text" 
                        placeholder="搜索单词..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 pr-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/20 focus:outline-none focus:bg-white/10 transition-all w-32 focus:w-60"
                    />
                </div>
              </div>

              {/* Tabs */}
              {isListExpanded && (
                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                  {(['learned', 'unlearned', 'familiar', 'important'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={cn(
                        "px-4 py-2 rounded-full text-sm whitespace-nowrap transition-all border",
                        activeTab === tab 
                          ? "bg-white/20 text-white border-white/20 shadow-lg backdrop-blur-md" 
                          : "bg-white/5 text-white/50 border-transparent hover:bg-white/10"
                      )}
                    >
                      {tab === 'learned' && '已学习'}
                      {tab === 'unlearned' && '未学习'}
                      {tab === 'familiar' && '熟悉'}
                      {tab === 'important' && '重点'}
                      <span className="ml-2 text-xs opacity-60">
                        {/* Calculate counts - reusing filtering logic concept for counts might be expensive, so maybe just simple length check if not too heavy, or skip count for now */}
                        {/* Optimization: Don't calculate counts for every tab on every render if list is huge. Just show current active count or nothing. */}
                      </span>
                    </button>
                  ))}
                </div>
              )}
          </div>

          <AnimatePresence>
          {isListExpanded && (
            <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-white/5 rounded-xl border border-white/10 overflow-hidden min-h-[300px] flex flex-col"
            >
              {visibleCards.length > 0 ? (
                  <div className="divide-y divide-white/5">
                      {visibleCards.map(card => (
                          <motion.div 
                            layout 
                            key={card.id} 
                            className="group"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                          >
                              {/* Card Header / Summary */}
                              <motion.div 
                                  layout="position"
                                  onClick={() => toggleExpand(card.id)}
                                  className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors cursor-pointer"
                              >
                                  <div className="flex-1 min-w-0 mr-4">
                                      <div className="flex items-center gap-2 mb-1">
                                          <span className="font-bold text-white text-lg truncate">{card.word || 'Unknown'}</span>
                                          <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-white/50 whitespace-nowrap">{card.partOfSpeech || 'unknown'}</span>
                                          {card.isImportant && <Heart className="w-3 h-3 text-red-500 fill-current" />}
                                          {card.isFamiliar && <CheckCircle className="w-3 h-3 text-green-400 fill-current" />}
                                      </div>
                                      <p className="text-sm text-white/60 line-clamp-1">{card.meaning || '无释义'}</p>
                                  </div>
                                  
                                  <div className="flex items-center gap-4 shrink-0">
                                      {/* Next Review Time - Only for Learned Tab */}
                                      {activeTab === 'learned' && (
                                        <div className="text-right text-xs text-white/40 hidden sm:block">
                                          <div className="flex items-center gap-1 justify-end mb-0.5">
                                            <Clock className="w-3 h-3" />
                                            <span>下次复习</span>
                                          </div>
                                          <div className="text-blue-300">
                                            {getNextReviewTime(card.due)}
                                          </div>
                                        </div>
                                      )}

                                      <button 
                                        onClick={(e) => handleDeleteCard(e, card.id)}
                                        className="p-2 text-white/20 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                      >
                                          <Trash2 className="w-4 h-4" />
                                      </button>
                                  </div>
                              </motion.div>

                              {/* Expanded Details */}
                              <AnimatePresence>
                              {expandedCardId === card.id && (
                                  <motion.div 
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: 'auto' }}
                                      exit={{ opacity: 0, height: 0 }}
                                      transition={{ duration: 0.3, ease: "circOut" }}
                                      className="bg-black/20 border-t border-white/5 overflow-hidden"
                                  >
                                      <div className="p-4 text-sm space-y-3">
                                          {/* Full Meaning */}
                                          <div>
                                              <span className="text-white/40 text-xs block mb-1">完整释义</span>
                                              <p className="text-white/80">{card.meaning || '无释义'}</p>
                                          </div>

                                          {/* Example */}
                                          {(card.example || card.exampleMeaning) && (
                                              <div>
                                                  <span className="text-white/40 text-xs block mb-1">例句</span>
                                                  <p className="text-white/80 italic">"{card.example || '...'}"</p>
                                                  <p className="text-white/60 text-xs mt-0.5">{card.exampleMeaning}</p>
                                              </div>
                                          )}

                                          {/* Mnemonic */}
                                          {card.mnemonic && (
                                              <div>
                                                  <span className="text-white/40 text-xs block mb-1">助记</span>
                                                  <div className="text-white/80 bg-white/5 p-2 rounded border border-white/5 inline-flex gap-2">
                                                      <span>💡</span>
                                                      <FormattedText content={card.mnemonic} />
                                                  </div>
                                              </div>
                                          )}
                                          
                                          {/* Meta Info */}
                                          <div className="flex gap-4 text-xs text-white/30 pt-2 border-t border-white/5">
                                            <div>创建于: {new Date(card.createdAt).toLocaleDateString()}</div>
                                            <div>复习次数: {card.reps || 0}</div>
                                            <div>状态: {card.state === State.New ? '未学' : card.state === State.Learning ? '学习中' : card.state === State.Review ? '复习中' : '再学习'}</div>
                                          </div>

                                          <div className="pt-2 flex justify-end">
                                            <button 
                                                onClick={(e) => handleOpenPreview(e, card.id)}
                                                className="flex items-center gap-2 text-xs bg-blue-500/20 text-blue-300 px-3 py-1.5 rounded-lg hover:bg-blue-500/30 transition-colors"
                                            >
                                                <Eye className="w-3 h-3" /> 查看卡片
                                            </button>
                                          </div>
                                      </div>
                                  </motion.div>
                              )}
                              </AnimatePresence>
                          </motion.div>
                      ))}
                      
                      {/* Loading Trigger / End of List */}
                      <div ref={observerTarget} className="p-4 text-center text-white/20 text-sm">
                        {visibleCards.length < filteredCards.length ? (
                          <span className="animate-pulse">加载更多...</span>
                        ) : (
                          <span>没有更多了</span>
                        )}
                      </div>
                  </div>
              ) : (
                  <div className="text-center py-20 text-white/20 flex flex-col items-center gap-3">
                      <div className="p-4 rounded-full bg-white/5">
                         {activeTab === 'important' ? <Heart className="w-8 h-8 opacity-50" /> : 
                          activeTab === 'familiar' ? <CheckCircle className="w-8 h-8 opacity-50" /> :
                          <Search className="w-8 h-8 opacity-50" />}
                      </div>
                      <p>
                        {searchTerm ? "没有找到匹配的单词" : 
                         activeTab === 'learned' ? "还没有已学习的单词" :
                         activeTab === 'unlearned' ? "所有单词都已学习" :
                         activeTab === 'familiar' ? "还没有标记为熟悉的单词" :
                         activeTab === 'important' ? "还没有标记为重点的单词" :
                         "暂无单词"}
                      </p>
                  </div>
              )}
            </motion.div>
          )}
          </AnimatePresence>
      </div>

      {/* Card Preview Modal */}
      {previewCardId && (() => {
        const card = cards.find(c => c.id === previewCardId);
        if (!card) return null;
        return (
            <div 
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                onClick={() => setPreviewCardId(null)}
            >
                <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="w-full max-w-md relative"
                    onClick={e => e.stopPropagation()}
                >
                    <button 
                        onClick={() => setPreviewCardId(null)}
                        className="absolute -top-12 right-0 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                    
                    <Flashcard 
                        card={card}
                        flipped={isPreviewFlipped}
                        onFlip={setIsPreviewFlipped}
                        onUpdateCard={async (updatedCard) => {
                            // Optimistic update
                            setCards(prev => prev.map(c => c.id === updatedCard.id ? updatedCard : c));
                            if (onUpdateCard) await onUpdateCard(updatedCard);
                        }}
                        onGenerateExample={async (c) => {
                            if (!onGenerateExample) return undefined;
                            const updated = await onGenerateExample(c);
                            if (updated) setCards(prev => prev.map(i => i.id === updated.id ? updated : i));
                            return updated;
                        }}
                        onGenerateMnemonic={async (c) => {
                            if (!onGenerateMnemonic) return undefined;
                            const updated = await onGenerateMnemonic(c);
                            if (updated) setCards(prev => prev.map(i => i.id === updated.id ? updated : i));
                            return updated;
                        }}
                        onGenerateMeaning={async (c) => {
                            if (!onGenerateMeaning) return undefined;
                            const updated = await onGenerateMeaning(c);
                            if (updated) setCards(prev => prev.map(i => i.id === updated.id ? updated : i));
                            return updated;
                        }}
                        onGenerateMindMap={async (c) => {
                            if (!onGenerateMindMap) return undefined;
                            const updated = await onGenerateMindMap(c);
                            if (updated) setCards(prev => prev.map(i => i.id === updated.id ? updated : i));
                            return updated;
                        }}
                        onGeneratePhrases={async (c) => {
                            if (!onGeneratePhrases) return undefined;
                            const updated = await onGeneratePhrases(c);
                            if (updated) setCards(prev => prev.map(i => i.id === updated.id ? updated : i));
                            return updated;
                        }}
                        onGenerateDerivatives={async (c) => {
                            if (!onGenerateDerivatives) return undefined;
                            const updated = await onGenerateDerivatives(c);
                            if (updated) setCards(prev => prev.map(i => i.id === updated.id ? updated : i));
                            return updated;
                        }}
                        onGenerateRoots={async (c) => {
                            if (!onGenerateRoots) return undefined;
                            const updated = await onGenerateRoots(c);
                            if (updated) setCards(prev => prev.map(i => i.id === updated.id ? updated : i));
                            return updated;
                        }}
                        onGenerateSyllables={async (c) => {
                            if (!onGenerateSyllables) return undefined;
                            const updated = await onGenerateSyllables(c);
                            if (updated) setCards(prev => prev.map(i => i.id === updated.id ? updated : i));
                            return updated;
                        }}
                        onSaveMindMap={async (c, mindMapData) => {
                            const updatedCard = { ...c, mindMap: mindMapData };
                            await saveCard(updatedCard);
                            setCards(prev => prev.map(i => i.id === updatedCard.id ? updatedCard : i));
                            if (onUpdateCard) await onUpdateCard(updatedCard);
                            return updatedCard;
                        }}
                        onEnrich={async () => {
                              if (!onEnrich) return;
                              const updated = await onEnrich(card);
                              if (updated) setCards(prev => prev.map(i => i.id === updated.id ? updated : i));
                         }}
                        isEnriching={isEnriching}
                    />
                </motion.div>
            </div>
        );
      })()}
    </div>
  );
}