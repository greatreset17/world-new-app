/**
 * storage.js — localStorage永続化モジュール
 * - 記事データの保存・読み込み
 * - URLベースの重複チェック
 * - 古い記事の自動パージ（最大100件）
 */

const STORAGE_KEY = 'worldnews_articles';
const MAX_ARTICLES = 100;

/**
 * 保存済み記事を全件取得
 * @returns {Array} 記事オブジェクトの配列
 */
export function getStoredArticles() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('[Storage] Failed to read:', e);
        return [];
    }
}

/**
 * 記事リストを保存（最大MAX_ARTICLES件を保持）
 * @param {Array} articles - 保存する記事配列
 */
export function saveArticles(articles) {
    try {
        const trimmed = articles.slice(0, MAX_ARTICLES);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (e) {
        console.error('[Storage] Failed to save:', e);
    }
}

/**
 * 新しい記事のみをフィルタリングして追加保存
 * @param {Array} newArticles - 新規取得した記事配列
 * @returns {Array} マージ後の全記事配列
 */
export function mergeArticles(newArticles) {
    const existing = getStoredArticles();
    const articleMap = new Map();

    // 全記事（既存 + 新規）を一つのリストにまとめる
    // 重複はURL (link) で排除。新しい情報は上書き。
    const all = [...newArticles, ...existing];
    const uniqueMap = new Map();

    all.forEach(a => {
        const key = a.link;
        const prev = uniqueMap.get(key);
        // 新規、または既存が未翻訳で今回のが翻訳済みの場合は優先
        if (!prev || (a.translated && !prev.translated)) {
            uniqueMap.set(key, a);
        }
    });

    const uniqueList = Array.from(uniqueMap.values());

    // ソースごとにグループ化
    const sourceMap = new Map();
    uniqueList.forEach(a => {
        if (!sourceMap.has(a.source)) sourceMap.set(a.source, []);
        sourceMap.get(a.source).push(a);
    });

    // 各ソース内で最新のN件を抽出して多様性を確保
    const MAX_PER_SOURCE = 12;
    const selected = [];

    sourceMap.forEach((articles) => {
        // ソース内で日付順ソート
        articles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
        // 最新のN件を追加
        selected.push(...articles.slice(0, MAX_PER_SOURCE));
    });

    // 全体を最終的に日付順にソート（直近のニュースが上に来るようにする）
    selected.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

    // 全体の最大件数(100)で切り出す
    const finalArticles = selected.slice(0, MAX_ARTICLES);

    saveArticles(finalArticles);
    return finalArticles;
}

/**
 * 全記事データをクリア
 */
export function clearArticles() {
    localStorage.removeItem(STORAGE_KEY);
}
