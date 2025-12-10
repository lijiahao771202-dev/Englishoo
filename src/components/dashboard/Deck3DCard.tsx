import React, { useRef } from 'react';
import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Layers, Trash2 } from 'lucide-react';
import type { Deck } from '@/types';

interface Deck3DCardProps {
    deck: Deck & { cardCount: number };
    onClick: () => void;
    onDelete: (e: React.MouseEvent) => void;
}

export function Deck3DCard({ deck, onClick, onDelete }: Deck3DCardProps) {
    const ref = useRef<HTMLDivElement>(null);

    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const mouseX = useSpring(x, { stiffness: 500, damping: 100 });
    const mouseY = useSpring(y, { stiffness: 500, damping: 100 });

    function onMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent) {
        const { left, top, width, height } = currentTarget.getBoundingClientRect();
        x.set(clientX - left - width / 2);
        y.set(clientY - top - height / 2);
    }

    function onMouseLeave() {
        x.set(0);
        y.set(0);
    }

    const rotateX = useTransform(mouseY, [-200, 200], [6, -6]);
    const rotateY = useTransform(mouseX, [-200, 200], [-6, 6]);

    return (
        <motion.div
            ref={ref}
            style={{
                transformStyle: "preserve-3d",
                rotateX,
                rotateY,
            }}
            onMouseMove={onMouseMove}
            onMouseLeave={onMouseLeave}
            onClick={onClick}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="relative group h-48 rounded-[2rem] transition-all cursor-pointer select-none"
        >
            {/* Glass Background Layer */}
            <div className="absolute inset-0 rounded-[2rem] bg-white/10 backdrop-blur-2xl border border-white/20 shadow-xl overflow-hidden group-hover:bg-white/15 transition-colors">
                {/* Inner highlight for depth */}
                <div className="absolute inset-0 rounded-[2rem] shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]" />
            </div>

            {/* Content Layer */}
            <div
                style={{ transform: "translateZ(30px)" }}
                className="absolute inset-0 p-6 flex flex-col justify-between z-20"
            >
                {/* Top Row: Icon & Delete */}
                <div className="flex justify-between items-start">
                    <div className="p-3 rounded-xl bg-white/10 border border-white/10 backdrop-blur-md">
                        <Layers className="w-5 h-5 text-white/80" />
                    </div>

                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(e); }}
                        className="opacity-0 group-hover:opacity-100 p-2 rounded-full hover:bg-white/10 text-white/30 hover:text-red-400 transition-all"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>

                {/* Bottom: Title & Count */}
                <div className="mt-auto">
                    <h3 className="text-3xl font-bold text-white/90 tracking-tight leading-tight mb-2">
                        {deck.name}
                    </h3>
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-xl font-bold text-white/80 tabular-nums">{deck.cardCount}</span>
                        <span className="text-sm font-medium text-white/40">cards</span>
                    </div>
                </div>
            </div>

            {/* Glare Effect */}
            <motion.div
                style={{
                    background: useMotionTemplate`
                        radial-gradient(
                            350px circle at ${mouseX}px ${mouseY}px,
                            rgba(255,255,255,0.1),
                            transparent 40%
                        )
                    `,
                }}
                className="absolute inset-0 rounded-[2rem] pointer-events-none z-30 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            />
        </motion.div>
    );
}
