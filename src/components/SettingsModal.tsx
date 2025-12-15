/**
 * @description 设置弹窗组件 (Settings Modal)
 * 允许用户调整液态玻璃 UI 参数（透明度、模糊度、饱和度、扭曲强度等）。
 * 支持实时预览和恢复默认设置。
 */
import { useState, useEffect } from 'react';
import { X, RotateCcw, Save, Database, Palette, Loader2, BrainCircuit, Key, Volume2 } from 'lucide-react';
import { seedFromLocalJSON } from '@/lib/seed';
import { importCustomDeck } from '@/lib/import-custom';
import type { EmbeddingConfig } from '@/lib/embedding';
import { playClickSound, playSuccessSound, playFailSound, playKnowSound, playReviewAgainSound, playReviewHardSound, playReviewGoodSound, playReviewEasySound, playSessionCompleteSound } from '@/lib/sounds';

export interface LiquidGlassSettings {
  opacity: number;
  blur: number;
  saturation: number;
  distortionScale: number;
  distortionFrequency: number;
  backgroundImage?: string;
}

export const DEFAULT_SETTINGS: LiquidGlassSettings = {
  opacity: 0.03,
  blur: 20,
  saturation: 180,
  distortionScale: 15,
  distortionFrequency: 0.01,
  backgroundImage: '',
};

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
  onApiKeyChange
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'visual' | 'data' | 'algo' | 'api' | 'audio'>('visual');
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, word: '' });
  const [bgUrlInput, setBgUrlInput] = useState('');

  // 背景图历史记录 (1天有效期)
  const [bgHistory, setBgHistory] = useState<Array<{ url: string; timestamp: number }>>([]);
  const BG_HISTORY_KEY = 'background-history';
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  // 加载并清理过期的背景历史
  useEffect(() => {
    try {
      const saved = localStorage.getItem(BG_HISTORY_KEY);
      if (saved) {
        const parsed: Array<{ url: string; timestamp: number }> = JSON.parse(saved);
        // 过滤掉超过1天的记录
        const now = Date.now();
        const valid = parsed.filter(item => (now - item.timestamp) < ONE_DAY_MS);
        setBgHistory(valid);
        // 保存清理后的结果
        localStorage.setItem(BG_HISTORY_KEY, JSON.stringify(valid));
      }
    } catch (e) { /* ignore */ }
  }, [isOpen]); // 每次打开时检查

  // 保存背景到历史
  const saveBgToHistory = (url: string) => {
    if (!url || url.startsWith('data:')) return; // 不保存空或 base64 (太大)
    setBgHistory(prev => {
      // 移除重复
      const filtered = prev.filter(item => item.url !== url);
      // 添加新的到开头
      const updated = [{ url, timestamp: Date.now() }, ...filtered].slice(0, 8); // 最多8个
      localStorage.setItem(BG_HISTORY_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  if (!isOpen) return null;

  const handleChange = (key: keyof LiquidGlassSettings, value: number | string) => {
    // 如果是更换背景图，保存到历史
    if (key === 'backgroundImage' && typeof value === 'string' && value) {
      saveBgToHistory(value);
    }
    onSettingsChange({
      ...settings,
      [key]: value,
    });
  };

  // Helper: Compress Image using Canvas
  const compressImage = (file: File, maxWidth = 1920, quality = 0.7): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Resize logic
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error("Failed to get canvas context"));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          // Compress
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl);
        };
        img.onerror = (e) => reject(e);
      };
      reader.onerror = (e) => reject(e);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show loading or status could be good, but here we just process
    try {
      const compressedDataUrl = await compressImage(file);
      handleChange('backgroundImage', compressedDataUrl);
    } catch (err) {
      console.error("Compression failed:", err);
      alert("图片处理失败，请重试或更换图片。");
    }
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        className="w-full max-w-md bg-slate-900/90 border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-xl font-bold text-white">设置</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex p-2 gap-2 border-b border-white/5 overflow-x-auto">
          <button
            onClick={() => setActiveTab('visual')}
            className={`flex-1 min-w-[80px] py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'visual' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            <Palette className="w-4 h-4" /> 界面
          </button>
          <button
            onClick={() => setActiveTab('data')}
            className={`flex-1 min-w-[80px] py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'data' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            <Database className="w-4 h-4" /> 数据
          </button>
          <button
            onClick={() => setActiveTab('algo')}
            className={`flex-1 min-w-[80px] py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'algo' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            <BrainCircuit className="w-4 h-4" /> 算法
          </button>
          <button
            onClick={() => setActiveTab('api')}
            className={`flex-1 min-w-[80px] py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'api' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            <Key className="w-4 h-4" /> API
          </button>
          <button
            onClick={() => setActiveTab('audio')}
            className={`flex-1 min-w-[80px] py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'audio' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            <Volume2 className="w-4 h-4" /> 音效
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'visual' && (
            <div className="space-y-8">
              {/* Background Image Settings */}
              <div className="space-y-4 p-4 bg-white/5 rounded-xl border border-white/10">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  自定义背景
                </h3>

                {/* 1. File Upload with Compression */}
                <div className="space-y-2">
                  <label className="text-xs text-white/60">上传图片 (自动压缩适配)</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="block w-full text-xs text-slate-500
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-full file:border-0
                      file:text-xs file:font-semibold
                      file:bg-blue-500/20 file:text-blue-400
                      hover:file:bg-blue-500/30"
                  />
                  <p className="text-[10px] text-white/30">支持大图上传，系统将自动优化至 1080P 以节省空间。</p>
                </div>

                {/* 2. URL Input */}
                <div className="space-y-2">
                  <label className="text-xs text-white/60">或者输入图片链接</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={bgUrlInput}
                      onChange={(e) => setBgUrlInput(e.target.value)}
                      placeholder="https://..."
                      className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-xs"
                    />
                    <button
                      onClick={() => handleChange('backgroundImage', bgUrlInput)}
                      className="px-3 py-2 bg-blue-500/20 text-blue-300 rounded-lg text-xs hover:bg-blue-500/30"
                    >
                      应用
                    </button>
                  </div>
                </div>

                {/* 3. 最近使用的背景 (History) */}
                {bgHistory.length > 0 && (
                  <div className="space-y-2 mt-4">
                    <label className="text-xs text-white/60">最近使用 (24小时内)</label>
                    <div className="grid grid-cols-4 gap-2">
                      {bgHistory.map((item, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleChange('backgroundImage', item.url)}
                          className="aspect-square rounded-lg border border-white/10 overflow-hidden relative hover:opacity-80 transition-opacity group"
                        >
                          <img
                            src={item.url}
                            alt={`历史背景 ${idx + 1}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              // 图片加载失败时隐藏
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                          {settings.backgroundImage === item.url && (
                            <div className="absolute inset-0 border-2 border-blue-500 rounded-lg" />
                          )}
                          {/* 时间戳显示 */}
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[8px] text-white/70 px-1 py-0.5 truncate">
                            {new Date(item.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. Presets & Tools */}
                <div className="space-y-2 mt-4">
                  <label className="text-xs text-white/60">精选壁纸 & 工具</label>
                  <div className="grid grid-cols-4 gap-2">
                    {/* Default */}
                    <button
                      onClick={() => handleChange('backgroundImage', '')}
                      className="aspect-square rounded-lg border border-white/10 overflow-hidden relative hover:opacity-80 transition-opacity bg-slate-800 flex items-center justify-center group"
                    >
                      <div className="text-[10px] text-white/50 group-hover:text-white">默认</div>
                      {settings.backgroundImage === '' && (
                        <div className="absolute inset-0 border-2 border-blue-500 rounded-lg" />
                      )}
                    </button>

                    {/* Bing Daily */}
                    <button
                      onClick={() => handleChange('backgroundImage', 'https://bing.biturl.top/?resolution=1920&format=image&index=0&mkt=zh-CN')}
                      className="aspect-square rounded-lg border border-white/10 overflow-hidden relative hover:opacity-80 transition-opacity bg-[#008373]/20 flex flex-col items-center justify-center gap-1 group"
                      title="Bing 每日一图"
                    >
                      <div className="font-bold text-xs text-[#008373] group-hover:text-[#00a896]">Bing</div>
                      <div className="text-[8px] text-white/50">每日</div>
                    </button>

                    {/* Bing Random (Past Week) */}
                    <button
                      onClick={() => {
                        // Bing API only supports index 0-7 (past 8 days)
                        const randomIndex = Math.floor(Math.random() * 8);
                        const url = `https://bing.biturl.top/?resolution=1920&format=image&index=${randomIndex}&mkt=zh-CN&t=${Date.now()}`;
                        handleChange('backgroundImage', url);
                      }}
                      className="aspect-square rounded-lg border border-white/10 overflow-hidden relative hover:opacity-80 transition-opacity bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex flex-col items-center justify-center gap-1 group"
                      title="Bing 随机一周"
                    >
                      <div className="font-bold text-xs text-blue-400 group-hover:text-blue-300">Bing</div>
                      <div className="text-[8px] text-white/50">随机一周</div>
                    </button>

                    {/* Random Nature (Lorem Picsum - Reliable Free API) */}
                    <button
                      onClick={() => {
                        // Lorem Picsum provides reliable random nature/landscape images
                        const randomId = Math.floor(Math.random() * 1000);
                        const url = `https://picsum.photos/seed/${randomId}/1920/1080`;
                        handleChange('backgroundImage', url);
                      }}
                      className="aspect-square rounded-lg border border-white/10 overflow-hidden relative hover:opacity-80 transition-opacity bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex flex-col items-center justify-center gap-1 group"
                      title="随机风景壁纸"
                    >
                      <div className="font-bold text-xs text-emerald-400 group-hover:text-emerald-300">🌿</div>
                      <div className="text-[8px] text-white/50">随机风景</div>
                    </button>

                    {/* Curated High-Quality Wallpapers (Handpicked) */}
                    <button
                      onClick={() => {
                        // Curated list of stunning wallpapers from Unsplash (verified high-quality)
                        const curatedWallpapers = [
                          'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80', // Mountains
                          'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1920&q=80', // Foggy forest
                          'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=1920&q=80', // Lake sunset
                          'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1920&q=80', // Starry mountain
                          'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1920&q=80', // Aurora
                          'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1920&q=80', // Mountain peak
                          'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1920&q=80', // Lake mountains
                          'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?w=1920&q=80', // Misty lake
                          'https://images.unsplash.com/photo-1518173946687-a4c47f766d66?w=1920&q=80', // Northern lights
                          'https://images.unsplash.com/photo-1536431311719-398b6704d4cc?w=1920&q=80', // Colorful sky
                          'https://images.unsplash.com/photo-1542224566-6e85f2e6772f?w=1920&q=80', // Milky way
                          'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=1920&q=80', // Beach sunset
                          'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1920&q=80', // Mountains golden
                          'https://images.unsplash.com/photo-1433086966358-54859d0ed716?w=1920&q=80', // Waterfall
                          'https://images.unsplash.com/photo-1475924156734-496f6cac6ec1?w=1920&q=80', // Desert dunes
                        ];
                        const randomUrl = curatedWallpapers[Math.floor(Math.random() * curatedWallpapers.length)];
                        handleChange('backgroundImage', randomUrl);
                      }}
                      className="aspect-square rounded-lg border border-white/10 overflow-hidden relative hover:opacity-80 transition-opacity bg-gradient-to-br from-amber-500/20 to-rose-500/20 flex flex-col items-center justify-center gap-1 group"
                      title="精选高清壁纸 (随机)"
                    >
                      <div className="font-bold text-xs text-amber-400 group-hover:text-amber-300">✨</div>
                      <div className="text-[8px] text-white/50">精选壁纸</div>
                    </button>

                    {/* Presets */}
                    {[
                      'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&q=80', // Space
                    ].map((url, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleChange('backgroundImage', url)}
                        className="aspect-square rounded-lg border border-white/10 overflow-hidden relative hover:opacity-80 transition-opacity"
                      >
                        <img src={url} alt="Preset" className="w-full h-full object-cover" />
                        {settings.backgroundImage === url && (
                          <div className="absolute inset-0 border-2 border-blue-500 rounded-lg" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Opacity */}
              <div className="space-y-3">
                <div className="flex justify-between">
                  <label className="text-sm font-medium text-white/80">面板透明度 (Overlay Opacity)</label>
                  <span className="text-xs text-blue-300 font-mono">{settings.opacity.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="0.9"
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
          )}

          {activeTab === 'data' && (
            <div className="space-y-6">
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                  <Database className="w-4 h-4 text-blue-400" /> 数据导入
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
                        className="h-full bg-blue-500 transition-all duration-300"
                        style={{ width: `${(importProgress.current / (importProgress.total || 100)) * 100}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-center gap-2 text-xs text-blue-300 animate-pulse">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>正在计算语义关联...</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <button
                      onClick={handleImport}
                      className="w-full py-3 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-200 font-bold transition-all active:scale-95"
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
          )}

          {activeTab === 'algo' && embeddingConfig && (
            <div className="space-y-8">
              {/* Threshold */}
              <div className="space-y-3">
                <div className="flex justify-between">
                  <label className="text-sm font-medium text-white/80">相似度阈值 (Similarity Threshold)</label>
                  <span className="text-xs text-blue-300 font-mono">{embeddingConfig.threshold.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="0.95"
                  step="0.05"
                  value={embeddingConfig.threshold}
                  onChange={(e) => handleEmbeddingChange('threshold', parseFloat(e.target.value))}
                  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-blue-400"
                />
                <p className="text-xs text-white/40">
                  阈值越高，构建的联系越精准，但可能导致孤立单词增多；阈值越低，联系越丰富，但可能出现牵强的关联。建议范围 0.5 - 0.7。
                </p>
              </div>

              {/* Min Connections */}
              <div className="space-y-3">
                <div className="flex justify-between">
                  <label className="text-sm font-medium text-white/80">最小连接数 (Min Connections)</label>
                  <span className="text-xs text-blue-300 font-mono">{embeddingConfig.minConnections}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="1"
                  value={embeddingConfig.minConnections}
                  onChange={(e) => handleEmbeddingChange('minConnections', parseFloat(e.target.value))}
                  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-blue-400"
                />
                <p className="text-xs text-white/40">
                  强制每个单词至少拥有的连接数量。设为 0 允许孤立单词存在。
                </p>
              </div>

              {/* Max Connections */}
              <div className="space-y-3">
                <div className="flex justify-between">
                  <label className="text-sm font-medium text-white/80">最大连接数 (Max Connections)</label>
                  <span className="text-xs text-blue-300 font-mono">{embeddingConfig.maxConnections}</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="50"
                  step="1"
                  value={embeddingConfig.maxConnections}
                  onChange={(e) => handleEmbeddingChange('maxConnections', parseFloat(e.target.value))}
                  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-blue-400"
                />
              </div>
            </div>
          )}

          {activeTab === 'audio' && (
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
          )}

          {activeTab === 'api' && (
            <div className="space-y-6">
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                  <Key className="w-4 h-4 text-blue-400" /> DeepSeek API 配置
                </h3>
                <p className="text-xs text-white/50 mb-4 leading-relaxed">
                  设置 DeepSeek API Key 以启用 AI 辅助功能（自动生成释义、例句、助记等）。
                </p>

                <div className="space-y-3">
                  <label className="text-sm font-medium text-white/80">API Key</label>
                  <input
                    type="password"
                    value={apiKey || ''}
                    onChange={(e) => onApiKeyChange?.(e.target.value)}
                    placeholder="sk-..."
                    className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder-white/20 focus:outline-none focus:border-blue-500/50 transition-all font-mono text-sm"
                  />
                  <p className="text-xs text-white/40">
                    您的 Key 仅存储在本地浏览器中，不会上传到任何服务器。
                    <a href="https://platform.deepseek.com/" target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 ml-1">
                      获取 API Key &rarr;
                    </a>
                  </p>
                </div>
              </div>
            </div>
          )}
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
