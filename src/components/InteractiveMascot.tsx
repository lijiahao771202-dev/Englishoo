/**
 * @component 交互式3D吉祥物 (InteractiveMascot)
 * @description 具备鼠标跟随眼动效果、丰富情绪反馈动画和换装系统的悬浮助手图标
 * @author Trae-Architect
 */
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { getMascotSkin, loadMascotConfig, type MascotSkin } from '@/lib/mascot-config';

// 扩展情绪类型
export type MascotReaction = 'idle' | 'happy' | 'thinking' | 'sleepy' | 'sad' | 'combo' | 'shy' | 'poked' | 'confused' | 'listening' | 'dizzy' | 'surprised' | 'love' | 'focused' | 'determined';

interface InteractiveMascotProps {
    reaction?: MascotReaction;
    size?: number;
    className?: string;
    onPoke?: () => void; // 戳一戳回调
    isHovered?: boolean; // 悬停状态
    skinId?: string; // 皮肤ID
    customBubbleText?: string; // 自定义气泡文字 (Feature G)
    isTeacher?: boolean; // [Feature I] 老师模式
    explanation?: string; // [Feature I] 老师讲解内容
    isDragging?: boolean; // [Performance] 是否正在拖拽 (用于降级渲染)
}

// 气泡文字映射 (Legacy Fallback, mostly handled by feature events now)
const bubbleTextMap: Record<string, string[]> = {
    idle: [],
    happy: ["Good!", "Great!", "Nice!", "Cool!", "Wow!"],
    sad: ["没关系~", "再来!", "加油!"],
    combo: ["连击!", "太棒了!", "🔥 火力全开!"],
    sleepy: ["Zzz...", "💤"],
    shy: ["嘿嘿~", "😊"],
    poked: ["哎呀!", "嘻嘻~", "别戳啦!"],
    thinking: ["嗯..."],
    confused: ["???", "诶?", "什么?"],
    listening: ["🎵", "好听~", "动次打次"],
    dizzy: ["晕...", "慢点~", "@@"],
    surprised: ["Woa!", "!!", "😲"],
    love: ["❤️", "Love u", "嘻嘻"],
    focused: ["...", "盯..."],
    determined: ["冲!", "Fight!"]
};

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
    isDragging = false
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

    // 悬停时变害羞 (优先级较低，被外部状态覆盖)
    useEffect(() => {
        if (isHovered && reaction === 'idle') {
            setInternalReaction('shy');
        } else if (!isHovered && reaction === 'idle' && internalReaction === 'shy') {
            setInternalReaction('idle');
        }
    }, [isHovered, reaction, internalReaction]);

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

    // ... (keep rest of the component logic)

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
        // [Feature H] New Reactions
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

    // 获取眼睛动画状态
    const getEyeAnimation = () => {
        switch (internalReaction) {
            case 'happy':
            case 'combo':
                return { scaleY: 0.2, y: -2 }; // 笑眼
            case 'sleepy':
                return { scaleY: 0.15, y: 2 }; // 闭眼
            case 'sad':
                return { scaleY: 0.6, y: 3 }; // 眼睛下垂
            case 'shy':
                return { scaleY: 0.5, y: 0 }; // 半闭
            case 'confused':
                return {
                    scaleY: [1, 1.2, 1],
                    y: [0, -2, 0],
                    transition: { duration: 2, repeat: Infinity }
                };
            default:
                return { scaleY: 1, y: 0 };
        }
    };

    // 获取嘴巴路径
    const getMouthPath = () => {
        switch (internalReaction) {
            case 'happy':
            case 'combo':
                return "M75 145 Q100 170 125 145"; // 大笑
            case 'sad':
                return "M80 155 Q100 140 120 155"; // 哭脸
            case 'sleepy':
                return "M92 150 Q100 152 108 150"; // 小O
            case 'shy':
                return "M90 150 Q100 155 110 150"; // 微微嘟嘴
            case 'poked':
                return "M85 148 Q100 165 115 148"; // 惊讶
            case 'dizzy':
                return "M90 155 Q100 145 110 155"; // 晕眩波浪嘴
            default:
                return "M85 148 Q100 158 115 148"; // 微笑
        }
    };

    return (
        <div
            ref={mascotRef}
            className={`relative ${className}`}
            style={{ width: size, height: size }}
            onClick={onPoke}
        >
            {/* [Feature I] 老师讲解气泡 (优先显示) */}
            <AnimatePresence>
                {explanation && (
                    <motion.div
                        key="teacher-explanation"
                        className="absolute -top-40 right-20 z-[60] w-64 md:w-80 pointer-events-none"
                        initial={{ opacity: 0, scale: 0.8, x: -20 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.8, x: -10 }}
                        transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    >
                        <div className="bg-white/90 backdrop-blur-xl border border-yellow-400/30 rounded-2xl p-4 shadow-xl text-left relative">
                            {/* Blackboard Style Header */}
                            <div className="absolute -top-3 left-4 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded-md shadow-sm flex items-center gap-1">
                                <span>👨‍🏫</span>
                                <span>Teacher's Note</span>
                            </div>

                            <div className="prose prose-sm prose-p:my-1 prose-strong:text-yellow-600 prose-ul:my-1">
                                <ReactMarkdown>{explanation}</ReactMarkdown>
                            </div>

                            {/* Pointer Decoration */}
                            <div className="absolute -bottom-2 -right-2 text-2xl filter drop-shadow-md">
                                👆
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>


            {/* 普通气泡 (仅在无讲解时显示) */}
            <AnimatePresence>
                {showBubble && bubbleText && !explanation && (
                    <motion.div
                        key="bubble"
                        className="absolute -top-32 left-0 right-0 mx-auto w-48 z-50 pointer-events-none"
                        initial={{ opacity: 0, scale: 0.3, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.3, y: 10 }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    >
                        <div className="relative bg-white border-2 border-black/80 rounded-2xl px-3 py-1 shadow-[3px_3px_0px_rgba(0,0,0,0.15)]">
                            <span className="font-bold text-base text-black whitespace-nowrap">
                                {bubbleText}
                            </span>
                            <svg className="absolute -bottom-2.5 left-3 w-3 h-3" viewBox="0 0 20 20">
                                <path d="M0 0 L10 15 L20 0 Z" fill="white" stroke="black" strokeWidth="2" />
                            </svg>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ZZZ 动画 (睡眠专属) */}
            <AnimatePresence>
                {internalReaction === 'sleepy' && (
                    <motion.div
                        className="absolute -top-8 right-0 text-2xl pointer-events-none"
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
                                className="absolute text-xl pointer-events-none"
                                style={{
                                    top: pos.top,
                                    left: pos.left
                                }}
                                initial={{ opacity: 0, scale: 0, rotate: 0 }}
                                animate={{
                                    opacity: [0, 1, 0],
                                    scale: [0, 1.2, 0],
                                    rotate: [0, 180],
                                    y: [-10, -30]
                                }}
                                transition={{
                                    duration: 1,
                                    delay: i * 0.1,
                                    ease: "easeOut"
                                }}
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
                        className="absolute top-1/4 -right-2 text-lg pointer-events-none"
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
                        className="absolute -top-4 left-1/2 -translate-x-1/2 pointer-events-none"
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

            <svg
                viewBox="0 0 200 200"
                className="w-full h-full filter drop-shadow-lg"
                xmlns="http://www.w3.org/2000/svg"
            >
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

                {/* 身体组 (包含面部特征) */}
                <motion.g
                    initial="idle"
                    animate={isDragging ? "drag" : internalReaction}
                    whileTap={{ scale: 0.95 }}
                    // Removed key to prevent remounting issues
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    variants={{
                        ...bodyVariants,
                        drag: {
                            y: 0,
                            scaleY: 1,
                            rotate: 0,
                            transition: { duration: 0 } // 瞬间静止
                        }
                    }}
                >
                    {/* 身体背景 */}
                    <circle cx="100" cy="100" r="80" fill={currentSkin.gradientMid} filter={isDragging ? undefined : "url(#mascotSoftShadow)"} />
                    <circle cx="100" cy="100" r="75" fill={isDragging ? "#ffffff" : `url(#gradient-${currentSkin.id})`} fillOpacity={isDragging ? 0.2 : 1} />
                    <path
                        d="M100 30C60 30 30 60 25 100"
                        stroke="white"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeOpacity="0.6"
                        fill="none"
                    />
                    {/* [Feature I] 老师教鞭 (Stick) */}
                    <AnimatePresence>
                        {isTeacher && (
                            <motion.g
                                initial={{ opacity: 0, rotate: -45, x: -20 }}
                                animate={{ opacity: 1, rotate: 0, x: 0 }}
                                exit={{ opacity: 0, rotate: -45, x: -20 }}
                                transition={{ duration: 0.5 }}
                            >
                                {/* 教学尺子 (Ruler) */}
                                <motion.g
                                    animate={{
                                        rotate: [0, -15, 0],
                                        y: [0, -5, 0]
                                    }}
                                    transition={{
                                        duration: 2,
                                        repeat: Infinity,
                                        repeatType: "reverse",
                                        ease: "easeInOut"
                                    }}
                                >
                                    {/* 尺身 */}
                                    <rect
                                        x="40" y="160" width="10" height="60"
                                        transform="rotate(-30 45 190)"
                                        fill="#FCD34D"
                                        stroke="#D97706"
                                        strokeWidth="2"
                                        rx="2"
                                    />
                                    {/* 刻度线 */}
                                    <g transform="translate(40, 160) rotate(-30 5 30)">
                                        <line x1="2" y1="5" x2="6" y2="5" stroke="#B45309" strokeWidth="1" />
                                        <line x1="2" y1="15" x2="8" y2="15" stroke="#B45309" strokeWidth="1" />
                                        <line x1="2" y1="25" x2="6" y2="25" stroke="#B45309" strokeWidth="1" />
                                        <line x1="2" y1="35" x2="8" y2="35" stroke="#B45309" strokeWidth="1" />
                                        <line x1="2" y1="45" x2="6" y2="45" stroke="#B45309" strokeWidth="1" />
                                        <line x1="2" y1="55" x2="8" y2="55" stroke="#B45309" strokeWidth="1" />
                                    </g>
                                </motion.g>
                            </motion.g>
                        )}
                    </AnimatePresence>

                    {/* 双手 (Hands) */}
                    {/* 双手 (Hands) */}
                    <motion.path
                        d="M50 160 Q40 180 30 160 M150 160 Q160 180 170 160"
                        stroke={currentSkin.strokeColor || "#2D2D2D"}
                        strokeWidth="4"
                        fill="none"
                        strokeLinecap="round"
                        initial={false}
                        animate={{
                            y: ['happy', 'combo', 'poked'].includes(internalReaction) ? [0, -10, 0] : 0,
                            transition: { duration: 0.5, repeat: internalReaction === 'combo' ? Infinity : 0 }
                        }}
                    />

                    {/* 腮红 */}
                    <motion.g
                        initial={{ opacity: 0.6 }}
                        animate={{ opacity: internalReaction === 'shy' ? 0.9 : 0.6 }}
                        transition={{ duration: 0.3 }}
                    >
                        <circle cx="45" cy="135" r="12" fill={currentSkin.blushColor} filter="blur(3px)" />
                        <circle cx="155" cy="135" r="12" fill={currentSkin.blushColor} filter="blur(3px)" />
                    </motion.g>

                    {/* 眼睛组 */}
                    <g transform={`translate(${eyePosition.x}, ${eyePosition.y})`}>
                        {/* 左眼 */}
                        <g transform="translate(-35, 10)">
                            <motion.ellipse
                                cx="100" cy="100" rx="10" ry="12"
                                fill="#2D2D2D"
                                initial={{ scaleY: 1, y: 0 }}
                                animate={getEyeAnimation()}
                            />
                            {/* 眩晕左眼 */}
                            {internalReaction === 'dizzy' ? (
                                <motion.g
                                    initial={{ rotate: 0 }}
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                                    style={{ originX: "100px", originY: "100px" }}
                                >
                                    <path d="M100 100 m-8 0 a 8 8 0 1 0 16 0 a 8 8 0 1 0 -16 0 M100 100 m-4 0 a 4 4 0 1 0 8 0 a 4 4 0 1 0 -8 0" stroke="white" strokeWidth="2" fill="none" />
                                </motion.g>
                            ) : (
                                <motion.circle cx="103" cy="97" r="3" fill="white"
                                    initial={{ opacity: 1 }}
                                    animate={{ opacity: ['happy', 'sleepy', 'sad', 'combo', 'confused'].includes(internalReaction) ? 0 : 1 }}
                                />
                            )}
                        </g>

                        {/* 右眼 */}
                        <g transform="translate(35, 10)">
                            <motion.ellipse
                                cx="100" cy="100" rx="10" ry="12"
                                fill="#2D2D2D"
                                initial={{ scaleY: 1, y: 0 }}
                                animate={getEyeAnimation()}
                            />
                            {/* 眩晕右眼 */}
                            {internalReaction === 'dizzy' ? (
                                <motion.g
                                    initial={{ rotate: 0 }}
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                                    style={{ originX: "100px", originY: "100px" }}
                                >
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

                    {/* 嘴巴 */}
                    <motion.path
                        d={getMouthPath()}
                        fill="none"
                        stroke="#2D2D2D"
                        strokeWidth="5"
                        strokeLinecap="round"
                        initial={{ d: getMouthPath() }}
                        animate={{ d: getMouthPath() }}
                        transition={{ duration: 0.3 }}
                    />

                    {/* [Feature I] 老师眼镜 - 位于眼睛上层 */}
                    <AnimatePresence>
                        {isTeacher && (
                            <motion.g
                                key="glasses"
                                initial={{ y: -100, opacity: 0, scale: 1.5, rotate: -15 }}
                                animate={{ y: 0, opacity: 1, scale: 1, rotate: 0 }}
                                exit={{ y: -60, opacity: 0, scale: 0.8, rotate: 15 }}
                                transition={{
                                    type: "spring",
                                    stiffness: 400,
                                    damping: 15,
                                    mass: 1.2
                                }}
                            >
                                {/* 墨镜 (Cool Sunglasses) */}
                                <g transform="translate(0, -5)">
                                    {/* 左镜片 */}
                                    <path
                                        d="M45 105 H 85 Q 85 125, 65 125 Q 45 125, 45 105 Z"
                                        fill="#111"
                                        stroke="#111"
                                        strokeWidth="2"
                                    />
                                    {/* 右镜片 */}
                                    <path
                                        d="M115 105 H 155 Q 155 125, 135 125 Q 115 125, 115 105 Z"
                                        fill="#111"
                                        stroke="#111"
                                        strokeWidth="2"
                                    />
                                    {/* 鼻梁连接 */}
                                    <path
                                        d="M85 108 H 115"
                                        stroke="#111"
                                        strokeWidth="4"
                                    />
                                    {/* 镜腿 */}
                                    <path d="M45 108 L 25 100" stroke="#111" strokeWidth="4" />
                                    <path d="M155 108 L 175 100" stroke="#111" strokeWidth="4" />

                                    {/* 高光 */}
                                    <path d="M50 110 L 70 110" stroke="rgba(255,255,255,0.3)" strokeWidth="3" strokeLinecap="round" />
                                    <path d="M120 110 L 140 110" stroke="rgba(255,255,255,0.3)" strokeWidth="3" strokeLinecap="round" />
                                </g>
                                {/* 镜片反光 (更明显且加了动画) */}
                                <motion.g
                                    initial={{ opacity: 0.4 }}
                                    animate={{ opacity: [0.4, 0.7, 0.4] }}
                                    transition={{ duration: 3, repeat: Infinity }}
                                >
                                    <path d="M52 100 L 75 100" stroke="white" strokeWidth="3" pointerEvents="none" transform="rotate(-20 65 110)" />
                                    <path d="M122 100 L 145 100" stroke="white" strokeWidth="3" pointerEvents="none" transform="rotate(-20 135 110)" />
                                </motion.g>
                            </motion.g>
                        )}
                    </AnimatePresence>

                    {/* 装饰品槽位 (帽子等) */}
                    {(currentSkin.accessories || []).map((acc, i) => (
                        <image key={i} href={acc} x="50" y="-20" width="100" height="100" />
                    ))}
                </motion.g>
            </svg>
        </div>
    );
});
