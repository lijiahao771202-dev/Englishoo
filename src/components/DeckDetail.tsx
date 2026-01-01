/**
 * @description 单词本详情页 (Deck Detail Page)
 * 包含单词列表、学习入口、阅读练习入口等。
 * 实现了分页加载、多维度筛选（已学、未学、熟悉、重点）以及液态玻璃 UI 风格。
 */
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { ArrowLeft, Plus, X, Eye, BookOpen, Search, Sparkles, RefreshCw, Activity, Loader2, BrainCircuit, Network, Heart, Trash2 } from 'lucide-react';
import { speak } from '@/lib/tts';
import { Flashcard } from '@/components/Flashcard';
import { getDeckById, getAllCards, getDueCards, getNewCards, deleteCard, getAllLogs, deleteDeck } from '@/lib/data-source';
import { EmbeddingService } from '@/lib/embedding';

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
  initialDeck?: Deck | null;
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
  initialDeck,
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
  const [deck, setDeck] = useState<Deck | null>(initialDeck || null);
  const [stats, setStats] = useState({ total: 0, due: 0, new: 0 });
  const [cards, setCards] = useState<WordCard[]>([]);
  // @ts-ignore
  const [logs, setLogs] = useState<(ReviewLog & { cardId: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [previewCardId, setPreviewCardId] = useState<string | null>(null);
  const [isPreviewFlipped, setIsPreviewFlipped] = useState(false);
  // 构建知识图谱状态
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildProgress, setBuildProgress] = useState({ current: 0, total: 0, stage: '' });

  // New state for tabs and pagination
  const [activeTab, setActiveTab] = useState<TabType>('due');
  const [displayLimit, setDisplayLimit] = useState(100);
  const [showStats, setShowStats] = useState(false);
  const [showWordList, setShowWordList] = useState(false); // 单词列表默认折叠

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

  // 批量构建知识图谱（语义关联）
  const handleBuildKnowledgeGraph = async () => {
    if (isBuilding || cards.length === 0) return;
    if (!confirm(`确定要为 ${cards.length} 个单词构建语义关联？\n这可能需要几分钟时间。`)) return;

    setIsBuilding(true);
    setBuildProgress({ current: 0, total: cards.length, stage: '初始化...' });

    try {
      const words = cards.map(c => c.word);
      const service = EmbeddingService.getInstance();
      await service.batchProcess(words, (current, total, stage) => {
        setBuildProgress({ current, total, stage });
      });
      // Phase 2: Generate Semantic Clusters (分组)
      setBuildProgress({ current: cards.length, total: cards.length, stage: '正在生成语义分组...' });
      await service.getDeckClusters(deckId, undefined, true);
      alert(`✅ 成功为 ${cards.length} 个单词构建了语义关联并生成了分组！`);
    } catch (error) {
      console.error('Failed to build knowledge graph:', error);
      alert('构建失败，请查看控制台。');
    } finally {
      setIsBuilding(false);
    }
  };

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

  // Loading State - Clean minimal loader
  if (isLoading && !deck) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 py-8 min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-white/50">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          <span className="text-sm">加载中...</span>
        </div>
      </div>
    );
  }

  // 2. Error State
  if (!deck && !isLoading) {
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
    // [FIX 2024-12-16] 整组学习模式 - 跳转到分组页面让用户选择组
    // 用户需求：点击"学习新词"应该按组学习，而不是随机加载 N 个新词
    if (onOpenDeckClusters) {
      onOpenDeckClusters();
    } else {
      alert('请先进入单词分组页面开始学习');
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
    <div className="w-full max-w-5xl mx-auto px-4 py-8 space-y-8 pb-20">
      {/* Header - 从上方滑入 */}
      {/* Header - 从上方滑入 */}
      <motion.div
        className="flex items-center gap-4 drag-region"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      >
        <motion.button
          onClick={onBack}
          className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors no-drag"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <ArrowLeft className="w-6 h-6" />
        </motion.button>
        <motion.div
          className="flex-1"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
        >
          <h1 className="text-2xl font-bold text-white truncate">{deck!.name || '未命名卡包'}</h1>
          <p className="text-white/50 text-xs">
            {stats.total > 0 ? `${stats.total} 单词` : (deck!.description || "加载中...")}
          </p>
        </motion.div>
        <motion.button
          onClick={handleDeleteDeck}
          className="p-2 rounded-full hover:bg-red-500/20 text-red-400/50 hover:text-red-400 transition-colors no-drag"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <Trash2 className="w-5 h-5" />
        </motion.button>
      </motion.div>

      {/* 1. HERO STUDY SECTION V2 - 从下方弹入 */}
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          duration: 0.6,
          delay: 0.15,
          ease: [0.16, 1, 0.3, 1] // Apple 的 spring 缓动曲线
        }}
        className="glass-panel p-0 relative overflow-hidden group min-h-[300px] flex flex-col"
      >
        {/* Animated Mesh Gradient Background */}
        <div className="absolute inset-0 opacity-40 mix-blend-screen pointer-events-none">
          <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[radial-gradient(circle_at_50%_50%,rgba(76,29,149,0.4),transparent_50%)] animate-[spin_20s_linear_infinite]" />
          <div className="absolute top-[-20%] right-[-20%] w-[100%] h-[100%] bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.3),transparent_50%)] animate-[pulse_8s_ease-in-out_infinite]" />
          <div className="absolute bottom-[-20%] left-[20%] w-[80%] h-[80%] bg-[radial-gradient(circle_at_50%_50%,rgba(236,72,153,0.3),transparent_50%)] animate-[bounce_10s_infinite]" />
        </div>

        {/* Content Container - 内容顺序渐现 */}
        <div className="relative z-10 flex-1 flex flex-col p-8">
          {/* Total Progress Header */}
          <motion.div
            className="flex items-start justify-between mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            <div>
              <div className="text-white/40 text-xs font-medium tracking-wider uppercase mb-1">总进度</div>
              <motion.div
                className="flex items-baseline gap-2"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4, duration: 0.4, type: "spring" }}
              >
                <span className="text-3xl font-light text-white font-outfit">
                  {stats.total - stats.new}
                </span>
                <span className="text-white/30 text-sm">/ {stats.total}</span>
              </motion.div>
            </div>
            {/* Circular Progress Ring - 环形进度条动画 */}
            <motion.div
              className="relative w-16 h-16"
              initial={{ opacity: 0, rotate: -90, scale: 0.8 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              transition={{ delay: 0.35, duration: 0.6, type: "spring" }}
            >
              <svg className="w-full h-full -rotate-90">
                <circle cx="32" cy="32" r="28" className="stroke-white/5 fill-none" strokeWidth="6" />
                <motion.circle
                  cx="32" cy="32" r="28"
                  className="stroke-purple-500 fill-none"
                  strokeWidth="6"
                  strokeDasharray={175}
                  initial={{ strokeDashoffset: 175 }}
                  animate={{ strokeDashoffset: 175 - (stats.total > 0 ? ((stats.total - stats.new) / stats.total) * 175 : 0) }}
                  transition={{ delay: 0.5, duration: 1, ease: "easeOut" }}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-[10px] text-white/50">
                {stats.total > 0 ? Math.round(((stats.total - stats.new) / stats.total) * 100) : 0}%
              </div>
            </motion.div>
          </motion.div>

          {/* Main Dashboard Stats & Actions - 两列依次入场 */}
          <motion.div
            className="flex-1 grid grid-cols-2 gap-8 items-center border-t border-white/5 pt-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45, duration: 0.4 }}
          >
            {/* Review Column */}
            <motion.div
              className="flex flex-col gap-4"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5, duration: 0.4 }}
            >
              <div
                className="cursor-pointer group/stat transition-opacity hover:opacity-80"
                onClick={onOpenReviewDashboard}
              >
                <motion.div
                  className="text-4xl font-light text-white font-outfit mb-1"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.55, duration: 0.3, type: "spring", stiffness: 300 }}
                >
                  {stats.due}
                </motion.div>
                <div className="text-xs text-blue-300 font-medium flex items-center gap-1">
                  待复习
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleStartReview}
                disabled={stats.due === 0}
                className="w-full py-3 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-200 text-sm font-medium transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 group/btn"
              >
                <RefreshCw className={cn("w-4 h-4", stats.due > 0 && "group-hover/btn:rotate-180 transition-transform duration-500")} />
                开始复习
              </motion.button>
            </motion.div>

            {/* Learn Column */}
            <motion.div
              className="flex flex-col gap-4 relative"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.55, duration: 0.4 }}
            >
              <div className="absolute left-[-1rem] top-0 bottom-0 w-px bg-white/5" />
              <div>
                <motion.div
                  className="text-4xl font-light text-white/90 font-outfit mb-1"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.6, duration: 0.3, type: "spring", stiffness: 300 }}
                >
                  {stats.new}
                </motion.div>
                <div className="text-xs text-emerald-300 font-medium">新词</div>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleStartLearn}
                disabled={stats.new === 0}
                className="w-full py-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-200 text-sm font-medium transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 group/btn"
              >
                <Sparkles className="w-4 h-4 group-hover/btn:scale-110 transition-transform" />
                学习新词
              </motion.button>
            </motion.div>
          </motion.div>
        </div>
      </motion.div>

      {/* 2. COMMAND BAR - 工具按钮依次入场 */}
      <motion.div
        className="flex gap-3 overflow-x-auto no-scrollbar pb-2 mask-linear-fade"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.65, duration: 0.4 }}
      >
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowStats(true)}
          className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all shrink-0 group"
        >
          <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-300 group-hover:scale-110 transition-transform">
            <Activity className="w-4 h-4" />
          </div>
          <div className="text-left">
            <div className="text-sm text-white font-medium">学习统计</div>
          </div>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onOpenDeckClusters}
          className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all shrink-0 group"
        >
          <div className="p-1.5 rounded-lg bg-orange-500/20 text-orange-300 group-hover:scale-110 transition-transform">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="text-left">
            <div className="text-sm text-white font-medium">单词分组</div>
          </div>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleBuildKnowledgeGraph}
          disabled={isBuilding}
          className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all shrink-0 group disabled:opacity-50"
        >
          <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 group-hover:scale-110 transition-transform">
            {isBuilding ? <Loader2 className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
          </div>
          <div className="text-left">
            <div className="text-sm text-white font-medium">
              {isBuilding ? `${buildProgress.current}/${buildProgress.total}` : '构建图谱'}
            </div>
          </div>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onOpenKnowledgeGraph}
          className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all shrink-0 group"
        >
          <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 group-hover:scale-110 transition-transform">
            <Network className="w-4 h-4" />
          </div>
          <div className="text-left">
            <div className="text-sm text-white font-medium">知识图谱</div>
          </div>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={_onReadingPractice}
          className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all shrink-0 group"
        >
          <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 group-hover:scale-110 transition-transform">
            <BookOpen className="w-4 h-4" />
          </div>
          <div className="text-left">
            <div className="text-sm text-white font-medium">阅读练习</div>
          </div>
        </motion.button>
      </motion.div>

      {/* FLOATING ACTION BUTTON (Add Word) */}
      <motion.button
        initial={{ scale: 0, rotate: 90 }}
        animate={{ scale: 1, rotate: 0 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={onAddWord}
        className="fixed bottom-8 right-8 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/30 flex items-center justify-center text-white border border-white/20 backdrop-blur-md"
        style={{ marginBottom: '80px' }} // Avoid overlapping with FloatingAIChat if present
      >
        <Plus className="w-8 h-8" />
      </motion.button>

      {/* 3. WORD LIST - 可折叠 */}
      <div className="space-y-4">
        {/* 折叠/展开按钮 */}
        <motion.button
          onClick={() => setShowWordList(!showWordList)}
          className="w-full glass-panel p-4 flex items-center justify-between hover:bg-white/5 transition-colors group"
          whileTap={{ scale: 0.99 }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-white/5">
              <BookOpen className="w-4 h-4 text-white/60" />
            </div>
            <div className="text-left">
              <div className="text-sm font-medium text-white">单词列表</div>
              <div className="text-xs text-white/40">
                共 {filteredCards.length} 个单词 · 点击{showWordList ? '收起' : '展开'}
              </div>
            </div>
          </div>
          <motion.div
            animate={{ rotate: showWordList ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-white/40 group-hover:text-white/60 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </motion.div>
        </motion.button>

        {/* 可折叠的单词列表内容 */}
        <AnimatePresence>
          {showWordList && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              {/* 搜索和筛选工具栏 */}
              <div className="flex flex-col gap-4 sticky top-4 z-20 glass-panel p-2 backdrop-blur-xl mb-2">
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
            </motion.div>
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
    </div >
  );
}

// Sub-component to avoid IIFE and hook issues
function PreviewModal({ cardId, cards, onClose, isPreviewFlipped, setIsPreviewFlipped, onUpdateCard, setCards, handlers, isEnriching }: any) {
  const card = cards.find((c: any) => c.id === cardId);

  // Auto-play on mount/update
  useEffect(() => {
    if (card) speak(card.word);
  }, [card?.word]);

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
          // autoPlay removed - controlled by parent useEffect
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