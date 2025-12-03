import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import type { WordCard } from '@/types';
import { cn } from '@/lib/utils';
import { Sparkles, BookOpen, BrainCircuit, Eye, Edit3, Save, RefreshCw, Volume2, Heart, CheckCircle, Keyboard, Link2, Sprout, RotateCcw, Network } from 'lucide-react';
import { FormattedText } from './FormattedText';
import { speak } from '@/lib/tts';
import { playClickSound, playSuccessSound } from '@/lib/sounds';

interface FlashcardProps {
  card: WordCard;
  onFlip?: (isRevealed: boolean) => void;
  onEnrich?: () => void | Promise<void> | Promise<WordCard | undefined>;
  onUpdateCard?: (card: WordCard) => Promise<WordCard | void>;
  onGenerateExample?: (card: WordCard) => Promise<WordCard | undefined>;
  onGenerateMnemonic?: (card: WordCard) => Promise<WordCard | undefined>;
  onGenerateMeaning?: (card: WordCard) => Promise<WordCard | undefined>;
  onGeneratePhrases?: (card: WordCard) => Promise<WordCard | undefined>;
  onGenerateDerivatives?: (card: WordCard) => Promise<WordCard | undefined>;
  onGenerateRoots?: (card: WordCard) => Promise<WordCard | undefined>;
  onGenerateSyllables?: (card: WordCard) => Promise<WordCard | undefined>;
  onGenerateBridgingExample?: (card: WordCard, targetWord: string, relation: string) => Promise<WordCard | undefined>;
  
  isEnriching?: boolean;
  /** 
   * @description 是否已揭示答案 (受控模式)
   */
  flipped?: boolean;
  /**
   * @description 是否始终显示背面内容（用于新词学习模式，即使未揭示也能看到释义，但保留幽灵拼写功能）
   */
  alwaysShowContent?: boolean;

  /**
   * @description 语义邻居 (用于底部展示)
   */
  semanticNeighbors?: WordCard[];
  
  /**
   * @description 动作回调：认识
   */
  onKnow?: () => void;
  
  /**
   * @description 动作回调：不认识
   */
  onForgot?: () => void;

  /**
   * @description 动作回调：FSRS 评级 (复习模式)
   */
  onRate?: (rating: number) => void;

  /**
   * @description 动作回调：点击语义邻居
   */
  onSemanticNeighborClick?: (word: string) => void;
  /**
   * @description 动作回调：悬浮语义邻居
   */
  onSemanticNeighborHover?: (word: string | null) => void;
  onPositionChange?: (point: { x: number; y: number }) => void;
}

/**
 * @description 学习卡片组件 (Flashcard)
 * 
 * 视觉风格: 深邃液态玻璃 (Deep Liquid Glass)
 * - 背景: 渐变磨砂 + 光感边缘
 * - 交互: 悬浮胶囊按钮 + 流光反馈
 * - 拖拽与缩放: 支持任意拖拽移动和右下角调整大小
 * - 信息架构: 极简Tab + 底部语义邻居
 */
export function Flashcard({ 
  card, 
  onFlip, 
  onEnrich, 
  onUpdateCard, 
  onGenerateExample, 
  onGenerateMnemonic, 
  onGenerateMeaning,
  onGeneratePhrases,
  onGenerateDerivatives,
  onGenerateRoots,
  onGenerateSyllables,
  onGenerateBridgingExample,
  isEnriching, 
  flipped,
  alwaysShowContent = false,
  semanticNeighbors = [],
  onKnow,
  onForgot,
  onRate,
  onSemanticNeighborClick,
  onSemanticNeighborHover,
  onPositionChange
}: FlashcardProps) {
  const [internalRevealed, setInternalRevealed] = useState(false);
  const [resizeInProgress, setResizeInProgress] = useState(false);
  const [noteContent, setNoteContent] = useState(card.notes || '');
  const [meaningContent, setMeaningContent] = useState(card.meaning || '');
  const [isEditingMeaning, setIsEditingMeaning] = useState(false);
  const [isGeneratingMeaning, setIsGeneratingMeaning] = useState(false);
  const [isGeneratingExample, setIsGeneratingExample] = useState(false);
  const [isGeneratingMnemonic, setIsGeneratingMnemonic] = useState(false);
  const [isGeneratingPhrases, setIsGeneratingPhrases] = useState(false);
  const [isGeneratingDerivatives, setIsGeneratingDerivatives] = useState(false);
  const [isGeneratingRoots, setIsGeneratingRoots] = useState(false);
  const [isGeneratingSyllables, setIsGeneratingSyllables] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const meaningInputRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Size State for Resizing
  const [size, setSize] = useState<{ width: number | string; height: number | string }>({ width: '100%', height: '100%' });

  // UI States
  const [showSplit, setShowSplit] = useState(false);
  const [activeTab, setActiveTab] = useState<'meaning' | 'example' | 'mnemonic' | 'phrases' | 'derivatives' | 'roots'>('meaning');
  
  // Tabs Order State
  const [tabs, setTabs] = useState([
    { id: 'example', label: '例句', icon: Eye },
    { id: 'mnemonic', label: '助记', icon: BrainCircuit },
    { id: 'phrases', label: '搭配', icon: Link2 },
    { id: 'derivatives', label: '派生', icon: Sprout },
  ]);

  // Ghost Typing State
  const [isGhostMode, setIsGhostMode] = useState(true);
  const [typedInput, setTypedInput] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNoteContent(card.notes || '');
    setMeaningContent(card.meaning || '');
    // Reset typing state when card changes
    setTypedInput('');
    setIsShaking(false);
    
    // Auto-focus input in Ghost Mode when card changes (if not revealed)
    if (isGhostMode && !isRevealed && inputRef.current) {
      inputRef.current.focus();
    }
  }, [card.id, card.notes, card.meaning]);

  // Determine effective state: controlled (prop) vs uncontrolled (state)
  const isRevealed = flipped !== undefined ? flipped : internalRevealed;

  // Handle typing input
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    const targetWord = card.word;
    
    // Allow backspace (shorter length)
    if (newVal.length < typedInput.length) {
      setTypedInput(newVal);
      return;
    }

    // Auto-Reset: If already complete, allow typing ANY key to restart
    if (typedInput.length === targetWord.length) {
      const lastChar = newVal.slice(-1);
      
      // Treat as new attempt starting with this character
      if (lastChar.toLowerCase() === targetWord[0].toLowerCase()) {
        setTypedInput(lastChar);
      } else {
        // Wrong first character: Clear and Shake
        setTypedInput('');
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 500);
      }
      return;
    }

    // Check the newly typed character
    const nextCharIndex = typedInput.length;
    if (nextCharIndex >= targetWord.length) return; 

    const typedChar = newVal[nextCharIndex];
    const expectedChar = targetWord[nextCharIndex];

    // Case-insensitive check
    if (typedChar.toLowerCase() === expectedChar.toLowerCase()) {
      setTypedInput(newVal);
      
      // Check for completion
      if (newVal.length === targetWord.length) {
        playSuccessSound(); 
        speakWord(); 
        
        // Auto-reveal and blur to enable shortcuts
        if (onFlip) onFlip(true);
        setInternalRevealed(true);
      }
    } else {
      // Error: Shake animation
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow 'Enter' to clear input for repeated practice
    if (e.key === 'Enter') {
      setTypedInput('');
    }
    
    // Handle Space key conflict
    if (e.code === 'Space') {
        const nextCharIndex = typedInput.length;
        const expectedChar = card.word[nextCharIndex];
        
        if (expectedChar !== ' ') {
            e.preventDefault(); 
            return;
        }
    }
    
    // Fix: When card is revealed, prioritize global shortcuts (1, 2, 3, 4)
    if (isRevealed) {
        if (['1', '2', '3', '4'].includes(e.key)) {
            e.preventDefault(); 
            return;
        }
    }
  };

  // Auto-focus input when switching to Ghost Mode
  useEffect(() => {
    if (isGhostMode && !isRevealed && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isGhostMode, isRevealed]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [noteContent, isRevealed]);

  const handleReveal = () => {
    if (isGhostMode) {
      inputRef.current?.focus();
      return;
    }

    if (!isRevealed) {
      playClickSound();
      if (flipped === undefined) {
        setInternalRevealed(true);
        onFlip?.(true);
      } else {
        onFlip?.(true);
      }
      inputRef.current?.blur();
    }
  };

  const handleToggleImportant = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onUpdateCard) {
      await onUpdateCard({ ...card, isImportant: !card.isImportant });
    }
  };

  const handleToggleFamiliar = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onUpdateCard) {
      await onUpdateCard({ ...card, isFamiliar: !card.isFamiliar });
    }
  };

  const handleSaveMeaning = async () => {
    setIsEditingMeaning(false);
    if (meaningContent !== card.meaning && onUpdateCard) {
      await onUpdateCard({ ...card, meaning: meaningContent });
    }
  };

  const handleGenerateMeaningClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onGenerateMeaning) return;
    setIsGeneratingMeaning(true);
    try {
      await onGenerateMeaning(card);
    } finally {
      setIsGeneratingMeaning(false);
    }
  };

  const handleGenerateExampleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onGenerateExample) return;
    setIsGeneratingExample(true);
    try {
      await onGenerateExample(card);
    } finally {
      setIsGeneratingExample(false);
    }
  };

  const handleGenerateMnemonicClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onGenerateMnemonic) return;
    setIsGeneratingMnemonic(true);
    try {
      await onGenerateMnemonic(card);
    } finally {
      setIsGeneratingMnemonic(false);
    }
  };

  const handleGenerateRootsClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onGenerateRoots) return;
    setIsGeneratingRoots(true);
    try {
      await onGenerateRoots(card);
    } finally {
      setIsGeneratingRoots(false);
    }
  };

  const speakWord = React.useCallback(() => {
    speak(card.word);
  }, [card.word]);

  // Auto-play when card word changes
  useEffect(() => {
    const timer = setTimeout(() => {
        speakWord();
    }, 100); 
    return () => clearTimeout(timer);
  }, [speakWord]);

  const handleSpeak = (e: React.MouseEvent) => {
    e.stopPropagation();
    speakWord();
  };

  // Resize Handler
  const initResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizeInProgress(true);
    
    const startX = e.clientX;
    const startY = e.clientY;
    
    if (!cardRef.current) return;
    const startWidth = cardRef.current.offsetWidth;
    const startHeight = cardRef.current.offsetHeight;

    const onMove = (moveEvent: PointerEvent) => {
        const newWidth = startWidth + (moveEvent.clientX - startX);
        const newHeight = startHeight + (moveEvent.clientY - startY);
        // Set min limits
        setSize({ 
            width: Math.max(320, newWidth), 
            height: Math.max(400, newHeight) 
        });
    };

    const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        setResizeInProgress(false);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <motion.div 
      ref={cardRef}
      drag={!resizeInProgress}
      dragMomentum={false}
      onDragEnd={(_, info) => onPositionChange?.(info.point)}
      whileDrag={{ scale: 1.01, cursor: 'grabbing', zIndex: 100 }}
      className="relative cursor-grab group perspective-1000" 
      style={{ width: size.width, height: size.height }}
      onClick={handleReveal}
    >
      <div className={cn(
        "relative w-full h-full flex flex-col p-6 md:p-8 overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all duration-500",
        "hover:shadow-[0_12px_40px_rgba(0,0,0,0.6)] hover:border-white/20"
      )}>
        
        {/* Ambient Light Effects */}
        <div className="absolute -top-20 -left-20 w-64 h-64 bg-blue-500/20 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-purple-500/20 rounded-full blur-[100px] pointer-events-none" />

        {/* Resize Handle */}
        <div 
            className="absolute bottom-0 right-0 w-8 h-8 cursor-se-resize z-50 flex items-end justify-end p-2 group/resize"
            onPointerDown={initResize}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="w-3 h-3 border-r-2 border-b-2 border-white/20 group-hover/resize:border-white/60 rounded-br-sm transition-colors" />
        </div>

        {/* Left Toolbar - Keyboard & AI */}
        <div className="absolute top-6 left-6 z-30 flex flex-col gap-3">
           {/* Ghost Mode Toggle */}
           <button
              onClick={(e) => {
                e.stopPropagation();
                setIsGhostMode(!isGhostMode);
                if (!isGhostMode) {
                  setTimeout(() => inputRef.current?.focus(), 0);
                }
              }}
              className={cn(
                "p-2.5 rounded-full transition-all duration-300 backdrop-blur-md border shadow-lg",
                isGhostMode 
                  ? "bg-blue-500/20 border-blue-400/30 text-blue-300 shadow-[0_0_15px_rgba(59,130,246,0.2)]" 
                  : "bg-black/20 border-white/10 text-white/40 hover:text-white/60"
              )}
              title={isGhostMode ? "关闭拼写模式" : "开启拼写模式"}
            >
              <Keyboard className="w-4 h-4" />
            </button>

            {/* AI Enrich Button */}
            {(isRevealed || alwaysShowContent) && (
              <motion.button 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onEnrich?.();
                }}
                className={cn(
                  "p-2.5 rounded-full transition-all duration-300 backdrop-blur-md border shadow-lg",
                  "bg-black/20 border-white/10 text-yellow-400/80 hover:text-yellow-400 hover:bg-white/10",
                  isEnriching && "animate-spin"
                )}
                title="AI 生成/优化"
              >
                <Sparkles className="w-4 h-4" />
              </motion.button>
            )}
        </div>

        {/* Right Toolbar - Status Only (Tools Removed) */}
        <div className="absolute top-6 right-6 z-30 flex flex-col gap-3 items-end">
           {(isRevealed || alwaysShowContent) && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex flex-col gap-3 items-end"
              >
                {/* Group 1: Status */}
                <div className="flex bg-black/30 rounded-full p-1 backdrop-blur-md border border-white/5 shadow-lg">
                  <button
                    onClick={handleToggleImportant}
                    className={cn(
                      "p-2 rounded-full hover:bg-white/10 transition-colors",
                      card.isImportant ? "text-red-500" : "text-white/40 hover:text-white/60"
                    )}
                    title={card.isImportant ? "取消重点" : "标记为重点"}
                  >
                    <Heart className={cn("w-4 h-4", card.isImportant && "fill-current")} />
                  </button>
                  <div className="w-px bg-white/10 my-1 mx-0.5" />
                  <button
                    onClick={handleToggleFamiliar}
                    className={cn(
                      "p-2 rounded-full hover:bg-white/10 transition-colors",
                      card.isFamiliar ? "text-green-400" : "text-white/40 hover:text-white/60"
                    )}
                    title={card.isFamiliar ? "取消熟悉标记" : "标记为熟悉"}
                  >
                    <CheckCircle className={cn("w-4 h-4", card.isFamiliar && "fill-current")} />
                  </button>
                </div>
              </motion.div>
           )}
        </div>

        {/* Word Section (Top/Center) */}
        <div className={cn(
            "flex flex-col items-center justify-center transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]",
            (isRevealed || alwaysShowContent) ? "min-h-[160px] pt-12 pb-8" : "h-full"
        )}>
          <div className="relative group/word mb-4 max-w-full px-4">
            <motion.div 
              animate={isShaking ? { x: [-5, 5, -5, 5, 0] } : {}}
              transition={{ duration: 0.4 }}
              className="flex items-center justify-center gap-1 relative z-20 flex-wrap"
            >
              <h2 
                className={cn(
                  "font-black tracking-tighter text-center flex items-center justify-center gap-1 cursor-pointer select-none active:scale-95 transition-all duration-300 flex-wrap break-words",
                  (() => {
                      const len = card.word.length;
                      const isLarge = isRevealed || alwaysShowContent;
                      if (len > 14) return isLarge ? "text-3xl md:text-4xl" : "text-2xl md:text-3xl";
                      if (len > 10) return isLarge ? "text-4xl md:text-5xl" : "text-3xl md:text-4xl";
                      if (len > 7) return isLarge ? "text-5xl md:text-6xl" : "text-4xl md:text-5xl";
                      return isLarge ? "text-6xl md:text-7xl" : "text-5xl md:text-6xl";
                  })(),
                  (isRevealed || alwaysShowContent) ? "bg-gradient-to-br from-white via-white to-white/50 bg-clip-text text-transparent drop-shadow-2xl" : "text-white"
                )}
                onClick={async (e) => { 
                  e.stopPropagation(); 
                  if (!card.syllables && onGenerateSyllables && !isGeneratingSyllables) {
                     setIsGeneratingSyllables(true);
                     try { await onGenerateSyllables(card); } finally { setIsGeneratingSyllables(false); }
                  }
                  setShowSplit(!showSplit); 
                  if (isGhostMode) setTimeout(() => inputRef.current?.focus(), 50);
                }}
              >
                {(() => {
                  const syllabifiedWord = card.syllables || card.word;
                  let rawIndex = 0;

                  return syllabifiedWord.split('').map((char: string, index: number) => {
                    if (char === '·') {
                      if (!showSplit) return null; 
                      return <span key={index} className="text-white/20 mx-[1px] font-light">·</span>;
                    }

                    const isTyped = rawIndex < typedInput.length;
                    const isCurrent = rawIndex === typedInput.length;
                    const currentIsTyped = isTyped;
                    const currentIsCurrent = isCurrent;
                    rawIndex++;

                    return (
                      <span 
                        key={index} 
                        className={cn(
                          "relative transition-all duration-300 min-w-[1rem] text-center",
                          !isGhostMode 
                            ? "text-white" 
                            : currentIsTyped 
                              ? "text-transparent bg-clip-text bg-gradient-to-b from-blue-300 to-blue-500 drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]" 
                              : (isRevealed || alwaysShowContent) && typedInput.length === 0
                                ? "text-white/40 blur-[0.5px]" 
                                : "text-white/10 blur-[1px]" 
                        )}
                      >
                        {char}
                        {isGhostMode && currentIsCurrent && (
                          <motion.span
                            layoutId="cursor"
                            className="absolute -bottom-2 left-0 w-full h-[3px] bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.8)]"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ 
                              layout: { duration: 0.3, ease: "easeOut" },
                              opacity: { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
                            }}
                          />
                        )}
                      </span>
                    );
                  });
                })()}
              </h2>
              
              <button 
                onClick={handleSpeak}
                className="ml-4 p-3 rounded-full bg-white/5 hover:bg-white/10 text-white/80 transition-colors relative z-20 backdrop-blur-sm"
                title="朗读单词"
              >
                <Volume2 className="w-6 h-6" />
              </button>
            </motion.div>
            
            {/* Ghost Input */}
            <input
              ref={inputRef}
              type="text"
              value={typedInput}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              className={cn(
                "absolute inset-0 w-full h-full opacity-0 cursor-text z-10 ghost-input",
                !isGhostMode && "pointer-events-none"
              )}
              disabled={!isGhostMode}
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
            />
          </div>
          
          {/* Hint */}
          {(!isRevealed && !alwaysShowContent) && (
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-8 text-white/40 flex items-center gap-2 text-sm font-medium tracking-widest uppercase"
            >
                <Eye className="w-4 h-4" /> 点击查看释义
            </motion.div>
          )}
        </div>

        {/* Revealed Content Section */}
        <AnimatePresence>
          {(isRevealed || alwaysShowContent) && (
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
              className="flex-1 flex flex-col min-h-0 relative"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Minimal Tabs */}
              <div className="flex items-center justify-center gap-4 mb-6 shrink-0">
                <button
                    onClick={(e) => { e.stopPropagation(); setActiveTab('meaning'); }}
                    className={cn(
                        "relative px-4 py-2 text-sm font-bold transition-all duration-300",
                        activeTab === 'meaning' ? "text-white" : "text-white/40 hover:text-white/80"
                    )}
                >
                    释义
                    {activeTab === 'meaning' && (
                      <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.8)]" />
                    )}
                </button>
                
                 <Reorder.Group axis="x" values={tabs} onReorder={setTabs} className="flex gap-4">
                    {tabs.map(tab => (
                        <Reorder.Item key={tab.id} value={tab}>
                            <button
                                onClick={(e) => { e.stopPropagation(); setActiveTab(tab.id as any); }}
                                className={cn(
                                "relative px-4 py-2 text-sm font-bold transition-all duration-300",
                                activeTab === tab.id ? "text-white" : "text-white/40 hover:text-white/80"
                                )}
                            >
                                {tab.label}
                                {activeTab === tab.id && (
                                  <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.8)]" />
                                )}
                            </button>
                        </Reorder.Item>
                    ))}
                 </Reorder.Group>
              </div>

              {/* Content Area */}
              <div className="flex-1 overflow-y-auto no-scrollbar pb-40 px-4">
                  <AnimatePresence mode="wait">
                    {activeTab === 'meaning' && (
                      <motion.div
                        key="meaning"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="bg-white/5 p-5 rounded-2xl border border-white/5 shadow-inner group/item relative backdrop-blur-sm">
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="text-xs uppercase tracking-wider text-muted-foreground opacity-50">释义</h4>
                            <div className="flex gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                <button
                                  onClick={handleGenerateMeaningClick}
                                  className={cn(
                                    "p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs flex items-center gap-1 text-blue-300",
                                    isGeneratingMeaning && "animate-spin"
                                  )}
                                  title="重新生成"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                </button>
                                {!isEditingMeaning ? (
                                    <button
                                        onClick={() => {
                                            setIsEditingMeaning(true);
                                            setTimeout(() => meaningInputRef.current?.focus(), 0);
                                        }}
                                        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs flex items-center gap-1 text-blue-300"
                                        title="编辑释义"
                                    >
                                        <Edit3 className="w-3 h-3" />
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleSaveMeaning}
                                        className="p-1.5 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-xs flex items-center gap-1 text-green-300"
                                        title="保存释义"
                                    >
                                        <Save className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                          </div>
                          
                          {isEditingMeaning ? (
                              <textarea
                                  ref={meaningInputRef}
                                  value={meaningContent}
                                  onChange={(e) => setMeaningContent(e.target.value)}
                                  onBlur={handleSaveMeaning}
                                  className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-xl font-medium text-white/90 focus:outline-none focus:border-blue-500/50 transition-colors resize-none"
                                  rows={3}
                              />
                          ) : (
                              <div 
                                  className="text-xl font-medium text-white/90 cursor-text leading-relaxed"
                                  onDoubleClick={() => {
                                      setIsEditingMeaning(true);
                                      setTimeout(() => meaningInputRef.current?.focus(), 0);
                                  }}
                              >
                                  <FormattedText content={card.meaning || ''} />
                              </div>
                          )}
                          
                          {/* Roots/Affixes Section (Merged) */}
                          {(card.roots || isGeneratingRoots) && (
                            <div className="mt-6 pt-6 border-t border-white/5">
                                <h4 className="text-xs uppercase tracking-wider text-muted-foreground opacity-50 mb-3 flex items-center gap-2">
                                    <Sprout className="w-3 h-3" /> 词根词缀
                                </h4>
                                {isGeneratingRoots ? (
                                    <div className="flex items-center gap-2 text-sm text-white/40 animate-pulse">
                                        <RefreshCw className="w-3 h-3 animate-spin" />
                                        正在分析词源...
                                    </div>
                                ) : card.roots && card.roots.length > 0 ? (
                                    <div className="grid gap-2">
                                        {card.roots.map((root, i) => (
                                            <div key={i} className="flex items-start gap-3 p-2 rounded-lg bg-black/20 border border-white/5">
                                                <span className="text-sm font-bold text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded shrink-0 font-mono">
                                                    {root.root}
                                                </span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm text-white/80 font-medium">{root.meaning}</div>
                                                    <div className="text-xs text-white/40 mt-0.5">{root.description}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-sm text-white/30 italic">无词根信息</div>
                                )}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}

                    {activeTab === 'example' && (
                      <motion.div
                        key="example"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="bg-white/5 p-6 rounded-2xl border border-white/5 group/item relative h-full backdrop-blur-sm flex flex-col">
                          <div className="flex justify-between items-start mb-4 shrink-0">
                            <h4 className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2 opacity-50">
                              <BookOpen className="w-3 h-3" /> 例句
                            </h4>
                            <div className="flex gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                              {/* Bridging Example Button */}
                              {semanticNeighbors && semanticNeighbors.length > 0 && onGenerateBridgingExample && (
                                  <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        // Pick the first neighbor for now
                                        const target = semanticNeighbors[0];
                                        // Assuming 'related' as generic relation if not known
                                        onGenerateBridgingExample(card, target.word, "related");
                                    }}
                                    className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-xs flex items-center gap-1 text-blue-300"
                                    title={`生成与 ${semanticNeighbors[0].word} 的关联例句`}
                                  >
                                    <Link2 className="w-3 h-3" />
                                  </button>
                              )}
                              <button
                                onClick={handleGenerateExampleClick}
                                className={cn(
                                  "p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs flex items-center gap-1",
                                  isGeneratingExample && "animate-spin"
                                )}
                                title="AI 生成例句"
                              >
                                <RefreshCw className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          {card.example ? (
                            <div className="space-y-4 overflow-y-auto custom-scrollbar pr-2">
                              <p className="text-lg opacity-90 italic text-white/90 leading-relaxed font-serif">
                                <FormattedText content={card.example} />
                              </p>
                              {card.exampleMeaning && (
                                <p className="text-sm text-white/60 border-t border-white/5 pt-4 mt-4">{card.exampleMeaning}</p>
                              )}
                            </div>
                          ) : (
                            <div className="text-sm text-white/30 italic h-full flex items-center justify-center">暂无例句，点击右上角生成</div>
                          )}
                        </div>
                      </motion.div>
                    )}

                     {activeTab === 'mnemonic' && (
                      <motion.div
                        key="mnemonic"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="bg-white/5 p-5 rounded-2xl border border-white/5 group/item relative h-full backdrop-blur-sm">
                          <div className="flex justify-between items-center mb-4">
                            <h4 className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2 opacity-50">
                              <BrainCircuit className="w-3 h-3" /> 助记
                            </h4>
                            <div className="flex gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  playClickSound();
                                  handleGenerateMnemonicClick(e);
                                }}
                                className={cn(
                                  "p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs flex items-center gap-1",
                                  isGeneratingMnemonic && "animate-spin"
                                )}
                              >
                                <RefreshCw className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          
                          {card.mnemonic ? (() => {
                              let mnemonics: any[] = [];
                              let isStructured = false;
                              try {
                                  const parsed = JSON.parse(card.mnemonic);
                                  if (Array.isArray(parsed)) {
                                      mnemonics = parsed;
                                      isStructured = true;
                                  }
                              } catch (e) { }

                              if (isStructured) {
                                  return (
                                      <div className="space-y-3 overflow-y-auto custom-scrollbar pr-2 max-h-[300px]">
                                          {mnemonics.map((m, i) => (
                                              <div key={i} className="bg-black/20 rounded-xl p-3 border border-white/5 hover:bg-black/30 transition-colors">
                                                  <div className="flex justify-between items-start mb-1">
                                                      <span className="text-xs font-bold text-blue-300 bg-blue-500/10 px-2 py-0.5 rounded">
                                                        {m.title || m.method || '记忆法'}
                                                      </span>
                                                  </div>
                                                  <p className="text-sm text-white/90 mb-1">
                                                    <FormattedText content={m.content || m.text || ''} />
                                                  </p>
                                                  {m.explanation && <p className="text-xs text-white/50">{m.explanation}</p>}
                                              </div>
                                          ))}
                                      </div>
                                  );
                              }
                              return <p className="text-white/80 leading-relaxed"><FormattedText content={card.mnemonic} /></p>;
                          })() : (
                              <div className="text-sm text-white/30 italic h-full flex items-center justify-center">暂无助记，点击右上角生成</div>
                          )}
                        </div>
                      </motion.div>
                    )}
                    
                    {/* Roots Nebula Visualization */}
                    {activeTab === 'roots' && (
                         <motion.div
                          key="roots"
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="h-full flex flex-col"
                         >
                             <div className="bg-white/5 p-5 rounded-2xl border border-white/5 h-full backdrop-blur-sm flex flex-col relative overflow-hidden group/roots">
                                 <div className="flex justify-between items-center mb-4 z-10">
                                    <h4 className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2 opacity-50">
                                        <Sprout className="w-3 h-3" /> 词根星云 (Root Nebula)
                                    </h4>
                                    <button
                                        onClick={handleGenerateRootsClick}
                                        className={cn(
                                            "p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs flex items-center gap-1 opacity-0 group-hover/roots:opacity-100 transition-opacity",
                                            isGeneratingRoots && "animate-spin"
                                        )}
                                    >
                                        <RefreshCw className="w-3 h-3" />
                                    </button>
                                 </div>

                                 {card.roots && card.roots.length > 0 ? (
                                     <div className="flex-1 relative overflow-y-auto custom-scrollbar">
                                         {card.roots.map((rootItem, idx) => (
                                             <div key={idx} className="mb-12 last:mb-0 relative min-h-[200px] flex items-center justify-center">
                                                 {/* Nebula Background Effect */}
                                                 <div className="absolute inset-0 bg-blue-500/5 blur-3xl rounded-full scale-75" />
                                                 
                                                 {/* Solar System Layout */}
                                                 <div className="relative w-full max-w-[300px] aspect-square flex items-center justify-center">
                                                     {/* Core (Root) */}
                                                     <div className="absolute z-10 w-20 h-20 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 backdrop-blur-md flex flex-col items-center justify-center text-center shadow-[0_0_30px_rgba(59,130,246,0.2)]">
                                                         <span className="text-lg font-bold text-white">{rootItem.root}</span>
                                                         <span className="text-[10px] text-white/50">{rootItem.meaning}</span>
                                                     </div>

                                                     {/* Orbiting Cognates */}
                                                     {rootItem.cognates && rootItem.cognates.map((cognate, cIdx) => {
                                                         const total = rootItem.cognates!.length;
                                                         const angle = (cIdx / total) * 2 * Math.PI;
                                                         const radius = 80; // Distance from center
                                                         const x = Math.cos(angle) * radius;
                                                         const y = Math.sin(angle) * radius;
                                                         
                                                         return (
                                                             <motion.div
                                                                 key={cognate}
                                                                 initial={{ opacity: 0, scale: 0 }}
                                                                 animate={{ opacity: 1, scale: 1 }}
                                                                 transition={{ delay: cIdx * 0.1 }}
                                                                 className="absolute w-auto px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-white/80 backdrop-blur-md cursor-pointer hover:bg-white/15 hover:scale-110 transition-all shadow-sm"
                                                                 style={{
                                                                     transform: `translate(${x}px, ${y}px)`,
                                                                 }}
                                                                 onClick={(e) => {
                                                                     e.stopPropagation();
                                                                     onSemanticNeighborClick?.(cognate);
                                                                 }}
                                                             >
                                                                 {cognate}
                                                             </motion.div>
                                                         );
                                                     })}
                                                     
                                                     {/* Orbit Rings */}
                                                     <div className="absolute inset-0 border border-white/5 rounded-full scale-[0.6] pointer-events-none" />
                                                     <div className="absolute inset-0 border border-white/5 rounded-full scale-[0.8] pointer-events-none border-dashed opacity-50" />
                                                 </div>
                                                 
                                                 {/* Description at bottom */}
                                                 <div className="absolute bottom-0 w-full text-center px-4">
                                                     <p className="text-xs text-white/40">{rootItem.description}</p>
                                                 </div>
                                             </div>
                                         ))}
                                     </div>
                                 ) : (
                                     <div className="flex-1 flex flex-col items-center justify-center text-white/30 gap-3">
                                         <Sprout className="w-8 h-8 opacity-50" />
                                         <p className="text-sm">暂无词根星云数据</p>
                                         <button 
                                            onClick={handleGenerateRootsClick}
                                            className="px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-xs text-white/80 transition-colors border border-white/5"
                                         >
                                             立即生成
                                         </button>
                                     </div>
                                 )}
                             </div>
                         </motion.div>
                    )}

                    {/* Placeholder for other tabs */}
                    {['phrases', 'derivatives'].includes(activeTab) && (
                         <motion.div
                          key={activeTab}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="h-full flex items-center justify-center text-white/30"
                         >
                             内容开发中...
                         </motion.div>
                    )}

                  </AnimatePresence>

                  {/* Semantic Neighbors (Bottom of Content) */}
                  {semanticNeighbors.length > 0 && (
                    <div className="mt-8 flex flex-col items-center border-t border-white/5 pt-6">
                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/30 mb-3">
                        <Network className="w-3 h-3" /> 语义邻居
                      </div>
                      <div className="flex flex-wrap justify-center gap-2">
                        {semanticNeighbors.slice(0, 8).map(n => (
                          <div 
                            key={n.id} 
                            className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-white/70 backdrop-blur-md shadow-sm hover:bg-white/10 hover:text-white transition-colors cursor-pointer active:scale-95 select-none" 
                            title={n.meaning}
                            onClick={(e) => {
                                e.stopPropagation();
                                onSemanticNeighborClick?.(n.word);
                            }}
                            onMouseEnter={() => onSemanticNeighborHover?.(n.word)}
                            onMouseLeave={() => onSemanticNeighborHover?.(null)}
                          >
                            {n.word}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Spacer for Floating Buttons - Handled by container padding */}
              </div>

            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Action Buttons (Overlay on Card) */}
        <AnimatePresence>
          {(isRevealed || alwaysShowContent) && (
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="absolute bottom-10 left-0 right-0 flex justify-center gap-4 z-50 pointer-events-none" 
            >
                <div className="pointer-events-auto flex gap-4">
                  {onRate ? (
                    // FSRS Buttons
                    <div className="flex gap-1.5 p-2 rounded-full bg-black/60 backdrop-blur-xl border border-white/10 shadow-2xl">
                        {[
                          { label: '重来', val: 1, color: 'bg-red-500' },
                          { label: '困难', val: 2, color: 'bg-orange-500' },
                          { label: '良好', val: 3, color: 'bg-blue-500' },
                          { label: '容易', val: 4, color: 'bg-green-500' }
                        ].map(btn => (
                          <button
                            key={btn.val}
                            onClick={(e) => { e.stopPropagation(); onRate(btn.val); }}
                            className="px-4 py-2 rounded-full hover:bg-white/10 text-xs font-bold text-white/90 transition-colors flex items-center gap-2"
                          >
                              <span className={`w-1.5 h-1.5 rounded-full ${btn.color} shadow-[0_0_8px_currentColor]`}/>
                              {btn.label}
                          </button>
                        ))}
                    </div>
                  ) : (onKnow || onForgot) && (
                    // Learn Buttons
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); onForgot?.(); }}
                        className="group/btn relative px-6 py-3 rounded-full bg-red-500/10 border border-red-500/20 text-red-200 font-bold backdrop-blur-xl shadow-lg hover:bg-red-500/20 active:scale-95 transition-all"
                      >
                        <div className="flex items-center gap-2">
                          <RotateCcw className="w-4 h-4" />
                          <span>不认识</span>
                        </div>
                      </button>

                      <button
                        onClick={(e) => { e.stopPropagation(); onKnow?.(); }}
                        className="group/btn relative px-8 py-3 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-200 font-bold backdrop-blur-xl shadow-lg hover:bg-blue-500/20 active:scale-95 transition-all"
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4" />
                          <span>认识</span>
                        </div>
                      </button>
                    </>
                  )}
                </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </motion.div>
  );
}
