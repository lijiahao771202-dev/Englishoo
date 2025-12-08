import React, { useEffect, useState } from 'react';
import { Plus, Layers, BookOpen, Trash2, TestTube, BrainCircuit, Mic, Sparkles, Zap, Clock } from 'lucide-react';
import { createDeck, getAllDecks, getAllCards, deleteDeck, SYSTEM_DECK_GUIDED, getDueCards, getNewCards, resetDatabase } from '@/lib/db';
import type { Deck } from '@/types';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { motion, AnimatePresence } from 'framer-motion';
import { seedTestDeck } from '@/lib/seed';

interface DeckListProps {
  onSelectDeck: (deckId: string) => void;
  onOpenKnowledgeGraph: () => void;
  onOpenShadowing: () => void;
  // New prompt for starting a quick session
  onStartQuickSession?: (type: 'review' | 'new') => void;
}

export function DeckList({ onSelectDeck, onOpenShadowing }: DeckListProps) {
  const [decks, setDecks] = useState<(Deck & { cardCount: number })[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedProgress, setSeedProgress] = useState({ current: 0, total: 0, word: '' });

  // Global Stats
  const [globalStats, setGlobalStats] = useState({
    totalDue: 0,
    totalNew: 0,
    streak: 0, // Placeholder for now
    totalLearned: 0 // Placeholder
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const allDecks = await getAllDecks();

      // Calculate card counts for each deck
      const decksWithCounts = await Promise.all(allDecks.map(async (deck) => {
        const cards = await getAllCards(deck.id);
        return {
          ...deck,
          cardCount: cards.length
        };
      }));

      setDecks(decksWithCounts
        .filter(d => d.id !== SYSTEM_DECK_GUIDED)
        .sort((a, b) => {
          const dateA = a.createdAt ? (a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt)) : new Date(0);
          const dateB = b.createdAt ? (b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt)) : new Date(0);
          return (dateB.getTime() || 0) - (dateA.getTime() || 0);
        }));

      // Load Global Stats
      const due = await getDueCards();
      const newCards = await getNewCards();
      setGlobalStats(prev => ({
        ...prev,
        totalDue: due.length,
        totalNew: newCards.length
      }));

    } catch (error) {
      console.error("Failed to load decks:", error);
    }
  };

  const handleSeedData = async () => {
    if (isSeeding) return;
    if (!confirm('这将创建一个包含20个单词的测试卡包（混合新词和复习词），并计算它们的语义连接。确定要继续吗？')) return;

    setIsSeeding(true);
    try {
      await seedTestDeck((current: number, total: number, word: string) => {
        setSeedProgress({ current, total, word });
      });
      alert('测试卡包生成完成！');
      await loadData();
    } catch (error) {
      console.error("Seed failed:", error);
      alert('生成失败，请查看控制台');
    } finally {
      setIsSeeding(false);
      setSeedProgress({ current: 0, total: 0, word: '' });
    }
  };

  const handleCreateDeck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeckName.trim()) return;

    try {
      const newDeck: Deck = {
        id: uuidv4(),
        name: newDeckName.trim(),
        createdAt: new Date(),
        theme: 'blue'
      };

      await createDeck(newDeck);
      setNewDeckName('');
      setIsCreating(false);
      await loadData();
    } catch (error) {
      console.error("Failed to create deck:", error);
      alert(`创建失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleDeleteDeck = async (e: React.MouseEvent, deckId: string) => {
    e.stopPropagation();
    if (confirm('确定要删除这个卡包吗？里面的所有卡片也会被删除，且无法恢复。')) {
      try {
        await deleteDeck(deckId);
        await loadData();
      } catch (error) {
        console.error("Failed to delete deck:", error);
      }
    }
  };

  return (
    <div className="space-y-12 animate-in fade-in duration-500 pb-20">

      {/* 1. Dashboard Section */}
      <section className="relative">
        {/* Background Ambient */}
        <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-blue-500/10 to-transparent blur-3xl pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Daily Progress / Welcome */}
          <div className="lg:col-span-2 glass-panel p-8 flex flex-col justify-between min-h-[220px] relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-32 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-blue-500/20 transition-colors" />

            <div>
              <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60 mb-2">
                Dashboard
              </h1>
              <p className="text-white/50 text-lg">
                今天你还有 <span className="text-white font-bold">{globalStats.totalDue}</span> 个单词需要复习。
              </p>
            </div>

            <div className="flex gap-4 mt-8">
              <button
                onClick={() => {
                  // Find the first deck with due cards
                  // Logic: If there is a deck with due cards, simulate clicking on it?
                  // Since DeckList just calls onSelectDeck, we just grab the first deck ID.
                  if (decks.length > 0) {
                    // Prefer deck with most due cards?
                    // For now just pick the first one to keep it simple.
                    onSelectDeck(decks[0].id);
                  } else {
                    alert('请先创建卡包');
                  }
                }}
                className="px-6 py-3 rounded-xl bg-white text-slate-900 font-bold hover:scale-105 active:scale-95 transition-all shadow-lg flex items-center gap-2"
              >
                <Zap className="w-5 h-5 fill-current" />
                开始学习
              </button>

              <button
                onClick={onOpenShadowing}
                className="px-6 py-3 rounded-xl glass-button flex items-center gap-2"
              >
                <Mic className="w-5 h-5" />
                影子跟读
              </button>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-rows-2 gap-4">
            {/* Due Count */}
            <div className="glass-panel p-6 flex items-center justify-between relative overflow-hidden group">
              <div className="absolute inset-0 bg-blue-500/5 group-hover:bg-blue-500/10 transition-colors" />
              <div>
                <span className="text-white/40 text-sm font-medium uppercase tracking-wider">待复习</span>
                <div className="text-3xl font-black text-white mt-1">{globalStats.totalDue}</div>
              </div>
              <div className="p-3 rounded-full bg-blue-500/20 text-blue-300">
                <Clock className="w-6 h-6" />
              </div>
            </div>

            {/* New Cards Count */}
            <div className="glass-panel p-6 flex items-center justify-between relative overflow-hidden group">
              <div className="absolute inset-0 bg-emerald-500/5 group-hover:bg-emerald-500/10 transition-colors" />
              <div>
                <span className="text-white/40 text-sm font-medium uppercase tracking-wider">新词库</span>
                <div className="text-3xl font-black text-white mt-1">{globalStats.totalNew}</div>
              </div>
              <div className="p-3 rounded-full bg-emerald-500/20 text-emerald-300">
                <Sparkles className="w-6 h-6" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Decks Grid */}
      <section>
        <div className="flex items-center justify-between mb-6 px-2">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-white/50" />
            我的卡包
          </h2>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                if (confirm('【高风险操作】确定要清空所有数据吗？\n\n这将删除所有：\n1. 卡片与单词\n2. 学习记录与进度\n3. 分组缓存\n\n此操作不可恢复！')) {
                  if (confirm('再次确认：您真的要重新开始吗？')) {
                    try {
                      await resetDatabase();
                      alert('数据已清空。页面将刷新以重新初始化。');
                      window.location.reload();
                    } catch (e) {
                      alert('重置失败，请查看控制台');
                      console.error(e);
                    }
                  }
                }
              }}
              className="p-2 rounded-lg hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-colors"
              title="清空数据重来"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <button
              onClick={handleSeedData}
              disabled={isSeeding}
              className="p-2 rounded-lg hover:bg-white/10 text-white/30 hover:text-white transition-colors"
              title="生成测试数据"
            >
              <TestTube className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {/* Create New Deck Card */}
          <div
            onClick={() => setIsCreating(true)}
            className="aspect-[3/4] group cursor-pointer relative"
          >
            <div className="absolute inset-0 bg-white/5 hover:bg-white/10 border-2 border-dashed border-white/20 hover:border-white/40 rounded-2xl flex flex-col items-center justify-center gap-4 transition-all duration-300">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform text-white/30 group-hover:text-white">
                <Plus className="w-8 h-8" />
              </div>
              <span className="text-white/30 font-medium group-hover:text-white">新建卡包</span>
            </div>
          </div>

          {/* Deck List */}
          <AnimatePresence>
            {decks.map((deck) => (
              <motion.div
                key={deck.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={() => onSelectDeck(deck.id)}
                className="aspect-[3/4] group cursor-pointer relative perspective-1000"
              >
                {/* Modern Card Design (Flat -> 3D on Hover) */}
                <div className={cn(
                  "absolute inset-0 rounded-2xl overflow-hidden transition-all duration-500 transform bg-slate-800",
                  "group-hover:rotate-y-[-5deg] group-hover:scale-[1.02] group-hover:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)]",
                  "border border-white/10 group-hover:border-white/20"
                )}>
                  {/* Background with Gradient */}
                  <div className={cn(
                    "absolute inset-0 transition-opacity duration-500",
                    deck.id === SYSTEM_DECK_GUIDED
                      ? "bg-gradient-to-br from-emerald-900 to-teal-900"
                      : "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"
                  )} />

                  {/* Glass Overlay sheen */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                  {/* Content */}
                  <div className="absolute inset-0 p-6 flex flex-col justify-between z-10">
                    {/* Icon */}
                    <div className="flex justify-between items-start">
                      <div className={cn(
                        "p-3 rounded-xl backdrop-blur-md shadow-inner",
                        deck.id === SYSTEM_DECK_GUIDED
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-blue-500/10 text-blue-300"
                      )}>
                        {deck.id === SYSTEM_DECK_GUIDED ? <BrainCircuit className="w-6 h-6" /> : <Layers className="w-6 h-6" />}
                      </div>

                      {deck.id !== SYSTEM_DECK_GUIDED && deck.id !== 'vocabulary-book' && (
                        <button
                          onClick={(e) => handleDeleteDeck(e, deck.id)}
                          className="p-2 -mr-2 -mt-2 rounded-full hover:bg-red-500/20 text-white/10 hover:text-red-300 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Deck Info */}
                    <div>
                      <h3 className="text-xl font-bold text-white leading-tight mb-2 line-clamp-2">
                        {deck.name}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-white/40 font-mono">
                        <BookOpen className="w-3 h-3" />
                        <span>{deck.cardCount} 词</span>
                      </div>
                    </div>
                  </div>

                  {/* Page edges effect (Subtle) */}
                  <div className="absolute right-0 top-0 bottom-0 w-1 bg-gradient-to-l from-white/10 to-transparent" />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </section>

      {/* Progress Bar for Seeding */}
      {isSeeding && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 backdrop-blur rounded-full px-6 py-3 text-white border border-white/10 shadow-2xl flex items-center gap-4">
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <div className="text-sm">
            <span className="opacity-50">正在生成: </span>
            <span className="font-mono">{seedProgress.current}/{seedProgress.total}</span>
          </div>
          <div className="text-xs text-white/30">{seedProgress.word}</div>
        </div>
      )}

      {/* Create Deck Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-slate-900 border border-white/10 p-6 rounded-3xl w-full max-w-md shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="relative z-10 space-y-6">
              <h2 className="text-2xl font-bold text-white">新建卡包</h2>
              <form onSubmit={handleCreateDeck} className="space-y-6">
                <input
                  autoFocus
                  type="text"
                  placeholder="卡包名称 (例如: 托福核心词)"
                  value={newDeckName}
                  onChange={e => setNewDeckName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-white/20"
                />
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsCreating(false)}
                    className="px-6 py-2 rounded-xl text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-8 py-2 bg-white text-slate-900 hover:bg-slate-200 rounded-xl font-bold shadow-lg transition-colors"
                  >
                    创建
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
