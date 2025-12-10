/**
 * @component FloatingAIChat (悬浮AI聊天助手)
 * @description 学习/复习时的AI助手悬浮窗，支持Tab快捷键呼出、拖拽移动、流式输出、Markdown渲染
 * @context 学习和复习页面
 * @author Trae-Architect
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { MessageCircle, X, Send, Sparkles, Loader2, GripVertical } from 'lucide-react';

// DeepSeek API URL (通过代理)
const API_URL = '/api/deepseek/chat/completions';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

interface FloatingAIChatProps {
    /** 当前学习的单词 (用于上下文) */
    currentWord?: string;
    /** 当前单词的释义 */
    currentMeaning?: string;
    /** API Key */
    apiKey: string;
}

/**
 * @description 简易 Markdown 渲染器 (支持加粗、斜体、代码)
 */
function renderMarkdown(text: string): React.ReactNode {
    // 处理 **bold** 和 *italic* 和 `code`
    const parts: React.ReactNode[] = [];
    let key = 0;

    // 正则匹配 **bold**, *italic*, `code`
    const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
        // 添加匹配前的普通文本
        if (match.index > lastIndex) {
            parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
        }

        if (match[1]) {
            // **bold**
            parts.push(<strong key={key++} className="font-bold text-purple-300">{match[2]}</strong>);
        } else if (match[3]) {
            // *italic*
            parts.push(<em key={key++} className="italic text-blue-300">{match[4]}</em>);
        } else if (match[5]) {
            // `code`
            parts.push(<code key={key++} className="bg-white/10 px-1 rounded text-yellow-300 font-mono text-xs">{match[6]}</code>);
        }

        lastIndex = regex.lastIndex;
    }

    // 添加剩余文本
    if (lastIndex < text.length) {
        parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
    }

    return parts.length > 0 ? parts : text;
}

export function FloatingAIChat({ currentWord, currentMeaning, apiKey }: FloatingAIChatProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [streamingContent, setStreamingContent] = useState(''); // 流式输出缓冲
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const dragControls = useDragControls();

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

    // Tab 快捷键切换
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Tab 键且没有在输入框中
            if (e.key === 'Tab' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
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
    const sendMessage = useCallback(async () => {
        if (!input.trim() || isLoading) return;

        const userMessage = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setIsLoading(true);
        setStreamingContent('');

        // 构建系统提示 (包含当前单词上下文)
        const systemPrompt = `你是一个专业的英语学习助手，专门帮助中国学生学习英语词汇。
${currentWord ? `当前用户正在学习的单词是: "${currentWord}"${currentMeaning ? `，释义是: "${currentMeaning}"` : ''}。` : ''}

请用简体中文回复用户的问题。回答要简洁、专业、有帮助。
重要：请勿使用 Markdown 格式（如 **加粗** 或 *斜体*），直接用纯文本回复。
如果用户问的问题与当前单词相关，可以提供：
- 更多例句和用法
- 词根词缀分析
- 近义词/反义词对比
- 常见搭配
- 语法要点`;

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
    }, [input, isLoading, messages, currentWord, currentMeaning, apiKey]);

    // 快捷问题
    const quickQuestions = useMemo(() => currentWord ? [
        `"${currentWord}"还有哪些常见搭配？`,
        `"${currentWord}"的词根是什么？`,
        `"${currentWord}"和哪些词容易混淆？`,
    ] : [], [currentWord]);

    return (
        <>
            {/* 悬浮按钮 */}
            <motion.button
                className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full 
                   bg-gradient-to-br from-purple-500/80 to-blue-500/80
                   backdrop-blur-xl border border-white/20
                   shadow-lg shadow-purple-500/25
                   flex items-center justify-center
                   hover:scale-110 active:scale-95 transition-transform"
                whileHover={{ boxShadow: '0 0 30px rgba(168, 85, 247, 0.5)' }}
                onClick={() => setIsOpen(!isOpen)}
                title="AI 助手 (Tab)"
            >
                <AnimatePresence mode="wait">
                    {isOpen ? (
                        <motion.div
                            key="close"
                            initial={{ rotate: -90, opacity: 0 }}
                            animate={{ rotate: 0, opacity: 1 }}
                            exit={{ rotate: 90, opacity: 0 }}
                        >
                            <X className="w-6 h-6 text-white" />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="chat"
                            initial={{ rotate: 90, opacity: 0 }}
                            animate={{ rotate: 0, opacity: 1 }}
                            exit={{ rotate: -90, opacity: 0 }}
                        >
                            <Sparkles className="w-6 h-6 text-white" />
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
                        {/* 头部 - 拖拽手柄 */}
                        <div
                            className="px-4 py-3 border-b border-white/10 flex items-center gap-3 cursor-grab active:cursor-grabbing"
                            onPointerDown={(e) => dragControls.start(e)}
                        >
                            <GripVertical className="w-4 h-4 text-white/30" />
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 
                              flex items-center justify-center">
                                <MessageCircle className="w-4 h-4 text-white" />
                            </div>
                            <div className="flex-1">
                                <div className="text-white font-medium text-sm">AI 学习助手</div>
                                {currentWord && (
                                    <div className="text-white/50 text-xs">正在学习: {currentWord}</div>
                                )}
                            </div>
                            <div className="text-white/30 text-xs">Tab 切换</div>
                        </div>

                        {/* 消息区域 */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px] max-h-[400px]">
                            {messages.length === 0 && !streamingContent ? (
                                <div className="text-center py-8">
                                    <Sparkles className="w-10 h-10 text-purple-400/50 mx-auto mb-3" />
                                    <p className="text-white/50 text-sm">有什么问题尽管问我！</p>
                                    {/* 快捷问题 */}
                                    {quickQuestions.length > 0 && (
                                        <div className="mt-4 space-y-2">
                                            {quickQuestions.map((q, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => {
                                                        setInput(q);
                                                        inputRef.current?.focus();
                                                    }}
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
                                        <div
                                            key={i}
                                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                        >
                                            <div
                                                className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap
                                                    ${msg.role === 'user'
                                                        ? 'bg-purple-500/30 text-white rounded-br-sm'
                                                        : 'bg-white/10 text-white/90 rounded-bl-sm'
                                                    }`}
                                            >
                                                {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
                                            </div>
                                        </div>
                                    ))}
                                    {/* 流式输出中的消息 */}
                                    {streamingContent && (
                                        <div className="flex justify-start">
                                            <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-bl-sm text-sm whitespace-pre-wrap bg-white/10 text-white/90">
                                                {renderMarkdown(streamingContent)}
                                                <span className="inline-block w-2 h-4 bg-purple-400 animate-pulse ml-0.5" />
                                            </div>
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
                                    onClick={sendMessage}
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
