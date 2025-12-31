/**
 * @component 交互式3D吉祥物 (InteractiveMascot)
 * @description 具备鼠标跟随眼动效果、丰富情绪反馈动画和换装系统的悬浮助手图标
 * @author Trae-Architect
 */
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { getMascotSkin, loadMascotConfig, type MascotSkin } from '@/lib/mascot-config';
import { mascotEventBus } from '@/lib/mascot-event-bus';
import { SphereVisuals } from '@/components/SphereVisuals';

// 扩展情绪类型
export type MascotReaction = 'idle' | 'happy' | 'thinking' | 'sleepy' | 'sad' | 'combo' | 'shy' | 'poked' | 'confused' | 'listening' | 'dizzy' | 'surprised' | 'love' | 'focused' | 'determined';

interface InteractiveMascotProps {
    reaction?: MascotReaction;
    size?: number;
    className?: string;
    variant?: 'classic' | 'sphere'; // [NEW] Mascot Variant
    onPoke?: () => void; // 戳一戳回调
    isHovered?: boolean; // 悬停状态
    skinId?: string; // 皮肤ID
    customBubbleText?: string; // 自定义气泡文字 (Feature G)
    isTeacher?: boolean; // [Feature I] 老师模式
    explanation?: string; // [Feature I] 老师讲解内容
    isDragging?: boolean; // [Performance] 是否正在拖拽 (用于降级渲染)
    currentWord?: string; // [Feature I] 当前讲解的单词
}

// 气泡文字映射（用于普通情绪小气泡）
const bubbleTextMap: Record<string, string[]> = {
    idle: [],
    happy: ['😊', '✨', '👍', '💖', '🌟', '😆', '🎉', '😸'],
    sad: ['😢', '💔', '😔', '🥺', '🌧️', '😿'],
    combo: ['🔥', '⚡', '🎯', '⭐', '🚀', '💯', '🏆'],
    sleepy: [], // [REMOVED] No sleepy bubbles
    shy: ['😳', '☺️', '🙈', '🌸', '⸝⸝>  <⸝⸝'],
    poked: ['😮', '👋', '😲', '💢', '❓'],
    thinking: ['🤔', '💭', '🧐', '🧠', '🔍'],
    confused: ['❓', '🤨', '😵', '🌀', '🦄'],
    listening: ['🎵', '🎶', '🎧', '👂', '🎤'],
    dizzy: ['😵', '💫', '🌀', '🤕'],
    surprised: ['😲', '‼️', '🤯', '😱', '🙀'],
    love: ['❤️', '💕', '😍', '🥰', '😘', '💌'],
    focused: ['👀', '🎯', '⚡', '👓', '📝'],
    determined: ['💪', '🔥', '⚔️', '😤', '🏔️']
};

// 动画变体 - 完整情绪系统
const bodyVariants: Variants = {
    idle: {
        y: [0, -3, 0],
        scaleY: [1, 1, 1],
        rotate: 0,
        transition: { duration: 3, repeat: Infinity, ease: "easeInOut" }
    },
    happy: {
        y: [0, -25, 0, -10, 0],
        scaleY: [1, 1.2, 0.9, 1.1, 1],
        rotate: [0, -10, 10, -5, 5, 0],
        transition: { duration: 1.2, ease: "easeOut" }
    },
    sad: {
        y: [0, 5, 3], // 下沉
        scaleY: [1, 0.95, 0.97],
        rotate: [0, -3, 0],
        transition: { duration: 0.8, ease: "easeOut" }
    },
    combo: {
        y: [0, -35, 0, -20, 0, -10, 0], // 疯狂跳跃
        scaleY: [1, 1.3, 0.85, 1.2, 0.9, 1.1, 1],
        rotate: [0, -15, 15, -10, 10, -5, 5, 0],
        transition: { duration: 1.5, ease: "easeOut" }
    },
    sleepy: {
        y: [0, 2, 0],
        scaleY: [1, 0.98, 1],
        rotate: [0, -2, 0, 2, 0],
        transition: { duration: 4, repeat: Infinity, ease: "easeInOut" }
    },
    shy: {
        y: [0, -2, 0],
        scaleY: [1, 1.02, 1],
        rotate: [0, 3, 0],
        transition: { duration: 0.5, ease: "easeOut" }
    },
    poked: {
        y: [0, -15, 5, -5, 0], // 被戳弹跳
        scaleY: [1, 1.15, 0.9, 1.05, 1],
        rotate: [0, 5, -5, 2, 0],
        transition: { duration: 0.6, ease: "easeOut" }
    },
    thinking: {
        rotate: [0, 5, 0, 5, 0],
        transition: { duration: 2, repeat: Infinity, ease: "easeInOut" }
    },
    confused: {
        rotate: [0, -5, 5, -5, 0],
        transition: { duration: 2, repeat: Infinity, ease: "easeInOut" }
    },
    listening: {
        y: [0, 3, 0],
        rotate: [0, -3, 0, 3, 0], // HEAD BOPPING
        scaleY: [1, 0.98, 1],
        transition: { duration: 0.6, repeat: Infinity, ease: "linear" }
    },
    dizzy: {
        rotate: [0, 360],
        transition: { duration: 1, repeat: Infinity, ease: "linear" }
    },
    surprised: {
        scale: [1, 1.2, 1.1],
        rotate: [0, -5, 5, 0],
        y: [0, -10, 0],
        transition: { duration: 0.5, ease: "backOut" }
    },
    love: {
        y: [0, -5, 0],
        rotate: [0, 5, -5, 0],
        scale: [1, 1.1, 1],
        transition: { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
    },
    focused: {
        y: [0, 5],
        scale: [1, 1.05],
        rotate: 0,
        transition: { duration: 0.5, ease: "easeOut" }
    },
    determined: {
        y: [0, 1, -1, 0],
        rotate: [0, 2, -2, 0],
        transition: { duration: 0.2, repeat: Infinity }
    }
};

// [Component] MascotVisuals Helper Component (Combines SVG + Effects)
interface MascotVisualsProps {
    currentSkin: MascotSkin;
    internalReaction: MascotReaction;
    isDragging: boolean;
    isTeacher: boolean;
    eyePosition: { x: number; y: number };
    starPositions: { top: string; left: string }[];
    size?: number;
}
const MascotVisuals = React.memo(({ currentSkin, internalReaction, isDragging, isTeacher, eyePosition, starPositions, size = 64 }: MascotVisualsProps) => {
    // 获取眼睛动画状态
    const getEyeAnimation = () => {
        switch (internalReaction) {
            case 'happy': case 'combo': return { scaleY: 0.2, y: -2 };
            case 'sleepy': return { scaleY: 0.15, y: 2 };
            case 'sad': return { scaleY: 0.6, y: 3 };
            case 'shy': return { scaleY: 0.5, y: 0 };
            case 'confused': return { scaleY: [1, 1.2, 1], y: [0, -2, 0], transition: { duration: 2, repeat: Infinity } };
            default: return { scaleY: 1, y: 0 };
        }
    };

    // 获取嘴巴路径
    const getMouthPath = (): string => {
        switch (internalReaction) {
            case 'happy': case 'combo': return "M75 145 Q100 170 125 145";
            case 'sad': return "M80 155 Q100 140 120 155";
            case 'sleepy': return "M92 150 Q100 152 108 150";
            case 'shy': return "M90 150 Q100 155 110 150";
            case 'poked': return "M85 148 Q100 165 115 148";
            case 'dizzy': return "M90 155 Q100 145 110 155";
            case 'idle': return "M85 148 Q100 158 115 148"; // Explicit idle
            case 'confused': return "M90 150 Q100 150 110 150"; // Explicit confused
            case 'listening': return "M85 148 Q100 158 115 148"; // Same as idle
            case 'surprised': return "M100 150 Q100 165 100 150"; // Open mouth
            case 'love': return "M80 145 Q100 160 120 145"; // Smile
            case 'focused': return "M85 148 Q100 158 115 148"; // Same as idle
            case 'thinking': return "M90 150 Q100 150 110 150"; // Straight line
            case 'determined': return "M85 148 Q100 158 115 148"; // Same as idle
            default: return "M85 148 Q100 158 115 148"; // Default fallback
        }
    };

    return (
        <div className="relative w-full h-full">
            {/* ZZZ 动画 (睡眠专属) */}
            <AnimatePresence>
                {internalReaction === 'sleepy' && (
                    <motion.div
                        className="absolute -top-8 right-0 text-2xl pointer-events-none z-10"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: [0.5, 1, 0.5], y: [-5, -15, -5] }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 2, repeat: Infinity }}
                    >
                        💤
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 星星特效 (连击专属) */}
            <AnimatePresence>
                {internalReaction === 'combo' && (
                    <>
                        {starPositions.map((pos, i) => (
                            <motion.div
                                key={`star-${i}`}
                                className="absolute text-xl pointer-events-none z-10"
                                style={{ top: pos.top, left: pos.left }}
                                initial={{ opacity: 0, scale: 0, rotate: 0 }}
                                animate={{ opacity: [0, 1, 0], scale: [0, 1.2, 0], rotate: [0, 180], y: [-10, -30] }}
                                transition={{ duration: 1, delay: i * 0.1, ease: "easeOut" }}
                            >
                                ⭐
                            </motion.div>
                        ))}
                    </>
                )}
            </AnimatePresence>

            {/* 汗滴 (伤心专属) */}
            <AnimatePresence>
                {internalReaction === 'sad' && (
                    <motion.div
                        className="absolute top-1/4 -right-2 text-lg pointer-events-none z-10"
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: [0, 8, 0] }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                    >
                        💧
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 耳机 (listening 专属) */}
            <AnimatePresence>
                {internalReaction === 'listening' && (
                    <motion.g
                        className="absolute -top-4 left-1/2 -translate-x-1/2 pointer-events-none z-10"
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.3 }}
                    >
                        <svg width={size * 0.8} height={size * 0.8} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M10 50 C10 20, 90 20, 90 50" stroke="#333" strokeWidth="8" strokeLinecap="round" />
                            <circle cx="15" cy="55" r="12" fill="#555" stroke="#333" strokeWidth="4" />
                            <circle cx="85" cy="55" r="12" fill="#555" stroke="#333" strokeWidth="4" />
                            <motion.text
                                x="50" y="45"
                                textAnchor="middle"
                                fontSize="25"
                                fill="#fff"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: [0, 1, 0], y: [10, 0, -10] }}
                                transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
                            >
                                🎵
                            </motion.text>
                        </svg>
                    </motion.g>
                )}
            </AnimatePresence>

            <svg viewBox="0 0 200 200" className="w-full h-full filter drop-shadow-lg" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <radialGradient id={`gradient-${currentSkin.id}`} cx="30%" cy="30%" r="70%">
                        <stop offset="0%" stopColor="white" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="white" stopOpacity="0" />
                    </radialGradient>
                    <filter id="mascotSoftShadow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur in="SourceAlpha" stdDeviation="2" />
                        <feOffset dx="1" dy="2" result="shadow" />
                        <feComposite in2="shadow" operator="in" result="shadow" />
                        <feColorMatrix type="matrix" values="0 0 0 0 0.6  0 0 0 0 0.2  0 0 0 0 0.3  0 0 0 0.3 0" />
                        <feBlend mode="normal" in="SourceGraphic" />
                    </filter>
                </defs>

                {/* 身体组 */}
                <motion.g
                    initial="idle"
                    animate={isDragging ? "drag" : internalReaction}
                    whileTap={{ scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    variants={{
                        ...bodyVariants,
                        drag: { y: 0, scaleY: 1, rotate: 0, transition: { duration: 0 } }
                    }}
                >
                    {/* 身体背景 */}
                    <circle cx="100" cy="100" r="80" fill={currentSkin.gradientMid} filter={isDragging ? undefined : "url(#mascotSoftShadow)"} />
                    <circle cx="100" cy="100" r="75" fill={isDragging ? "#ffffff" : `url(#gradient-${currentSkin.id})`} fillOpacity={isDragging ? 0.2 : 1} />
                    <path d="M100 30C60 30 30 60 25 100" stroke="white" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.6" fill="none" />

                    {/* Teachers Stick */}
                    <AnimatePresence>
                        {isTeacher && (
                            <motion.g initial={{ opacity: 0, rotate: -45, x: -20 }} animate={{ opacity: 1, rotate: 0, x: 0 }} exit={{ opacity: 0, rotate: -45, x: -20 }} transition={{ duration: 0.5 }}>
                                <motion.g animate={{ rotate: [0, -15, 0], y: [0, -5, 0] }} transition={{ duration: 2, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}>
                                    <rect x="40" y="160" width="10" height="60" transform="rotate(-30 45 190)" fill="#FCD34D" stroke="#D97706" strokeWidth="2" rx="2" />
                                </motion.g>
                            </motion.g>
                        )}
                    </AnimatePresence>

                    {/* Hands */}
                    <motion.path d="M50 160 Q40 180 30 160 M150 160 Q160 180 170 160" stroke={currentSkin.strokeColor || "#2D2D2D"} strokeWidth="4" fill="none" strokeLinecap="round" initial={false} animate={{ y: ['happy', 'combo', 'poked'].includes(internalReaction) ? [0, -10, 0] : 0, transition: { duration: 0.5, repeat: internalReaction === 'combo' ? Infinity : 0 } }} />

                    {/* Blush */}
                    <motion.g initial={{ opacity: 0.6 }} animate={{ opacity: internalReaction === 'shy' ? 0.9 : 0.6 }} transition={{ duration: 0.3 }}>
                        <circle cx="45" cy="135" r="12" fill={currentSkin.blushColor} filter="blur(3px)" />
                        <circle cx="155" cy="135" r="12" fill={currentSkin.blushColor} filter="blur(3px)" />
                    </motion.g>

                    {/* Eyes */}
                    <g transform={`translate(${eyePosition.x}, ${eyePosition.y})`}>
                        {/* Left Eye */}
                        <g transform="translate(-35, 10)">
                            <motion.ellipse cx="100" cy="100" rx="10" ry="12" fill="#2D2D2D" initial={{ scaleY: 1, y: 0 }} animate={getEyeAnimation()} />
                            {internalReaction === 'dizzy' ? (
                                <motion.g initial={{ rotate: 0 }} animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} style={{ originX: "100px", originY: "100px" }}>
                                    <path d="M100 100 m-8 0 a 8 8 0 1 0 16 0 a 8 8 0 1 0 -16 0 M100 100 m-4 0 a 4 4 0 1 0 8 0 a 4 4 0 1 0 -8 0" stroke="white" strokeWidth="2" fill="none" />
                                </motion.g>
                            ) : (
                                <motion.circle cx="103" cy="97" r="3" fill="white" initial={{ opacity: 1 }} animate={{ opacity: ['happy', 'sleepy', 'sad', 'combo', 'confused'].includes(internalReaction) ? 0 : 1 }} />
                            )}
                        </g>
                        {/* Right Eye */}
                        <g transform="translate(35, 10)">
                            <motion.ellipse cx="100" cy="100" rx="10" ry="12" fill="#2D2D2D" initial={{ scaleY: 1, y: 0 }} animate={getEyeAnimation()} />
                            {internalReaction === 'dizzy' ? (
                                <motion.g initial={{ rotate: 0 }} animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} style={{ originX: "100px", originY: "100px" }}>
                                    <path d="M100 100 m-8 0 a 8 8 0 1 0 16 0 a 8 8 0 1 0 -16 0 M100 100 m-4 0 a 4 4 0 1 0 8 0 a 4 4 0 1 0 -8 0" stroke="white" strokeWidth="2" fill="none" />
                                </motion.g>
                            ) : (
                                <motion.circle cx="103" cy="97" r="3" fill="white"
                                    initial={{ opacity: 1 }}
                                    animate={{ opacity: ['happy', 'sleepy', 'sad', 'combo', 'confused'].includes(internalReaction) ? 0 : 1 }}
                                />
                            )}
                        </g>
                    </g>

                    {/* Mouth */}
                    <motion.path d={getMouthPath()} fill="none" stroke="#2D2D2D" strokeWidth="5" strokeLinecap="round" initial={{ d: getMouthPath() }} animate={{ d: getMouthPath() }} transition={{ duration: 0.3 }} />

                    {/* Glasses */}
                    <AnimatePresence>
                        {isTeacher && (
                            <motion.g key="glasses" initial={{ y: -100, opacity: 0, scale: 1.5, rotate: -15 }} animate={{ y: 0, opacity: 1, scale: 1, rotate: 0 }} exit={{ y: -60, opacity: 0, scale: 0.8, rotate: 15 }} transition={{ type: "spring", stiffness: 400, damping: 15, mass: 1.2 }}>
                                <g transform="translate(0, -5)">
                                    {/* 镜片 - 使用半透明黑色以便眼珠可见 */}
                                    <path d="M45 105 H 85 Q 85 125, 65 125 Q 45 125, 45 105 Z" fill="rgba(17,17,17,0.3)" stroke="#111" strokeWidth="2" />
                                    <path d="M115 105 H 155 Q 155 125, 135 125 Q 115 125, 115 105 Z" fill="rgba(17,17,17,0.3)" stroke="#111" strokeWidth="2" />
                                    <path d="M85 108 H 115" stroke="#111" strokeWidth="4" />
                                    <path d="M45 108 L 25 100" stroke="#111" strokeWidth="4" />
                                    <path d="M155 108 L 175 100" stroke="#111" strokeWidth="4" />
                                    <path d="M50 110 L 70 110" stroke="rgba(255,255,255,0.3)" strokeWidth="3" strokeLinecap="round" />
                                    <path d="M120 110 L 140 110" stroke="rgba(255,255,255,0.3)" strokeWidth="3" strokeLinecap="round" />
                                </g>
                                <motion.g initial={{ opacity: 0.4 }} animate={{ opacity: [0.4, 0.7, 0.4] }} transition={{ duration: 3, repeat: Infinity }}>
                                    <path d="M52 100 L 75 100" stroke="white" strokeWidth="3" pointerEvents="none" transform="rotate(-20 65 110)" />
                                    <path d="M122 100 L 145 100" stroke="white" strokeWidth="3" pointerEvents="none" transform="rotate(-20 135 110)" />
                                </motion.g>
                            </motion.g>
                        )}
                    </AnimatePresence>

                    {/* Accessories */}
                    {(currentSkin.accessories || []).map((acc, i) => (
                        <image key={i} href={acc} x="50" y="-20" width="100" height="100" />
                    ))}
                </motion.g>
            </svg>
        </div>
    );
});

export const InteractiveMascot = React.memo(function InteractiveMascot({
    reaction = 'idle',
    size = 64,
    className,
    onPoke,
    isHovered = false,
    skinId,
    customBubbleText,
    isTeacher = false,
    explanation,
    isDragging = false,
    currentWord,
    variant = 'classic' // Default to classic
}: InteractiveMascotProps) {
    const [eyePosition, setEyePosition] = useState({ x: 0, y: 0 });
    const mascotRef = useRef<HTMLDivElement>(null);
    const [internalReaction, setInternalReaction] = useState<MascotReaction>(reaction);

    // 加载皮肤配置
    const currentSkin: MascotSkin = useMemo(() => {
        // 优先使用传入的 skinId，否则从 localStorage 加载
        const id = skinId || loadMascotConfig().skinId;
        return getMascotSkin(id);
    }, [skinId]);

    // 同步外部 reaction
    useEffect(() => {
        setInternalReaction(reaction);
    }, [reaction]);

    // [DEBUG] Log variant changes
    useEffect(() => {
        console.log('[InteractiveMascot] Variant changed to:', variant);
    }, [variant]);

    // 悬停时变害羞 (优先级较低，被外部状态覆盖)
    useEffect(() => {
        if (isHovered && reaction === 'idle') {
            setInternalReaction('shy');
        } else if (!isHovered && reaction === 'idle' && internalReaction === 'shy') {
            setInternalReaction('idle');
        }
    }, [isHovered, reaction, internalReaction]);

    // [Feature I] 订阅学习事件 (Learning Loop Integration)
    useEffect(() => {
        const unsubscribe = mascotEventBus.subscribe((event) => {
            if (event.type === 'LEARNING_EVENT' && event.context) {
                const { eventType, count } = event.context;
                console.log('[InteractiveMascot] Received learning event:', eventType, count);

                switch (eventType) {
                    case 'correct':
                        setInternalReaction('happy');
                        // 3秒后自动切回 idle (除非有新状态)
                        setTimeout(() => setInternalReaction(curr => curr === 'happy' ? 'idle' : curr), 3000);
                        break;

                    case 'wrong':
                        setInternalReaction('sad');
                        setTimeout(() => setInternalReaction(curr => curr === 'sad' ? 'idle' : curr), 4000);
                        break;

                    case 'streak':
                        // Streak 3+ -> Combo/Excited
                        if (count >= 3) {
                            setInternalReaction('combo');
                            setTimeout(() => setInternalReaction(curr => curr === 'combo' ? 'idle' : curr), 3000);
                        }
                        break;

                    case 'hesitation':
                        // User stuck -> Thinking/Curious
                        setInternalReaction('thinking');
                        // 思考状态持续直到有新操作
                        break;
                }
            }
        });
        return unsubscribe;
    }, []);

    // 鼠标眼动追踪逻辑 - 性能优化：限制更新频率
    useEffect(() => {
        let rafId: number;
        const handleMouseMove = (e: MouseEvent) => {
            if (!mascotRef.current) return;
            if (isDragging) return; // [Performance] 拖拽时禁用眼动追踪

            // 使用 requestAnimationFrame 节流
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                if (!mascotRef.current) return;
                const rect = mascotRef.current.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                const dx = e.clientX - centerX;
                const dy = e.clientY - centerY;
                const maxMove = 6;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const ratio = distance > 0 ? Math.min(distance, 150) / 150 : 0;
                const moveX = (dx / (distance || 1)) * maxMove * ratio;
                const moveY = (dy / (distance || 1)) * maxMove * ratio;
                setEyePosition({ x: moveX, y: moveY });
            });
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            cancelAnimationFrame(rafId);
        };
    }, [isDragging]);

    const [bubbleText, setBubbleText] = useState("");

    useEffect(() => {
        if (customBubbleText) {
            setBubbleText(customBubbleText);
            return;
        }
        const texts = bubbleTextMap[internalReaction] || [];
        if (texts.length > 0) {
            setBubbleText(texts[Math.floor(Math.random() * texts.length)]);
        }
    }, [internalReaction, customBubbleText]);

    const showBubble = !!customBubbleText || ['happy', 'sad', 'combo', 'sleepy', 'shy', 'poked', 'confused', 'dizzy', 'listening'].includes(internalReaction);

    const [starPositions, setStarPositions] = useState<{ top: string; left: string }[]>([]);

    useEffect(() => {
        setStarPositions([...Array(5)].map(() => ({
            top: `${20 + Math.random() * 30}%`,
            left: `${10 + Math.random() * 80}%`
        })));
    }, []);

    // [Interactive] Resizable & Draggable Blackboard Logic
    const [boxSize, setBoxSize] = useState({ width: 360, height: 420 });
    const [boxOffset, setBoxOffset] = useState({ x: 0, y: 0 }); // Will be calculated on mount
    const isResizingRef = useRef(false);
    const isDraggingBubbleRef = useRef(false);
    const dragStartPosRef = useRef({ x: 0, y: 0 });
    const initialBoxRef = useRef({ width: 0, height: 0, x: 0, y: 0 });
    const hasInitializedPosition = useRef(false);

    // Load saved settings & Smart Initial Positioning
    useEffect(() => {
        try {
            const savedSize = localStorage.getItem('mascot_blackboard_size');
            const savedOffset = localStorage.getItem('mascot_blackboard_offset');
            if (savedSize) setBoxSize(JSON.parse(savedSize));

            // If no saved offset, calculate smart initial position
            if (savedOffset) {
                setBoxOffset(JSON.parse(savedOffset));
                hasInitializedPosition.current = true;
            }
        } catch (e) { console.error(e); }
    }, []);

    // Smart positioning when explanation opens for the first time
    useEffect(() => {
        if (explanation && mascotRef.current && !hasInitializedPosition.current) {
            // Get mascot position on screen
            const rect = mascotRef.current.getBoundingClientRect();


            // Calculate optimal position: 
            // - Position to the upper-left of the mascot
            // - Keep blackboard visible within screen bounds
            // - Account for typical learning card panel on left (~600px)
            const idealX = -boxSize.width - 20; // 20px gap to the left of mascot
            const idealY = -boxSize.height + size / 2; // Align bottom of blackboard near mascot center

            // Ensure the blackboard won't go off-screen (left edge)
            const actualX = Math.max(-rect.left + 20, idealX);
            // Ensure the blackboard won't go off-screen (top edge) 
            const actualY = Math.max(-rect.top + 80, idealY);

            setBoxOffset({ x: actualX, y: actualY });
            hasInitializedPosition.current = true;
        }
    }, [explanation, boxSize.width, boxSize.height, size]);

    // Global Event Listeners for Drag/Resize
    useEffect(() => {
        const handleMove = (e: MouseEvent) => {
            if (isResizingRef.current) {
                const dx = e.clientX - dragStartPosRef.current.x;
                const dy = e.clientY - dragStartPosRef.current.y;
                const newWidth = Math.max(200, initialBoxRef.current.width + dx);
                const newHeight = Math.max(150, initialBoxRef.current.height + dy);
                setBoxSize({ width: newWidth, height: newHeight });
            } else if (isDraggingBubbleRef.current) {
                const dx = e.clientX - dragStartPosRef.current.x;
                const dy = e.clientY - dragStartPosRef.current.y;
                setBoxOffset({
                    x: initialBoxRef.current.x + dx,
                    y: initialBoxRef.current.y + dy
                });
            }
        };

        const handleUp = () => {
            if (isResizingRef.current) {
                isResizingRef.current = false;
                localStorage.setItem('mascot_blackboard_size', JSON.stringify(boxSize));
            }
            if (isDraggingBubbleRef.current) {
                isDraggingBubbleRef.current = false;
                localStorage.setItem('mascot_blackboard_offset', JSON.stringify(boxOffset));
            }
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
    }, [boxSize, boxOffset]);

    return (
        <div
            ref={mascotRef}
            className={`relative ${className}`}
            style={{ width: size, height: size }}
            onClick={onPoke}
        >
            {/* [Feature I] 老师讲解面板 - 屏幕右侧固定定位 */}
            <AnimatePresence mode="wait">
                {explanation && (
                    <motion.div
                        key="teacher-explanation"
                        // 使用固定定位，位于屏幕右侧
                        className="fixed z-[100] pointer-events-auto"
                        style={{
                            right: 24,
                            top: '50%',
                            translateY: '-50%',
                            width: 380,
                            maxHeight: '70vh',
                        }}
                        // 优雅的右滑入场动画
                        initial={{ opacity: 0, x: 60, scale: 0.96 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        // 柔和的右滑离场动画
                        exit={{ opacity: 0, x: 40, scale: 0.98 }}
                        transition={{
                            duration: 0.3,
                            ease: [0.4, 0, 0.2, 1] // Apple 标准缓动曲线
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                    >
                        <div
                            className="w-full h-full backdrop-blur-2xl rounded-3xl shadow-2xl text-left relative 
                                       bg-white/95 border border-yellow-400/20 flex flex-col overflow-hidden
                                       shadow-black/10"
                        >
                            {/* 顶部标题栏 */}
                            <div className="flex items-center justify-between px-5 py-4 border-b border-yellow-400/10 bg-gradient-to-r from-yellow-50/80 to-orange-50/50">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-orange-400 flex items-center justify-center shadow-md">
                                        <span className="text-sm">👨‍🏫</span>
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-yellow-900">AI 老师讲解</div>
                                        <div className="text-[10px] text-yellow-700/60">Teacher's Note</div>
                                    </div>
                                </div>
                                {/* 关闭按钮 */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        mascotEventBus.say('', 'idle', 0); // 清除讲解
                                    }}
                                    className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center 
                                               transition-colors active:scale-95"
                                >
                                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* 内容区域 */}
                            <div className="flex-1 overflow-y-auto p-5 prose prose-sm max-w-none 
                                            prose-p:my-2 prose-ul:my-2 prose-li:my-1
                                            prose-headings:text-yellow-800 prose-headings:font-bold
                                            prose-h2:text-base prose-h2:mt-0 prose-h2:mb-3
                                            prose-h3:text-sm prose-h3:mt-4 prose-h3:mb-2
                                            prose-strong:text-yellow-700
                                            prose-blockquote:not-italic prose-blockquote:font-normal 
                                            prose-blockquote:text-gray-700 prose-blockquote:bg-gradient-to-r 
                                            prose-blockquote:from-purple-50 prose-blockquote:to-pink-50
                                            prose-blockquote:border-l-4 prose-blockquote:border-purple-400 
                                            prose-blockquote:py-3 prose-blockquote:px-4 prose-blockquote:rounded-r-xl 
                                            prose-blockquote:my-3 prose-blockquote:shadow-sm
                                            break-words leading-relaxed text-gray-700"
                                style={{ maxHeight: 'calc(70vh - 140px)' }}
                            >
                                <ReactMarkdown>{explanation}</ReactMarkdown>
                            </div>

                            {/* 底部操作按钮 */}
                            {isTeacher && (
                                <div className="px-5 py-4 border-t border-yellow-400/10 bg-gradient-to-r from-gray-50/80 to-yellow-50/30">
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const target = currentWord || explanation?.match(/###\s+(.+?)(\n|$)/)?.[1] || explanation?.split('\n')[0].replace(/#+\s*/, '').trim();
                                                if (target) mascotEventBus.refineExplanation(target, 'simplification');
                                            }}
                                            className="px-3 py-2 bg-yellow-100 hover:bg-yellow-200 text-yellow-700 text-xs font-medium
                                                       rounded-xl transition-all flex items-center gap-1.5 shadow-sm 
                                                       hover:shadow active:scale-95"
                                        >
                                            <span>🍼</span> 太难了
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const target = currentWord || explanation?.match(/###\s+(.+?)(\n|$)/)?.[1] || explanation?.split('\n')[0].replace(/#+\s*/, '').trim();
                                                if (target) mascotEventBus.refineExplanation(target, 'example');
                                            }}
                                            className="px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs font-medium
                                                       rounded-xl transition-all flex items-center gap-1.5 shadow-sm 
                                                       hover:shadow active:scale-95"
                                        >
                                            <span>💡</span> 举个栗子
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const target = currentWord || explanation?.match(/###\s+(.+?)(\n|$)/)?.[1] || explanation?.split('\n')[0].replace(/#+\s*/, '').trim();
                                                if (target) mascotEventBus.refineExplanation(target, 'mnemonic');
                                            }}
                                            className="px-3 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 text-xs font-medium
                                                       rounded-xl transition-all flex items-center gap-1.5 shadow-sm 
                                                       hover:shadow active:scale-95"
                                        >
                                            <span>🧠</span> 换个口诀
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 说话浮窗 (现代液态玻璃风格，无气泡箭头) */}
            <AnimatePresence>
                {showBubble && bubbleText && !explanation && (
                    <motion.div
                        key="speech-toast"
                        className="absolute z-40 pointer-events-none"
                        style={{
                            bottom: size / 2 - 20, // Center vertically with mascot
                            right: size + 16 // Position to the left of mascot
                        }}
                        initial={{ opacity: 0, x: 20, scale: 0.9 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 10, scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    >
                        <div className="relative bg-black/60 backdrop-blur-xl rounded-2xl px-4 py-3 shadow-lg border border-white/10 min-w-[120px] max-w-[220px]">
                            {/* Ambient glow */}
                            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />

                            {/* Content */}
                            <p className="text-sm text-white/90 font-medium text-center leading-relaxed relative z-10">
                                {bubbleText}
                            </p>

                            {/* Subtle indicator dot connecting to mascot */}
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-[calc(100%+4px)] flex items-center gap-1">
                                <div className="w-1 h-1 rounded-full bg-white/30" />
                                <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* If explanation is NOT visible, render Mascot Central */}
            {!explanation && (
                <>
                    {console.log('[InteractiveMascot] Rendering variant:', variant, 'reaction:', internalReaction)}
                    {variant === 'sphere' ? (
                        <SphereVisuals
                            reaction={internalReaction}
                            size={size}
                            eyePosition={eyePosition}
                        />
                    ) : (
                        <MascotVisuals
                            currentSkin={currentSkin}
                            internalReaction={internalReaction}
                            isDragging={isDragging}
                            isTeacher={isTeacher}
                            eyePosition={eyePosition}
                            starPositions={starPositions}
                            size={size}
                        />
                    )}
                </>
            )}
        </div>
    );
});
