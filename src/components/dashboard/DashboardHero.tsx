import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Mic, CheckCircle2, TrendingUp, Sparkles, Play } from 'lucide-react';

interface DashboardHeroProps {
    stats: {
        totalDue: number;
        totalNew: number;
        streak: number;
    };
    onStartSession: () => void;
    onOpenShadowing: () => void;
}

export function DashboardHero({ stats, onStartSession, onOpenShadowing }: DashboardHeroProps) {
    const [greeting, setGreeting] = useState('');
    const [dateString, setDateString] = useState('');

    useEffect(() => {
        const hour = new Date().getHours();
        if (hour < 5) setGreeting('Good Night');
        else if (hour < 12) setGreeting('Good Morning');
        else if (hour < 18) setGreeting('Good Afternoon');
        else setGreeting('Good Evening');

        const now = new Date();
        setDateString(now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }));
    }, []);

    return (
        <div className="relative w-full mb-12">
            {/* Main Glass Container */}
            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="relative rounded-[2.5rem] overflow-hidden"
            >
                {/* Glass Background */}
                <div className="absolute inset-0 bg-white/10 backdrop-blur-2xl border border-white/20 rounded-[2.5rem]" />

                {/* Subtle inner shadow for depth */}
                <div className="absolute inset-0 rounded-[2.5rem] shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]" />

                {/* Content */}
                <div className="relative z-10 p-8 lg:p-10">

                    {/* Top Row: Date Badge + Actions */}
                    <div className="flex justify-between items-start mb-8">
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-xs font-semibold uppercase tracking-widest text-white/70"
                        >
                            {dateString}
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex gap-3"
                        >
                            <button
                                onClick={onStartSession}
                                className="group px-6 py-3 rounded-2xl bg-white/90 hover:bg-white text-black font-bold flex items-center gap-2 hover:scale-105 transition-all shadow-lg backdrop-blur-sm"
                            >
                                <Play className="w-4 h-4 fill-black" />
                                <span className="hidden sm:inline">Start Session</span>
                            </button>
                            <button
                                onClick={onOpenShadowing}
                                className="p-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 backdrop-blur-xl text-white hover:scale-105 transition-all"
                            >
                                <Mic className="w-5 h-5" />
                            </button>
                        </motion.div>
                    </div>

                    {/* Greeting */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="mb-10"
                    >
                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-thin text-white/90 leading-tight">
                            {greeting},
                        </h1>
                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight">
                            Jiahao
                        </h1>
                    </motion.div>

                    {/* Stats Grid - Glass Tiles */}
                    <div className="grid grid-cols-3 gap-4">

                        {/* Streak */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            className="relative p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl group hover:bg-white/10 transition-all"
                        >
                            <div className="text-center">
                                <div className="flex items-center justify-center gap-1.5 mb-2 text-white/50 text-[10px] font-bold uppercase tracking-widest">
                                    <TrendingUp className="w-3 h-3 text-orange-400" />
                                    <span>Streak</span>
                                </div>
                                <div className="text-4xl font-black text-white tabular-nums">
                                    {stats.streak}
                                </div>
                                <div className="text-xs text-white/40 font-medium mt-1">Days</div>
                            </div>
                        </motion.div>

                        {/* Due */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.25 }}
                            className="relative p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl group hover:bg-white/10 transition-all"
                        >
                            <div className="text-center">
                                <div className="flex items-center justify-center gap-1.5 mb-2 text-white/50 text-[10px] font-bold uppercase tracking-widest">
                                    <CheckCircle2 className="w-3 h-3 text-blue-400" />
                                    <span>To Review</span>
                                </div>
                                <div className="text-4xl font-black text-white tabular-nums">
                                    {stats.totalDue}
                                </div>
                                {/* Mini progress bar */}
                                <div className="w-full h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
                                    <div
                                        className="h-full bg-blue-400/60 rounded-full"
                                        style={{ width: `${Math.min((stats.totalDue / 50) * 100, 100)}%` }}
                                    />
                                </div>
                            </div>
                        </motion.div>

                        {/* New */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                            className="relative p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl group hover:bg-white/10 transition-all"
                        >
                            <div className="text-center">
                                <div className="flex items-center justify-center gap-1.5 mb-2 text-white/50 text-[10px] font-bold uppercase tracking-widest">
                                    <Sparkles className="w-3 h-3 text-purple-400" />
                                    <span>New Words</span>
                                </div>
                                <div className="text-4xl font-black text-white tabular-nums">
                                    {stats.totalNew}
                                </div>
                                {/* Mini progress bar */}
                                <div className="w-full h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
                                    <div
                                        className="h-full bg-purple-400/60 rounded-full"
                                        style={{ width: `${Math.min((stats.totalNew / 100) * 100, 100)}%` }}
                                    />
                                </div>
                            </div>
                        </motion.div>

                    </div>
                </div>
            </motion.div>
        </div>
    );
}
