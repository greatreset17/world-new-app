const STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
    'during', 'before', 'after', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both',
    'either', 'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most', 'other',
    'some', 'such', 'no', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'because',
    'if', 'when', 'where', 'how', 'what', 'which', 'who', 'whom', 'this', 'that', 'these',
    'those', 'it', 'its', 'he', 'she', 'they', 'them', 'their', 'we', 'our', 'us', 'i', 'me',
    'my', 'you', 'your', 'said', 'also', 'about', 'up', 'out', 'one', 'two', 'new',
    'の', 'に', 'は', 'を', 'た', 'が', 'で', 'て', 'と', 'し', 'れ', 'さ', 'ある', 'いる',
    'も', 'する', 'から', 'な', 'こと', 'として', 'い', 'や', 'れる', 'など', 'なっ', 'ない',
    'この', 'ため', 'その', 'あっ', 'よう', 'また', 'もの', 'という', 'あり', 'まで', 'られ',
    'なる', 'へ', 'か', 'だ', 'これ', 'により', 'おり', 'より', 'による', 'ず', 'なり',
    'です', 'ます', 'した', 'ました', 'している', 'される', 'された', 'について', 'として',
    'において', 'に対して', 'によると', 'に関して', 'それぞれ', 'ている', 'ことが',
    'しています', 'されています', 'しました', 'されました', 'ことを', 'ようです'
]);

export function summarize(text, numSentences = 2) {
    if (!text || text.trim().length === 0) return '要約データなし';
    if (text.length < 80) return text;

    const sentences = text.split(/(?<=[。．！？.!?])\s*/).map(s => s.trim()).filter(s => s.length > 5);
    if (sentences.length <= numSentences) return sentences.join(' ');

    const words = text.toLowerCase().replace(/[^\w\s\u3000-\u9FFF\uF900-\uFAFF]/g, ' ')
        .split(/\s+/).filter(w => w.length > 1 && !STOP_WORDS.has(w));

    const freq = {};
    words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
    const maxF = Math.max(...Object.values(freq), 1);
    Object.keys(freq).forEach(w => { freq[w] /= maxF; });

    const scored = sentences.map((s, i) => {
        const sw = s.toLowerCase().replace(/[^\w\s\u3000-\u9FFF\uF900-\uFAFF]/g, ' ')
            .split(/\s+/).filter(w => w.length > 1);
        if (sw.length === 0) return { s, score: 0, i };
        const sc = sw.reduce((sum, w) => sum + (freq[w] || 0), 0);
        const lf = (sw.length > 5 && sw.length < 30) ? 1.0 : 0.7;
        return { s, score: (sc / sw.length) * lf, i };
    });

    return scored.sort((a, b) => b.score - a.score)
        .slice(0, numSentences)
        .sort((a, b) => a.i - b.i)
        .map(t => t.s).join(' ');
}

export function summarizeArticles(articles) {
    return articles.map(a => ({
        ...a,
        summary: a.summary || summarize(a.description)
    }));
}
