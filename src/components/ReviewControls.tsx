import { useMemo, useEffect } from 'react';
import { Rating } from 'ts-fsrs';
import { cn } from '@/lib/utils';
import type { RecordLog } from 'ts-fsrs';
import { playReviewAgainSound, playReviewHardSound, playReviewGoodSound, playReviewEasySound } from '@/lib/sounds';

interface ReviewControlsProps {
  onRate: (rating: Rating) => void;
  disabled?: boolean;
  previews?: RecordLog; // 传入 FSRS 预测结果
}

/**
 * @description 格式化时间间隔
 * 将日期差转换为人类可读的短语 (e.g., "10分钟", "3天", "2.5个月")
 */
function formatInterval(dueDate: Date): string {
  const now = new Date();
  const diffMs = dueDate.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / (1000 * 60));
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return '现在';
  if (diffMins < 60) return `${diffMins}分钟`;
  if (diffHours < 24) return `${diffHours}小时`;
  if (diffDays < 30) return `${diffDays}天`;
  if (diffDays < 365) return `${Math.round(diffDays / 30 * 10) / 10}个月`;
  return `${Math.round(diffDays / 365 * 10) / 10}年`;
}

export function ReviewControls({ onRate, disabled, previews }: ReviewControlsProps) {

  // Keyboard shortcuts
  useEffect(() => {
    if (disabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const isInput = ['INPUT', 'TEXTAREA'].includes(active?.tagName || '');
      // 允许 ghost-input 触发快捷键（因为在 Review 模式下，如果卡片已翻转，即使焦点在 Ghost Input 上，用户也可能想要评分）
      const isGhostInput = active?.classList.contains('ghost-input');

      if (isInput && !isGhostInput) return;

      switch (e.key) {
        case '1':
          playReviewAgainSound();
          onRate(Rating.Again);
          break;
        case '2':
          playReviewHardSound();
          onRate(Rating.Hard);
          break;
        case '3':
          playReviewGoodSound();
          onRate(Rating.Good);
          break;
        case '4':
          playReviewEasySound();
          onRate(Rating.Easy);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disabled, onRate]);

  const buttons = useMemo(() => {
    return [
      {
        label: '重来 (1)',
        rating: Rating.Again,
        color: 'bg-red-500/20 text-red-200 border-red-500/30 hover:bg-red-500/30',
        preview: previews?.[Rating.Again]?.card.due
      },
      {
        label: '困难 (2)',
        rating: Rating.Hard,
        color: 'bg-orange-500/20 text-orange-200 border-orange-500/30 hover:bg-orange-500/30',
        preview: previews?.[Rating.Hard]?.card.due
      },
      {
        label: '良好 (3)',
        rating: Rating.Good,
        color: 'bg-green-500/20 text-green-200 border-green-500/30 hover:bg-green-500/30',
        preview: previews?.[Rating.Good]?.card.due
      },
      {
        label: '简单 (4)',
        rating: Rating.Easy,
        color: 'bg-blue-500/20 text-blue-200 border-blue-500/30 hover:bg-blue-500/30',
        preview: previews?.[Rating.Easy]?.card.due
      },
    ];
  }, [previews]);

  return (
    <div className="grid grid-cols-4 gap-2 mt-4">
      {buttons.map((btn) => (
        <button
          key={btn.label}
          onClick={() => {
            if (btn.rating === Rating.Again) playReviewAgainSound();
            else if (btn.rating === Rating.Hard) playReviewHardSound();
            else if (btn.rating === Rating.Good) playReviewGoodSound();
            else if (btn.rating === Rating.Easy) playReviewEasySound();
            onRate(btn.rating);
          }}
          disabled={disabled}
          className={cn(
            "h-14 rounded-xl backdrop-blur-md border transition-all duration-200 flex flex-col items-center justify-center active:scale-95 gap-0.5 shadow-lg",
            btn.color,
            disabled && "opacity-50 cursor-not-allowed grayscale"
          )}
        >
          <span className="font-bold text-sm">{btn.label}</span>
          {btn.preview && (
            <span className="text-[10px] opacity-70 font-medium font-mono leading-none">
              {formatInterval(btn.preview)}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
