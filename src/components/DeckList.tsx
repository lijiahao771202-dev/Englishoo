import React, { useEffect, useState } from 'react';
import { Plus, Layers, BookOpen, Trash2, TestTube, BrainCircuit } from 'lucide-react';
import { createDeck, getAllDecks, getAllCards, deleteDeck, SYSTEM_DECK_GUIDED } from '@/lib/db';
import type { Deck } from '@/types';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { motion, AnimatePresence } from 'framer-motion';
import { seedFromLocalJSON } from '@/lib/seed';

interface DeckListProps {
  onSelectDeck: (deckId: string) => void;
  onOpenKnowledgeGraph: () => void;
}

export function DeckList({ onSelectDeck }: DeckListProps) {
  const [decks, setDecks] = useState<(Deck & { cardCount: number })[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedProgress, setSeedProgress] = useState({ current: 0, total: 0, word: '' });

  useEffect(() => {
    loadDecks();
  }, []);

  const loadDecks = async () => {
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
    } catch (error) {
      console.error("Failed to load decks:", error);
    }
  };

  const handleSeedData = async () => {
    if (isSeeding) return;
    if (!confirm('这将生成100个测试单词并计算它们的语义连接。这可能需要几分钟时间。确定要继续吗？')) return;
    
    setIsSeeding(true);
    try {
        await seedFromLocalJSON((current: number, total: number, word: string) => {
            setSeedProgress({ current, total, word });
        });
        alert('生成完成！');
        await loadDecks();
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
    console.log("Attempting to create deck with name:", newDeckName);

    if (!newDeckName.trim()) {
        console.warn("Deck name is empty");
        return;
    }

    try {
      console.log("Generating UUID...");
      const id = uuidv4();
      console.log("UUID generated:", id);

      const newDeck: Deck = {
        id,
        name: newDeckName.trim(),
        createdAt: new Date(),
        theme: 'blue' // Default theme
      };

      console.log("Saving deck to DB:", newDeck);
      await createDeck(newDeck);
      console.log("Deck saved successfully");

      setNewDeckName('');
      setIsCreating(false);
      await loadDecks();
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
            await loadDecks();
        } catch (error) {
            console.error("Failed to delete deck:", error);
        }
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-400">
          我的卡包
        </h1>
        <div className="absolute top-4 right-4 flex gap-2">
            <button
                onClick={handleSeedData}
                disabled={isSeeding}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors flex items-center gap-2 text-xs border border-white/10"
                title="生成100个测试单词并构建图谱"
            >
                <TestTube className="w-4 h-4" />
                <span className="hidden md:inline">生成测试数据</span>
            </button>
        </div>
        <p className="text-white/50 text-sm">
          选择一个卡包开始学习，或者创建新的卡包。
        </p>
      </div>

      {/* Progress Bar for Seeding */}
      {isSeeding && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-slate-900/90 backdrop-blur text-white p-4 text-center border-b border-white/10">
            <div className="max-w-md mx-auto space-y-2">
                <div className="flex justify-between text-sm">
                    <span>正在生成测试数据...</span>
                    <span>{seedProgress.current} / {seedProgress.total}</span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-purple-500 transition-all duration-300" 
                        style={{ width: `${(seedProgress.current / seedProgress.total) * 100}%` }} 
                    />
                </div>
                <p className="text-xs text-white/50">正在处理: {seedProgress.word}</p>
            </div>
        </div>
      )}

        {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8 px-4">
        

        {/* Create New Deck Book */}
        <div 
          onClick={() => setIsCreating(true)}
          className="aspect-[3/4] group cursor-pointer perspective-1000"
        >
          <div className="relative w-full h-full transition-transform duration-500 group-hover:-translate-y-4 group-hover:rotate-y-[-10deg] origin-left preserve-3d">
            {/* Cover */}
            <div className="absolute inset-0 bg-white/5 backdrop-blur-sm border-2 border-dashed border-white/20 rounded-r-lg rounded-l-sm flex flex-col items-center justify-center gap-3 shadow-xl">
                 <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform text-white/30 group-hover:text-blue-400">
                    <Plus className="w-6 h-6" />
                 </div>
                 <span className="text-white/30 font-medium group-hover:text-blue-300">新建卡包</span>
            </div>
             {/* Pages Effect (Thickness) */}
            <div className="absolute inset-y-2 right-0 w-4 bg-white/5 rounded-r-sm transform translate-z-[-10px] translate-x-2" />
          </div>
          {/* Shadow */}
          <div className="absolute bottom-0 left-4 right-4 h-4 bg-black/50 blur-xl transform translate-y-4 scale-x-90 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        </div>

        {/* Existing Decks */}
        <AnimatePresence>
            {decks.map((deck) => (
            <motion.div
                key={deck.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={() => onSelectDeck(deck.id)}
                className="aspect-[3/4] group cursor-pointer perspective-1000 relative"
            >
                <div className="relative w-full h-full transition-transform duration-500 group-hover:-translate-y-4 group-hover:-translate-x-1 group-hover:rotate-y-[-10deg] origin-left preserve-3d z-10">
                    {/* Book Cover */}
                    <div className={cn(
                        "absolute inset-0 rounded-r-lg rounded-l-sm shadow-2xl overflow-hidden border-l border-white/10",
                        deck.id === SYSTEM_DECK_GUIDED
                            ? "bg-gradient-to-br from-emerald-900/90 to-teal-900/90 backdrop-blur-xl border-t border-r border-b border-white/20"
                            : "bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl border-t border-r border-b border-white/20"
                    )}>
                        {/* Spine Gradient */}
                        <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-white/20 via-white/5 to-transparent z-20" />
                        
                        {/* Liquid Glass Sheen */}
                        <div className="absolute inset-0 bg-gradient-to-tr from-white/5 via-transparent to-white/10 pointer-events-none" />
                        
                        {/* Content */}
                        <div className="absolute inset-0 p-6 flex flex-col z-10">
                            {/* Top Icon */}
                            <div className="flex justify-between items-start">
                                <div className="p-2 rounded-xl bg-white/10 text-white/80 backdrop-blur-md shadow-inner">
                                    {deck.id === SYSTEM_DECK_GUIDED ? <BrainCircuit className="w-5 h-5" /> : <Layers className="w-5 h-5" />}
                                </div>
                                
                                {deck.id !== SYSTEM_DECK_GUIDED && deck.id !== 'vocabulary-book' && (
                                <button 
                                    onClick={(e) => handleDeleteDeck(e, deck.id)}
                                    className="p-2 -mr-2 -mt-2 rounded-full hover:bg-red-500/20 text-white/20 hover:text-red-300 transition-colors opacity-0 group-hover:opacity-100"
                                    title="删除卡包"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                                )}
                            </div>

                            {/* Title */}
                            <div className="mt-8 flex-1">
                                <h3 className="text-xl font-bold text-white/90 leading-tight break-words line-clamp-3" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
                                    {deck.name}
                                </h3>
                            </div>

                            {/* Footer Info */}
                            <div className="mt-auto pt-4 border-t border-white/10">
                                <div className="flex items-center gap-2 text-xs text-white/50 font-mono">
                                    <BookOpen className="w-3 h-3" />
                                    <span>{deck.cardCount} 词</span>
                                </div>
                            </div>
                        </div>
                        
                        {/* Decorative Blob */}
                        <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-blue-500/20 blur-3xl rounded-full pointer-events-none" />
                    </div>

                    {/* Page Thickness (Right Side) */}
                    <div className="absolute inset-y-1 -right-3 w-3 bg-gradient-to-r from-slate-200 to-slate-300 rounded-r-sm transform translate-z-[-5px] shadow-lg flex flex-col justify-between py-2 overflow-hidden">
                         {/* Paper Texture Lines */}
                         {[...Array(10)].map((_, i) => (
                            <div key={i} className="w-full h-[1px] bg-black/10" />
                         ))}
                    </div>
                </div>
                
                {/* Bottom Shadow/Reflection */}
                <div className="absolute bottom-0 left-4 right-4 h-6 bg-black/60 blur-xl transform translate-y-6 scale-x-90 opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-0" />
            </motion.div>
            ))}
        </AnimatePresence>
      </div>

      {/* Create Deck Modal - Simplified for this context (Inline Input or Modal) */}
      {isCreating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="bg-slate-900 border border-white/10 p-6 rounded-2xl w-full max-w-md shadow-2xl relative overflow-hidden">
                   <div className="relative z-10 space-y-4">
                       <h2 className="text-xl font-bold text-white">新建卡包</h2>
                       <form onSubmit={handleCreateDeck} className="space-y-4">
                           <input 
                              autoFocus
                              type="text" 
                              placeholder="卡包名称 (例如: 托福核心词)" 
                              value={newDeckName}
                              onChange={e => setNewDeckName(e.target.value)}
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                           />
                           <div className="flex justify-end gap-3">
                               <button 
                                  type="button"
                                  onClick={() => setIsCreating(false)}
                                  className="px-4 py-2 text-white/60 hover:text-white"
                               >
                                   取消
                               </button>
                               <button 
                                  type="submit"
                                  className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium shadow-lg shadow-blue-500/20"
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
