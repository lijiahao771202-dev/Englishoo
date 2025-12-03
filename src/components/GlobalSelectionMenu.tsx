import React, { useEffect, useState } from 'react';
import { addToVocabularyDeck } from '@/lib/db';
import { Plus } from 'lucide-react';
import { playClickSound, playSuccessSound } from '@/lib/sounds';

/**
 * @description 全局划词菜单 - 允许在任何地方选中单词并添加到生词本
 */
export function GlobalSelectionMenu() {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setIsVisible(false);
        return;
      }

      const text = selection.toString().trim();
      
      // Filter: Only valid English words/phrases, max length 30
      if (text.length > 0 && text.length < 30 && /^[a-zA-Z\s\-\']+$/.test(text)) {
        setSelectedText(text);
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // Calculate position (centered above selection)
        setPosition({
          x: rect.left + rect.width / 2,
          y: rect.top - 10 // Relative to viewport is fine for fixed position
        });
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    // Use mouseup/keyup for better performance than selectionchange
    const handleInteraction = () => {
       // Small delay to ensure selection is finalized
       setTimeout(handleSelectionChange, 10);
    };

    document.addEventListener('mouseup', handleInteraction);
    document.addEventListener('keyup', handleInteraction);

    return () => {
      document.removeEventListener('mouseup', handleInteraction);
      document.removeEventListener('keyup', handleInteraction);
    };
  }, []);

  const handleAddToVocab = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isAdding) return;

    playClickSound();
    setIsAdding(true);
    try {
      const result = await addToVocabularyDeck(selectedText);
      if (result.success) {
        playSuccessSound();
        // Clear selection to dismiss menu
        window.getSelection()?.removeAllRanges();
        setIsVisible(false);
      } else {
        // Maybe show a small tooltip "Exists"?
        alert(result.message); 
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsAdding(false);
    }
  };

  if (!isVisible || !position) return null;

  return (
    <div 
      className="fixed z-[9999] pointer-events-auto animate-in fade-in zoom-in duration-200"
      style={{ 
        left: position.x, 
        top: position.y, 
        transform: 'translate(-50%, -100%)' 
      }}
      onMouseDown={(e) => e.stopPropagation()} // Prevent clearing selection when clicking menu
    >
      <button
        onClick={handleAddToVocab}
        className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/80 text-white backdrop-blur-xl border border-white/10 shadow-xl hover:bg-black hover:scale-105 transition-all text-xs font-medium group"
      >
        <div className="p-1 rounded-full bg-blue-500/20 group-hover:bg-blue-500/40 transition-colors">
            <Plus className="w-3 h-3 text-blue-400" />
        </div>
        <span>加入生词本</span>
        {isAdding && <span className="animate-spin ml-1 opacity-60">⏳</span>}
      </button>
    </div>
  );
}
