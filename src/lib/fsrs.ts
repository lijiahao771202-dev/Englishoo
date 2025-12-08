import {
  fsrs,
  generatorParameters,
  createEmptyCard,
  Rating,
} from 'ts-fsrs';
import type {
  RecordLogItem,
  Grade
} from 'ts-fsrs';
import type { WordCard } from '@/types';

// 配置 FSRS 参数
const params = generatorParameters({
  enable_fuzz: true, // 启用模糊以避免卡片堆积
  enable_short_term: true
});

const f = fsrs(params);

/**
 * @description 创建新单词卡片
 */
export function createNewWordCard(
  word: string,
  meaning: string,
  partOfSpeech: string,
  deckId: string,
  example?: string,
  mnemonic?: string,
  associations?: string[]
): WordCard {
  const emptyCard = createEmptyCard(new Date());
  return {
    ...emptyCard,
    id: crypto.randomUUID(),
    deckId,
    word,
    meaning,
    partOfSpeech,
    example,
    mnemonic,
    associations,
    createdAt: Date.now(),
  };
}

/**
 * @description 计算下一次复习计划
 * @param card 当前卡片
 * @param rating 用户评分 (Again, Hard, Good, Easy)
 */
export function scheduleReview(card: WordCard, rating: Rating): { card: WordCard; log: any } {
  const now = new Date();

  // [FIX] Ensure dates are proper Date objects (handle deserialization from JSON/Storage)
  const fixDate = (d: any) => (d && !(d instanceof Date)) ? new Date(d) : d;

  const safeCard = {
    ...card,
    due: fixDate(card.due),
    last_review: fixDate(card.last_review)
  };

  // f.repeat returns RecordLog which is a map of Rating -> RecordLogItem
  const scheduling_cards = f.repeat(safeCard, now);

  // Ensure rating is a valid grade for indexing (1-4)
  const grade = rating as Grade;
  const item: RecordLogItem = scheduling_cards[grade];

  // [DEBUG] Verify state transition
  // if (card.state === 0 && item.card.state === 0) { console.warn("FSRS State STUCK at 0", item.card); }

  return {
    card: {
      ...card,
      ...item.card, // Update FSRS fields (state, due, stability, etc.)
    },
    log: item.log
  };
}

/**
 * @description 获取所有评分的预览 (用于显示按钮上的时间)
 */
export function getReviewPreviews(card: WordCard) {
  const now = new Date();
  const scheduling_cards = f.repeat(card, now);
  return scheduling_cards;
}

export { Rating };
