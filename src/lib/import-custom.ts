import { createDeck, saveCards } from './data-source';
import { createNewWordCard } from './fsrs';
import { EmbeddingService } from './embedding';
import type { WordCard } from '@/types';

interface CustomImportProgress {
  count: number;
  total: number;
  currentWord: string;
}

/**
 * @description 导入自定义 JSON 数据集 (优化版 - 批量插入)
 * @param fileUrl JSON 文件的 URL (相对于 public 目录)
 * @param deckName 卡包名称
 * @param onProgress 进度回调
 */
export async function importCustomDeck(
  fileUrl: string,
  deckName: string,
  onProgress: (progress: CustomImportProgress) => void
) {
  // 1. Fetch JSON data
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.statusText}`);
  }

  // Try to parse as JSON array first, then fallback to NDJSON (newline delimited JSON)
  let data: any[] = [];
  const text = await response.text();

  try {
    // Try parsing as standard JSON array
    const json = JSON.parse(text);
    if (Array.isArray(json)) {
      data = json;
    } else {
      // Single object? wrap in array
      data = [json];
    }
  } catch (e) {
    // Failed to parse as single JSON, try NDJSON
    try {
      data = text
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
    } catch (e2) {
      throw new Error('Invalid JSON format: content is neither a JSON array nor NDJSON.');
    }
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('No valid data found in file.');
  }

  // 2. Create Deck
  const deckId = `custom-${Date.now()}`;
  await createDeck({
    id: deckId,
    name: deckName,
    createdAt: new Date(),
    theme: 'blue', // Default theme
    description: `Imported from ${fileUrl}`
  });

  // 3. Parse Cards (先解析所有卡片，再批量保存)
  const total = data.length;
  const wordsToEmbed: string[] = [];
  const cardsToSave: WordCard[] = [];

  onProgress({ count: 0, total, currentWord: '解析数据...' });

  for (let i = 0; i < total; i++) {
    const item = data[i];

    // Safe parsing with optional chaining
    const word = item.headWord || item.content?.word?.wordHead;
    if (!word) continue;

    // Extract meaning (first translation)
    const translations = item.content?.word?.content?.trans || [];
    const meaning = translations.map((t: any) => `${t.pos}. ${t.tranCn}`).join('; ') || '暂无释义';

    // Extract part of speech (from first translation)
    const partOfSpeech = translations[0]?.pos || 'unknown';

    // Extract phonetic
    const phonetic = item.content?.word?.content?.usphone || item.content?.word?.content?.ukphone || '';

    // Extract example (first sentence)
    const sentences = item.content?.word?.content?.sentence?.sentences || [];
    const example = sentences[0]?.sContent || '';
    const exampleMeaning = sentences[0]?.sCn || '';

    // Create Card
    const card = createNewWordCard(
      word,
      meaning,
      partOfSpeech,
      deckId,
      example,
      undefined, // mnemonic
      undefined  // associations
    );

    // Add extra fields if needed
    card.phonetic = phonetic;
    card.exampleMeaning = exampleMeaning;

    cardsToSave.push(card);
    wordsToEmbed.push(word);

    // Update progress every 100 items during parsing
    if (i % 100 === 0) {
      onProgress({ count: i, total, currentWord: `解析: ${word}` });
      await new Promise(resolve => setTimeout(resolve, 0)); // Yield to UI
    }
  }

  // 4. Batch Save Cards (批量保存，大幅提升性能)
  onProgress({ count: 0, total: cardsToSave.length, currentWord: '批量保存到数据库...' });

  const BATCH_SIZE = 100;
  for (let i = 0; i < cardsToSave.length; i += BATCH_SIZE) {
    const batch = cardsToSave.slice(i, i + BATCH_SIZE);
    await saveCards(batch);
    onProgress({
      count: Math.min(i + BATCH_SIZE, cardsToSave.length),
      total: cardsToSave.length,
      currentWord: `已保存 ${Math.min(i + BATCH_SIZE, cardsToSave.length)}/${cardsToSave.length}`
    });
  }

  // 5. Batch Generate Embeddings & Connections (可选，耗时较长)
  if (wordsToEmbed.length > 0) {
    await EmbeddingService.getInstance().batchProcess(wordsToEmbed, (p, t, stage) => {
      onProgress({
        count: p,
        total: t,
        currentWord: `生成关联: ${stage} ${Math.round(p / t * 100)}%`
      });
    });
  }

  return { count: cardsToSave.length, deckId };
}
