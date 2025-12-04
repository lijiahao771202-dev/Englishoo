/**
 * @description 设置弹窗组件 (Settings Modal)
 * 允许用户调整液态玻璃 UI 参数（透明度、模糊度、饱和度、扭曲强度等）。
 * 支持实时预览和恢复默认设置。
 */
import { useState } from 'react';
import { X, RotateCcw, Save, Database, Palette, Loader2, BrainCircuit, Key } from 'lucide-react';
import { seedFromLocalJSON } from '@/lib/seed';
import { importCustomDeck } from '@/lib/import-custom';
import type { EmbeddingConfig } from '@/lib/embedding';

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
  const [activeTab, setActiveTab] = useState<'visual' | 'data' | 'algo' | 'api'>('visual');
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, word: '' });

  if (!isOpen) return null;

  const handleChange = (key: keyof LiquidGlassSettings, value: number) => {
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
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'visual' && (
              <div className="space-y-8">
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
