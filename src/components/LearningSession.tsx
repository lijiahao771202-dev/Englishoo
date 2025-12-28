import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Flashcard } from './Flashcard';
import { SessionReport } from './SessionReport';
import type { WordCard } from '@/types';
import { Check, X, Volume2 } from 'lucide-react';
import { Rating } from 'ts-fsrs';
import { cn } from '@/lib/utils';
import { playFailSound, playPassSound, playSpellingSuccessSound } from '@/lib/sounds';
import { speak } from '@/lib/tts';
import { EmbeddingService } from '@/lib/embedding';
import { mascotEventBus } from '@/lib/mascot-event-bus';
import { getMascotDialogue } from '@/lib/mascot-dialogues';

interface LearningSessionProps {
  cards: WordCard[];
  onComplete: () => void;
  onRate: (card: WordCard, rating: Rating) => Promise<void>;
  onEnrich: (card: WordCard) => Promise<WordCard | undefined>;
  onUpdateCard: (card: WordCard) => Promise<WordCard>;
  onGenerateExample: (card: WordCard) => Promise<WordCard | undefined>;
  onGenerateMnemonic: (card: WordCard) => Promise<WordCard | undefined>;
  onGenerateMeaning: (card: WordCard) => Promise<WordCard | undefined>;
  onGeneratePhrases: (card: WordCard) => Promise<WordCard | undefined>;
  onGenerateDerivatives: (card: WordCard) => Promise<WordCard | undefined>;
  onGenerateRoots: (card: WordCard) => Promise<WordCard | undefined>;
  onGenerateSyllables: (card: WordCard) => Promise<WordCard | undefined>;
  isEnriching: boolean;
}

type SessionItemType = 'learn' | 'test' | 'choice';

interface SessionItem {
  card: WordCard;
  type: SessionItemType;
}

/**
 * @description 新词学习会话组件
 * 采用“认识”/“不认识”模式。不认识的单词会在当前队列中循环，直到认识为止。
 * 增加“选择题测试”和“拼写测试”环节：
 * 1. 认识 -> 选择题测试 (Choice)
 * 2. 选择题通过 -> 拼写测试 (Test)
 * 3. 拼写测试通过 -> 完成 (Good)
 * 
 * 测试环节采用“穿插”模式，即认识后不会立即测试，而是推迟到后续进行，以加强记忆。
 */
export function LearningSession({
  cards,
  onComplete,
  onRate,
  onEnrich,
  onUpdateCard,
  onGenerateExample,
  onGenerateMnemonic,
  onGenerateMeaning,
  onGeneratePhrases,
  onGenerateDerivatives,
  onGenerateRoots,
  onGenerateSyllables,
  isEnriching
}: LearningSessionProps) {
  // Queue of items (learn, choice, or test tasks)
  const [queue, setQueue] = useState<SessionItem[]>(cards.map(c => ({ card: c, type: 'learn' })));

  // Session Report State
  const [showReport, setShowReport] = useState(false);
  // Use state instead of ref to avoid "access ref during render" lint
  const [startTime] = useState(() => Date.now());
  const [initialCardCount] = useState(cards.length);

  // Spelling Test State
  const [inputValue, setInputValue] = useState('');
  const [testResult, setTestResult] = useState<'correct' | 'incorrect' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Choice Test State
  const [choiceOptions, setChoiceOptions] = useState<WordCard[]>([]);
  const [choiceResult, setChoiceResult] = useState<'correct' | 'incorrect' | null>(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);

  // [NEW] Context Tracking
  const cardLoadedTimeRef = useRef<number>(Date.now());

  const currentItem = queue[0];
  const currentCard = currentItem?.card;
  const mode = currentItem?.type || 'learn';

  // [NEW] Combo Counter
  const [comboCount, setComboCount] = useState(0);

  // Helper to handle combo
  const handleCombo = useCallback(() => {
    setComboCount(prev => {
      const newCombo = prev + 1;
      if (newCombo >= 3) {
        mascotEventBus.emit({
          type: 'COMBO',
          text: `${newCombo}连胜!`,
          reaction: 'combo',
          duration: 2000
        });
      } else {
        mascotEventBus.react('happy');
      }
      return newCombo;
    });
  }, []);

  const handleMistake = useCallback(() => {
    setComboCount(0);
    mascotEventBus.react('sad');
  }, []);

  // Effect: New Card - Mascot Greeting
  useEffect(() => {
    if (mode === 'learn' && currentCard) {
      speak(currentCard.word);
      cardLoadedTimeRef.current = Date.now(); // Reset timer
      // Delay slightly to look natural
      const timer = setTimeout(() => {
        mascotEventBus.say(getMascotDialogue('greeting'), "happy");
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentCard, mode]);

  // Check completion
  useEffect(() => {
    if (queue.length === 0 && !showReport) {
      setShowReport(true);
    }
  }, [queue, showReport]);

  // Helper to generate random options
  const generateOptions = useCallback((correctCard: WordCard) => {
    // 1. Get all potential distractors (other cards in the session)
    let pool = cards.filter(c => c.id !== correctCard.id);

    // 2. If not enough cards in session, maybe we need a fallback?
    // For now, if pool is small, we might have duplicates or fewer options.
    // Ideally we should fetch random words from DB, but let's stick to session cards + duplicates if needed.
    if (pool.length < 3) {
      // Just duplicate to fill up (not ideal but works to prevent crash)
      while (pool.length < 3 && pool.length > 0) {
        pool = [...pool, ...pool];
      }
    }

    if (pool.length === 0) {
      // Extreme edge case: only 1 card in session.
      // In this case, we can't really do a choice test properly.
      // Maybe skip choice test? Or just show 1 option (the correct one).
      return [correctCard];
    }

    // 3. Shuffle and pick 3
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 3);

    // 4. Combine with correct card and shuffle again
    const options = [...selected, correctCard].sort(() => 0.5 - Math.random());
    return options;
  }, [cards]);

  // Initialize Choice Options when entering Choice Mode
  useEffect(() => {
    if (mode === 'choice' && currentCard) {
      setChoiceOptions(generateOptions(currentCard));
      setChoiceResult(null);
      setSelectedChoiceId(null);
      // Auto-play audio
      speak(currentCard.word);
    }
  }, [mode, currentCard, generateOptions]); // Added currentCard.word implicit in currentCard dependency

  // Auto-focus input in test mode
  useEffect(() => {
    if (mode === 'test' && inputRef.current) {
      // Clear previous input when switching to a new test card
      setInputValue('');
      setTestResult(null);

      // Small delay to ensure render
      setTimeout(() => {
        inputRef.current?.focus();
        speak(currentCard.word); // Auto-play audio
      }, 100);
    }
  }, [currentItem, mode]);

  const updateCardInQueue = (updatedCard: WordCard) => {
    setQueue(prev => prev.map(item =>
      item.card.id === updatedCard.id
        ? { ...item, card: updatedCard }
        : item
    ));
  };

  // User clicks "Know" (Check) in Learn Mode
  const handleKnow = useCallback(() => {
    playPassSound();
    // Remove current 'learn' item
    // Insert 'choice' item at a delayed position
    setQueue(prev => {
      const [current, ...rest] = prev;

      // Insert 'choice' task
      const insertIndex = Math.min(rest.length, 3);
      const newItem: SessionItem = { card: current.card, type: 'choice' };
      const newQueue = [...rest];
      newQueue.splice(insertIndex, 0, newItem);

      return newQueue;
    });

    // Mascot Feedback
    const speed = Date.now() - cardLoadedTimeRef.current < 2000 ? 'fast' : 'slow';
    mascotEventBus.say(
      getMascotDialogue('correct', { streak: comboCount, speed }),
      comboCount >= 2 ? 'combo' : (speed === 'fast' ? 'surprised' : 'happy')
    );
    handleCombo();
  }, [comboCount, handleCombo]);

  // User clicks "Don't Know" (X) in Learn Mode
  const handleLoop = () => {
    playFailSound();
    // Move current card to end of queue (Loop it back as 'learn')
    setQueue(prev => {
      const [first, ...rest] = prev;
      return [...rest, first]; // Keep type as 'learn'
    });
    // Mascot Feedback
    mascotEventBus.say(
      getMascotDialogue('incorrect'),
      'sad'
    );
    handleMistake();
  };

  // Handle Choice Selection
  const handleChoiceSelect = useCallback((selectedCard: WordCard) => {
    if (choiceResult) return; // Prevent multiple clicks

    setSelectedChoiceId(selectedCard.id);

    if (!currentCard) return;

    if (selectedCard.id === currentCard.id) {
      setChoiceResult('correct');
      playPassSound();

      mascotEventBus.say(
        getMascotDialogue('correct', { streak: comboCount }),
        comboCount >= 2 ? 'combo' : 'happy'
      );
      handleCombo();

      // Proceed to Spelling Test after a short delay
      setTimeout(() => {
        setQueue(prev => {
          const [current, ...rest] = prev; // Remove 'choice' item

          // Insert 'test' (spelling) item
          const newItem: SessionItem = { card: current.card, type: 'test' };
          const insertIndex = Math.min(rest.length, 2); // Insert slightly sooner
          const newQueue = [...rest];
          newQueue.splice(insertIndex, 0, newItem);

          return newQueue;
        });
      }, 800);
    } else {
      setChoiceResult('incorrect');
      playFailSound();
      mascotEventBus.say(
        getMascotDialogue('incorrect'),
        'thinking'
      );
      handleMistake();

      // Loop back to Learn
      setTimeout(() => {
        setQueue(prev => {
          const [current, ...rest] = prev;
          // Demote to 'learn'
          const newItem: SessionItem = { card: current.card, type: 'learn' };
          // Insert sooner so they review it
          const insertIndex = Math.min(rest.length, 2);
          const newQueue = [...rest];
          newQueue.splice(insertIndex, 0, newItem);

          return newQueue;
        });
      }, 1500);
    }
  }, [choiceResult, currentCard, comboCount, handleCombo, handleMistake]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (mode === 'learn' && e.code === 'Space') {
        // Avoid triggering if user is typing in an input or textarea
        const target = e.target as HTMLElement;
        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

        // Allow Space if:
        // 1. Not an input
        // 2. Is an input, but the default action was prevented (e.g. by Flashcard ghost input saying "not a space char")
        //    This implies the user intends to use the shortcut, not type a space.
        if (isInput && !e.defaultPrevented) {
          return;
        }

        e.preventDefault();
        handleKnow();
      }

      // Choice Mode Shortcuts (1, 2, 3, 4)
      if (mode === 'choice' && !choiceResult) {
        if (['1', '2', '3', '4'].includes(e.key)) {
          const index = parseInt(e.key) - 1;
          if (choiceOptions[index]) {
            handleChoiceSelect(choiceOptions[index]);
          }
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [mode, handleKnow, choiceOptions, choiceResult, handleChoiceSelect]);

  const handleCheckSpelling = async () => {
    if (!inputValue.trim() || !currentCard) return;

    const isCorrect = inputValue.trim().toLowerCase() === currentCard.word.toLowerCase();

    if (isCorrect) {
      setTestResult('correct');
      playSpellingSuccessSound();

      // Mascot Celebration
      mascotEventBus.say(
        getMascotDialogue(comboCount >= 3 ? 'streak' : 'correct', { streak: comboCount }),
        comboCount >= 3 ? 'combo' : 'happy'
      );
      handleCombo();

      // [FIX] Save IMMEDIATELY to prevent data loss if user exits during animation
      // Trigger background knowledge graph update
      EmbeddingService.getInstance().updateConnections(currentCard.word).catch(err => {
        console.error("Failed to update semantic connections:", err);
      });

      // Mark as Good (FSRS will schedule it) - Execute NOW
      onRate(currentCard, Rating.Good).catch(err => {
        console.error("Failed to save progress:", err);
        alert("保存学习进度失败，请检查网络或刷新重试。");
      });

      // Wait a bit to show success state
      setTimeout(async () => {
        // Remove from queue completely
        setQueue(prev => prev.slice(1));
      }, 1000);
    } else {
      setTestResult('incorrect');
      playFailSound();
      mascotEventBus.say(
        getMascotDialogue('incorrect'),
        'determined' // Encourage them to try again (next loop)
      );
      handleMistake();

      // Show correct answer then loop back
      setTimeout(() => {
        // Loop back to LEARN mode (re-learn) because they failed the test
        setQueue(prev => {
          const [current, ...rest] = prev;
          const newItem: SessionItem = { card: current.card, type: 'learn' }; // Demote to learn

          const insertIndex = Math.min(rest.length, 2);
          const newQueue = [...rest];
          newQueue.splice(insertIndex, 0, newItem);

          return newQueue;
        });
        setInputValue('');
        setTestResult(null);
      }, 2000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !testResult) {
      handleCheckSpelling();
    }
    // Allow Space to submit in Spelling Test mode
    if (e.code === 'Space' && !testResult) {
      e.preventDefault(); // Prevent typing the space
      handleCheckSpelling();
    }
  };

  if (!currentItem) {
    if (showReport) {
      return (
        <SessionReport
          isOpen={showReport}
          type="learn"
          startTime={startTime}
          cardsCount={initialCardCount}
          onClose={onComplete}
        />
      );
    }
    return null;
  }

  return (
    <div className="h-full flex flex-col w-full relative pb-40">
      {/* Header Info */}
      <div className="flex justify-between items-center mb-6 px-2">
        <div className={cn(
          "text-sm font-medium px-3 py-1 rounded-full transition-colors",
          mode === 'learn' ? "text-blue-200 bg-blue-500/10" :
            mode === 'choice' ? "text-yellow-200 bg-yellow-500/10" :
              "text-cyan-200 bg-cyan-500/10"
        )}>
          {mode === 'learn' ? '新词学习' : mode === 'choice' ? '选择测试' : '拼写测试'}
        </div>
        <div className="text-sm font-medium text-white/60">
          剩余 {queue.length} 个
        </div>
      </div>

      {/* Card Area */}
      <div className="flex-1 flex flex-col justify-center relative perspective-1000">
        {mode === 'learn' ? (
          <Flashcard
            key={`learn-${currentCard.id}`} // Force re-mount when switching modes/cards
            card={currentCard}
            // autoPlay removed
            alwaysShowContent={true}
            onFlip={() => { }}
            onEnrich={async () => {
              const updated = await onEnrich(currentCard);
              if (updated) updateCardInQueue(updated);
            }}
            onUpdateCard={async (card) => {
              const updated = await onUpdateCard(card);
              // If card is marked as familiar, remove it from the current session immediately
              if (updated.isFamiliar) {
                setQueue(prev => prev.filter(item => item.card.id !== updated.id));
                setInputValue('');
                setTestResult(null);
                playPassSound();
              } else {
                updateCardInQueue(updated);
              }
            }}
            onGenerateExample={async (card) => {
              const updated = await onGenerateExample(card);
              if (updated) updateCardInQueue(updated);
              return updated;
            }}
            onGenerateMnemonic={async (card) => {
              const updated = await onGenerateMnemonic(card);
              if (updated) updateCardInQueue(updated);
              return updated;
            }}
            onGenerateMeaning={async (card) => {
              const updated = await onGenerateMeaning(card);
              if (updated) updateCardInQueue(updated);
              return updated;
            }}
            onGeneratePhrases={async (card) => {
              const updated = await onGeneratePhrases(card);
              if (updated) updateCardInQueue(updated);
              return updated;
            }}
            onGenerateDerivatives={async (card) => {
              const updated = await onGenerateDerivatives(card);
              if (updated) updateCardInQueue(updated);
              return updated;
            }}
            onGenerateRoots={async (card) => {
              const updated = await onGenerateRoots(card);
              if (updated) updateCardInQueue(updated);
              return updated;
            }}
            onGenerateSyllables={async (card) => {
              const updated = await onGenerateSyllables(card);
              if (updated) updateCardInQueue(updated);
              return updated;
            }}
            isEnriching={isEnriching}
          />
        ) : mode === 'choice' ? (
          // Choice Mode UI
          <div className="liquid-glass w-full min-h-[400px] flex flex-col items-center justify-center p-8 relative overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            <div className="text-center w-full max-w-sm">
              {/* Question */}
              <div className="mb-8">
                <div className="text-sm text-white/40 mb-2">请选择正确的释义</div>
                <h2 className="text-4xl font-bold text-white mb-4">{currentCard.word}</h2>
                <div className="flex justify-center gap-2">
                  <span className="text-sm px-2 py-0.5 rounded-full bg-white/10 text-white/60">
                    {currentCard.partOfSpeech}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); speak(currentCard.word); }}
                    className="p-1 rounded-full bg-white/5 hover:bg-white/10 text-primary transition-colors"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Options */}
              <div className="grid grid-cols-1 gap-3 w-full">
                {choiceOptions.map((option, index) => {
                  const isSelected = selectedChoiceId === option.id;
                  const isCorrect = option.id === currentCard.id;

                  // Determine status styles
                  let statusClass = "bg-black/20 border-white/10 hover:bg-white/5";
                  if (choiceResult) {
                    if (isCorrect) {
                      statusClass = "bg-green-500/20 border-green-500/50 text-green-200";
                    } else if (isSelected && !isCorrect) {
                      statusClass = "bg-red-500/20 border-red-500/50 text-red-200";
                    } else {
                      statusClass = "opacity-50 bg-black/20 border-white/5";
                    }
                  }

                  return (
                    <button
                      key={option.id}
                      onClick={() => handleChoiceSelect(option)}
                      disabled={!!choiceResult}
                      className={cn(
                        "relative w-full p-4 rounded-xl border text-left transition-all duration-200 flex items-center gap-3 group",
                        statusClass
                      )}
                    >
                      <span className={cn(
                        "flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold border transition-colors",
                        choiceResult && isCorrect ? "border-green-500 bg-green-500 text-black" :
                          choiceResult && isSelected && !isCorrect ? "border-red-500 bg-red-500 text-white" :
                            "border-white/20 text-white/40 group-hover:border-white/40"
                      )}>
                        {index + 1}
                      </span>
                      <span className="flex-1 line-clamp-2 text-sm">
                        {option.meaning}
                      </span>
                      {choiceResult && isCorrect && <Check className="w-5 h-5 text-green-400" />}
                      {choiceResult && isSelected && !isCorrect && <X className="w-5 h-5 text-red-400" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          // Test Mode UI (Spelling)
          <div className="liquid-glass w-full min-h-[400px] flex flex-col items-center justify-center p-8 relative overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            <div className="text-center w-full max-w-xs">
              {/* Meaning */}
              <div className="mb-8">
                <div className="text-sm text-white/40 mb-2">请拼写出该单词</div>
                <div className="text-2xl font-bold text-white/90 mb-4 line-clamp-3">
                  {currentCard.meaning || '暂无释义'}
                </div>
              </div>

              {/* Audio Hint */}
              <button
                onClick={() => speak(currentCard.word)}
                className="mx-auto mb-8 p-4 rounded-full bg-white/5 hover:bg-white/10 text-primary transition-colors active:scale-95"
              >
                <Volume2 className="w-8 h-8" />
              </button>

              {/* Input Area */}
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={!!testResult}
                  placeholder="输入英文单词..."
                  className={cn(
                    "w-full bg-black/20 border-2 rounded-xl px-4 py-3 text-center text-xl outline-none transition-all",
                    testResult === 'correct' ? "border-green-500 text-green-400" :
                      testResult === 'incorrect' ? "border-red-500 text-red-400" :
                        "border-white/10 focus:border-primary/50 text-white"
                  )}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                />
                {testResult === 'incorrect' && (
                  <div className="absolute -bottom-8 left-0 right-0 text-center text-red-400 text-sm font-medium animate-in fade-in slide-in-from-top-2">
                    正确答案: {currentCard.word}
                  </div>
                )}
              </div>

              {/* Submit Button */}
              {!testResult && (
                <button
                  onClick={handleCheckSpelling}
                  disabled={!inputValue.trim()}
                  className="mt-6 w-full py-3 rounded-xl bg-primary/20 hover:bg-primary/30 text-primary font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  确认
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sticky Controls (Only visible in learn mode) */}
      <div className={cn(
        "fixed bottom-0 left-0 right-0 z-50 p-2 transition-all duration-500 ease-out pointer-events-none",
        mode === 'learn' ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
      )}>
        <div className="max-w-md mx-auto grid grid-cols-2 gap-3 pointer-events-auto">
          <button
            onClick={handleLoop}
            className="flex items-center justify-center gap-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-200 py-3 rounded-xl backdrop-blur-md transition-all active:scale-95"
          >
            <X className="w-5 h-5" />
            <span>不认识</span>
          </button>
          <button
            onClick={handleKnow}
            className="flex items-center justify-center gap-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-200 py-3 rounded-xl backdrop-blur-md transition-all active:scale-95"
          >
            <Check className="w-5 h-5" />
            <span>认识</span>
          </button>
        </div>
      </div>
    </div>
  );
}
