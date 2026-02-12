'use client';

import { useState, useEffect, useRef } from 'react';

// ========== Types ==========
interface Site {
    id: string;
    name: string;
    slug: string;
}

interface User {
    id: string;
    email: string;
    role: string;
}

interface SiteConfig {
    siteId: string;
    siteName: string;
    siteSlug: string;
    category: string;
    kwCount: number;
    color: string;
}

interface KeywordItem {
    keyword: string;
    difficulty: string;
    siteId: string;
    siteName: string;
    siteSlug: string;
    checked: boolean;
}

interface TitleItem {
    keyword: string;
    title: string;
    siteId: string;
    siteName: string;
    siteSlug: string;
    category: string;
    checked: boolean;
}

interface ImageItem {
    url: string;
    thumbnail: string;
    alt: string;
    photographer: string;
}

interface ArticleImages {
    [position: string]: {
        selected: ImageItem;
        candidates: ImageItem[];
    };
}

interface Article {
    title: string;
    content: string;
    category: string;
    slug: string;
    scheduledDate: string;
    faq: Array<{ q: string; a: string }>;
    description?: string;
    tags?: string[];
    imageKeywords: Record<string, string>;
    images: ArticleImages;
    siteId: string;
    siteSlug: string;
    siteName: string;
    dbId?: string;
}

const SITE_COLORS = ['#D4A5A5', '#A5C4D4', '#B5D4A5', '#D4C4A5', '#C4A5D4', '#A5D4C4'];

const SITE_CATEGORIES: Record<string, Array<{ value: string; label: string }>> = {
    bible: [
        { value: '每日靈修', label: '🕊️ 每日靈修' },
        { value: '經文解釋', label: '📖 經文解釋' },
        { value: '信仰問答', label: '❓ 信仰問答' },
    ],
    chparenting: [
        { value: "育兒崩潰", label: "🔥 育兒崩潰" },
        { value: "媽媽情緒", label: "💛 媽媽情緒" },
        { value: "親子關係", label: "👩‍👧 親子關係" },
        { value: "生活實用", label: "✨ 生活實用" },
    ],    mommystartup: [
        { value: 'marketing', label: '📣 行銷' },
        { value: 'group-buying', label: '🛒 團購' },
        { value: 'parenting', label: '👶 育兒' },
    ],
    veganote: [
    { value: 'AI', label: '🤖 AI' },
    { value: '行銷', label: '📈 行銷' },
    { value: '開發', label: '💻 開發' },
    { value: '生活', label: '🌱 生活' },
],
};

const IMAGE_LABELS: Record<string, string> = {
    cover: '📷 封面圖',
};

// ========== Markdown → HTML ==========
function markdownToHtml(md: string): string {
    let html = md;

    // Tables first
    html = html.replace(
        /((?:^\|.+\|[ \t]*\n)+)/gm,
        (tableBlock: string) => {
            const rows = tableBlock.trim().split('\n').filter((r: string) => r.trim());
            if (rows.length < 2) return tableBlock;
            const isSeparator = /^\|[\s\-:|]+\|$/.test(rows[1].trim());
            if (!isSeparator) return tableBlock;
            const parseRow = (row: string): string[] =>
                row.split('|').slice(1, -1).map((cell: string) => cell.trim());
            const headers = parseRow(rows[0]);
            const dataRows = rows.slice(2);
            let t = '<div class="table-wrapper"><table class="preview-table"><thead><tr>';
            headers.forEach((h: string) => { t += `<th>${h}</th>`; });
            t += '</tr></thead><tbody>';
            dataRows.forEach((row: string) => {
                const cells = parseRow(row);
                t += '<tr>';
                cells.forEach((c: string) => { t += `<td>${c}</td>`; });
                t += '</tr>';
            });
            t += '</tbody></table></div>';
            return t;
        }
    );

    html = html.replace(/^### (.+)$/gm, '<h3 class="preview-h3">$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2 class="preview-h2">$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1 class="preview-h1">$1</h1>');
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="preview-img" />');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    html = html.replace(/^> (.+)$/gm, '<blockquote class="preview-quote">$1</blockquote>');
    html = html.replace(/^- (.+)$/gm, '<li class="preview-li">$1</li>');
    html = html.replace(/^---$/gm, '<hr />');

    const blocks = html.split(/\n\n+/);
    html = blocks
        .map((block) => {
            const trimmed = block.trim();
            if (!trimmed) return '';
            if (
                trimmed.startsWith('<h') || trimmed.startsWith('<img') ||
                trimmed.startsWith('<blockquote') || trimmed.startsWith('<hr') ||
                trimmed.startsWith('<div class="table-wrapper"') ||
                trimmed.startsWith('<table') || trimmed.startsWith('<li')
            ) {
                if (trimmed.startsWith('<li')) return `<ul class="preview-ul">${trimmed}</ul>`;
                return trimmed;
            }
            return `<p>${trimmed.replace(/\n/g, '<br />')}</p>`;
        })
        .join('\n');

    return html;
}

function extractTOC(content: string): Array<{ level: number; text: string }> {
    const toc: Array<{ level: number; text: string }> = [];
    const lines = content.split('\n');
    for (const line of lines) {
        const h3 = line.match(/^### (.+)$/);
        const h2 = line.match(/^## (.+)$/);
        if (h3) toc.push({ level: 3, text: h3[1].trim() });
        else if (h2) toc.push({ level: 2, text: h2[1].trim() });
    }
    return toc;
}

function generateSlug(title: string): string {
    return title
        .toLowerCase()
        .replace(/[^\w\s\u4e00-\u9fff-]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 50) + '-' + Date.now().toString(36);
}

// ========== Main Component ==========
export default function BatchPage() {
    const [user, setUser] = useState<User | null>(null);
    const [sites, setSites] = useState<Site[]>([]);
    const [step, setStep] = useState(0); // 0=loading, 1=select sites, 2=keywords, 3=titles, 4=generating, 5=preview

    // Step 1: Site configs
    const [siteConfigs, setSiteConfigs] = useState<SiteConfig[]>([]);

    // Step 2: Keywords
    const [keywords, setKeywords] = useState<KeywordItem[]>([]);
    const [kwLoading, setKwLoading] = useState(false);

    // Step 3: Titles
    const [titles, setTitles] = useState<TitleItem[]>([]);
    const [titleLoading, setTitleLoading] = useState(false);

    // Step 4-5: Articles
    const [articles, setArticles] = useState<Article[]>([]);
    const [articleLength, setArticleLength] = useState('medium');
    const [includeImages, setIncludeImages] = useState(true);
    const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, title: '' });
    const [batchRunning, setBatchRunning] = useState(false);
    const batchRunningRef = useRef(false);

    // Schedule
    const [scheduleStart, setScheduleStart] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return d.toISOString().split('T')[0];
    });
    const [scheduleInterval, setScheduleInterval] = useState(2);

    // UI
    const [status, setStatus] = useState({ type: '', message: '' });
    const [loading, setLoading] = useState(false);
    const [articleTabs, setArticleTabs] = useState<Record<number, 'preview' | 'markdown'>>({});
    const [imageModal, setImageModal] = useState<{ articleIndex: number; position: string } | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchLoading, setSearchLoading] = useState(false);
    const [downloadFormat, setDownloadFormat] = useState<'md' | 'word'>('md');

    // Internal links cache
    const [siteArticlesCache, setSiteArticlesCache] = useState<Record<string, any[]>>({});

    // Supabase batch persistence
    const [batchId, setBatchId] = useState<string | null>(null);

    useEffect(() => {
        checkAuth();
    }, []);

    async function checkAuth() {
        try {
            const res = await fetch('/api/auth/me');
            if (res.ok) {
                const data = await res.json();
                setUser(data.user);
                setSites(data.sites || []);
                setStep(1);
            } else {
                window.location.href = '/';
            }
        } catch {
            window.location.href = '/';
        }
    }

    function getTab(idx: number): 'preview' | 'markdown' {
        return articleTabs[idx] || 'preview';
    }

    function setTab(idx: number, tab: 'preview' | 'markdown') {
        setArticleTabs((prev) => ({ ...prev, [idx]: tab }));
    }

    // ========== Step 1: Site Selection ==========
    function toggleSite(site: Site) {
        setSiteConfigs((prev) => {
            const exists = prev.find((sc) => sc.siteId === site.id);
            if (exists) {
                return prev.filter((sc) => sc.siteId !== site.id);
            } else {
                return [
                    ...prev,
                    {
                        siteId: site.id,
                        siteName: site.name,
                        siteSlug: site.slug,
                        category: '',
                        kwCount: 10,
                        color: SITE_COLORS[prev.length % SITE_COLORS.length],
                    },
                ];
            }
        });
    }

    function updateSiteConfig(siteId: string, field: keyof SiteConfig, value: any) {
        setSiteConfigs((prev) =>
            prev.map((sc) => (sc.siteId === siteId ? { ...sc, [field]: value } : sc))
        );
    }

    // ========== Step 2: Keywords ==========
    async function generateAllKeywords() {
        if (siteConfigs.length === 0) {
            setStatus({ type: 'error', message: '請先選擇至少一個網站' });
            return;
        }
        setKwLoading(true);
        setStatus({ type: 'info', message: 'AI 正在為各網站規劃關鍵字...' });
        setKeywords([]);

        const allKeywords: KeywordItem[] = [];

        for (const config of siteConfigs) {
            try {
                const res = await fetch('/api/keywords', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ category: config.category, count: config.kwCount, siteSlug: config.siteSlug }),
                });
                const data = await res.json();
                if (data.keywords) {
                    const siteKws = data.keywords.map((kw: any) => ({
                        keyword: kw.keyword,
                        difficulty: kw.difficulty,
                        siteId: config.siteId,
                        siteName: config.siteName,
                        siteSlug: config.siteSlug,
                        checked: true,
                    }));
                    allKeywords.push(...siteKws);
                }
            } catch { }
        }

        setKeywords(allKeywords);
        setKwLoading(false);
        setStep(2);
        setStatus({ type: 'success', message: `成功產生 ${allKeywords.length} 個關鍵字！` });
        // Create batch + save keywords
        try {
            const batchRes = await fetch('/api/batch/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'batch', siteIds: siteConfigs.map((sc) => sc.siteId) }),
            });
            const batchData = await batchRes.json();
            if (batchRes.ok) {
                const newBatchId = batchData.batch.id;
                setBatchId(newBatchId);
                fetch('/api/batch/keywords', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ batchId: newBatchId, keywords: allKeywords }),
                }).catch(() => { });
            }
        } catch { }
    }

    function toggleKeyword(idx: number) {
        setKeywords((prev) => {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], checked: !updated[idx].checked };
            return updated;
        });
    }

    function toggleAllKeywordsForSite(siteId: string, checked: boolean) {
        setKeywords((prev) =>
            prev.map((kw) => (kw.siteId === siteId ? { ...kw, checked } : kw))
        );
    }

    // ========== Step 3: Titles ==========
    async function generateAllTitles() {
        const selectedKws = keywords.filter((kw) => kw.checked);
        if (selectedKws.length === 0) {
            setStatus({ type: 'error', message: '請先選擇至少一個關鍵字' });
            return;
        }
        setTitleLoading(true);
        setStatus({ type: 'info', message: 'AI 正在生成標題（排除已有標題）...' });
        setTitles([]);

        // Fetch existing titles for dedup
        const allSiteIds = Array.from(new Set(selectedKws.map((kw) => kw.siteId)));
        let existingTitles: string[] = [];
        try {
            const etRes = await fetch('/api/batch/existing-titles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteIds: allSiteIds }),
            });
            const etData = await etRes.json();
            existingTitles = etData.existingTitles || [];
        } catch { }

        // Group by site
        const grouped: Record<string, KeywordItem[]> = {};
        selectedKws.forEach((kw) => {
            if (!grouped[kw.siteId]) grouped[kw.siteId] = [];
            grouped[kw.siteId].push(kw);
        });

        const allTitles: TitleItem[] = [];

        for (const [siteId, kws] of Object.entries(grouped)) {
            try {
                const res = await fetch('/api/titles', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ keywords: kws.map((k) => k.keyword), existingTitles }),
                });
                const data = await res.json();
                if (data.titles) {
                    const config = siteConfigs.find((sc) => sc.siteId === siteId);
                    const siteTitles = data.titles.map((t: any) => ({
                        keyword: t.keyword,
                        title: t.title,
                        siteId,
                        siteName: config?.siteName || '',
                        siteSlug: config?.siteSlug || '',
                        category: config?.category || '',
                        checked: true,
                    }));
                    allTitles.push(...siteTitles);
                }
            } catch { }
        }

        setTitles(allTitles);
        setTitleLoading(false);
        setStep(3);
        setStatus({ type: 'success', message: `成功產生 ${allTitles.length} 個標題！` });
        // Save titles to Supabase
        if (batchId) {
            fetch('/api/batch/titles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ batchId, titles: allTitles }),
            }).catch(() => { });
        }
    }

    function skipToTitles() {
        // Skip keywords, go directly to manual title input
        setStep(3);
        setTitles([]);
    }

    function addManualTitles(text: string) {
        const lines = text.split('\n').filter((l) => l.trim());
        if (lines.length === 0) return;
        const defaultConfig = siteConfigs[0];
        const manualTitles: TitleItem[] = lines.map((line) => ({
            keyword: '自訂',
            title: line.trim(),
            siteId: defaultConfig?.siteId || '',
            siteName: defaultConfig?.siteName || '',
            siteSlug: defaultConfig?.siteSlug || '',
            category: defaultConfig?.category || '',
            checked: true,
        }));
        setTitles(manualTitles);
    }

    function updateTitle(idx: number, field: keyof TitleItem, value: any) {
        setTitles((prev) => {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], [field]: value };
            return updated;
        });
    }

    // ========== Step 4: Generate Articles ==========
    async function fetchSiteArticles(siteId: string) {
        if (siteArticlesCache[siteId]) return siteArticlesCache[siteId];
        try {
            const res = await fetch('/api/articles/list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteId }),
            });
            const data = await res.json();
            const articles = data.articles || [];
            setSiteArticlesCache((prev) => ({ ...prev, [siteId]: articles }));
            return articles;
        } catch {
            return [];
        }
    }

    async function startGeneration() {
        const selectedTitles = titles.filter((t) => t.checked);
        if (selectedTitles.length === 0) {
            setStatus({ type: 'error', message: '請先選擇至少一個標題' });
            return;
        }

        setBatchRunning(true);
        batchRunningRef.current = true;
        setBatchProgress({ current: 0, total: selectedTitles.length, title: '' });
        setStep(4);
        setArticles([]);

        const lengthGuide: Record<string, string> = {
            medium: '2000-2500字',
            long: '2500-3000字',
            extra: '3000字以上，內容要非常充實',
        };

        // Pre-fetch internal links
        const uniqueSiteIds = Array.from(new Set(selectedTitles.map((t) => t.siteId)));
        const siteArticlesMap: Record<string, any[]> = {};
        await Promise.all(
            uniqueSiteIds.map(async (siteId) => {
                siteArticlesMap[siteId] = await fetchSiteArticles(siteId);
            })
        );

        const newArticles: Article[] = [];
        const concurrency = 3;

        for (let i = 0; i < selectedTitles.length; i += concurrency) {
            if (!batchRunningRef.current) break;
            const batch = selectedTitles.slice(i, i + concurrency);

            const results = await Promise.allSettled(
                batch.map(async (t, batchIdx) => {
                    const globalIdx = i + batchIdx;
                    setBatchProgress({ current: globalIdx + 1, total: selectedTitles.length, title: t.title });

                    const res = await fetch('/api/article', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            title: t.title,
                            category: t.category,
                            length: lengthGuide[articleLength],
                            includeImages,
                            siteSlug: t.siteSlug,
                            existingArticles: siteArticlesMap[t.siteId] || [],
                        }),
                    });

                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error);

                    const startDate = new Date(scheduleStart);
                    startDate.setDate(startDate.getDate() + globalIdx * scheduleInterval);

                    return {
                        title: t.title,
                        content: data.content,
                        category: t.category,
                        slug: generateSlug(t.title),
                        scheduledDate: startDate.toISOString().split('T')[0],
                        faq: data.faq || [],
                        description: data.description || "",
                        tags: data.tags || [],
                        imageKeywords: data.imageKeywords || {},
                        images: data.images || {},
                        siteId: t.siteId,
                        siteSlug: t.siteSlug,
                        siteName: t.siteName,
                    } as Article;
                })
            );

            for (const r of results) {
                if (r.status === 'fulfilled') {
                    const art = r.value;
                    // Save to Supabase
                    if (batchId) {
                        try {
                            const saveRes = await fetch('/api/batch/articles', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ batchId, article: art }),
                            });
                            const saveData = await saveRes.json();
                            if (saveRes.ok) art.dbId = saveData.article.id;
                        } catch { }
                    }
                    newArticles.push(art);
                }
                if (r.status === 'rejected') console.error('Article generation failed:', r.reason);
            }

            if (i + concurrency < selectedTitles.length) {
                await new Promise((r) => setTimeout(r, 5000));
            }
        }

        setArticles(newArticles);
        setBatchRunning(false);
        batchRunningRef.current = false;
        setStep(5);
        setStatus({ type: 'success', message: `成功產生 ${newArticles.length} 篇文章！` });
    }

    // ========== Article Tools ==========
    function generateMarkdown(article: Article): string {
        const date = article.scheduledDate || new Date().toISOString().split('T')[0];
        const coverImage = article.images?.cover?.selected?.url || '';
        const coverAlt = article.images?.cover?.selected?.alt || article.title;

        let content = article.content;

        const h2Pattern = /^## [一二三四五六七八九十]/gm;
        const h2Matches = Array.from(content.matchAll(h2Pattern));
        const imagePositions: string[] = [];

        for (let idx = 0; idx < Math.min(h2Matches.length, 3); idx++) {
            const pos = imagePositions[idx];
            const imgData = article.images?.[pos]?.selected;
            if (!imgData?.url) continue;
            const imgMarkdown = `\n\n![${imgData.alt}](${imgData.url})\n`;
            const endIdx = h2Matches[idx + 1]?.index || content.length;
            content = content.slice(0, endIdx) + imgMarkdown + content.slice(endIdx);
        }

        const faqYaml = article.faq
            .map((f) => `  - q: "${f.q.replace(/"/g, '\\"')}"\n    a: "${f.a.replace(/"/g, '\\"')}"`)
            .join('\n');

        return `---
title: "${article.title.replace(/"/g, '\\"')}"
description: "${(article.description || article.title).replace(/"/g, '\\"')}"
publishDate: ${date}
category: "${article.category}"
tags: [${(article.tags || []).map(t => `"${t}"`).join(", ")}]
image: "${coverImage}"
imageAlt: "${coverAlt.replace(/"/g, '\\"')}"
faq:
${faqYaml}
author: "${({"chparenting":"薇佳媽咪","bible":"恩典小編","mommystartup":"媽咪小編","veganote":"Vega"} as Record<string,string>)[(article.siteSlug || "") as string] || "編輯部"}"
---

${content}`;
    }

    function updateArticleContent(idx: number, newContent: string) {
        setArticles((prev) => {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], content: newContent };
            return updated;
        });
    }

    function downloadMarkdown(article: Article) {
        const content = generateMarkdown(article);
        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${article.slug}.md`;
        a.click();
        URL.revokeObjectURL(url);
    }

    async function downloadWord(article: Article) {
        setStatus({ type: 'info', message: '轉換 Word 中...' });
        try {
            const res = await fetch('/api/download/word', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: article.title,
                    markdown: generateMarkdown(article),
                }),
            });
            if (!res.ok) throw new Error('轉換失敗');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${article.slug}.docx`;
            a.click();
            URL.revokeObjectURL(url);
            setStatus({ type: 'success', message: '已下載 Word 檔' });
        } catch {
            setStatus({ type: 'error', message: 'Word 轉換失敗' });
        }
    }

    async function downloadAll() {
        for (const article of articles) {
            if (downloadFormat === 'word') {
                await downloadWord(article);
                await new Promise((r) => setTimeout(r, 500));
            } else {
                downloadMarkdown(article);
            }
        }
        setStatus({ type: 'success', message: `已下載 ${articles.length} 篇（${downloadFormat === 'word' ? 'Word' : 'Markdown'}）` });
    }

    async function uploadToGitHub() {
        setLoading(true);
        setStatus({ type: 'info', message: '推送到 GitHub...' });
        let successCount = 0;

        for (const article of articles) {
            try {
                const res = await fetch('/api/upload/github', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        siteId: article.siteId,
                        filename: `${article.slug}.md`,
                        content: generateMarkdown(article),
                    }),
                });
                if (res.ok) successCount++;
                await new Promise((r) => setTimeout(r, 1000));
                // Mark pushed in Supabase
                if (res.ok && article.dbId) {
                    fetch(`/api/batch/articles/${article.dbId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ githubPushed: true, status: 'published' }),
                    }).catch(() => { });
                }
            } catch { }
        }

        setLoading(false);
        setStatus({
            type: successCount === articles.length ? 'success' : 'error',
            message: `成功推送 ${successCount}/${articles.length} 篇到 GitHub`,
        });
    }

    // ========== Image Tools ==========
    function randomSwapImage(articleIndex: number, position: string) {
        const updated = [...articles];
        const posData = updated[articleIndex].images[position];
        if (!posData?.candidates?.length) return;
        const others = posData.candidates.filter((c) => c.url !== posData.selected.url);
        if (others.length === 0) return;
        posData.selected = others[Math.floor(Math.random() * others.length)];
        setArticles(updated);
    }

    function selectImage(articleIndex: number, position: string, candidate: ImageItem) {
        const updated = [...articles];
        updated[articleIndex].images[position].selected = candidate;
        setArticles(updated);
        setImageModal(null);
    }

    async function researchImages(articleIndex: number, position: string, query: string) {
        if (!query.trim()) return;
        setSearchLoading(true);
        try {
            const res = await fetch('/api/images/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query.trim() }),
            });
            const data = await res.json();
            if (data.candidates?.length) {
                const updated = [...articles];
                updated[articleIndex].images[position] = {
                    selected: data.candidates[0],
                    candidates: data.candidates,
                };
                updated[articleIndex].imageKeywords[position] = query.trim();
                setArticles(updated);
            }
        } catch { }
        setSearchLoading(false);
    }

    // ========== Helpers ==========
    function getArticlesBySite(): Record<string, Article[]> {
        const grouped: Record<string, Article[]> = {};
        articles.forEach((a) => {
            const key = a.siteName || '未分類';
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(a);
        });
        return grouped;
    }

    function getKeywordsBySite(): Record<string, KeywordItem[]> {
        const grouped: Record<string, KeywordItem[]> = {};
        keywords.forEach((kw) => {
            if (!grouped[kw.siteId]) grouped[kw.siteId] = [];
            grouped[kw.siteId].push(kw);
        });
        return grouped;
    }

    function getTitlesBySite(): Record<string, TitleItem[]> {
        const grouped: Record<string, TitleItem[]> = {};
        titles.forEach((t) => {
            if (!grouped[t.siteId]) grouped[t.siteId] = [];
            grouped[t.siteId].push(t);
        });
        return grouped;
    }

    function getSiteColor(siteId: string): string {
        const config = siteConfigs.find((sc) => sc.siteId === siteId);
        return config?.color || '#D4A5A5';
    }

    // ========== RENDER ==========
    if (step === 0) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="loading-spinner" style={{ borderTopColor: 'var(--primary)' }} />
            </div>
        );
    }

    return (
        <>
            <header className="header">
                <div className="header-content">
                    <h1>📦 多網站批量產文</h1>
                    <div className="header-user">
                        <a href="/" className="btn btn-secondary btn-sm">← 回首頁</a>
                        <span style={{ fontSize: 13 }}>{user?.email}</span>
                    </div>
                </div>
            </header>

            <div className="container">
                {/* Workflow */}
                <div className="workflow">
                    <div className={`workflow-step ${step >= 1 ? (step > 1 ? 'done' : 'active') : ''}`}>1. 選網站</div>
                    <span className="workflow-arrow">→</span>
                    <div className={`workflow-step ${step >= 2 ? (step > 2 ? 'done' : 'active') : ''}`}>2. 關鍵字</div>
                    <span className="workflow-arrow">→</span>
                    <div className={`workflow-step ${step >= 3 ? (step > 3 ? 'done' : 'active') : ''}`}>3. 標題</div>
                    <span className="workflow-arrow">→</span>
                    <div className={`workflow-step ${step >= 4 ? (step > 4 ? 'done' : 'active') : ''}`}>4. 產文</div>
                    <span className="workflow-arrow">→</span>
                    <div className={`workflow-step ${step >= 5 ? 'active' : ''}`}>5. 預覽發布</div>
                </div>

                {status.message && <div className={`status status-${status.type}`}>{status.message}</div>}

                {/* ========== Step 1: Select Sites ========== */}
                {step === 1 && (
                    <>
                        <div className="card">
                            <h3>🌐 選擇要產文的網站（可多選）</h3>
                            <div className="batch-site-select">
                                {sites.map((site, i) => {
                                    const isSelected = siteConfigs.some((sc) => sc.siteId === site.id);
                                    return (
                                        <div
                                            key={site.id}
                                            className={`batch-site-item ${isSelected ? 'selected' : ''}`}
                                            onClick={() => toggleSite(site)}
                                        >
                                            <input type="checkbox" checked={isSelected} readOnly />
                                            <div>
                                                <div style={{ fontWeight: 600 }}>{site.name}</div>
                                                <div style={{ fontSize: 12, color: 'var(--text-light)' }}>{site.slug}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Site configs */}
                        {siteConfigs.length > 0 && (
                            <div className="card">
                                <h3>⚙️ 各網站設定</h3>
                                {siteConfigs.map((config) => (
                                    <div className="batch-site-config" key={config.siteId}>
                                        <div className="batch-site-config-header">
                                            <span className="batch-site-tag" style={{ background: config.color }}>{config.siteName}</span>
                                        </div>
                                        <div className="form-row">
                                            <div className="form-group" style={{ marginBottom: 0 }}>
                                                <label>分類</label>
                                                <select
                                                    value={config.category}
                                                    onChange={(e) => updateSiteConfig(config.siteId, 'category', e.target.value)}
                                                >
                                                    <option value="">-- 選擇分類 --</option>
                                                    {(SITE_CATEGORIES[config.siteSlug] || []).map((cat) => (
                                                        <option key={cat.value} value={cat.value}>{cat.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="form-group" style={{ marginBottom: 0 }}>
                                                <label>關鍵字數量</label>
                                                <select
                                                    value={config.kwCount}
                                                    onChange={(e) => updateSiteConfig(config.siteId, 'kwCount', Number(e.target.value))}
                                                >
                                                    <option value={5}>5 個</option>
                                                    <option value={10}>10 個</option>
                                                    <option value={15}>15 個</option>
                                                    <option value={20}>20 個</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                <div className="btn-group" style={{ marginTop: 20 }}>
                                    <button className="btn btn-primary" onClick={generateAllKeywords} disabled={kwLoading}>
                                        {kwLoading ? (<><span className="loading-spinner" /> 產生中...</>) : '🔍 批量產生關鍵字'}
                                    </button>
                                    <button className="btn btn-secondary" onClick={skipToTitles}>
                                        ⏭️ 跳過，直接輸入標題
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* ========== Step 2: Keywords ========== */}
                {step === 2 && (
                    <>
                        {Object.entries(getKeywordsBySite()).map(([siteId, siteKws]) => {
                            const checkedCount = siteKws.filter((kw) => kw.checked).length;
                            const globalStartIdx = keywords.findIndex((kw) => kw.siteId === siteId);
                            return (
                                <div className="batch-kw-section" key={siteId}>
                                    <div className="batch-kw-section-header">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <span className="batch-site-tag" style={{ background: getSiteColor(siteId) }}>
                                                {siteKws[0]?.siteName}
                                            </span>
                                            <span className="batch-kw-count">{checkedCount}/{siteKws.length} 已選</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button className="btn btn-secondary btn-sm" onClick={() => toggleAllKeywordsForSite(siteId, true)}>全選</button>
                                            <button className="btn btn-secondary btn-sm" onClick={() => toggleAllKeywordsForSite(siteId, false)}>取消</button>
                                        </div>
                                    </div>
                                    <div className="items-list" style={{ maxHeight: 250 }}>
                                        {siteKws.map((kw, i) => {
                                            const globalIdx = globalStartIdx + i;
                                            return (
                                                <div className="item" key={globalIdx}>
                                                    <input
                                                        type="checkbox"
                                                        checked={kw.checked}
                                                        onChange={() => toggleKeyword(globalIdx)}
                                                    />
                                                    <div className="item-content">
                                                        <div className="item-title">{kw.keyword}</div>
                                                        <div className="item-meta">{kw.difficulty}</div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}

                        <div className="card">
                            <div className="btn-group">
                                <button className="btn btn-secondary" onClick={() => setStep(1)}>← 上一步</button>
                                <button className="btn btn-primary" onClick={generateAllTitles} disabled={titleLoading}>
                                    {titleLoading ? (<><span className="loading-spinner" /> 產生中...</>) : '✏️ 批量產生標題 →'}
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {/* ========== Step 3: Titles ========== */}
                {step === 3 && (
                    <>
                        {titles.length === 0 ? (
                            <div className="card">
                                <h3>✏️ 輸入標題（每行一個）</h3>
                                <p style={{ fontSize: 13, color: 'var(--text-light)', marginBottom: 12 }}>
                                    標題會分配到第一個選中的網站，產生後可在表格中修改所屬網站
                                </p>
                                <textarea
                                    id="manual-titles"
                                    rows={8}
                                    style={{ width: '100%', padding: 12, border: '1px solid #ddd', borderRadius: 8, fontSize: 14, fontFamily: 'inherit' }}
                                    placeholder={`如何開始讀聖經？\n基督徒可以喝酒嗎？\n0-3歲繪本怎麼選？`}
                                />
                                <div className="btn-group" style={{ marginTop: 15 }}>
                                    <button className="btn btn-secondary" onClick={() => setStep(keywords.length > 0 ? 2 : 1)}>← 上一步</button>
                                    <button className="btn btn-primary" onClick={() => {
                                        const el = document.getElementById('manual-titles') as HTMLTextAreaElement;
                                        if (el?.value.trim()) addManualTitles(el.value);
                                        else setStatus({ type: 'error', message: '請輸入至少一個標題' });
                                    }}>確認標題</button>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Title table */}
                                <div className="card">
                                    <h3>📋 文章標題（{titles.filter((t) => t.checked).length}/{titles.length} 篇已選）</h3>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                                            <thead>
                                                <tr style={{ background: '#f8f0e8' }}>
                                                    <th style={{ padding: '10px 8px', width: 40, border: '1px solid #e5d5c5', textAlign: 'center' }}>✓</th>
                                                    <th style={{ padding: '10px 8px', border: '1px solid #e5d5c5', textAlign: 'left' }}>標題（可編輯）</th>
                                                    <th style={{ padding: '10px 8px', width: 130, border: '1px solid #e5d5c5', textAlign: 'left' }}>網站</th>
                                                    <th style={{ padding: '10px 8px', width: 110, border: '1px solid #e5d5c5', textAlign: 'left' }}>分類</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {titles.map((t, idx) => (
                                                    <tr key={idx} style={{ background: t.checked ? '#fff' : '#f5f5f5' }}>
                                                        <td style={{ padding: 8, textAlign: 'center', border: '1px solid #e8ddd3' }}>
                                                            <input type="checkbox" checked={t.checked} onChange={() => updateTitle(idx, 'checked', !t.checked)} />
                                                        </td>
                                                        <td style={{ padding: 8, border: '1px solid #e8ddd3' }}>
                                                            <input
                                                                type="text"
                                                                value={t.title}
                                                                onChange={(e) => updateTitle(idx, 'title', e.target.value)}
                                                                style={{ width: '100%', padding: '6px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 14 }}
                                                            />
                                                        </td>
                                                        <td style={{ padding: 8, border: '1px solid #e8ddd3' }}>
                                                            <select
                                                                value={t.siteId}
                                                                onChange={(e) => {
                                                                    const site = sites.find((s) => s.id === e.target.value);
                                                                    const config = siteConfigs.find((sc) => sc.siteId === e.target.value);
                                                                    updateTitle(idx, 'siteId', e.target.value);
                                                                    if (site) updateTitle(idx, 'siteName', site.name);
                                                                    if (site) updateTitle(idx, 'siteSlug', site.slug);
                                                                    if (config) updateTitle(idx, 'category', config.category);
                                                                }}
                                                                style={{ width: '100%', padding: 6, borderRadius: 4, fontSize: 13 }}
                                                            >
                                                                {siteConfigs.map((sc) => (
                                                                    <option key={sc.siteId} value={sc.siteId}>{sc.siteName}</option>
                                                                ))}
                                                            </select>
                                                        </td>
                                                        <td style={{ padding: 8, border: '1px solid #e8ddd3' }}>
                                                            <select
                                                                value={t.category}
                                                                onChange={(e) => updateTitle(idx, 'category', e.target.value)}
                                                                style={{ width: '100%', padding: 6, borderRadius: 4, fontSize: 13 }}
                                                            >
                                                                <option value="">--</option>
                                                                {(SITE_CATEGORIES[t.siteSlug] || []).map((cat) => (
                                                                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                                                                ))}
                                                            </select>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Settings */}
                                <div className="card">
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>文章長度</label>
                                            <select value={articleLength} onChange={(e) => setArticleLength(e.target.value)}>
                                                <option value="medium">標準（2000-2500字）</option>
                                                <option value="long">長篇（2500-3000字）</option>
                                                <option value="extra">深度（3000字以上）</option>
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label>包含圖片</label>
                                            <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                                                <input type="checkbox" checked={includeImages} onChange={(e) => setIncludeImages(e.target.checked)} />
                                                <span style={{fontSize:"13px",color:"#888"}}>{includeImages ? "產文含配圖" : "純文字，不搜圖"}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="schedule-box">
                                        <h4>📅 排程發布</h4>
                                        <p className="schedule-desc">文章會自動分配未來日期，搭配自動部署，實現定時上線。</p>
                                        <div className="form-row">
                                            <div className="form-group" style={{ marginBottom: 0 }}>
                                                <label>開始日期</label>
                                                <input type="date" value={scheduleStart} onChange={(e) => setScheduleStart(e.target.value)} />
                                            </div>
                                            <div className="form-group" style={{ marginBottom: 0 }}>
                                                <label>每隔幾天發一篇</label>
                                                <select value={scheduleInterval} onChange={(e) => setScheduleInterval(Number(e.target.value))}>
                                                    <option value={1}>每天 1 篇</option>
                                                    <option value={2}>每 2 天 1 篇</option>
                                                    <option value={3}>每 3 天 1 篇</option>
                                                    <option value={7}>每週 1 篇</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="schedule-preview">
                                            <strong>排程預覽：</strong>
                                            {(() => {
                                                const count = titles.filter((t) => t.checked).length;
                                                const start = new Date(scheduleStart);
                                                const end = new Date(scheduleStart);
                                                end.setDate(end.getDate() + (count - 1) * scheduleInterval);
                                                return ` ${count} 篇，${start.toLocaleDateString('zh-TW')} ~ ${end.toLocaleDateString('zh-TW')}`;
                                            })()}
                                        </div>
                                    </div>

                                    <div className="btn-group" style={{ marginTop: 20 }}>
                                        <button className="btn btn-secondary" onClick={() => setStep(keywords.length > 0 ? 2 : 1)}>← 上一步</button>
                                        <button className="btn btn-primary" onClick={startGeneration}>
                                            🚀 開始產生（{titles.filter((t) => t.checked).length} 篇，並行 3 篇）
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </>
                )}

                {/* ========== Step 4: Progress ========== */}
                {step === 4 && (
                    <div className="card">
                        <h3>⏳ 批量產文中...{includeImages ? "（含圖片搜尋）" : "（純文字）"}</h3>
                        <div style={{ marginBottom: 20 }}>
                            <div className="progress-bar">
                                <div
                                    className="progress-fill"
                                    style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                                />
                            </div>
                            <p style={{ textAlign: 'center', marginTop: 10 }}>
                                {batchProgress.current} / {batchProgress.total} — {batchProgress.title}
                            </p>
                        </div>
                        <button className="btn btn-danger" onClick={() => { setBatchRunning(false); batchRunningRef.current = false; }}>⏹️ 停止</button>
                    </div>
                )}

                {/* ========== Step 5: Preview ========== */}
                {step === 5 && (
                    <>
                        {/* Summary */}
                        <div className="card">
                            <h3>✅ 產生完成！共 {articles.length} 篇</h3>
                            <div style={{ fontSize: 13, color: 'var(--text-light)', marginBottom: 5 }}>
                                {Object.entries(getArticlesBySite()).map(([siteName, arts]) => (
                                    <span key={siteName} style={{ marginRight: 15 }}>
                                        🏷️ {siteName}：{arts.length} 篇
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Each article */}
                        {articles.map((article, articleIdx) => {
                            const tab = getTab(articleIdx);
                            const toc = extractTOC(article.content);
                             if (article.faq && article.faq.length > 0) {
                            toc.push({ level: 2, text: '❓ 常見問題 FAQ' });
                          }
                            return (
                                <div className="card" key={articleIdx}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 15 }}>
                                        <div>
                                            <h3 style={{ fontSize: 18, marginBottom: 6 }}>📄 {article.title}</h3>
                                            <div style={{ fontSize: 13, color: 'var(--text-light)' }}>
                                                📅 {article.scheduledDate} &nbsp;|&nbsp; 📁 {article.category}
                                                &nbsp;|&nbsp;
                                                <span className="batch-site-tag" style={{ background: getSiteColor(article.siteId), fontSize: 11, padding: '2px 8px' }}>
                                                    {article.siteName}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="batch-download-group">
                                            <button className="btn btn-secondary btn-sm" onClick={() => downloadMarkdown(article)}>📥 MD</button>
                                            <button className="btn btn-secondary btn-sm" onClick={() => downloadWord(article)}>📥 Word</button>
                                        </div>
                                    </div>

                                    {/* Images */}
                                    <div className="image-grid">
                                        {['cover'].map((pos) => {
                                            const imgData = article.images?.[pos];
                                            const selected = imgData?.selected;
                                            const candidateCount = imgData?.candidates?.length || 0;
                                            return (
                                                <div className="image-slot" key={pos}>
                                                    <div className="image-label">{IMAGE_LABELS[pos]}</div>
                                                    <div className="image-preview" onClick={() => {
                                                        setImageModal({ articleIndex: articleIdx, position: pos });
                                                        setSearchQuery(article.imageKeywords?.[pos] || '');
                                                    }}>
                                                        {selected?.url ? <img src={selected.thumbnail || selected.url} alt={selected.alt} /> : <div className="image-empty">無圖片</div>}
                                                    </div>
                                                    <div className="image-actions">
                                                        <button className="btn btn-secondary btn-sm" onClick={() => randomSwapImage(articleIdx, pos)}>🔄</button>
                                                        {selected?.url && <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); const updated = [...articles]; if (updated[articleIdx].images?.[pos]) { updated[articleIdx].images[pos].selected = undefined as any; } setArticles(updated); }} title="移除此圖">❌</button>}
                                                        <span className="image-count">{candidateCount} 張</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Tabs */}
                                    <div className="article-tabs">
                                        <button className={`article-tab ${tab === 'preview' ? 'active' : ''}`} onClick={() => setTab(articleIdx, 'preview')}>👁️ 預覽</button>
                                        <button className={`article-tab ${tab === 'markdown' ? 'active' : ''}`} onClick={() => setTab(articleIdx, 'markdown')}>📝 編輯</button>
                                    </div>

                                    {tab === 'preview' && (
                                        <div className="article-preview-area">
                                            {toc.length > 0 && (
                                                <div className="preview-toc">
                                                    <div className="preview-toc-title">📑 目錄</div>
                                                    <ul className="preview-toc-list">
                                                        {toc.map((item, i) => (
                                                            <li key={i} className={item.level === 3 ? 'toc-h3' : 'toc-h2'}>{item.text}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                            <div className="preview-body" dangerouslySetInnerHTML={{ __html: markdownToHtml(article.content) }} />
                                            {article.faq.length > 0 && (
                                                <div className="preview-faq">
                                                    <h2 className="preview-h2">❓ 常見問題 FAQ</h2>
                                                    {article.faq.map((f, i) => (
                                                        <div className="faq-item" key={i}>
                                                            <div className="faq-q">Q: {f.q}</div>
                                                            <div className="faq-a">A: {f.a}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {tab === 'markdown' && (
                                        <div className="article-editor-area">
                                            <textarea
                                                className="markdown-editor"
                                                value={article.content}
                                                onChange={(e) => updateArticleContent(articleIdx, e.target.value)}
                                                spellCheck={false}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Batch actions */}
                        <div className="card">
                            <h3>📤 批量操作</h3>
                            <div className="btn-group">
                                <div className="batch-download-group">
                                    <select value={downloadFormat} onChange={(e) => setDownloadFormat(e.target.value as any)}>
                                        <option value="md">Markdown (.md)</option>
                                        <option value="word">Word (.docx)</option>
                                    </select>
                                    <button className="btn btn-primary" onClick={downloadAll}>📥 下載全部</button>
                                </div>
                                <button className="btn btn-success" onClick={uploadToGitHub} disabled={loading}>
                                    {loading ? (<><span className="loading-spinner" /> 推送中...</>) : '🐙 推送到 GitHub（排程發布）'}
                                </button>
                            </div>
                        </div>

                        <div className="btn-group">
                            <button className="btn btn-secondary" onClick={() => { setStep(1); setArticles([]); setTitles([]); setKeywords([]); setSiteConfigs([]); }}>
                                🔄 重新開始
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* Image Modal */}
            {imageModal && (
                <div className="modal-overlay" onClick={() => setImageModal(null)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{IMAGE_LABELS[imageModal.position]} — 候選圖片</h3>
                            <button className="modal-close" onClick={() => setImageModal(null)}>✕</button>
                        </div>
                        <div className="modal-search">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="輸入英文關鍵字重新搜尋..."
                                onKeyDown={(e) => { if (e.key === 'Enter') researchImages(imageModal.articleIndex, imageModal.position, searchQuery); }}
                            />
                            <button className="btn btn-primary btn-sm" onClick={() => researchImages(imageModal.articleIndex, imageModal.position, searchQuery)} disabled={searchLoading}>
                                {searchLoading ? '搜尋中...' : '🔍'}
                            </button>
                        </div>
                        <div className="modal-grid">
                            {articles[imageModal.articleIndex]?.images?.[imageModal.position]?.candidates?.map((candidate, idx) => {
                                const isSelected = candidate.url === articles[imageModal.articleIndex]?.images?.[imageModal.position]?.selected?.url;
                                return (
                                    <div key={idx} className={`modal-image ${isSelected ? 'selected' : ''}`} onClick={() => selectImage(imageModal.articleIndex, imageModal.position, candidate)}>
                                        <img src={candidate.thumbnail} alt={candidate.alt} />
                                        {isSelected && <div className="modal-image-check">✓</div>}
                                        <div className="modal-image-credit">📸 {candidate.photographer}</div>
                                    </div>
                                );
                            })}
                            {(!articles[imageModal.articleIndex]?.images?.[imageModal.position]?.candidates?.length) && (
                                <div style={{ padding: 20, color: 'var(--text-light)', textAlign: 'center', gridColumn: '1/-1' }}>
                                    沒有候選圖片，請輸入關鍵字搜尋
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
