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
    const existingUrls = new Set(existing.map(a => a.link));

    const unique = newArticles.filter(a => !existingUrls.has(a.link));
    const merged = [...unique, ...existing].slice(0, MAX_ARTICLES);

    saveArticles(merged);
    return merged;
}

/**
 * 全記事データをクリア
 */
export function clearArticles() {
    localStorage.removeItem(STORAGE_KEY);
}
