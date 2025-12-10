/**
 * @description 复习队列页面 (Review Queue Page)
 * 展示所有进入复习阶段（非 New 状态）的卡片，按时间分组展示（已过期、今天、明天、未来）。
 * 提供直观的时间轴视图，帮助用户规划复习进度。
 */
import React, { useEffect, useState, useMemo } from 'react';
import { ArrowLeft, Clock, Calendar, CheckCircle, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, addDays, startOfDay } from 'date-fns';
import { getAllCards, getDeckById } from '@/lib/data-source';
import type { Deck, WordCard } from '@/types';
import { State } from 'ts-fsrs';
import { cn } from '@/lib/utils';

interface ReviewQueuePageProps {
    deckId: string;
    onBack: () => void;
}

type TimeGroup = 'overdue' | 'today' | 'tomorrow' | 'week' | 'future';

interface GroupedCards {
    id: TimeGroup;
    title: string;
    description: string;
    cards: WordCard[];
    color: string;
    icon: React.ReactNode;
}

export function ReviewQueuePage({ deckId, onBack }: ReviewQueuePageProps) {
    const [deck, setDeck] = useState<Deck | null>(null);
    const [cards, setCards] = useState<WordCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedGroups, setExpandedGroups] = useState<Set<TimeGroup>>(new Set(['overdue', 'today']));

    useEffect(() => {
        loadData();
    }, [deckId]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [deckData, allCards] = await Promise.all([
                getDeckById(deckId),
                getAllCards(deckId)
            ]);
            setDeck(deckData || null);

            // Filter for review cards (State !== New && State !== 0)
            // Also exclude familiar cards if desired, but user asked for "all review cards".
            // Usually "Review Queue" implies things that WILL be reviewed.
            // If a card is "Familiar", it might not be scheduled for review soon or ever?
            // Let's include everything that has a due date.
            const reviewCards = allCards.filter(card =>
                card.due &&

                !card.isFamiliar
            );

            setCards(reviewCards);
        } catch (e) {
            console.error("Failed to load review queue data", e);
        } finally {
            setLoading(false);
        }
    };

    const groupedCards = useMemo(() => {
        const groups: Record<TimeGroup, WordCard[]> = {
            overdue: [],
            today: [],
            tomorrow: [],
            week: [],
            future: []
        };

        const now = new Date();
        const todayStart = startOfDay(now);
        const tomorrowStart = addDays(todayStart, 1);
        const dayAfterTomorrowStart = addDays(todayStart, 2);
        const nextWeekStart = addDays(todayStart, 7);

        cards.forEach(card => {
            if (!card.due) return;
            const dueDate = new Date(card.due);

            if (dueDate < now) {
                groups.overdue.push(card);
            } else if (dueDate < tomorrowStart) {
                groups.today.push(card);
            } else if (dueDate < dayAfterTomorrowStart) {
                groups.tomorrow.push(card);
            } else if (dueDate < nextWeekStart) {
                groups.week.push(card);
            } else {
                groups.future.push(card);
            }
        });

        // Sort cards within groups by due date
        Object.values(groups).forEach(group => {
            group.sort((a, b) => new Date(a.due!).getTime() - new Date(b.due!).getTime());
        });

        const result: GroupedCards[] = [
            {
                id: 'overdue',
                title: '已过期',
                description: '需要立即复习',
                cards: groups.overdue,
                color: 'text-red-400',
                icon: <AlertCircle className="w-5 h-5" />
            },
            {
                id: 'today',
                title: '今天',
                description: '今日内到期',
                cards: groups.today,
                color: 'text-orange-400',
                icon: <Clock className="w-5 h-5" />
            },
            {
                id: 'tomorrow',
                title: '明天',
                description: '即将到来',
                cards: groups.tomorrow,
                color: 'text-blue-400',
                icon: <Calendar className="w-5 h-5" />
            },
            {
                id: 'week',
                title: '未来 7 天',
                description: '本周计划',
                cards: groups.week,
                color: 'text-purple-400',
                icon: <Calendar className="w-5 h-5" />
            },
            {
                id: 'future',
                title: '更久之后',
                description: '远期规划',
                cards: groups.future,
                color: 'text-emerald-400',
                icon: <CheckCircle className="w-5 h-5" />
            }
        ];

        return result.filter(g => g.cards.length > 0);
    }, [cards]);

    const toggleGroup = (groupId: TimeGroup) => {
        const newSet = new Set(expandedGroups);
        if (newSet.has(groupId)) {
            newSet.delete(groupId);
        } else {
            newSet.add(groupId);
        }
        setExpandedGroups(newSet);
    };

    if (loading) {
        return <div className="text-center py-20 text-white/50">加载中...</div>;
    }

    return (
        <div className="space-y-6 pb-20 animate-in fade-in duration-500">
            {/* Header */}
            <motion.div
                className="flex items-center gap-4 sticky top-0 bg-slate-950/80 backdrop-blur-md p-4 -mx-4 z-20 border-b border-white/5"
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
            >
                <button
                    onClick={onBack}
                    className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                >
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-white">复习队列</h1>
                    <p className="text-white/50 text-xs">
                        {deck?.name} · 共 {cards.length} 个待复习单词
                    </p>
                </div>
            </motion.div>

            {/* Timeline Groups */}
            <div className="space-y-6 relative">
                {/* Connection Line */}
                <div className="absolute left-6 top-4 bottom-0 w-px bg-white/10 z-0" />

                {groupedCards.map((group, index) => (
                    <motion.div
                        key={group.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="relative z-10"
                    >
                        {/* Group Header */}
                        <div
                            onClick={() => toggleGroup(group.id)}
                            className="flex items-center gap-4 cursor-pointer group mb-4"
                        >
                            <div className={cn(
                                "w-12 h-12 rounded-full flex items-center justify-center border-4 border-slate-950 shadow-xl transition-transform group-hover:scale-110",
                                "bg-slate-900",
                                group.color
                            )}>
                                {group.icon}
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <h3 className={cn("text-lg font-bold", group.color)}>{group.title}</h3>
                                    <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full text-white/60 font-mono">
                                        {group.cards.length}
                                    </span>
                                </div>
                                <p className="text-xs text-white/30">{group.description}</p>
                            </div>
                            <div className="mr-2 text-white/30 transition-transform duration-300">
                                {expandedGroups.has(group.id) ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                            </div>
                        </div>

                        {/* Cards List */}
                        <AnimatePresence>
                            {expandedGroups.has(group.id) && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="pl-14 overflow-hidden"
                                >
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-8">
                                        {group.cards.map(card => (
                                            <div key={card.id} className="glass-panel p-3 flex items-center justify-between hover:bg-white/10 transition-colors group/card">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-white truncate">{card.word}</span>
                                                        <span className="text-[10px] text-white/30 px-1.5 py-0.5 rounded bg-white/5">{card.partOfSpeech || 'word'}</span>
                                                    </div>
                                                    <p className="text-xs text-white/40 truncate max-w-[200px]">{card.meaning}</p>
                                                </div>
                                                <div className="flex flex-col items-end gap-1">
                                                    <div className="text-[10px] text-white/30">
                                                        {format(new Date(card.due!), 'MM/dd HH:mm')}
                                                    </div>

                                                    {/* Status Indicator */}
                                                    <div className="flex gap-1.5">
                                                        <div className={cn("w-1.5 h-1.5 rounded-full",
                                                            card.state === State.Learning ? "bg-blue-500" :
                                                                card.state === State.Review ? "bg-green-500" :
                                                                    card.state === State.Relearning ? "bg-orange-500" : "bg-gray-500"
                                                        )} title="State" />
                                                        {/* Difficulty/Retrievability could go here */}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                ))}

                {groupedCards.length === 0 && (
                    <div className="text-center py-20">
                        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 text-white/20">
                            <CheckCircle className="w-8 h-8" />
                        </div>
                        <p className="text-white/40">暂无复习队列</p>
                        <p className="text-white/20 text-xs mt-2">快去学习新卡片吧！</p>
                    </div>
                )}
            </div>
        </div>
    );
}
