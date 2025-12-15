/**
 * @component HotkeySettings
 * @description 快捷键设置组件 - 用于配置 AI 聊天快捷键
 */
import { useState, useEffect } from 'react';
import { Keyboard, Check } from 'lucide-react';

interface HotkeySettingsProps {
    className?: string;
}

const HOTKEY_OPTIONS = [
    { value: 'Tab', label: 'Tab', description: '标签键' },
    { value: 'Ctrl+/', label: 'Ctrl + /', description: 'Windows/Linux' },
    { value: 'Cmd+/', label: '⌘ + /', description: 'Mac' },
    { value: 'Ctrl+K', label: 'Ctrl + K', description: 'Windows/Linux' },
    { value: 'Cmd+K', label: '⌘ + K', description: 'Mac' },
    { value: '`', label: '`', description: '反引号键' },
];

export function HotkeySettings({ className }: HotkeySettingsProps) {
    const [currentHotkey, setCurrentHotkey] = useState('Tab');

    useEffect(() => {
        const saved = localStorage.getItem('ai_chat_hotkey');
        if (saved) setCurrentHotkey(saved);
    }, []);

    const handleSelect = (value: string) => {
        setCurrentHotkey(value);
        localStorage.setItem('ai_chat_hotkey', value);
    };

    return (
        <div className={className}>
            <div className="flex items-center gap-2 mb-3">
                <Keyboard className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-medium text-white">AI 聊天快捷键</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
                {HOTKEY_OPTIONS.map((option) => (
                    <button
                        key={option.value}
                        onClick={() => handleSelect(option.value)}
                        className={`px-3 py-2 rounded-lg text-left transition-all flex items-center justify-between
                            ${currentHotkey === option.value
                                ? 'bg-purple-500/30 border border-purple-500/50 text-purple-300'
                                : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                            }`}
                    >
                        <div>
                            <div className="text-sm font-mono">{option.label}</div>
                            <div className="text-[10px] text-white/40">{option.description}</div>
                        </div>
                        {currentHotkey === option.value && (
                            <Check className="w-4 h-4 text-purple-400" />
                        )}
                    </button>
                ))}
            </div>
            <p className="text-[10px] text-white/30 mt-2">
                更改后刷新页面生效
            </p>
        </div>
    );
}
