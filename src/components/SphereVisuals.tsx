import { motion } from 'framer-motion';
import React from 'react';
import { type MascotReaction } from '@/components/InteractiveMascot';

interface SphereVisualsProps {
    reaction: MascotReaction;
    size?: number;
    eyePosition?: { x: number; y: number };
}

export const SphereVisuals = React.memo(({ reaction }: SphereVisualsProps) => {

    // 内部状态用于实现自主行为 (微表情系统)
    const [internalState, setInternalState] = React.useState<{
        blink: boolean;
        lookDir: { x: number, y: number }; // 0,0 is center
        expressionOverride: string | null; // 用于覆盖默认表情 (e.g., 'squint', 'wide', 'wink')
    }>({ blink: false, lookDir: { x: 0, y: 0 }, expressionOverride: null });

    // 自主行为循环 - High Agility & Variety (10+ Variations)
    React.useEffect(() => {
        if (reaction !== 'idle' && reaction !== 'happy' && reaction !== 'listening') {
            setInternalState({ blink: false, lookDir: { x: 0, y: 0 }, expressionOverride: null });
            return;
        }

        let isMounted = true;

        const loop = async () => {
            while (isMounted) {
                // 极短间隔: 0.5s - 2.5s (保持时刻活跃)
                const waitTime = 500 + Math.random() * 2000;
                await new Promise(r => setTimeout(r, waitTime));
                if (!isMounted) break;

                // 随机选择一种行为 (Behavior Probability Weights)
                const action = Math.random();

                // 1. 基础眼动 (40%) - 保持灵动
                if (action < 0.4) {
                    // Random Look (Glance)
                    const dirX = (Math.random() - 0.5) * 60; // Wide range
                    const dirY = (Math.random() - 0.5) * 30;
                    setInternalState(s => ({ ...s, lookDir: { x: dirX, y: dirY }, expressionOverride: null }));

                    await new Promise(r => setTimeout(r, 800 + Math.random() * 1000));
                    if (!isMounted) break;
                    setInternalState(s => ({ ...s, lookDir: { x: 0, y: 0 } })); // Return center
                }

                // 2. 连续扫视 (Active Scan) (20%) - 模拟观察环境
                else if (action < 0.6) {
                    const dirX1 = (Math.random() - 0.5) * 50;
                    setInternalState(s => ({ ...s, lookDir: { x: dirX1, y: 0 }, expressionOverride: 'wide' })); // 睁大眼看
                    await new Promise(r => setTimeout(r, 400));

                    const dirX2 = -dirX1; // Look opposite way instantly
                    setInternalState(s => ({ ...s, lookDir: { x: dirX2, y: 0 } }));
                    await new Promise(r => setTimeout(r, 600));

                    if (!isMounted) break;
                    setInternalState(s => ({ ...s, lookDir: { x: 0, y: 0 }, expressionOverride: null }));
                }

                // 3. 微表情展示 (Micro Expressions) (30%)
                else if (action < 0.9) {
                    const mood = Math.random();
                    if (mood < 0.2) {
                        // Suspicious / Focus (眯眼)
                        setInternalState(s => ({ ...s, expressionOverride: 'squint', lookDir: { x: 0, y: 0 } }));
                        await new Promise(r => setTimeout(r, 1500));
                    } else if (mood < 0.4) {
                        // Surprise (瞪大)
                        setInternalState(s => ({ ...s, expressionOverride: 'wide' }));
                        await new Promise(r => setTimeout(r, 800));
                    } else if (mood < 0.5) {
                        // Wink (眨单眼)
                        setInternalState(s => ({ ...s, expressionOverride: 'wink' }));
                        await new Promise(r => setTimeout(r, 600));
                    } else if (mood < 0.7) {
                        // Happy (短暂笑一下)
                        setInternalState(s => ({ ...s, expressionOverride: 'happy_micro' }));
                        await new Promise(r => setTimeout(r, 2000));
                    } else if (mood < 0.85) {
                        // Confused Tilt (歪头疑惑)
                        const tiltDir = Math.random() > 0.5 ? 20 : -20;
                        setInternalState(s => ({ ...s, expressionOverride: 'confused_micro', lookDir: { x: tiltDir, y: -5 } }));
                        await new Promise(r => setTimeout(r, 1500));
                    } else {
                        // Thinking (上撇)
                        setInternalState(s => ({ ...s, expressionOverride: 'thinking_micro', lookDir: { x: 10, y: -20 } }));
                        await new Promise(r => setTimeout(r, 2000));
                    }

                    if (!isMounted) break;
                    setInternalState(s => ({ ...s, expressionOverride: null, lookDir: { x: 0, y: 0 } }));
                }

                // 4. 眨眼 (Blink) (10%) - 穿插在其他动作之间
                else {
                    const blinkType = Math.random();
                    if (blinkType < 0.8) {
                        // Normal blink
                        setInternalState(s => ({ ...s, blink: true }));
                        await new Promise(r => setTimeout(r, 150));
                        setInternalState(s => ({ ...s, blink: false }));
                    } else {
                        // Hasty double blink
                        setInternalState(s => ({ ...s, blink: true }));
                        await new Promise(r => setTimeout(r, 100));
                        setInternalState(s => ({ ...s, blink: false }));
                        await new Promise(r => setTimeout(r, 80));
                        setInternalState(s => ({ ...s, blink: true }));
                        await new Promise(r => setTimeout(r, 100));
                        setInternalState(s => ({ ...s, blink: false }));
                    }
                }
            }
        };

        loop();
        return () => { isMounted = false; };
    }, [reaction]);

    // MSG Sphere 风格 + iPhone Emoji 表现力
    const eyeBaseRadius = 22; // 巨大的眼睛
    const leftEyeCx = 35;
    const rightEyeCx = 85;
    const eyeCy = 45;

    // 获取面部表情路径 (Data Driven)
    const getFacePath = () => {
        // 1. 基础配置 (Based on Reaction Prop)
        let eyelids = { left: 0, right: 0, angle: 0 };
        let eyebrows = { leftY: 0, rightY: 0, angle: 0, shape: 'none' };
        let pupilOffset = { x: 0, y: 0 };
        let mouthShape = "M 55 78 Q 60 80 65 78"; // 微笑小弧线

        // ... [Standard Logic for Props] ...
        switch (reaction) {
            case 'happy':
                eyelids = { left: 0.1, right: 0.1, angle: 0 };
                eyebrows = { leftY: -5, rightY: -5, angle: 0, shape: 'raised' };
                mouthShape = "M 45 70 Q 60 88 75 70";
                break;
            case 'sad':
                eyelids = { left: 0.3, right: 0.3, angle: -10 };
                eyebrows = { leftY: 0, rightY: 0, angle: -15, shape: 'flat' };
                mouthShape = "M 50 82 Q 60 75 70 82";
                pupilOffset = { x: 0, y: 6 };
                break;
            case 'surprised':
                // 😲 惊讶: 瞪大眼 + O型嘴
                eyelids = { left: 0, right: 0, angle: 0 };
                mouthShape = "M 58 78 A 8 8 0 1 1 58 77"; // Big O
                eyebrows = { leftY: -15, rightY: -15, angle: 0, shape: 'raised' };
                break;

            case 'love':
                // 😍 喜爱: 桃心眼 (模拟) + 微笑
                // Simple heart-ish shape for eyes context? Actually Sphere usually just does Happy eyes for love.
                // Let's make eyes big and happy, maybe pupils slightly bigger?
                eyelids = { left: 0.1, right: 0.1, angle: 0 };
                mouthShape = "M 45 70 Q 60 88 75 70"; // Big smile
                eyebrows = { leftY: -5, rightY: -5, angle: 0, shape: 'flat' };
                // We'll handle 'love' special pupil shape in rendering if possible, or just normal.
                break;

            case 'sleepy':
                // 😴 困倦: 几乎闭眼 + 小圆嘴
                eyelids = { left: 0.75, right: 0.75, angle: 0 };
                eyebrows = { leftY: 2, rightY: 2, angle: 0, shape: 'flat' };
                mouthShape = "M 58 80 A 4 4 0 1 1 58 79"; // O
                break;
            case 'poked':
                eyelids = { left: -0.1, right: -0.1, angle: 0 };
                eyebrows = { leftY: -10, rightY: -10, angle: 0, shape: 'raised' };
                mouthShape = "M 55 75 A 6 8 0 1 1 55 74";
                break;
            case 'combo':
                eyelids = { left: 0, right: 0, angle: 0 };
                eyebrows = { leftY: -5, rightY: -5, angle: 0, shape: 'raised' };
                mouthShape = "M 45 72 Q 60 85 75 72";
                break;
            case 'confused':
                eyelids = { left: 0.1, right: 0.6, angle: 0 };
                eyebrows = { leftY: -5, rightY: 2, angle: 10, shape: 'flat' };
                mouthShape = "M 50 78 L 60 76 L 70 78";
                pupilOffset = { x: 8, y: 0 };
                break;
            case 'thinking':
                eyelids = { left: 0.2, right: 0, angle: 0 };
                eyebrows = { leftY: 0, rightY: -8, angle: -5, shape: 'raised' };
                pupilOffset = { x: 6, y: -10 };
                mouthShape = "M 52 78 Q 60 75 68 78";
                break;
            case 'focused':
                eyelids = { left: 0.3, right: 0.3, angle: 15 };
                eyebrows = { leftY: 5, rightY: 5, angle: 20, shape: 'furrowed' };
                mouthShape = "M 50 80 L 70 80";
                break;
            case 'dizzy':
                return {
                    type: 'path',
                    leftEyePath: "M 20 35 L 50 60 M 50 35 L 20 60",
                    rightEyePath: "M 70 35 L 100 60 M 100 35 L 70 60",
                    pupilVisible: false,
                    mouth: "M 50 80 Q 60 70 70 80",
                    eyelids: { left: 0, right: 0, angle: 0 },
                    eyebrows: { leftY: 0, rightY: 0, angle: 0, shape: 'none' },
                    pupilOffset: { x: 0, y: 0 }
                };
            case 'shy':
            default: // idle
                // 😌 平和: 眉毛舒展
                eyebrows = { leftY: 0, rightY: 0, angle: 0, shape: 'flat' };
                break;
        }

        // 2. 自主微表情覆盖 (Micro-Expression Overrides)
        if (internalState.expressionOverride) {
            switch (internalState.expressionOverride) {
                case 'squint': // 眯眼观察
                    eyelids = { left: 0.4, right: 0.4, angle: 0 };
                    eyebrows = { leftY: 2, rightY: 2, angle: 0, shape: 'furrowed' };
                    mouthShape = "M 55 80 L 65 80"; // 直线嘴
                    break;
                case 'wide': // 瞪大惊讶
                    eyelids = { left: -0.15, right: -0.15, angle: 0 };
                    eyebrows = { leftY: -8, rightY: -8, angle: 0, shape: 'raised' };
                    mouthShape = "M 58 78 A 4 4 0 1 1 58 77"; // 小圆o
                    break;
                case 'wink': // 眨单眼 😉
                    eyelids = { left: 0, right: 0.9, angle: 0 };
                    eyebrows = { leftY: -2, rightY: 2, angle: 5, shape: 'flat' };
                    mouthShape = "M 50 78 Q 60 82 70 78"; // 歪嘴笑
                    break;
                case 'happy_micro': // 微笑
                    eyelids = { left: 0.1, right: 0.1, angle: 0 };
                    eyebrows = { leftY: -3, rightY: -3, angle: 0, shape: 'raised' };
                    mouthShape = "M 50 78 Q 60 85 70 78";
                    break;
                case 'confused_micro': // 歪头疑惑
                    eyelids = { left: 0, right: 0.3, angle: 5 };
                    eyebrows = { leftY: -4, rightY: 0, angle: 10, shape: 'flat' }; // 高低眉
                    mouthShape = "M 55 80 L 65 78"; // 撇嘴
                    break;
                case 'thinking_micro': // 思考
                    eyelids = { left: 0.2, right: 0.2, angle: 0 };
                    eyebrows = { leftY: -2, rightY: -2, angle: 0, shape: 'flat' };
                    mouthShape = "M 58 80 A 2 2 0 1 1 58 79";
                    break;
            }
        }

        // 3. 视线偏移应用
        if (internalState.lookDir.x !== 0 || internalState.lookDir.y !== 0) {
            pupilOffset = {
                x: internalState.lookDir.x * 0.15, // 瞳孔轻微移动，配合脸部转动
                y: internalState.lookDir.y * 0.15
            };
        }

        // 4. 眨眼系统 (最高优先级)
        if (internalState.blink) {
            eyelids = { left: 1, right: 1, angle: 0 };
        }

        return {
            type: (reaction as string) === 'dizzy' ? 'path' : 'geometric',
            eyelids,
            eyebrows,
            pupilOffset,
            mouth: mouthShape,
            // Dizzy specific paths fallback
            leftEyePath: "M 20 35 L 50 60 M 50 35 L 20 60",
            rightEyePath: "M 70 35 L 100 60 M 100 35 L 70 60",
        };
    };

    const faceData = getFacePath();

    // 计算面部旋转 (Head Rotation)
    // 根据 internalState.lookDir 计算旋转角度
    const faceRotateY = internalState.lookDir.x; // 左右看 = 绕Y轴旋转
    const faceRotateX = -internalState.lookDir.y; // 上下看 = 绕X轴反向旋转
    const faceTranslateX = internalState.lookDir.x * 0.5; // 稍微平移增加立体感

    // Generate unique ID for SVG scopes
    const uniqueId = React.useId().replace(/:/g, ''); // React.useId generates :r0:, remove colons for safe ID
    const leftEyeClipId = `leftEyeClip-${uniqueId}`;
    const rightEyeClipId = `rightEyeClip-${uniqueId}`;

    return (
        <div className="relative w-full h-full select-none" style={{ perspective: '800px' }}>
            {/* 容器阴影 */}
            <div className="absolute inset-0 rounded-full bg-yellow-500/30 blur-xl transform translate-y-4 scale-90 -z-10" />

            {/* 主球体 */}
            <motion.div
                className="w-full h-full rounded-full relative overflow-hidden"
                style={{
                    background: `radial-gradient(circle at 40% 30%, #FEF08A 0%, #FACC15 50%, #EAB308 100%)`,
                    boxShadow: `inset -5px -5px 20px rgba(161, 98, 7, 0.2)`
                }}
            >
                {/* 浮动动画 + 面部旋转(Head Movement) */}
                <motion.div
                    className="absolute inset-0 flex items-center justify-center"
                    animate={{
                        y: [0, -3, 0], // 呼吸浮动
                        rotateX: faceRotateX,
                        rotateY: faceRotateY,
                        x: faceTranslateX
                    }}
                    transition={{
                        y: { repeat: Infinity, duration: 4, ease: "easeInOut" },
                        rotateX: { type: "spring", stiffness: 60, damping: 15 },
                        rotateY: { type: "spring", stiffness: 60, damping: 15 },
                        x: { type: "spring", stiffness: 60, damping: 15 }
                    }}
                >
                    <svg viewBox="0 0 120 120" className="w-full h-full">
                        <defs>
                            <clipPath id={leftEyeClipId}><circle cx={leftEyeCx} cy={eyeCy} r={eyeBaseRadius} /></clipPath>
                            <clipPath id={rightEyeClipId}><circle cx={rightEyeCx} cy={eyeCy} r={eyeBaseRadius} /></clipPath>
                            <filter id="blushBlur"><feGaussianBlur in="SourceGraphic" stdDeviation="2" /></filter>
                        </defs>

                        {/* ================= 眉毛层 (Eyebrows) ================= */}
                        {faceData.eyebrows?.shape !== 'none' && (
                            <>
                                {/* 左眉毛 */}
                                <motion.path
                                    d={faceData.eyebrows?.shape === 'raised' ? `M ${leftEyeCx - 15} ${eyeCy - 28} Q ${leftEyeCx} ${eyeCy - 38} ${leftEyeCx + 15} ${eyeCy - 28}` :
                                        faceData.eyebrows?.shape === 'furrowed' ? `M ${leftEyeCx - 15} ${eyeCy - 30} Q ${leftEyeCx} ${eyeCy - 25} ${leftEyeCx + 15} ${eyeCy - 28}` :
                                            `M ${leftEyeCx - 12} ${eyeCy - 30} Q ${leftEyeCx} ${eyeCy - 32} ${leftEyeCx + 12} ${eyeCy - 30}` // flat
                                    }
                                    fill="transparent"
                                    stroke="#854d0e" // 深褐色眉毛，比黑色柔和
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    animate={{
                                        y: faceData.eyebrows?.leftY,
                                        rotate: faceData.eyebrows?.angle
                                    }}
                                />
                                {/* 右眉毛 */}
                                <motion.path
                                    d={faceData.eyebrows?.shape === 'raised' ? `M ${rightEyeCx - 15} ${eyeCy - 28} Q ${rightEyeCx} ${eyeCy - 38} ${rightEyeCx + 15} ${eyeCy - 28}` :
                                        faceData.eyebrows?.shape === 'furrowed' ? `M ${rightEyeCx - 15} ${eyeCy - 28} Q ${rightEyeCx} ${eyeCy - 25} ${rightEyeCx + 15} ${eyeCy - 30}` :
                                            `M ${rightEyeCx - 12} ${eyeCy - 30} Q ${rightEyeCx} ${eyeCy - 32} ${rightEyeCx + 12} ${eyeCy - 30}` // flat
                                    }
                                    fill="transparent"
                                    stroke="#854d0e"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    animate={{
                                        y: faceData.eyebrows?.rightY,
                                        rotate: -(faceData.eyebrows?.angle || 0)
                                    }}
                                />
                            </>
                        )}


                        {/* ================= 眼睛渲染 ================= */}
                        {faceData.type === 'path' ? (
                            <>
                                <motion.path d={faceData.leftEyePath} fill="transparent" stroke="#1f2937" strokeWidth="6" strokeLinecap="round" />
                                <motion.path d={faceData.rightEyePath} fill="transparent" stroke="#1f2937" strokeWidth="6" strokeLinecap="round" />
                            </>
                        ) : (
                            <>
                                {/* 眼白 */}
                                <circle cx={leftEyeCx} cy={eyeCy} r={eyeBaseRadius} fill="white" />
                                <circle cx={rightEyeCx} cy={eyeCy} r={eyeBaseRadius} fill="white" />

                                {/* 瞳孔 */}
                                {reaction === 'combo' ? (
                                    // 星星眼特殊瞳孔
                                    <>
                                        <text x={leftEyeCx} y={eyeCy + 5} fontSize="20" textAnchor="middle" fill="#fbbf24">⭐</text>
                                        <text x={rightEyeCx} y={eyeCy + 5} fontSize="20" textAnchor="middle" fill="#fbbf24">⭐</text>
                                    </>
                                ) : (
                                    <>
                                        <g clipPath={`url(#${leftEyeClipId})`}>
                                            <motion.circle
                                                cx={leftEyeCx} cy={eyeCy} r="7" fill="#1f2937"
                                                animate={{ x: faceData.pupilOffset?.x, y: faceData.pupilOffset?.y }}
                                                transition={{ type: "spring", stiffness: 150, damping: 15 }}
                                            />
                                        </g>
                                        <g clipPath={`url(#${rightEyeClipId})`}>
                                            <motion.circle
                                                cx={rightEyeCx} cy={eyeCy} r="7" fill="#1f2937"
                                                animate={{ x: faceData.pupilOffset?.x, y: faceData.pupilOffset?.y }}
                                                transition={{ type: "spring", stiffness: 150, damping: 15 }}
                                            />
                                        </g>
                                    </>
                                )}

                                {/* 眼皮遮罩 */}
                                <motion.rect
                                    x={leftEyeCx - eyeBaseRadius}
                                    y={eyeCy - eyeBaseRadius}
                                    width={eyeBaseRadius * 2}
                                    height={eyeBaseRadius * 2}
                                    fill="#FACC15"
                                    initial={{ scaleY: 0 }}
                                    animate={{
                                        scaleY: faceData.eyelids?.left,
                                        rotate: faceData.eyelids?.angle
                                    }}
                                    style={{ originY: 0 }} // 从上往下闭合
                                />
                                <motion.rect
                                    x={rightEyeCx - eyeBaseRadius}
                                    y={eyeCy - eyeBaseRadius}
                                    width={eyeBaseRadius * 2}
                                    height={eyeBaseRadius * 2}
                                    fill="#FACC15"
                                    initial={{ scaleY: 0 }}
                                    animate={{
                                        scaleY: faceData.eyelids?.right,
                                        rotate: -(faceData.eyebrows?.angle || 0) // 眼皮跟随眉毛角度略微倾斜
                                    }}
                                    style={{ originY: 0 }}
                                />

                                {/* 脸红 */}
                                {reaction === 'shy' && (
                                    <>
                                        <circle cx={leftEyeCx} cy={eyeCy + 25} r={8} fill="#FF6B6B" opacity="0.4" filter="url(#blushBlur)" />
                                        <circle cx={rightEyeCx} cy={eyeCy + 25} r={8} fill="#FF6B6B" opacity="0.4" filter="url(#blushBlur)" />
                                    </>
                                )}
                            </>
                        )}

                        {/* ================= 嘴巴 ================= */}
                        <motion.path
                            d={faceData.mouth}
                            fill="transparent"
                            stroke="#1f2937"
                            strokeWidth="4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            transition={{ type: "spring", stiffness: 200, damping: 20 }}
                        />
                    </svg>
                </motion.div>
            </motion.div>
        </div>
    );
});
