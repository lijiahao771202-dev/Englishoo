import React, { useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { WordCard } from '@/types';
import { ArrowLeft, Sparkles, BookOpen, RefreshCw, CheckCircle, Heart, Brain, Clock, Plus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { State } from 'ts-fsrs';
import { isSameDay } from 'date-fns';
import { addToVocabularyDeck } from '@/lib/data-source';

interface ReadingPracticeProps {
    cards: WordCard[];
    onBack: () => void;
    onGenerate: (words: string[]) => Promise<{ title: string; content: string; translation: string } | undefined>;
    onGetDefinition: (word: string, context: string) => Promise<string | undefined>;
}

type TabType = 'learned' | 'unlearned' | 'familiar' | 'important' | 'today';

// Process HTML content to wrap words in interactive spans
// Moved outside component to avoid recreation
const processContent = (html: string) => {
    // 1. Protect HTML tags
    const tags: string[] = [];
    // Use ### as delimiter which creates word boundaries with non-word characters
    // We use numeric indices which won't be matched by the letter-only regex below
    const textWithPlaceholders = html.replace(/<[^>]+>/g, (match) => {
        tags.push(match);
        return `###${tags.length - 1}###`;
    });

    // 2. Wrap words (min 1 chars to include "I", "a")
    // Only match letters and apostrophes
    const wrappedText = textWithPlaceholders.replace(/\b([a-zA-Z']{1,})\b/g, (match) => {
        return `<span class="interactive-word cursor-pointer hover:text-blue-300 transition-colors border-b border-transparent hover:border-blue-300/50" data-word="${match}">${match}</span>`;
    });

    // 3. Restore tags
    return wrappedText.replace(/###(\d+)###/g, (_, index) => tags[Number(index)]);
};

// Memoized Article Display Component to prevent re-renders and selection loss
const ArticleDisplay = React.memo(({
    title,
    htmlContent,
    translation,
    showTranslation,
    onToggleTranslation,
    onReset,
    onClick,
    onMouseUp
}: {
    title: string;
    htmlContent: string;
    translation: string;
    showTranslation: boolean;
    onToggleTranslation: () => void;
    onReset: () => void;
    onClick: (e: React.MouseEvent) => void;
    onMouseUp: (e: React.MouseEvent) => void;
}) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6 pb-10"
        >
            <div
                className="glass-panel p-8 relative overflow-hidden border-white/10"
                onMouseUp={onMouseUp}
                onClick={onClick}
            >
                {/* Reset Button */}
                <button
                    onClick={onReset}
                    className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-colors"
                    title="重新选择"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>

                <h1 className="text-2xl font-bold mb-6 text-gradient">{title}</h1>

                <div
                    className="prose prose-invert prose-lg max-w-none leading-relaxed text-white/90 [&>b]:text-yellow-300 [&>b]:font-bold selection:bg-blue-500/80 selection:text-white"
                    dangerouslySetInnerHTML={{ __html: htmlContent }}
                />

                <div className="mt-8 pt-6 border-t border-white/10">
                    <button
                        onClick={onToggleTranslation}
                        className="flex items-center gap-2 text-sm text-white/50 hover:text-white/80 transition-colors mb-4"
                    >
                        <BookOpen className="w-4 h-4" />
                        {showTranslation ? "隐藏参考译文" : "查看参考译文"}
                    </button>

                    <AnimatePresence>
                        {showTranslation && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="p-4 rounded-xl bg-white/5 text-white/70 leading-relaxed text-base">
                                    {translation}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </motion.div>
    );
});

ArticleDisplay.displayName = 'ArticleDisplay';

export function ReadingPractice({ cards, onBack, onGenerate, onGetDefinition }: ReadingPracticeProps) {
    const [selectedWords, setSelectedWords] = useState<string[]>([]);
    const [article, setArticle] = useState<{ title: string; content: string; translation: string } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [showTranslation, setShowTranslation] = useState(false);
    const [tooltip, setTooltip] = useState<{ x: number; y: number; content?: string; loading: boolean; word?: string } | null>(null);

    const [activeTab, setActiveTab] = useState<TabType>('learned');
    const [addedWords, setAddedWords] = useState<Set<string>>(new Set());

    const tabs: { id: TabType; label: string; icon: React.ElementType }[] = [
        { id: 'learned', label: '已学习', icon: Brain },
        { id: 'unlearned', label: '未学习', icon: BookOpen },
        { id: 'familiar', label: '熟悉', icon: CheckCircle },
        { id: 'important', label: '重点', icon: Heart },
        { id: 'today', label: '今天', icon: Clock },
    ];

    const filteredCards = useMemo(() => {
        let result = cards;
        switch (activeTab) {
            case 'learned':
                result = cards.filter(card => card.state !== State.New && !card.isFamiliar);
                break;
            case 'unlearned':
                result = cards.filter(card => card.state === State.New && !card.isFamiliar);
                break;
            case 'familiar':
                result = cards.filter(card => card.isFamiliar);
                break;
            case 'important':
                result = cards.filter(card => card.isImportant);
                break;
            case 'today':
                result = cards.filter(card => {
                    if (!card.createdAt) return false;
                    return isSameDay(new Date(card.createdAt), new Date());
                });
                break;
        }
        return result;
    }, [cards, activeTab]);

    const toggleWord = (word: string) => {
        setSelectedWords(prev =>
            prev.includes(word)
                ? prev.filter(w => w !== word)
                : [...prev, word]
        );
    };

    // Memoize the processed content to prevent DOM regeneration on re-renders
    const processedArticleContent = useMemo(() => {
        if (!article) return "";
        return processContent(article.content);
    }, [article]);

    // Memoize handlers to prevent ArticleDisplay re-renders
    const handleArticleClick = useCallback(async (e: React.MouseEvent) => {
        // If text is selected, do nothing (let onMouseUp handle it, or we ignore)
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) {
            console.log("Selection active, ignoring click");
            return;
        }

        const target = e.target as HTMLElement;
        console.log("Clicked target:", target.tagName, target.className);

        // Check if we clicked a word
        if (target.classList.contains('interactive-word')) {
            const word = target.getAttribute('data-word');
            console.log("Interactive word clicked:", word);

            if (!word) return;

            const rect = target.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top;

            // Reset tooltip to loading state immediately (DeepSeek Only)
            setTooltip({
                x,
                y,
                content: undefined,
                loading: true,
                word: word
            });

            // Always fetch context definition
            // Try to get the paragraph text, otherwise fallback to the container text
            let context = target.closest('p')?.textContent;
            if (!context) {
                const container = target.closest('.prose');
                context = container?.textContent || "";
            }
            // Clean up context
            context = context.replace(/\s+/g, ' ').trim();

            console.log("Context found for click:", context.substring(0, 50) + "...");

            try {
                const definition = await onGetDefinition(word, context);
                console.log("Definition result:", definition);

                if (definition) {
                    // Only update if the tooltip is still for the same word (race condition check)
                    setTooltip(prev => {
                        if (prev?.word === word) {
                            return { ...prev, content: definition, loading: false };
                        }
                        return prev;
                    });
                } else {
                    // If fetch fails/empty, show "No definition"
                    setTooltip(prev => {
                        if (prev?.word === word) {
                            return {
                                ...prev,
                                content: "暂无释义 (请检查API Key)",
                                loading: false
                            };
                        }
                        return prev;
                    });
                }
            } catch (error) {
                console.error("Definition error:", error);
                setTooltip(prev => {
                    if (prev?.word === word) {
                        return {
                            ...prev,
                            content: "查询失败",
                            loading: false
                        };
                    }
                    return prev;
                });
            }

        } else {
            // Clicked blank space or non-interactive text -> Dismiss tooltip
            console.log("Clicked background, dismissing tooltip");
            setTooltip(null);
        }
    }, [cards, onGetDefinition]);

    const handleMouseUp = useCallback(async (e: React.MouseEvent) => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
            // Collapsed selection means click, handled by onClick
            return;
        }

        const text = selection.toString().trim();
        if (!text) return;

        console.log("Selected text:", text);

        // Get position
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top;

        setTooltip({ x, y, loading: true, word: text, content: undefined });

        // Get context
        // Handle case where selection is inside a span/mark
        let contextNode = selection.anchorNode?.parentElement;
        let context = contextNode?.closest('p')?.textContent;

        if (!context) {
            // Fallback to prose container
            const container = (e.target as HTMLElement).closest('.prose');
            context = container?.textContent || "";
        }

        // Clean up
        context = context.replace(/\s+/g, ' ').trim();
        console.log("Context found for selection:", context.substring(0, 50) + "...");

        try {
            const result = await onGetDefinition(text, context);
            if (result) {
                setTooltip(prev => {
                    if (prev?.word === text) {
                        return { x, y, content: result, loading: false, word: text };
                    }
                    return prev;
                });
            } else {
                setTooltip(prev => {
                    if (prev?.word === text) {
                        return { ...prev, content: "暂无释义", loading: false };
                    }
                    return prev;
                });
            }
        } catch (error) {
            console.error("Failed to get definition", error);
            setTooltip(prev => {
                if (prev?.word === text) {
                    return { ...prev, content: "查询失败", loading: false };
                }
                return prev;
            });
        }
    }, [onGetDefinition]);

    const handleToggleTranslation = useCallback(() => {
        setShowTranslation(prev => !prev);
    }, []);

    const handleReset = useCallback(() => {
        setArticle(null);
    }, []);

    const handleGenerate = async () => {
        if (selectedWords.length === 0) return;
        setIsLoading(true);
        setTooltip(null);
        try {
            const result = await onGenerate(selectedWords);
            if (result) {
                setArticle(result);
                setShowTranslation(false);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddWord = async (word: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (addedWords.has(word)) return;
        try {
            const result = await addToVocabularyDeck(word);
            if (result.success) {
                setAddedWords(prev => new Set(prev).add(word));
            }
        } catch (error) {
            console.error(error);
        }
    };

    const selectRandom = (count: number) => {
        const shuffled = [...filteredCards].sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, count).map(c => c.word);
        setSelectedWords(selected);
    };

    return (
        <div className="h-full flex flex-col max-w-2xl mx-auto w-full p-4">
            {/* Header */}
            <div className="flex items-center mb-6">
                <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full mr-2 transition-colors">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                    <h2 className="text-xl font-semibold">阅读练习</h2>
                    <p className="text-xs text-white/50">选择单词生成 AI 短文</p>
                </div>
            </div>

            {/* Main Content */}
            <div
                className="flex-1 overflow-y-auto pr-2 space-y-6 scrollbar-hide relative"
            >

                {/* Word Selection Section */}
                {!article && (
                    <div className="glass-panel p-6 space-y-4">
                        {/* Tabs */}
                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-2 px-2">
                            {tabs.map(tab => {
                                const Icon = tab.icon;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={cn(
                                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap",
                                            activeTab === tab.id
                                                ? "bg-blue-500 text-white shadow-lg shadow-blue-500/25"
                                                : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                                        )}
                                    >
                                        <Icon className="w-3.5 h-3.5" />
                                        {tab.label}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex justify-between items-center">
                            <h3 className="text-sm font-medium text-white/80">选择单词 ({selectedWords.length})</h3>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => selectRandom(5)}
                                    className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-blue-300"
                                >
                                    随机5个
                                </button>
                                <button
                                    onClick={() => setSelectedWords([])}
                                    className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-white/50"
                                >
                                    清空
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2 max-h-[400px] overflow-y-auto p-1 custom-scrollbar">
                            {filteredCards.length > 0 ? (
                                filteredCards.map(card => (
                                    <button
                                        key={card.id}
                                        onClick={() => toggleWord(card.word)}
                                        className={cn(
                                            "px-3 py-1.5 rounded-full text-sm border transition-all duration-200",
                                            selectedWords.includes(card.word)
                                                ? "bg-blue-500/20 border-blue-500/50 text-blue-200 shadow-[0_0_10px_rgba(59,130,246,0.3)]"
                                                : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:border-white/20"
                                        )}
                                    >
                                        {card.word}
                                    </button>
                                ))
                            ) : (
                                <div className="w-full text-center py-10 text-white/30 italic">
                                    暂无已学习的单词，请先添加或学习新词。
                                </div>
                            )}
                        </div>

                        <div className="flex justify-center pt-4">
                            <button
                                onClick={handleGenerate}
                                disabled={selectedWords.length === 0 || isLoading}
                                className={cn(
                                    "px-8 py-3 rounded-xl font-medium flex items-center gap-2 transition-all shadow-lg",
                                    selectedWords.length > 0 && !isLoading
                                        ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:scale-105 hover:shadow-blue-500/25"
                                        : "bg-white/5 text-white/30 cursor-not-allowed"
                                )}
                            >
                                {isLoading ? (
                                    <>
                                        <RefreshCw className="w-5 h-5 animate-spin" />
                                        正在创作中...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-5 h-5" />
                                        生成阅读文章
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* Article Display Section - Rendered via Memoized Component */}
                <AnimatePresence>
                    {article && (
                        <ArticleDisplay
                            title={article.title}
                            htmlContent={processedArticleContent}
                            translation={article.translation}
                            showTranslation={showTranslation}
                            onToggleTranslation={handleToggleTranslation}
                            onReset={handleReset}
                            onClick={handleArticleClick}
                            onMouseUp={handleMouseUp}
                        />
                    )}
                </AnimatePresence>

                {/* Tooltip - Rendered via Portal to avoid z-index/transform issues */}
                {tooltip && typeof document !== 'undefined' && createPortal(
                    <div
                        style={{
                            position: 'fixed',
                            left: tooltip.x,
                            top: tooltip.y - 20,
                            transform: 'translate(-50%, -100%)',
                            zIndex: 10000,
                            pointerEvents: 'auto'
                        }}
                    >
                        <div className="glass-panel px-4 py-2 rounded-xl shadow-xl border-white/20 backdrop-blur-xl bg-black/80 text-sm min-w-[100px] text-center animate-in fade-in zoom-in-95 duration-200">
                            {tooltip.loading ? (
                                <div className="flex items-center justify-center gap-2 text-white/70">
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                    <span className="text-xs">
                                        {tooltip.content ? "获取上下文中..." : "查询中..."}
                                    </span>
                                </div>
                            ) : null}

                            {tooltip.content && (
                                <div className={cn("text-white font-medium", tooltip.loading && "mb-1")}>
                                    {tooltip.content}
                                </div>
                            )}

                            {tooltip.word && !tooltip.loading && (
                                <button
                                    onClick={(e) => handleAddWord(tooltip.word!, e)}
                                    disabled={addedWords.has(tooltip.word!)}
                                    className={cn(
                                        "mt-2 w-full py-1.5 rounded-lg text-xs flex items-center justify-center gap-1 transition-colors",
                                        addedWords.has(tooltip.word!)
                                            ? "bg-green-500/20 text-green-300 cursor-default"
                                            : "bg-white/10 hover:bg-blue-500/20 text-white hover:text-blue-300"
                                    )}
                                >
                                    {addedWords.has(tooltip.word!) ? (
                                        <>
                                            <Check className="w-3 h-3" /> 已添加
                                        </>
                                    ) : (
                                        <>
                                            <Plus className="w-3 h-3" /> 加入生词本
                                        </>
                                    )}
                                </button>
                            )}

                            {/* Arrow */}
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-black/80" />
                        </div>
                    </div>,
                    document.body
                )}

                {/* Debug & Global Style Injection */}
                <style>{`
            /* Enhance selection visibility */
            ::selection {
                background-color: rgba(59, 130, 246, 0.6); /* Blue 500 with 60% opacity */
                color: white;
            }

            .interactive-word {
                /* Ensure interactive words are visible for debugging */
                /* border-bottom: 1px dashed rgba(59, 130, 246, 0.3); */
                cursor: pointer;
            }
            .interactive-word:hover {
                background-color: rgba(59, 130, 246, 0.2);
                border-bottom: 1px solid rgba(59, 130, 246, 0.5);
            }
            
            /* Fix potential mark tag issues */
            mark {
                background-color: rgba(250, 204, 21, 0.3); /* Yellow 400/30 */
                color: inherit;
                padding: 0 2px;
                border-radius: 2px;
            }
            
            /* Ensure tooltip is always on top */
            .tooltip-portal {
                z-index: 10000;
            }
        `}</style>

            </div>
        </div>
    );
}
