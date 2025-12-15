/**
 * @component 交互式3D吉祥物 (InteractiveMascot)
 * @description 具备鼠标跟随眼动效果和丰富情绪反馈动画的悬浮助手图标
 * @author Trae-Architect
 */
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { useEffect, useState, useRef } from 'react';

// 扩展情绪类型
export type MascotReaction = 'idle' | 'happy' | 'thinking' | 'sleepy' | 'sad' | 'combo' | 'shy' | 'poked';

interface InteractiveMascotProps {
    reaction?: MascotReaction;
    size?: number;
    className?: string;
    onPoke?: () => void; // 戳一戳回调
    isHovered?: boolean; // 悬停状态
}

export function InteractiveMascot({
    reaction = 'idle',
    size = 64,
    className,
    onPoke,
    isHovered = false
}: InteractiveMascotProps) {
    const [eyePosition, setEyePosition] = useState({ x: 0, y: 0 });
    const mascotRef = useRef<HTMLDivElement>(null);
    const [internalReaction, setInternalReaction] = useState<MascotReaction>(reaction);

    // 同步外部 reaction
    useEffect(() => {
        setInternalReaction(reaction);
    }, [reaction]);

    // 悬停时变害羞
    useEffect(() => {
        if (isHovered && reaction === 'idle') {
            setInternalReaction('shy');
        } else if (!isHovered && internalReaction === 'shy') {
            setInternalReaction('idle');
        }
    }, [isHovered, reaction]);

    // 鼠标眼动追踪逻辑
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
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
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

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
        }
    };

    // 气泡文字映射
    const bubbleTextMap: Record<MascotReaction, string[]> = {
        idle: [],
        happy: ["Good!", "Great!", "Nice!", "Cool!", "Wow!"],
        sad: ["没关系~", "再来!", "加油!"],
        combo: ["连击!", "太棒了!", "🔥 火力全开!"],
        sleepy: ["Zzz...", "💤"],
        shy: ["嘿嘿~", "😊"],
        poked: ["哎呀!", "嘻嘻~", "别戳啦!"],
        thinking: ["嗯..."]
    };

    const [bubbleText, setBubbleText] = useState("");
    const showBubble = ['happy', 'sad', 'combo', 'sleepy', 'shy', 'poked'].includes(internalReaction);

    useEffect(() => {
        const texts = bubbleTextMap[internalReaction] || [];
        if (texts.length > 0) {
            setBubbleText(texts[Math.floor(Math.random() * texts.length)]);
        }
    }, [internalReaction]);

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
            {/* 气泡对话框 */}
            <AnimatePresence>
                {showBubble && (
                    <motion.div
                        key="bubble"
                        className="absolute -top-14 -right-6 z-50 pointer-events-none"
                        initial={{ opacity: 0, scale: 0.3, y: 15, rotate: -15 }}
                        animate={{ opacity: 1, scale: 1, y: 0, rotate: 0 }}
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
                        {[...Array(5)].map((_, i) => (
                            <motion.div
                                key={`star-${i}`}
                                className="absolute text-xl pointer-events-none"
                                style={{
                                    top: `${20 + Math.random() * 30}%`,
                                    left: `${10 + Math.random() * 80}%`
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

            <svg
                viewBox="0 0 200 200"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-full h-full filter drop-shadow-lg"
            >
                <defs>
                    <radialGradient id="mascotSkinGradient" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(70 60) rotate(50) scale(160)">
                        <stop offset="0%" stopColor="#FFE5F1" />
                        <stop offset="40%" stopColor="#FFC2D4" />
                        <stop offset="100%" stopColor="#FF9EBB" />
                    </radialGradient>
                    <filter id="mascotSoftShadow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur in="SourceAlpha" stdDeviation="2" />
                        <feOffset dx="1" dy="2" result="shadow" />
                        <feComposite in2="shadow" operator="in" result="shadow" />
                        <feColorMatrix type="matrix" values="0 0 0 0 0.6  0 0 0 0 0.2  0 0 0 0 0.3  0 0 0 0.3 0" />
                        <feBlend mode="normal" in="SourceGraphic" />
                    </filter>
                </defs>

                {/* 身体 */}
                <motion.g
                    initial="idle"
                    animate={internalReaction}
                    variants={bodyVariants}
                >
                    <path
                        d="M100 25C50 25 15 65 15 120C15 170 55 195 100 195C145 195 185 170 185 120C185 65 150 25 100 25Z"
                        fill="url(#mascotSkinGradient)"
                        filter="url(#mascotSoftShadow)"
                    />
                    <path
                        d="M100 30C60 30 30 60 25 100"
                        stroke="white"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeOpacity="0.6"
                        fill="none"
                    />

                    {/* 腮红 (害羞时更红) */}
                    <motion.g
                        animate={{ opacity: internalReaction === 'shy' ? 0.9 : 0.6 }}
                        transition={{ duration: 0.3 }}
                    >
                        <circle cx="45" cy="135" r="12" fill="#FF8BA7" filter="blur(3px)" />
                        <circle cx="155" cy="135" r="12" fill="#FF8BA7" filter="blur(3px)" />
                    </motion.g>

                    {/* 面部表情 */}
                    <g transform="translate(0, 10)">
                        {/* 眼睛组 */}
                        <g>
                            <motion.g animate={{ x: eyePosition.x, y: eyePosition.y }}>
                                <motion.ellipse
                                    cx="65" cy="110" rx="10" ry="12" fill="#2D2D2D"
                                    animate={getEyeAnimation()}
                                />
                                <motion.circle
                                    cx="68" cy="107" r="3" fill="white"
                                    animate={{
                                        opacity: ['happy', 'sleepy', 'sad', 'combo'].includes(internalReaction) ? 0 : 1
                                    }}
                                />
                            </motion.g>
                            <motion.g animate={{ x: eyePosition.x, y: eyePosition.y }}>
                                <motion.ellipse
                                    cx="135" cy="110" rx="10" ry="12" fill="#2D2D2D"
                                    animate={getEyeAnimation()}
                                />
                                <motion.circle
                                    cx="138" cy="107" r="3" fill="white"
                                    animate={{
                                        opacity: ['happy', 'sleepy', 'sad', 'combo'].includes(internalReaction) ? 0 : 1
                                    }}
                                />
                            </motion.g>
                        </g>

                        {/* 嘴巴 */}
                        <motion.path
                            stroke="#2D2D2D"
                            strokeWidth="4"
                            strokeLinecap="round"
                            fill="transparent"
                            animate={{ d: getMouthPath() }}
                            transition={{ duration: 0.3 }}
                        />
                    </g>
                </motion.g>
            </svg>
        </div>
    );
}
