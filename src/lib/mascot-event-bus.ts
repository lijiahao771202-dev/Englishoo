import type { MascotReaction } from '@/components/InteractiveMascot';

type MascotEventType = 'SAY' | 'REACT' | 'COMBO' | 'SET_TEACHER_MODE' | 'EXPLAIN' | 'LEARN_WORD' | 'PREFETCH_EXPLANATION' | 'REFINE_EXPLANATION';

export interface MascotEventPayload {
    type: MascotEventType;
    text?: string;       // 气泡文字 或 讲解内容 或 单词
    reaction?: MascotReaction; // 表情
    duration?: number;   // 持续时间 (ms)
    isTeacher?: boolean; // [Feature I] 是否开启老师模式
    context?: any;       // [Feature I] 额外上下文
}

class MascotEventBus {
    private static instance: MascotEventBus;
    private listeners: ((event: MascotEventPayload) => void)[] = [];

    private constructor() { }

    public static getInstance(): MascotEventBus {
        if (!MascotEventBus.instance) {
            MascotEventBus.instance = new MascotEventBus();
        }
        return MascotEventBus.instance;
    }

    public subscribe(listener: (event: MascotEventPayload) => void): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    public emit(event: MascotEventPayload) {
        this.listeners.forEach(listener => listener(event));
    }

    // 快捷方法: 说话
    public say(text: string, reaction: MascotReaction = 'happy', duration: number = 3000) {
        this.emit({ type: 'SAY', text, reaction, duration });
    }

    // 快捷方法: 仅表情
    public react(reaction: MascotReaction, duration: number = 2000) {
        this.emit({ type: 'REACT', reaction, duration });
    }

    // [Feature I] 切换老师模式
    public setTeacherMode(enabled: boolean) {
        this.emit({ type: 'SET_TEACHER_MODE', isTeacher: enabled });
    }

    // [Feature I] 老师讲解
    public explain(content: string) {
        this.emit({ type: 'EXPLAIN', text: content });
    }

    // [Feature I] 请求讲解新单词
    public requestExplanation(word: string, context?: any) {
        this.emit({ type: 'LEARN_WORD', text: word, context });
    }

    // [Performance] 预加载讲解
    public prefetchExplanation(word: string, context?: any) {
        this.emit({ type: 'PREFETCH_EXPLANATION', text: word, context });
    }

    // [Feature I] 追问/深化讲解
    public refineExplanation(word: string, type: 'simplification' | 'example' | 'mnemonic') {
        this.emit({ type: 'REFINE_EXPLANATION', text: word, context: { refineType: type } });
    }
}

export const mascotEventBus = MascotEventBus.getInstance();
