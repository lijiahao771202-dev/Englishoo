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
    children?: React.ReactNode;
}

export function DashboardHero({ stats, onStartSession, onOpenShadowing, children }: DashboardHeroProps) {
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
                initial={false}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="relative rounded-[2.5rem] overflow-hidden"
            >
                {/* Pink Glass Background */}
                <div className="absolute inset-0 bg-gradient-to-br from-pink-500/10 via-rose-500/5 to-purple-500/10 backdrop-blur-2xl border border-pink-200/20 rounded-[2.5rem]" />

                {/* Subtle inner shadow for depth - Rose tint */}
                <div className="absolute inset-0 rounded-[2.5rem] shadow-[inset_0_1px_1px_rgba(255,200,200,0.2)]" />

                {/* Content */}
                <div className="relative z-10 p-6 lg:p-8">

                    {/* Top Row: Date Badge + Actions */}
                    <div className="flex justify-between items-start mb-6">
                        <motion.div
                            initial={false}
                            animate={{ opacity: 1, x: 0 }}
                            className="px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-[10px] font-semibold uppercase tracking-widest text-pink-100/70"
                        >
                            {dateString}
                        </motion.div>

                        <motion.div
                            initial={false}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex gap-2"
                        >
                            <button
                                onClick={onStartSession}
                                className="group px-5 py-2.5 rounded-xl bg-white/90 hover:bg-white text-rose-950 font-bold flex items-center gap-2 hover:scale-105 transition-all shadow-lg shadow-rose-900/10 backdrop-blur-sm"
                            >
                                <Play className="w-3.5 h-3.5 fill-rose-950" />
                                <span className="hidden sm:inline text-sm">Start Session</span>
                            </button>
                            <button
                                onClick={onOpenShadowing}
                                className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 backdrop-blur-xl text-white hover:scale-105 transition-all"
                            >
                                <Mic className="w-4 h-4" />
                            </button>
                        </motion.div>
                    </div>

                    {/* Greeting */}
                    <motion.div
                        initial={false}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="mb-8"
                    >
                        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-thin text-white/90 leading-tight">
                            {greeting},
                        </h1>
                        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold bg-gradient-to-r from-pink-100 to-white bg-clip-text text-transparent leading-tight drop-shadow-sm">
                            {profile.nickname}
                        </h1>
                    </motion.div>

                    {/* Stats Grid - Pink Glass Tiles */}
                    <div className="grid grid-cols-3 gap-3">

                        {/* Streak */}
                        <motion.div
                            initial={false}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            className="relative p-4 rounded-xl bg-rose-500/5 border border-rose-200/10 backdrop-blur-xl group hover:bg-rose-500/10 transition-all shadow-sm"
                        >
                            <div className="text-center">
                                <div className="flex items-center justify-center gap-1.5 mb-1 text-rose-200/50 text-[10px] font-bold uppercase tracking-widest">
                                    <TrendingUp className="w-3 h-3 text-rose-400" />
                                    <span>Streak</span>
                                </div>
                                <div className="text-3xl font-black text-white tabular-nums">
                                    {stats.streak}
                                </div>
                                <div className="text-[10px] text-rose-200/40 font-medium mt-0.5">Days</div>
                            </div>
                        </motion.div>

                        {/* Due */}
                        <motion.div
                            initial={false}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.25 }}
                            className="relative p-4 rounded-xl bg-pink-500/5 border border-pink-200/10 backdrop-blur-xl group hover:bg-pink-500/10 transition-all shadow-sm"
                        >
                            <div className="text-center">
                                <div className="flex items-center justify-center gap-1.5 mb-1 text-pink-200/50 text-[10px] font-bold uppercase tracking-widest">
                                    <CheckCircle2 className="w-3 h-3 text-pink-400" />
                                    <span>Review</span>
                                </div>
                                <div className="text-3xl font-black text-white tabular-nums">
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
                            initial={false}
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

                    {/* Injected Content (Deck List) with Stagger Animation */}
                    {children && (
                        <motion.div
                            initial="hidden"
                            animate="visible"
                            variants={{
                                hidden: { opacity: 0 },
                                visible: {
                                    opacity: 1,
                                    transition: {
                                        delayChildren: 0.4, // Wait for hero stats to finish
                                        staggerChildren: 0.1
                                    }
                                }
                            }}
                            className="mt-12 pt-8 border-t border-white/5 relative"
                        >
                            {/* Decorative divider light */}
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

                            {/* Scrollable Container with Fade Mask */}
                            <div className="max-h-[60vh] overflow-y-auto pr-2 -mr-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent hover:scrollbar-thumb-white/20 transition-colors pb-4 [mask-image:linear-gradient(to_bottom,black_90%,transparent_100%)]">
                                {children}
                            </div>
                        </motion.div>
                    )}
                </div>
            </motion.div>
        </div>
    );
}
