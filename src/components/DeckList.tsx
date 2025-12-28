import React, { useEffect, useState } from 'react';
import { Plus, Layers, Trash2, TestTube } from 'lucide-react';
import { createDeck, getAllDecks, getAllCards, deleteDeck, SYSTEM_DECK_GUIDED, getDueCards, getNewCards, resetDatabase, getAllLogs } from '@/lib/data-source';
import type { Deck } from '@/types';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { AnimatePresence } from 'framer-motion';
import { seedTestDeck } from '@/lib/seed';
import { DashboardHero } from './dashboard/DashboardHero';
import { Deck3DCard } from './dashboard/Deck3DCard';
import { SyncStatusIndicator } from './SyncStatusIndicator';

interface DeckListProps {
  onSelectDeck: (deck: Deck) => void;
  onOpenKnowledgeGraph: () => void;
  onOpenShadowing: () => void;
  onStartQuickSession?: (type: 'review' | 'new') => void;
}

export function DeckList({ onSelectDeck, onOpenShadowing, onStartQuickSession }: DeckListProps) {
  const [decks, setDecks] = useState<(Deck & { cardCount: number })[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedProgress, setSeedProgress] = useState({ current: 0, total: 0, word: '' });
  const [isLoading, setIsLoading] = useState(true);

  // Global Stats
  const [globalStats, setGlobalStats] = useState({
    totalDue: 0,
    totalNew: 0,
    streak: 0,
    totalLearned: 0
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
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

      // Calculate Streak
      const logs = await getAllLogs();
      const uniqueDays = new Set(logs.map((log: any) => new Date(log.review).toDateString()));

      let streak = 0;
      let checkDate: Date | null = new Date();

      // If we haven't studied today, we can still have a streak if we studied yesterday
      if (!uniqueDays.has(checkDate.toDateString())) {
        checkDate.setDate(checkDate.getDate() - 1);
        if (!uniqueDays.has(checkDate.toDateString())) {
          // No study today or yesterday -> streak broken
          checkDate = null;
        }
      }

      if (checkDate) {
        while (true) {
          if (uniqueDays.has(checkDate.toDateString())) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
          } else {
            break;
          }
        }
      }

      setGlobalStats(prev => ({
        ...prev,
        totalDue: due.length,
        totalNew: newCards.length,
        streak: streak
      }));

    } catch (error) {
      console.error("Failed to load decks:", error);
    } finally {
      setIsLoading(false);
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
        description: 'New custom deck',
        theme: 'blue'
      };

      await createDeck(newDeck);
      setNewDeckName('');
      setIsCreating(false);
      await loadData();
    } catch (error) {
      console.error("Failed to create deck:", error);
      alert('创建失败');
    }
  };

  const handleDeleteDeck = async (e: React.MouseEvent, deckId: string, deckName: string) => {
    e.stopPropagation();
    if (confirm(`确定要删除 "${deckName}" 吗？此操作不可恢复。`)) {
      try {
        await deleteDeck(deckId);
        await loadData();
      } catch (error) {
        console.error("Failed to delete deck:", error);
        alert('删除失败');
      }
    }
  };

  const handleResetData = async () => {
    if (confirm("DANGER: 确定要清空所有数据吗？这包括所有单词和进度！")) {
      if (confirm("再次确认：此操作不可撤销！")) {
        await resetDatabase();
        window.location.reload();
      }
    }
  }

  // Loading State - Clean minimal loader
  if (isLoading) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 py-8 min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-white/50">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          <span className="text-sm">加载中...</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full max-w-5xl mx-auto px-4 py-8 space-y-8"
    >

      {/* 1. Hero / Command Center */}
      <DashboardHero
        stats={globalStats}
        onStartSession={() => onStartQuickSession?.('review')}
        onOpenShadowing={onOpenShadowing}
      />

      {/* 2. Decks Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h2 className="text-xl font-bold flex items-center gap-2 text-white/90">
            <Layers className="w-5 h-5 text-blue-400" />
            我的卡包
          </h2>
          <div className='flex gap-2 text-white/30 items-center'>
            <SyncStatusIndicator />
            <div className="w-px h-4 bg-white/10 mx-1" />
            <button
              onClick={handleResetData}
              className="p-2 hover:text-red-400 hover:bg-white/5 rounded-full transition-colors"
              title="重置数据"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleSeedData}
              disabled={isSeeding}
              className="p-2 hover:text-yellow-400 hover:bg-white/5 rounded-full transition-colors"
              title="生成测试数据"
            >
              {isSeeding ? <span className="text-xs">{seedProgress.current}/{seedProgress.total}</span> : <TestTube className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

          {/* Create New Deck Card - Liquid Glass */}
          <div
            className={cn(
              "group relative h-48 rounded-[2rem] border border-dashed border-white/20 hover:border-white/40 bg-white/5 hover:bg-white/10 backdrop-blur-2xl transition-all cursor-pointer flex flex-col items-center justify-center gap-3 overflow-hidden shadow-xl hover:shadow-2xl hover:-translate-y-1 duration-300",
              isCreating && "border-solid bg-white/10 border-white/30 shadow-2xl"
            )}
          >
            {/* Inner highlight */}
            <div className="absolute inset-0 rounded-[2rem] shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] pointer-events-none" />

            {isCreating ? (
              <form
                onSubmit={handleCreateDeck}
                className="relative z-10 w-full h-full p-6 flex flex-col justify-center items-center gap-5 animate-in fade-in zoom-in"
              >
                <input
                  autoFocus
                  type="text"
                  value={newDeckName}
                  onChange={(e) => setNewDeckName(e.target.value)}
                  placeholder="卡包名称..."
                  className="w-full bg-transparent text-center text-xl font-bold text-white placeholder:text-white/20 focus:outline-none border-b border-pink-200/20 pb-2 focus:border-pink-200/50 transition-colors"
                />
                <div className="flex gap-3 w-full">
                  <button
                    type="button"
                    onClick={() => setIsCreating(false)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white/40 hover:bg-white/5 hover:text-white transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white text-sm font-bold shadow-lg shadow-pink-500/20 hover:scale-105 transition-transform"
                  >
                    创建
                  </button>
                </div>
              </form>
            ) : (
              <div onClick={() => setIsCreating(true)} className="relative z-10 w-full h-full flex flex-col items-center justify-center gap-3 group">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-pink-200/30 group-hover:scale-110 group-hover:bg-rose-500/10 group-hover:text-pink-200 group-hover:border-rose-500/20 transition-all duration-300">
                  <Plus className="w-8 h-8" />
                </div>
                <span className="text-sm font-semibold text-white/40 group-hover:text-pink-100/80 tracking-wide transition-colors">新建卡包</span>
              </div>
            )}
          </div>

          {/* Deck Cards */}
          <AnimatePresence>
            {decks.map(deck => (
              <Deck3DCard
                key={deck.id}
                deck={{
                  ...deck,
                  name: {
                    "vocabulary-book": "生词",
                    "生词本": "生词",
                    "四级核心词 (CET-4)": "四级",
                    "六级核心词 (CET-6)": "六级",
                  }[deck.name] || deck.name
                }}
                onClick={() => onSelectDeck(deck)}
                onDelete={(e) => handleDeleteDeck(e, deck.id, deck.name)}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>

    </div>
  );
}
