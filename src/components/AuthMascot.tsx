/**
 * @component 3D 可爱吉祥物 (AuthMascot V4)
 * @description 简化交互：移除捂脸动作，输入密码时直接闭眼
 * @author Trae-Architect
 */
import { motion } from 'framer-motion';

export type MascotFrame = 'idle' | 'watching' | 'peeking' | 'hiding' | 'success' | 'error';

interface AuthMascotProps {
    frame: MascotFrame;
}

export function AuthMascot({ frame }: AuthMascotProps) {
    return (
        <div className="relative w-48 h-48 mx-auto filter drop-shadow-2xl">
            <svg
                viewBox="0 0 200 200"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-full h-full"
            >
                <defs>
                    {/* 皮肤渐变：模拟球体光照 */}
                    <radialGradient id="skinGradient" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(70 60) rotate(50) scale(160)">
                        <stop offset="0%" stopColor="#FFE5F1" /> {/* 高光 */}
                        <stop offset="40%" stopColor="#FFC2D4" /> {/* 中间色 */}
                        <stop offset="100%" stopColor="#FF9EBB" /> {/* 阴影 */}
                    </radialGradient>

                    {/* 阴影滤镜 */}
                    <filter id="softShadow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur in="SourceAlpha" stdDeviation="4" />
                        <feOffset dx="2" dy="4" result="shadow" />
                        <feComposite in2="shadow" operator="in" result="shadow" />
                        <feColorMatrix type="matrix" values="0 0 0 0 0.6  0 0 0 0 0.2  0 0 0 0 0.3  0 0 0 0.3 0" />
                        <feBlend mode="normal" in="SourceGraphic" />
                    </filter>
                </defs>

                {/* 身体 (Body) */}
                <motion.g
                    initial={false}
                    animate={
                        frame === 'success' ? { y: [0, -15, 0], scaleY: [1, 1.05, 1] } :
                            frame === 'error' ? { x: [-8, 8, -8, 8, 0], rotate: [-2, 2, -2, 2, 0] } :
                                { y: [0, -3, 0] }
                    }
                    transition={
                        frame === 'idle' ? { duration: 3, repeat: Infinity, ease: "easeInOut" } :
                            { duration: 0.5 }
                    }
                >
                    <path
                        d="M100 25C50 25 15 65 15 120C15 170 55 195 100 195C145 195 185 170 185 120C185 65 150 25 100 25Z"
                        fill="url(#skinGradient)"
                        filter="url(#softShadow)"
                    />

                    {/* 顶部高光 (Rim Light) */}
                    <path
                        d="M100 30C60 30 30 60 25 100"
                        stroke="white"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeOpacity="0.5"
                        fill="none"
                        filter="blur(2px)"
                    />

                    {/* 腮红 */}
                    <g>
                        <circle cx="45" cy="135" r="14" fill="#FF8BA7" opacity="0.4" filter="blur(4px)" />
                        <circle cx="155" cy="135" r="14" fill="#FF8BA7" opacity="0.4" filter="blur(4px)" />
                    </g>

                    {/* 面部表情 */}
                    <g transform="translate(0, 10)">
                        {/* 眼睛组 */}
                        <g>
                            {/* 左眼 */}
                            <motion.g animate={frame === 'watching' ? { y: 8, x: -2 } : frame === 'peeking' ? { y: 5 } : { x: 0, y: 0 }}>
                                <motion.ellipse
                                    cx="65" cy="110" rx="12" ry="14" fill="#2D2D2D"
                                    animate={
                                        frame === 'hiding' ? { scaleY: 0.1, cy: 115 } : // 闭眼 (Hiding)
                                            frame === 'peeking' ? { scaleY: 1, cy: 115 } : // 睁眼 (Peeking)
                                                frame === 'success' ? { scaleY: 0.2, y: -2 } : // 笑眼
                                                    frame === 'error' ? { rotate: -15, scaleY: 0.8 } :
                                                        { scaleY: 1, rotate: 0 }
                                    }
                                />
                                {/* 眼神光 (闭眼时消失) */}
                                <motion.circle
                                    cx="69" cy="106" r="4" fill="white"
                                    animate={frame === 'hiding' || frame === 'success' ? { opacity: 0 } : { opacity: 1 }}
                                />
                            </motion.g>

                            {/* 右眼 */}
                            <motion.g animate={frame === 'watching' ? { y: 8, x: -2 } : frame === 'peeking' ? { y: 5 } : { x: 0, y: 0 }}>
                                <motion.ellipse
                                    cx="135" cy="110" rx="12" ry="14" fill="#2D2D2D"
                                    animate={
                                        frame === 'hiding' ? { scaleY: 0.1, cy: 115 } : // 闭眼
                                            frame === 'peeking' ? { scaleY: 1, cy: 115 } : // 睁眼
                                                frame === 'success' ? { scaleY: 0.2, y: -2 } : // 笑眼
                                                    frame === 'error' ? { rotate: 15, scaleY: 0.8 } :
                                                        { scaleY: 1, rotate: 0 }
                                    }
                                />
                                <motion.circle
                                    cx="139" cy="106" r="4" fill="white"
                                    animate={frame === 'hiding' || frame === 'success' ? { opacity: 0 } : { opacity: 1 }}
                                />
                            </motion.g>
                        </g>

                        {/* 嘴巴 */}
                        <motion.path
                            stroke="#2D2D2D"
                            strokeWidth="5"
                            strokeLinecap="round"
                            fill="transparent"
                            animate={
                                frame === 'success' ? { d: "M75 145 Q100 165 125 145", strokeWidth: 6 } :
                                    frame === 'hiding' ? { d: "M90 150 Q100 148 110 150", strokeWidth: 4 } : // 闭眼时抿嘴
                                        frame === 'peeking' ? { d: "M92 152 Q100 155 108 152" } : // 偷看时微张
                                            frame === 'error' ? { d: "M85 155 Q100 135 115 155" } :
                                                frame === 'watching' ? { d: "M92 150 Q100 152 108 150" } :
                                                    { d: "M90 148 Q100 155 110 148" }
                            }
                        />
                    </g>
                </motion.g>

                {/* 手部 (Hands) - 已移除，响应用户需求 */}
            </svg>
        </div>
    );
}
