import type { Card as FSRSCard, RecordLog } from 'ts-fsrs';

/**
 * @description 卡包接口 (Deck Interface)
 */
export interface Deck {
  /** 唯一标识符 */
  id: string;
  /** 卡包名称 */
  name: string;
  /** 描述 (可选) */
  description?: string;
  /** 主题色 (可选) */
  theme?: string;
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 (for sync) */
  updatedAt?: number;
}

/**
 * @description 单词卡片接口 (Word Card Interface)
 * 继承自 ts-fsrs 的 Card 接口，增加了单词本身的内容信息
 */
export interface WordCard extends FSRSCard {
  /** 唯一标识符 */
  id: string;
  /** 所属卡包 ID */
  deckId: string;
  /** 英文单词 */
  word: string;
  /** 中文释义 */
  meaning: string;
  /** 词性 */
  partOfSpeech: string;
  /** 音标 (可选) */
  phonetic?: string;
  /** 例句 (可选) */
  example?: string;
  /** 例句中文翻译 (可选) - Alias: exampleTranslate */
  exampleMeaning?: string;
  exampleTranslate?: string;
  /** 助记 (可选) */
  mnemonic?: string;
  /** 词汇联想 (可选) */
  associations?: string[];
  /** 思维导图数据 (可选) */
  mindMap?: {
    root: {
      label: string;
      meaning?: string;
      children: Array<{
        label: string; // Category (e.g., "Synonyms")
        children: Array<{
          label: string; // Word
          meaning: string;
        }>
      }>
    }
  };
  /** 词根拆分音节 (可选) - DeepSeek 生成 */
  syllables?: string;
  /** 词组搭配 (可选) */
  phrases?: Array<string | { phrase: string; meaning: string }>;
  /** 单词排名/难度等级 (越小越简单) */
  rank?: number;
  /** 派生词 (可选) */
  derivatives?: Array<{ word: string; meaning: string; partOfSpeech: string }>;
  /** 词根词源 (可选) */
  roots?: Array<{
    root: string;
    meaning: string;
    description: string;
    cognates?: string[]; // 同根词
  }>;
  /** 用户笔记 (可选) */
  notes?: string;
  /** 是否已标记为熟悉 (不再出现在复习队列中) */
  isFamiliar?: boolean;
  /** 是否标记为重点 (爱心) */
  isImportant?: boolean;
  /** 创建时间戳 */
  createdAt: number;
  /** 更新时间 (for sync) */
  updatedAt?: number;
}

/**
 * @description 数据库模式
 */
export interface EnglishooDB {
  decks: {
    key: string;
    value: Deck;
  };
  cards: {
    key: string;
    value: WordCard;
    indexes: { 'by-due': number, 'by-deck': string };
  };
  logs: {
    key: string; // log id or composite
    value: RecordLog;
    indexes: { 'by-card-id': string };
  };
}
