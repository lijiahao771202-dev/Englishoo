import { createDeck, saveCard, saveSemanticConnections } from './data-source';
import { createNewWordCard } from './fsrs';

/**
 * @description 专八词汇数据结构
 */
interface Tem8Word {
  wordRank?: number;
  headWord: string;
  content: {
    word: {
      content: {
        trans: Array<{ pos: string; tranCn: string }>;
        sentence?: {
          sentences: Array<{ sContent: string; sCn: string }>;
        };
        syno?: {
          synos: Array<{ pos: string; tran: string; hwds: Array<{ w: string }> }>;
          desc: string;
        };
        relWord?: {
          rels: Array<{ pos: string; words: Array<{ hwd: string; tran: string }> }>;
          desc: string;
        };
      };
    };
  };
}

/**
 * @description 批量导入专八词汇 (TEM-8)
 * 采用分批处理避免阻塞主线程
 */
export async function importTem8Deck(onProgress?: (count: number, total: number) => void) {
  try {
    console.log('Starting import...');
    const response = await fetch('/Level8luan_2.json');
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.statusText}`);
    }
    const text = await response.text();
    const lines = text.split('\n').filter(line => line.trim());
    const total = lines.length;
    console.log(`Found ${total} lines to import.`);

    const deckId = 'official-deck-tem8-pro'; // FIXED ID to prevent duplicates

    // Check if deck exists or just upsert it (createDeck uses put)
    const deck = {
      id: deckId,
      name: '专八的卡包',
      description: '专业八级核心词汇 (共 ' + total + ' 词)',
      theme: 'purple', // 使用紫色主题
      createdAt: new Date()
    };

    await createDeck(deck);

    let count = 0;
    const batchSize = 50; // 每批处理 50 个单词

    // Process in batches
    for (let i = 0; i < lines.length; i += batchSize) {
      const batchLines = lines.slice(i, i + batchSize);

      const promises = batchLines.map(async (line) => {
        try {
          const data: Tem8Word = JSON.parse(line);
          const word = data.headWord;

          const trans = data.content.word.content.trans || [];
          // Format meaning: "v. 解释"
          const meaning = trans.map(t => `${t.pos}. ${t.tranCn}`).join('\n');
          const partOfSpeech = trans[0]?.pos || 'unknown';

          const sentences = data.content.word.content.sentence?.sentences;
          const example = sentences?.[0]?.sContent;
          const exampleMeaning = sentences?.[0]?.sCn;

          // Generate deterministic ID for the card
          // card-{deckId}-{word}
          const cardId = `card-tem8-${word.toLowerCase().trim().replace(/[^a-z0-9]/g, '-')}`;

          const card = createNewWordCard(
            word,
            meaning,
            partOfSpeech,
            deckId,
            example,
            undefined, // mnemonic
            undefined, // associations
            cardId     // customId
          );

          if (exampleMeaning) {
            card.exampleMeaning = exampleMeaning;
          }

          // Add Rank
          if (data.wordRank) {
            card.rank = data.wordRank;
          }

          // Extract and save semantic connections (explicit knowledge)
          const connections: Array<{ target: string; similarity: number }> = [];

          // 1. Synonyms (High similarity: 0.9)
          if (data.content.word.content.syno?.synos) {
            data.content.word.content.syno.synos.forEach(s => {
              if (s.hwds) {
                s.hwds.forEach(h => {
                  if (h.w && h.w !== word) {
                    connections.push({ target: h.w.toLowerCase(), similarity: 0.9 });
                  }
                });
              }
            });
          }

          // 2. Related Words (Medium-High similarity: 0.8)
          if (data.content.word.content.relWord?.rels) {
            data.content.word.content.relWord.rels.forEach(r => {
              if (r.words) {
                r.words.forEach(w => {
                  if (w.hwd && w.hwd !== word) {
                    connections.push({ target: w.hwd.toLowerCase(), similarity: 0.8 });
                  }
                });
              }
            });
          }

          if (connections.length > 0) {
            // Remove duplicates, keep highest similarity
            const uniqueConnections = new Map<string, number>();
            connections.forEach(c => {
              const current = uniqueConnections.get(c.target);
              if (!current || c.similarity > current) {
                uniqueConnections.set(c.target, c.similarity);
              }
            });

            const finalConnections = Array.from(uniqueConnections.entries())
              .map(([target, similarity]) => ({ target, similarity }))
              .sort((a, b) => b.similarity - a.similarity);

            // Save to semantic_connections store (via data-source for cloud sync)
            await saveSemanticConnections({
              source: word.toLowerCase(),
              connections: finalConnections
            });
          }

          await saveCard(card);
          return true;
        } catch (e) {
          console.warn('Error parsing/saving line:', e);
          return false;
        }
      });

      // Wait for current batch
      const results = await Promise.all(promises);
      count += results.filter(Boolean).length;

      // Report progress
      if (onProgress) {
        onProgress(count, total);
      }

      // Yield to main thread to keep UI responsive
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    console.log(`Successfully imported ${count} cards.`);
    return { count, deckId };
  } catch (e) {
    console.error('Import failed:', e);
    throw e;
  }
}
