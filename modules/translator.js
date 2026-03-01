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
export async function translateText(text, from = 'en', to = 'ja') {
    if (!text || text.trim().length === 0) return text;
    const key = `${from}|${to}:${text.substring(0, 100)}`;
    if (translateCache[key]) return translateCache[key];

    // API制限(~500文字)のため長いテキストは切り詰め
    const truncated = text.length > 450 ? text.substring(0, 450) + '...' : text;

    try {
        const url = `${TRANSLATE_API}?q=${encodeURIComponent(truncated)}&langpair=${from}|${to}`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!resp.ok) throw new Error('Translation API error');
        const data = await resp.json();

        if (data.responseStatus === 200 && data.responseData && data.responseData.translatedText) {
            const result = data.responseData.translatedText;
            translateCache[key] = result;
            return result;
        }
        throw new Error('Bad response status');
    } catch (e) {
        console.warn('[Translate] Failed:', e.message);
        return text; // 失敗時は原文を返す
    }
}

/**
 * 記事オブジェクトを翻訳する
 */
export async function translateArticle(article) {
    if (article.lang === 'ja') return article; // 日本語なら不要

    try {
        const translatedTitle = await translateText(article.title, 'en', 'ja');
        const translatedDesc = await translateText(article.description, 'en', 'ja');

        return {
            ...article,
            titleOriginal: article.title,
            title: translatedTitle,
            descriptionOriginal: article.description,
            description: translatedDesc,
            translated: true
        };
    } catch (e) {
        return article;
    }
}
