import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

/**
 * @component LoadingSpinner (加载指示器)
 * @description 用于 React.lazy Suspense 回退的全屏加载组件
 * @context 路由级代码分割的加载状态
 */
export function LoadingSpinner() {
    return (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50">
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20"
            >
                <Loader2 className="w-10 h-10 text-white animate-spin" />
                <span className="text-white/70 text-sm font-medium">加载中...</span>
            </motion.div>
        </div>
    );
}
