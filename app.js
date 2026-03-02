console.log('[App] Script loading...');

// グローバルエラーハンドラ
window.onerror = function (msg, url, lineNo, columnNo, error) {
    console.error('[Global Error]', msg, 'at', url, ':', lineNo, ':', columnNo, error);
    return false;
};
window.onunhandledrejection = function (event) {
    console.error('[Unhandled Rejection]', event.reason);
};

import { fetchAllFeeds, NEWS_SOURCES } from './modules/rss-fetcher.js';
import { summarizeArticles, summarize } from './modules/summarizer.js';
import { getStoredArticles, mergeArticles, clearArticles, saveArticles } from './modules/storage.js';
import { translateArticle } from './modules/translator.js';

// ===== State =====
let allArticles = [];
let currentFilter = 'All';
let isLoading = false;

// ===== DOM References =====
const newsGrid = document.getElementById('news-grid');
const refreshBtn = document.getElementById('refresh-btn');
const refreshIcon = document.getElementById('refresh-icon');
const refreshText = document.getElementById('refresh-text');
const progressBar = document.getElementById('progress-bar');
const filterContainer = document.getElementById('filter-tabs');
const statTotal = document.getElementById('stat-total');
const statSources = document.getElementById('stat-sources');
const statUpdated = document.getElementById('stat-updated');

const CATEGORY_LABELS = {
    'All': '💠 すべて',
    '国際': '🌍 国際',
    'テクノロジー': '💻 テクノロジー',
    '国内': '🇯🇵 国内',
    'X (Trump)': '🇺🇸 X (Trump)'
};

// ===== Render Functions =====

function renderSkeletons(count = 6) {
    newsGrid.innerHTML = Array.from({ length: count }, () => `
        <div class="glass-card">
            <div class="skeleton" style="height: 180px; border-radius: 16px 16px 0 0;"></div>
            <div style="padding: 20px;">
                <div class="skeleton" style="height: 16px; width: 60%; margin-bottom: 12px;"></div>
                <div class="skeleton" style="height: 14px; width: 100%; margin-bottom: 8px;"></div>
                <div class="skeleton" style="height: 14px; width: 90%; margin-bottom: 8px;"></div>
                <div class="skeleton" style="height: 14px; width: 70%;"></div>
            </div>
        </div>
    `).join('');
}

function renderArticles(articles) {
    if (articles.length === 0) {
        newsGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <div class="icon">📡</div>
                <p style="font-size: 1.1rem; margin-bottom: 8px;">ニュースが見つかりません</p>
                <p style="font-size: 0.85rem;">「更新」ボタンを押して最新ニュースを取得してください。</p>
            </div>
        `;
        return;
    }

    newsGrid.innerHTML = articles.map((article, index) => {
        const catClass = article.category === '国際' ? 'world' : article.category === 'テクノロジー' ? 'tech' : 'japan';
        const timeAgo = getTimeAgo(article.pubDate);

        // 翻訳ステータス表示の構築
        let translationBadge = '';
        if (article.lang === 'en') {
            const status = article.translationStatus || (article.translated ? 'done' : 'pending');
            if (status === 'done') {
                translationBadge = '<span class="translation-status status-done">🌐 翻訳済</span>';
            } else if (status === 'pending') {
                translationBadge = `
                    <span class="translation-status status-pending">⏳ 翻訳待機 
                        <button class="retry-btn" onclick="window.translateArticleById('${article.link}')">今すぐ翻訳</button>
                    </span>`;
            } else if (status === 'failed') {
                translationBadge = `
                    <span class="translation-status status-failed">⚠️ 翻訳失敗 
                        <button class="retry-btn" onclick="window.translateArticleById('${article.link}')">再試行</button>
                    </span>`;
            } else if (status === 'processing') {
                translationBadge = '<span class="translation-status status-processing">🔄 翻訳中...</span>';
            }
        }

        return `
        <article class="glass-card fade-in" style="animation-delay: ${index * 0.05}s; display: flex; flex-direction: column;">
            <div class="news-card-image">
                ${article.imageUrl
                ? `<img src="${escapeHtml(article.imageUrl)}" alt="${escapeHtml(article.title)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'placeholder\\'>${article.sourceIcon}</div>'">`
                : `<div class="placeholder">${article.sourceIcon}</div>`
            }
                <span class="category-badge ${catClass}">${escapeHtml(article.category)}</span>
            </div>
            <div style="padding: 20px; display: flex; flex-direction: column; gap: 12px; flex: 1;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">
                    <span class="source-badge">${article.sourceIcon} ${escapeHtml(article.source)}${translationBadge}</span>
                    <span style="font-size: 0.7rem; color: var(--text-secondary);">${timeAgo}</span>
                </div>
                <h3 style="font-size: 0.95rem; font-weight: 600; line-height: 1.4; color: var(--text-primary);">
                    ${escapeHtml(article.title)}
                </h3>
                <p class="summary-text">
                    ${article.summary ? '🤖 ' + escapeHtml(article.summary) : escapeHtml(article.description.substring(0, 150))}
                </p>
                <div style="margin-top: auto; padding-top: 12px; border-top: 1px solid var(--border-color);">
                    <a href="${escapeHtml(article.link)}" target="_blank" rel="noopener noreferrer" class="read-more">
                        記事を読む <span>→</span>
                    </a>
                </div>
            </div>
        </article>
        `;
    }).join('');
}

function renderStats(articles) {
    const sources = new Set(articles.map(a => a.source));
    statTotal.textContent = articles.length;
    statSources.textContent = sources.size;
    statUpdated.textContent = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function renderFilters() {
    const categories = ['All', ...new Set(NEWS_SOURCES.map(s => s.category))];
    filterContainer.innerHTML = categories.map(cat => `
        <button class="filter-tab ${cat === currentFilter ? 'active' : ''}" data-category="${cat}">
            ${CATEGORY_LABELS[cat] || cat}
        </button>
    `).join('');

    filterContainer.querySelectorAll('.filter-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            currentFilter = btn.dataset.category;
            renderFilters();
            applyFilter();
        });
    });
}

function applyFilter() {
    const filtered = currentFilter === 'All'
        ? allArticles
        : allArticles.filter(a => a.category === currentFilter);
    renderArticles(filtered);
}

// ===== Processing Pipeline =====

function unescapeHtml(safe) {
    const doc = new DOMParser().parseFromString(safe, 'text/html');
    return doc.documentElement.textContent;
}

async function processArticles(articles, onProgress) {
    console.log(`[App] Processing ${articles.length} articles...`);
    const processed = [];
    const total = articles.length;

    for (let i = 0; i < articles.length; i++) {
        let article = { ...articles[i] };

        // 翻訳の必要があるかチェック
        if (article.lang !== 'ja' && !article.translated) {
            if (onProgress) onProgress(i + 1, total, `翻訳中 (${i + 1}/${total})`);

            try {
                const translatedArticle = await translateArticle(article);
                if (translatedArticle.translated) {
                    article = { ...translatedArticle, translationStatus: 'done' };
                } else {
                    article.translationStatus = 'failed';
                }

                // API負荷軽減
                if (i < articles.length - 1) await new Promise(r => setTimeout(r, 400));
            } catch (error) {
                if (error.message === 'RATE_LIMIT') {
                    console.warn('[App] Translation rate limit hit, skipping remaining auto-translations');
                    article.translationStatus = 'pending';
                    // 残りの記事もpendingにする
                    for (let j = i + 1; j < articles.length; j++) {
                        let remaining = { ...articles[j] };
                        remaining.translationStatus = 'pending';
                        // 要約などは通す
                        const rawSum = remaining.summary || summarize(remaining.description);
                        remaining.summary = unescapeHtml(rawSum);
                        processed.push(remaining);
                    }
                    // この記事自体も処理して追加
                    const rawSum = article.summary || summarize(article.description);
                    article.summary = unescapeHtml(rawSum);
                    processed.push(article);
                    break;
                } else {
                    article.translationStatus = 'failed';
                }
            }
        } else if (article.translated) {
            article.translationStatus = 'done';
        }

        // 要約とHTMLデコード（共通処理）
        const rawSummary = article.summary || summarize(article.description);
        article.summary = unescapeHtml(rawSummary);

        processed.push(article);
    }
    console.log(`[App] Finished processing ${processed.length} articles.`);
    return processed;
}

/**
 * 特定の記事を個別に翻訳する（手動トリガー用）
 */
async function translateArticleById(link) {
    const idx = allArticles.findIndex(a => a.link === link);
    if (idx === -1) return;

    const article = allArticles[idx];
    article.translationStatus = 'processing';
    renderArticles(allArticles);

    try {
        const translated = await translateArticle(article);
        if (translated.translated) {
            allArticles[idx] = { ...translated, translationStatus: 'done' };
        } else {
            allArticles[idx].translationStatus = 'failed';
            alert('翻訳に失敗しました。時間をおいて再度お試しください。');
        }
    } catch (e) {
        allArticles[idx].translationStatus = 'failed';
        if (e.message === 'RATE_LIMIT') {
            alert('翻訳APIの制限に達しました。しばらく待ってから再度お試しください。');
        } else {
            alert('翻訳エラーが発生しました。');
        }
    }

    saveArticles(allArticles);
    renderArticles(allArticles);
}

// グローバルスコープに公開
window.translateArticleById = translateArticleById;

// ===== Loading State =====

function setLoading(loading) {
    isLoading = loading;
    refreshBtn.disabled = loading;
    progressBar.style.opacity = loading ? '1' : '0';

    if (loading) {
        refreshIcon.innerHTML = `<svg class="spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
        refreshText.textContent = '取得中...';
    } else {
        refreshIcon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`;
        refreshText.textContent = '更新';
    }
}

// ===== Data Fetching =====

async function refreshNews() {
    if (isLoading) return;
    setLoading(true);
    renderSkeletons();

    try {
        const raw = await fetchAllFeeds((done, total, phase) => {
            refreshText.textContent = `${phase} (${done}/${total})`;
        });

        refreshText.textContent = '翻訳・要約処理中...';
        const processed = await processArticles(raw, (done, total, phase) => {
            refreshText.textContent = phase;
        });

        allArticles = mergeArticles(processed);

        renderArticles(allArticles);
        renderStats(allArticles);
        renderFilters();
    } catch (error) {
        console.error('[App] Refresh failed:', error);
        newsGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <div class="icon">⚠️</div>
                <p style="font-size: 1.1rem; margin-bottom: 8px;">データ取得に失敗しました</p>
                <p style="font-size: 0.85rem;">ネットワーク接続を確認して、もう一度お試しください。</p>
            </div>
        `;
    } finally {
        setLoading(false);
    }
}

// ===== Utilities =====

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getTimeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'たった今';
    if (mins < 60) return `${mins}分前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}時間前`;
    const days = Math.floor(hours / 24);
    return `${days}日前`;
}

// ===== Init =====

const STORAGE_VERSION = '20260301-v2'; // バージョンアップ時に更新してキャッシュクリアを促す

function init() {
    // バージョンが変わっていたら一度ストレージをクリアする
    const currentVer = localStorage.getItem('worldnews_version');
    if (currentVer !== STORAGE_VERSION) {
        console.log('[Init] Version mismatch, clearing storage...');
        clearArticles();
        localStorage.setItem('worldnews_version', STORAGE_VERSION);
    }

    allArticles = getStoredArticles();

    // 以前の不具合で「英語のまま翻訳済フラグが立ってしまった」記事をクリーンアップ
    const containsJapanese = (t) => /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(t);
    const hasBadArticles = allArticles.some(a => a.lang === 'en' && a.translated && !containsJapanese(a.title));

    if (hasBadArticles) {
        console.log('[Init] Cleaning up bad translation states...');
        allArticles = allArticles.map(a => {
            if (a.lang === 'en' && a.translated && !containsJapanese(a.title)) {
                return { ...a, translated: false };
            }
            return a;
        });
        saveArticles(allArticles);
    }

    if (allArticles.length > 0) {
        renderArticles(allArticles);
        renderStats(allArticles);
    } else {
        renderSkeletons();
    }

    renderFilters();
    refreshBtn.addEventListener('click', refreshNews);

    // リセットボタンの初期化
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm('ローカルキャッシュをクリアして再読み込みしますか？')) {
                clearArticles();
                location.reload();
            }
        });
    }

    if (allArticles.length === 0) refreshNews();
    console.log('[Init] App initialized.');
}

try {
    init();
} catch (e) {
    console.error('[App] Fatal error during init:', e);
}
