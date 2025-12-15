/**
 * @component 可爱登录/注册弹窗 V2 (AuthModal)
 * @description 具有 3D 黏土风吉祥物和高级液态玻璃 UI 的登录组件
 * @context 登录/注册流程
 * @author Trae-Architect
 */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Lock, LogIn, UserPlus, Loader2, AlertCircle, Eye, EyeOff, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthMascot, type MascotFrame } from './AuthMascot';

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
    const [showPassword, setShowPassword] = useState(false);

    const [mascotFrame, setMascotFrame] = useState<MascotFrame>('idle');
    const [lastInputFocus, setLastInputFocus] = useState<'email' | 'password' | null>(null);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) {
            setMascotFrame('idle');
            setLastInputFocus(null);
            setError(null);
            setSuccess(null);
        }
    }, [isOpen]);

    const handleEmailFocus = () => {
        setMascotFrame('watching');
        setLastInputFocus('email');
    };

    const handlePasswordFocus = () => {
        setMascotFrame(showPassword ? 'peeking' : 'hiding');
        setLastInputFocus('password');
    };

    const handleBlur = () => {
        setMascotFrame('idle');
        setLastInputFocus(null);
    };

    const togglePasswordVisibility = () => {
        setShowPassword(!showPassword);
        if (lastInputFocus === 'password') {
            setMascotFrame(!showPassword ? 'peeking' : 'hiding');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);

        if (!email || !password) {
            setError('记得填写邮箱和密码哦~');
            setMascotFrame('error');
            return;
        }

        if (mode === 'register' && password !== confirmPassword) {
            setError('两次密码要在心里记清楚哦，输入不一样啦');
            setMascotFrame('error');
            return;
        }

        if (password.length < 6) {
            setError('密码太短啦，至少要6位才安全');
            setMascotFrame('error');
            return;
        }

        setIsLoading(true);

        try {
            if (mode === 'login') {
                const { error } = await signIn(email, password);
                if (error) {
                    setError(error.message);
                    setMascotFrame('error');
                } else {
                    setMascotFrame('success');
                    setTimeout(onClose, 1500);
                }
            } else {
                const { error } = await signUp(email, password);
                if (error) {
                    setError(error.message);
                    setMascotFrame('error');
                } else {
                    setSuccess('注册成功啦！去邮箱确认一下吧~');
                    setMascotFrame('success');
                    setMode('login');
                }
            }
        } catch (err) {
            setError('哎呀，出了点小问题，重试一下？');
            setMascotFrame('error');
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
        setMascotFrame('idle');
    };

    const toggleMode = () => {
        setMode(mode === 'login' ? 'register' : 'login');
        resetForm();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* 背景遮罩 - 增加模糊和噪点 */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-md z-0"
                        onClick={onClose}
                    />

                    {/* 3D 浮动背景光球 */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute z-0 w-[500px] h-[500px] bg-gradient-to-tr from-purple-400 to-pink-300 rounded-full blur-[100px] opacity-30 animate-pulse-slow top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                    />

                    {/* 弹窗主体 */}
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 30 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 30 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="relative z-10 w-full max-w-[380px]"
                    >
                        {/* 吉祥物占位 - 放在卡片后面但露出来 */}
                        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-full flex justify-center z-20 pointer-events-none">
                            <AuthMascot frame={mascotFrame} />
                        </div>

                        {/* 卡片容器 - 极致的磨砂玻璃 */}
                        <div className="
                            relative bg-white/70 dark:bg-slate-900/60 
                            backdrop-blur-xl saturate-150
                            rounded-[40px] shadow-2xl 
                            border border-white/40 dark:border-white/10
                            overflow-visible
                        ">
                            {/* 顶部高光条 (Glass Shine) */}
                            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-70" />

                            {/* 关闭按钮 */}
                            <button
                                onClick={onClose}
                                className="absolute top-6 right-6 p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors z-30"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            {/* 内容区域 */}
                            <div className="pt-24 pb-10 px-8">
                                <div className="text-center mb-8 relative">
                                    <motion.div
                                        key={mode}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="inline-block"
                                    >
                                        <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-br from-slate-700 to-slate-500 dark:from-white dark:to-slate-300 drop-shadow-sm">
                                            {mode === 'login' ? 'Welcome Back!' : 'Join Us!'}
                                        </h2>
                                    </motion.div>
                                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 font-medium">
                                        {mode === 'login' ? '准备好继续探索了吗？' : '开启你的奇妙之旅'}
                                    </p>

                                    {/* 装饰星星 */}
                                    <Sparkles className="absolute -top-8 -right-4 w-6 h-6 text-yellow-400 animate-pulse" />
                                </div>

                                <form onSubmit={handleSubmit} className="space-y-5">
                                    {/* 邮箱输入 */}
                                    <div className="group relative transition-transform duration-300 focus-within:scale-[1.02]">
                                        <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                                            <Mail className="w-5 h-5 text-slate-400 group-focus-within:text-pink-500 transition-colors" />
                                        </div>
                                        <input
                                            type="email"
                                            placeholder="电子邮箱"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            onFocus={handleEmailFocus}
                                            onBlur={handleBlur}
                                            className="w-full bg-white/50 dark:bg-slate-800/50 border-2 border-transparent focus:border-pink-300/50 rounded-2xl pl-12 pr-4 py-4 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none transition-all shadow-sm focus:shadow-lg focus:shadow-pink-500/10 hover:bg-white/80 dark:hover:bg-slate-800/80"
                                            autoComplete="email"
                                        />
                                    </div>

                                    {/* 密码输入 */}
                                    <div className="group relative transition-transform duration-300 focus-within:scale-[1.02]">
                                        <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                                            <Lock className="w-5 h-5 text-slate-400 group-focus-within:text-violet-500 transition-colors" />
                                        </div>
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            placeholder="密码"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            onFocus={handlePasswordFocus}
                                            onBlur={handleBlur}
                                            className="w-full bg-white/50 dark:bg-slate-800/50 border-2 border-transparent focus:border-violet-300/50 rounded-2xl pl-12 pr-12 py-4 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none transition-all shadow-sm focus:shadow-lg focus:shadow-violet-500/10 hover:bg-white/80 dark:hover:bg-slate-800/80"
                                            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                                        />
                                        <button
                                            type="button"
                                            onClick={togglePasswordVisibility}
                                            className="absolute inset-y-0 right-5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                                        >
                                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                        </button>
                                    </div>

                                    {/* 确认密码 (仅注册) */}
                                    <AnimatePresence>
                                        {mode === 'register' && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                                                animate={{ opacity: 1, height: 'auto', marginTop: 20 }}
                                                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                                                className="group relative overflow-hidden transition-transform duration-300 focus-within:scale-[1.02]"
                                            >
                                                <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                                                    <Lock className="w-5 h-5 text-slate-400 group-focus-within:text-violet-500 transition-colors" />
                                                </div>
                                                <input
                                                    type={showPassword ? "text" : "password"}
                                                    placeholder="确认密码"
                                                    value={confirmPassword}
                                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                                    onFocus={handlePasswordFocus}
                                                    onBlur={handleBlur}
                                                    className="w-full bg-white/50 dark:bg-slate-800/50 border-2 border-transparent focus:border-violet-300/50 rounded-2xl pl-12 pr-12 py-4 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none transition-all shadow-sm focus:shadow-lg focus:shadow-violet-500/10 hover:bg-white/80 dark:hover:bg-slate-800/80"
                                                    autoComplete="new-password"
                                                />
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* 错误提示 */}
                                    <AnimatePresence>
                                        {error && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -10, height: 0 }}
                                                animate={{ opacity: 1, y: 0, height: 'auto' }}
                                                exit={{ opacity: 0, y: -10, height: 0 }}
                                            >
                                                <div className="flex items-center gap-2 text-red-500 bg-red-50/80 dark:bg-red-900/30 border border-red-100 dark:border-red-800/30 rounded-xl px-4 py-3 text-sm font-medium backdrop-blur-sm">
                                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                                    <span>{error}</span>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* 成功提示 */}
                                    <AnimatePresence>
                                        {success && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -10, height: 0 }}
                                                animate={{ opacity: 1, y: 0, height: 'auto' }}
                                                exit={{ opacity: 0, y: -10, height: 0 }}
                                            >
                                                <div className="flex items-center gap-2 text-green-600 bg-green-50/80 dark:bg-green-900/30 border border-green-100 dark:border-green-800/30 rounded-xl px-4 py-3 text-sm font-medium backdrop-blur-sm">
                                                    <span>{success}</span>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* 提交按钮 - 果冻质感升级 */}
                                    <motion.button
                                        type="submit"
                                        disabled={isLoading}
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        className="
                                            w-full py-4 mt-6 rounded-2xl 
                                            bg-gradient-to-r from-[#FF9A9E] via-[#FECFEF] to-[#FECFEF]
                                            hover:from-[#FF8FAB] hover:to-[#FECFEF]
                                            text-slate-700 font-bold text-lg
                                            shadow-lg shadow-pink-500/20 
                                            transition-all 
                                            disabled:opacity-50 disabled:cursor-not-allowed 
                                            flex items-center justify-center gap-2 
                                            group relative overflow-hidden
                                        "
                                    >
                                        {/* 内部高光闪光 */}
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent translate-x-[-150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out pointer-events-none" />

                                        {isLoading ? (
                                            <Loader2 className="w-6 h-6 animate-spin text-slate-600" />
                                        ) : mode === 'login' ? (
                                            <>
                                                <LogIn className="w-5 h-5 text-slate-600" />
                                                <span className="bg-gradient-to-r from-slate-700 to-slate-500 bg-clip-text text-transparent">立即登录</span>
                                            </>
                                        ) : (
                                            <>
                                                <UserPlus className="w-5 h-5 text-slate-600" />
                                                <span className="bg-gradient-to-r from-slate-700 to-slate-500 bg-clip-text text-transparent">创建账号</span>
                                            </>
                                        )}
                                    </motion.button>
                                </form>

                                {/* 切换登录/注册 */}
                                <div className="mt-8 text-center">
                                    <button
                                        onClick={toggleMode}
                                        className="
                                            text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 
                                            text-sm font-medium transition-colors 
                                            hover:underline decoration-2 underline-offset-4
                                        "
                                    >
                                        {mode === 'login' ? '还没有账号？ 去注册' : '已有账号？ 去登录'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
