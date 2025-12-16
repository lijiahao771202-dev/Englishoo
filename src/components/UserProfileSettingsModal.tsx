import { useState, useEffect } from 'react';
import { X, Save, User, Award, Clock, BookOpen, Flame, Camera, ChevronRight } from 'lucide-react';
import { useUserProfile, AVATARS } from '@/hooks/useUserProfile';
import { getAllLogs, getAllCards } from '@/lib/data-source';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface UserProfileSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    userEmail: string;
}

export function UserProfileSettingsModal({ isOpen, onClose, userEmail }: UserProfileSettingsModalProps) {
    const { profile, updateProfile } = useUserProfile(userEmail);
    const [editNickname, setEditNickname] = useState(profile.nickname);
    const [editProfession, setEditProfession] = useState(profile.profession || '');
    const [editHobbies, setEditHobbies] = useState(profile.hobbies || '');
    const [selectedAvatar, setSelectedAvatar] = useState(profile.avatarId);

    // Stats State
    const [stats, setStats] = useState({
        totalCards: 0,
        streak: 0,
        totalLearned: 0,
        joinDays: 1
    });

    // Reset local state when opening
    useEffect(() => {
        if (isOpen) {
            setEditNickname(profile.nickname);
            setEditProfession(profile.profession || '');
            setEditHobbies(profile.hobbies || '');
            setSelectedAvatar(profile.avatarId);
            loadStats();
        }
    }, [isOpen, profile]);

    const loadStats = async () => {
        try {
            const cards = await getAllCards();
            const logs = await getAllLogs();

            // Simple Streak Calc (Same as DeckList logic ideally, simplified here)
            const uniqueDays = new Set(logs.map((log: any) => new Date(log.review).toDateString()));
            let streak = 0;
            let checkDate = new Date();
            // Check today/yesterday for continuity
            if (!uniqueDays.has(checkDate.toDateString())) {
                checkDate.setDate(checkDate.getDate() - 1);
                if (!uniqueDays.has(checkDate.toDateString())) {
                    checkDate = null as any;
                }
            }
            if (checkDate) {
                while (uniqueDays.has(checkDate.toDateString())) {
                    streak++;
                    checkDate.setDate(checkDate.getDate() - 1);
                }
            }

            setStats({
                totalCards: cards.length,
                totalLearned: cards.filter(c => c.state !== 0).length,
                streak,
                joinDays: Math.floor((Date.now() - 1700000000000) / (1000 * 60 * 60 * 24)) // Mock join date or use real if available
            });
        } catch (e) {
            console.error("Failed to load stats", e);
        }
    };

    const handleSave = () => {
        updateProfile({
            nickname: editNickname,
            profession: editProfession,
            hobbies: editHobbies,
            avatarId: selectedAvatar
        });
        onClose();
    };

    if (!isOpen) return null;

    const currentAvatar = AVATARS.find(a => a.id === selectedAvatar) || AVATARS[0];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="w-full max-w-2xl bg-slate-900/95 border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Left Panel: Identity Card (Glassmorphism) */}
                <div className="w-full md:w-2/5 relative overflow-hidden p-8 flex flex-col items-center justify-center text-center border-b md:border-b-0 md:border-r border-white/10">
                    {/* Dynamic Background based on Avatar */}
                    <div className={`absolute inset-0 bg-gradient-to-br ${currentAvatar.bg} opacity-20`} />
                    <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20" />

                    <div className="relative z-10 flex flex-col items-center">
                        <div className={`w-32 h-32 rounded-full bg-gradient-to-br ${currentAvatar.bg} p-1 mb-4 shadow-2xl`}>
                            <div className="w-full h-full rounded-full bg-slate-900/50 backdrop-blur-sm flex items-center justify-center text-6xl shadow-inner border border-white/10">
                                {currentAvatar.emoji}
                            </div>
                        </div>

                        <h2 className="text-2xl font-bold text-white mb-1">{editNickname}</h2>
                        <div className="text-white/40 text-sm flex items-center gap-1 mb-6">
                            <User className="w-3 h-3" />
                            {userEmail}
                        </div>

                        {/* Mini Stats Row */}
                        <div className="grid grid-cols-2 gap-3 w-full">
                            <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                                <div className="text-orange-400 font-bold text-xl flex items-center justify-center gap-1">
                                    <Flame className="w-4 h-4 fill-current" />
                                    {stats.streak}
                                </div>
                                <div className="text-[10px] text-white/40 uppercase tracking-wider">天连胜</div>
                            </div>
                            <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                                <div className="text-blue-400 font-bold text-xl flex items-center justify-center gap-1">
                                    <BookOpen className="w-4 h-4" />
                                    {stats.totalLearned}
                                </div>
                                <div className="text-[10px] text-white/40 uppercase tracking-wider">已学单词</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Panel: Settings & Detailed Stats */}
                <div className="flex-1 flex flex-col h-full bg-slate-950/50">
                    {/* Header */}
                    <div className="p-6 border-b border-white/10 flex items-center justify-between">
                        <h3 className="font-bold text-lg text-white">个人中心</h3>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-white/50 transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">

                        {/* 1. Avatar Selector */}
                        <section>
                            <label className="text-xs font-bold text-white/40 uppercase tracking-wider mb-4 block">选择头像</label>
                            <div className="grid grid-cols-4 gap-3">
                                {AVATARS.map(avatar => (
                                    <button
                                        key={avatar.id}
                                        onClick={() => setSelectedAvatar(avatar.id)}
                                        className={cn(
                                            "aspect-square rounded-2xl flex items-center justify-center text-2xl transition-all border-2",
                                            selectedAvatar === avatar.id
                                                ? `bg-white/10 border-blue-500 scale-105 shadow-lg shadow-blue-500/20`
                                                : "bg-white/5 border-transparent hover:bg-white/10 hover:scale-105"
                                        )}
                                    >
                                        {avatar.emoji}
                                    </button>
                                ))}
                            </div>
                        </section>

                        {/* 2. Nickname */}
                        <section>
                            <label className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2 block">昵称</label>
                            <input
                                value={editNickname}
                                onChange={(e) => setEditNickname(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all font-medium"
                                placeholder="输入你的昵称..."
                            />
                        </section>

                        {/* 2.5 Personalization Profile */}
                        <section>
                            <label className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3 block">个性化档案</label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-white/60 mb-1.5 block">职业 / 身份</label>
                                    <input
                                        value={editProfession}
                                        onChange={(e) => setEditProfession(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all font-medium"
                                        placeholder="例如: 程序员, 学生..."
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-white/60 mb-1.5 block">兴趣爱好</label>
                                    <input
                                        value={editHobbies}
                                        onChange={(e) => setEditHobbies(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all font-medium"
                                        placeholder="例如: 足球, 绘画..."
                                    />
                                </div>
                            </div>
                            <p className="text-[10px] text-white/30 mt-2">
                                * 填写后，AI 老师会尝试用您熟悉的领域来打比方讲解单词。
                            </p>
                        </section>

                        {/* 3. Achievements (Mock for now, can be real later) */}
                        <section>
                            <label className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3 block">我的成就</label>
                            <div className="space-y-2">
                                <div className="flex items-center gap-4 p-3 rounded-xl bg-white/5 border border-white/5">
                                    <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center text-yellow-500">
                                        <Award className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-sm font-bold text-white">单词收藏家</div>
                                        <div className="text-xs text-white/40">累计添加 {stats.totalCards} 个单词</div>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* Footer */}
                    <div className="p-6 border-t border-white/10">
                        <button
                            onClick={handleSave}
                            className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
                        >
                            保存更改
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

