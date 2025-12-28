/**
 * @description 设置弹窗组件 (Settings Modal)
 * 允许用户调整液态玻璃 UI 参数（透明度、模糊度、饱和度、扭曲强度等）。
 * 支持实时预览和恢复默认设置。
 */
import { useState, useEffect } from 'react';
import { X, RotateCcw, Save, Database, Palette, Loader2, BrainCircuit, Key, Volume2, Keyboard, Smile, UploadCloud, DownloadCloud, Image as ImageIcon } from 'lucide-react';
import { seedFromLocalJSON } from '@/lib/seed';
import { importCustomDeck } from '@/lib/import-custom';
import type { EmbeddingConfig } from '@/lib/embedding';
import { playClickSound, playSuccessSound, playFailSound, playKnowSound, playReviewAgainSound, playReviewHardSound, playReviewGoodSound, playReviewEasySound, playSessionCompleteSound } from '@/lib/sounds';
import { HotkeySettings } from './HotkeySettings';
import { MASCOT_SKINS, type MascotConfig } from '@/lib/mascot-config';
import { InteractiveMascot } from './InteractiveMascot';
import { syncManager } from '@/lib/sync-manager';

export interface LiquidGlassSettings {
  opacity: number;
  blur: number;
  saturation: number;
  distortionScale: number;
  distortionFrequency: number;
  backgroundImage?: string;
}

import { getUsageStats } from '@/lib/deepseek';

// Helper Component for Stats
function ApiUsageStatsView() {
  const [stats, setStats] = useState(() => getUsageStats());

  // Refresh stats every second while open
  useEffect(() => {
    const interval = setInterval(() => {
      setStats(getUsageStats());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="bg-black/20 rounded-lg p-3 border border-white/5">
        <div className="text-[10px] text-white/40 mb-1">总调用次数</div>
        <div className="text-xl font-mono text-pink-300">{stats.requestCount}</div>
      </div>
      <div className="bg-black/20 rounded-lg p-3 border border-white/5">
        <div className="text-[10px] text-white/40 mb-1">估算 Token 消耗</div>
        <div className="text-xl font-mono text-cyan-300">~{stats.estimatedTokens.toLocaleString()}</div>
        <div className="text-[10px] text-white/20 mt-1">仅供参考 (Input+Output)</div>
      </div>
    </div>
  );
}

export const DEFAULT_SETTINGS: LiquidGlassSettings = {
  opacity: 0.03,
  blur: 20,
  saturation: 180,
  distortionScale: 15,
  distortionFrequency: 0.01,
  backgroundImage: '',
};

// 🌿 20 Curated Nature Presets (High Quality Unsplash)
const NATURE_PRESETS = [
  { name: 'Mountain Lake', url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80' },
  { name: 'Forest Mist', url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1920&q=80' },
  { name: 'Tropical Beach', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=80' },
  { name: 'Snowy Peaks', url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1920&q=80' },
  { name: 'Desert Dunes', url: 'https://images.unsplash.com/photo-1475924156734-496f6cac6ec1?w=1920&q=80' },
  { name: 'Deep Space', url: 'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=1920&q=80' },
  { name: 'Autumn Forest', url: 'https://images.unsplash.com/photo-1507272931001-fc06c17e4f43?w=1920&q=80' },
  { name: 'Waterfall', url: 'https://images.unsplash.com/photo-1433086966358-54859d0ed716?w=1920&q=80' },
  { name: 'Green Valley', url: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=1920&q=80' },
  { name: 'Ocean Waves', url: 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=1920&q=80' },
  { name: 'Sunset Clouds', url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1920&q=80' },
  { name: 'Northern Lights', url: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=1920&q=80' },
  { name: 'Bamboo Forest', url: 'https://images.unsplash.com/photo-1588612502805-be1435272304?w=1920&q=80' },
  { name: 'Cherry Blossoms', url: 'https://images.unsplash.com/photo-1522383225653-ed111181a951?w=1920&q=80' },
  { name: 'Rainy City', url: 'https://images.unsplash.com/photo-1515169067750-d51a73b50981?w=1920&q=80' },
  { name: 'Lavender Field', url: 'https://images.unsplash.com/photo-1499002238440-d264edd596ec?w=1920&q=80' },
  { name: 'Blue Ridge', url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1920&q=80' },
  { name: 'Canyon Sun', url: 'https://images.unsplash.com/photo-1474552226712-ac0f0961a954?w=1920&q=80' },
  { name: 'Island Aerial', url: 'https://images.unsplash.com/photo-1559128010-7c1ad6e1b6a5?w=1920&q=80' },
  { name: 'Mossy Stream', url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1920&q=80' },
];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: LiquidGlassSettings;
  onSettingsChange: (settings: LiquidGlassSettings) => void;
  onRestoreDefaults: () => void;
  embeddingConfig?: EmbeddingConfig;
  onEmbeddingConfigChange?: (config: EmbeddingConfig) => void;
  apiKey?: string;
  onApiKeyChange?: (key: string) => void;
  mascotConfig: MascotConfig;
  onMascotConfigChange: (config: Partial<MascotConfig>) => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  onRestoreDefaults,
  embeddingConfig,
  onEmbeddingConfigChange,
  apiKey,
  onApiKeyChange,
  mascotConfig,
  onMascotConfigChange
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'visual' | 'data' | 'algo' | 'api' | 'audio' | 'hotkey' | 'mascot'>('visual');
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, word: '' });
  const [tokenSaverMode, setTokenSaverMode] = useState(() => localStorage.getItem('token_saver_mode') === 'true');

  if (!isOpen) return null;

  const handleChange = (key: keyof LiquidGlassSettings, value: number | string) => {
    onSettingsChange({
      ...settings,
      [key]: value,
    });
  };

  const handleEmbeddingChange = (key: keyof EmbeddingConfig, value: number) => {
    if (onEmbeddingConfigChange && embeddingConfig) {
      onEmbeddingConfigChange({
        ...embeddingConfig,
        [key]: value
      });
    }
  };

  const handleImport = async () => {
    if (isImporting) return;
    if (!window.confirm('确定要导入100个测试单词吗？这可能需要几分钟时间生成关联关系。')) return;

    setIsImporting(true);
    setImportProgress({ current: 0, total: 0, word: '准备中...' });

    try {
      await seedFromLocalJSON((current, total, word) => {
        setImportProgress({ current, total, word });
      });
      alert('导入成功！');
    } catch (error) {
      console.error('Import failed:', error);
      alert('导入失败，请查看控制台。');
    } finally {
      setIsImporting(false);
    }
  };

  const handleCustomImport = async (name: string, url: string) => {
    if (isImporting) return;
    if (!window.confirm(`确定要导入 "${name}" 吗？这可能需要几分钟时间生成关联关系。`)) return;

    setIsImporting(true);
    setImportProgress({ current: 0, total: 0, word: '准备中...' });

    try {
      const { count } = await importCustomDeck(url, name, (p) => {
        setImportProgress({ current: p.count, total: p.total, word: p.currentWord });
      });
      alert(`成功导入 ${count} 个单词到 "${name}"！`);
    } catch (error) {
      console.error('Import failed:', error);
      alert('导入失败，请查看控制台。');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
      <div
        className="w-full max-w-md bg-slate-950/80 border border-pink-500/20 rounded-[2rem] shadow-[0_0_40px_rgba(244,63,94,0.1)] overflow-hidden flex flex-col max-h-[90vh] backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/5">
          <h2 className="text-xl font-bold bg-gradient-to-r from-pink-200 to-rose-100 bg-clip-text text-transparent">设置</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-3 gap-2 p-3 border-b border-white/5 bg-black/20">
          <button
            onClick={() => setActiveTab('visual')}
            className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'visual' ? 'bg-gradient-to-r from-pink-500/20 to-rose-500/20 text-pink-200 border border-pink-500/20 shadow-sm' : 'text-white/40 hover:text-white hover:bg-white/5'} `}
          >
            <Palette className="w-3.5 h-3.5" /> 界面
          </button>
          <button
            onClick={() => setActiveTab('data')}
            className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'data' ? 'bg-gradient-to-r from-pink-500/20 to-rose-500/20 text-pink-200 border border-pink-500/20 shadow-sm' : 'text-white/40 hover:text-white hover:bg-white/5'} `}
          >
            <Database className="w-3.5 h-3.5" /> 数据
          </button>
          <button
            onClick={() => setActiveTab('algo')}
            className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'algo' ? 'bg-gradient-to-r from-pink-500/20 to-rose-500/20 text-pink-200 border border-pink-500/20 shadow-sm' : 'text-white/40 hover:text-white hover:bg-white/5'} `}
          >
            <BrainCircuit className="w-3.5 h-3.5" /> 算法
          </button>
          <button
            onClick={() => setActiveTab('api')}
            className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'api' ? 'bg-gradient-to-r from-pink-500/20 to-rose-500/20 text-pink-200 border border-pink-500/20 shadow-sm' : 'text-white/40 hover:text-white hover:bg-white/5'} `}
          >
            <Key className="w-3.5 h-3.5" /> API
          </button>
          <button
            onClick={() => setActiveTab('audio')}
            className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'audio' ? 'bg-gradient-to-r from-pink-500/20 to-rose-500/20 text-pink-200 border border-pink-500/20 shadow-sm' : 'text-white/40 hover:text-white hover:bg-white/5'} `}
          >
            <Volume2 className="w-3.5 h-3.5" /> 音效
          </button>
          <button
            onClick={() => setActiveTab('hotkey')}
            className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'hotkey' ? 'bg-gradient-to-r from-pink-500/20 to-rose-500/20 text-pink-200 border border-pink-500/20 shadow-sm' : 'text-white/40 hover:text-white hover:bg-white/5'} `}
          >
            <Keyboard className="w-3.5 h-3.5" /> 快捷键
          </button>
          <button
            onClick={() => setActiveTab('mascot')}
            className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'mascot' ? 'bg-gradient-to-r from-pink-500/20 to-rose-500/20 text-pink-200 border border-pink-500/20 shadow-sm' : 'text-white/40 hover:text-white hover:bg-white/5'} `}
          >
            <Smile className="w-3.5 h-3.5" /> 吉祥物
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 scrollbar-none">
          {activeTab === 'mascot' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* Preview Area */}
              <div className="flex flex-col items-center justify-center py-6 bg-white/5 rounded-2xl border border-white/10 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20 pointer-events-none" />
                <InteractiveMascot
                  size={120}
                  reaction="happy"
                  skinId={mascotConfig.skinId}
                  variant={mascotConfig.variant || 'classic'}
                  className="mb-4"
                />
                <div className="text-white/80 font-bold text-lg">{mascotConfig.name}</div>
                <div className="text-white/40 text-xs mt-1">当前外观: {MASCOT_SKINS.find(s => s.id === mascotConfig.skinId)?.name}</div>
              </div>

              {/* Name Setting */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-white/60 uppercase tracking-wider">吉祥物名字</label>
                <div className="relative">
                  <input
                    type="text"
                    value={mascotConfig.name}
                    onChange={(e) => onMascotConfigChange({ name: e.target.value })}
                    maxLength={10}
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-pink-500/50 transition-colors"
                    placeholder="给它起个名字..."
                  />
                  <Smile className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                </div>
              </div>

              {/* Variant Switch */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-white/60 uppercase tracking-wider">形态选择</label>
                <div className="flex gap-2 p-1 bg-black/20 rounded-xl border border-white/5">
                  <button
                    onClick={() => onMascotConfigChange({ variant: 'classic' })}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${(!mascotConfig.variant || mascotConfig.variant === 'classic')
                      ? 'bg-pink-500 text-white shadow-lg shadow-pink-500/20'
                      : 'text-white/40 hover:text-white/80 hover:bg-white/5'
                      }`}
                  >
                    经典水滴
                  </button>
                  <button
                    onClick={() => onMascotConfigChange({ variant: 'sphere' })}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${mascotConfig.variant === 'sphere'
                      ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20'
                      : 'text-white/40 hover:text-white/80 hover:bg-white/5'
                      }`}
                  >
                    MSG Sphere
                  </button>
                </div>
              </div>

              {/* [Feature] AI Personality */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-white/60 uppercase tracking-wider">AI 人格设定 (Personality)</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'witty', label: '毒舌损友', desc: '幽默风趣', icon: '😏' },
                    { id: 'gentle', label: '温柔导师', desc: '暖心鼓励', icon: '🥰' },
                    { id: 'strict', label: '魔鬼教练', desc: '严厉高效', icon: '🫡' }
                  ].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => onMascotConfigChange({ persona: p.id as any })}
                      className={`
                          relative p-3 rounded-xl border text-left transition-all
                          hover:bg-white/5
                          ${mascotConfig.persona === p.id
                          ? 'bg-purple-500/20 border-purple-500/50 text-white shadow-[0_0_15px_rgba(168,85,247,0.2)]'
                          : 'bg-black/20 border-white/5 text-white/40'}
                        `}
                    >
                      <div className="text-xl mb-1">{p.icon}</div>
                      <div className="text-xs font-bold">{p.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Skin Selection */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-white/60 uppercase tracking-wider">皮肤风格</label>
                <div className="grid grid-cols-3 gap-3">
                  {MASCOT_SKINS.map((skin) => (
                    <button
                      key={skin.id}
                      onClick={() => onMascotConfigChange({ skinId: skin.id })}
                      disabled={!skin.unlocked}
                      className={`relative group p-3 rounded-xl border transition-all duration-200 flex flex-col items-center gap-2
                        ${mascotConfig.skinId === skin.id
                          ? 'bg-pink-500/20 border-pink-500/50 shadow-[0_0_15px_rgba(236,72,153,0.2)]'
                          : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                        }
                        ${!skin.unlocked ? 'opacity-50 cursor-not-allowed grayscale' : ''}
`}
                    >
                      <div className="text-2xl filter drop-shadow-lg group-hover:scale-110 transition-transform">
                        {skin.emoji}
                      </div>
                      <div className={`text-xs font-medium ${mascotConfig.skinId === skin.id ? 'text-pink-200' : 'text-white/60'} `}>
                        {skin.name}
                      </div>

                      {/* Color dots preview */}
                      <div className="flex gap-1 mt-1">
                        <div className="w-2 h-2 rounded-full" style={{ background: skin.gradientStart }} />
                        <div className="w-2 h-2 rounded-full" style={{ background: skin.gradientMid }} />
                        <div className="w-2 h-2 rounded-full" style={{ background: skin.gradientEnd }} />
                      </div>

                      {!skin.unlocked && (
                        <div className="absolute inset-0 bg-black/60 rounded-xl flex items-center justify-center backdrop-blur-[1px]">
                          <span className="text-[10px] text-white/80 font-bold px-2 py-1 bg-black/40 rounded-full border border-white/10">
                            未解锁
                          </span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'visual' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* Background Selection Grid */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-pink-400" /> 背景选择
                  </h3>
                  <button
                    onClick={() => handleChange('backgroundImage', '')}
                    className="text-[10px] px-2 py-1 rounded-full border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    恢复默认
                  </button>
                </div>


                <div className="grid grid-cols-3 gap-3">
                  {/* Default/Empty Option */}
                  <button
                    onClick={() => handleChange('backgroundImage', '')}
                    className={`aspect-square rounded-xl border relative overflow-hidden group transition-all duration-300
                      ${settings.backgroundImage === ''
                        ? 'border-pink-500 ring-2 ring-pink-500/20'
                        : 'border-white/10 hover:border-white/30'}
                    `}
                  >
                    <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center gap-2">
                      <div className="w-8 h-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center">
                        <X className="w-4 h-4 text-white/30" />
                      </div>
                      <span className="text-[10px] text-white/40 font-medium">无背景</span>
                    </div>
                  </button>

                  {/* Curated Nature Presets */}
                  {NATURE_PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleChange('backgroundImage', preset.url)}
                      className={`aspect-square rounded-xl border relative overflow-hidden group transition-all duration-300
                        ${settings.backgroundImage === preset.url
                          ? 'border-pink-500 ring-2 ring-pink-500/20 scale-[0.98]'
                          : 'border-white/10 hover:border-white/30 hover:scale-[1.02]'}
                      `}
                    >
                      <img
                        src={preset.url.replace('w=1920', 'w=400')} // Use smaller thumbnail
                        alt={preset.name}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        loading="lazy"
                      />

                      {/* Name Overlay (Hover) */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center p-2">
                        <span className="text-[10px] text-white/90 font-medium truncate w-full text-center">
                          {preset.name}
                        </span>
                      </div>

                      {/* Active Indicator */}
                      {settings.backgroundImage === preset.url && (
                        <div className="absolute inset-0 border-2 border-pink-500 rounded-xl bg-pink-500/10 backdrop-blur-[1px]" />
                      )}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-center text-white/30 pt-2">
                  精选 20 张高清自然风景壁纸 • Unsplash Source
                </p>
              </div >
            </div >
          )}

          {
            activeTab === 'data' && (
              <div className="space-y-6">
                {/* Cloud Sync Section */}
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                    <UploadCloud className="w-4 h-4 text-pink-400" /> 云端同步控制
                  </h3>
                  <p className="text-xs text-white/50 mb-4">
                    手动控制数据同步。为了防止进度冲突，建议平时仅备份。
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => {
                        syncManager.sync('manual', 'push-only');
                        alert('已触发后台备份 (Push Only)');
                      }}
                      className="p-4 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-200 flex flex-col items-center gap-2 transition-all active:scale-95"
                    >
                      <RotateCcw className="w-5 h-5 mb-1" />
                      <span className="font-bold text-sm">备份到云端</span>
                      <span className="text-[10px] opacity-60">仅上传本地新数据</span>
                    </button>

                    <button
                      onClick={() => {
                        if (confirm('确定要从云端恢复数据吗？\n这将会把云端的数据合并到本地。如果在多台设备同时学习，请确保云端数据是最新的。')) {
                          syncManager.sync('manual', 'full-sync');
                          alert('已触发全量同步，请稍候...');
                        }
                      }}
                      className="p-4 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-200 flex flex-col items-center gap-2 transition-all active:scale-95"
                    >
                      <DownloadCloud className="w-5 h-5 mb-1" />
                      <span className="font-bold text-sm">从云端恢复</span>
                      <span className="text-[10px] opacity-60">拉取并合并云端数据</span>
                    </button>
                  </div>
                </div>

                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                    <Database className="w-4 h-4 text-pink-400" /> 数据导入
                  </h3>
                  <p className="text-xs text-white/50 mb-4 leading-relaxed">
                    导入预设的词汇书或测试数据。这将同时生成嵌入向量和知识图谱关联，过程可能需要几分钟。
                  </p>

                  {isImporting ? (
                    <div className="space-y-3">
                      <div className="flex justify-between text-xs text-white/70">
                        <span>正在处理: {importProgress.word}</span>
                        <span>{importProgress.current} / {importProgress.total}</span>
                      </div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-pink-500 transition-all duration-300"
                          style={{ width: `${(importProgress.current / (importProgress.total || 100)) * 100}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-center gap-2 text-xs text-pink-300 animate-pulse">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>正在计算语义关联...</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <button
                        onClick={handleImport}
                        className="w-full py-3 rounded-xl bg-pink-600/20 hover:bg-pink-600/30 border border-pink-500/30 text-pink-200 font-bold transition-all active:scale-95"
                      >
                        导入100测试词 (快速演示)
                      </button>

                      <div className="h-px bg-white/10 my-2" />

                      <div className="grid grid-cols-1 gap-2">
                        {[
                          { name: '四级核心词 (CET-4)', url: '/CET4luan_2.json' },
                          { name: '六级核心词 (CET-6)', url: '/CET6_2.json' },
                          { name: '雅思核心词 (IELTS)', url: '/IELTSluan_2.json' },
                        ].map((dataset) => (
                          <button
                            key={dataset.url}
                            onClick={() => handleCustomImport(dataset.name, dataset.url)}
                            className="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white font-medium transition-all flex items-center justify-between px-4 group"
                          >
                            <span>{dataset.name}</span>
                            <span className="text-xs text-white/30 group-hover:text-white/50">点击导入</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          }

          {
            activeTab === 'algo' && embeddingConfig && (
              <div className="space-y-8">
                {/* Threshold */}
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <label className="text-sm font-medium text-white/80">相似度阈值 (Similarity Threshold)</label>
                    <span className="text-xs text-pink-300 font-mono">{embeddingConfig.threshold.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="0.95"
                    step="0.05"
                    value={embeddingConfig.threshold}
                    onChange={(e) => handleEmbeddingChange('threshold', parseFloat(e.target.value))}
                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-pink-500 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-pink-400"
                  />
                  <p className="text-xs text-white/40">
                    阈值越高，构建的联系越精准，但可能导致孤立单词增多；阈值越低，联系越丰富，但可能出现牵强的关联。建议范围 0.5 - 0.7。
                  </p>
                </div>

                {/* Min Connections */}
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <label className="text-sm font-medium text-white/80">最小连接数 (Min Connections)</label>
                    <span className="text-xs text-pink-300 font-mono">{embeddingConfig.minConnections}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="1"
                    value={embeddingConfig.minConnections}
                    onChange={(e) => handleEmbeddingChange('minConnections', parseFloat(e.target.value))}
                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-pink-500 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-pink-400"
                  />
                  <p className="text-xs text-white/40">
                    强制每个单词至少拥有的连接数量。设为 0 允许孤立单词存在。
                  </p>
                </div>

                {/* Max Connections */}
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <label className="text-sm font-medium text-white/80">最大连接数 (Max Connections)</label>
                    <span className="text-xs text-pink-300 font-mono">{embeddingConfig.maxConnections}</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="50"
                    step="1"
                    value={embeddingConfig.maxConnections}
                    onChange={(e) => handleEmbeddingChange('maxConnections', parseFloat(e.target.value))}
                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-pink-500 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-pink-400"
                  />
                </div>
              </div>
            )
          }

          {
            activeTab === 'audio' && (
              <div className="space-y-6">
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-pink-400" /> 音效测试与调试
                  </h3>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs text-white/60">基础交互</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={playClickSound} className="p-3 rounded-lg bg-white/5 hover:bg-white/10 text-white text-xs text-left">👆 点击 (Click)</button>
                        <button onClick={playKnowSound} className="p-3 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-200 text-xs text-left">✨ 认识 (Know)</button>
                        <button onClick={playSuccessSound} className="p-3 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 text-xs text-left">🎵 拼写成功 (Chime)</button>
                        <button onClick={playFailSound} className="p-3 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 text-xs text-left">❌ 失败 (Fail)</button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs text-white/60">复习评级</label>
                      <div className="grid grid-cols-4 gap-2">
                        <button onClick={playReviewAgainSound} className="p-3 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-200 text-xs">1 重来</button>
                        <button onClick={playReviewHardSound} className="p-3 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-200 text-xs">2 困难</button>
                        <button onClick={playReviewGoodSound} className="p-3 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-200 text-xs">3 良好</button>
                        <button onClick={playReviewEasySound} className="p-3 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-200 text-xs">4 简单</button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs text-white/60">场景音效</label>
                      <button onClick={playSessionCompleteSound} className="w-full p-4 rounded-lg bg-gradient-to-r from-pink-500/20 to-purple-500/20 hover:from-pink-500/30 hover:to-purple-500/30 border border-white/10 text-white font-medium flex items-center justify-center gap-2 shadow-lg">
                        🎉 学习完成 (Victory Fanfare)
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          }

          {
            activeTab === 'api' && (
              <div className="space-y-6">
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                    <Key className="w-4 h-4 text-pink-400" /> DeepSeek API 配置
                  </h3>

                  {/* API Key Input */}
                  <div className="space-y-3 mb-6">
                    <label className="text-sm font-medium text-white/80">API Key</label>
                    <input
                      type="password"
                      value={apiKey || ''}
                      onChange={(e) => onApiKeyChange?.(e.target.value)}
                      placeholder="sk-..."
                      className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder-white/20 focus:outline-none focus:border-pink-500/50 transition-all font-mono text-sm"
                    />
                    <p className="text-xs text-white/40">
                      您的 Key 仅存储在本地浏览器中，不会上传到任何服务器。
                      <a href="https://platform.deepseek.com/" target="_blank" rel="noreferrer" className="text-pink-400 hover:text-pink-300 ml-1">
                        获取 API Key &rarr;
                      </a>
                    </p>
                  </div>

                  {/* API Stats Monitor */}
                  <div className="space-y-2 pt-4 border-t border-white/5">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-white/60 uppercase tracking-wider">API 用量监控 (本地统计)</label>
                      <button
                        onClick={() => {
                          if (confirm('确定要重置由于统计数据吗？')) {
                            import('@/lib/deepseek').then(m => m.resetUsageStats());
                            // Force re-render would require state, but for now simple alert
                            alert('统计已重置');
                          }
                        }}
                        className="text-[10px] text-white/30 hover:text-white/80 transition-colors"
                      >
                        重置统计
                      </button>
                    </div>
                    <ApiUsageStatsView />
                  </div>
                </div>

                {/* 皮肤选择 (原有逻辑) */}
                <div className="bg-black/20 rounded-xl p-4 border border-white/5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Palette className="w-4 h-4 text-pink-400" />
                    <h3 className="text-sm font-medium text-white/90">外观主题 (Skin)</h3>
                  </div>
                </div>

                {/* 省流模式 */}
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-white font-bold flex items-center gap-2">
                        💰 省流模式
                      </h3>
                      <p className="text-xs text-white/50 mt-1">
                        开启后，知识网络中不再调用 DeepSeek 生成词汇间联系说明，能节省大量 Token。
                      </p>
                    </div>
                    <button
                      title="切换省流模式"
                      onClick={() => {
                        const newValue = !tokenSaverMode;
                        setTokenSaverMode(newValue);
                        localStorage.setItem('token_saver_mode', newValue.toString());
                      }}
                      className={`relative w-12 h-6 rounded-full transition-colors ${tokenSaverMode
                        ? 'bg-emerald-500'
                        : 'bg-white/20'
                        }`}
                    >
                      <div
                        className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${tokenSaverMode
                          ? 'translate-x-7'
                          : 'translate-x-1'
                          }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            )
          }

          {
            activeTab === 'hotkey' && (
              <div className="space-y-6">
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <HotkeySettings />
                </div>
              </div>
            )
          }
        </div >

        {/* Footer */}
        <div className="p-6 border-t border-white/5 flex gap-3 bg-black/20" >
          <button
            onClick={onRestoreDefaults}
            className="flex-1 py-3 rounded-xl border border-white/10 text-white/50 hover:bg-white/5 hover:text-white transition-all flex items-center justify-center gap-2 font-medium text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" /> 恢复默认
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white transition-all flex items-center justify-center gap-2 font-bold shadow-lg shadow-pink-500/20 text-sm hover:scale-[1.02] active:scale-[0.98]"
          >
            <Save className="w-4 h-4" /> 完成
          </button>
        </div >
      </div >
    </div >
  );
}
