'use client';

import { useState, useEffect } from 'react';

// Types
interface Site {
  id: string;
  name: string;
  slug: string;
  github_repo?: string;
  github_path?: string;
}

interface User {
  id: string;
  email: string;
  role: 'admin' | 'editor';
}

interface Keyword {
  keyword: string;
  difficulty: string;
}

interface Title {
  keyword: string;
  title: string;
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
  imageKeywords: Record<string, string>;
  images: ArticleImages;
  siteId?: string;
  siteSlug?: string;
  siteName?: string;
}

// 多網站批量用
interface BatchTitle {
  title: string;
  siteId: string;
  category: string;
  mode: 'ai' | 'manual';
  manualContent: string;
  checked: boolean;
}

const IMAGE_LABELS: Record<string, string> = {
  cover: '📷 封面圖',
  image1: '🖼️ 段落一配圖',
  image2: '🖼️ 段落二配圖',
  image3: '🖼️ 段落三配圖',
};

// ========== Markdown → HTML（含表格） ==========
function markdownToHtml(md: string): string {
  let html = md;

  // ===== 先處理表格 =====
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

      let tableHtml = '<div class="table-wrapper"><table class="preview-table">';
      tableHtml += '<thead><tr>';
      headers.forEach((h: string) => { tableHtml += `<th>${h}</th>`; });
      tableHtml += '</tr></thead>';
      tableHtml += '<tbody>';
      dataRows.forEach((row: string) => {
        const cells = parseRow(row);
        tableHtml += '<tr>';
        cells.forEach((c: string) => { tableHtml += `<td>${c}</td>`; });
        tableHtml += '</tr>';
      });
      tableHtml += '</tbody></table></div>';
      return tableHtml;
    }
  );

  // H3 before H2
  html = html.replace(/^### (.+)$/gm, '<h3 class="preview-h3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="preview-h2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="preview-h1">$1</h1>');
  // Bold & italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="preview-img" />');
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // Blockquote
  html = html.replace(/^> (.+)$/gm, '<blockquote class="preview-quote">$1</blockquote>');
  // List items
  html = html.replace(/^- (.+)$/gm, '<li class="preview-li">$1</li>');
  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr />');
  // Paragraphs
  const blocks = html.split(/\n\n+/);
  html = blocks
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (
        trimmed.startsWith('<h') ||
        trimmed.startsWith('<img') ||
        trimmed.startsWith('<blockquote') ||
        trimmed.startsWith('<hr') ||
        trimmed.startsWith('<ul') ||
        trimmed.startsWith('<ol') ||
        trimmed.startsWith('<div class="table-wrapper"') ||
        trimmed.startsWith('<table') ||
        trimmed.startsWith('<li')
      ) {
        if (trimmed.startsWith('<li')) {
          return `<ul class="preview-ul">${trimmed}</ul>`;
        }
        return trimmed;
      }
      return `<p>${trimmed.replace(/\n/g, '<br />')}</p>`;
    })
    .join('\n');

  return html;
}

// ========== Extract TOC ==========
function extractTOC(content: string): Array<{ level: number; text: string }> {
  const toc: Array<{ level: number; text: string }> = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const h2 = line.match(/^## (.+)$/);
    const h3 = line.match(/^### (.+)$/);
    if (h3) {
      toc.push({ level: 3, text: h3[1].trim() });
    } else if (h2) {
      toc.push({ level: 2, text: h2[1].trim() });
    }
  }
  return toc;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [currentSite, setCurrentSite] = useState<Site | null>(null);
  const [step, setStep] = useState(0);

  // 模式：'single' = 單網站（原本流程）, 'multi' = 多網站批量
  const [mode, setMode] = useState<'single' | 'multi'>('single');

  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [titles, setTitles] = useState<Title[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });

  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [category, setCategory] = useState('行銷');
  const [kwCount, setKwCount] = useState(20);
  const [articleLength, setArticleLength] = useState('medium');
  const [batchDelay, setBatchDelay] = useState(30);

  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, title: '' });
  const [batchRunning, setBatchRunning] = useState(false);

  // 排程發布
  const [scheduleStart, setScheduleStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [scheduleInterval, setScheduleInterval] = useState(2);

  const [imageModal, setImageModal] = useState<{ articleIndex: number; position: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);

  // 每篇文章的 tab 狀態
  const [articleTabs, setArticleTabs] = useState<Record<number, 'preview' | 'markdown'>>({});

  // ========== 多網站批量 ==========
  const [batchTitles, setBatchTitles] = useState<BatchTitle[]>([]);
  const [batchInput, setBatchInput] = useState('');

  // 內部連結快取
  const [siteArticlesCache, setSiteArticlesCache] = useState<Record<string, Array<{ title: string; slug: string; url: string }>>>({});

  useEffect(() => {
    checkAuth();
  }, []);

  function getTab(idx: number): 'preview' | 'markdown' {
    return articleTabs[idx] || 'preview';
  }
  function setTab(idx: number, tab: 'preview' | 'markdown') {
    setArticleTabs((prev) => ({ ...prev, [idx]: tab }));
  }

  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setSites(data.sites || []);
        setStep(1);
      }
    } catch { }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus({ type: '', message: '' });
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '登入失敗');
      setUser(data.user);
      setSites(data.sites || []);
      setStep(1);
      setStatus({ type: 'success', message: '登入成功！' });
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setSites([]);
    setCurrentSite(null);
    setStep(0);
    setMode('single');
  }

  function selectSite(site: Site) {
    setCurrentSite(site);
    setMode('single');
    setCategory(site.slug === 'bible' ? 'daily-devotion' : '');
    setStep(2);
    setKeywords([]);
    setTitles([]);
    setArticles([]);
  }

  function enterMultiMode() {
    setMode('multi');
    setCurrentSite(null);
    setBatchTitles([]);
    setBatchInput('');
    setArticles([]);
    setStep(6);
  }

  // ========== 拉取網站現有文章（內部連結用） ==========
  async function fetchSiteArticles(siteId: string): Promise<Array<{ title: string; slug: string; url: string }>> {
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

  // ========== 單網站流程（原本的） ==========
  async function generateKeywords() {
    setLoading(true);
    setStatus({ type: 'info', message: 'AI 正在規劃關鍵字...' });
    try {
      const res = await fetch('/api/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, count: kwCount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setKeywords(data.keywords);
      setStatus({ type: 'success', message: `成功產生 ${data.keywords.length} 個關鍵字！` });
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function generateTitles() {
    const selected = keywords.filter((_, i) =>
      (document.getElementById(`kw-${i}`) as HTMLInputElement)?.checked
    );
    if (selected.length === 0) {
      setStatus({ type: 'error', message: '請先選擇關鍵字' });
      return;
    }
    setLoading(true);
    setStatus({ type: 'info', message: 'AI 正在生成標題...' });
    try {
      const res = await fetch('/api/titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: selected.map((k) => k.keyword) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTitles(data.titles);
      setStep(3);
      setStatus({ type: 'success', message: `成功生成 ${data.titles.length} 個標題！` });
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  }

  async function startBatchGenerate() {
    const selectedTitles = titles
      .filter((_, i) => {
        const checkbox = document.getElementById(`title-${i}`) as HTMLInputElement;
        return checkbox?.checked;
      })
      .map((t, i) => {
        const input = document.getElementById(`title-input-${i}`) as HTMLInputElement;
        return input?.value || t.title;
      });

    if (selectedTitles.length === 0) {
      setStatus({ type: 'error', message: '請先選擇標題' });
      return;
    }

    setBatchRunning(true);
    setBatchProgress({ current: 0, total: selectedTitles.length, title: '' });
    setStep(4);
    setArticles([]);

    const lengthGuide: Record<string, string> = {
      medium: '2000-2500字',
      long: '2500-3000字',
      extra: '3000字以上，內容要非常充實',
    };

    // 拉取內部連結
    let existingArticles: Array<{ title: string; slug: string; url: string }> = [];
    if (currentSite?.id) {
      existingArticles = await fetchSiteArticles(currentSite.id);
    }

    const newArticles: Article[] = [];

    for (let i = 0; i < selectedTitles.length; i++) {
      const title = selectedTitles[i];
      setBatchProgress({ current: i + 1, total: selectedTitles.length, title });

      try {
        const res = await fetch('/api/article', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            category,
            length: lengthGuide[articleLength],
            siteSlug: currentSite?.slug,
            existingArticles,
          }),
        });

        const data = await res.json();
        if (res.ok) {
          const startDate = new Date(scheduleStart);
          startDate.setDate(startDate.getDate() + i * scheduleInterval);
          const dateStr = startDate.toISOString().split('T')[0];

          newArticles.push({
            title,
            content: data.content,
            category,
            slug: generateSlug(title),
            scheduledDate: dateStr,
            faq: data.faq || [],
            imageKeywords: data.imageKeywords || {},
            images: data.images || {},
            siteId: currentSite?.id,
            siteSlug: currentSite?.slug,
            siteName: currentSite?.name,
          });
        }
      } catch { }

      if (i < selectedTitles.length - 1) {
        await new Promise((r) => setTimeout(r, batchDelay * 1000));
      }
    }

    setArticles(newArticles);
    setBatchRunning(false);
    setStep(5);
    setStatus({ type: 'success', message: `成功產生 ${newArticles.length} 篇文章！` });
  }

  // ========== 多網站批量 ==========
  function parseBatchInput() {
    const lines = batchInput.split('\n').filter((l) => l.trim());
    const defaultSite = sites[0];
    const newBatch: BatchTitle[] = lines.map((line) => ({
      title: line.trim(),
      siteId: defaultSite?.id || '',
      category: '',
      mode: 'ai',
      manualContent: '',
      checked: true,
    }));
    setBatchTitles(newBatch);
  }

  function updateBatchTitle(idx: number, field: keyof BatchTitle, value: any) {
    setBatchTitles((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  }

  async function startMultiBatchGenerate() {
    const selected = batchTitles.filter((bt) => bt.checked);
    if (selected.length === 0) {
      setStatus({ type: 'error', message: '請先勾選要產生的標題' });
      return;
    }

    setBatchRunning(true);
    setBatchProgress({ current: 0, total: selected.length, title: '' });
    setStep(4);
    setArticles([]);

    const lengthGuide: Record<string, string> = {
      medium: '2000-2500字',
      long: '2500-3000字',
      extra: '3000字以上，內容要非常充實',
    };

    // 預先拉取各網站的內部連結
    const uniqueSiteIds = Array.from(new Set(selected.map((bt) => bt.siteId)));
    const siteArticlesMap: Record<string, any[]> = {};
    await Promise.all(
      uniqueSiteIds.map(async (siteId) => {
        siteArticlesMap[siteId] = await fetchSiteArticles(siteId);
      })
    );

    const newArticles: Article[] = [];
    const concurrency = 3;

    // 分批並行（每次 3 篇）
    for (let i = 0; i < selected.length; i += concurrency) {
      const batch = selected.slice(i, i + concurrency);

      const results = await Promise.allSettled(
        batch.map(async (bt, batchIdx) => {
          const globalIdx = i + batchIdx;
          const site = sites.find((s) => s.id === bt.siteId);
          setBatchProgress({ current: globalIdx + 1, total: selected.length, title: bt.title });

          const res = await fetch('/api/article', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: bt.title,
              category: bt.category,
              length: lengthGuide[articleLength],
              siteSlug: site?.slug || '',
              existingArticles: siteArticlesMap[bt.siteId] || [],
              manualContent: bt.mode === 'manual' ? bt.manualContent : undefined,
            }),
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data.error);

          const startDate = new Date(scheduleStart);
          startDate.setDate(startDate.getDate() + globalIdx * scheduleInterval);

          return {
            title: bt.title,
            content: data.content,
            category: bt.category,
            slug: generateSlug(bt.title),
            scheduledDate: startDate.toISOString().split('T')[0],
            faq: data.faq || [],
            imageKeywords: data.imageKeywords || {},
            images: data.images || {},
            siteId: bt.siteId,
            siteSlug: site?.slug,
            siteName: site?.name,
          } as Article;
        })
      );

      results.forEach((r) => {
        if (r.status === 'fulfilled') newArticles.push(r.value);
      });

      // 批次間等待
      if (i + concurrency < selected.length) {
        await new Promise((r) => setTimeout(r, 5000));
      }
    }

    setArticles(newArticles);
    setBatchRunning(false);
    setStep(5);
    setStatus({ type: 'success', message: `成功產生 ${newArticles.length} 篇文章！` });
  }

  // ========== 共用工具函數 ==========
  function generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 50) + '-' + Date.now().toString(36);
  }

  function generateMarkdown(article: Article): string {
    const date = article.scheduledDate || new Date().toISOString().split('T')[0];
    const coverImage = article.images?.cover?.selected?.url || '';
    const coverAlt = article.images?.cover?.selected?.alt || article.title;

    let content = article.content;

    const h2Pattern = /^## [一二三四五六七八九十]/gm;
    const h2Matches = Array.from(content.matchAll(h2Pattern));
    const imagePositions = ['image1', 'image2', 'image3'];

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
description: "${article.title.replace(/"/g, '\\"')}"
publishDate: ${date}
category: "${article.category}"
tags: []
image: "${coverImage}"
imageAlt: "${coverAlt.replace(/"/g, '\\"')}"
faq:
${faqYaml}
author: "${user?.email || 'AI Writer'}"
---

${content}`;
  }

  function updateArticleContent(idx: number, newContent: string) {
    const updated = [...articles];
    updated[idx] = { ...updated[idx], content: newContent };
    setArticles(updated);
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

  function downloadAllMarkdown() {
    articles.forEach((article) => downloadMarkdown(article));
    setStatus({ type: 'success', message: `已下載 ${articles.length} 篇文章` });
  }

  // ========== 上傳（支援多網站） ==========
  async function uploadToGitHub() {
    setLoading(true);
    setStatus({ type: 'info', message: '推送到 GitHub...' });
    let successCount = 0;

    for (const article of articles) {
      const targetSiteId = article.siteId || currentSite?.id;
      if (!targetSiteId) continue;

      try {
        const res = await fetch('/api/upload/github', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            siteId: targetSiteId,
            filename: `${article.slug}.md`,
            content: generateMarkdown(article),
          }),
        });
        if (res.ok) successCount++;
        await new Promise((r) => setTimeout(r, 1000));
      } catch { }
    }

    setLoading(false);
    setStatus({
      type: successCount === articles.length ? 'success' : 'error',
      message: `成功推送 ${successCount}/${articles.length} 篇到 GitHub`,
    });
  }

  async function uploadToSupabase() {
    setLoading(true);
    setStatus({ type: 'info', message: '上傳到 Supabase...' });
    let successCount = 0;
    for (const article of articles) {
      try {
        const res = await fetch('/api/upload/supabase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            siteId: article.siteId || currentSite?.id,
            article: {
              title: article.title,
              slug: article.slug,
              content: article.content,
              category: article.category,
              image: article.images?.cover?.selected?.url || '',
            },
          }),
        });
        if (res.ok) successCount++;
      } catch { }
    }
    setLoading(false);
    setStatus({
      type: successCount === articles.length ? 'success' : 'error',
      message: `成功上傳 ${successCount}/${articles.length} 篇到 Supabase`,
    });
  }

  // ========== 圖片操作 ==========
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
      } else {
        setStatus({ type: 'error', message: '沒有找到圖片，試試其他關鍵字' });
      }
    } catch {
      setStatus({ type: 'error', message: '搜尋失敗' });
    } finally {
      setSearchLoading(false);
    }
  }

  // ========== 按網站分組（多網站用） ==========
  function getArticlesBySite(): Record<string, Article[]> {
    const grouped: Record<string, Article[]> = {};
    articles.forEach((a) => {
      const key = a.siteName || currentSite?.name || '未分類';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(a);
    });
    return grouped;
  }

  // ========== RENDER ==========

  // Step 0: Login
  if (step === 0) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div className="card" style={{ maxWidth: 400, width: '100%' }}>
          <h1 style={{ textAlign: 'center', marginBottom: 30, color: 'var(--primary-dark)' }}>🌸 AI 產文系統</h1>
          {status.message && <div className={`status status-${status.type}`}>{status.message}</div>}
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>密碼</label>
              <input type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} required />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? (<><span className="loading-spinner" /> 登入中...</>) : '登入'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Step 1: 選擇網站
  if (step === 1) {
    return (
      <>
        <header className="header">
          <div className="header-content">
            <h1>🌸 AI 產文系統</h1>
            <div className="header-user">
              <span>{user?.email}</span>
              <button className="btn btn-secondary btn-sm" onClick={handleLogout}>登出</button>
            </div>
          </div>
        </header>
        <div className="container">
          <div className="card">
            <h3>選擇網站</h3>
            <div className="sites-grid">
              {sites.map((site) => (
                <div key={site.id} className="site-card" onClick={() => selectSite(site)}>
                  <h3>{site.name}</h3>
                  <p>{site.slug}</p>
                </div>
              ))}
              {/* 多網站批量按鈕 */}
              <div
                className="site-card"
                style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: '#fff', cursor: 'pointer' }}
                onClick={enterMultiMode}
              >
                <h3 style={{ color: '#fff' }}>📦 多網站批量</h3>
                <p style={{ color: 'rgba(255,255,255,0.8)' }}>同時為多個網站產文</p>
              </div>
              {user?.role === 'admin' && (
                <div className="site-card" style={{ border: '2px dashed var(--border)' }}>
                  <h3 style={{ color: 'var(--text-light)' }}>+ 新增網站</h3>
                  <p>管理員功能</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // Step 6: 多網站批量
  if (step === 6) {
    return (
      <>
        <header className="header">
          <div className="header-content">
            <h1>📦 多網站批量產文</h1>
            <div className="header-user">
              <button className="btn btn-secondary btn-sm" onClick={() => setStep(1)}>← 回選擇</button>
              <span>{user?.email}</span>
              <button className="btn btn-secondary btn-sm" onClick={handleLogout}>登出</button>
            </div>
          </div>
        </header>
        <div className="container">
          {status.message && <div className={`status status-${status.type}`}>{status.message}</div>}

          {/* 輸入標題 */}
          {batchTitles.length === 0 ? (
            <div className="card">
              <h3>✏️ 輸入標題（每行一個）</h3>
              <textarea
                rows={10}
                value={batchInput}
                onChange={(e) => setBatchInput(e.target.value)}
                placeholder={`如何開始讀聖經？\n基督徒可以喝酒嗎？\n0-3歲繪本怎麼選？\n團購新手怎麼開團？`}
                style={{ width: '100%', padding: 12, fontSize: 15, border: '1px solid #ddd', borderRadius: 8, fontFamily: 'inherit' }}
              />
              <div className="btn-group" style={{ marginTop: 15 }}>
                <button className="btn btn-secondary" onClick={() => setStep(1)}>← 上一步</button>
                <button
                  className="btn btn-primary"
                  onClick={parseBatchInput}
                  disabled={!batchInput.trim()}
                >
                  確認標題 →
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* 標題分配表 */}
              <div className="card">
                <h3>📋 文章分配（{batchTitles.filter((bt) => bt.checked).length} / {batchTitles.length} 篇已勾選）</h3>
                <p style={{ color: 'var(--text-light)', fontSize: 13, marginBottom: 15 }}>
                  為每篇文章指定網站、分類、產文模式
                </p>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr style={{ background: '#f8f0e8' }}>
                        <th style={{ padding: '10px 8px', textAlign: 'center', width: 40, border: '1px solid #e5d5c5' }}>✓</th>
                        <th style={{ padding: '10px 8px', textAlign: 'left', border: '1px solid #e5d5c5' }}>標題</th>
                        <th style={{ padding: '10px 8px', textAlign: 'left', width: 140, border: '1px solid #e5d5c5' }}>網站</th>
                        <th style={{ padding: '10px 8px', textAlign: 'left', width: 120, border: '1px solid #e5d5c5' }}>分類</th>
                        <th style={{ padding: '10px 8px', textAlign: 'center', width: 90, border: '1px solid #e5d5c5' }}>模式</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batchTitles.map((bt, idx) => (
                        <tr key={idx} style={{ background: bt.checked ? '#fff' : '#f5f5f5' }}>
                          <td style={{ padding: '8px', textAlign: 'center', border: '1px solid #e8ddd3' }}>
                            <input
                              type="checkbox"
                              checked={bt.checked}
                              onChange={(e) => updateBatchTitle(idx, 'checked', e.target.checked)}
                            />
                          </td>
                          <td style={{ padding: '8px', border: '1px solid #e8ddd3' }}>
                            <input
                              type="text"
                              value={bt.title}
                              onChange={(e) => updateBatchTitle(idx, 'title', e.target.value)}
                              style={{ width: '100%', padding: '6px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 14 }}
                            />
                          </td>
                          <td style={{ padding: '8px', border: '1px solid #e8ddd3' }}>
                            <select
                              value={bt.siteId}
                              onChange={(e) => updateBatchTitle(idx, 'siteId', e.target.value)}
                              style={{ width: '100%', padding: '6px', borderRadius: 4, fontSize: 13 }}
                            >
                              {sites.map((site) => (
                                <option key={site.id} value={site.id}>{site.name}</option>
                              ))}
                            </select>
                          </td>
                          <td style={{ padding: '8px', border: '1px solid #e8ddd3' }}>
                            <input
                              type="text"
                              value={bt.category}
                              onChange={(e) => updateBatchTitle(idx, 'category', e.target.value)}
                              placeholder="分類"
                              style={{ width: '100%', padding: '6px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13 }}
                            />
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center', border: '1px solid #e8ddd3' }}>
                            <select
                              value={bt.mode}
                              onChange={(e) => updateBatchTitle(idx, 'mode', e.target.value)}
                              style={{ padding: '6px', borderRadius: 4, fontSize: 13 }}
                            >
                              <option value="ai">🤖 AI</option>
                              <option value="manual">✍️ 手寫</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 手寫內容區 */}
                {batchTitles.some((bt) => bt.mode === 'manual' && bt.checked) && (
                  <div style={{ marginTop: 20 }}>
                    <h4 style={{ marginBottom: 10 }}>✍️ 手寫內容</h4>
                    {batchTitles.map((bt, idx) => (
                      bt.mode === 'manual' && bt.checked && (
                        <div key={idx} style={{ marginBottom: 15, padding: 12, background: '#faf8f6', borderRadius: 8 }}>
                          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>📝 {bt.title}</div>
                          <textarea
                            rows={8}
                            value={bt.manualContent}
                            onChange={(e) => updateBatchTitle(idx, 'manualContent', e.target.value)}
                            placeholder="貼入你的文章內容（Markdown 格式）..."
                            style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 6, fontFamily: 'monospace', fontSize: 13 }}
                          />
                        </div>
                      )
                    ))}
                  </div>
                )}
              </div>

              {/* 設定 */}
              <div className="card">
                <div className="form-row">
                  <div className="form-group">
                    <label>文章長度（AI 產文用）</label>
                    <select value={articleLength} onChange={(e) => setArticleLength(e.target.value)}>
                      <option value="medium">標準（2000-2500字）</option>
                      <option value="long">長篇（2500-3000字）</option>
                      <option value="extra">深度（3000字以上）</option>
                    </select>
                  </div>
                </div>

                <div className="schedule-box">
                  <h4>📅 排程發布</h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label>開始日期</label>
                      <input type="date" value={scheduleStart} onChange={(e) => setScheduleStart(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>每隔幾天發一篇</label>
                      <select value={scheduleInterval} onChange={(e) => setScheduleInterval(Number(e.target.value))}>
                        <option value={1}>每天 1 篇</option>
                        <option value={2}>每 2 天 1 篇</option>
                        <option value={3}>每 3 天 1 篇</option>
                        <option value={7}>每週 1 篇</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="btn-group">
                  <button className="btn btn-secondary" onClick={() => setBatchTitles([])}>← 重新輸入</button>
                  <button className="btn btn-primary" onClick={startMultiBatchGenerate}>
                    🚀 開始產生（{batchTitles.filter((bt) => bt.checked).length} 篇，並行 3 篇）
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </>
    );
  }

  // ========== 主流程 Steps 2-5 ==========
  return (
    <>
      <header className="header">
        <div className="header-content">
          <h1>🌸 {currentSite?.name || '多網站批量'}</h1>
          <div className="header-user">
            <button className="btn btn-secondary btn-sm" onClick={() => setStep(1)}>← 換網站</button>
            <span>{user?.email}</span>
            <button className="btn btn-secondary btn-sm" onClick={handleLogout}>登出</button>
          </div>
        </div>
      </header>

      <div className="container">
        <div className="workflow">
          <div className={`workflow-step ${step >= 2 ? (step > 2 ? 'done' : 'active') : ''}`}>1. 關鍵字</div>
          <span className="workflow-arrow">→</span>
          <div className={`workflow-step ${step >= 3 ? (step > 3 ? 'done' : 'active') : ''}`}>2. 標題</div>
          <span className="workflow-arrow">→</span>
          <div className={`workflow-step ${step >= 4 ? (step > 4 ? 'done' : 'active') : ''}`}>3. 產文</div>
          <span className="workflow-arrow">→</span>
          <div className={`workflow-step ${step >= 5 ? 'active' : ''}`}>4. 預覽上傳</div>
        </div>

        {status.message && <div className={`status status-${status.type}`}>{status.message}</div>}

        {/* Step 2 */}
        {step === 2 && (
          <>
            <div className="card">
              <h3>🔍 Step 1：關鍵字規劃</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>分類</label>
                  {currentSite?.slug === 'bible' ? (
                    <select value={category} onChange={(e) => setCategory(e.target.value)}>
                      <option value="daily-devotion">🕊️ 每日靈修</option>
                      <option value="bible-study">📖 經文解釋</option>
                      <option value="faq">❓ 信仰問答</option>
                    </select>
                  ) : (
                    <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="輸入分類，例如：團購、育兒、行銷" />
                  )}
                </div>
                <div className="form-group">
                  <label>數量</label>
                  <select value={kwCount} onChange={(e) => setKwCount(Number(e.target.value))}>
                    <option value={10}>10 個</option>
                    <option value={20}>20 個</option>
                    <option value={30}>30 個</option>
                  </select>
                </div>
              </div>
              <div className="btn-group">
                <button className="btn btn-primary" onClick={generateKeywords} disabled={loading}>
                  {loading ? (<><span className="loading-spinner" /> 產生中...</>) : '🔍 產生關鍵字'}
                </button>
                <button className="btn btn-secondary" onClick={() => setStep(3)}>⏭️ 跳過，直接輸入標題</button>
              </div>
            </div>
            {keywords.length > 0 && (
              <div className="card">
                <h3>📋 關鍵字列表</h3>
                <div className="items-list">
                  {keywords.map((kw, i) => (
                    <div className="item" key={i}>
                      <input type="checkbox" id={`kw-${i}`} defaultChecked />
                      <div className="item-content">
                        <div className="item-title">{kw.keyword}</div>
                        <div className="item-meta">{kw.difficulty}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="btn-group" style={{ marginTop: 20 }}>
                  <button className="btn btn-primary" onClick={generateTitles} disabled={loading}>下一步：生成標題 →</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div className="card">
            <h3>✏️ Step 2：文章標題（可編輯）</h3>
            {titles.length === 0 ? (
              <div className="form-group">
                <label>輸入標題（每行一個）</label>
                <textarea id="manual-titles" rows={6} placeholder="如何開始讀聖經？&#10;基督徒可以喝酒嗎？" />
                <div className="btn-group" style={{ marginTop: 15 }}>
                  <button className="btn btn-secondary" onClick={() => setStep(2)}>← 上一步</button>
                  <button className="btn btn-primary" onClick={() => {
                    const input = (document.getElementById('manual-titles') as HTMLTextAreaElement).value;
                    const manualTitles = input.split('\n').filter((t) => t.trim()).map((t) => ({ keyword: '自訂', title: t.trim() }));
                    if (manualTitles.length > 0) setTitles(manualTitles);
                    else setStatus({ type: 'error', message: '請輸入至少一個標題' });
                  }}>確認標題</button>
                </div>
              </div>
            ) : (
              <>
                <div className="items-list">
                  {titles.map((t, i) => (
                    <div className="item" key={i} style={{ flexWrap: 'wrap' }}>
                      <input type="checkbox" id={`title-${i}`} defaultChecked />
                      <div className="item-content" style={{ flex: 1 }}>
                        <input type="text" id={`title-input-${i}`} defaultValue={t.title} style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 6 }} />
                        <div className="item-meta" style={{ marginTop: 8 }}>原：{t.keyword}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="form-row" style={{ marginTop: 20 }}>
                  <div className="form-group">
                    <label>文章長度</label>
                    <select value={articleLength} onChange={(e) => setArticleLength(e.target.value)}>
                      <option value="medium">標準（2000-2500字）</option>
                      <option value="long">長篇（2500-3000字）</option>
                      <option value="extra">深度（3000字以上）</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>間隔秒數</label>
                    <input type="number" value={batchDelay} onChange={(e) => setBatchDelay(Number(e.target.value))} min={10} />
                  </div>
                </div>

                <div className="schedule-box">
                  <h4>📅 排程發布</h4>
                  <p className="schedule-desc">文章會自動分配未來日期，搭配每日自動部署，實現定時上線。</p>
                  <div className="form-row">
                    <div className="form-group">
                      <label>開始日期</label>
                      <input type="date" value={scheduleStart} onChange={(e) => setScheduleStart(e.target.value)} />
                    </div>
                    <div className="form-group">
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
                      const count = titles.length;
                      const start = new Date(scheduleStart);
                      const end = new Date(scheduleStart);
                      end.setDate(end.getDate() + (count - 1) * scheduleInterval);
                      return ` ${count} 篇，${start.toLocaleDateString('zh-TW')} ~ ${end.toLocaleDateString('zh-TW')}`;
                    })()}
                  </div>
                </div>
                <div className="btn-group">
                  <button className="btn btn-secondary" onClick={() => { setTitles([]); setStep(2); }}>← 上一步</button>
                  <button className="btn btn-primary" onClick={startBatchGenerate}>📄 開始產生文章</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 4: Progress */}
        {step === 4 && (
          <div className="card">
            <h3>⏳ 產生中...（含圖片搜尋）</h3>
            <div style={{ marginBottom: 20 }}>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }} />
              </div>
              <p style={{ textAlign: 'center', marginTop: 10 }}>
                {batchProgress.current} / {batchProgress.total} - {batchProgress.title}
              </p>
            </div>
            <button className="btn btn-danger" onClick={() => setBatchRunning(false)}>⏹️ 停止</button>
          </div>
        )}

        {/* Step 5: Preview & Upload */}
        {step === 5 && (
          <>
            <div className="card">
              <h3>✅ 產生完成！共 {articles.length} 篇</h3>
              {/* 多網站時顯示分組統計 */}
              {mode === 'multi' && (
                <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-light)' }}>
                  {Object.entries(getArticlesBySite()).map(([siteName, arts]) => (
                    <span key={siteName} style={{ marginRight: 15 }}>
                      🏷️ {siteName}：{arts.length} 篇
                    </span>
                  ))}
                </div>
              )}
            </div>

            {articles.map((article, articleIdx) => {
              const tab = getTab(articleIdx);
              const toc = extractTOC(article.content);

              return (
                <div className="card" key={articleIdx}>
                  <h3 style={{ fontSize: 18, marginBottom: 8 }}>📄 {article.title}</h3>
                  <div style={{ fontSize: 13, color: 'var(--text-light)', marginBottom: 15 }}>
                    📅 排程：<strong style={{ color: 'var(--primary-dark)' }}>{article.scheduledDate}</strong>
                    &nbsp;&nbsp;|&nbsp;&nbsp;📁 {article.category}
                    {article.siteName && (
                      <>&nbsp;&nbsp;|&nbsp;&nbsp;🏷️ {article.siteName}</>
                    )}
                  </div>

                  {/* 圖片區 */}
                  <div className="image-grid">
                    {['cover', 'image1', 'image2', 'image3'].map((pos) => {
                      const imgData = article.images?.[pos];
                      const selected = imgData?.selected;
                      const candidateCount = imgData?.candidates?.length || 0;
                      return (
                        <div className="image-slot" key={pos}>
                          <div className="image-label">{IMAGE_LABELS[pos]}</div>
                          <div className="image-preview" onClick={() => { setImageModal({ articleIndex: articleIdx, position: pos }); setSearchQuery(article.imageKeywords?.[pos] || ''); }}>
                            {selected?.url ? <img src={selected.thumbnail || selected.url} alt={selected.alt} /> : <div className="image-empty">無圖片</div>}
                          </div>
                          <div className="image-actions">
                            <button className="btn btn-secondary btn-sm" onClick={() => randomSwapImage(articleIdx, pos)} title="隨機換圖">🔄</button>
                            <span className="image-count">{candidateCount} 張候選</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Tab 切換 */}
                  <div className="article-tabs">
                    <button className={`article-tab ${tab === 'preview' ? 'active' : ''}`} onClick={() => setTab(articleIdx, 'preview')}>
                      👁️ 預覽
                    </button>
                    <button className={`article-tab ${tab === 'markdown' ? 'active' : ''}`} onClick={() => setTab(articleIdx, 'markdown')}>
                      📝 Markdown 編輯
                    </button>
                  </div>

                  {/* 預覽 */}
                  {tab === 'preview' && (
                    <div className="article-preview-area">
                      {toc.length > 0 && (
                        <div className="preview-toc">
                          <div className="preview-toc-title">📑 目錄</div>
                          <ul className="preview-toc-list">
                            {toc.map((item, i) => (
                              <li key={i} className={item.level === 3 ? 'toc-h3' : 'toc-h2'}>
                                {item.text}
                              </li>
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

                  {/* Markdown 編輯 */}
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

                  <div className="btn-group" style={{ marginTop: 15 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => downloadMarkdown(article)}>📥 下載 Markdown</button>
                  </div>
                </div>
              );
            })}

            {/* 批量操作 */}
            <div className="card">
              <h3>📤 批量操作</h3>
              <div className="btn-group">
                <button className="btn btn-primary" onClick={downloadAllMarkdown}>📥 下載全部 Markdown</button>
                <button className="btn btn-success" onClick={uploadToGitHub} disabled={loading}>
                  {loading ? (<><span className="loading-spinner" /> 推送中...</>) : '🐙 推送到 GitHub'}
                </button>
                <button className="btn btn-secondary" onClick={uploadToSupabase} disabled={loading}>🗄️ 存到 Supabase</button>
              </div>
            </div>
            <div className="btn-group">
              <button className="btn btn-secondary" onClick={() => { setStep(mode === 'multi' ? 6 : 2); setArticles([]); }}>🔄 重新開始</button>
            </div>
          </>
        )}
      </div>

      {/* 圖片 Modal */}
      {imageModal && (
        <div className="modal-overlay" onClick={() => setImageModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{IMAGE_LABELS[imageModal.position]} — 候選圖片</h3>
              <button className="modal-close" onClick={() => setImageModal(null)}>✕</button>
            </div>
            <div className="modal-search">
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="輸入英文關鍵字重新搜尋..."
                onKeyDown={(e) => { if (e.key === 'Enter') researchImages(imageModal.articleIndex, imageModal.position, searchQuery); }} />
              <button className="btn btn-primary btn-sm" onClick={() => researchImages(imageModal.articleIndex, imageModal.position, searchQuery)} disabled={searchLoading}>
                {searchLoading ? '搜尋中...' : '🔍 搜尋'}
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
                <div style={{ padding: 20, color: 'var(--text-light)', textAlign: 'center', gridColumn: '1/-1' }}>沒有候選圖片，請輸入關鍵字搜尋</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}