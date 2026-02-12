'use client';

import { useState, useEffect } from 'react';

// Types
interface Site {
  id: string;
  name: string;
  slug: string;
  github_repo?: string;
  github_path?: string;
  categories?: string[];
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
  description?: string;
  tags?: string[];
  imageKeywords: Record<string, string>;
  images: ArticleImages;
  siteId?: string;
  siteSlug?: string;
  siteName?: string;
  dbId?: string; // aw_articles.id from Supabase
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

  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [titles, setTitles] = useState<Title[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });

  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [category, setCategory] = useState('');
  const [kwCount, setKwCount] = useState(20);
  const [articleLength, setArticleLength] = useState('medium');
  const [includeImages, setIncludeImages] = useState(true);
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

  // 內部連結快取
  const [siteArticlesCache, setSiteArticlesCache] = useState<Record<string, Array<{ title: string; slug: string; url: string }>>>({});

  // Supabase batch persistence
  const [batchId, setBatchId] = useState<string | null>(null);

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
  }

  async function selectSite(site: Site) {
    console.log("selectSite categories:", site.categories);
    setCurrentSite(site);
    setCategory(site.slug === 'bible' ? '每日靈修' : '');
    setStep(2);
    setKeywords([]);
    setTitles([]);
    setArticles([]);
    // Create batch record
    try {
      const res = await fetch('/api/batch/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'single', siteIds: [site.id] }),
      });
      const data = await res.json();
      if (res.ok) setBatchId(data.batch.id);
    } catch { }
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
      const fetchedArticles = data.articles || [];
      setSiteArticlesCache((prev) => ({ ...prev, [siteId]: fetchedArticles }));
      return fetchedArticles;
    } catch {
      return [];
    }
  }

  // ========== 單網站流程 ==========
  async function generateKeywords() {
    setLoading(true);
    setStatus({ type: 'info', message: 'AI 正在規劃關鍵字...' });
    try {
      const res = await fetch('/api/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, count: kwCount, siteSlug: currentSite?.slug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setKeywords(data.keywords);
      setStatus({ type: 'success', message: `成功產生 ${data.keywords.length} 個關鍵字！` });
      // Save to Supabase
      if (batchId) {
        fetch('/api/batch/keywords', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batchId,
            keywords: data.keywords.map((kw: Keyword) => ({
              keyword: kw.keyword,
              difficulty: kw.difficulty,
              siteId: currentSite?.id,
              siteSlug: currentSite?.slug,
            })),
          }),
        }).catch(() => { });
      }
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
    setStatus({ type: 'info', message: 'AI 正在生成標題（排除已有標題）...' });
    try {
      // Fetch existing titles for dedup
      let existingTitles: string[] = [];
      if (currentSite?.id) {
        try {
          const etRes = await fetch('/api/batch/existing-titles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ siteIds: [currentSite.id] }),
          });
          const etData = await etRes.json();
          existingTitles = etData.existingTitles || [];
        } catch { }
      }

      const res = await fetch('/api/titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: selected.map((k) => k.keyword), existingTitles }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTitles(data.titles);
      setStep(3);
      setStatus({ type: 'success', message: `成功生成 ${data.titles.length} 個標題！` });
      // Save to Supabase
      if (batchId) {
        fetch('/api/batch/titles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batchId,
            titles: data.titles.map((t: Title) => ({
              keyword: t.keyword,
              title: t.title,
              siteId: currentSite?.id,
              siteSlug: currentSite?.slug,
              siteName: currentSite?.name,
            })),
          }),
        }).catch(() => { });
      }
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
            includeImages,
            siteSlug: currentSite?.slug,
            existingArticles,
          }),
        });

        const data = await res.json();
        if (res.ok) {
          const startDate = new Date(scheduleStart);
          startDate.setDate(startDate.getDate() + i * scheduleInterval);
          const dateStr = startDate.toISOString().split('T')[0];

          const newArticle: Article = {
            title,
            content: data.content,
            category,
            slug: generateSlug(title),
            scheduledDate: dateStr,
            faq: data.faq || [],
                        description: data.description || "",
                        tags: data.tags || [],
            imageKeywords: data.imageKeywords || {},
            images: data.images || {},
            siteId: currentSite?.id,
            siteSlug: currentSite?.slug,
            siteName: currentSite?.name,
          };

          // Save to Supabase
          if (batchId) {
            try {
              const saveRes = await fetch('/api/batch/articles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ batchId, article: newArticle }),
              });
              const saveData = await saveRes.json();
              if (saveRes.ok) newArticle.dbId = saveData.article.id;
            } catch { }
          }

          newArticles.push(newArticle);
          setArticles([...newArticles]);
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

  function downloadAllMarkdown() {
    articles.forEach((article) => downloadMarkdown(article));
    setStatus({ type: 'success', message: `已下載 ${articles.length} 篇文章` });
  }

  // ========== 上傳 ==========
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

  // Step 1: 選擇模式
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
          {/* 模式選擇 */}
          <div style={{ textAlign: 'center', marginBottom: 30 }}>
            <h2 style={{ fontSize: 22, color: 'var(--text)', marginBottom: 8 }}>選擇產文模式</h2>
            <p style={{ color: 'var(--text-light)', fontSize: 14 }}>單篇精準操作，或多站批量高效產出</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, maxWidth: 700, margin: '0 auto 40px' }}>
            {/* 單網站 */}
            <div
              className="site-card"
              style={{ padding: '35px 25px', cursor: 'pointer' }}
              onClick={() => setStep(11)}
            >
              <div style={{ fontSize: 36, marginBottom: 12 }}>✍️</div>
              <h3 style={{ marginBottom: 8 }}>單網站產文</h3>
              <p style={{ fontSize: 13 }}>選一個網站，逐步產生關鍵字、標題、文章</p>
            </div>

            {/* 多網站批量 */}
            <a href="/batch" style={{ textDecoration: 'none' }}>
              <div
                className="site-card"
                style={{ padding: '35px 25px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: '#fff' }}
              >
                <div style={{ fontSize: 36, marginBottom: 12 }}>📦</div>
                <h3 style={{ color: '#fff', marginBottom: 8 }}>多網站批量</h3>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>同時為多個網站批量產文，並行處理</p>
              </div>
            </a>
          </div>

          {/* 文章管理入口 */}
          <div style={{ textAlign: 'center' }}>
            <a href="/manage" style={{ color: 'var(--primary-dark)', fontSize: 14, textDecoration: 'none' }}>
              📋 文章管理 — 查看歷史批次與文章狀態 →
            </a>
          </div>
        </div>
      </>
    );
  }

  // Step 11: 選擇單一網站
  if (step === 11) {
    return (
      <>
        <header className="header">
          <div className="header-content">
            <h1>🌸 AI 產文系統</h1>
            <div className="header-user">
              <button className="btn btn-secondary btn-sm" onClick={() => setStep(1)}>← 回首頁</button>
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

  // ========== 主流程 Steps 2-5 ==========
  return (
    <>
      <header className="header">
        <div className="header-content">
          <h1>🌸 {currentSite?.name || 'AI 產文系統'}</h1>
          <div className="header-user">
            <button className="btn btn-secondary btn-sm" onClick={() => setStep(11)}>← 換網站</button>
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
                      <option value="">-- 選擇分類 --</option>
                      <option value="每日靈修">🕊️ 每日靈修</option>
                      <option value="經文解釋">📖 經文解釋</option>
                      <option value="信仰問答">❓ 信仰問答</option>
                    </select>
                  ) : currentSite?.slug === 'chparenting' ? (
                    <select value={category} onChange={(e) => setCategory(e.target.value)}>
                      <option value="">-- 選擇分類 --</option>
                      <option value="育兒崩潰">🔥 育兒崩潰</option>
                      <option value="媽媽情緒">💛 媽媽情緒</option>
                      <option value="親子關係">👩‍👧 親子關係</option>
                      <option value="生活實用">✨ 生活實用</option>
                    </select>
                  ) : currentSite?.slug === 'mommystartup' ? (
                    <select value={category} onChange={(e) => setCategory(e.target.value)}>
                      <option value="">-- 選擇分類 --</option>
                      <option value="行銷">📈 行銷</option>
                      <option value="團購">🛒 團購</option>
                      <option value="育兒">👶 育兒</option>
                    </select>
                 ) : currentSite?.slug === 'veganote' ? (
                    <select value={category} onChange={(e) => setCategory(e.target.value)}>
                      <option value="">-- 選擇分類 --</option>
                      <option value="AI"> 🤖 AI</option>
                      <option value="行銷">📈 行銷</option>
                      <option value="開發">✨ 開發</option>
                      <option value="生活">🌱 生活</option>
                    </select>
                  ) : (
                    <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="輸入分類" />
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
                    <label>包含圖片</label>
                    <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                      <input type="checkbox" checked={includeImages} onChange={(e) => setIncludeImages(e.target.checked)} />
                      <span style={{fontSize:"13px",color:"#888"}}>{includeImages ? "產文含配圖" : "純文字，不搜圖"}</span>
                    </div>
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
            <h3>⏳ 產生中...{includeImages ? "（含圖片搜尋）" : "（純文字）"}</h3>
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
            </div>

            {articles.map((article, articleIdx) => {
              const tab = getTab(articleIdx);
              const toc = extractTOC(article.content);
                 if (article.faq && article.faq.length > 0) {
                  toc.push({ level: 2, text: '❓ 常見問題 FAQ' });
                 }

              return (
                <div className="card" key={articleIdx}>
                  <h3 style={{ fontSize: 18, marginBottom: 8 }}>📄 {article.title}</h3>
                  <div style={{ fontSize: 13, color: 'var(--text-light)', marginBottom: 15 }}>
                    📅 排程：<strong style={{ color: 'var(--primary-dark)' }}>{article.scheduledDate}</strong>
                    &nbsp;&nbsp;|&nbsp;&nbsp;📁 {article.category}
                  </div>

                  {/* 圖片區 */}
                  <div className="image-grid">
                    {['cover'].map((pos) => {
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
                            {selected?.url && <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); const updated = [...articles]; if (updated[articleIdx].images?.[pos]) { updated[articleIdx].images[pos].selected = undefined as any; } setArticles(updated); }} title="移除此圖">❌</button>}
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
                    <button className="btn btn-secondary btn-sm" onClick={() => downloadMarkdown(article)}>📥 MD</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => downloadWord(article)}>📥 Word</button>
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
              <button className="btn btn-secondary" onClick={() => { setStep(2); setArticles([]); }}>🔄 重新開始</button>
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
