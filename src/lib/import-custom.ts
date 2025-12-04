import { createDeck, saveCard } from './db';
import { createNewWordCard } from './fsrs';
import { EmbeddingService } from './embedding';

interface CustomImportProgress {
  count: number;
  total: number;
  currentWord: string;
}

/**
 * @description 导入自定义 JSON 数据集
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

  // 3. Parse and Save Cards
  const total = data.length;
  const wordsToEmbed: string[] = [];

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

    // Save to DB
    await saveCard(card);
    wordsToEmbed.push(word);

    // Update progress
    onProgress({
      count: i + 1,
      total,
      currentWord: word
    });

    // Yield to UI every 50 items
    if (i % 50 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  // 4. Batch Generate Embeddings & Connections
  // This runs in background mostly, but we await it here to ensure it's done before finishing
  if (wordsToEmbed.length > 0) {
    await EmbeddingService.getInstance().batchProcess(wordsToEmbed, (p, t, stage) => {
       // Map embedding progress to remaining percentage (optional, or just log)
       // Since import is "done" from data perspective, we might not block UI for this, 
       // but user requested "import", so it's better to finish fully.
       // Let's update progress text via callback if we want, but for now just let it run.
       // We can reuse onProgress to show "Processing embeddings..."
       onProgress({
           count: p,
           total: t,
           currentWord: `生成关联: ${stage} ${Math.round(p/t*100)}%`
       });
    });
  }

  return { count: total, deckId };
}
