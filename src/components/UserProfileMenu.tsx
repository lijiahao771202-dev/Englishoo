import { useState, useRef, useEffect } from 'react';
import { LogOut, Settings, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { UserProfileSettingsModal } from './UserProfileSettingsModal';
import { useUserProfile, AVATARS } from '@/hooks/useUserProfile';

export function UserProfileMenu({ onOpenGlobalSettings }: { onOpenGlobalSettings?: () => void }) {
    const { user, signOut } = useAuth();
    const { profile } = useUserProfile(user?.email); // Hook handles undefined check gracefully
    const [isOpen, setIsOpen] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (!user) {
        return null;
    }

    const currentAvatar = AVATARS.find(a => a.id === profile.avatarId) || AVATARS[0];

    return (
        <div className="relative" ref={menuRef}>
            {/* Trigger Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`
                    flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full 
                    border transition-all duration-200
                    ${isOpen
                        ? 'bg-white/20 border-white/30 shadow-lg shadow-blue-500/10'
                        : 'bg-white/10 border-white/10 hover:bg-white/15'
                    }
                    backdrop-blur-md
                `}
            >
                <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${currentAvatar.bg} flex items-center justify-center text-white text-sm shadow-inner`}>
                    {currentAvatar.emoji}
                </div>
                <div className="flex flex-col items-start sr-only sm:not-sr-only">
                    <span className="text-xs font-medium text-white max-w-[80px] truncate">{profile.nickname}</span>
                </div>
                <ChevronDown className={`w-3 h-3 text-white/50 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-full mt-2 w-56 bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden origin-top-right z-50 p-2"
                    >
                        {/* User Info Section */}
                        <div className="px-3 py-3 border-b border-white/5 mb-1 flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${currentAvatar.bg} flex items-center justify-center text-lg shadow-inner shrink-0`}>
                                {currentAvatar.emoji}
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-white truncate">{profile.nickname}</p>
                                <p className="text-xs text-white/40 truncate">{user.email}</p>
                            </div>
                        </div>

                        {/* Menu Items */}
                        <div className="space-y-1 mt-1">
                            {onOpenGlobalSettings && (
                                <button
                                    onClick={() => {
                                        setIsOpen(false);
                                        onOpenGlobalSettings();
                                    }}
                                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/10 text-sm text-white/80 hover:text-white transition-colors text-left group"
                                >
                                    <div className="p-1.5 rounded-lg bg-emerald-500/10 group-hover:bg-emerald-500/20 text-emerald-400 group-hover:text-emerald-300 transition-colors">
                                        <Settings className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1">全局设置</div>
                                </button>
                            )}

                            <button
                                onClick={() => {
                                    setIsOpen(false);
                                    setShowProfileModal(true);
                                }}
                                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/10 text-sm text-white/80 hover:text-white transition-colors text-left group"
                            >
                                <div className="p-1.5 rounded-lg bg-blue-500/10 group-hover:bg-blue-500/20 text-blue-400 group-hover:text-blue-300 transition-colors">
                                    <Settings className="w-4 h-4" />
                                </div>
                                <div className="flex-1">个人中心</div>
                            </button>

                            <button
                                onClick={() => {
                                    setIsOpen(false);
                                    signOut();
                                }}
                                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-red-500/10 text-sm text-white/80 hover:text-red-300 transition-colors text-left group"
                            >
                                <div className="p-1.5 rounded-lg bg-red-500/5 group-hover:bg-red-500/20 text-red-500/70 group-hover:text-red-400 transition-colors">
                                    <LogOut className="w-4 h-4" />
                                </div>
                                <div>退出登录</div>
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Profile Settings Modal */}
            <UserProfileSettingsModal
                isOpen={showProfileModal}
                onClose={() => setShowProfileModal(false)}
                userEmail={user.email || ''}
            />
        </div>
    );
}

