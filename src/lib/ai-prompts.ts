/**
 * @file ai-prompts.ts
 * @description AI 聊天助手的上下文感知 System Prompts
 * @context 根据用户当前所在页面/视图，提供不同的 AI 行为模式
 */

import type { WordCard } from '@/types';

// 视图类型定义
export type AIMode = 'advisor' | 'librarian' | 'analyst' | 'coach' | 'tutor';

// 模式配置
export interface AIModeConfig {
    mode: AIMode;
    label: string;
    emoji: string;
    description: string;
}

// 视图到模式的映射
export function getAIModeFromView(view: string): AIModeConfig {
    switch (view) {
        case 'decks':
            return {
                mode: 'advisor',
                label: '学习顾问',
                emoji: '📊',
                description: '分析学习数据，制定学习计划'
            };
        case 'deck-detail':
        case 'deck-clusters':
            return {
                mode: 'librarian',
                label: '词库助手',
                emoji: '📚',
                description: '帮助管理和组织词汇'
            };
        case 'knowledge-graph':
            return {
                mode: 'analyst',
                label: '关系分析师',
                emoji: '🔗',
                description: '发现词汇之间的联系'
            };
        case 'review-dashboard':
        case 'review-queue':
            return {
                mode: 'coach',
                label: '复习教练',
                emoji: '🎯',
                description: '优化复习策略，突破难点'
            };
        case 'guided-learning':
        case 'review':
        case 'teaching':
        default:
            return {
                mode: 'tutor',
                label: '词汇导师',
                emoji: '📝',
                description: '深入讲解单词用法'
            };
    }
}

// 获取快捷问题
export function getQuickQuestions(mode: AIMode, contextData?: {
    currentWord?: string;
    deckName?: string;
    dueCount?: number;
    newCount?: number;
}): string[] {
    switch (mode) {
        case 'advisor':
            return [
                '今天我应该学多少个新单词？',
                '帮我制定本周学习计划',
                '我的学习进度怎么样？',
            ];
        case 'librarian':
            return [
                contextData?.deckName ? `"${contextData.deckName}"有什么主题词群？` : '这个卡包有什么主题？',
                '推荐我先学哪些词？',
                '帮我分析这些词的难度分布',
            ];
        case 'analyst':
            return [
                '帮我找出相关的词群',
                '这些词之间有什么联系？',
                '哪些词根是高频的？',
            ];
        case 'coach':
            return [
                contextData?.dueCount ? `我有 ${contextData.dueCount} 个待复习，有什么建议？` : '我该怎么安排复习？',
                '哪些词最容易忘记？',
                '帮我分析复习效率',
            ];
        case 'tutor':
            return contextData?.currentWord ? [
                `"${contextData.currentWord}"还有哪些常见搭配？`,
                `"${contextData.currentWord}"的词根是什么？`,
                `"${contextData.currentWord}"和哪些词容易混淆？`,
            ] : [
                '帮我解释当前这个单词',
                '给我更多例句',
                '有什么好的记忆方法？',
            ];
        default:
            return [];
    }
}

// 获取 System Prompt
export function getSystemPrompt(mode: AIMode, contextData?: {
    currentWord?: string;
    currentMeaning?: string;
    cards?: WordCard[];
    deckName?: string;
    dueCount?: number;
    newCount?: number;
    totalCards?: number;
}): string {
    const baseFormat = `
## 回复格式要求：
1. 使用 **Markdown 格式** 让内容结构清晰
2. 用 **###** 作为小标题分隔不同内容块
3. 用 **>** 引用块来高亮重要信息
4. **禁止使用表格**，改用列表格式展示
5. 关键词用 **加粗** 突出
6. 保持简洁，避免啰嗦

请用简体中文回复。`;

    switch (mode) {
        case 'advisor':
            return `你是一个专业的英语学习顾问，专门帮助用户规划和优化学习策略。

## 当前用户数据：
- 总单词数：${contextData?.totalCards || '未知'}
- 待复习：${contextData?.dueCount || 0} 个
- 新单词：${contextData?.newCount || 0} 个

## 你的职责：
1. 根据用户数据提供个性化学习建议
2. 帮助制定合理的学习计划
3. 分析学习进度和效率
4. 提供激励和正向反馈

${baseFormat}`;

        case 'librarian':
            return `你是一个专业的词库管理助手，专门帮助用户组织和理解词汇。

## 当前上下文：
${contextData?.deckName ? `- 当前卡包：${contextData.deckName}` : ''}
- 卡包单词数：${contextData?.cards?.length || '未知'}

## 你的职责：
1. 分析词汇主题和分类
2. 推荐学习顺序和优先级
3. 识别词汇之间的关联
4. 帮助用户理解词汇体系

${baseFormat}`;

        case 'analyst':
            return `你是一个词汇关系分析专家，专门发现和解释词汇之间的联系。

## 你的职责：
1. 分析词根、词缀的关系
2. 发现语义相关的词群
3. 识别同义词、反义词网络
4. 解释词汇演变和来源
5. 构建记忆联想链

${baseFormat}`;

        case 'coach':
            return `你是一个专业的复习教练，专门帮助用户优化记忆和复习策略。

## 当前复习数据：
- 待复习词汇：${contextData?.dueCount || 0} 个

## 你的职责：
1. 分析遗忘规律，提供复习建议
2. 识别难点词汇，提供突破策略
3. 优化复习节奏和频率
4. 帮助用户建立长期记忆

${baseFormat}`;

        case 'tutor':
        default:
            return `你是一个专业的英语学习助手，专门帮助中国学生学习英语词汇。
${contextData?.currentWord ? `当前用户正在学习的单词是: "${contextData.currentWord}"${contextData?.currentMeaning ? `，释义是: "${contextData.currentMeaning}"` : ''}。` : ''}

## 你的职责：
1. 深入解释词汇含义和用法
2. 提供地道的例句
3. 分析词根词缀
4. 设计助记方法
5. 对比易混淆词

${baseFormat}

## 示例格式：
### 词根分析
**drunk** = drink 的过去分词

### 例句
> He was **drunk** last night.
他昨晚喝醉了。

### 对比
- **drunk** - 醉的（形容词/过去分词）
- **drank** - 喝（过去式）
- **drink** - 喝（原形）`;
    }
}
