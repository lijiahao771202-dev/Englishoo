/**
 * @description 设置弹窗组件 (Settings Modal)
 * 允许用户调整液态玻璃 UI 参数（透明度、模糊度、饱和度、扭曲强度等）。
 * 支持实时预览和恢复默认设置。
 */
import { useState, useEffect } from 'react';
import { X, RotateCcw, Save, Database, Palette, Loader2, BrainCircuit, Key, Volume2, Keyboard } from 'lucide-react';
import { seedFromLocalJSON } from '@/lib/seed';
import { importCustomDeck } from '@/lib/import-custom';
import type { EmbeddingConfig } from '@/lib/embedding';
import { playClickSound, playSuccessSound, playFailSound, playKnowSound, playReviewAgainSound, playReviewHardSound, playReviewGoodSound, playReviewEasySound, playSessionCompleteSound } from '@/lib/sounds';
import { HotkeySettings } from './HotkeySettings';

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
  const [activeTab, setActiveTab] = useState<'visual' | 'data' | 'algo' | 'api' | 'audio' | 'hotkey'>('visual');
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
            className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'visual' ? 'bg-gradient-to-r from-pink-500/20 to-rose-500/20 text-pink-200 border border-pink-500/20 shadow-sm' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            <Palette className="w-3.5 h-3.5" /> 界面
          </button>
          <button
            onClick={() => setActiveTab('data')}
            className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'data' ? 'bg-gradient-to-r from-pink-500/20 to-rose-500/20 text-pink-200 border border-pink-500/20 shadow-sm' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            <Database className="w-3.5 h-3.5" /> 数据
          </button>
          <button
            onClick={() => setActiveTab('algo')}
            className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'algo' ? 'bg-gradient-to-r from-pink-500/20 to-rose-500/20 text-pink-200 border border-pink-500/20 shadow-sm' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            <BrainCircuit className="w-3.5 h-3.5" /> 算法
          </button>
          <button
            onClick={() => setActiveTab('api')}
            className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'api' ? 'bg-gradient-to-r from-pink-500/20 to-rose-500/20 text-pink-200 border border-pink-500/20 shadow-sm' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            <Key className="w-3.5 h-3.5" /> API
          </button>
          <button
            onClick={() => setActiveTab('audio')}
            className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'audio' ? 'bg-gradient-to-r from-pink-500/20 to-rose-500/20 text-pink-200 border border-pink-500/20 shadow-sm' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            <Volume2 className="w-3.5 h-3.5" /> 音效
          </button>
          <button
            onClick={() => setActiveTab('hotkey')}
            className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'hotkey' ? 'bg-gradient-to-r from-pink-500/20 to-rose-500/20 text-pink-200 border border-pink-500/20 shadow-sm' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            <Keyboard className="w-3.5 h-3.5" /> 快捷键
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
                      file:bg-pink-500/20 file:text-pink-400
                      hover:file:bg-pink-500/30"
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
                      className="px-3 py-2 bg-pink-500/20 text-pink-300 rounded-lg text-xs hover:bg-pink-500/30"
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
                            <div className="absolute inset-0 border-2 border-pink-500 rounded-lg" />
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
                        <div className="absolute inset-0 border-2 border-pink-500 rounded-lg" />
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

                    {/* 动漫风格 (Anime Style from waifu.im) */}
                    <button
                      onClick={() => {
                        const categories = ['waifu', 'maid', 'uniform'];
                        const category = categories[Math.floor(Math.random() * categories.length)];
                        const url = `https://api.waifu.im/search?included_tags=${category}&width=>=1920&height=>=1080&is_nsfw=false&t=${Date.now()}`;
                        fetch(url)
                          .then(res => res.json())
                          .then(data => {
                            if (data.images && data.images[0]) {
                              handleChange('backgroundImage', data.images[0].url);
                            }
                          })
                          .catch(() => {
                            // Fallback to static anime wallpaper
                            handleChange('backgroundImage', 'https://w.wallhaven.cc/full/ex/wallhaven-exolv8.jpg');
                          });
                      }}
                      className="aspect-square rounded-lg border border-white/10 overflow-hidden relative hover:opacity-80 transition-opacity bg-gradient-to-br from-pink-500/20 to-purple-500/20 flex flex-col items-center justify-center gap-1 group"
                      title="动漫壁纸"
                    >
                      <div className="font-bold text-xs text-pink-400 group-hover:text-pink-300">🎨</div>
                      <div className="text-[8px] text-white/50">动漫</div>
                    </button>

                    {/* 抽象艺术 (Abstract Art) */}
                    <button
                      onClick={() => {
                        const abstractWallpapers = [
                          'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=1920&q=80', // Fluid art
                          'https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?w=1920&q=80', // Gradient waves
                          'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=1920&q=80', // Colorful gradient
                          'https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=1920&q=80', // Purple gradient
                          'https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?w=1920&q=80', // 3D abstract
                          'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1920&q=80', // Geometric
                          'https://images.unsplash.com/photo-1620121692029-d088224ddc74?w=1920&q=80', // Neon abstract
                          'https://images.unsplash.com/photo-1604076913837-52ab5629fba9?w=1920&q=80', // Marble art
                        ];
                        const randomUrl = abstractWallpapers[Math.floor(Math.random() * abstractWallpapers.length)];
                        handleChange('backgroundImage', randomUrl);
                      }}
                      className="aspect-square rounded-lg border border-white/10 overflow-hidden relative hover:opacity-80 transition-opacity bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex flex-col items-center justify-center gap-1 group"
                      title="抽象艺术壁纸"
                    >
                      <div className="font-bold text-xs text-violet-400 group-hover:text-violet-300">🎭</div>
                      <div className="text-[8px] text-white/50">抽象艺术</div>
                    </button>

                    {/* 城市夜景 (City Night) */}
                    <button
                      onClick={() => {
                        const cityWallpapers = [
                          'https://images.unsplash.com/photo-1514565131-fce0801e5785?w=1920&q=80', // Tokyo night
                          'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=1920&q=80', // NYC skyline
                          'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=1920&q=80', // City lights
                          'https://images.unsplash.com/photo-1444723121867-7a241cacace9?w=1920&q=80', // Sunset city
                          'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1920&q=80', // Urban night
                          'https://images.unsplash.com/photo-1470219556762-1771e7f9427d?w=1920&q=80', // Bridge at night
                          'https://images.unsplash.com/photo-1519608487953-e999c86e7455?w=1920&q=80', // Neon city
                          'https://images.unsplash.com/photo-1534430480872-3498386e7856?w=1920&q=80', // Hong Kong
                        ];
                        const randomUrl = cityWallpapers[Math.floor(Math.random() * cityWallpapers.length)];
                        handleChange('backgroundImage', randomUrl);
                      }}
                      className="aspect-square rounded-lg border border-white/10 overflow-hidden relative hover:opacity-80 transition-opacity bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex flex-col items-center justify-center gap-1 group"
                      title="城市夜景壁纸"
                    >
                      <div className="font-bold text-xs text-cyan-400 group-hover:text-cyan-300">🌃</div>
                      <div className="text-[8px] text-white/50">城市夜景</div>
                    </button>

                    {/* 星空银河 (Galaxy & Stars) */}
                    <button
                      onClick={() => {
                        const spaceWallpapers = [
                          'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=1920&q=80', // Milky way
                          'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=1920&q=80', // Galaxy
                          'https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=1920&q=80', // Stars
                          'https://images.unsplash.com/photo-1465101162946-4377e57745c3?w=1920&q=80', // Nebula
                          'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1920&q=80', // Earth from space
                          'https://images.unsplash.com/photo-1516339901601-2e1b62dc0c45?w=1920&q=80', // Aurora stars
                          'https://images.unsplash.com/photo-1507400492013-162706c8c05e?w=1920&q=80', // Deep space
                          'https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=1920&q=80', // Colorful space
                        ];
                        const randomUrl = spaceWallpapers[Math.floor(Math.random() * spaceWallpapers.length)];
                        handleChange('backgroundImage', randomUrl);
                      }}
                      className="aspect-square rounded-lg border border-white/10 overflow-hidden relative hover:opacity-80 transition-opacity bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex flex-col items-center justify-center gap-1 group"
                      title="星空银河壁纸"
                    >
                      <div className="font-bold text-xs text-indigo-400 group-hover:text-indigo-300">🌌</div>
                      <div className="text-[8px] text-white/50">星空银河</div>
                    </button>

                    {/* 极简渐变 (Minimal Gradient) */}
                    <button
                      onClick={() => {
                        const gradientWallpapers = [
                          'https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=1920&q=80', // Purple gradient
                          'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=1920&q=80', // Colorful gradient
                          'https://images.unsplash.com/photo-1557683316-973673baf926?w=1920&q=80', // Blue gradient
                          'https://images.unsplash.com/photo-1557683311-eac922347aa1?w=1920&q=80', // Orange gradient
                          'https://images.unsplash.com/photo-1557682224-5b8590cd9ec5?w=1920&q=80', // Green gradient
                          'https://images.unsplash.com/photo-1557682260-96773eb01377?w=1920&q=80', // Pink gradient
                        ];
                        const randomUrl = gradientWallpapers[Math.floor(Math.random() * gradientWallpapers.length)];
                        handleChange('backgroundImage', randomUrl);
                      }}
                      className="aspect-square rounded-lg border border-white/10 overflow-hidden relative hover:opacity-80 transition-opacity bg-gradient-to-br from-rose-500/20 to-orange-500/20 flex flex-col items-center justify-center gap-1 group"
                      title="极简渐变壁纸"
                    >
                      <div className="font-bold text-xs text-rose-400 group-hover:text-rose-300">🌈</div>
                      <div className="text-[8px] text-white/50">极简渐变</div>
                    </button>

                    {/* 海洋沙滩 (Ocean & Beach) */}
                    <button
                      onClick={() => {
                        const oceanWallpapers = [
                          'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=80', // Tropical beach
                          'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=1920&q=80', // Ocean waves
                          'https://images.unsplash.com/photo-1519046904884-53103b34b206?w=1920&q=80', // Beach sunset
                          'https://images.unsplash.com/photo-1471922694854-ff1b63b20054?w=1920&q=80', // Blue ocean
                          'https://images.unsplash.com/photo-1484291470158-b8f8d608850d?w=1920&q=80', // Underwater
                          'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=1920&q=80', // Wave crash
                        ];
                        const randomUrl = oceanWallpapers[Math.floor(Math.random() * oceanWallpapers.length)];
                        handleChange('backgroundImage', randomUrl);
                      }}
                      className="aspect-square rounded-lg border border-white/10 overflow-hidden relative hover:opacity-80 transition-opacity bg-gradient-to-br from-sky-500/20 to-teal-500/20 flex flex-col items-center justify-center gap-1 group"
                      title="海洋沙滩壁纸"
                    >
                      <div className="font-bold text-xs text-sky-400 group-hover:text-sky-300">🌊</div>
                      <div className="text-[8px] text-white/50">海洋沙滩</div>
                    </button>

                    {/* Presets - Static preview images */}
                    {[
                      'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&q=80', // Space
                      'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&q=80', // Starry mountain
                      'https://images.unsplash.com/photo-1514565131-fce0801e5785?w=800&q=80', // Tokyo
                    ].map((url, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleChange('backgroundImage', url.replace('w=800', 'w=1920'))}
                        className="aspect-square rounded-lg border border-white/10 overflow-hidden relative hover:opacity-80 transition-opacity"
                      >
                        <img src={url} alt="Preset" className="w-full h-full object-cover" />
                        {settings.backgroundImage === url.replace('w=800', 'w=1920') && (
                          <div className="absolute inset-0 border-2 border-pink-500 rounded-lg" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'data' && (
            <div className="space-y-6">
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
          )}

          {activeTab === 'algo' && embeddingConfig && (
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
                  <Key className="w-4 h-4 text-pink-400" /> DeepSeek API 配置
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
                    className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder-white/20 focus:outline-none focus:border-pink-500/50 transition-all font-mono text-sm"
                  />
                  <p className="text-xs text-white/40">
                    您的 Key 仅存储在本地浏览器中，不会上传到任何服务器。
                    <a href="https://platform.deepseek.com/" target="_blank" rel="noreferrer" className="text-pink-400 hover:text-pink-300 ml-1">
                      获取 API Key &rarr;
                    </a>
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'hotkey' && (
            <div className="space-y-6">
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <HotkeySettings />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/5 flex gap-3 bg-black/20">
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
        </div>
      </div>
    </div>
  );
}
