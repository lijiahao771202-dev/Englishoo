import { addToVocabularyDeck } from './db';
import { EmbeddingService } from './embedding';

// 100个单词，涵盖不同领域以展示聚类效果
const WORD_LIST = [
  // 自然与环境 (Nature)
  "ocean", "mountain", "river", "forest", "tree", "flower", "rain", "sun", "moon", "star",
  "cloud", "wind", "fire", "ice", "snow", "earth", "sky", "beach", "sand", "stone",
  
  // 动物 (Animals)
  "dog", "cat", "lion", "tiger", "elephant", "monkey", "bird", "fish", "snake", "rabbit",
  "horse", "cow", "sheep", "chicken", "duck", "wolf", "fox", "bear", "whale", "dolphin",
  
  // 科技与现代 (Technology)
  "computer", "internet", "software", "hardware", "robot", "phone", "camera", "battery", "code", "data",
  "algorithm", "screen", "keyboard", "mouse", "network", "server", "email", "website", "app", "pixel",
  
  // 情感与抽象 (Emotions & Abstract)
  "love", "hate", "happiness", "sadness", "anger", "fear", "hope", "dream", "memory", "thought",
  "idea", "knowledge", "wisdom", "truth", "lie", "peace", "war", "freedom", "justice", "power",
  
  // 食物与生活 (Food & Life)
  "apple", "banana", "bread", "water", "milk", "coffee", "tea", "rice", "meat", "fruit",
  "vegetable", "sugar", "salt", "book", "pen", "paper", "desk", "chair", "house", "home"
];

/**
 * @description 批量生成测试数据
 * @param onProgress 进度回调 (current, total, currentWord)
 */
export async function seedDatabase(onProgress?: (current: number, total: number, word: string) => void) {
    console.log('Starting seed process...');
    const service = EmbeddingService.getInstance();
    
    // 预热模型
    await service.init();
    
    const total = WORD_LIST.length;
    let current = 0;

    for (const word of WORD_LIST) {
        current++;
        if (onProgress) onProgress(current, total, word);

        try {
            // 1. 添加到生词本
            await addToVocabularyDeck(word);
            
            // 2. 生成嵌入并更新连接
            // 注意：这里是串行执行以避免浏览器卡顿，因为 transformers.js 是计算密集型的
            await service.updateConnections(word);
            
            console.log(`[Seed] Processed ${current}/${total}: ${word}`);
        } catch (error) {
            console.error(`[Seed] Failed to process ${word}:`, error);
        }
    }
    
    console.log('Seed process completed.');
}

/**
 * @description 从本地 JSON 文件 (NDJSON) 导入数据
 */
export async function seedFromLocalJSON(onProgress?: (current: number, total: number, word: string) => void) {
    try {
        const response = await fetch('/Level8luan_2.json');
        if (!response.ok) throw new Error('Failed to fetch JSON file');
        
        const text = await response.text();
        const lines = text.split('\n').filter(line => line.trim());
        const total = Math.min(lines.length, 100); // Limit to 100 for testing as requested
        
        const service = EmbeddingService.getInstance();
        await service.init();

        let current = 0;
        
        // Randomly select 100 words if total > 100
        const selectedLines = lines.sort(() => 0.5 - Math.random()).slice(0, 100);

        for (const line of selectedLines) {
            try {
                const data = JSON.parse(line);
                const word = data.headWord;
                const content = data.content?.word?.content;
                
                if (!word) continue;

                current++;
                if (onProgress) onProgress(current, total, word);

                // Construct rich card data
                const meaning = content?.trans?.map((t: any) => `${t.pos}. ${t.tranCn}`).join('; ') || '暂无释义';
                const example = content?.sentence?.sentences?.[0]?.sContent || '';
                const exampleTranslate = content?.sentence?.sentences?.[0]?.sCn || '';
                const phonetic = content?.usphone || content?.ukphone || '';

                // Add to DB with rich data
                // We need to modify addToVocabularyDeck or call db directly
                // For now, let's reuse addToVocabularyDeck but we need to update it to accept more fields or update after adding
                
                // Since addToVocabularyDeck is simple, we'll do it manually here to ensure rich data
                const { getDB } = await import('./db');
                const { createNewWordCard } = await import('./fsrs');
                const db = await getDB();
                
                // Check exist
                const existing = await db.getAllFromIndex('cards', 'deckId', 'vocabulary-book');
                if (!existing.some(c => c.word.toLowerCase() === word.toLowerCase())) {
                     const newCard = createNewWordCard(word, meaning, "unknown", 'vocabulary-book');
                     newCard.phonetic = phonetic;
                     newCard.example = example;
                     newCard.exampleTranslate = exampleTranslate;
                     
                     await db.put('cards', newCard);
                }

                // Embeddings
                await service.updateConnections(word);
                
            } catch (e) {
                console.error('Error parsing line:', e);
            }
        }
        
    } catch (error) {
        console.error('Seed from JSON failed:', error);
        // Fallback to default list
        await seedDatabase(onProgress);
    }
}
