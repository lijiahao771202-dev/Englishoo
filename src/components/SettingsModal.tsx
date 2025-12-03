/**
 * @description 设置弹窗组件 (Settings Modal)
 * 允许用户调整液态玻璃 UI 参数（透明度、模糊度、饱和度、扭曲强度等）。
 * 支持实时预览和恢复默认设置。
 */
import { X, RotateCcw, Save } from 'lucide-react';

export interface LiquidGlassSettings {
  opacity: number;
  blur: number;
  saturation: number;
  distortionScale: number;
  distortionFrequency: number;
}

export const DEFAULT_SETTINGS: LiquidGlassSettings = {
  opacity: 0.03,
  blur: 20,
  saturation: 180,
  distortionScale: 15,
  distortionFrequency: 0.01,
};

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: LiquidGlassSettings;
  onSettingsChange: (settings: LiquidGlassSettings) => void;
  onRestoreDefaults: () => void;
}

export function SettingsModal({ 
  isOpen, 
  onClose, 
  settings, 
  onSettingsChange, 
  onRestoreDefaults 
}: SettingsModalProps) {
  if (!isOpen) return null;

  const handleChange = (key: keyof LiquidGlassSettings, value: number) => {
    onSettingsChange({
      ...settings,
      [key]: value,
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div 
        className="w-full max-w-md bg-slate-900/90 border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-xl font-bold text-white">液态玻璃设置</h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Opacity */}
          <div className="space-y-3">
            <div className="flex justify-between">
              <label className="text-sm font-medium text-white/80">背景透明度 (Opacity)</label>
              <span className="text-xs text-blue-300 font-mono">{settings.opacity.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="0.5"
              step="0.01"
              value={settings.opacity}
              onChange={(e) => handleChange('opacity', parseFloat(e.target.value))}
              className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-blue-400"
            />
          </div>

          {/* Blur */}
          <div className="space-y-3">
            <div className="flex justify-between">
              <label className="text-sm font-medium text-white/80">模糊度 (Blur)</label>
              <span className="text-xs text-blue-300 font-mono">{settings.blur}px</span>
            </div>
            <input
              type="range"
              min="0"
              max="50"
              step="1"
              value={settings.blur}
              onChange={(e) => handleChange('blur', parseFloat(e.target.value))}
              className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-blue-400"
            />
          </div>

          {/* Saturation */}
          <div className="space-y-3">
            <div className="flex justify-between">
              <label className="text-sm font-medium text-white/80">饱和度 (Saturation)</label>
              <span className="text-xs text-blue-300 font-mono">{settings.saturation}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="300"
              step="10"
              value={settings.saturation}
              onChange={(e) => handleChange('saturation', parseFloat(e.target.value))}
              className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-blue-400"
            />
          </div>

          {/* Distortion Scale */}
          <div className="space-y-3">
            <div className="flex justify-between">
              <label className="text-sm font-medium text-white/80">扭曲强度 (Distortion)</label>
              <span className="text-xs text-blue-300 font-mono">{settings.distortionScale}</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={settings.distortionScale}
              onChange={(e) => handleChange('distortionScale', parseFloat(e.target.value))}
              className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-blue-400"
            />
          </div>

          {/* Distortion Frequency */}
          <div className="space-y-3">
            <div className="flex justify-between">
              <label className="text-sm font-medium text-white/80">纹理密度 (Frequency)</label>
              <span className="text-xs text-blue-300 font-mono">{settings.distortionFrequency}</span>
            </div>
            <input
              type="range"
              min="0.001"
              max="0.1"
              step="0.001"
              value={settings.distortionFrequency}
              onChange={(e) => handleChange('distortionFrequency', parseFloat(e.target.value))}
              className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-blue-400"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10 flex gap-3 bg-black/20">
          <button
            onClick={onRestoreDefaults}
            className="flex-1 py-3 rounded-xl border border-white/10 text-white/70 hover:bg-white/5 hover:text-white transition-all flex items-center justify-center gap-2 font-medium"
          >
            <RotateCcw className="w-4 h-4" /> 恢复默认
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-all flex items-center justify-center gap-2 font-bold shadow-lg shadow-blue-500/20"
          >
            <Save className="w-4 h-4" /> 完成
          </button>
        </div>
      </div>
    </div>
  );
}
