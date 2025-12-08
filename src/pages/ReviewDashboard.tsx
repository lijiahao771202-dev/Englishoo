import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, CheckCircle2, ChevronRight, AlertCircle, TrendingUp, Sun, Moon, ChevronDown } from 'lucide-react';
import type { WordCard } from '@/types';
import { cn } from '@/lib/utils';
import { isPast, isToday, isTomorrow, format } from 'date-fns';

interface ReviewDashboardProps {
    onBack: () => void;
    cards: WordCard[];
    onStartReview: (cards: WordCard[]) => void;
}

type BucketType = 'overdue' | 'today' | 'tomorrow' | 'future';

export function ReviewDashboard({ onBack, cards, onStartReview }: ReviewDashboardProps) {
    const [now, setNow] = useState(new Date());

    const [expandedBuckets, setExpandedBuckets] = useState<Set<BucketType>>(new Set());

    const toggleBucket = (type: BucketType) => {
        const newSet = new Set(expandedBuckets);
        if (newSet.has(type)) {
            newSet.delete(type);
        } else {
            newSet.add(type);
        }
        setExpandedBuckets(newSet);
    };

    // Update "now" every minute to keep buckets fresh
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    const buckets = useMemo(() => {
        const overdue: WordCard[] = [];
        const today: WordCard[] = [];
        const tomorrow: WordCard[] = [];
        const future: WordCard[] = [];

        cards.forEach(card => {
            // Only include cards that are NOT new (state != 0) and have a due date
            // Also exclude familiar cards if we want to be strict, but usually review queue handles that.
            // Let's assume passed 'cards' are all valid review candidates or we filter here.
            // Usually the App passes 'dueCards', but for dashboard we might want ALL non-new cards to show future?
            // If 'cards' contains everything, we need to filter.

            // Let's assume 'cards' passed in might be ALL cards or ALL Due cards?
            // The prompt said "Fetch all due cards". But for "Future" bucket we need non-due cards too.
            // Let's filter safely.
            if (!card.due) return;
            if (card.state === 0) return; // New cards don't belong here
            if (card.isFamiliar) return;

            const dueDate = new Date(card.due);

            if (isPast(dueDate) && !isToday(dueDate)) {
                // Strictly past (yesterday or older), or just past 'now'?
                // "Overdue" usually means before NOW.
                // But design said: Overdue (< now), Today (now - EOD)
                if (dueDate < now) {
                    // Wait, if it's today but 10am and now is 11am, it's overdue.
                    // If it's Yesterday, it's overdue.
                    overdue.push(card);
                } else if (isToday(dueDate)) {
                    // Future Today
                    today.push(card);
                } else if (isTomorrow(dueDate)) {
                    tomorrow.push(card);
                } else {
                    future.push(card);
                }
            } else if (isToday(dueDate)) {
                if (dueDate < now) {
                    overdue.push(card);
                } else {
                    today.push(card);
                }
            } else if (isTomorrow(dueDate)) {
                tomorrow.push(card);
            } else {
                future.push(card);
            }
        });

        return { overdue, today, tomorrow, future };
    }, [cards, now]);

    const totalDue = buckets.overdue.length;

    return (
        <div className="min-h-screen bg-transparent space-y-8 pb-20 p-4 md:p-8 animate-in fade-in duration-500">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-4"
            >
                <button
                    onClick={onBack}
                    className="p-3 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all backdrop-blur-md border border-white/5"
                >
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <div>
                    <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-200 via-white to-purple-200">
                        复习仪表盘
                    </h1>
                    <p className="text-white/40 text-sm">Review Dashboard</p>
                </div>
            </motion.div>

            {/* Hero Section */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 }}
                className="glass-panel p-8 relative overflow-hidden flex flex-col items-center justify-center text-center py-16"
            >
                <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/20 rounded-full blur-[120px] pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/20 rounded-full blur-[100px] pointer-events-none" />

                <h2 className="text-white/50 font-medium tracking-widest uppercase mb-4">当前待办</h2>
                <div className={cn("text-8xl md:text-9xl font-black tracking-tighter mb-4 drop-shadow-2xl",
                    totalDue > 0 ? "text-white" : "text-white/20"
                )}>
                    {totalDue}
                </div>

                <p className="text-xl text-white/60 max-w-md mx-auto leading-relaxed">
                    {totalDue === 0 ? (
                        <span className="flex items-center justify-center gap-2 text-green-300">
                            <CheckCircle2 className="w-6 h-6" /> 所有复习已完成，太棒了！
                        </span>
                    ) : totalDue < 20 ? (
                        "今天的任务很轻松，一鼓作气解决掉吧！"
                    ) : (
                        "积压了一些内容，建议分批次完成，保持节奏。"
                    )}
                </p>
            </motion.div>

            {/* Timeline Buckets */}
            <div className="space-y-4 max-w-3xl mx-auto">
                <BucketRow
                    type="overdue"
                    cards={buckets.overdue}
                    icon={<AlertCircle className="w-5 h-5 text-red-400" />}
                    label="已逾期"
                    subLabel="现在立刻复习"
                    color="bg-red-500/10 border-red-500/20 hover:bg-red-500/20"
                    onAction={() => onStartReview(buckets.overdue)}
                    isExpanded={expandedBuckets.has('overdue')}
                    onToggle={() => toggleBucket('overdue')}
                />

                <BucketRow
                    type="today"
                    cards={buckets.today}
                    icon={<Sun className="w-5 h-5 text-orange-400" />}
                    label="今日稍后"
                    subLabel="24:00 前到期"
                    color="bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/20"
                    onAction={() => onStartReview(buckets.today)}
                    disabled={buckets.today.length === 0}
                    isExpanded={expandedBuckets.has('today')}
                    onToggle={() => toggleBucket('today')}
                />

                <BucketRow
                    type="tomorrow"
                    cards={buckets.tomorrow}
                    icon={<Moon className="w-5 h-5 text-blue-400" />}
                    label="明天"
                    subLabel="预览明日任务"
                    color="bg-blue-500/5 border-blue-500/10 hover:bg-blue-500/10"
                    isFuture
                    isExpanded={expandedBuckets.has('tomorrow')}
                    onToggle={() => toggleBucket('tomorrow')}
                />

                <BucketRow
                    type="future"
                    cards={buckets.future}
                    icon={<TrendingUp className="w-5 h-5 text-purple-400" />}
                    label="未来7天"
                    subLabel="本周预测"
                    color="bg-purple-500/5 border-purple-500/10 hover:bg-purple-500/10"
                    isFuture
                    isExpanded={expandedBuckets.has('future')}
                    onToggle={() => toggleBucket('future')}
                />
            </div>
        </div>
    );
}

function BucketRow({ type, cards, icon, label, subLabel, color, onAction, isFuture, disabled, isExpanded, onToggle }: any) {
    const count = cards.length;
    if (count === 0 && type !== 'overdue') return null; // Hide empty future buckets, but maybe show 'overdue' even if 0 as 'Good job'?

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className={cn(
                "relative overflow-hidden rounded-2xl border backdrop-blur-xl transition-all duration-300",
                color,
                count === 0 && "opacity-50 grayscale"
            )}
        >
            <div className="flex items-center justify-between p-5 cursor-pointer" onClick={onToggle}>
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-black/20 text-white shadow-inner">
                        {icon}
                    </div>
                    <div>
                        <h3 className="font-bold text-lg text-white flex items-center gap-2">
                            {label}
                            {count > 0 && <span className="px-2 py-0.5 rounded-full bg-white/10 text-xs font-mono">{count}</span>}
                        </h3>
                        <p className="text-sm text-white/50">{subLabel}</p>
                    </div>
                </div>

                {/* Right Action */}
                <div className="flex items-center gap-4">
                    {/* Preview Words - Show first 3 */}
                    <div className="hidden md:flex flex-col items-end gap-1">
                        <div className="flex -space-x-2">
                            {cards.slice(0, 3).map((c: any) => (
                                <div key={c.id} className="w-8 h-8 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center text-[10px] text-white/70 overflow-hidden" title={c.word}>
                                    {c.word[0].toUpperCase()}
                                </div>
                            ))}
                            {count > 3 && (
                                <div className="w-8 h-8 rounded-full bg-slate-800/50 border border-slate-600/50 flex items-center justify-center text-[10px] text-white/50">
                                    +{count - 3}
                                </div>
                            )}
                        </div>
                    </div>

                    {!isFuture && count > 0 && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onAction();
                            }}
                            disabled={disabled}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-black font-bold hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)] disabled:opacity-50 disabled:cursor-not-allowed z-10"
                        >
                            开始 <ChevronRight className="w-4 h-4" />
                        </button>
                    )}

                    {isFuture && (
                        <div className="px-5 py-2.5 text-white/30 text-xs font-medium uppercase tracking-wider">
                            Locked
                        </div>
                    )}

                    <div className={cn("text-white/30 transition-transform duration-300", isExpanded ? "rotate-180" : "")}>
                        <ChevronDown className="w-5 h-5" />
                    </div>
                </div>
            </div>

            {/* Expanded List */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-white/5 bg-black/10"
                    >
                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                            {cards.map((card: WordCard) => (
                                <div key={card.id} className="p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors flex flex-col gap-1">
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-white text-sm truncate">{card.word}</span>
                                        <span className="text-[10px] text-white/40 bg-white/5 px-1.5 py-0.5 rounded">
                                            {card.due ? format(new Date(card.due), 'MM/dd HH:mm') : '-'}
                                        </span>
                                    </div>
                                    <div className="text-xs text-white/50 truncate">
                                        {card.meaning}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
