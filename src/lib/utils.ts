import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * 合并 Tailwind CSS 类名
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * @description 模糊匹配 (Fuzzy Match)
 * 使用 Levenshtein Distance 算法计算相似度
 * @param source 源字符串 (用户输入)
 * @param target 目标字符串 (候选词)
 * @returns boolean 是否匹配 (允许 20% 的容错率)
 */
export function fuzzyMatch(source: string, target: string): boolean {
    const s = source.toLowerCase();
    const t = target.toLowerCase();
    
    // 1. 包含匹配 (包含则直接返回 true)
    if (t.includes(s)) return true;
    
    // 2. Levenshtein Distance
    if (s.length < 2) return false; // 太短不进行模糊匹配
    
    const m = s.length;
    const n = t.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = s[i - 1] === t[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,      // deletion
                dp[i][j - 1] + 1,      // insertion
                dp[i - 1][j - 1] + cost // substitution
            );
        }
    }

    const distance = dp[m][n];
    const maxLength = Math.max(m, n);
    const similarity = 1 - distance / maxLength;

    return similarity > 0.7; // 70% 相似度即视为匹配
}
