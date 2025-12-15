/**
 * @file mascot-config.ts
 * @description 吉祥物配置系统 - 皮肤、名字、个性化设置
 * @author Trae-Architect
 */

// 皮肤颜色方案
export interface MascotSkin {
    id: string;
    name: string;
    emoji: string;
    // 渐变色配置
    gradientStart: string;
    gradientMid: string;
    gradientEnd: string;
    // 腮红颜色
    blushColor: string;
    // 描边颜色 (可选)
    strokeColor?: string;
    // 配饰列表 (可选)
    accessories?: string[];
    // 是否解锁（未来可做成就系统）
    unlocked: boolean;
}

// 预设皮肤列表
export const MASCOT_SKINS: MascotSkin[] = [
    {
        id: 'pink',
        name: '樱花粉',
        emoji: '🌸',
        gradientStart: '#FFE5F1',
        gradientMid: '#FFC2D4',
        gradientEnd: '#FF9EBB',
        blushColor: '#FF8BA7',
        unlocked: true,
    },
    {
        id: 'blue',
        name: '天空蓝',
        emoji: '☁️',
        gradientStart: '#E5F3FF',
        gradientMid: '#B8DCFF',
        gradientEnd: '#8BC5FF',
        blushColor: '#7EB8F0',
        unlocked: true,
    },
    {
        id: 'mint',
        name: '薄荷绿',
        emoji: '🌿',
        gradientStart: '#E5FFF0',
        gradientMid: '#B8F5D8',
        gradientEnd: '#8BE8BE',
        blushColor: '#7AD4A5',
        unlocked: true,
    },
    {
        id: 'lavender',
        name: '薰衣草',
        emoji: '💜',
        gradientStart: '#F3E5FF',
        gradientMid: '#D8B8FF',
        gradientEnd: '#C08BFF',
        blushColor: '#B07AE8',
        unlocked: true,
    },
    {
        id: 'sunset',
        name: '日落橙',
        emoji: '🌅',
        gradientStart: '#FFF0E5',
        gradientMid: '#FFD4B8',
        gradientEnd: '#FFB88B',
        blushColor: '#FFA07A',
        unlocked: true,
    },
    {
        id: 'gold',
        name: '金色传奇',
        emoji: '⭐',
        gradientStart: '#FFF9E5',
        gradientMid: '#FFE8A8',
        gradientEnd: '#FFD56A',
        blushColor: '#FFCC4D',
        unlocked: false, // 需要连续打卡7天解锁
    },
];

// 默认吉祥物名字
export const DEFAULT_MASCOT_NAME = '小英';

// 吉祥物配置接口
export interface MascotConfig {
    skinId: string;
    name: string;
}

// 默认配置
export const DEFAULT_MASCOT_CONFIG: MascotConfig = {
    skinId: 'pink',
    name: DEFAULT_MASCOT_NAME,
};

// 从 localStorage 加载配置
export function loadMascotConfig(): MascotConfig {
    try {
        const saved = localStorage.getItem('mascot_config');
        if (saved) {
            return { ...DEFAULT_MASCOT_CONFIG, ...JSON.parse(saved) };
        }
    } catch (e) {
        console.error('Failed to load mascot config:', e);
    }
    return DEFAULT_MASCOT_CONFIG;
}

// 保存配置到 localStorage
export function saveMascotConfig(config: MascotConfig): void {
    localStorage.setItem('mascot_config', JSON.stringify(config));
}

// 根据 ID 获取皮肤
export function getMascotSkin(skinId: string): MascotSkin {
    return MASCOT_SKINS.find(s => s.id === skinId) || MASCOT_SKINS[0];
}
