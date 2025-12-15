import { useEffect, useState, Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { AuthModal } from '@/components/AuthModal';
import { Layout } from '@/components/Layout';
import { Flashcard } from '@/components/Flashcard';
import { ReviewControls } from '@/components/ReviewControls';
import { TeachingSession } from '@/components/TeachingSession';
import { SessionReport } from '@/components/SessionReport';
import { ReadingPractice } from '@/components/ReadingPractice';
import { DeckList } from '@/components/DeckList';
import { DeckDetail } from '@/components/DeckDetail';
import { createNewWordCard, scheduleReview, Rating, getReviewPreviews } from '@/lib/fsrs';
import { getAllCards, getDueCards, getNewCards, saveCard, addReviewLog, getActiveCards, initDB, SYSTEM_DECK_GUIDED } from '@/lib/data-source';
import { enrichWord, generateExample, generateMnemonic, generateMeaning, generatePhrases, generateDerivatives, generateRoots, generateSyllables, fetchBasicInfo, generateReadingMaterial, getDefinitionInContext } from '@/lib/deepseek';
import type { WordCard } from '@/types';
import { type RecordLog } from 'ts-fsrs';
import { Settings as SettingsIcon, Save, ArrowLeft, Upload, Loader2, Palette, X, Database, User, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { initTTS } from '@/lib/tts';
import { importTem8Deck } from '@/lib/import-tem8';
import { seedFromLocalJSON } from '@/lib/seed';
import { EmbeddingService, type EmbeddingConfig } from '@/lib/embedding';
import { GlobalSelectionMenu } from '@/components/GlobalSelectionMenu';
import { SettingsModal, DEFAULT_SETTINGS, type LiquidGlassSettings } from '@/components/SettingsModal';
import { UserProfileMenu } from '@/components/UserProfileMenu';
import { AmbientPlayer } from '@/components/AmbientPlayer';
import { motion, AnimatePresence } from 'framer-motion';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ReviewQueuePage } from '@/pages/ReviewQueuePage';
import { ReviewDashboard } from '@/pages/ReviewDashboard';
import { FloatingAIChat } from '@/components/FloatingAIChat';

// 🚀 React.lazy: 路由级代码分割 (Code Splitting for heavy page components)
const KnowledgeGraph = lazy(() => import('@/pages/KnowledgeGraph'));
const GuidedLearningSession = lazy(() => import('./pages/GuidedLearningSession'));
const ShadowingSession = lazy(() => import('./pages/ShadowingSession'));
const DeckClusters = lazy(() => import('@/pages/DeckClusters').then(m => ({ default: m.DeckClusters })));


type View = 'decks' | 'deck-detail' | 'review' | 'learn' | 'teaching' | 'add' | 'settings' | 'reading' | 'knowledge-graph' | 'guided-learning' | 'deck-clusters' | 'shadowing' | 'review-queue' | 'review-dashboard';

/**
 * @description 主应用组件 (App)
 * 核心功能：
 * 1. 多卡包架构 (Deck Architecture)
 * 2. 路由管理 (decks, deck-detail, home, review, learn, add, settings, reading)
 * 3. 数据初始化与状态管理 (IndexedDB, FSRS)
 * 4. 学习模式与复习模式的分流逻辑
 */
function AppContent() {
    const { user, signOut } = useAuth();
    const [showAuthModal, setShowAuthModal] = useState(false);

    // Navigation State
    const [view, setView] = useState<View>('decks');
    const [currentDeckId, setCurrentDeckId] = useState<string | null>(null);

    // Data State (Scoped to Current Deck)
    const [cards, setCards] = useState<WordCard[]>([]);
    // const [dueCards, setDueCards] = useState<WordCard[]>([]);
    const [newCards, setNewCards] = useState<WordCard[]>([]);
    const [sessionQueue, setSessionQueue] = useState<WordCard[]>([]); // Actual cards for current session
    const [currentCardIndex, setCurrentCardIndex] = useState(0);
    const [apiKey, setApiKey] = useState(localStorage.getItem('deepseek_api_key') || '');

    // Add Form State
    const [newWord, setNewWord] = useState('');

    // Loading states
    const [isLoading, setIsLoading] = useState(false);
    const [isEnriching, setIsEnriching] = useState(false);
    const [sessionGroups, setSessionGroups] = useState<Array<{ label: string; items: WordCard[] }>>([]);
    // const [originalDeckIdBeforeQuickSession, setOriginalDeckIdBeforeQuickSession] = useState<string | null>(null);

    // [New] Global Quick Session Handler
    const handleStartQuickSession = async (type: 'review' | 'new') => {
        setIsLoading(true);
        try {
            // Fetch global due cards or new cards
            let cardsToStudy: WordCard[] = [];
            if (type === 'review') {
                cardsToStudy = await getDueCards(); // Global due
            } else {
                cardsToStudy = await getNewCards(); // Global new
            }

            if (cardsToStudy.length === 0) {
                alert(type === 'review' ? "没有待复习的卡片了！" : "没有新卡片了！");
                setIsLoading(false);
                return;
            }

            // Shuffle slightly to mix decks
            cardsToStudy = cardsToStudy.sort(() => Math.random() - 0.5).slice(0, 50); // Limit to 50 for sanity

            setSessionQueue(cardsToStudy);
            setCurrentCardIndex(0);
            // Save current view/deck to return later? Actually DeckList is root so we just return to 'decks'.
            setCurrentDeckId(null); // Clear deck ID to indicate global session? Or keep it null.
            setView('review');

        } catch (e) {
            console.error("Failed to start quick session:", e);
            alert("启动失败");
        } finally {
            setIsLoading(false);
        }
    };
    const [isReviewCardFlipped, setIsReviewCardFlipped] = useState(false);

    // Session Report State
    const [showReport, setShowReport] = useState(false);
    const [sessionStartTime, setSessionStartTime] = useState(0);
    const [sessionRatings, setSessionRatings] = useState({ easy: 0, good: 0, hard: 0, again: 0 });

    // FSRS Previews
    const [reviewPreviews, setReviewPreviews] = useState<RecordLog | undefined>(undefined);

    // Liquid Glass Settings (Lazy Initialization to prevent race condition)
    const [glassSettings, setGlassSettings] = useState<LiquidGlassSettings>(() => {
        try {
            const saved = localStorage.getItem('glass-settings');
            if (saved) {
                return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
            }
        } catch (e) {
            console.error("Failed to load settings", e);
        }
        return DEFAULT_SETTINGS;
    });
    const [isGlassSettingsOpen, setIsGlassSettingsOpen] = useState(false);

    // Apply Settings
    useEffect(() => {
        const root = document.documentElement;
        root.style.setProperty('--glass-background', `rgba(255, 255, 255, ${glassSettings.opacity})`);
        root.style.setProperty('--glass-blur', `${glassSettings.blur}px`);
        root.style.setProperty('--glass-saturation', `${glassSettings.saturation}%`);

        if (glassSettings.backgroundImage) {
            document.body.style.backgroundImage = `url(${glassSettings.backgroundImage})`;
            document.body.style.backgroundSize = 'cover';
            document.body.style.backgroundPosition = 'center';
            document.body.style.backgroundAttachment = 'fixed';
            document.body.style.backgroundRepeat = 'no-repeat';
        } else {
            document.body.style.backgroundImage = '';
        }

        // Save
        localStorage.setItem('glass-settings', JSON.stringify(glassSettings));
    }, [glassSettings]);

    // Save API Key
    useEffect(() => {
        localStorage.setItem('deepseek_api_key', apiKey);
    }, [apiKey]);

    const [isImporting, setIsImporting] = useState(false);
    const [importType, setImportType] = useState<'tem8' | 'test' | null>(null);
    const [importProgress, setImportProgress] = useState<{ count: number, total: number } | null>(null);
    const [isDbReady, setIsDbReady] = useState(false);
    const [dbError, setDbError] = useState<string | null>(null);

    // Session Mode State
    const [sessionMode, setSessionMode] = useState<'new' | 'review' | 'mixed'>('mixed');


    // Embedding Config
    const [embeddingConfig, setEmbeddingConfig] = useState<EmbeddingConfig>(() => {
        return EmbeddingService.getInstance().getConfig();
    });

    const handleEmbeddingConfigChange = (config: EmbeddingConfig) => {
        setEmbeddingConfig(config);
        EmbeddingService.getInstance().updateConfig(config);
    };

    const handleImportTem8 = async () => {
        if (!confirm('确定要导入专八词汇吗？可能需要几秒钟时间。')) return;

        setIsImporting(true);
        setImportType('tem8');
        setImportProgress({ count: 0, total: 0 });
        try {
            const { count, deckId } = await importTem8Deck((c, t) => {
                setImportProgress({ count: c, total: t });
            });
            alert(`成功导入 ${count} 个单词！`);

            // Navigate to the new deck
            if (deckId) {
                handleSelectDeck(deckId);
            }
        } catch (e) {
            console.error(e);
            alert('导入失败，请检查控制台日志。');
        } finally {
            setIsImporting(false);
            setImportType(null);
            setImportProgress(null);
        }
    };

    const handleImportTest = async () => {
        if (!confirm('确定要导入100个测试单词吗？这将生成关联关系，可能需要几分钟。')) return;

        setIsImporting(true);
        setImportType('test');
        setImportProgress({ count: 0, total: 0 });
        try {
            await seedFromLocalJSON((c, t) => {
                setImportProgress({ count: c, total: t });
            });
            alert('导入成功！');
            if (currentDeckId) loadDeckData(currentDeckId);
        } catch (e) {
            console.error(e);
            alert('导入失败，请检查控制台日志。');
        } finally {
            setIsImporting(false);
            setImportType(null);
            setImportProgress(null);
        }
    };

    // Initialize DB on mount
    useEffect(() => {
        // Initialize TTS logic
        initTTS();

        initDB().then(() => {
            setIsDbReady(true);
            // If we have a current deck, load its data
            if (currentDeckId) {
                loadDeckData(currentDeckId);
            }
        }).catch(err => {
            console.error("DB Initialization Failed:", err);
            setDbError(err.message || "Database initialization failed");
        });
    }, []);

    // Load data when deck changes
    useEffect(() => {
        if (currentDeckId) {
            loadDeckData(currentDeckId);
        } else {
            // Clear data when no deck is selected
            setCards([]);

            setNewCards([]);
        }
    }, [currentDeckId]);

    // Review Previews Calculation
    useEffect(() => {
        if (view === 'review' && sessionQueue.length > 0 && sessionQueue[currentCardIndex]) {
            const previews = getReviewPreviews(sessionQueue[currentCardIndex]);
            // @ts-ignore
            setReviewPreviews(previews);
        }
    }, [view, sessionQueue, currentCardIndex]);

    if (!isDbReady) {
        if (dbError) {
            return (
                <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white gap-4 p-8 text-center">
                    <div className="p-4 rounded-full bg-red-500/10 text-red-400">
                        <X className="w-8 h-8" />
                    </div>
                    <h2 className="text-xl font-bold">应用启动失败</h2>
                    <p className="text-white/50 max-w-md font-mono text-sm bg-black/20 p-4 rounded border border-white/10">
                        {dbError}
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                    >
                        重试
                    </button>
                </div>
            );
        }
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                <span className="ml-2">Initializing...</span>
            </div>
        );
    }

    async function loadDeckData(deckId: string) {
        setIsLoading(true);
        try {
            const all = await getAllCards(deckId);
            // const due = await getDueCards(deckId);
            const newC = await getNewCards(deckId);
            setCards(all);

            setNewCards(newC);
        } catch (e) {
            console.error("Failed to load deck data", e);
        } finally {
            setIsLoading(false);
        }
    }

    const handleSaveApiKey = () => {
        localStorage.setItem('deepseek_api_key', apiKey);
        if (currentDeckId) {
            setView('deck-detail');
        } else {
            setView('decks');
        }
    };

    // Navigation Handlers
    const handleSelectDeck = (deckId: string) => {
        if (deckId === SYSTEM_DECK_GUIDED) {
            setView('guided-learning');
        } else {
            setCurrentDeckId(deckId);
            setView('deck-detail');
        }
    };

    const handleBackToDecks = () => {
        setCurrentDeckId(null);
        setView('decks');
    };

    const handleOpenKnowledgeGraph = () => {
        setView('knowledge-graph');
    };

    const handleOpenShadowing = () => {
        setView('shadowing');
    };



    const handleStartSession = async (limits: { newLimit: number; reviewLimit: number; newGroupLimit?: number }) => {
        let queue: WordCard[] = [];
        let groups: Array<{ label: string; items: WordCard[] }> = [];

        // Determine Mode
        let mode: 'new' | 'review' | 'mixed' = 'mixed';
        if (limits.reviewLimit > 0 && limits.newLimit === 0 && (!limits.newGroupLimit || limits.newGroupLimit === 0)) {
            mode = 'review';
        } else if (limits.reviewLimit === 0 && (limits.newLimit > 0 || (limits.newGroupLimit && limits.newGroupLimit > 0))) {
            mode = 'new';
        }
        setSessionMode(mode);

        setIsLoading(true);

        try {
            // [FIX] Fetch fresh data from DB to ensure we rely on persisted state
            // This prevents issues where React state 'newCards' might be stale if handleUpdateCard hasn't fully propagated
            // or if the user quickly re-enters a session.
            const freshNewCards = await getNewCards(currentDeckId || undefined);
            const freshDueCards = await getDueCards(currentDeckId || undefined);

            // [FIX] New: Fetch "Active" cards (New + Learning + Relearning) for Group Mode
            // This ensures unfinished groups are not skipped.
            const freshActiveCards = await getActiveCards(currentDeckId || undefined);

            // Update state to keep UI in sync, but use local variables for queue
            setNewCards(freshNewCards);


            // 1. New Words (Group Mode)
            if (limits.newGroupLimit && limits.newGroupLimit > 0 && currentDeckId) {
                const allDeckCards = cards; // 'cards' state holds all cards for current deck
                const clusters = await EmbeddingService.getInstance().getDeckClusters(currentDeckId, allDeckCards);

                // Filter clusters that have ACTIVE cards (New/Learning/Relearning) using FRESH data
                const actualActiveCards = freshActiveCards;
                const activeCardIds = new Set(actualActiveCards.map(c => c.id));

                // [FIX] Map original index BEFORE filtering to preserve global position
                const clustersWithIndices = clusters.map((c, i) => ({ ...c, originalIndex: i }));

                const clustersWithActiveWords = clustersWithIndices.filter(c =>
                    c.items.some(item => activeCardIds.has(item.id))
                );

                // [FIX] Do NOT slice by newGroupLimit if we want continuous learning "Group 1/N"
                // The limit from DeckDetail might be 1, but we want to start FROM there and continue.
                // If the user clicked "Study New Words", they likely want a session.
                // We'll respect the limit ONLY if it's very specific, but here we assume "Guided Learning" = "All Groups".
                // Let's interpret newGroupLimit as "Start chunk size" if needed, but for now, pass ALL.
                groups = clustersWithActiveWords;

                const groupItems = groups.flatMap(c => c.items);
                // Queue should be populated with ACTIVE items from these groups
                queue = groupItems.filter(item => activeCardIds.has(item.id));

                // Fallback for edge cases
                if (queue.length === 0 && freshNewCards.length > 0) {
                    // Fallback to strict new cards if active logic yields nothing (shouldn't happen if properly aligned)
                    queue = freshNewCards.slice(0, 20);
                }
            }
            // 2. New Words (Legacy Limit Mode)
            else if (limits.newLimit > 0) {
                // Use FRESH data directly
                queue = freshNewCards.slice(0, limits.newLimit);

            }

            // 3. Review Words
            if (limits.reviewLimit > 0) {
                // Use FRESH data directly
                // getDueCards already filters by time, state!=New, and !isFamiliar
                const reviewQueue = freshDueCards.slice(0, limits.reviewLimit);

                if (queue.length > 0 && limits.newLimit > 0) {
                    queue = [...queue, ...reviewQueue];
                } else {
                    queue = reviewQueue;
                }
            }

            if (queue.length === 0) {
                alert("没有符合条件的卡片可供学习或复习。");
                setIsLoading(false);
                return;
            }

            setSessionQueue(queue);
            setSessionGroups(groups);
            setCurrentCardIndex(0);
            setSessionStartTime(Date.now());
            setSessionRatings({ easy: 0, good: 0, hard: 0, again: 0 });
            setShowReport(false);

            setView('guided-learning');
        } catch (error) {
            console.error("Start session error:", error);
            alert("启动学习失败，请重试。");
        } finally {
            setIsLoading(false);
        }
    };



    const handleStartClusterSession = (groups: Array<{ label: string; items: WordCard[]; originalIndex?: number }>) => {
        if (!groups || groups.length === 0) return;

        const allItems = groups.flatMap(g => g.items);
        setSessionQueue(allItems);
        setSessionGroups(groups);

        setCurrentCardIndex(0);
        setSessionStartTime(Date.now());
        setSessionRatings({ easy: 0, good: 0, hard: 0, again: 0 });
        setShowReport(false);

        setView('guided-learning');
    };

    const handleStartTeaching = (limits: { newLimit: number }) => {
        const queue = newCards.slice(0, limits.newLimit);

        if (queue.length === 0) {
            alert("没有新单词可供教学。");
            return;
        }

        setSessionQueue(queue);
        setCurrentCardIndex(0);
        setSessionStartTime(Date.now());
        setSessionRatings({ easy: 0, good: 0, hard: 0, again: 0 });
        setShowReport(false);

        setView('teaching');
    };

    const handleAddCard = async () => {
        if (!newWord || !currentDeckId) return;

        // 1. Create placeholder card
        const card = createNewWordCard(newWord, "正在生成释义...", "unknown", currentDeckId);
        await saveCard(card);

        // 2. Clear UI immediately
        setNewWord('');
        await loadDeckData(currentDeckId);
        setView('deck-detail');

        // 3. Multi-stage enrichment
        if (apiKey) {
            try {
                // Stage 1: Fetch basic info (meaning + partOfSpeech) - fast
                const basicInfo = await fetchBasicInfo(card.word, apiKey);
                const updatedCardWithBasic = {
                    ...card,
                    meaning: basicInfo.meaning,
                    partOfSpeech: basicInfo.partOfSpeech
                };
                await saveCard(updatedCardWithBasic);
                // Refresh data if we are still in the same deck
                if (currentDeckId === card.deckId) {
                    await loadDeckData(currentDeckId);
                }

                // Stage 2: Fetch example and mnemonic in background - non-blocking
                // We don't await this promise chain to keep UI responsive
                Promise.all([
                    generateExample(card.word, apiKey),
                    generateMnemonic(card.word, apiKey)
                ]).then(async ([exampleData, mnemonicData]) => {
                    // Re-fetch latest card state to avoid overwriting user edits if any happened
                    // Note: In a real app we might need better conflict resolution, but for now this is okay
                    // assuming user hasn't edited these specific fields yet.
                    // Better approach: just merge the new fields into the card object we have + re-save

                    const fullyUpdatedCard = {
                        ...updatedCardWithBasic,
                        example: exampleData?.example,
                        exampleMeaning: exampleData?.exampleMeaning,
                        mnemonic: mnemonicData
                    };
                    await saveCard(fullyUpdatedCard);
                    if (currentDeckId === card.deckId) {
                        await loadDeckData(currentDeckId);
                    }
                }).catch(async (err) => {
                    console.error("Background example/mnemonic generation failed:", err);
                    // We don't overwrite the card with error here because basic info is already there.
                    // Maybe just log it or show a toast in a real app.
                });

            } catch (err) {
                console.error("Basic info generation failed:", err);
                const failedCard = {
                    ...card,
                    meaning: "释义生成失败 (请检查API Key)"
                };
                await saveCard(failedCard);
                if (currentDeckId === card.deckId) {
                    await loadDeckData(currentDeckId);
                }
            }
        } else {
            alert("未配置 API Key，无法自动生成释义。请去设置中配置。");
        }
    };

    const processCardReview = async (card: WordCard, rating: Rating) => {
        const { card: updatedCard, log } = scheduleReview(card, rating);
        await saveCard(updatedCard);
        await addReviewLog({ ...log, cardId: card.id });
        return updatedCard;
    };

    const handleRate = async (rating: Rating) => {
        if (!sessionQueue[currentCardIndex]) return;

        // Update session ratings
        setSessionRatings(prev => {
            const newRatings = { ...prev };
            if (rating === Rating.Easy) newRatings.easy++;
            else if (rating === Rating.Good) newRatings.good++;
            else if (rating === Rating.Hard) newRatings.hard++;
            else if (rating === Rating.Again) newRatings.again++;
            return newRatings;
        });

        const currentCard = sessionQueue[currentCardIndex];
        await processCardReview(currentCard, rating);

        setIsReviewCardFlipped(false);

        if (currentCardIndex < sessionQueue.length - 1) {
            setCurrentCardIndex(prev => prev + 1);
        } else {
            setShowReport(true);
        }
    };

    const handleReportClose = async () => {
        setShowReport(false);
        if (currentDeckId) await loadDeckData(currentDeckId);
        setView('deck-detail');
        setCurrentCardIndex(0);
    };

    const handleLearnRate = async (card: WordCard, rating: Rating) => {
        // Use scheduleReview directly to get updated card
        const { card: updatedCard, log } = scheduleReview(card, rating);

        // [DEBUG] Alert state transition for user verification
        // alert(`[DEBUG] Save State: ${card.state} -> ${updatedCard.state}`);

        await addReviewLog({ ...log, cardId: card.id });

        // Use handleUpdateCard to save to DB and update local state arrays
        await handleUpdateCard(updatedCard);
    };

    const handleDashboardReview = (cardsToReview: WordCard[]) => {
        if (cardsToReview.length === 0) return;
        setSessionQueue(cardsToReview);
        setCurrentCardIndex(0);
        setView('review');
    };

    const handleUpdateCard = async (updatedCard: WordCard) => {
        // [CRITICAL] Global ID Safeguard
        if (!updatedCard.id) {
            console.error("[CRITICAL DB ERROR] Attempted to save card without ID!", updatedCard);
            // Try to recover from local state if possible
            const original = cards.find(c => c.word === updatedCard.word); // Fallback lookup
            if (original && original.id) {
                console.warn("Recovered ID from local state:", original.id);
                updatedCard.id = original.id;
            } else {
                alert("保存失败：卡片数据严重损坏 (Missing ID)。请刷新页面重试。");
                return; // ABORT SAVE
            }
        }

        try {
            await saveCard(updatedCard);
            // alert(`[DEBUG] Saved card: ${updatedCard.word}`);
        } catch (e) {
            alert(`[ERROR] Save failed: ${e}`);
            console.error(e);
        }

        // Update local state
        setCards(prev => prev.map(c => c.id === updatedCard.id ? updatedCard : c));

        setNewCards(prev => prev.map(c => c.id === updatedCard.id ? updatedCard : c));
        setSessionQueue(prev => prev.map(c => c.id === updatedCard.id ? updatedCard : c));

        // Update sessionGroups
        setSessionGroups(prevGroups => prevGroups.map(group => ({
            ...group,
            items: group.items.map(item => item.id === updatedCard.id ? updatedCard : item)
        })));

        // Special handling for Familiar logic in Review Mode
        // If marked familiar during review, skip it immediately
        if (view === 'review' && updatedCard.isFamiliar) {
            // Wait a brief moment for animation or state update
            // Logic: Mark current as done/skipped, move to next
            // We treat it similarly to "Easy" or just skip?
            // User said "skip this card, no need to show".
            // So we just advance index.

            setIsReviewCardFlipped(false);

            if (currentCardIndex < sessionQueue.length - 1) {
                setCurrentCardIndex(prev => prev + 1);
            } else {
                alert("复习完成！");
                if (currentDeckId) await loadDeckData(currentDeckId);
                setView('deck-detail');
                setCurrentCardIndex(0);
            }
        }

        return updatedCard;
    };

    // DeepSeek Handlers (Same as before, just ensure they use updatedCard)
    const handleGenerateExample = async (card: WordCard) => {
        if (!apiKey) {
            alert("请先在设置中配置 DeepSeek API Key。");
            return undefined;
        }
        try {
            const { example, exampleMeaning } = await generateExample(card.word, apiKey);
            const updatedCard = { ...card, example, exampleMeaning };
            await handleUpdateCard(updatedCard);
            return updatedCard;
        } catch (e) {
            alert("生成例句失败");
            return undefined;
        }
    };

    const handleGenerateMnemonic = async (card: WordCard) => {
        if (!apiKey) {
            alert("请先在设置中配置 DeepSeek API Key。");
            return undefined;
        }
        try {
            const mnemonic = await generateMnemonic(card.word, apiKey);
            const updatedCard = { ...card, mnemonic };
            await handleUpdateCard(updatedCard);
            return updatedCard;
        } catch (e) {
            alert("生成助记失败");
            return undefined;
        }
    };

    const handleGenerateMeaning = async (card: WordCard) => {
        if (!apiKey) {
            alert("请先在设置中配置 DeepSeek API Key。");
            return undefined;
        }
        try {
            const { meaning, partOfSpeech } = await generateMeaning(card.word, apiKey);
            const updatedCard = { ...card, meaning, partOfSpeech };
            await handleUpdateCard(updatedCard);
            return updatedCard;
        } catch (e) {
            alert("生成释义失败");
            return undefined;
        }
    };

    // Unused MindMap handlers removed
    // const handleGenerateMindMap = ...
    // const handleSaveMindMap = ...

    const handleGeneratePhrases = async (card: WordCard) => {
        if (!apiKey) {
            alert("请先在设置中配置 DeepSeek API Key。");
            return undefined;
        }
        try {
            const phrases = await generatePhrases(card.word, apiKey);
            const updatedCard = { ...card, phrases };
            await handleUpdateCard(updatedCard);
            return updatedCard;
        } catch (e) {
            alert("生成搭配失败");
            return undefined;
        }
    };

    const handleGenerateDerivatives = async (card: WordCard) => {
        if (!apiKey) {
            alert("请先在设置中配置 DeepSeek API Key。");
            return undefined;
        }
        try {
            const derivatives = await generateDerivatives(card.word, apiKey);
            const updatedCard = { ...card, derivatives };
            await handleUpdateCard(updatedCard);
            return updatedCard;
        } catch (e) {
            alert("生成派生词失败");
            return undefined;
        }
    };

    const handleGenerateRoots = async (card: WordCard) => {
        if (!apiKey) {
            alert("请先在设置中配置 DeepSeek API Key。");
            return undefined;
        }
        try {
            const roots = await generateRoots(card.word, apiKey);
            const updatedCard = { ...card, roots };
            await handleUpdateCard(updatedCard);
            return updatedCard;
        } catch (e) {
            alert("生成词根失败");
            return undefined;
        }
    };

    const handleGenerateSyllables = async (card: WordCard) => {
        if (!apiKey) {
            alert("请先在设置中配置 DeepSeek API Key。");
            return undefined;
        }
        try {
            const syllables = await generateSyllables(card.word, apiKey);
            const updatedCard = { ...card, syllables };
            await handleUpdateCard(updatedCard);
            return updatedCard;
        } catch (e) {
            alert("生成音节拆分失败");
            return undefined;
        }
    };

    const handleEnrich = async (card: WordCard) => {
        if (!apiKey) {
            alert("请先在设置中配置 DeepSeek API Key。");
            return undefined;
        }

        setIsEnriching(true);
        try {
            const data = await enrichWord(card.word, apiKey);
            const updatedCard = { ...card, ...data };
            await handleUpdateCard(updatedCard);
            return updatedCard;
        } catch (e) {
            alert("单词信息生成失败，请检查 API Key 是否正确。");
            return undefined;
        } finally {
            setIsEnriching(false);
        }
    };

    const handleGenerateReadingMaterial = async (words: string[]) => {
        if (!apiKey) {
            alert("请先在设置中配置 DeepSeek API Key。");
            return undefined;
        }
        try {
            return await generateReadingMaterial(words, apiKey);
        } catch (e) {
            alert("生成阅读材料失败");
            return undefined;
        }
    };

    const handleGetDefinition = async (word: string, context: string) => {
        if (!apiKey) return undefined;
        try {
            return await getDefinitionInContext(word, context, apiKey);
        } catch (e) {
            console.error("Definition lookup failed", e);
            return undefined;
        }
    };

    // Render Helpers
    if (isLoading && view !== 'decks' && view !== 'settings') {
        // Only show loading for data-heavy views, not initial deck list (handled inside DeckList)
        return (
            <Layout className="flex items-center justify-center h-screen">
                <div className="animate-pulse text-xl font-light">加载中...</div>
            </Layout>
        );
    }

    return (
        <Layout>
            {/* Liquid Glass Distortion Filter */}
            <svg style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}>
                <defs>
                    <filter id="liquid-distortion">
                        <feTurbulence type="fractalNoise" baseFrequency={glassSettings.distortionFrequency} numOctaves="3" result="noise" seed="1" />
                        <feDisplacementMap in="SourceGraphic" in2="noise" scale={glassSettings.distortionScale} xChannelSelector="R" yChannelSelector="G" />
                    </filter>
                </defs>
            </svg>

            {/* Session Report for Review Mode */}
            <SessionReport
                isOpen={showReport}
                type="review"
                startTime={sessionStartTime}
                cardsCount={sessionQueue.length}
                ratings={sessionRatings}
                onClose={handleReportClose}
            />

            <SettingsModal
                isOpen={isGlassSettingsOpen}
                onClose={() => setIsGlassSettingsOpen(false)}
                settings={glassSettings}
                onSettingsChange={setGlassSettings}
                onRestoreDefaults={() => setGlassSettings(DEFAULT_SETTINGS)}
                embeddingConfig={embeddingConfig}
                onEmbeddingConfigChange={handleEmbeddingConfigChange}
                apiKey={apiKey}
                onApiKeyChange={setApiKey}
            />

            {/* Auth Modal */}
            <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />



            {/* Top Right Controls (Aggregated) */}
            <div className="fixed top-4 right-4 z-40 flex items-center gap-3">
                {/* User Profile / Login */}
                {user ? (
                    <>
                        <AmbientPlayer />
                        <UserProfileMenu onOpenGlobalSettings={() => setIsGlassSettingsOpen(true)} />
                    </>
                ) : (
                    <button
                        onClick={() => setShowAuthModal(true)}
                        className="px-4 py-2 rounded-full bg-white/10 hover:bg-blue-500/20 text-white/80 hover:text-blue-400 transition-colors backdrop-blur-md border border-white/20 flex items-center gap-2 text-sm font-medium"
                    >
                        <User className="w-4 h-4" />
                        登录 / 注册
                    </button>
                )}
            </div>

            <GlobalSelectionMenu />

            {/* 全局 AI 聊天助手 - 上下文感知模式 */}
            <FloatingAIChat
                currentView={view}
                apiKey={apiKey}
                contextData={{
                    cards,
                    dueCount: cards.filter(c => c.state !== 0 && !c.isFamiliar && c.due && new Date(c.due) < new Date()).length,
                    newCount: newCards.length,
                    totalCards: cards.length,
                }}
            />

            {/* Header Removed as per user request */}

            {/* Main Content */}
            {/* Main Content */}
            <main className="container mx-auto px-4 pt-12 pb-12 min-h-screen">
                <AnimatePresence mode="wait">
                    {view === 'decks' && (
                        <motion.div
                            key="decks"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.3 }}
                        >
                            <DeckList
                                onSelectDeck={handleSelectDeck}
                                onOpenKnowledgeGraph={handleOpenKnowledgeGraph}
                                onOpenShadowing={handleOpenShadowing}
                                onStartQuickSession={handleStartQuickSession}
                            />
                        </motion.div>
                    )}

                    {view === 'knowledge-graph' && (
                        <motion.div
                            key="knowledge-graph"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.05 }}
                            transition={{ duration: 0.3 }}
                            className="fixed inset-0 z-50 bg-slate-900"
                        >
                            <Suspense fallback={<LoadingSpinner />}>
                                <KnowledgeGraph
                                    onBack={() => currentDeckId ? setView('deck-detail') : setView('decks')}
                                    deckId={currentDeckId || undefined}
                                />
                            </Suspense>
                        </motion.div>
                    )}

                    {view === 'deck-detail' && currentDeckId && (
                        <motion.div
                            key="deck-detail"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.3 }}
                        >
                            <DeckDetail
                                deckId={currentDeckId}
                                onBack={handleBackToDecks}
                                onStartSession={handleStartSession}
                                onStartTeaching={handleStartTeaching}
                                onReadingPractice={() => setView('reading')}
                                onAddWord={() => setView('add')}
                                onUpdateCard={handleUpdateCard}
                                onGenerateExample={handleGenerateExample}
                                onGenerateMnemonic={handleGenerateMnemonic}
                                onGenerateMeaning={handleGenerateMeaning}
                                onGeneratePhrases={handleGeneratePhrases}
                                onGenerateDerivatives={handleGenerateDerivatives}
                                onGenerateRoots={handleGenerateRoots}
                                onGenerateSyllables={handleGenerateSyllables}
                                onEnrich={handleEnrich}
                                isEnriching={isEnriching}
                                onOpenKnowledgeGraph={handleOpenKnowledgeGraph}
                                onOpenDeckClusters={() => setView('deck-clusters')}
                                onOpenReviewDashboard={() => setView('review-dashboard')}
                            />
                        </motion.div>
                    )}

                    {view === 'review-dashboard' && currentDeckId && (
                        <motion.div
                            key="review-dashboard"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.3 }}
                        >
                            <ReviewDashboard
                                onBack={() => setView('deck-detail')}
                                cards={cards}
                                onStartReview={handleDashboardReview}
                            />
                        </motion.div>
                    )}

                    {view === 'review-queue' && currentDeckId && (
                        <ReviewQueuePage
                            deckId={currentDeckId}
                            onBack={() => setView('deck-detail')}
                        />
                    )}

                    {view === 'deck-clusters' && currentDeckId && (
                        <motion.div
                            key="deck-clusters"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.05 }}
                            transition={{ duration: 0.3 }}
                            className="h-full"
                        >
                            <Suspense fallback={<LoadingSpinner />}>
                                <DeckClusters
                                    deckId={currentDeckId}
                                    onBack={() => setView('deck-detail')}
                                    cards={cards}
                                    onStartSession={handleStartClusterSession}
                                />
                            </Suspense>
                        </motion.div>
                    )}

                    {view === 'guided-learning' && (
                        <motion.div
                            key="guided-learning"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.05 }}
                            transition={{ duration: 0.3 }}
                            className="fixed inset-0 z-50 bg-slate-50 overflow-hidden"
                        >
                            <Suspense fallback={<LoadingSpinner />}>
                                <GuidedLearningSession
                                    onBack={() => currentDeckId ? setView('deck-detail') : setView('decks')}
                                    apiKey={apiKey}
                                    cards={sessionQueue}
                                    onRate={handleLearnRate}
                                    sessionGroups={sessionGroups}
                                    onUpdateCard={handleUpdateCard}
                                    sessionMode={sessionMode}
                                />
                            </Suspense>
                        </motion.div>
                    )}

                    {view === 'shadowing' && (
                        <motion.div
                            key="shadowing"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.05 }}
                            transition={{ duration: 0.3 }}
                            className="fixed inset-0 z-50 bg-slate-950 overflow-hidden"
                        >
                            <Suspense fallback={<LoadingSpinner />}>
                                <ShadowingSession
                                    onBack={() => setView('decks')}
                                />
                            </Suspense>
                        </motion.div>
                    )}

                    {view === 'teaching' && (
                        <motion.div
                            key="teaching"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.05 }}
                            transition={{ duration: 0.3 }}
                            className="h-full flex flex-col"
                        >
                            <div className="flex items-center mb-4">
                                <button onClick={handleReportClose} className="p-2 hover:bg-white/10 rounded-full mr-2">
                                    <ArrowLeft className="w-5 h-5" />
                                </button>
                                <span className="text-sm opacity-60">沉浸导学模式</span>
                            </div>

                            <TeachingSession
                                cards={sessionQueue}
                                onBack={handleReportClose}
                                onComplete={handleReportClose}
                                onGenerateExample={handleGenerateExample}
                                onGenerateMnemonic={handleGenerateMnemonic}
                                onGenerateRoots={handleGenerateRoots}
                                onGenerateSyllables={handleGenerateSyllables}
                                onGenerateMeaning={handleGenerateMeaning}
                            />
                        </motion.div>
                    )}

                    {view === 'review' && sessionQueue.length > 0 && (
                        <motion.div
                            key="review"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.05 }}
                            transition={{ duration: 0.3 }}
                            className="h-full flex flex-col relative"
                        >
                            <div className="flex items-center mb-4">
                                <button onClick={() => setView('deck-detail')} className="p-2 hover:bg-white/10 rounded-full mr-2">
                                    <ArrowLeft className="w-5 h-5" />
                                </button>
                                <span className="text-sm opacity-60">复习 {currentCardIndex + 1} / {sessionQueue.length}</span>
                            </div>

                            <div className="flex-1 flex flex-col justify-center pb-40 overflow-y-auto no-scrollbar">
                                <Flashcard
                                    key={sessionQueue[currentCardIndex].id}
                                    card={sessionQueue[currentCardIndex]}
                                    flipped={isReviewCardFlipped}
                                    onFlip={setIsReviewCardFlipped}
                                    onEnrich={() => handleEnrich(sessionQueue[currentCardIndex])}
                                    onUpdateCard={handleUpdateCard}
                                    onGenerateExample={handleGenerateExample}
                                    onGenerateMnemonic={handleGenerateMnemonic}
                                    onGeneratePhrases={handleGeneratePhrases}
                                    onGenerateDerivatives={handleGenerateDerivatives}
                                    onGenerateRoots={handleGenerateRoots}
                                    onGenerateSyllables={handleGenerateSyllables}
                                    isEnriching={isEnriching}
                                />
                            </div>

                            {/* Sticky Controls */}
                            <div className={cn(
                                "fixed bottom-0 left-0 right-0 z-50 p-2 transition-all duration-500 ease-out pointer-events-none",
                                isReviewCardFlipped ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
                            )}>
                                <div className="max-w-md mx-auto pointer-events-auto">
                                    <ReviewControls onRate={handleRate} previews={reviewPreviews} />
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {view === 'reading' && (
                        <motion.div
                            key="reading"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.3 }}
                        >
                            <ReadingPractice
                                cards={cards}
                                onBack={() => setView('deck-detail')}
                                onGenerate={handleGenerateReadingMaterial}
                                onGetDefinition={handleGetDefinition}
                            />
                        </motion.div>
                    )}

                    {view === 'add' && (
                        <motion.div
                            key="add"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.3 }}
                            className="space-y-6"
                        >
                            <div className="flex items-center">
                                <button onClick={() => setView('deck-detail')} className="p-2 hover:bg-white/10 rounded-full mr-2">
                                    <ArrowLeft className="w-5 h-5" />
                                </button>
                                <h2 className="text-xl font-semibold">添加新单词</h2>
                            </div>

                            <div className="glass-panel p-6 space-y-4">
                                <div>
                                    <label className="text-xs text-muted-foreground ml-1">单词</label>
                                    <input
                                        value={newWord}
                                        onChange={(e) => setNewWord(e.target.value)}
                                        className="w-full bg-transparent border-b border-white/20 p-2 text-xl focus:outline-none focus:border-blue-500 transition-colors"
                                        placeholder="例如：Ephemeral"
                                    />
                                </div>

                                <button
                                    onClick={handleAddCard}
                                    disabled={!newWord}
                                    className="w-full glass-button py-3 mt-4 font-semibold disabled:opacity-50"
                                >
                                    添加并生成释义
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {view === 'settings' && (
                        <motion.div
                            key="settings"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.3 }}
                            className="space-y-6"
                        >
                            <div className="flex items-center">
                                <button onClick={() => currentDeckId ? setView('deck-detail') : setView('decks')} className="p-2 hover:bg-white/10 rounded-full mr-2">
                                    <ArrowLeft className="w-5 h-5" />
                                </button>
                                <h2 className="text-xl font-semibold">设置</h2>
                            </div>

                            <div className="glass-panel p-6 space-y-4">
                                <div>
                                    <label className="text-sm font-medium mb-2 block">DeepSeek API Key</label>
                                    <input
                                        value={apiKey}
                                        onChange={(e) => setApiKey(e.target.value)}
                                        type="password"
                                        className="w-full bg-white/5 border border-white/10 rounded-lg p-3 focus:outline-none focus:border-blue-500 transition-colors"
                                        placeholder="sk-..."
                                    />
                                    <p className="text-xs text-muted-foreground mt-2">
                                        用于 AI 生成功能。密钥仅存储在本地浏览器中。
                                    </p>
                                </div>

                                <button
                                    onClick={handleSaveApiKey}
                                    className="w-full glass-button py-3 mt-4 font-semibold"
                                >
                                    <Save className="w-4 h-4 inline mr-2" /> 保存设置
                                </button>
                            </div>

                            {/* UI Appearance Settings */}
                            <div className="glass-panel p-6 space-y-4">
                                <h3 className="text-lg font-medium mb-2">外观设置</h3>
                                <button
                                    onClick={() => setIsGlassSettingsOpen(true)}
                                    className="w-full glass-button py-3 font-semibold flex items-center justify-center gap-2"
                                >
                                    <Palette className="w-4 h-4" /> 调整液态玻璃效果
                                </button>
                            </div>

                            {/* Data Management Section */}
                            <div className="glass-panel p-6 space-y-4">
                                <h3 className="text-lg font-medium mb-2">数据管理</h3>
                                <div className="space-y-2">
                                    <button
                                        onClick={handleImportTem8}
                                        disabled={isImporting}
                                        className="w-full glass-button py-3 font-semibold flex items-center justify-center gap-2 disabled:opacity-50 relative overflow-hidden"
                                    >
                                        {isImporting && importType === 'tem8' && importProgress && importProgress.total > 0 && (
                                            <div
                                                className="absolute left-0 top-0 bottom-0 bg-white/10 transition-all duration-300"
                                                style={{ width: `${(importProgress.count / importProgress.total) * 100}%` }}
                                            />
                                        )}
                                        <div className="relative z-10 flex items-center gap-2">
                                            {isImporting && importType === 'tem8' ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    {importProgress ? `导入中 ${importProgress.count}/${importProgress.total}` : '导入中...'}
                                                </>
                                            ) : (
                                                <>
                                                    <Upload className="w-4 h-4" />
                                                    导入专八核心词汇 (Level8)
                                                </>
                                            )}
                                        </div>
                                    </button>

                                    <button
                                        onClick={handleImportTest}
                                        disabled={isImporting}
                                        className="w-full glass-button py-3 font-semibold flex items-center justify-center gap-2 disabled:opacity-50 relative overflow-hidden"
                                    >
                                        {isImporting && importType === 'test' && importProgress && importProgress.total > 0 && (
                                            <div
                                                className="absolute left-0 top-0 bottom-0 bg-white/10 transition-all duration-300"
                                                style={{ width: `${(importProgress.count / importProgress.total) * 100}%` }}
                                            />
                                        )}
                                        <div className="relative z-10 flex items-center gap-2">
                                            {isImporting && importType === 'test' ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    {importProgress ? `导入中 ${importProgress.count}/${importProgress.total}` : '导入中...'}
                                                </>
                                            ) : (
                                                <>
                                                    <Database className="w-4 h-4" />
                                                    导入100测试词 (Level 8)
                                                </>
                                            )}
                                        </div>
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
        </Layout>
    );
}

// Wrapper component with AuthProvider
function App() {
    return (
        <AuthProvider>
            <AppContent />
        </AuthProvider>
    );
}

export default App;
