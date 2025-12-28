import { motion } from 'framer-motion';
import { Sparkles, Brain } from 'lucide-react';

export function SessionLoading() {
    return (
        <div className="flex flex-col items-center justify-center h-full w-full bg-slate-950 text-white space-y-8">
            <div className="relative">
                {/* 外部光晕脉冲 */}
                <motion.div
                    animate={{
                        scale: [1, 1.5, 1],
                        opacity: [0.3, 0.1, 0.3]
                    }}
                    transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                    className="absolute inset-0 blur-3xl bg-indigo-500/20 rounded-full"
                />

                {/* 核心图标动画 */}
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.5 }}
                    className="relative z-10 p-6 bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-white/5 shadow-2xl ring-1 ring-white/10"
                >
                    <motion.div
                        animate={{
                            rotate: [0, 5, -5, 0],
                        }}
                        transition={{
                            duration: 4,
                            repeat: Infinity,
                            ease: "easeInOut"
                        }}
                    >
                        <Brain className="w-12 h-12 text-indigo-400" />
                    </motion.div>
                </motion.div>

                {/* 装饰粒子 */}
                <motion.div
                    animate={{
                        y: [-10, 10, -10],
                        opacity: [0.5, 1, 0.5]
                    }}
                    transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                    className="absolute -top-4 -right-4"
                >
                    <Sparkles className="w-6 h-6 text-yellow-200/50" />
                </motion.div>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="flex flex-col items-center space-y-2"
            >
                <h3 className="text-lg font-medium text-white/90">正在准备学习内容</h3>
                <p className="text-sm text-white/40">构建记忆神经链路...</p>
            </motion.div>
        </div>
    );
}
