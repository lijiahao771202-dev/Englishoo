import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Volume2, Brain, BookOpen, ArrowRight, Check, X, RefreshCw } from 'lucide-react';
import type { WordCard } from '@/types';
import { cn } from '@/lib/utils';
import { FormattedText } from './FormattedText';
import { speak } from '@/lib/tts';

interface TeachingSessionProps {
  cards: WordCard[];
  onBack: () => void;
  onComplete: () => void;
  
  // AI Generators
  onGenerateExample: (card: WordCard) => Promise<WordCard | undefined>;
  onGenerateMnemonic: (card: WordCard) => Promise<WordCard | undefined>;
  onGenerateRoots: (card: WordCard) => Promise<WordCard | undefined>;
  onGenerateSyllables: (card: WordCard) => Promise<WordCard | undefined>;
  onGenerateMeaning: (card: WordCard) => Promise<WordCard | undefined>;
}

type Step = 'priming' | 'structure' | 'context' | 'connection' | 'quiz';

export function TeachingSession({
  cards,
  onBack,
  onComplete,
  onGenerateExample,
  onGenerateMnemonic,
  onGenerateRoots,
  onGenerateSyllables,
  onGenerateMeaning
}: TeachingSessionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [step, setStep] = useState<Step>('priming');
  const [currentCard, setCurrentCard] = useState<WordCard>(cards[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Quiz state
  const [quizOptions, setQuizOptions] = useState<string[]>([]);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isQuizCorrect, setIsQuizCorrect] = useState<boolean | null>(null);

  useEffect(() => {
    if (currentIndex < cards.length) {
      setCurrentCard(cards[currentIndex]);
      setStep('priming');
      setSelectedOption(null);
      setIsQuizCorrect(null);
      preloadQueue(currentIndex);
    } else {
      onComplete();
    }
  }, [currentIndex]);

  // Keep currentCard synced with updates from parent (e.g. background generation)
  // without resetting the step
  useEffect(() => {
    if (cards[currentIndex]) {
        setCurrentCard(cards[currentIndex]);
    }
  }, [cards, currentIndex]);

  const preloadQueue = async (startIndex: number) => {
      // Preload current card and next 2 cards
      const queue = cards.slice(startIndex, startIndex + 3);
      
      for (const card of queue) {
          // Check and trigger missing fields
          // We don't await here to run in parallel, but for stability we might want sequential per card
          // Let's use Promise.all for independent fields of a single card
          
          const tasks = [];
          
          if (!card.syllables) tasks.push(onGenerateSyllables(card));
          if (!card.roots) tasks.push(onGenerateRoots(card));
          if (!card.example) tasks.push(onGenerateExample(card));
          if (!card.mnemonic) tasks.push(onGenerateMnemonic(card));
          if (!card.meaning) tasks.push(onGenerateMeaning(card)); // Should exist but just in case
          
          if (tasks.length > 0) {
              // Run all enrichments for this card
              Promise.all(tasks).catch(e => console.error("Preload failed for", card.word, e));
          }
      }
  };

  const handleNextStep = async () => {
    const steps: Step[] = ['priming', 'structure', 'context', 'connection', 'quiz'];
    const currentStepIndex = steps.indexOf(step);
    
    if (currentStepIndex < steps.length - 1) {
      const nextStep = steps[currentStepIndex + 1];
      
      // Data check before moving to next step
      if (nextStep === 'structure' && (!currentCard.syllables || !currentCard.roots)) {
        setIsLoading(true);
        try {
          let updated = currentCard;
          if (!updated.syllables) {
            const res = await onGenerateSyllables(updated);
            if (res) updated = res;
          }
          if (!updated.roots) {
            const res = await onGenerateRoots(updated);
            if (res) updated = res;
          }
          setCurrentCard(updated);
        } finally {
          setIsLoading(false);
        }
      }
      
      if (nextStep === 'context' && !currentCard.example) {
        setIsLoading(true);
        try {
           const res = await onGenerateExample(currentCard);
           if (res) setCurrentCard(res);
        } finally {
          setIsLoading(false);
        }
      }

      if (nextStep === 'connection' && !currentCard.mnemonic) {
         setIsLoading(true);
         try {
            const res = await onGenerateMnemonic(currentCard);
            if (res) setCurrentCard(res);
         } finally {
           setIsLoading(false);
         }
      }

      if (nextStep === 'quiz') {
        prepareQuiz();
      }

      setStep(nextStep);
    } else {
      // Finished this card
      setCurrentIndex(prev => prev + 1);
    }
  };

  const prepareQuiz = () => {
    // Generate random options
    const otherCards = cards.filter(c => c.id !== currentCard.id);
    const distractors = otherCards
      .sort(() => 0.5 - Math.random())
      .slice(0, 2)
      .map(c => c.meaning);
    
    // Fallback if not enough cards
    while (distractors.length < 2) {
      distractors.push('其他释义...');
    }

    const options = [currentCard.meaning, ...distractors].sort(() => 0.5 - Math.random());
    setQuizOptions(options);
  };

  const handleQuizSelect = (option: string) => {
    setSelectedOption(option);
    const correct = option === currentCard.meaning;
    setIsQuizCorrect(correct);
    
    if (correct) {
      // Play success sound or effect
      setTimeout(() => {
        handleNextStep();
      }, 1500);
    }
  };

  const playAudio = () => {
    setIsPlaying(true);
    speak(currentCard.word);
    setTimeout(() => setIsPlaying(false), 2000);
  };

  // Auto-play audio when entering priming step
  useEffect(() => {
    if (step === 'priming') {
      const timer = setTimeout(() => playAudio(), 500);
      return () => clearTimeout(timer);
    }
  }, [step, currentCard]);

  const progress = ((currentIndex) / cards.length) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white relative overflow-hidden flex flex-col">
      {/* Dynamic Background based on step */}
      <motion.div 
        className="absolute inset-0 z-0 opacity-30"
        animate={{
          background: step === 'priming' ? 'radial-gradient(circle at 50% 50%, #0ea5e9 0%, transparent 70%)' :
                      step === 'structure' ? 'radial-gradient(circle at 80% 20%, #8b5cf6 0%, transparent 70%)' :
                      step === 'context' ? 'radial-gradient(circle at 20% 80%, #10b981 0%, transparent 70%)' :
                      step === 'connection' ? 'radial-gradient(circle at 50% 30%, #f59e0b 0%, transparent 70%)' :
                      'radial-gradient(circle at 50% 50%, #ec4899 0%, transparent 70%)'
        }}
        transition={{ duration: 1 }}
      />

      {/* Header */}
      <div className="relative z-10 px-6 py-4 flex items-center justify-between">
        <button onClick={onBack} className="p-2 rounded-full hover:bg-white/10 transition-colors">
          <ArrowLeft className="w-6 h-6 text-white/70" />
        </button>
        
        {/* Liquid Progress Bar */}
        <div className="flex-1 mx-6 h-2 bg-white/10 rounded-full overflow-hidden relative">
           <motion.div 
             className="absolute top-0 left-0 h-full bg-gradient-to-r from-cyan-400 to-blue-500"
             initial={{ width: 0 }}
             animate={{ width: `${progress}%` }}
             transition={{ duration: 0.5 }}
           />
        </div>

        <div className="text-sm text-white/50 font-mono">
          {currentIndex + 1} / {cards.length}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative z-10 flex flex-col items-center justify-center p-6">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4"
            >
              <RefreshCw className="w-12 h-12 text-cyan-400 animate-spin" />
              <p className="text-white/50 text-sm animate-pulse">AI 正在思考中...</p>
            </motion.div>
          ) : (
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="w-full max-w-md"
            >
              {/* Step 1: Priming (Audio) */}
              {step === 'priming' && (
                <div className="flex flex-col items-center gap-12">
                  <div className="relative group cursor-pointer" onClick={playAudio}>
                    {/* Ripple Effect */}
                    <div className={cn(
                      "absolute inset-0 bg-cyan-500/20 rounded-full blur-xl transition-all duration-500",
                      isPlaying ? "animate-ping opacity-75" : "animate-pulse opacity-50"
                    )} />
                    <div className={cn(
                      "absolute -inset-4 bg-cyan-500/10 rounded-full blur-2xl transition-all duration-500",
                      isPlaying ? "animate-pulse scale-110" : "scale-100"
                    )} />
                    
                    <div className={cn(
                      "relative w-32 h-32 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center shadow-[0_0_40px_rgba(8,145,178,0.3)] transition-all duration-300",
                      isPlaying ? "scale-95 border-cyan-400/50" : "group-hover:scale-105"
                    )}>
                      <Volume2 className={cn(
                        "w-12 h-12 transition-colors duration-300",
                        isPlaying ? "text-cyan-400" : "text-cyan-300"
                      )} />
                    </div>
                  </div>
                  
                  <div className="text-center space-y-2">
                    <h2 className="text-2xl font-light text-white/90">先听一听</h2>
                    <p className="text-white/50">你能猜出这个单词的拼写吗？</p>
                  </div>

                  <button 
                    onClick={handleNextStep}
                    className="mt-8 px-8 py-3 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-white/80 transition-all flex items-center gap-2 group"
                  >
                    <span>揭晓答案</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              )}

              {/* Step 2: Structure (Word Analysis) */}
              {step === 'structure' && (
                <div className="glass-panel p-8 flex flex-col items-center gap-8">
                   <div className="text-center">
                      <motion.h1 
                        className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-white to-white/60 mb-2"
                        initial={{ filter: "blur(10px)" }}
                        animate={{ filter: "blur(0px)" }}
                        transition={{ duration: 0.8 }}
                      >
                        {currentCard.word}
                      </motion.h1>
                      <div className="flex items-center justify-center gap-2 text-white/50">
                         <span className="px-2 py-0.5 rounded bg-white/5 text-sm border border-white/5">{currentCard.partOfSpeech}</span>
                         <Volume2 className="w-4 h-4 cursor-pointer hover:text-cyan-400 transition-colors" onClick={playAudio} />
                      </div>
                   </div>

                   {/* Syllables Breakdown */}
                   <div className="w-full space-y-4">
                      <div className="space-y-2">
                        <div className="text-xs text-white/40 uppercase tracking-wider font-bold">音节拆分</div>
                        <div className="flex justify-center gap-1">
                           {currentCard.syllables ? (
                             currentCard.syllables.split(/[-·.]/).map((syl, i) => (
                               <motion.span 
                                 key={i}
                                 initial={{ opacity: 0, y: 10 }}
                                 animate={{ opacity: 1, y: 0 }}
                                 transition={{ delay: i * 0.1 }}
                                 className="px-3 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 font-mono text-lg"
                               >
                                 {syl}
                               </motion.span>
                             ))
                           ) : (
                             <span className="text-white/50">{currentCard.word}</span>
                           )}
                        </div>
                      </div>

                      {/* Roots */}
                      {currentCard.roots && currentCard.roots.length > 0 && (
                        <div className="space-y-2 mt-6">
                          <div className="text-xs text-white/40 uppercase tracking-wider font-bold">词根词源</div>
                          <div className="grid gap-2">
                            {currentCard.roots.map((root, i) => (
                              <motion.div 
                                key={i}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.3 + i * 0.1 }}
                                className="p-3 rounded-lg bg-white/5 border border-white/5 flex items-center justify-between"
                              >
                                <span className="font-bold text-purple-300">{root.root}</span>
                                <span className="text-white/60 text-sm">{root.meaning}</span>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      )}
                   </div>

                   <button 
                    onClick={handleNextStep}
                    className="w-full py-3 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 font-bold transition-colors mt-4"
                  >
                    下一步：放入语境
                  </button>
                </div>
              )}

              {/* Step 3: Context (Example) */}
              {step === 'context' && (
                <div className="glass-panel p-8 flex flex-col gap-6">
                  <div className="flex items-center gap-3 text-green-300 mb-2">
                    <BookOpen className="w-6 h-6" />
                    <h3 className="font-bold text-lg">语境沉浸</h3>
                  </div>

                  <div className="relative">
                     <div className="absolute -left-4 top-0 bottom-0 w-1 bg-green-500/30 rounded-full" />
                     <p className="text-xl text-white leading-relaxed font-serif italic">
                       "{currentCard.example?.split(new RegExp(`(${currentCard.word})`, 'gi')).map((part, i) => (
                          part.toLowerCase() === currentCard.word.toLowerCase() ? (
                            <motion.span 
                              key={i}
                              initial={{ filter: "blur(8px)", color: "transparent" }}
                              animate={{ filter: "blur(0px)", color: "#4ade80" }}
                              transition={{ duration: 1.5, delay: 0.5 }}
                              className="font-bold px-1"
                            >
                              {part}
                            </motion.span>
                          ) : (
                            <span key={i}>{part}</span>
                          )
                       )) || "Loading example..."}"
                     </p>
                     <p className="text-white/50 mt-4 text-sm">
                       {currentCard.exampleMeaning}
                     </p>
                  </div>

                  <button 
                    onClick={handleNextStep}
                    className="w-full py-3 rounded-xl bg-green-500/20 hover:bg-green-500/30 text-green-200 font-bold transition-colors mt-8"
                  >
                    下一步：深度联结
                  </button>
                </div>
              )}

              {/* Step 4: Connection (Mnemonic) */}
              {step === 'connection' && (
                <div className="glass-panel p-8 flex flex-col gap-6">
                   <div className="flex items-center gap-3 text-amber-300 mb-2">
                    <Brain className="w-6 h-6" />
                    <h3 className="font-bold text-lg">记忆挂钩</h3>
                  </div>

                  <div className="space-y-6">
                     {/* Meaning Card */}
                     <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                        <div className="text-xs text-white/40 uppercase tracking-wider mb-1">核心释义</div>
                        <div className="text-2xl font-bold text-white">{currentCard.meaning}</div>
                     </div>

                     {/* Mnemonic */}
                     {currentCard.mnemonic && (
                       <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 relative overflow-hidden">
                          <div className="absolute right-0 top-0 p-4 opacity-10">
                            <Brain className="w-24 h-24" />
                          </div>
                          <div className="text-xs text-amber-300/70 uppercase tracking-wider mb-2">助记妙招</div>
                          <div className="text-amber-100 relative z-10">
                            <FormattedText content={currentCard.mnemonic} />
                          </div>
                       </div>
                     )}
                  </div>

                  <button 
                    onClick={handleNextStep}
                    className="w-full py-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-bold transition-colors mt-4"
                  >
                    下一步：小测验
                  </button>
                </div>
              )}

              {/* Step 5: Quiz */}
              {step === 'quiz' && (
                <div className="glass-panel p-8 flex flex-col gap-6">
                  <div className="text-center mb-4">
                    <div className="text-sm text-white/50 uppercase tracking-wider mb-2">最终挑战</div>
                    <h2 className="text-3xl font-bold text-white">{currentCard.word}</h2>
                  </div>

                  <div className="space-y-3">
                    {quizOptions.map((option, i) => (
                      <motion.button
                        key={i}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        disabled={selectedOption !== null}
                        onClick={() => handleQuizSelect(option)}
                        className={cn(
                          "w-full p-4 rounded-xl border text-left transition-all relative overflow-hidden",
                          selectedOption === null 
                            ? "bg-white/5 border-white/10 hover:bg-white/10" 
                            : selectedOption === option 
                              ? isQuizCorrect 
                                ? "bg-green-500/20 border-green-500 text-green-200" 
                                : "bg-red-500/20 border-red-500 text-red-200"
                              : option === currentCard.meaning
                                ? "bg-green-500/20 border-green-500 text-green-200" // Show correct answer if wrong
                                : "bg-white/5 border-white/10 opacity-50"
                        )}
                      >
                        <span className="relative z-10">{option}</span>
                        {selectedOption === option && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2">
                            {isQuizCorrect ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
                          </div>
                        )}
                      </motion.button>
                    ))}
                  </div>
                  
                  {isQuizCorrect && (
                     <motion.div 
                       initial={{ opacity: 0, scale: 0.5 }}
                       animate={{ opacity: 1, scale: 1 }}
                       className="text-center text-green-400 font-bold mt-4"
                     >
                       太棒了！准备下一个...
                     </motion.div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
