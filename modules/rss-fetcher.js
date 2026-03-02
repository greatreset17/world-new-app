/**
 * rss-fetcher.js — RSSフィード取得 & パースモジュール
 * - CORSプロキシ経由でRSSフィードを取得
 * - DOMParser APIでXMLをパース
 * - フェッチ失敗時はデモデータにフォールバック
 */

const CORS_PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?url=',
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://thingproxy.freeboard.io/fetch/',
];

const NITTER_INSTANCES = [
    'https://nitter.net',
    'https://nitter.it',
    'https://nitter.moomoo.me',
    'https://nitter.poast.org',
    'https://nitter.perennialte.ch',
    'https://nitter.privacy.com.de',
];

export const NEWS_SOURCES = [
    { name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: '国際', lang: 'en', icon: '🌍' },
    { name: 'Reuters', url: 'https://feeds.reuters.com/reuters/topNews', category: '国際', lang: 'en', icon: '🗞️' },
    { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', category: 'テクノロジー', lang: 'en', icon: '💻' },
    { name: 'NHKニュース', url: 'https://www3.nhk.or.jp/rss/news/cat0.xml', category: '国内', lang: 'ja', icon: '🇯🇵' },
    { name: 'Yahoo!ニュース', url: 'https://news.yahoo.co.jp/rss/topics/top-picks.xml', category: '国内', lang: 'ja', icon: '📱' },
    { name: 'Hacker News', url: 'https://hnrss.org/frontpage', category: 'テクノロジー', lang: 'en', icon: '🔶' },
    { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', category: '国際', lang: 'en', icon: '🇶' },
    { name: 'Trump X', url: 'https://nitter.poast.org/realDonaldTrump/rss', category: 'X (Trump)', lang: 'en', icon: '🇺🇸' }
];

async function fetchWithProxy(url) {
    // Strategy 1: allorigins JSON
    try {
        const resp = await fetch('https://api.allorigins.win/get?url=' + encodeURIComponent(url), { signal: AbortSignal.timeout(12000) });
        if (resp.ok) {
            const json = await resp.json();
            if (json.contents) return json.contents;
        }
    } catch (e) { }

    // Strategy 2: raw proxies
    for (const proxy of CORS_PROXIES) {
        try {
            const resp = await fetch(proxy + encodeURIComponent(url), { signal: AbortSignal.timeout(12000) });
            if (resp.ok) return await resp.text();
        } catch (e) { }
    }
    throw new Error('All proxies failed');
}

async function fetchFeedViaJson(source) {
    const RSS2JSON = 'https://api.rss2json.com/v1/api.json?rss_url=';
    try {
        const resp = await fetch(RSS2JSON + encodeURIComponent(source.url), { signal: AbortSignal.timeout(15000) });
        if (!resp.ok) throw new Error('rss2json error');
        const data = await resp.json();
        if (data.status !== 'ok' || !data.items) throw new Error('rss2json bad response');

        return data.items.slice(0, 8).map(item => ({
            title: (item.title || '').trim() || 'No Title',
            link: item.link || '#',
            description: (item.description || item.content || '').replace(/<[^>]+>/g, '').trim(),
            imageUrl: item.enclosure && item.enclosure.link ? item.enclosure.link : (item.thumbnail || ''),
            pubDate: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
            source: source.name, sourceIcon: source.icon,
            category: source.category, lang: source.lang,
            summary: '', translated: false
        }));
    } catch (e) {
        return [];
    }
}


async function fetchFeed(source) {
    let articles = [];

    // Nitter (Trump X) の場合は複数インスタンスを試行
    if (source.name === 'Trump X') {
        console.log('[RSS] Fetching Trump X from Nitter instances...');
        for (const instance of NITTER_INSTANCES) {
            const url = `${instance}/realDonaldTrump/rss`;
            try {
                // Method 1: fetchWithProxy (XML)
                const text = await fetchWithProxy(url);
                articles = await parseXml(text, source);

                if (articles.length === 0) {
                    // Method 2: fetchFeedViaJson (rss2json) as fallback for this instance
                    articles = await fetchFeedViaJson({ ...source, url: url });
                }

                if (articles.length > 0) {
                    console.log(`[RSS] Successfully fetched from ${instance}`);

                    // 重複（特にNitter特有の「最新なのに古い固定ツイート」）を排除
                    // linkに「#m」が含まれるモバイル用リンクなども正規化して比較
                    const seen = new Set();
                    articles = articles.filter(a => {
                        const cleanLink = a.link.split('#')[0];
                        if (seen.has(cleanLink)) return false;
                        seen.add(cleanLink);
                        return true;
                    });

                    break;
                }
            } catch (e) {
                console.warn(`[RSS] Nitter instance failed: ${instance} - ${e.message}`);
            }
        }
        if (articles.length === 0) {
            console.error('[RSS] All Nitter instances failed for Trump X');
        }
    } else {
        if (source.lang === 'ja') {
            articles = await fetchFeedViaJson(source);
            if (articles.length === 0) articles = await fetchFeedViaXml(source);
        } else {
            // Al Jazeera や BBCなどは強力なフォールバック
            articles = await fetchFeedViaXml(source);
            if (articles.length === 0) {
                console.log(`[RSS] Falling back to JSON for ${source.name}`);
                articles = await fetchFeedViaJson(source);
            }
        }
    }
    return articles;
}

/**
 * XMLパースの共通処理
 */
async function parseXml(text, source) {
    let xml = new DOMParser().parseFromString(text, 'text/xml');
    if (xml.querySelector('parsererror')) {
        xml = new DOMParser().parseFromString(text, 'text/html');
    }

    const items = xml.querySelectorAll('item');
    const entries = items.length > 0 ? items : xml.querySelectorAll('entry');
    const articles = [];

    entries.forEach((item, idx) => {
        if (idx >= 8) return;
        const title = (item.querySelector('title')?.textContent || '').trim() || 'No Title';
        const linkEl = item.querySelector('link');
        const link = (linkEl?.textContent.trim() || linkEl?.getAttribute('href')) || '#';
        const descEl = item.querySelector('description') || item.querySelector('summary');
        const desc = descEl ? descEl.textContent.trim() : '';
        const pubDateEl = item.querySelector('pubDate') || item.querySelector('published') || item.querySelector('updated');
        const pubDate = pubDateEl ? pubDateEl.textContent : '';

        let imageUrl = '';
        const mc = item.querySelector('content[url]') || item.querySelector('thumbnail');
        if (mc) imageUrl = mc.getAttribute('url') || '';
        const enc = item.querySelector('enclosure[type^="image"]');
        if (!imageUrl && enc) imageUrl = enc.getAttribute('url') || '';
        if (!imageUrl) {
            const m = desc.match(/<img[^>]+src=["']([^"']+)["']/);
            if (m) imageUrl = m[1];
        }

        articles.push({
            title, link,
            description: desc.replace(/<[^>]+>/g, '').trim() || title,
            imageUrl,
            pubDate: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
            source: source.name, sourceIcon: source.icon,
            category: source.category, lang: source.lang,
            summary: '', translated: false
        });
    });
    return articles;
}

async function fetchFeedViaXml(source) {
    try {
        const text = await fetchWithProxy(source.url);
        return await parseXml(text, source);
    } catch (e) {
        return [];
    }
}

function getDemoArticles() {
    const now = Date.now();
    return [
        { title: 'AI革命：新型モデルが複雑な推論タスクで人間を超越', link: 'https://techcrunch.com', description: '最新世代のAIモデルが複雑な推論タスクで驚くべき能力を実証し、複数のベンチマークテストで人間の専門家を上回りました。', imageUrl: '', pubDate: new Date(now).toISOString(), source: 'TechCrunch', sourceIcon: '💻', category: 'テクノロジー', lang: 'ja', summary: '', translated: true },
        { title: '日本政府、次世代半導体への大型投資計画を発表', link: 'https://www3.nhk.or.jp', description: '日本政府は次世代半導体の開発と製造に向けた大型投資計画を正式に発表しました。', imageUrl: '', pubDate: new Date(now - 10800000).toISOString(), source: 'NHKニュース', sourceIcon: '🇯🇵', category: '国内', lang: 'ja', summary: '' }
    ];
}

export async function fetchAllFeeds(onProgress) {
    const total = NEWS_SOURCES.length;
    let completed = 0;
    const promises = NEWS_SOURCES.map(async (src) => {
        const res = await fetchFeed(src);
        completed++;
        if (onProgress) onProgress(completed, total, 'フィード取得中');
        return res;
    });
    const results = await Promise.allSettled(promises);
    const all = results.filter(r => r.status === 'fulfilled').flatMap(r => r.value);

    if (all.length === 0) return getDemoArticles();
    all.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    return all;
}
