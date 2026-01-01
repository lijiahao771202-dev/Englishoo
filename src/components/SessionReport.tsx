import React from 'react';
import { Clock, Zap, Trophy, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SessionReportProps {
    isOpen: boolean;
    type: 'learn' | 'review';
    title?: string;
    startTime: number; // timestamp
    cardsCount: number;
    totalCount?: number; // [NEW] Total cards in group/deck for overall progress
    // Optional stats for review mode
    ratings?: {
        again: number;
        hard: number;
        good: number;
        easy: number;
    };
    onClose: () => void;
    onExit?: () => void;
}

export function SessionReport({
    isOpen,
    type,
    title,
    startTime,
    cardsCount,
    totalCount,
    ratings,
    onClose,
    onExit
}: SessionReportProps) {
    // Fix pure render: Calculate end time once when component mounts/opens
    const [duration, setDuration] = React.useState(0);

    React.useEffect(() => {
        if (isOpen) {
            setDuration(Math.max(0, Date.now() - startTime));
        }
    }, [isOpen, startTime]);

    // Format duration manually for better control or use date-fns
    // Let's use a simple helper for "Xm Ys"
    const formatDuration = (ms: number) => {
        const seconds = Math.floor(ms / 1000);
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        if (m === 0) return `${s}秒`;
        return `${m}分${s}秒`;
    };

    // Calculate mastery/accuracy if ratings exist
    const accuracy = ratings
        ? Math.round(((ratings.easy + ratings.good + ratings.hard) / cardsCount) * 100)
        : 100; // Default to 100% for 'learn' mode as you must pass to finish

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        className="relative w-full max-w-md bg-black/40 border border-white/10 rounded-3xl p-8 shadow-2xl backdrop-blur-xl overflow-hidden"
                    >
                        {/* Decorative Background Elements */}
                        <div className="absolute -top-20 -right-20 w-60 h-60 bg-purple-500/20 blur-3xl rounded-full pointer-events-none" />
                        <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-blue-500/20 blur-3xl rounded-full pointer-events-none" />

                        {/* Content */}
                        <div className="relative z-10 flex flex-col items-center text-center">
                            {/* Icon Badge */}
                            <div className="mb-6 relative">
                                <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-yellow-400/20 to-orange-500/20 flex items-center justify-center border border-white/10 shadow-[0_0_15px_rgba(251,191,36,0.3)]">
                                    <Trophy className="w-10 h-10 text-yellow-400" />
                                </div>
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ delay: 0.3, type: "spring" }}
                                    className="absolute -bottom-2 -right-2 bg-green-500 text-black text-xs font-bold px-2 py-1 rounded-full border border-white/20"
                                >
                                    +EXP
                                </motion.div>
                            </div>

                            <h2 className="text-2xl font-bold text-white mb-2">
                                {title || (type === 'learn' ? '新词学习完成！' : '复习计划达成！')}
                            </h2>
                            <p className="text-white/50 text-sm mb-8">
                                {totalCount && totalCount > cardsCount
                                    ? `本组进度: ${cardsCount} / ${totalCount} 已完成`
                                    : '积跬步，至千里。保持这个节奏！'}
                            </p>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-3 gap-4 w-full mb-8">
                                <div className="bg-white/5 rounded-2xl p-3 flex flex-col items-center gap-1 border border-white/5">
                                    <Clock className="w-4 h-4 text-blue-400 mb-1" />
                                    <span className="text-lg font-bold text-white">{formatDuration(duration)}</span>
                                    <span className="text-[10px] text-white/40">总用时</span>
                                </div>
                                <div className="bg-white/5 rounded-2xl p-3 flex flex-col items-center gap-1 border border-white/5">
                                    <Target className="w-4 h-4 text-green-400 mb-1" />
                                    <span className="text-lg font-bold text-white">
                                        {totalCount ? `${cardsCount}/${totalCount}` : cardsCount}
                                    </span>
                                    <span className="text-[10px] text-white/40">
                                        {totalCount ? '完成度' : '单词数'}
                                    </span>
                                </div>
                                <div className="bg-white/5 rounded-2xl p-3 flex flex-col items-center gap-1 border border-white/5">
                                    <Zap className="w-4 h-4 text-yellow-400 mb-1" />
                                    <span className="text-lg font-bold text-white">{accuracy}%</span>
                                    <span className="text-[10px] text-white/40">掌握率</span>
                                </div>
                            </div>

                            {/* Review Breakdown (Only for Review Mode) */}
                            {type === 'review' && ratings && (
                                <div className="w-full mb-8 space-y-3">
                                    <div className="flex justify-between text-xs text-white/40 mb-1">
                                        <span>分布详情</span>
                                    </div>
                                    <div className="h-4 w-full flex rounded-full overflow-hidden bg-white/5">
                                        {ratings.again > 0 && (
                                            <div style={{ width: `${(ratings.again / cardsCount) * 100}%` }} className="bg-red-500/60 h-full" />
                                        )}
                                        {ratings.hard > 0 && (
                                            <div style={{ width: `${(ratings.hard / cardsCount) * 100}%` }} className="bg-orange-500/60 h-full" />
                                        )}
                                        {ratings.good > 0 && (
                                            <div style={{ width: `${(ratings.good / cardsCount) * 100}%` }} className="bg-blue-500/60 h-full" />
                                        )}
                                        {ratings.easy > 0 && (
                                            <div style={{ width: `${(ratings.easy / cardsCount) * 100}%` }} className="bg-green-500/60 h-full" />
                                        )}
                                    </div>
                                    <div className="flex justify-between text-[10px] text-white/40 px-1">
                                        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500/60" />重来 {ratings.again}</span>
                                        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-orange-500/60" />困难 {ratings.hard}</span>
                                        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500/60" />良好 {ratings.good}</span>
                                        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500/60" />容易 {ratings.easy}</span>
                                    </div>
                                </div>
                            )}

                            <div className="w-full flex gap-3">
                                {onExit && (
                                    <button
                                        onClick={onExit}
                                        className="flex-1 py-3.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white font-bold transition-all active:scale-95"
                                    >
                                        返回
                                    </button>
                                )}
                                <button
                                    onClick={onClose}
                                    className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-400 hover:from-blue-500 hover:to-blue-300 text-white font-bold shadow-lg shadow-blue-500/20 transition-all active:scale-95"
                                >
                                    继续前行
                                </button>
                            </div>

                            {/* Secondary Action if provided (e.g. Return to Menu) */}
                            {/* Actually, let's make it more explicit. If onExit is provided, we show two buttons. */}

                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
