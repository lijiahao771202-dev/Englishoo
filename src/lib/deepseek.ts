import axios from 'axios';

// Use local proxy to avoid CORS issues
const API_URL = '/api/deepseek/chat/completions';

/**
 * @description Helper to clean JSON string from Markdown code blocks
 */
function cleanJson(text: string): string {
  return text.replace(/```json\n?|\n?```/g, '').trim();
}

export interface EnrichedData {
  meaning: string;
  partOfSpeech: string;
  example: string;
  exampleMeaning: string;
  mnemonic: string;
  associations: string[];
  mindMap?: {
    root: {
      label: string;
      meaning?: string;
      children: Array<{
        label: string;
        children: Array<{
          label: string;
          meaning: string;
        }>
      }>
    }
  };
  syllables: string;
  phrases: Array<{ phrase: string; meaning: string }>;
  derivatives: Array<{ word: string; meaning: string; partOfSpeech: string }>;
  roots: Array<{ root: string; meaning: string; description: string; cognates?: string[] }>;
}

export interface ScenarioMindMap {
  title: string;
  rootId: string;
  nodes: Array<{
    id: string;
    label: string;
    meaning: string;
    type: 'root' | 'category' | 'word' | 'phrase';
    val: number;
    desc?: string; // Example sentence or usage note
  }>;
  links: Array<{
    source: string;
    target: string;
  }>;
  steps: string[]; // Guided learning path (node IDs)
}

/**
 * @description 调用 DeepSeek API 丰富单词信息 (包含自动生成释义)
 */
export interface ShadowingStory {
  title: string;
  sentences: Array<{
    text: string;
    phonetics: string;
    translation: string;
  }>;
}

/**
 * @description 生成影子跟读故事 (包含音标)
 */
export async function generateShadowingStory(
  mode: 'scenario' | 'learned',
  input: string | string[],
  apiKey: string
): Promise<ShadowingStory> {
  if (!apiKey) throw new Error('API Key is missing');

  const isScenario = mode === 'scenario';
  const context = isScenario
    ? `Based on the scenario: "${input}"`
    : `Using the following vocabulary words: ${(input as string[]).join(', ')}`;

  const prompt = `
      You are an expert English teacher creating a shadowing practice story.
      ${context}
      
      Please create a short, engaging story (5-8 sentences) suitable for intermediate learners.
      For each sentence, provide:
      1. The English text.
      2. The IPA phonetics (International Phonetic Alphabet) for the whole sentence.
      3. The Chinese translation.

      Return strictly in JSON format:
      {
        "title": "Story Title",
        "sentences": [
          { "text": "Sentence one.", "phonetics": "/ˈsɛntəns wʌn/", "translation": "句子一。" },
          ...
        ]
      }
    `;

  try {
    const response = await axios.post(API_URL, {
      model: "deepseek-chat",
      messages: [
        { role: "system", content: "You are a helpful assistant that outputs JSON." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    }, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` } });

    const content = cleanJson(response.data.choices[0].message.content);
    return JSON.parse(content);
  } catch (error) {
    console.error('DeepSeek API Error:', error);
    throw error;
  }
}

export async function enrichWord(word: string, apiKey: string): Promise<EnrichedData> {
  if (!apiKey) {
    throw new Error('API Key is missing');
  }

  const prompt = `
    You are an English vocabulary expert for Chinese learners.
    Please provide the following for the word "${word}":
    1. **Meaning**: The Chinese meaning of the word. List ALL valid parts of speech and their corresponding meanings in the format "pos. meaning" (e.g., "n. apple v. to eat apple").
    2. **Part of Speech**: The primary part of speech.
    3. **Example**: A clear, simple example sentence.
    4. **Example Translation**: Chinese translation of the example.
    5. **Mnemonic**: Provide 3 distinct and high-quality Chinese mnemonic methods.
       - Method 1: Etymology/Root & Affix.
       - Methods 2 & 3: Homophony, Association, Splitting, or Contrast.
       - Format: "1. 【词根词缀】...\\n2. 【...】..."
    6. **Associations**: 3-5 associated words.
    7. **Syllables**: Split the word by roots/affixes if possible, otherwise by syllables. Use middle dot '·' as separator (e.g., "con·struc·tion").
    8. **Phrases**: 3-5 common collocations/phrases.
    9. **Derivatives**: 3-5 word family members (word, meaning, pos).
    10. **Roots**: List the roots/affixes used (root, meaning, description).

    Return strictly in JSON format:
    {
      "meaning": "n. ...",
      "partOfSpeech": "noun",
      "example": "...",
      "exampleMeaning": "...",
      "mnemonic": "...",
      "associations": ["..."],
      "syllables": "con·struc·tion",
      "phrases": [{ "phrase": "...", "meaning": "..." }],
      "derivatives": [{ "word": "...", "meaning": "...", "partOfSpeech": "..." }],
      "roots": [{ "root": "...", "meaning": "...", "description": "..." }]
    }
  `;

  try {
    const response = await axios.post(
      API_URL,
      {
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are a helpful assistant that outputs JSON." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );

    const content = cleanJson(response.data.choices[0].message.content);
    return JSON.parse(content);
  } catch (error) {
    console.error('DeepSeek API Error:', error);
    throw error;
  }
}

/**
 * @description 翻译内容
 */
export async function translateContent(content: string, context: string, apiKey: string): Promise<string> {
  if (!apiKey) throw new Error('API Key is missing');

  const prompt = `
    Translate the following English text to Chinese.
    Context: ${context}
    Text: "${content}"
    Return strictly in JSON format:
    {
      "translation": "translated text"
    }
  `;

  try {
    const response = await axios.post(API_URL, {
      model: "deepseek-chat",
      messages: [{ role: "system", content: "You are a helpful assistant that outputs JSON." }, { role: "user", content: prompt }],
      response_format: { type: "json_object" }
    }, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` } });
    const content = cleanJson(response.data.choices[0].message.content);
    return JSON.parse(content).translation;
  } catch (error) {
    console.error('DeepSeek API Error:', error);
    throw error;
  }
}

/**
 * @description 快速获取单词基本信息 (仅释义和词性) - 用于提高响应速度
 */
export async function fetchBasicInfo(word: string, apiKey: string): Promise<{ meaning: string; partOfSpeech: string }> {
  if (!apiKey) {
    throw new Error('API Key is missing');
  }

  const prompt = `
    Provide the Chinese meaning and part of speech for the word "${word}".
    Follow these rules:
    1. Meaning: List ALL valid parts of speech and their corresponding meanings in the format "pos. meaning" (e.g., "n. apple v. to eat apple").
    2. Part of Speech: Specify the primary part of speech (e.g., "noun", "verb", "adjective").
    
    Return strictly in JSON format with no extra content:
    {
      "meaning": "string",
      "partOfSpeech": "string"
    }
  `;

  try {
    const response = await axios.post(
      API_URL,
      {
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are a helpful assistant that outputs JSON only." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );

    const content = cleanJson(response.data.choices[0].message.content);
    return JSON.parse(content);
  } catch (error) {
    console.error('DeepSeek API Error:', error);
    throw error;
  }
}

/**
 * @description 仅生成带有 Emoji 的释义（用于重新生成/优化）
 */
export async function generateMeaning(word: string, apiKey: string): Promise<{ meaning: string; partOfSpeech: string }> {
  if (!apiKey) throw new Error('API Key is missing');

  const prompt = `
    Provide the Chinese meaning and part of speech for the word "${word}".
    
    **CRITICAL REQUIREMENT**:
    1. To help with visual memory, you **MUST** add a relevant Emoji to the beginning or end of each meaning.
    2. **Use newlines** (\\n) to separate different parts of speech.
    
    Format: "pos. Emoji meaning\\npos. meaning Emoji"
    
    Examples:
    - "n. 🍎 苹果\\nv. 🏃 奔跑"
    - "adj. 😊 快乐的"

    1. Meaning: List ALL valid parts of speech and their corresponding meanings with Emojis, separated by newlines.
    2. Part of Speech: Specify the primary part of speech.
    
    Return strictly in JSON format:
    {
      "meaning": "string",
      "partOfSpeech": "string"
    }
  `;

  try {
    const response = await axios.post(
      API_URL,
      {
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are a helpful assistant that outputs JSON." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );

    const content = cleanJson(response.data.choices[0].message.content);
    return JSON.parse(content);
  } catch (error) {
    console.error('DeepSeek API Error:', error);
    throw error;
  }
}

/**
 * @description 仅生成单词对之间的关系标签（轻量级，不生成例句）
 */
export async function generateEdgeLabelsOnly(
  pairs: { source: string; target: string }[],
  apiKey: string
): Promise<Array<{ source: string; target: string; label: string }>> {
  if (!pairs.length) return [];

  // Limit batch size to avoid huge prompts
  if (pairs.length > 100) { // Can handle more since response is smaller
    const chunk1 = pairs.slice(0, 100);
    const chunk2 = pairs.slice(100);
    const res1 = await generateEdgeLabelsOnly(chunk1, apiKey);
    const res2 = await generateEdgeLabelsOnly(chunk2, apiKey);
    return [...res1, ...res2];
  }

  const prompt = `
    Analyze the semantic relationship between the following word pairs.
    For each pair, provide ONLY a precise relationship label in CHINESE.
    
    Allowed Relationship Types:
    - "同义" (Synonym)
    - "反义" (Antonym)
    - "近义" (Near Synonym)
    - "包含" (Hyponym/Hypernym)
    - "组成" (Part-whole)
    - "搭配" (Collocation)
    - "形似" (Look-alike)
    - "因果" (Cause-effect)
    - "派生" (Derivative)
    - "场景" (Scenario context)
    
    Constraints:
    1. AVOID using "相关" (Related) if a more specific relationship exists.
    2. Keep labels concise (under 6 Chinese characters).
    3. If the words are completely unrelated, use "关联".
    
    Pairs:
    ${pairs.map((p, i) => `${i + 1}. ${p.source} - ${p.target}`).join('\n')}
    
    Return a JSON object with an "items" array containing ONLY the "label" string.
    Example: { "items": [{ "label": "同义" }, { "label": "反义" }] }
  `;

  try {
    const response = await axios.post(
      API_URL,
      {
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are a helpful assistant that outputs JSON." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );

    const content = cleanJson(response.data.choices[0].message.content);
    const result = JSON.parse(content);
    const items = result.items || [];

    return pairs.map((p, i) => ({
      source: p.source,
      target: p.target,
      label: items[i]?.label || '相关'
    }));
  } catch (error) {
    console.error('DeepSeek Edge Label Only Error:', error);
    return pairs.map(p => ({ ...p, label: '相关' }));
  }
}

/**
 * @description 生成单词对之间的关系标签及例句
 */
export async function generateEdgeLabels(
  pairs: { source: string; target: string }[],
  apiKey: string
): Promise<Array<{ source: string; target: string; label: string; example?: string; example_cn?: string }>> {
  if (!pairs.length) return [];

  // Limit batch size to avoid huge prompts
  if (pairs.length > 50) {
    const chunk1 = pairs.slice(0, 50);
    const chunk2 = pairs.slice(50);
    const res1 = await generateEdgeLabels(chunk1, apiKey);
    const res2 = await generateEdgeLabels(chunk2, apiKey);
    return [...res1, ...res2];
  }

  const prompt = `
    Analyze the semantic relationship between the following word pairs.
    For each pair, provide:
    1. A precise relationship label in CHINESE.
    2. A short example sentence (English) containing BOTH words to illustrate their connection.
    3. A Chinese translation of the example sentence.
    
    Allowed Relationship Types (examples):
    - "同义" (Synonym)
    - "反义" (Antonym)
    - "近义" (Near Synonym)
    - "包含" (Hyponym/Hypernym)
    - "组成" (Part-whole)
    - "搭配" (Collocation)
    - "形似" (Look-alike)
    - "因果" (Cause-effect)
    - "派生" (Derivative)
    - "场景" (Scenario context)
    
    Constraints:
    1. AVOID using "相关" (Related) if a more specific relationship exists.
    2. Keep labels concise (under 6 Chinese characters).
    3. If the words are completely unrelated, use "关联".
    4. **Highlight both words** in the example sentence using <b> tags.
    
    Pairs:
    ${pairs.map((p, i) => `${i + 1}. ${p.source} - ${p.target}`).join('\n')}
    
    Return a JSON object with an "items" array containing objects with "label", "example", and "example_cn".
    Example: { "items": [{ "label": "同义", "example": "The <b>start</b> was good, but the <b>begin</b>ning was better.", "example_cn": "开始很好，但开端更好。" }] }
  `;

  try {
    const response = await axios.post(
      API_URL,
      {
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are a helpful assistant that outputs JSON." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );

    const content = cleanJson(response.data.choices[0].message.content);
    const result = JSON.parse(content);
    const items = result.items || [];

    return pairs.map((p, i) => ({
      source: p.source,
      target: p.target,
      label: items[i]?.label || '相关',
      example: items[i]?.example || '',
      example_cn: items[i]?.example_cn || ''
    }));
  } catch (error) {
    console.error('DeepSeek Edge Label Error:', error);
    // Fallback to generic label on error
    return pairs.map(p => ({ ...p, label: '相关' }));
  }
}

export interface RelatedWord {
  word: string;
  meaning: string;
  relation: string;
}

/**
 * @description 生成单词的强关联词 (5-6个)，用于复习模式的知识地图
 */
export async function generateRelatedWords(word: string, apiKey: string): Promise<RelatedWord[]> {
  if (!apiKey) throw new Error('API Key is missing');

  const prompt = `
    Generate 5-6 English words strongly related to "${word}".
    
    For each word, provide:
    1. The word itself.
    2. A concise Chinese meaning (max 10 chars).
    3. The relationship type (e.g., Synonym, Antonym, Collocation, Context, Look-alike, Part-of-speech derivative).
    
    Constraints:
    - The words should be suitable for English learners.
    - Do not include the target word itself.
    - Ensure diversity in relationships if possible (not just all synonyms).
    
    Return strictly in JSON format:
    {
      "items": [
        { "word": "...", "meaning": "...", "relation": "..." },
        ...
      ]
    }
  `;

  try {
    const response = await axios.post(
      API_URL,
      {
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are a helpful assistant that outputs JSON." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );

    const content = cleanJson(response.data.choices[0].message.content);
    const result = JSON.parse(content);
    return result.items || [];
  } catch (error) {
    console.error('DeepSeek Related Words Error:', error);
    return [];
  }
}

/**
 * @description 仅生成例句
 */
export async function generateExample(word: string, apiKey: string): Promise<{ example: string; exampleMeaning: string }> {
  if (!apiKey) throw new Error('API Key is missing');

  const prompt = `Please provide a clear, simple example sentence for the English word "${word}" and its Chinese translation. Return strictly in JSON format: { "example": "...", "exampleMeaning": "..." }`;

  try {
    const response = await axios.post(API_URL, {
      model: "deepseek-chat",
      messages: [{ role: "system", content: "You are a helpful assistant that outputs JSON." }, { role: "user", content: prompt }],
      response_format: { type: "json_object" }
    }, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` } });
    const content = cleanJson(response.data.choices[0].message.content);
    const data = JSON.parse(content);
    return { example: data.example, exampleMeaning: data.exampleMeaning };
  } catch (error) {
    console.error('DeepSeek API Error:', error);
    throw error;
  }
}

/**
 * @description 生成情境桥接例句 (Contextual Bridging)
 * 生成包含两个关联词的联合例句
 */
export async function generateBridgingExample(
  word: string,
  relatedWord: string,
  relationType: string, // e.g. "synonym", "antonym", "related"
  apiKey: string
): Promise<{ example: string; exampleMeaning: string }> {
  if (!apiKey) throw new Error('API Key is missing');

  const prompt = `
      Create a "Contextual Bridging Sentence" that naturally contains BOTH of the following words:
      1. Target Word: "${word}"
      2. Related Word: "${relatedWord}"
      
      Relationship Context: The words are related as: ${relationType}.
      
      Requirements:
      1. The sentence should clearly demonstrate the relationship (contrast, similarity, cause-effect, etc.).
      2. Highlight both words in the sentence using <span style="color: #fde047; font-weight: bold;">...</span> tags.
      3. Provide a natural Chinese translation.
      
      Example for "Ambiguous" (target) and "Clear" (antonym):
      "His answer was <span style="color: #fde047; font-weight: bold;">ambiguous</span>, not <span style="color: #fde047; font-weight: bold;">clear</span> at all."
      
      Return strictly in JSON format:
      {
        "example": "Sentence with tags...",
        "exampleMeaning": "Chinese translation..."
      }
    `;

  try {
    const response = await axios.post(API_URL, {
      model: "deepseek-chat",
      messages: [{ role: "system", content: "You are a helpful assistant that outputs JSON." }, { role: "user", content: prompt }],
      response_format: { type: "json_object" }
    }, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` } });

    const content = cleanJson(response.data.choices[0].message.content);
    const data = JSON.parse(content);
    return { example: data.example, exampleMeaning: data.exampleMeaning };
  } catch (error) {
    console.error('DeepSeek API Error:', error);
    throw error;
  }
}

/**
 * @description 仅生成助记
 */
export async function generateMnemonic(word: string, apiKey: string): Promise<string> {
  if (!apiKey) throw new Error('API Key is missing');

  const prompt = `
      Please provide 3 distinct and high-quality Chinese mnemonic methods (记忆法) to help remember the English word "${word}".
      
      Requirements:
      1. **Method 1 (Mandatory): Etymology/Root & Affix (词根词缀法)**
         - Must be the first method.
         - Break down the word (prefix + root + suffix).
         - Explain the meaning of the root and how it relates to the word.
         - If the word is simple/has no roots, explain its Etymology (Origin).
         
      2. **Methods 2 & 3 (Adaptive Selection)**
         - Select the **2 most effective** alternative methods from:
           - **Homophony (谐音法)**: Use ONLY if the sound link is natural and funny.
           - **Splitting/Dismantling (拆解法)**: Use if the word splits into known simple words.
           - **Association/Story (联想法/故事法)**: Best for abstract words.
           - **Contrast (对比法)**: For confusing lookalikes.
         - **Selection Rule**: Choose the methods that fit THIS specific word best. Do not force a method if it doesn't make sense.

      3. **High Quality & Guidance**:
         - The mnemonics should be "Guiding" (引导性) and "Intuitive" (直观). 
         - Avoid "Forced" (牵强) associations.
         - Use Emojis to make it visual.
         - Wrap key parts (roots, meanings, homophones) in **double asterisks**.
      
      Return strictly in JSON format:
      {
        "mnemonics": [
          { "title": "【词根词缀】", "content": "Content..." },
          { "title": "【Method Name】", "content": "Content..." },
          { "title": "【Method Name】", "content": "Content..." }
        ]
      }
    `;

  try {
    const response = await axios.post(API_URL, {
      model: "deepseek-chat",
      messages: [{ role: "system", content: "You are a helpful assistant that outputs JSON." }, { role: "user", content: prompt }],
      response_format: { type: "json_object" }
    }, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` } });

    const content = cleanJson(response.data.choices[0].message.content);
    const data = JSON.parse(content);
    // Ensure we return a stringified JSON array for compatibility, but structured
    return JSON.stringify(data.mnemonics || []);
  } catch (error) {
    console.error('DeepSeek API Error:', error);
    throw error;
  }
}

/**
 * @description 生成思维导图
 */
export async function generateMindMap(word: string, apiKey: string): Promise<EnrichedData['mindMap']> {
  if (!apiKey) throw new Error('API Key is missing');

  const prompt = `
    Generate a Mind Map data structure for the English word "${word}".
    
    The structure should be hierarchical:
    1. **Root**: The word itself.
    2. **Branches (Categories)**: 4-6 meaningful categories related to the word.
       **CRITICAL**: You MUST provide the Chinese translation for each category in the "meaning" field.
       Examples of categories:
       - "Synonyms" (meaning: "同义词")
       - "Antonyms" (meaning: "反义词")
       - "Collocations" (meaning: "常见搭配")
       - "Derivatives" (meaning: "派生词")
       - "Usage Scenarios" (meaning: "使用场景")
       - "Confusion" (meaning: "易混词")
    3. **Leaves (Items)**: Under each category, list 2-4 specific words or short phrases with their Chinese meanings.
    
    Return strictly in JSON format:
    {
      "mindMap": {
        "root": {
          "label": "${word}",
          "meaning": "Chinese Meaning",
          "children": [
            {
              "label": "Synonyms",
              "meaning": "同义词",
              "children": [
                { "label": "happy", "meaning": "快乐的" },
                { "label": "joyful", "meaning": "喜悦的" }
              ]
            },
            {
              "label": "Collocations",
              "meaning": "常见搭配",
              "children": [
                { "label": "take action", "meaning": "采取行动" }
              ]
            }
          ]
        }
      }
    }
  `;

  try {
    const response = await axios.post(API_URL, {
      model: "deepseek-chat",
      messages: [{ role: "system", content: "You are a helpful assistant that outputs JSON." }, { role: "user", content: prompt }],
      response_format: { type: "json_object" }
    }, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` } });
    const content = cleanJson(response.data.choices[0].message.content);
    return JSON.parse(content).mindMap;
  } catch (error) {
    console.error('DeepSeek API Error:', error);
    throw error;
  }
}

/**
 * @description 生成阅读练习文章 (Scheme B: Story/News, ~300 words)
 */
export async function generateReadingMaterial(words: string[], apiKey: string): Promise<{ title: string; content: string; translation: string }> {
  if (!apiKey) throw new Error('API Key is missing');

  const prompt = `
      Please write a creative short story or a customized news report (approx. 250-300 words) that naturally incorporates the following English words: ${words.join(', ')}.
      
      Requirements:
      1. **Genre**: Mix of engaging fiction or interesting news style.
      2. **Length**: Around 300 words.
      3. **Key Feature**: Highlight the provided words using <b> tags (e.g., <b>word</b>).
      4. **Context**: Ensure the context clarifies the meaning of the words.
      5. **Output**:
         - Title
         - HTML Content (with <b> tags)
         - Full Chinese Translation
      
      Return strictly in JSON format:
      {
        "title": "Title",
        "content": "Content with <b>tags</b>...",
        "translation": "Chinese translation..."
      }
    `;

  try {
    const response = await axios.post(API_URL, {
      model: "deepseek-chat",
      messages: [{ role: "system", content: "You are a helpful assistant that outputs JSON." }, { role: "user", content: prompt }],
      response_format: { type: "json_object" }
    }, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` } });
    const content = cleanJson(response.data.choices[0].message.content);
    return JSON.parse(content);
  } catch (error) {
    console.error('DeepSeek API Error:', error);
    throw error;
  }
}

/**
 * @description 获取单词在特定上下文中的释义 (Contextual Definition)
 */
export async function getDefinitionInContext(word: string, context: string, apiKey: string): Promise<string> {
  if (!apiKey) throw new Error('API Key is missing');

  const prompt = `
      Explain the meaning of the word "${word}" based strictly on the following context.
      Context: "...${context}..."
      
      Output Constraint:
      - Return ONLY the precise Chinese definition fitting this specific context.
      - Do NOT list all dictionary definitions.
      - If it's a metaphor, explain the metaphorical meaning.
      - Keep it under 20 characters.
      
      Return strictly in JSON format:
      {
        "definition": "chinese definition"
      }
    `;

  try {
    const response = await axios.post(API_URL, {
      model: "deepseek-chat",
      messages: [{ role: "system", content: "You are a helpful assistant that outputs JSON." }, { role: "user", content: prompt }],
      response_format: { type: "json_object" }
    }, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` } });

    const content = cleanJson(response.data.choices[0].message.content);
    return JSON.parse(content).definition;
  } catch (error) {
    console.error('DeepSeek Context Def Error:', error);
    return "";
  }
}

/**
 * @description 仅生成词组搭配
 */
export async function generatePhrases(word: string, apiKey: string): Promise<EnrichedData['phrases']> {
  if (!apiKey) throw new Error('API Key is missing');

  const prompt = `
    Please provide 3-5 common collocations/phrases for the English word "${word}" with Chinese meanings.
    Return strictly in JSON format:
    {
      "phrases": [
        { "phrase": "phrase 1", "meaning": "meaning 1" },
        { "phrase": "phrase 2", "meaning": "meaning 2" }
      ]
    }
  `;

  try {
    const response = await axios.post(API_URL, {
      model: "deepseek-chat",
      messages: [{ role: "system", content: "You are a helpful assistant that outputs JSON." }, { role: "user", content: prompt }],
      response_format: { type: "json_object" }
    }, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` } });
    const content = cleanJson(response.data.choices[0].message.content);
    return JSON.parse(content).phrases;
  } catch (error) {
    console.error('DeepSeek API Error:', error);
    throw error;
  }
}

/**
 * @description 仅生成派生词
 */
export async function generateDerivatives(word: string, apiKey: string): Promise<EnrichedData['derivatives']> {
  if (!apiKey) throw new Error('API Key is missing');

  const prompt = `
    Please provide 3-5 word family members (derivatives) for the English word "${word}" with Chinese meanings and parts of speech.
    Return strictly in JSON format:
    {
      "derivatives": [
        { "word": "derivative 1", "meaning": "meaning 1", "partOfSpeech": "pos 1" },
        { "word": "derivative 2", "meaning": "meaning 2", "partOfSpeech": "pos 2" }
      ]
    }
  `;

  try {
    const response = await axios.post(API_URL, {
      model: "deepseek-chat",
      messages: [{ role: "system", content: "You are a helpful assistant that outputs JSON." }, { role: "user", content: prompt }],
      response_format: { type: "json_object" }
    }, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` } });
    const content = cleanJson(response.data.choices[0].message.content);
    return JSON.parse(content).derivatives;
  } catch (error) {
    console.error('DeepSeek API Error:', error);
    throw error;
  }
}

/**
 * @description 仅生成词根词源
 */
export async function generateRoots(word: string, apiKey: string): Promise<EnrichedData['roots']> {
  if (!apiKey) throw new Error('API Key is missing');

  const prompt = `
    Please analyze the roots/affixes for the English word "${word}".
    Provide the meaning and description in Simplified Chinese.
    **CRITICAL**: Also list 3-5 common "cognates" (同根词) for each root to help expand vocabulary.

    Return strictly in JSON format:
    {
      "roots": [
        { 
          "root": "root 1", 
          "meaning": "meaning 1 (Chinese)", 
          "description": "description 1 (Chinese)",
          "cognates": ["word1", "word2", "word3"]
        }
      ]
    }
  `;

  try {
    const response = await axios.post(API_URL, {
      model: "deepseek-chat",
      messages: [{ role: "system", content: "You are a helpful assistant that outputs JSON." }, { role: "user", content: prompt }],
      response_format: { type: "json_object" }
    }, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` } });
    const content = cleanJson(response.data.choices[0].message.content);
    return JSON.parse(content).roots || [];
  } catch (error) {
    console.error('DeepSeek API Error:', error);
    throw error;
  }
}

/**
 * @description 仅生成音节拆分 (基于词根词缀)
 */
export async function generateSyllables(word: string, apiKey: string): Promise<string> {
  if (!apiKey) throw new Error('API Key is missing');

  const prompt = `
    Split the English word "${word}" by roots/affixes if possible, otherwise by syllables. 
    Use middle dot '·' as separator (e.g., "con·struc·tion").
    Return strictly in JSON format:
    {
      "syllables": "con·struc·tion"
    }
  `;

  try {
    const response = await axios.post(API_URL, {
      model: "deepseek-chat",
      messages: [{ role: "system", content: "You are a helpful assistant that outputs JSON." }, { role: "user", content: prompt }],
      response_format: { type: "json_object" }
    }, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` } });
    return JSON.parse(response.data.choices[0].message.content).syllables;
  } catch (error) {
    console.error('DeepSeek API Error:', error);
    throw error;
  }
}

/**
 * @description 生成场景化思维导图 (Guided Learning)
 */
export async function generateScenarioMindMap(topic: string, apiKey: string): Promise<ScenarioMindMap> {
  if (!apiKey) throw new Error('API Key is missing');

  const prompt = `
    Generate a "Scenario-Based Mind Map" for English learning based on the topic: "${topic}".
    
    The goal is to guide a learner through a specific scenario (e.g., "At the Airport", "Business Negotiation", "Ordering Coffee") step-by-step.
    
    Requirements:
    1. **Structure**:
       - **Root**: The scenario title (e.g., "Airport Check-in").
       - **Categories**: Key phases or aspects of the scenario (e.g., "Check-in Counter", "Security Check", "Boarding").
       - **Nodes**: Specific words or phrases useful in that phase.
    2. **Content**:
       - Each node must have a clear Chinese meaning.
       - 'word' or 'phrase' nodes should have a short example sentence or usage note in 'desc'.
    3. **Guided Path (Steps)**:
       - Define a logical learning order in the 'steps' array (list of node IDs).
       - Start from Root -> Category 1 -> Words in Cat 1 -> Category 2 -> ...
    
    Return strictly in JSON format matching this interface:
    {
      "title": "Scenario Title",
      "rootId": "root",
      "nodes": [
        { "id": "root", "label": "Airport", "meaning": "机场场景", "type": "root", "val": 20 },
        { "id": "cat1", "label": "Check-in", "meaning": "值机", "type": "category", "val": 10 },
        { "id": "word1", "label": "Boarding Pass", "meaning": "登机牌", "type": "word", "val": 5, "desc": "Show your boarding pass." }
      ],
      "links": [
        { "source": "root", "target": "cat1" },
        { "source": "cat1", "target": "word1" }
      ],
      "steps": ["root", "cat1", "word1"]
    }
  `;

  try {
    const response = await axios.post(API_URL, {
      model: "deepseek-chat",
      messages: [{ role: "system", content: "You are a helpful assistant that outputs JSON." }, { role: "user", content: prompt }],
      response_format: { type: "json_object" }
    }, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` } });
    return JSON.parse(response.data.choices[0].message.content);
  } catch (error) {
    console.error('DeepSeek API Error:', error);
    throw error;
  }
}

/**
 * @description 为单词分组生成智能一句话摘要
 */
export async function generateClusterSummary(words: string[], apiKey: string): Promise<string> {
  if (!apiKey) throw new Error('API Key is missing');

  const prompt = `
    Analyze the following list of English words and identify their common semantic theme or usage scenario.
    Words: ${words.join(', ')}

    Please provide a **single, concise sentence** in Chinese that summarizes this group.
    
    Requirements:
    1. The summary must be in Chinese.
    2. Focus on the *shared meaning*, *context*, or *topic* (e.g., "法律诉讼场景", "情绪表达", "建筑工程术语").
    3. Format: "本组主要包含关于[主题]的词汇" or similar natural phrasing.
    4. Keep it under 20 Chinese characters if possible.
    5. No extra conversational filler.

    Return strictly in JSON format:
    {
      "summary": "..."
    }
  `;

  try {
    const response = await axios.post(
      API_URL,
      {
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are a helpful assistant that outputs JSON." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );

    const content = cleanJson(response.data.choices[0].message.content);
    return JSON.parse(content).summary;
  } catch (error) {
    console.error('DeepSeek Cluster Summary Error:', error);
    return "包含一组相关的英语词汇"; // Fallback
  }
}
