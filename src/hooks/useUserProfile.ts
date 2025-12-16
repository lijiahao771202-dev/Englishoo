import { useState, useEffect } from 'react';

export interface UserProfile {
    nickname: string;
    avatarId: string;
    profession?: string;
    hobbies?: string;
}

const STORAGE_KEY = 'user_profile_data';

export const AVATARS = [
    { id: 'bear', emoji: '🐻', bg: 'from-orange-400 to-amber-500' },
    { id: 'lion', emoji: '🦁', bg: 'from-yellow-400 to-orange-500' },
    { id: 'rabbit', emoji: '🐰', bg: 'from-pink-400 to-rose-500' },
    { id: 'fox', emoji: '🦊', bg: 'from-orange-500 to-red-500' },
    { id: 'koala', emoji: '🐨', bg: 'from-slate-400 to-slate-500' },
    { id: 'panda', emoji: '🐼', bg: 'from-slate-800 to-black' },
    { id: 'tiger', emoji: '🐯', bg: 'from-amber-500 to-orange-600' },
    { id: 'unicorn', emoji: '🦄', bg: 'from-purple-400 to-pink-500' },
];

export function useUserProfile(email: string | undefined) {
    // Default nickname from email if available
    const defaultNickname = email ? email.split('@')[0] : 'Guest';

    const [profile, setProfile] = useState<UserProfile>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                // Ensure defaults
                return {
                    nickname: parsed.nickname || defaultNickname,
                    avatarId: parsed.avatarId || 'bear',
                    profession: parsed.profession || '',
                    hobbies: parsed.hobbies || ''
                };
            }
        } catch (e) {
            console.error("Failed to load user profile:", e);
        }
        return {
            nickname: defaultNickname,
            avatarId: 'bear',
            profession: '',
            hobbies: ''
        };
    });

    const updateProfile = (updates: Partial<UserProfile>) => {
        setProfile(prev => {
            const newState = { ...prev, ...updates };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));

            // Dispatch a custom event so other components (like Header) can update instantly
            window.dispatchEvent(new Event('user-profile-updated'));
            return newState;
        });
    };

    // Listen for updates from other components (modals etc)
    useEffect(() => {
        const handleStorageChange = () => {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                setProfile(JSON.parse(saved));
            }
        };

        window.addEventListener('user-profile-updated', handleStorageChange);
        return () => window.removeEventListener('user-profile-updated', handleStorageChange);
    }, []);

    // Also update if email changes and we have no saved profile (first login)
    useEffect(() => {
        if (email && profile.nickname === 'Guest') {
            setProfile(p => ({ ...p, nickname: email.split('@')[0] }));
        }
    }, [email]);

    return {
        profile,
        updateProfile,
        AVATARS
    };
}
