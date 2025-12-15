export type DialogueScenario =
    | 'greeting'
    | 'streak'
    | 'correct'
    | 'incorrect'
    | 'combo'
    | 'surprised' // Speed/Hard word
    | 'slow'      // Hesitation
    | 'love'      // Poke/Complete
    | 'determined' // Comeback
    | 'sleepy';

export interface DialogueContext {
    timeOfDay?: 'morning' | 'day' | 'night';
    speed?: 'fast' | 'slow';
    streak?: number;
}

export const mascotDialogues: Record<DialogueScenario, (context?: DialogueContext) => string[]> = {
    greeting: (ctx) => {
        if (ctx?.timeOfDay === 'morning') return ["早安！又是变强的一天!", "Morning! 精神满满!", "一日之计在于晨!"];
        if (ctx?.timeOfDay === 'night') return ["嘘...小声点，该睡觉啦", "还在学？是个狠人!", "熬夜变秃...啊不，变强!"];
        return ["让我们认识新朋友!", "New word ahead!", "Ready to learn?"];
    },

    streak: (ctx) => {
        const s = ctx?.streak || 0;
        if (s >= 10) return ["十连胜！封神了！", "Unstoppable!", "Godlike!"];
        if (s >= 5) return ["五连绝世！", "On fire!", "势不可挡!"];
        return ["干得漂亮!", "Keep it up!", "Nice flow!"];
    },

    combo: (ctx) => {
        const s = ctx?.streak || 0;
        return [`Combo ${s}!`, "火力全开!", "Unstoppable!", "节奏完美!"];
    },

    correct: (ctx) => {
        if (ctx?.speed === 'fast') return ["闪电侠附体了？！", "手速惊人!", "秒杀!"];
        return ["选对了!", "Bingo!", "Nice intuition!", "正解!"];
    },

    incorrect: () => {
        return ["再想一想...", "不是这个哦", "Oops!", "没关系，再来一次"];
    },

    surprised: () => {
        return ["居然这都知道？！", "难以置信!", "My goodness!"];
    },

    slow: () => {
        return ["慢慢来，我在陪着你", "这题确实有点绕...", "Take your time...", "不着急，想清楚"];
    },

    love: () => {
        return ["哎哟！", "嘻嘻~", "❤️", "最喜欢你了!", "别..别戳了!"];
    },

    determined: () => {
        return ["再加把劲!", "我们能行!", "Don't give up!", "逆风翻盘!"];
    },

    sleepy: () => {
        return ["Zzz...", "呼噜...", "有点困了..."];
    }
};

export function getMascotDialogue(scenario: DialogueScenario, context: DialogueContext = {}): string {
    const hour = new Date().getHours();
    const timeOfDay: 'morning' | 'day' | 'night' = hour >= 5 && hour < 9 ? 'morning' : (hour >= 23 || hour < 5 ? 'night' : 'day');

    const finalContext = { ...context, timeOfDay };
    const lines = mascotDialogues[scenario](finalContext);
    return lines[Math.floor(Math.random() * lines.length)];
}
