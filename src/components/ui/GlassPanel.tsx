import React from 'react';
import { cn } from '@/lib/utils';

interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: 'light' | 'dark';
  hoverEffect?: boolean;
}

/**
 * @description 液态玻璃面板组件 (Liquid Glass Panel)
 * 遵循 iOS 16+ 风格，提供磨砂玻璃效果。
 * 
 * @param variant 'light' | 'dark' - 玻璃色调
 * @param hoverEffect boolean - 是否启用悬浮交互效果 (放大 + 光泽增强)
 */
export const GlassPanel = ({ 
  children, 
  className, 
  variant = 'light', 
  hoverEffect = false,
  ...props 
}: GlassPanelProps) => {
  return (
    <div
      className={cn(
        'backdrop-blur-xl border transition-all duration-300',
        // 基础玻璃质感
        variant === 'light' 
          ? 'bg-white/40 border-white/40 shadow-[0_8px_32px_0_rgba(31,38,135,0.15)]' 
          : 'bg-black/20 border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] text-white',
        
        // 悬浮效果
        hoverEffect && 'hover:scale-[1.02] hover:bg-white/50 hover:shadow-[0_12px_40px_0_rgba(31,38,135,0.25)] hover:border-white/60 cursor-pointer',
        
        'rounded-2xl',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
