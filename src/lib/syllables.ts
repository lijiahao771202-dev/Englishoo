/**
 * 英语单词音节拆分工具
 * English Word Syllable Splitting Utility
 *
 * 提供基于规则的启发式音节拆分功能，用于辅助发音教学和视觉展示。
 * Provides rule-based heuristic syllable splitting for pronunciation teaching and visual display.
 */

/**
 * 将英语单词拆分为音节，使用中间点 (·) 分隔
 * Splits an English word into syllables separated by a middle dot (·)
 *
 * @param {string} word - 需要拆分的英文单词 (The English word to split)
 * @returns {string} - 拆分后的字符串，如 "gra·vi·ty" (The syllabified string, e.g., "gra·vi·ty")
 */
export const syllabify = (word: string): string => {
  if (!word) return '';

  // 简单的启发式正则匹配音节
  // Simple heuristic regex to match syllables
  // 逻辑：匹配辅音(可选) + 元音 + 辅音(可选，但不包括下一个音节的起始辅音)
  const syllableRegex = /[^aeiouy]*[aeiouy]+(?:[^aeiouy]*$|[^aeiouy](?=[^aeiouy]))?/gi;

  const syllables = word.match(syllableRegex);

  if (!syllables) {
    return word;
  }

  return syllables.join('·');
};
