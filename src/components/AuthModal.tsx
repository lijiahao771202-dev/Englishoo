/**
 * @component 登录/注册弹窗 (AuthModal)
 * @description 用户认证界面，支持邮箱登录和注册
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Lock, LogIn, UserPlus, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
    const { signIn, signUp } = useAuth();
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);

        if (!email || !password) {
            setError('请填写邮箱和密码');
            return;
        }

        if (mode === 'register' && password !== confirmPassword) {
            setError('两次密码输入不一致');
            return;
        }

        if (password.length < 6) {
            setError('密码至少需要6位');
            return;
        }

        setIsLoading(true);

        try {
            if (mode === 'login') {
                const { error } = await signIn(email, password);
                if (error) {
                    setError(error.message);
                } else {
                    onClose();
                }
            } else {
                const { error } = await signUp(email, password);
                if (error) {
                    setError(error.message);
                } else {
                    setSuccess('注册成功！请检查邮箱完成验证。');
                    setMode('login');
                }
            }
        } catch (err) {
            setError('操作失败，请重试');
        } finally {
            setIsLoading(false);
        }
    };

    const resetForm = () => {
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setError(null);
        setSuccess(null);
    };

    const toggleMode = () => {
        setMode(mode === 'login' ? 'register' : 'login');
        resetForm();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* 背景遮罩 */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    {/* 弹窗内容 */}
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        className="relative w-full max-w-md bg-slate-900/95 border border-white/10 rounded-3xl p-8 shadow-2xl backdrop-blur-xl overflow-hidden"
                    >
                        {/* 装饰背景 */}
                        <div className="absolute -top-20 -right-20 w-60 h-60 bg-blue-500/20 blur-3xl rounded-full pointer-events-none" />
                        <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-purple-500/20 blur-3xl rounded-full pointer-events-none" />

                        {/* 关闭按钮 */}
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors z-10"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        {/* 内容区域 */}
                        <div className="relative z-10">
                            <h2 className="text-2xl font-bold text-white mb-2">
                                {mode === 'login' ? '欢迎回来' : '创建账户'}
                            </h2>
                            <p className="text-white/50 text-sm mb-8">
                                {mode === 'login'
                                    ? '登录以同步您的学习进度'
                                    : '注册后即可跨设备同步学习数据'}
                            </p>

                            <form onSubmit={handleSubmit} className="space-y-4">
                                {/* 邮箱输入 */}
                                <div className="relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                                    <input
                                        type="email"
                                        placeholder="邮箱地址"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-white/20"
                                        autoComplete="email"
                                    />
                                </div>

                                {/* 密码输入 */}
                                <div className="relative">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                                    <input
                                        type="password"
                                        placeholder="密码"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-white/20"
                                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                                    />
                                </div>

                                {/* 确认密码 (仅注册) */}
                                {mode === 'register' && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="relative"
                                    >
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                                        <input
                                            type="password"
                                            placeholder="确认密码"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-white/20"
                                            autoComplete="new-password"
                                        />
                                    </motion.div>
                                )}

                                {/* 错误提示 */}
                                {error && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3"
                                    >
                                        <AlertCircle className="w-4 h-4 shrink-0" />
                                        <span>{error}</span>
                                    </motion.div>
                                )}

                                {/* 成功提示 */}
                                {success && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="text-green-400 text-sm bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3"
                                    >
                                        {success}
                                    </motion.div>
                                )}

                                {/* 提交按钮 */}
                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-600 to-blue-400 hover:from-blue-500 hover:to-blue-300 text-white font-bold shadow-lg shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isLoading ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : mode === 'login' ? (
                                        <>
                                            <LogIn className="w-5 h-5" />
                                            登录
                                        </>
                                    ) : (
                                        <>
                                            <UserPlus className="w-5 h-5" />
                                            注册
                                        </>
                                    )}
                                </button>
                            </form>

                            {/* 切换登录/注册 */}
                            <div className="mt-6 text-center text-sm text-write/50">
                                <span className="text-white/40">
                                    {mode === 'login' ? '还没有账户？' : '已有账户？'}
                                </span>
                                <button
                                    onClick={toggleMode}
                                    className="ml-2 text-blue-400 hover:text-blue-300 font-medium transition-colors"
                                >
                                    {mode === 'login' ? '立即注册' : '立即登录'}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
