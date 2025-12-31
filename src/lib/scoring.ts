/**
 * @description Calculate similarity between two strings using Levenshtein distance
 * Used for scoring shadowing practice (comparing reference text vs user transcript)
 */

/**
 * Normalizes text for fair comparison:
 * - Lowercase
 * - Remove punctuation
 * - Trim whitespace
 */
export function normalizeText(text: string): string {
    return text
        .toLowerCase()
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();
}

/**
 * Computes Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
    const matrix = Array.from({ length: a.length + 1 }, () =>
        Array(b.length + 1).fill(0)
    );

    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1, // deletion
                matrix[i][j - 1] + 1, // insertion
                matrix[i - 1][j - 1] + cost // substitution
            );
        }
    }

    return matrix[a.length][b.length];
}

/**
 * Calculates a percentage score (0-100)
 */
export function calculateSimilarity(target: string, input: string): number {
    const normTarget = normalizeText(target);
    const normInput = normalizeText(input);

    if (!normTarget) return 0;
    if (!normInput) return 0;

    const distance = levenshteinDistance(normTarget, normInput);
    const maxLength = Math.max(normTarget.length, normInput.length);

    const similarity = 1 - distance / maxLength;
    // Scale to 0-100 and floor it
    return Math.max(0, Math.floor(similarity * 100));
}

/**
 * Returns a feedback color/level based on score
 */
export function getScoreLevel(score: number): 'perfect' | 'good' | 'average' | 'retry' {
    if (score >= 90) return 'perfect';
    if (score >= 80) return 'good';
    if (score >= 60) return 'average';
    return 'retry';
}
