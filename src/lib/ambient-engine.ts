/**
 * @class AmbientEngine
 * @description 流式白噪音引擎 (Streaming Ambient Engine)
 * 使用 HTML5 Audio 播放高质量的循环音效文件。
 * 支持 3 种本地环境音：雨声、森林、壁炉
 */

export type AmbientMode = 'rain' | 'forest' | 'fire' | 'off';

class AmbientEngine {
    private static instance: AmbientEngine;
    private currentMode: AmbientMode = 'off';
    private volume: number = 0.5;

    // Active Audio Object
    private audio: HTMLAudioElement | null = null;

    // Local Assets (verified working files in /public/sounds/)
    private static ASSETS: Record<Exclude<AmbientMode, 'off'>, string> = {
        rain: '/sounds/rain.ogg',
        forest: '/sounds/forest.mp3',
        fire: '/sounds/fire.ogg'
    };

    private constructor() { }

    public static getInstance(): AmbientEngine {
        if (!AmbientEngine.instance) {
            AmbientEngine.instance = new AmbientEngine();
        }
        return AmbientEngine.instance;
    }

    public setVolume(val: number) {
        this.volume = Math.max(0, Math.min(1, val));
        if (this.audio) {
            this.audio.volume = this.volume;
        }
    }

    public async setMode(mode: AmbientMode) {
        if (this.currentMode === mode) return;

        // 1. Fade out current
        if (this.audio) {
            this.fadeOutAndStop(this.audio);
            this.audio = null;
        }

        this.currentMode = mode;
        if (mode === 'off') return;

        // 2. Start new
        const url = AmbientEngine.ASSETS[mode];
        if (url) {
            const newAudio = new Audio(url);
            newAudio.loop = true;
            newAudio.volume = 0; // Start silent for fade in

            // Auto-play policy handling
            try {
                await newAudio.play();
                this.fadeIn(newAudio);
                this.audio = newAudio;
            } catch (e) {
                console.warn('AmbientEngine: Autoplay blocked or failed', e);
            }
        }
    }

    private fadeIn(audio: HTMLAudioElement) {
        let vol = 0;
        const target = this.volume;
        const step = target / 20; // 20 steps (approx 1s)

        const interval = setInterval(() => {
            if (!audio || audio.paused) {
                clearInterval(interval);
                return;
            }
            vol += step;
            if (vol >= target) {
                vol = target;
                clearInterval(interval);
            }
            audio.volume = vol;
        }, 50);
    }

    private fadeOutAndStop(audio: HTMLAudioElement) {
        let vol = audio.volume;
        const step = vol / 20;

        const interval = setInterval(() => {
            vol -= step;
            if (vol <= 0.01) {
                vol = 0;
                audio.pause();
                audio.src = ''; // Release memory
                clearInterval(interval);
            } else {
                audio.volume = vol;
            }
        }, 50);
    }
}

export default AmbientEngine;
