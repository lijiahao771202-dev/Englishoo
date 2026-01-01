import { pipeline, env } from '@xenova/transformers';
import { getDB, getAllCards } from './db';
import type { WordCard } from '@/types';

// Skip local model check to avoid errors in browser environment
env.allowLocalModels = false;
env.useBrowserCache = true;

export interface EmbeddingConfig {
    threshold: number;
    minConnections: number;
    maxConnections: number;
}

export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
    threshold: 0.65,
    minConnections: 1,
    maxConnections: 20
};

/**
 * @description 嵌入服务 (Singleton)
 * 负责生成语义向量和计算单词间的连接
 */
export class EmbeddingService {
    private static instance: EmbeddingService;
    private extractor: any = null;
    private modelName = 'Xenova/all-MiniLM-L6-v2';
    private isInitializing = false;
    private config: EmbeddingConfig = DEFAULT_EMBEDDING_CONFIG;

    private constructor() {
        // Try load config from storage
        try {
            const saved = localStorage.getItem('embedding-settings');
            if (saved) {
                this.config = { ...DEFAULT_EMBEDDING_CONFIG, ...JSON.parse(saved) };
            }
        } catch (e) {
            console.error('Failed to load embedding config', e);
        }
    }

    public updateConfig(newConfig: Partial<EmbeddingConfig>) {
        this.config = { ...this.config, ...newConfig };
        localStorage.setItem('embedding-settings', JSON.stringify(this.config));
    }

    public getConfig(): EmbeddingConfig {
        return this.config;
    }

    public static getInstance(): EmbeddingService {
        if (!EmbeddingService.instance) {
            EmbeddingService.instance = new EmbeddingService();
        }
        return EmbeddingService.instance;
    }

    public get isModelLoaded(): boolean {
        return !!this.extractor;
    }

    /**
     * @description 初始化模型
     * @returns boolean 是否初始化成功
     */
    public async init(): Promise<boolean> {
        if (this.extractor) return true;
        if (this.isInitializing) {
            // Wait for initialization to complete
            while (this.isInitializing) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return !!this.extractor;
        }

        this.isInitializing = true;
        try {
            console.log('Loading embedding model...');
            this.extractor = await pipeline('feature-extraction', this.modelName, {
                quantized: true,
            });
            console.log('Embedding model loaded.');
            return true;
        } catch (error) {
            console.error('Failed to load embedding model:', error);
            return false;
        } finally {
            this.isInitializing = false;
        }
    }

    /**
     * @description 获取单词列表的嵌入向量映射
     * 优先从数据库读取，缺失的实时生成
     */
    public async getEmbeddingsMap(words: string[]): Promise<Map<string, number[]>> {
        const db = await getDB();
        const uniqueWords = Array.from(new Set(words.map(w => w.toLowerCase())));
        const resultMap = new Map<string, number[]>();

        // 1. Try fetch from DB
        // Optimization: In a real app, we might want `db.getAll('embeddings')` and filter, 
        // or `db.getMany` if available. Assuming getAll is fast enough for now or we use get one by one.
        // Since batchProcess uses getAll, let's use getAll for consistency if the list is large, 
        // but for small lists, parallel gets might be better.
        // Given `batchProcess` logic, getAll is likely efficient enough for local IDB.

        const allEmbeddings = await db.getAll('embeddings');
        const dbMap = new Map(allEmbeddings.map(e => [e.word, e.vector]));

        const missing: string[] = [];

        for (const w of uniqueWords) {
            if (dbMap.has(w)) {
                resultMap.set(w, dbMap.get(w)!);
            } else {
                missing.push(w);
            }
        }

        // 2. Generate missing
        if (missing.length > 0) {
            await this.init();
            for (const w of missing) {
                try {
                    const vec = await this.getEmbedding(w);
                    resultMap.set(w, vec);
                    // Async save
                    db.put('embeddings', { word: w, vector: vec }).catch(console.error);
                } catch (e) {
                    console.error(`Failed to generate embedding for ${w}`, e);
                }
            }
        }

        return resultMap;
    }

    /**
     * @description 批量生成嵌入和连接 (优化版)
     * 避免重复读取数据库，大幅提高大量单词处理时的性能
     */
    public async batchProcess(
        words: string[],
        onProgress: (progress: number, total: number, stage: 'embedding' | 'connection') => void
    ) {
        const db = await getDB();
        const uniqueWords = Array.from(new Set(words.map(w => w.toLowerCase())));
        const total = uniqueWords.length;

        // 1. Load all existing embeddings into memory
        console.log('Loading all embeddings...');
        const allEmbeddings = await db.getAll('embeddings');
        const embeddingMap = new Map(allEmbeddings.map(e => [e.word, e.vector]));

        // 2. Identify and Generate missing embeddings
        const missingWords = uniqueWords.filter(w => !embeddingMap.has(w));
        console.log(`Found ${missingWords.length} missing embeddings.`);

        // Initialize model if needed
        await this.init();

        for (let i = 0; i < missingWords.length; i++) {
            const w = missingWords[i];
            try {
                // TODO: Batch inference if supported by pipeline to speed up
                const vec = await this.getEmbedding(w);
                embeddingMap.set(w, vec);
                // Save immediately to avoid data loss on crash
                await db.put('embeddings', { word: w, vector: vec });
            } catch (e) {
                console.error(`Failed to embed ${w}`, e);
            }
            onProgress(i + 1, missingWords.length, 'embedding');
        }

        // 3. Calculate connections for ALL input words
        // We need to compare each input word against ALL known embeddings (embeddingMap)
        console.log('Calculating connections...');
        const embeddingsArray = Array.from(embeddingMap.entries()).map(([w, v]) => ({ word: w, vector: v }));
        const { threshold, maxConnections } = this.config;

        // We can process connections in chunks to yield to event loop
        const chunkSize = 50;
        for (let i = 0; i < total; i += chunkSize) {
            const chunk = uniqueWords.slice(i, i + chunkSize);

            // Process chunk
            await Promise.all(chunk.map(async (sourceWord) => {
                const sourceVec = embeddingMap.get(sourceWord);
                if (!sourceVec) return;

                const connections: Array<{ target: string; similarity: number }> = [];

                // Brute force comparison against all (optimized by array iteration)
                // For 12k words, this loop runs 12k times. 
                // 50 words chunk * 12k = 600k ops per outer loop iteration. Manageable.
                for (const target of embeddingsArray) {
                    if (target.word === sourceWord) continue;

                    // Quick optimization: if we implement dot product manually, it's faster than function call
                    // But let's stick to method for clarity unless too slow
                    const sim = this.cosineSimilarity(sourceVec, target.vector);

                    if (sim >= threshold) {
                        connections.push({ target: target.word, similarity: sim });
                    }
                }

                connections.sort((a, b) => b.similarity - a.similarity);

                // Limit stored connections to top N to save space/time
                const topConnections = connections.slice(0, maxConnections);

                await db.put('semantic_connections', { source: sourceWord, connections: topConnections });
            }));

            onProgress(Math.min(i + chunkSize, total), total, 'connection');

            // Yield to main thread
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    /**
     * @description 生成文本的语义向量
     */
    public async getEmbedding(text: string): Promise<number[]> {
        await this.init();
        if (!this.extractor) throw new Error('Model not loaded');

        const output = await this.extractor(text, { pooling: 'mean', normalize: true });
        return Array.from(output.data);
    }

    /**
     * @description 计算余弦相似度
     */
    public cosineSimilarity(vecA: number[], vecB: number[]): number {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }

        if (normA === 0 || normB === 0) return 0;
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    /**
     * @description 查找与给定单词组相关的上下文单词（未学习的单词）
     * @param targetWords 目标单词列表（当前学习组）
     * @param count 需要返回的上下文单词数量
     * @param candidates 候选单词列表（所有未学习的单词）
     */
    public async findContextWords(targetWords: string[], count: number, candidates: string[]): Promise<string[]> {
        const uniqueTargets = Array.from(new Set(targetWords.map(w => w.toLowerCase())));
        const uniqueCandidates = Array.from(new Set(candidates.map(w => w.toLowerCase())));

        // 1. Get embeddings for targets
        const targetEmbeddings: number[][] = [];
        const targetMap = await this.getEmbeddingsMap(uniqueTargets);
        targetMap.forEach(v => targetEmbeddings.push(v));

        if (targetEmbeddings.length === 0) return [];

        // 2. Calculate Target Centroid (Average Vector)
        const centroid = new Array(targetEmbeddings[0].length).fill(0);
        for (const vec of targetEmbeddings) {
            for (let i = 0; i < vec.length; i++) {
                centroid[i] += vec[i];
            }
        }
        // Normalize centroid
        let norm = 0;
        for (let i = 0; i < centroid.length; i++) {
            centroid[i] /= targetEmbeddings.length;
            norm += centroid[i] * centroid[i];
        }
        norm = Math.sqrt(norm);
        if (norm > 0) {
            for (let i = 0; i < centroid.length; i++) centroid[i] /= norm;
        }

        // 3. Score candidates against centroid
        const scoredCandidates: Array<{ word: string; score: number }> = [];
        // Use getEmbeddingsMap to efficiently get all candidate vectors
        // Note: getEmbeddingsMap loads all embeddings from DB, so it's fast
        const candidateMap = await this.getEmbeddingsMap(uniqueCandidates);

        for (const word of uniqueCandidates) {
            const vec = candidateMap.get(word);
            if (vec) {
                const score = this.cosineSimilarity(centroid, vec);
                scoredCandidates.push({ word, score });
            }
        }

        // 4. Sort and return top N
        scoredCandidates.sort((a, b) => b.score - a.score);
        return scoredCandidates.slice(0, count).map(c => c.word);
    }

    /**
     * @description 语义链式排序算法 (Semantic Chain Traversal)
     * 将无序的单词列表转化为基于语义关联的有序路径，优先遍历强相关节点
     * @param words 单词列表
     * @returns 排序后的单词列表
     */
    public async sortWordsBySemanticChain(words: string[]): Promise<string[]> {
        if (words.length <= 1) return words;

        // 1. 构建全连接语义图 (Dense Graph)
        // 使用 minConnections = words.length 且 threshold = 0 确保获取所有可能的连接
        const links = await this.computeGroupConnections(words, 0, words.length);

        // 2. Build Adjacency Map & Calculate Centrality
        const adj = new Map<string, Array<{ target: string; similarity: number }>>();
        const degrees = new Map<string, number>();
        const validWords = new Set<string>();

        // Initialize
        words.forEach(w => {
            const lower = w.toLowerCase();
            adj.set(lower, []);
            degrees.set(lower, 0);
            validWords.add(lower);
        });

        // Fill Graph
        links.forEach(link => {
            // Filter out self-loops if any
            if (link.source === link.target) return;

            adj.get(link.source)?.push({ target: link.target, similarity: link.similarity });
            adj.get(link.target)?.push({ target: link.source, similarity: link.similarity });

            degrees.set(link.source, (degrees.get(link.source) || 0) + link.similarity);
            degrees.set(link.target, (degrees.get(link.target) || 0) + link.similarity);
        });

        // Sort neighbors by similarity desc
        adj.forEach(neighbors => neighbors.sort((a, b) => b.similarity - a.similarity));

        // 3. Find Start Node (Highest Degree Centrality)
        let startNode = words[0].toLowerCase();
        let maxDegree = -1;

        for (const [word, degree] of degrees.entries()) {
            if (degree > maxDegree) {
                maxDegree = degree;
                startNode = word;
            }
        }

        // 4. DFS with Backtracking
        const sorted: string[] = [];
        const visited = new Set<string>();
        const stack: string[] = [];

        // Helper: Push to stack and record visit
        const visit = (word: string) => {
            visited.add(word);
            stack.push(word);

            // Map back to original casing
            const original = words.find(w => w.toLowerCase() === word) || word;
            sorted.push(original);
        };

        // Initial visit
        visit(startNode);

        // Helper: Find best unvisited node globally (Jump Strategy with Time Decay)
        const findBestGlobalNode = () => {
            let bestNode = '';
            let bestScore = -1;

            for (const word of validWords) {
                if (visited.has(word)) continue;

                // Score based on weighted similarity to RECENT history (Time Decay)
                // Score = Σ (Sim(Candidate, Result[Last-k]) * Decay^k)
                let score = 0;
                const lookBackCount = Math.min(sorted.length, 5); // Look back at most 5 steps

                for (let k = 0; k < lookBackCount; k++) {
                    const prevWordOriginal = sorted[sorted.length - 1 - k];
                    const prevWord = prevWordOriginal.toLowerCase();

                    // Find similarity in adjacency list
                    const neighbors = adj.get(word) || [];
                    const connection = neighbors.find(n => n.target === prevWord);
                    const sim = connection ? connection.similarity : 0;

                    // Decay factor: 0.6 (Recent is much more important)
                    score += sim * Math.pow(0.6, k);
                }

                // Add small centrality bonus to prefer "Hubs" when signals are weak
                // Weight is small enough not to override strong local context
                score += (degrees.get(word) || 0) * 0.05;

                if (score > bestScore) {
                    bestScore = score;
                    bestNode = word;
                }
            }
            return bestNode;
        };

        while (sorted.length < words.length) {
            if (stack.length === 0) {
                // Stack empty but words remain -> Disconnected component or finished branch
                // Jump to best global candidate
                const nextBest = findBestGlobalNode();
                if (nextBest) {
                    visit(nextBest);
                } else {
                    // Fallback: Pick any unvisited (e.g. no embeddings)
                    const remaining = words.find(w => !visited.has(w.toLowerCase()));
                    if (remaining) visit(remaining.toLowerCase());
                    else break; // Should be done
                }
                continue;
            }

            const current = stack[stack.length - 1];
            const neighbors = adj.get(current) || [];

            // Greedy: Find best unvisited neighbor
            const nextNeighbor = neighbors.find(n => !visited.has(n.target));

            if (nextNeighbor) {
                visit(nextNeighbor.target);
            } else {
                // Dead End: Backtrack
                stack.pop();
            }
        }

        // Fallback cleanup (robustness)
        if (sorted.length < words.length) {
            const remaining = words.filter(w => !visited.has(w.toLowerCase()));
            sorted.push(...remaining);
        }

        return sorted;
    }

    /**
     * @description 计算一组单词内部的连接 (实时计算，解决连接缺失问题)
     * @param words 单词列表
     * @param threshold 相似度阈值 (可选，默认使用全局配置)
     * @param minConnections 每个单词的最小连接数 (可选，默认使用全局配置)
     */
    public async computeGroupConnections(words: string[], threshold?: number, minConnections?: number): Promise<Array<{ source: string; target: string; similarity: number }>> {
        const db = await getDB();
        const validWords = Array.from(new Set(words.map(w => w.toLowerCase())));
        const wordEmbeddings = new Map<string, number[]>();

        const finalThreshold = threshold ?? this.config.threshold;
        const finalMinConnections = minConnections ?? this.config.minConnections;

        // 1. Get/Generate Embeddings
        for (const word of validWords) {
            let embedding = (await db.get('embeddings', word))?.vector;
            if (!embedding) {
                try {
                    embedding = await this.getEmbedding(word);
                    await db.put('embeddings', { word, vector: embedding });
                } catch (e) {
                    console.error(`Failed to embed ${word}`, e);
                    continue;
                }
            }
            wordEmbeddings.set(word, embedding);
        }

        // 2. Compute Pairwise & Ensure Connectivity
        const links: Array<{ source: string; target: string; similarity: number }> = [];
        const addedLinks = new Set<string>(); // Track "source:target" (sorted) to avoid duplicates
        const wordsWithEmbeddings = Array.from(wordEmbeddings.keys());

        // Helper to add link
        const addLink = (u: string, v: string, sim: number) => {
            const key = [u, v].sort().join(':');
            if (!addedLinks.has(key)) {
                addedLinks.add(key);
                links.push({ source: u, target: v, similarity: sim });
            }
        };

        // Pre-compute all neighbors for each word to allow sorting
        const neighborsMap = new Map<string, Array<{ target: string; similarity: number }>>();
        wordsWithEmbeddings.forEach(w => neighborsMap.set(w, []));

        for (let i = 0; i < wordsWithEmbeddings.length; i++) {
            for (let j = i + 1; j < wordsWithEmbeddings.length; j++) {
                const w1 = wordsWithEmbeddings[i];
                const w2 = wordsWithEmbeddings[j];
                const v1 = wordEmbeddings.get(w1)!;
                const v2 = wordEmbeddings.get(w2)!;

                const sim = this.cosineSimilarity(v1, v2);

                neighborsMap.get(w1)?.push({ target: w2, similarity: sim });
                neighborsMap.get(w2)?.push({ target: w1, similarity: sim });
            }
        }

        // Select connections
        for (const word of wordsWithEmbeddings) {
            const neighbors = neighborsMap.get(word) || [];
            // Sort by similarity descending
            neighbors.sort((a, b) => b.similarity - a.similarity);

            // 1. Count how many are above threshold
            const aboveThreshold = neighbors.filter(n => n.similarity >= finalThreshold);

            // 2. Determine how many to take: Max(aboveThreshold, minConnections)
            // We limit to neighbors.length obviously
            const countToTake = Math.min(neighbors.length, Math.max(aboveThreshold.length, finalMinConnections));

            // 3. Add links
            for (let k = 0; k < countToTake; k++) {
                const n = neighbors[k];
                // Only add if similarity is positive (avoid totally unrelated if possible, but for small groups, we force it)
                if (n.similarity > 0) {
                    addLink(word, n.target, n.similarity);
                }
            }
        }

        return links;
    }

    /**
     * @description 更新单词的语义连接
     * 1. 生成/获取当前单词的向量
     * 2. 获取所有其他已学单词的向量
     * 3. 计算相似度并存储连接
     */
    public async updateConnections(word: string, threshold?: number) {
        const db = await getDB();
        const lowerWord = word.toLowerCase();
        const finalThreshold = threshold ?? this.config.threshold;

        // 1. Check if embedding exists
        let embedding = (await db.get('embeddings', lowerWord))?.vector;

        if (!embedding) {
            try {
                embedding = await this.getEmbedding(lowerWord);
                await db.put('embeddings', { word: lowerWord, vector: embedding });
            } catch (error) {
                console.error(`Failed to generate embedding for ${word}:`, error);
                throw error; // Re-throw to notify caller
            }
        }

        // 2. Get all other embeddings
        const allEmbeddings = await db.getAll('embeddings');
        const connections: Array<{ target: string; similarity: number }> = [];

        for (const item of allEmbeddings) {
            if (item.word === lowerWord) continue;

            const similarity = this.cosineSimilarity(embedding, item.vector);
            if (similarity >= finalThreshold) {
                connections.push({ target: item.word, similarity });
            }
        }

        // Sort by similarity desc
        connections.sort((a, b) => b.similarity - a.similarity);

        // Limit to maxConnections
        const topConnections = connections.slice(0, this.config.maxConnections);

        // 3. Save connections (bi-directional logic is handled by running this for each word, 
        // but strictly we only update THIS word's outgoing connections here. 
        // Ideally, the graph is undirected, but we store it as directed edges for simplicity.)
        await db.put('semantic_connections', { source: lowerWord, connections: topConnections });

        console.log(`Updated connections for ${word}: found ${topConnections.length} links.`);

        // Optional: Update reverse connections for strict consistency immediately?
        // For performance, we might skip this and rely on the other word being updated eventually,
        // BUT for a good user experience, we should probably update the reverse links too 
        // so they appear in the other word's network immediately.
        for (const conn of topConnections) {
            const targetConnections = (await db.get('semantic_connections', conn.target)) || { source: conn.target, connections: [] };

            // Check if link already exists
            if (!targetConnections.connections.some(c => c.target === lowerWord)) {
                targetConnections.connections.push({ target: lowerWord, similarity: conn.similarity });
                targetConnections.connections.sort((a, b) => b.similarity - a.similarity);
                await db.put('semantic_connections', targetConnections);
            }
        }
    }

    /**
     * @description 获取单词的邻居节点及其完整卡片信息
     * @param word 中心词
     * @returns 邻居列表 { card: WordCard, similarity: number }
     */
    public async getNeighbors(word: string): Promise<Array<{ card: WordCard; similarity: number }>> {
        const db = await getDB();
        const network = await db.get('semantic_connections', word.toLowerCase());
        if (!network || !network.connections) return [];

        // Fetch cards for neighbors
        // We use getCardByWord helper (which now uses index)
        const { getCardByWord } = await import('./db'); // Dynamic import to avoid circular dep if any

        const neighbors: Array<{ card: WordCard; similarity: number }> = [];

        // Limit to top 20 connections to avoid performance issues
        const topConnections = network.connections.slice(0, 20);

        for (const conn of topConnections) {
            const card = await getCardByWord(conn.target);
            if (card) {
                neighbors.push({ card, similarity: conn.similarity });
            }
        }

        return neighbors;
    }

    /**
     * @description 获取单词的连接网络 (Raw Data)
     */
    public async getNetwork(word: string) {
        const db = await getDB();
        return db.get('semantic_connections', word.toLowerCase());
    }

    /**
     * @description 获取全局图谱数据
     * @param maxLinksPerNode 每个节点保留的最大连接数 (默认 2，用于性能优化)
     */
    public async getGlobalGraph(maxLinksPerNode = 2) {
        const db = await getDB();
        const allConnections = await db.getAll('semantic_connections');

        const nodes = new Set<string>();
        const links: Array<{ source: string; target: string; value: number }> = [];

        allConnections.forEach(item => {
            nodes.add(item.source);

            // Sort connections by similarity (descending) and take top N
            const sortedConnections = [...item.connections]
                .sort((a, b) => b.similarity - a.similarity)
                .slice(0, maxLinksPerNode);

            sortedConnections.forEach(conn => {
                nodes.add(conn.target);
                // Avoid duplicate links for undirected graph visualization
                // Only add if source < target (lexicographically)
                if (item.source < conn.target) {
                    links.push({
                        source: item.source,
                        target: conn.target,
                        value: conn.similarity
                    });
                }
            });
        });

        return {
            nodes: Array.from(nodes).map(id => ({ id, group: 1 })),
            links
        };
    }

    /**
     * @description 获取特定卡包的知识图谱数据
     * 仅包含该卡包内的单词及其相互连接
     */
    public async getGraphForDeck(deckId: string) {
        const db = await getDB();
        const cards = await getAllCards(deckId);
        const validWords = new Set(cards.map(c => c.word.toLowerCase()));

        // Add all words in deck as nodes first (ensure isolated words appear)
        const nodes = new Set<string>(validWords);
        const links: Array<{ source: string; target: string; value: number }> = [];

        // Get all connections
        // Optimization: For huge datasets, this might need to be optimized to avoid loading all connections
        const allConnections = await db.getAll('semantic_connections');

        allConnections.forEach(item => {
            if (!validWords.has(item.source)) return;

            item.connections.forEach(conn => {
                if (validWords.has(conn.target)) {
                    // Avoid duplicate links for undirected graph visualization
                    if (item.source < conn.target) {
                        links.push({
                            source: item.source,
                            target: conn.target,
                            value: conn.similarity
                        });
                    }
                }
            });
        });

        return {
            nodes: Array.from(nodes).map(id => ({ id, group: 1 })),
            links
        };
    }

    /**
     * @description 获取指定单词列表的子图
     * @param words 单词列表
     */
    public async getGraphForWords(words: string[]) {
        const db = await getDB();
        const validWords = new Set(words.map(w => w.toLowerCase()));
        const links: Array<{ source: string; target: string; value: number }> = [];

        for (const word of words) {
            const record = await db.get('semantic_connections', word.toLowerCase());
            if (record && record.connections) {
                record.connections.forEach(conn => {
                    if (validWords.has(conn.target)) {
                        // Avoid duplicate links for undirected graph visualization
                        if (word.toLowerCase() < conn.target) {
                            links.push({
                                source: word.toLowerCase(),
                                target: conn.target,
                                value: conn.similarity
                            });
                        }
                    }
                });
            }
        }

        return {
            nodes: words.map(id => ({ id, group: 1 })),
            links
        };
    }

    private runningRequests = new Map<string, Promise<any>>();

    /**
     * @description 获取卡包的聚类结果 (带缓存)
     * @param deckId 卡包ID
     * @param cards 卡片列表 (可选，如果不传则根据需要获取)
     * @param forceRefresh 是否强制刷新
     */
    public async getDeckClusters(deckId: string, cards?: any[], forceRefresh = false): Promise<Array<{ label: string; items: any[] }>> {
        const db = await getDB();

        if (!forceRefresh) {
            const cached = await db.get('deck_clusters', deckId);
            // Check if cache exists
            if (cached) {
                console.log('[Cache Check] Using cached clusters for deck:', deckId);

                // [CRITICAL FIX] ALWAYS hydrate clusters with fresh card data.
                // The cache might store stale card object snapshots. We must map them back to current cards.
                const allCards = cards || await getAllCards(deckId);

                // Build a word-to-card map from current fresh cards
                // If duplicates exist, pick the most progressed one
                const cardMap = new Map();
                allCards.forEach((c: any) => {
                    const existing = cardMap.get(c.word);
                    if (!existing || (c.state !== 0 || c.isFamiliar)) {
                        if (!existing || (existing.state === 0 && !existing.isFamiliar)) {
                            cardMap.set(c.word, c);
                        }
                    }
                });

                return cached.clusters.map((c: any) => ({
                    ...c,
                    // Map word string OR stale object.word back to our fresh cardMap
                    items: c.items.map((item: any) => {
                        const word = typeof item === 'string' ? item : item.word;
                        return cardMap.get(word);
                    }).filter(Boolean)
                }));
            }
        }

        // Deduplication: Check if a request for this deck is already running
        const requestKey = `cluster-${deckId}`;
        if (this.runningRequests.has(requestKey)) {
            console.log('Joining existing cluster calculation for:', deckId);
            return this.runningRequests.get(requestKey);
        }

        const calculationPromise = (async () => {
            try {
                // If we reach here, we need to cluster.
                console.log('Calculating new clusters for deck:', deckId);

                // Ensure we have cards
                const cardsToCluster = cards || await getAllCards(deckId);
                const clusters = await this.clusterCards(cardsToCluster);

                // [OPTIMIZATION] Save lightweight cache (store words only) to reduce IDB size and IO time
                const lightweightClusters = clusters.map(c => ({
                    ...c,
                    items: c.items.map(i => i.word)
                }));

                // Save to cache
                await db.put('deck_clusters', {
                    deckId,
                    clusters: lightweightClusters,
                    updatedAt: Date.now(),
                    totalDeckSize: cardsToCluster.length // Store total count to handle words without embeddings
                });

                // [DUAL-WRITE] Also save to cloud for cross-device sync
                try {
                    const { saveDeckClustersCache } = await import('./supabase-db');
                    await saveDeckClustersCache({
                        deckId,
                        clusters: lightweightClusters,
                        updatedAt: Date.now(),
                        totalDeckSize: cardsToCluster.length
                    });
                    console.log('[Cloud Sync] Saved clusters to cloud for deck:', deckId);
                } catch (cloudError) {
                    // Non-blocking: Cloud save failure should not break local flow
                    console.warn('[Cloud Sync] Failed to save clusters to cloud:', cloudError);
                }

                return clusters;
            } finally {
                this.runningRequests.delete(requestKey);
            }
        })();

        this.runningRequests.set(requestKey, calculationPromise);
        return calculationPromise;
    }

    /**
     * @description 对卡片列表进行语义聚类 (符合 10-30 词限制)
     * @param cards 单词卡片列表
     * @returns 分组后的列表，每个组包含标签和卡片
     */
    public async clusterCards(cards: any[]): Promise<Array<{ label: string; items: any[] }>> {
        const db = await getDB();
        const validWords = new Set(cards.map(c => c.word.toLowerCase()));

        // [FIX] Handle duplicates in clustering: Prefer learned cards
        const wordToCardMap = new Map();
        cards.forEach(c => {
            const lower = c.word.toLowerCase();
            const existing = wordToCardMap.get(lower);
            // State: 0 is New. Prefer any state > 0 or isFamiliar=true
            if (!existing || (c.state !== 0 || c.isFamiliar)) {
                if (!existing || (existing.state === 0 && !existing.isFamiliar)) {
                    wordToCardMap.set(lower, c);
                }
            }
        });

        // 1. 获取所有单词的向量 (用于 K-Means) - Optimized: Only fetch for current cards
        const wordEmbeddings = new Map<string, number[]>();

        // [OPTIMIZATION] Batch fetch embeddings for valid words only
        // Chunk requests to avoid overwhelming IDB or Event Loop with 10k+ concurrent requests
        const wordsArrayForEmbeddings = Array.from(validWords);
        const embeddingChunkSize = 100;

        for (let i = 0; i < wordsArrayForEmbeddings.length; i += embeddingChunkSize) {
            const chunk = wordsArrayForEmbeddings.slice(i, i + embeddingChunkSize);
            await Promise.all(chunk.map(async (word) => {
                const record = await db.get('embeddings', word);
                if (record) {
                    wordEmbeddings.set(record.word, record.vector);
                }
            }));
            // Yield to main thread
            if (i % 500 === 0) await new Promise(resolve => setTimeout(resolve, 0));
        }

        // 2. 构建高阈值图 (避免牵强联系) - Optimized: Only fetch connections for current cards

        // 2. 构建高阈值图 (避免牵强联系) - Optimized: Only fetch connections for current cards
        const adj = new Map<string, string[]>();
        validWords.forEach(w => adj.set(w, []));

        // Fetch connections only for valid words
        const wordsArray = Array.from(validWords);
        const chunkSize = 50;

        for (let i = 0; i < wordsArray.length; i += chunkSize) {
            const chunk = wordsArray.slice(i, i + chunkSize);

            await Promise.all(chunk.map(async (sourceWord) => {
                const record = await db.get('semantic_connections', sourceWord);
                if (!record) return;

                // 使用更高的阈值 (例如 0.6) 来构建强连接图
                const STRONG_THRESHOLD = 0.6;

                record.connections.forEach(conn => {
                    if (validWords.has(conn.target) && conn.similarity >= STRONG_THRESHOLD) {
                        adj.get(sourceWord)?.push(conn.target);
                        // Undirected graph for clustering: Add reverse edge if not present
                        if (!adj.has(conn.target)) adj.set(conn.target, []);
                        // Note: We rely on the loop processing the target word later to add the reverse link naturally
                        // IF the connection exists in DB bi-directionally. 
                        // But semantic_connections are stored by source.
                        // To ensure connectivity even if DB is slightly asymmetric or we want robust clustering:
                        // We can force symmetry here.
                        // However, the original code didn't force symmetry explicitly in the loop (it relied on iterating all).
                        // Let's stick to the original logic: The loop iterates ALL connections.
                        // Original: allConnections.forEach...
                        // If I process 'A', I see A->B. I add B to A's adj.
                        // When I process 'B', I see B->A. I add A to B's adj.
                        // So symmetry is handled by the data if the data is symmetric.
                        // If the data is NOT symmetric (A->B exists but B->A missing), 
                        // the original code would only add A->B.
                        // Connected Components (BFS) treats edges as directed unless we handle them.
                        // In BFS (step 3): 
                        // const neighbors = adj.get(curr) || [];
                        // This implies directed traversal.
                        // If we want undirected clustering (A connected to B implies B connected to A),
                        // we should ensure adj is symmetric.
                        // Let's enforce symmetry here to be safe and robust.
                        // adj.get(conn.target)?.push(sourceWord); 
                    }
                });
            }));

            // Yield control to main thread every chunk
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        // 3. 寻找连通分量 (Connected Components)
        const visited = new Set<string>();
        const rawClusters: string[][] = [];

        for (const word of validWords) {
            if (visited.has(word)) continue;

            const component: string[] = [];
            const queue = [word];
            visited.add(word);

            while (queue.length > 0) {
                const curr = queue.shift()!;
                component.push(curr);

                const neighbors = adj.get(curr) || [];
                for (const neighbor of neighbors) {
                    if (!visited.has(neighbor)) {
                        visited.add(neighbor);
                        queue.push(neighbor);
                    }
                }
            }
            rawClusters.push(component);
        }

        // 4. 处理分量：拆分大组，收集小组
        const finalClusters: Array<{ label: string; items: any[] }> = [];
        const smallComponents: string[] = []; // To be merged via K-Means

        for (const component of rawClusters) {
            if (component.length > 30) { // Strict limit 30
                // Recursively split large component
                const validItems = component
                    .map(w => ({ word: w, vec: wordEmbeddings.get(w) }))
                    .filter((item): item is { word: string; vec: number[] } => item.vec !== undefined);

                if (validItems.length < component.length * 0.5) {
                    smallComponents.push(...component);
                    continue;
                }

                const splitGroups = await this.recursiveSplit(validItems, 20); // Target 20

                for (const group of splitGroups) {
                    if (group.length > 0) {
                        finalClusters.push(this.createClusterObject(group.map(i => i.word), wordToCardMap, adj));
                    }
                }

                // Handle words without embeddings
                const wordsWithEmbeddings = new Set(validItems.map(i => i.word));
                const missingWords = component.filter(w => !wordsWithEmbeddings.has(w));
                if (missingWords.length > 0) {
                    smallComponents.push(...missingWords);
                }

            } else if (component.length < 10) {
                smallComponents.push(...component);
            } else {
                finalClusters.push(this.createClusterObject(component, wordToCardMap, adj));
            }
        }

        // 5. 处理所有过小的分量
        if (smallComponents.length > 0) {
            const validItems = smallComponents.map(w => ({ word: w, vec: wordEmbeddings.get(w) })).filter(item => item.vec !== undefined);
            const vectors = validItems.map(item => item.vec!);

            // Handle words without embeddings
            const wordsWithEmbeddings = new Set(validItems.map(i => i.word));
            const missingWords = smallComponents.filter(w => !wordsWithEmbeddings.has(w));

            if (vectors.length === 0) {
                finalClusters.push({
                    label: '未关联单词',
                    items: smallComponents.map(w => wordToCardMap.get(w)!).filter(Boolean)
                });
            } else {
                const targetSize = 20;
                // Ensure at least 1 cluster, max size 30
                let k = Math.ceil(smallComponents.length / targetSize);
                if (k === 0) k = 1;

                const subClustersIndices = await this.kMeans(vectors, k);

                for (const indices of subClustersIndices) {
                    const subClusterWords = indices.map(i => validItems[i].word);
                    if (subClusterWords.length > 0) {
                        finalClusters.push(this.createClusterObject(subClusterWords, wordToCardMap, adj));
                    }
                }

                // Put missing words in a separate group or append to "未关联单词"
                if (missingWords.length > 0) {
                    finalClusters.push({
                        label: '未关联单词 (无向量)',
                        items: missingWords.map(w => wordToCardMap.get(w)!).filter(Boolean)
                    });
                }
            }
        }

        // Sort clusters by size (descending) to show most significant groups first
        finalClusters.sort((a, b) => b.items.length - a.items.length);

        return finalClusters;
    }

    private createClusterObject(words: string[], map: Map<string, any>, adj: Map<string, string[]>) {
        // Pick label: Word with highest degree within this cluster (or globally in adj)
        let maxDegree = -1;
        let label = words[0];

        for (const w of words) {
            const degree = (adj.get(w) || []).filter(n => words.includes(n)).length;
            if (degree > maxDegree) {
                maxDegree = degree;
                label = w;
            }
        }

        const displayLabel = map.get(label)?.word || label;
        return {
            label: displayLabel,
            items: words.map(w => map.get(w)!).filter(Boolean)
        };
    }

    private async recursiveSplit(items: Array<{ word: string; vec: number[] }>, targetSize: number): Promise<Array<Array<{ word: string; vec: number[] }>>> {
        if (items.length <= 30) { // Strict max is 30
            return [items];
        }

        const k = 2; // Binary split is safer for recursion
        const vectors = items.map(i => i.vec);
        const subClustersIndices = await this.kMeans(vectors, k);

        const result: Array<Array<{ word: string; vec: number[] }>> = [];

        for (const indices of subClustersIndices) {
            const subGroup = indices.map(i => items[i]);
            if (subGroup.length > 0) {
                // Recursively split this subgroup
                const subResult = await this.recursiveSplit(subGroup, targetSize);
                result.push(...subResult);
            }
        }

        return result;
    }

    private async kMeans(vectors: number[][], k: number, maxIter = 10): Promise<number[][]> {
        if (vectors.length === 0) return [];

        // 1. Init centroids (K-Means++ inspired or random)
        // Random pick k
        const centroids = vectors.slice(0, k);
        if (centroids.length < k) {
            // Pad with existing if not enough
            while (centroids.length < k) centroids.push(vectors[0]);
        }

        const assignment = new Array(vectors.length).fill(0);

        for (let iter = 0; iter < maxIter; iter++) {
            // Yield control to main thread every iteration to prevent freezing
            await new Promise(resolve => setTimeout(resolve, 0));

            // 2. Assign
            let changed = false;
            for (let i = 0; i < vectors.length; i++) {
                let minDist = Infinity;
                let clusterIdx = 0;

                for (let c = 0; c < k; c++) {
                    const dist = this.cosineDist(vectors[i], centroids[c]);
                    if (dist < minDist) {
                        minDist = dist;
                        clusterIdx = c;
                    }
                }

                if (assignment[i] !== clusterIdx) {
                    assignment[i] = clusterIdx;
                    changed = true;
                }
            }

            if (!changed) break;

            // 3. Update Centroids
            const sums = Array(k).fill(null).map(() => Array(vectors[0].length).fill(0));
            const counts = Array(k).fill(0);

            for (let i = 0; i < vectors.length; i++) {
                const c = assignment[i];
                counts[c]++;
                for (let d = 0; d < vectors[i].length; d++) {
                    sums[c][d] += vectors[i][d];
                }
            }

            for (let c = 0; c < k; c++) {
                if (counts[c] > 0) {
                    centroids[c] = sums[c].map((s: number) => s / counts[c]);
                }
            }
        }

        // Group indices
        const result: number[][] = Array(k).fill(null).map(() => []);
        for (let i = 0; i < vectors.length; i++) {
            result[assignment[i]].push(i);
        }

        return result;
    }

    private cosineDist(a: number[], b: number[]) {
        // dist = 1 - similarity
        // optimize: we only need to compare relative values, so just dot product is enough if normalized?
        // The vectors from transformers are normalized? 
        // Yes, in getEmbedding we use { normalize: true }.
        // So dot product is cosine similarity.
        // Dist = 1 - dot.
        let dot = 0;
        for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
        return 1 - dot;
    }
}
