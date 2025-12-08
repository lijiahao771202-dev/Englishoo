/**
 * @description 单词本详情页 (Deck Detail Page)
 * 包含单词列表、学习入口、阅读练习入口等。
 * 实现了分页加载、多维度筛选（已学、未学、熟悉、重点）以及液态玻璃 UI 风格。
 */
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { ArrowLeft, Plus, Search, Trash2, X, Eye, Heart, Activity, Network, Sparkles, ChevronDown, RefreshCw } from 'lucide-react';
import { Flashcard } from '@/components/Flashcard';
import { getDeckById, getAllCards, getDueCards, getNewCards, deleteCard, getAllLogs, deleteDeck } from '@/lib/db';

import type { Deck, WordCard } from '@/types';
import { type ReviewLog } from 'ts-fsrs';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
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
  onGeneratePhrases?: (card: WordCard) => Promise<WordCard | undefined>;
  onGenerateDerivatives?: (card: WordCard) => Promise<WordCard | undefined>;
  onGenerateRoots?: (card: WordCard) => Promise<WordCard | undefined>;
  onGenerateSyllables?: (card: WordCard) => Promise<WordCard | undefined>;
  onSaveMindMap?: (card: WordCard, mindMapData: NonNullable<WordCard['mindMap']>) => Promise<WordCard | undefined>;
  onEnrich?: (card: WordCard) => Promise<WordCard | undefined>;
  isEnriching?: boolean;
  onOpenKnowledgeGraph?: () => void;
  onOpenDeckClusters?: () => void;
  onOpenReviewDashboard?: () => void;
}

type TabType = 'due' | 'learned' | 'unlearned' | 'familiar' | 'important';

export function DeckDetail({
  deckId,
  onBack,
  onStartSession,
  onStartTeaching: _onStartTeaching,
  onReadingPractice: _onReadingPractice,
  onAddWord,
  onUpdateCard,
  onGenerateExample,
  onGenerateMnemonic,
  onGenerateMeaning,
  onGenerateKnowledgeGraph: _onGenerateKnowledgeGraph,
  onGeneratePhrases,
  onGenerateDerivatives,
  onGenerateRoots,
  onGenerateSyllables,
  onSaveMindMap: _onSaveMindMap,
  onEnrich,
  isEnriching,
  onOpenKnowledgeGraph,
  onOpenDeckClusters,
  onOpenReviewDashboard
}: DeckDetailProps) {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [stats, setStats] = useState({ total: 0, due: 0, new: 0 });
  const [cards, setCards] = useState<WordCard[]>([]);
  // @ts-ignore
  const [logs, setLogs] = useState<(ReviewLog & { cardId: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [previewCardId, setPreviewCardId] = useState<string | null>(null);
  const [isPreviewFlipped, setIsPreviewFlipped] = useState(false);

  // New state for tabs and pagination
  const [activeTab, setActiveTab] = useState<TabType>('due');
  const [displayLimit, setDisplayLimit] = useState(100);
  const [showStats, setShowStats] = useState(false);

  /* 
   * Removed unused imports and variables:
   * BookOpen, Brain, Zap, CalendarIcon, saveCard, 
   * graphProgress, graphTotal, generationStage, handleGenerateGraph 
   */
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadData();
  }, [deckId]);

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

  useEffect(() => {
    setDisplayLimit(100);
  }, [activeTab, searchTerm]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [deckData, allCards, dueCards, newCards, allLogs] = await Promise.all([
        getDeckById(deckId),
        getAllCards(deckId),
        getDueCards(deckId),
        getNewCards(deckId),
        getAllLogs()
      ]);

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
        onBack();
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

  const filteredCards = useMemo(() => {
    let result = cards.filter(card =>
      (card.word || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (card.meaning || '').includes(searchTerm)
    );

    switch (activeTab) {
      case 'due':
        const now = new Date().getTime();
        result = result.filter(card =>
          card.due &&
          new Date(card.due).getTime() <= now &&
          ((card.state as number) !== State.New && (card.state as number) !== 0) &&
          !card.isFamiliar
        );
        break;
      case 'learned':
        console.log('Filtering Learned Cards. Total:', cards.length);
        result = result.filter(card => {
          // Robust check: State.New is 0. If card.state is anything else, it's learned.
          // Also exclude Familiar cards as they have their own tab.
          const isLearned = ((card.state as number) !== State.New && (card.state as number) !== 0) && !card.isFamiliar;
          if (isLearned) {
            // console.log('Found learned card:', card.word, card.state);
          }
          return isLearned;
        });
        console.log('Learned Result:', result.length);
        break;
      case 'unlearned':
        result = result.filter(card => card.state === State.New && !card.isFamiliar);
        break;
      case 'familiar':
        result = result.filter(card => card.isFamiliar);
        break;
      case 'important':
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
    setIsPreviewFlipped(false);
  };

  const getNextReviewTime = (due: Date | number) => {
    if (!due) return '-';
    const date = new Date(due);
    if (date < new Date()) return '现在';
    return formatDistanceToNow(date, { addSuffix: true, locale: zhCN });
  };

  /* 
   * ACTION HANDLERS 
   */
  const handleStartReview = async () => {
    // Force reload data before starting to ensure accurate counts
    await loadData();
    if (stats.due > 0) {
      onStartSession({ newLimit: 0, reviewLimit: stats.due });
    } else {
      alert('暂无需要复习的单词');
    }
  };

  const handleStartLearn = async () => {
    // Force reload data before starting
    await loadData();
    if (stats.new > 0) {
      onStartSession({ newLimit: 20, reviewLimit: 0, newGroupLimit: 1 });
    } else {
      alert('暂无新词');
    }
  };



  if (showStats) {
    return (
      <div className="space-y-6 pb-20 animate-in slide-in-from-right duration-300">
        <motion.div
          className="flex items-center gap-4"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <button
            onClick={() => setShowStats(false)}
            className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">学习统计</h1>
            <p className="text-white/50 text-xs">查看详细的学习数据和预测</p>
          </div>
        </motion.div>
        <DeckStatistics cards={cards} logs={logs} />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <motion.div
        className="flex items-center gap-4"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <button
          onClick={onBack}
          className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white truncate">{deck.name || '未命名卡包'}</h1>
          <p className="text-white/50 text-xs">
            {stats.total} 单词 · {deck.description || "无描述"}
          </p>
        </div>
        <button
          onClick={handleDeleteDeck}
          className="p-2 rounded-full hover:bg-red-500/20 text-red-400/50 hover:text-red-400 transition-colors"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </motion.div>

      {/* 1. HERO STUDY SECTION */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-panel p-8 relative overflow-hidden group"
      >
        {/* Background Effect */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-500/20 to-purple-500/20 blur-3xl rounded-full translate-x-10 -translate-y-10 group-hover:bg-blue-500/30 transition-colors duration-700" />

        <div className="relative z-10 flex flex-col gap-8">
          {/* Stats Row */}
          <div className="flex items-center justify-around">
            <div className="text-center group/stat cursor-pointer" onClick={onOpenReviewDashboard || handleStartReview}>
              <div className={cn("text-5xl font-black transition-colors", stats.due > 0 ? "text-white" : "text-white/30")}>
                {stats.due}
              </div>
              <div className="text-xs text-white/50 font-medium uppercase tracking-wider mt-2 flex items-center justify-center gap-1 group-hover/stat:text-blue-300">
                待复习 <ChevronDown className="w-3 h-3 opacity-0 group-hover/stat:opacity-100 transition-opacity" />
              </div>
            </div>
            <div className="w-px h-16 bg-white/10" />
            <div className="text-center group/stat cursor-pointer" onClick={handleStartLearn}>
              <div className={cn("text-5xl font-black transition-colors", stats.new > 0 ? "text-white/90" : "text-white/30")}>
                {stats.new}
              </div>
              <div className="text-xs text-white/50 font-medium uppercase tracking-wider mt-2 flex items-center justify-center gap-1 group-hover/stat:text-green-300">
                新词 <ChevronDown className="w-3 h-3 opacity-0 group-hover/stat:opacity-100 transition-opacity" />
              </div>
            </div>
          </div>

          {/* Action Buttons Row */}
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={handleStartReview}
              disabled={stats.due === 0}
              className="py-4 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/20 hover:from-blue-500/30 hover:to-blue-600/30 border border-blue-500/30 text-blue-100 font-bold active:scale-95 transition-all shadow-lg flex flex-col items-center justify-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed group"
            >
              <div className="flex items-center gap-2">
                <RefreshCw className={cn("w-5 h-5", stats.due > 0 && "group-hover:rotate-180 transition-transform duration-500")} />
                <span>开始复习</span>
              </div>
              <span className="text-[10px] text-blue-200/50 font-normal">巩固记忆</span>
            </button>

            <button
              onClick={handleStartLearn}
              disabled={stats.new === 0}
              className="py-4 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 hover:from-emerald-500/30 hover:to-emerald-600/30 border border-emerald-500/30 text-emerald-100 font-bold active:scale-95 transition-all shadow-lg flex flex-col items-center justify-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed group"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 group-hover:scale-110 transition-transform" />
                <span>学习新词</span>
              </div>
              <span className="text-[10px] text-emerald-200/50 font-normal">探索未知</span>
            </button>
          </div>
        </div>
      </motion.div>

      {/* 2. STATS ENTRY & TOOLS GRID */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Statistics Entry Card */}
        <button
          onClick={() => setShowStats(true)}
          className="col-span-2 glass-panel p-4 flex items-center justify-between hover:bg-white/5 transition-colors group relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="flex items-center gap-4 relative z-10">
            <div className="p-3 rounded-full bg-purple-500/20 text-purple-300">
              <Activity className="w-6 h-6" />
            </div>
            <div className="text-left">
              <h3 className="font-bold text-white">学习统计</h3>
              <p className="text-xs text-white/50">查看日历热力图与预测</p>
            </div>
          </div>
          <ChevronDown className="w-5 h-5 text-white/30 -rotate-90 group-hover:translate-x-1 transition-transform" />
        </button>

        <button
          onClick={onAddWord}
          className="glass-panel p-4 flex flex-col items-center justify-center gap-2 hover:bg-white/5 transition-colors group"
        >
          <div className="p-2 rounded-full bg-green-500/10 text-green-300 group-hover:scale-110 transition-transform">
            <Plus className="w-5 h-5" />
          </div>
          <span className="text-xs font-medium text-white/70">添加单词</span>
        </button>

        <button
          onClick={onOpenDeckClusters}
          className="glass-panel p-4 flex flex-col items-center justify-center gap-2 hover:bg-white/5 transition-colors group"
        >
          <div className="p-2 rounded-full bg-orange-500/10 text-orange-300 group-hover:scale-110 transition-transform">
            <Sparkles className="w-5 h-5" />
          </div>
          <span className="text-xs font-medium text-white/70">单词分组</span>
        </button>

        <button
          onClick={onOpenKnowledgeGraph}
          className="glass-panel p-4 flex flex-col items-center justify-center gap-2 hover:bg-white/5 transition-colors group"
        >
          <div className="p-2 rounded-full bg-indigo-500/10 text-indigo-300 group-hover:scale-110 transition-transform">
            <Network className="w-5 h-5" />
          </div>
          <span className="text-xs font-medium text-white/70">知识图谱</span>
        </button>
      </div>

      {/* 3. WORD LIST */}
      <div className="space-y-4">
        <div className="flex flex-col gap-4 sticky top-4 z-20 glass-panel p-2 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-white/30 ml-2" />
            <input
              type="text"
              placeholder="搜索单词..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 bg-transparent border-none text-sm text-white placeholder:text-white/20 focus:outline-none"
            />
            <div className="w-px h-4 bg-white/10" />
            <div className="flex gap-1 overflow-x-auto no-scrollbar">
              {(['due', 'learned', 'unlearned', 'familiar', 'important'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all",
                    activeTab === tab
                      ? "bg-white/20 text-white font-bold"
                      : "text-white/40 hover:bg-white/5 hover:text-white/80"
                  )}
                >
                  {tab === 'due' && '待复习'}
                  {tab === 'learned' && '已学'}
                  {tab === 'unlearned' && '未学'}
                  {tab === 'familiar' && '熟悉'}
                  {tab === 'important' && '重点'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <AnimatePresence mode="popLayout">
          {visibleCards.length > 0 ? (
            <div className="grid grid-cols-1 gap-2">
              {visibleCards.map(card => (
                <motion.div
                  layout
                  key={card.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="glass-panel p-0 overflow-hidden"
                >
                  <div
                    onClick={() => toggleExpand(card.id)}
                    className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <div className="flex-1 min-w-0 mr-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-white text-base truncate">{card.word}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/40">{card.partOfSpeech || 'n.'}</span>
                        {card.isImportant && <Heart className="w-3 h-3 text-red-500 fill-current" />}
                      </div>
                      <p className="text-xs text-white/50 line-clamp-1">{card.meaning}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {activeTab === 'learned' && (
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] text-white/30">下次复习</span>
                          <span className="text-xs font-bold text-blue-300 font-mono bg-blue-500/10 px-2 py-0.5 rounded">
                            {getNextReviewTime(card.due)}
                          </span>
                        </div>
                      )}
                      <button
                        onClick={(e) => handleDeleteCard(e, card.id)}
                        className="p-2 text-white/10 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {expandedCardId === card.id && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        exit={{ height: 0 }}
                        className="border-t border-white/5 bg-black/20"
                      >
                        <div className="p-4 space-y-3 text-sm">
                          <div>
                            <span className="text-white/30 text-[10px] uppercase tracking-wider block mb-1">完整释义</span>
                            <p className="text-white/80">{card.meaning}</p>
                          </div>
                          {(card.example || card.exampleMeaning) && (
                            <div>
                              <span className="text-white/30 text-[10px] uppercase tracking-wider block mb-1">例句</span>
                              <p className="text-white/80 italic text-xs">"{card.example}"</p>
                              <p className="text-white/50 text-xs">{card.exampleMeaning}</p>
                            </div>
                          )}
                          <div className="flex justify-end pt-2">
                            <button
                              onClick={(e) => handleOpenPreview(e, card.id)}
                              className="flex items-center gap-2 text-xs bg-blue-500/10 text-blue-300 px-3 py-1.5 rounded hover:bg-blue-500/20 transition-colors"
                            >
                              <Eye className="w-3 h-3" /> 卡片视图
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}

              <div ref={observerTarget} className="p-4 text-center text-white/20 text-sm">
                {visibleCards.length < filteredCards.length ? (
                  <span className="animate-pulse">加载更多...</span>
                ) : (
                  <span>没有更多了</span>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-20 text-white/20">
              <p>暂无单词</p>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Card Preview Modal */}
      <AnimatePresence>
        {previewCardId && (
          <PreviewModal
            cardId={previewCardId}
            cards={cards}
            onClose={() => setPreviewCardId(null)}
            isPreviewFlipped={isPreviewFlipped}
            setIsPreviewFlipped={setIsPreviewFlipped}
            onUpdateCard={onUpdateCard}
            setCards={setCards}
            handlers={{
              onGenerateExample, onGenerateMnemonic, onGenerateMeaning,
              onGeneratePhrases, onGenerateDerivatives, onGenerateRoots,
              onGenerateSyllables, onEnrich
            }}
            isEnriching={isEnriching}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Sub-component to avoid IIFE and hook issues
function PreviewModal({ cardId, cards, onClose, isPreviewFlipped, setIsPreviewFlipped, onUpdateCard, setCards, handlers, isEnriching }: any) {
  const card = cards.find((c: any) => c.id === cardId);
  if (!card) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="w-full max-w-md relative"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        <Flashcard
          card={card}
          flipped={isPreviewFlipped}
          onFlip={setIsPreviewFlipped}
          onUpdateCard={async (updatedCard) => {
            setCards((prev: any[]) => prev.map(c => c.id === updatedCard.id ? updatedCard : c));
            if (onUpdateCard) await onUpdateCard(updatedCard);
          }}
          onEnrich={async () => {
            if (handlers.onEnrich) {
              const updated = await handlers.onEnrich(card);
              if (updated) setCards((prev: any[]) => prev.map(i => i.id === updated.id ? updated : i));
            }
          }}
          isEnriching={isEnriching}
          // Generators
          onGenerateExample={async (c) => { if (handlers.onGenerateExample) { const u = await handlers.onGenerateExample(c); if (u) setCards((p: any) => p.map((i: any) => i.id === u.id ? u : i)); return u; } }}
          onGenerateMnemonic={async (c) => { if (handlers.onGenerateMnemonic) { const u = await handlers.onGenerateMnemonic(c); if (u) setCards((p: any) => p.map((i: any) => i.id === u.id ? u : i)); return u; } }}
          onGenerateMeaning={async (c) => { if (handlers.onGenerateMeaning) { const u = await handlers.onGenerateMeaning(c); if (u) setCards((p: any) => p.map((i: any) => i.id === u.id ? u : i)); return u; } }}
          onGeneratePhrases={async (c) => { if (handlers.onGeneratePhrases) { const u = await handlers.onGeneratePhrases(c); if (u) setCards((p: any) => p.map((i: any) => i.id === u.id ? u : i)); return u; } }}
          onGenerateDerivatives={async (c) => { if (handlers.onGenerateDerivatives) { const u = await handlers.onGenerateDerivatives(c); if (u) setCards((p: any) => p.map((i: any) => i.id === u.id ? u : i)); return u; } }}
          onGenerateRoots={async (c) => { if (handlers.onGenerateRoots) { const u = await handlers.onGenerateRoots(c); if (u) setCards((p: any) => p.map((i: any) => i.id === u.id ? u : i)); return u; } }}
          onGenerateSyllables={async (c) => { if (handlers.onGenerateSyllables) { const u = await handlers.onGenerateSyllables(c); if (u) setCards((p: any) => p.map((i: any) => i.id === u.id ? u : i)); return u; } }}
        />
      </motion.div>
    </div>
  );
}