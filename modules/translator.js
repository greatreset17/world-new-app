/**
 * translator.js — 翻訳モジュール (MyMemory API経由)
 * - 英語から日本語へのオンライン翻訳を提供
 * - 翻訳キャッシュによる負荷軽減と高速化
 */

const TRANSLATE_API = 'https://api.mymemory.translated.net/get';
const translateCache = {};

/**
 * テキストを翻訳する (en -> ja)
 */
/**
 * テキストに日本語が含まれているかチェック
 */
function containsJapanese(text) {
    // ひらがな、カタカナ、漢字の範囲をチェック
    return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
}

export async function translateText(text, from = 'en', to = 'ja') {
    if (!text || text.trim().length === 0) return null;
    const key = `${from}|${to}:${text.substring(0, 100)}`;
    if (translateCache[key]) return translateCache[key];

    const truncated = text.length > 450 ? text.substring(0, 450) + '...' : text;

    try {
        const url = `${TRANSLATE_API}?q=${encodeURIComponent(truncated)}&langpair=${from}|${to}`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!resp.ok) return null;
        const data = await resp.json();

        if (data.responseStatus === 200 && data.responseData && data.responseData.translatedText) {
            const result = data.responseData.translatedText;

            // 原文と同じ、または日本語が含まれていない場合は「失敗」とみなす
            if (result === truncated || !containsJapanese(result)) {
                return null;
            }

            translateCache[key] = result;
            return result;
        }
        return null;
    } catch (e) {
        console.warn('[Translate] Failed:', e.message);
        return null;
    }
}

/**
 * 記事オブジェクトを翻訳する
 */
export async function translateArticle(article) {
    if (article.lang === 'ja' || article.translated) return article;

    const tTitle = await translateText(article.title, 'en', 'ja');
    const tDesc = await translateText(article.description, 'en', 'ja');

    // タイトルまたは本文のいずれかが「実際に翻訳」された場合のみフラグを立てる
    if (tTitle || tDesc) {
        return {
            ...article,
            titleOriginal: article.title,
            title: tTitle || article.title,
            descriptionOriginal: article.description,
            description: tDesc || article.description,
            translated: true
        };
    }

    return article;
}
