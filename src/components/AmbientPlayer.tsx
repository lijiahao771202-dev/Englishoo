import { useState, useEffect } from 'react';
import { Headphones, CloudRain, TreePine, Flame, Pause, Play, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import AmbientEngine, { type AmbientMode } from '@/lib/ambient-engine';
import { cn } from '@/lib/utils';

export function AmbientPlayer() {
    const [isPlaying, setIsPlaying] = useState(false);
    const [mode, setMode] = useState<AmbientMode>('rain');
    const [volume, setVolume] = useState(0.5);
    const [isOpen, setIsOpen] = useState(false);

    // Sync with engine
    useEffect(() => {
        const engine = AmbientEngine.getInstance();
        engine.setVolume(volume);
    }, [volume]);

    useEffect(() => {
        if (!isPlaying) return;
        const engine = AmbientEngine.getInstance();
        engine.setMode(mode);
    }, [mode, isPlaying]);

    const togglePlay = () => {
        const engine = AmbientEngine.getInstance();
        if (isPlaying) {
            engine.setMode('off');
            setIsPlaying(false);
        } else {
            engine.setMode(mode);
            setIsPlaying(true);
        }
    };

    // 3 种环境音模式 (本地音频文件)
    const modes = [
        { id: 'rain', icon: CloudRain, label: '雨声' },
        { id: 'forest', icon: TreePine, label: '森林' },
        { id: 'fire', icon: Flame, label: '壁炉' }
    ] as const;

    return (
        <div className="relative">
            {/* Trigger Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "p-2.5 rounded-full backdrop-blur-md transition-all duration-300 relative group",
                    isPlaying
                        ? "bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.5)] animate-pulse-slow"
                        : "bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
                )}
            >
                <Headphones className="w-5 h-5" />
                {isPlaying && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                    </span>
                )}
            </button>

            {/* Glass Panel Popover */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 top-full mt-4 w-72 bg-slate-900/90 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden z-50 p-5"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-sm font-bold text-white/60 uppercase tracking-widest">专注音景</span>
                            <div className={cn(
                                "h-2 w-2 rounded-full transition-colors",
                                isPlaying ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-white/20"
                            )} />
                        </div>

                        {/* Main Play Toggle */}
                        <div className="flex justify-center mb-5">
                            <button
                                onClick={togglePlay}
                                className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-xl hover:scale-105 active:scale-95 transition-all"
                            >
                                {isPlaying ? (
                                    <Pause className="w-6 h-6 fill-current" />
                                ) : (
                                    <Play className="w-6 h-6 fill-current ml-0.5" />
                                )}
                            </button>
                        </div>

                        {/* Sound Selection - 3 Modes */}
                        <div className="grid grid-cols-3 gap-2 mb-4">
                            {modes.map((m) => (
                                <button
                                    key={m.id}
                                    onClick={() => {
                                        setMode(m.id as AmbientMode);
                                        if (!isPlaying) togglePlay();
                                    }}
                                    className={cn(
                                        "flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all border",
                                        mode === m.id
                                            ? "bg-white/10 border-white/20 text-white"
                                            : "bg-transparent border-transparent text-white/30 hover:bg-white/5 hover:text-white/60"
                                    )}
                                >
                                    <m.icon className={cn(
                                        "w-5 h-5",
                                        mode === m.id && isPlaying && "animate-bounce-subtle"
                                    )} />
                                    <span className="text-[10px] font-medium">{m.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* Volume Slider */}
                        <div className="flex items-center gap-3 px-1">
                            <Volume2 className="w-4 h-4 text-white/40" />
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={volume}
                                onChange={(e) => setVolume(parseFloat(e.target.value))}
                                className="flex-1 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white hover:[&::-webkit-slider-thumb]:scale-125 hover:[&::-webkit-slider-thumb]:shadow-lg transition-all"
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Click outside closer */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-40 bg-transparent"
                    onClick={() => setIsOpen(false)}
                />
            )}
        </div>
    );
}
