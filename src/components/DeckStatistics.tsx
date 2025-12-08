import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    format, addDays, isSameDay, startOfWeek, endOfWeek,
    eachDayOfInterval, startOfMonth, endOfMonth,
    addMonths, subMonths, isSameMonth, isToday
} from 'date-fns';
import { zhCN } from 'date-fns/locale';
import {
    TrendingUp, CheckCircle2, BrainCircuit, Calendar as CalendarIcon,
    ChevronLeft, ChevronRight, BarChart3, Activity, BookOpen
} from 'lucide-react';
import type { WordCard } from '@/types';
import type { ReviewLog } from 'ts-fsrs';
import { State, Rating } from 'ts-fsrs';
import { cn } from '@/lib/utils';

/**
 * @description 卡组统计组件
 * 包含：
 * 1. 学习进度概览
 * 2. 复习预测图表 (支持 周/月/季/年 视图切换)
 * 3. 学习日历 (热力图风格，支持点击查看每日详情)
 */

interface DeckStatisticsProps {
    cards: WordCard[];
    logs: (ReviewLog & { cardId: string })[];
    className?: string;
}

type ViewMode = 'week' | 'month' | 'quarter' | 'year';

export function DeckStatistics({ cards, logs, className }: DeckStatisticsProps) {
    const [viewMode, setViewMode] = useState<ViewMode>('week');
    const [calendarDate, setCalendarDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());

    // --- 1. Calculate Global Stats ---
    const globalStats = useMemo(() => {
        const now = new Date();

        // Filter logs for current deck
        const deckCardIds = new Set(cards.map(c => c.id));
        const deckLogs = logs.filter(l => deckCardIds.has(l.cardId));

        // A. Today's Learning
        const todayLogs = deckLogs.filter(l => isSameDay(new Date(l.review), now));
        const todayReviewCount = todayLogs.length;

        // B. Retention Rate (Last 7 Days)
        const recentLogs = deckLogs;
        const passedCount = recentLogs.filter(l => l.rating !== Rating.Again).length;
        const retentionRate = recentLogs.length > 0
            ? Math.round((passedCount / recentLogs.length) * 100)
            : 0;

        // C. Progress
        const totalCards = cards.length;
        const learnedCards = cards.filter(c => c.state !== State.New).length;
        const progressPercentage = totalCards > 0 ? Math.round((learnedCards / totalCards) * 100) : 0;

        return {
            todayReviewCount,
            retentionRate,
            learnedCards,
            totalCards,
            progressPercentage,
            deckLogs
        };
    }, [cards, logs]);

    // --- 2. Calculate Forecast Stats based on ViewMode ---
    const forecastStats = useMemo(() => {
        const now = new Date();
        let data: { label: string; count: number; date: Date }[] = [];

        // Filter non-new cards
        const activeCards = cards.filter(c => c.state !== State.New);

        if (viewMode === 'week') {
            // Next 7 Days (Daily)
            const next7Days = Array.from({ length: 7 }, (_, i) => addDays(now, i + 1));
            data = next7Days.map(date => ({
                date,
                count: activeCards.filter(c => isSameDay(new Date(c.due), date)).length,
                label: format(date, 'EEE', { locale: zhCN })
            }));
        } else if (viewMode === 'month') {
            // Next 30 Days (Daily)
            const next30Days = Array.from({ length: 30 }, (_, i) => addDays(now, i + 1));
            data = next30Days.map(date => ({
                date,
                count: activeCards.filter(c => isSameDay(new Date(c.due), date)).length,
                label: format(date, 'd')
            }));
        } else if (viewMode === 'quarter') {
            // Next 12 Weeks (Weekly)
            const weeks = Array.from({ length: 12 }, (_, i) => i);
            data = weeks.map(i => {
                const startDate = addDays(now, i * 7);
                const endDate = addDays(startDate, 6);
                const count = activeCards.filter(c => {
                    const due = new Date(c.due);
                    return due >= startDate && due <= endDate;
                }).length;
                return {
                    date: startDate,
                    count,
                    label: `W${i + 1}`
                };
            });
        } else if (viewMode === 'year') {
            // Next 12 Months (Monthly)
            const months = Array.from({ length: 12 }, (_, i) => addMonths(now, i));
            data = months.map(date => {
                const count = activeCards.filter(c => {
                    const due = new Date(c.due);
                    return isSameMonth(due, date);
                }).length;
                return {
                    date,
                    count,
                    label: format(date, 'M月', { locale: zhCN })
                };
            });
        }

        const maxPrediction = Math.max(...data.map(p => p.count), 5);
        const maxLog = Math.log2(maxPrediction + 1);

        return { data, maxLog };
    }, [cards, viewMode]);

    // --- 3. Calendar Data ---
    const calendarData = useMemo(() => {
        const start = startOfMonth(calendarDate);
        const end = endOfMonth(calendarDate);

        // Calculate streaks

        // Add padding for start of week
        const startWeek = startOfWeek(start, { locale: zhCN });
        const endWeek = endOfWeek(end, { locale: zhCN });
        const calendarDays = eachDayOfInterval({ start: startWeek, end: endWeek });

        // Map logs to days
        const dailyStats = new Map<string, { learned: number; reviewed: number; due: number }>();

        // 1. Process Logs (History)
        globalStats.deckLogs.forEach(log => {
            const date = new Date(log.review);
            if (isNaN(date.getTime())) return;

            const dayKey = format(date, 'yyyy-MM-dd');
            const current = dailyStats.get(dayKey) || { learned: 0, reviewed: 0, due: 0 };

            if (log.state === State.New) {
                current.learned += 1;
            }
            current.reviewed += 1;

            dailyStats.set(dayKey, current);
        });

        // 2. Process Future Dues (Forecast)
        cards.forEach(card => {
            if (card.state !== State.New && card.due) {
                const dueDate = new Date(card.due);
                if (!isNaN(dueDate.getTime())) {
                    const dayKey = format(dueDate, 'yyyy-MM-dd');
                    const current = dailyStats.get(dayKey) || { learned: 0, reviewed: 0, due: 0 };
                    current.due += 1;
                    dailyStats.set(dayKey, current);
                }
            }
        });

        return { calendarDays, dailyStats };
    }, [calendarDate, globalStats.deckLogs, cards]);

    // --- 4. Selected Date Stats ---
    const selectedDateStats = useMemo(() => {
        if (!selectedDate) return null;
        const key = format(selectedDate, 'yyyy-MM-dd');
        return calendarData.dailyStats.get(key) || { learned: 0, reviewed: 0, due: 0 };
    }, [selectedDate, calendarData.dailyStats]);

    if (globalStats.totalCards === 0) return null;

    return (
        <div className={cn("space-y-6", className)}>
            {/* 1. Progress Bar */}
            <div className="glass-panel p-6 relative overflow-hidden">
                <div className="flex justify-between items-end mb-2">
                    <div>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <BrainCircuit className="w-5 h-5 text-blue-400" />
                            学习进度
                        </h3>
                        <p className="text-xs text-white/50 mt-1">
                            已掌握 {globalStats.learnedCards} / {globalStats.totalCards} 个单词
                        </p>
                    </div>
                    <div className="text-3xl font-bold text-blue-400">
                        {globalStats.progressPercentage}%
                    </div>
                </div>

                <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${globalStats.progressPercentage}%` }}
                        transition={{ duration: 1, ease: "easeOut" }}
                        className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                    />
                </div>
            </div>

            {/* 2. Key Metrics Grid */}
            <div className="grid grid-cols-2 gap-4">
                <div className="glass-panel p-4 flex flex-col items-center justify-center text-center gap-1">
                    <div className="p-2 rounded-full bg-green-500/20 text-green-300 mb-1">
                        <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <span className="text-2xl font-bold text-white">{globalStats.todayReviewCount}</span>
                    <span className="text-xs text-white/50">今日复习</span>
                </div>

                <div className="glass-panel p-4 flex flex-col items-center justify-center text-center gap-1">
                    <div className="p-2 rounded-full bg-orange-500/20 text-orange-300 mb-1">
                        <TrendingUp className="w-5 h-5" />
                    </div>
                    <span className="text-2xl font-bold text-white">{globalStats.retentionRate}%</span>
                    <span className="text-xs text-white/50">记忆留存率</span>
                </div>
            </div>

            {/* 3. Future Forecast Chart */}
            <div className="glass-panel p-6">
                <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-purple-400" />
                        复习预测
                    </h3>

                    {/* View Switcher */}
                    <div className="flex bg-black/20 p-1 rounded-lg overflow-hidden">
                        {(['week', 'month', 'quarter', 'year'] as const).map((mode) => (
                            <button
                                key={mode}
                                onClick={() => setViewMode(mode)}
                                className={cn(
                                    "px-3 py-1 text-xs rounded-md transition-all duration-200",
                                    viewMode === mode
                                        ? "bg-white/10 text-white shadow-sm"
                                        : "text-white/40 hover:text-white/70"
                                )}
                            >
                                {mode === 'week' && '周'}
                                {mode === 'month' && '月'}
                                {mode === 'quarter' && '季'}
                                {mode === 'year' && '年'}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-end justify-between h-40 gap-1">
                    {forecastStats.data.map((item, index) => {
                        const valLog = Math.log2(item.count + 1);
                        const heightPercent = (valLog / forecastStats.maxLog) * 100;
                        const visualHeightPercent = item.count > 0 ? Math.max(heightPercent, 10) : 0;

                        return (
                            <div key={index} className="flex-1 flex flex-col items-center gap-2 group relative h-full justify-end">
                                {/* Tooltip */}
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-10 bg-black/90 border border-white/10 text-white text-xs px-2 py-1 rounded pointer-events-none whitespace-nowrap z-10 shadow-xl">
                                    <div className="font-bold">{format(item.date, 'yyyy-MM-dd')}</div>
                                    <div>{item.count} 个单词</div>
                                </div>

                                {/* Bar */}
                                <div className="w-full flex items-end h-full relative px-[1px]">
                                    <motion.div
                                        initial={{ height: 0 }}
                                        animate={{ height: `${visualHeightPercent}%` }}
                                        transition={{ duration: 0.5, delay: index * 0.02 }}
                                        className={cn(
                                            "w-full rounded-t-sm relative overflow-hidden transition-all duration-300 hover:brightness-125",
                                            item.count > 0
                                                ? "bg-gradient-to-t from-purple-500/20 to-purple-400/60 border-t border-x border-purple-400/30"
                                                : "bg-white/5 h-[1px]"
                                        )}
                                    >
                                        {item.count > 0 && (
                                            <div className="absolute inset-0 bg-purple-400/20 blur-sm" />
                                        )}
                                    </motion.div>
                                </div>

                                {/* Label - Show sparingly if too many items */}
                                <span className={cn(
                                    "text-[10px] text-white/40 font-medium mt-1 truncate w-full text-center",
                                    viewMode === 'month' && index % 5 !== 0 && "hidden", // Hide some labels in month view
                                    viewMode === 'year' && "text-[9px]"
                                )}>
                                    {item.label}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 4. Learning Calendar */}
            <div className="glass-panel p-6">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <CalendarIcon className="w-5 h-5 text-pink-400" />
                        学习日历
                    </h3>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setCalendarDate(subMonths(calendarDate, 1))}
                            className="p-1 hover:bg-white/10 rounded-full text-white/60 transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-sm font-medium text-white">
                            {format(calendarDate, 'yyyy年 M月')}
                        </span>
                        <button
                            onClick={() => setCalendarDate(addMonths(calendarDate, 1))}
                            className="p-1 hover:bg-white/10 rounded-full text-white/60 transition-colors"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Calendar Grid */}
                <div className="grid grid-cols-7 gap-2 mb-4">
                    {['日', '一', '二', '三', '四', '五', '六'].map(day => (
                        <div key={day} className="text-center text-xs text-white/30 font-medium py-2">
                            {day}
                        </div>
                    ))}

                    {calendarData.calendarDays.map((day) => {
                        const dateKey = format(day, 'yyyy-MM-dd');
                        const stats = calendarData.dailyStats.get(dateKey);
                        const isCurrentMonth = isSameMonth(day, calendarDate);
                        const isSelected = selectedDate && isSameDay(day, selectedDate);
                        const isTodayDate = isToday(day);

                        // Heatmap intensity
                        const totalActivity = (stats?.learned || 0) + (stats?.reviewed || 0);
                        let bgClass = "bg-white/5";
                        if (totalActivity > 0) {
                            if (totalActivity < 5) bgClass = "bg-pink-500/20 border-pink-500/30";
                            else if (totalActivity < 15) bgClass = "bg-pink-500/40 border-pink-500/50";
                            else bgClass = "bg-pink-500/60 border-pink-500/70";
                        }

                        return (
                            <button
                                key={day.toISOString()}
                                onClick={() => setSelectedDate(day)}
                                className={cn(
                                    "aspect-square rounded-lg flex flex-col items-center justify-center relative transition-all duration-200 group",
                                    !isCurrentMonth && "opacity-20",
                                    isSelected ? "ring-2 ring-pink-400 scale-110 z-10 bg-black/40" : "hover:bg-white/10",
                                    bgClass,
                                    isTodayDate && !isSelected && "ring-1 ring-white/50"
                                )}
                            >
                                <span className={cn(
                                    "text-xs font-medium",
                                    isSelected ? "text-white" : "text-white/60"
                                )}>
                                    {format(day, 'd')}
                                </span>

                                {/* Activity Dot */}
                                {totalActivity > 0 && (
                                    <div className="w-1 h-1 rounded-full bg-pink-400 mt-1 shadow-[0_0_4px_rgba(244,114,182,0.8)]" />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Selected Date Details */}
                <AnimatePresence mode="wait">
                    {selectedDate && (
                        <motion.div
                            key={selectedDate.toISOString()}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="bg-white/5 rounded-lg p-4 border border-white/10"
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-white">
                                    {format(selectedDate, 'M月d日')} 数据
                                </span>
                                {isToday(selectedDate) && (
                                    <span className="text-[10px] bg-pink-500/20 text-pink-300 px-2 py-0.5 rounded-full border border-pink-500/20">
                                        今天
                                    </span>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4 mt-3">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-full bg-blue-500/20 text-blue-300">
                                        <BookOpen className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <div className="text-xl font-bold text-white">
                                            {selectedDateStats?.learned || 0}
                                        </div>
                                        <div className="text-xs text-white/50">新学单词</div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-full bg-green-500/20 text-green-300">
                                        <Activity className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <div className="text-xl font-bold text-white">
                                            {selectedDateStats?.reviewed || 0}
                                        </div>
                                        <div className="text-xs text-white/50">复习次数</div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 col-span-2 bg-white/5 p-2 rounded-lg">
                                    <div className="p-2 rounded-full bg-orange-500/20 text-orange-300">
                                        <CalendarIcon className="w-4 h-4" />
                                    </div>
                                    <div className="flex flex-1 items-center justify-between pr-2">
                                        <div>
                                            <div className="text-xl font-bold text-white">
                                                {selectedDateStats?.due || 0}
                                            </div>
                                            <div className="text-xs text-white/50">预计复习</div>
                                        </div>
                                        {(selectedDateStats?.due ?? 0) > 0 && (
                                            <span className="text-xs text-orange-300 font-medium px-2 py-1 bg-orange-500/10 rounded">
                                                {isToday(selectedDate) ? "今日任务" : "未来任务"}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
