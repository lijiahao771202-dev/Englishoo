/**
 * @component FloatingAIChat (悬浮AI聊天助手)
 * @description 全局可用的AI助手悬浮窗，支持上下文感知模式切换、Tab快捷键呼出、拖拽移动、流式输出、Markdown渲染
 * @context 全局可用，根据当前页面自动切换AI模式
 * @author Trae-Architect
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { X, Send, Sparkles, Loader2, GripVertical } from 'lucide-react';

import { InteractiveMascot, type MascotReaction } from './InteractiveMascot';
import { getAIModeFromView, getSystemPrompt, getQuickQuestions } from '@/lib/ai-prompts';
import type { WordCard } from '@/types';

// DeepSeek API URL (通过代理)
const API_URL = '/api/deepseek/chat/completions';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

interface FloatingAIChatProps {
    /** 当前视图/页面 (用于上下文感知) */
    currentView?: string;
    /** 当前学习的单词 (用于上下文) */
    currentWord?: string;
    /** 当前单词的释义 */
    currentMeaning?: string;
    /** API Key */
    apiKey: string;
    /** 吉祥物情绪状态 */
    mascotReaction?: MascotReaction;
    /** 插入笔记回调 */
    onInsertToNotes?: (text: string) => void;
    /** 上下文数据 */
    contextData?: {
        cards?: WordCard[];
        deckName?: string;
        dueCount?: number;
        newCount?: number;
        totalCards?: number;
    };
}

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * @component ChatBubble
 * @description 卡片式聊天气泡组件 - 支持 Markdown 渲染 + 复制/插入笔记
 */
function ChatBubble({ role, content, onInsertToNotes }: {
    role: 'user' | 'assistant';
    content: string;
    onInsertToNotes?: (text: string) => void;
}) {
    const isUser = role === 'user';
    const [copied, setCopied] = useState(false);
    const [inserted, setInserted] = useState(false);

    const handleCopy = async (e: React.MouseEvent) => {
        e.stopPropagation();
        await navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleInsertToNotes = (e: React.MouseEvent) => {
        e.stopPropagation();
        onInsertToNotes?.(content);
        setInserted(true);
        setTimeout(() => setInserted(false), 2000);
    };

    return (
        <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
            {/* 助手头像 */}
            {!isUser && (
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 
                    flex items-center justify-center text-white text-xs shadow-md mt-1">
                    🤖
                </div>
            )}

            {/* 消息卡片 */}
            <div
                className={`max-w-[80%] rounded-2xl shadow-md overflow-hidden group relative
                    ${isUser
                        ? 'bg-gradient-to-br from-purple-600/80 to-purple-500/70 text-white rounded-br-sm'
                        : 'bg-white/10 backdrop-blur-sm border border-white/10 text-white/95 rounded-bl-sm'
                    }`}
            >
                <div className="px-3.5 py-2.5 text-sm">
                    {isUser ? (
                        <span>{content}</span>
                    ) : (
                        <div className="prose prose-invert prose-sm max-w-none
                            prose-p:my-1.5 prose-p:leading-relaxed
                            prose-headings:text-purple-300 prose-headings:font-bold prose-headings:mt-3 prose-headings:mb-1.5
                            prose-strong:text-purple-300
                            prose-code:bg-black/30 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-yellow-300 prose-code:text-xs prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
                            prose-pre:bg-black/40 prose-pre:rounded-lg prose-pre:p-3 prose-pre:my-2 prose-pre:border prose-pre:border-white/10
                            prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5
                            prose-blockquote:border-l-purple-400 prose-blockquote:bg-purple-500/10 prose-blockquote:rounded-r-lg prose-blockquote:py-1 prose-blockquote:px-3 prose-blockquote:my-2 prose-blockquote:not-italic
                            prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline"
                        >
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                        </div>
                    )}
                </div>

                {/* 操作按钮 - 仅助手消息显示 */}
                {!isUser && (
                    <div className="flex gap-1 px-3 pb-2 pt-0">
                        <button
                            onClick={handleCopy}
                            className="text-[10px] px-2 py-1 rounded-md bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80 transition-colors flex items-center gap-1"
                        >
                            {copied ? '✅ 已复制' : '📋 复制'}
                        </button>
                        {onInsertToNotes && (
                            <button
                                onClick={handleInsertToNotes}
                                className="text-[10px] px-2 py-1 rounded-md bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition-colors flex items-center gap-1"
                            >
                                {inserted ? '✅ 已插入' : '📝 插入笔记'}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export function FloatingAIChat({ currentView = 'guided-learning', currentWord, currentMeaning, apiKey, mascotReaction = 'idle', onInsertToNotes, contextData }: FloatingAIChatProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [streamingContent, setStreamingContent] = useState(''); // 流式输出缓冲
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const dragControls = useDragControls();

    // 上下文感知模式计算
    const modeConfig = useMemo(() => getAIModeFromView(currentView), [currentView]);

    // 动态快捷问题
    const quickQuestions = useMemo(() => getQuickQuestions(modeConfig.mode, {
        currentWord,
        deckName: contextData?.deckName,
        dueCount: contextData?.dueCount,
        newCount: contextData?.newCount,
    }), [modeConfig.mode, currentWord, contextData]);

    // 动态 System Prompt
    const systemPrompt = useMemo(() => getSystemPrompt(modeConfig.mode, {
        currentWord,
        currentMeaning,
        cards: contextData?.cards,
        deckName: contextData?.deckName,
        dueCount: contextData?.dueCount,
        newCount: contextData?.newCount,
        totalCards: contextData?.totalCards,
    }), [modeConfig.mode, currentWord, currentMeaning, contextData]);

    // 滚动到最新消息
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, streamingContent]);

    // 聚焦输入框
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    // 自定义快捷键切换 (默认 Tab，可通过 localStorage 配置)
    useEffect(() => {
        const savedHotkey = localStorage.getItem('ai_chat_hotkey') || 'Tab';

        const handleKeyDown = (e: KeyboardEvent) => {
            // 检查是否按下了配置的快捷键
            const isHotkeyPressed = e.key === savedHotkey ||
                (savedHotkey === 'Ctrl+/' && e.ctrlKey && e.key === '/') ||
                (savedHotkey === 'Cmd+/' && e.metaKey && e.key === '/') ||
                (savedHotkey === 'Ctrl+K' && e.ctrlKey && e.key === 'k') ||
                (savedHotkey === 'Cmd+K' && e.metaKey && e.key === 'k');

            // 不在输入框中时才响应
            if (isHotkeyPressed && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
                e.preventDefault();
                setIsOpen(prev => !prev);
            }
            // Escape 关闭
            if (e.key === 'Escape' && isOpen) {
                setIsOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    // 发送消息 (流式输出)
    const sendMessage = useCallback(async (directMessage?: string) => {
        const userMessage = (directMessage || input).trim();
        if (!userMessage || isLoading) return;

        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setIsLoading(true);
        setStreamingContent('');

        // 使用动态计算的 systemPrompt (上下文感知模式)

        try {
            // 使用 fetch 进行流式请求
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        ...messages.slice(-10),
                        { role: 'user', content: userMessage }
                    ],
                    max_tokens: 500,
                    stream: true
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error('No reader available');

            const decoder = new TextDecoder();
            let fullContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(line => line.trim() !== '');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;

                        try {
                            const parsed = JSON.parse(data);
                            const delta = parsed.choices?.[0]?.delta?.content || '';
                            fullContent += delta;
                            setStreamingContent(fullContent);
                        } catch (e) {
                            // 忽略解析错误
                        }
                    }
                }
            }

            // 流式完成，添加到消息列表
            setMessages(prev => [...prev, { role: 'assistant', content: fullContent }]);
            setStreamingContent('');
        } catch (error) {
            console.error('[AI Chat] Error:', error);
            setMessages(prev => [...prev, { role: 'assistant', content: '抱歉，发生了错误。请稍后再试。' }]);
            setStreamingContent('');
        } finally {
            setIsLoading(false);
        }
    }, [input, isLoading, messages, systemPrompt, apiKey]);

    // [NEW] 悬停和戳一戳状态
    const [isHovered, setIsHovered] = useState(false);
    const [localReaction, setLocalReaction] = useState(mascotReaction);
    const lastActivityRef = useRef(Date.now());

    // 同步外部 reaction
    useEffect(() => {
        if (mascotReaction !== 'idle') {
            setLocalReaction(mascotReaction);
            lastActivityRef.current = Date.now();
        }
    }, [mascotReaction]);

    // 30s 无操作 → 打瞌睡
    useEffect(() => {
        const checkIdle = setInterval(() => {
            if (Date.now() - lastActivityRef.current > 30000 && localReaction === 'idle') {
                setLocalReaction('sleepy');
            }
        }, 5000);
        return () => clearInterval(checkIdle);
    }, [localReaction]);

    // 处理戳一戳
    const handlePoke = () => {
        if (isOpen) return; // 如果已打开聊天，不触发戳一戳
        lastActivityRef.current = Date.now();
        setLocalReaction('poked');
        setTimeout(() => setLocalReaction('idle'), 1000);
    };

    // 悬停 → 害羞
    const handleMouseEnter = () => {
        setIsHovered(true);
        lastActivityRef.current = Date.now();
        if (localReaction === 'idle' || localReaction === 'sleepy') {
            setLocalReaction('shy');
        }
    };

    const handleMouseLeave = () => {
        setIsHovered(false);
        if (localReaction === 'shy') {
            setLocalReaction('idle');
        }
    };

    return (
        <>
            {/* 悬浮按钮 - 使用自定义 InteractiveMascot */}
            <motion.button
                className="fixed bottom-10 right-10 z-50 w-20 h-20 rounded-full 
                   flex items-center justify-center
                   hover:scale-105 active:scale-95 transition-transform cursor-pointer overflow-visible"
                onClick={() => {
                    if (!isOpen) {
                        handlePoke(); // 戳一戳效果
                        setTimeout(() => setIsOpen(true), 300); // 延迟打开
                    } else {
                        setIsOpen(false);
                    }
                }}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                title="AI 助手 (Tab)"
            >
                <AnimatePresence mode="wait">
                    {isOpen ? (
                        <motion.div
                            key="close"
                            initial={{ scale: 0, rotate: -90 }}
                            animate={{ scale: 1, rotate: 0 }}
                            exit={{ scale: 0, rotate: 90 }}
                            className="bg-black/50 backdrop-blur-md rounded-full p-4 border border-white/20 shadow-lg"
                        >
                            <X className="w-8 h-8 text-white" />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="mascot"
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                        >
                            <InteractiveMascot
                                reaction={localReaction}
                                size={96}
                                isHovered={isHovered}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.button>

            {/* 聊天面板 - 可拖拽 */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        drag
                        dragControls={dragControls}
                        dragMomentum={false}
                        dragElastic={0.1}
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 
                       bg-black/70 backdrop-blur-2xl 
                       border border-white/10 rounded-2xl
                       shadow-2xl shadow-black/50
                       flex flex-col overflow-hidden
                       cursor-default"
                        style={{ maxHeight: 'calc(100vh - 150px)' }}
                    >
                        {/* 头部 - 拖拽手柄 + 模式指示器 */}
                        <div
                            className="px-4 py-3 border-b border-white/10 flex items-center gap-3 cursor-grab active:cursor-grabbing"
                            onPointerDown={(e) => dragControls.start(e)}
                        >
                            <GripVertical className="w-4 h-4 text-white/30" />
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 
                              flex items-center justify-center text-lg">
                                {modeConfig.emoji}
                            </div>
                            <div className="flex-1">
                                <div className="text-white font-medium text-sm flex items-center gap-2">
                                    {modeConfig.label}
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50 font-normal">
                                        AI
                                    </span>
                                </div>
                                <div className="text-white/40 text-xs">
                                    {currentWord ? `正在学习: ${currentWord}` : modeConfig.description}
                                </div>
                            </div>
                            <div className="text-white/30 text-xs">Tab 切换</div>
                        </div>

                        {/* 消息区域 */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px] max-h-[400px]">
                            {messages.length === 0 && !streamingContent ? (
                                <div className="text-center py-8">
                                    <Sparkles className="w-10 h-10 text-purple-400/50 mx-auto mb-3" />
                                    <p className="text-white/50 text-sm">有什么问题尽管问我！</p>
                                    {/* 快捷问题 - 直接发送 */}
                                    {quickQuestions.length > 0 && (
                                        <div className="mt-4 space-y-2">
                                            {quickQuestions.map((q, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => sendMessage(q)}
                                                    className="block w-full text-left text-xs text-purple-300/70 
                                     hover:text-purple-300 px-3 py-2 rounded-lg
                                     bg-white/5 hover:bg-white/10 transition-colors"
                                                >
                                                    {q}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <>
                                    {messages.map((msg, i) => (
                                        <ChatBubble key={i} role={msg.role} content={msg.content} onInsertToNotes={onInsertToNotes} />
                                    ))}
                                    {/* 流式输出中的消息 */}
                                    {streamingContent && (
                                        <div className="flex gap-2 flex-row">
                                            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 
                                                flex items-center justify-center text-white text-xs shadow-md mt-1">
                                                🤖
                                            </div>
                                            <div className="max-w-[80%] rounded-2xl shadow-md overflow-hidden bg-white/10 backdrop-blur-sm border border-white/10 text-white/95 rounded-bl-sm">
                                                <div className="px-3.5 py-2.5 text-sm prose prose-invert prose-sm max-w-none">
                                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown>
                                                    <span className="inline-block w-2 h-4 bg-purple-400 animate-pulse ml-0.5 align-middle" />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* 快捷追问/问题按钮 - 始终显示当前单词相关问题 */}
                                    {!isLoading && !streamingContent && currentWord && (
                                        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/10">
                                            <span className="w-full text-xs text-white/30 mb-1">关于 "{currentWord}"：</span>
                                            <button
                                                onClick={() => sendMessage(`详细解释一下"${currentWord}"`)}
                                                className="text-xs px-3 py-1.5 rounded-full bg-purple-500/20 text-purple-300 
                                                    hover:bg-purple-500/30 border border-purple-500/30 transition-colors"
                                            >
                                                📖 详细解释
                                            </button>
                                            <button
                                                onClick={() => sendMessage(`再给我几个"${currentWord}"的例句`)}
                                                className="text-xs px-3 py-1.5 rounded-full bg-blue-500/20 text-blue-300 
                                                    hover:bg-blue-500/30 border border-blue-500/30 transition-colors"
                                            >
                                                ✏️ 更多例句
                                            </button>
                                            <button
                                                onClick={() => sendMessage(`"${currentWord}"的同义词有哪些？`)}
                                                className="text-xs px-3 py-1.5 rounded-full bg-green-500/20 text-green-300 
                                                    hover:bg-green-500/30 border border-green-500/30 transition-colors"
                                            >
                                                🔗 同义词
                                            </button>
                                            <button
                                                onClick={() => sendMessage(`帮我想一个"${currentWord}"的助记方法`)}
                                                className="text-xs px-3 py-1.5 rounded-full bg-yellow-500/20 text-yellow-300 
                                                    hover:bg-yellow-500/30 border border-yellow-500/30 transition-colors"
                                            >
                                                💡 助记
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                            {isLoading && !streamingContent && (
                                <div className="flex justify-start">
                                    <div className="bg-white/10 px-4 py-2 rounded-2xl rounded-bl-sm">
                                        <Loader2 className="w-4 h-4 text-purple-300 animate-spin" />
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* 输入区域 */}
                        <div className="p-3 border-t border-white/10">
                            <div className="flex gap-2">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                                    placeholder="输入问题..."
                                    className="flex-1 bg-white/10 border border-white/10 rounded-xl
                             px-4 py-2 text-white text-sm placeholder-white/30
                             focus:outline-none focus:border-purple-400/50
                             transition-colors"
                                />
                                <button
                                    onClick={() => sendMessage()}
                                    disabled={!input.trim() || isLoading}
                                    className="w-10 h-10 rounded-xl bg-purple-500/50 hover:bg-purple-500/70
                             disabled:opacity-50 disabled:cursor-not-allowed
                             flex items-center justify-center transition-colors"
                                >
                                    <Send className="w-4 h-4 text-white" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
