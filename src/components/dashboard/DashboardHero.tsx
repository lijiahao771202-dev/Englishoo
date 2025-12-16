import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Mic, CheckCircle2, TrendingUp, Sparkles, Play } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/hooks/useUserProfile';

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
    const { user } = useAuth();
    const { profile } = useUserProfile(user?.email);
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

        // [Feature] AI Contextual Greeting (Sphere 6.0)
        // Delay slightly to ensure mascot is ready
        const timer = setTimeout(() => {
            import('@/lib/mascot-event-bus').then(({ mascotEventBus }) => {
                mascotEventBus.generateDialogue('login', {
                    streak: stats.streak,
                    timeOfDay: hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
                });
            });
        }, 1500);

        return () => clearTimeout(timer);
    }, [stats.streak]); // Only re-run if streak changes (usually only on mount)

    return (
        <div className="relative w-full mb-12">
            {/* Main Glass Container - Pink/Rose Theme */}
            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="relative rounded-[2.5rem] overflow-hidden"
            >
                {/* Pink Glass Background */}
                <div className="absolute inset-0 bg-gradient-to-br from-pink-500/10 via-rose-500/5 to-purple-500/10 backdrop-blur-2xl border border-pink-200/20 rounded-[2.5rem]" />

                {/* Subtle inner shadow for depth - Rose tint */}
                <div className="absolute inset-0 rounded-[2.5rem] shadow-[inset_0_1px_1px_rgba(255,200,200,0.2)]" />

                {/* Content */}
                <div className="relative z-10 p-8 lg:p-10">

                    {/* Top Row: Date Badge + Actions */}
                    <div className="flex justify-between items-start mb-8">
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-xs font-semibold uppercase tracking-widest text-pink-100/70"
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
                                className="group px-6 py-3 rounded-2xl bg-white/90 hover:bg-white text-rose-950 font-bold flex items-center gap-2 hover:scale-105 transition-all shadow-lg shadow-rose-900/10 backdrop-blur-sm"
                            >
                                <Play className="w-4 h-4 fill-rose-950" />
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
                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold bg-gradient-to-r from-pink-100 to-white bg-clip-text text-transparent leading-tight drop-shadow-sm">
                            {profile.nickname}
                        </h1>
                    </motion.div>

                    {/* Stats Grid - Pink Glass Tiles */}
                    <div className="grid grid-cols-3 gap-4">

                        {/* Streak */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            className="relative p-5 rounded-2xl bg-rose-500/5 border border-rose-200/10 backdrop-blur-xl group hover:bg-rose-500/10 transition-all shadow-sm"
                        >
                            <div className="text-center">
                                <div className="flex items-center justify-center gap-1.5 mb-2 text-rose-200/50 text-[10px] font-bold uppercase tracking-widest">
                                    <TrendingUp className="w-3 h-3 text-rose-400" />
                                    <span>Streak</span>
                                </div>
                                <div className="text-4xl font-black text-white tabular-nums">
                                    {stats.streak}
                                </div>
                                <div className="text-xs text-rose-200/40 font-medium mt-1">Days</div>
                            </div>
                        </motion.div>

                        {/* Due */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.25 }}
                            className="relative p-5 rounded-2xl bg-pink-500/5 border border-pink-200/10 backdrop-blur-xl group hover:bg-pink-500/10 transition-all shadow-sm"
                        >
                            <div className="text-center">
                                <div className="flex items-center justify-center gap-1.5 mb-2 text-pink-200/50 text-[10px] font-bold uppercase tracking-widest">
                                    <CheckCircle2 className="w-3 h-3 text-pink-400" />
                                    <span>To Review</span>
                                </div>
                                <div className="text-4xl font-black text-white tabular-nums">
                                    {stats.totalDue}
                                </div>
                                {/* Mini progress bar */}
                                <div className="w-full h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
                                    <div
                                        className="h-full bg-pink-400/60 rounded-full shadow-[0_0_8px_rgba(244,114,182,0.4)]"
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
                            className="relative p-5 rounded-2xl bg-purple-500/5 border border-purple-200/10 backdrop-blur-xl group hover:bg-purple-500/10 transition-all shadow-sm"
                        >
                            <div className="text-center">
                                <div className="flex items-center justify-center gap-1.5 mb-2 text-purple-200/50 text-[10px] font-bold uppercase tracking-widest">
                                    <Sparkles className="w-3 h-3 text-purple-400" />
                                    <span>New Words</span>
                                </div>
                                <div className="text-4xl font-black text-white tabular-nums">
                                    {stats.totalNew}
                                </div>
                                {/* Mini progress bar */}
                                <div className="w-full h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
                                    <div
                                        className="h-full bg-purple-400/60 rounded-full shadow-[0_0_8px_rgba(192,132,252,0.4)]"
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
