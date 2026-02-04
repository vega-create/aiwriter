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
  faq: Array<{ q: string; a: string }>;
  imageKeywords: Record<string, string>;
  images: ArticleImages;
}

// 圖片位置標籤
const IMAGE_LABELS: Record<string, string> = {
  cover: '📷 封面圖',
  image1: '🖼️ 段落一配圖',
  image2: '🖼️ 段落二配圖',
  image3: '🖼️ 段落三配圖',
};

export default function Home() {
  // State
  const [user, setUser] = useState<User | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [currentSite, setCurrentSite] = useState<Site | null>(null);
  const [step, setStep] = useState(0);

  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [titles, setTitles] = useState<Title[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });

  // Form state
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [category, setCategory] = useState('行銷');
  const [kwCount, setKwCount] = useState(20);
  const [articleLength, setArticleLength] = useState('medium');
  const [batchDelay, setBatchDelay] = useState(30);

  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, title: '' });
  const [batchRunning, setBatchRunning] = useState(false);

  // 圖片瀏覽 state
  const [imageModal, setImageModal] = useState<{
    articleIndex: number;
    position: string;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);

  // Check auth on mount
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
      }
    } catch {}
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

  function selectSite(site: Site) {
    setCurrentSite(site);
    setStep(2);
    setKeywords([]);
    setTitles([]);
    setArticles([]);
  }

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
      short: '800-1000字',
      medium: '1500-2000字',
      long: '2500-3000字',
    };

    const newArticles: Article[] = [];

    for (let i = 0; i < selectedTitles.length; i++) {
      if (!batchRunning) break;

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
          }),
        });

        const data = await res.json();
        if (res.ok) {
          newArticles.push({
            title,
            content: data.content,
            category,
            slug: generateSlug(title),
            faq: data.faq || [],
            imageKeywords: data.imageKeywords || {},
            images: data.images || {},
          });
        }
      } catch {}

      if (i < selectedTitles.length - 1) {
        await new Promise((r) => setTimeout(r, batchDelay * 1000));
      }
    }

    setArticles(newArticles);
    setBatchRunning(false);
    setStep(5);
    setStatus({ type: 'success', message: `成功產生 ${newArticles.length} 篇文章！` });
  }

  function generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 50) + '-' + Date.now().toString(36);
  }

  // 產生含圖片的 Markdown
  function generateMarkdown(article: Article): string {
    const date = new Date().toISOString().split('T')[0];
    const coverImage = article.images?.cover?.selected?.url || '';
    const coverAlt = article.images?.cover?.selected?.alt || article.title;

    // 把 image1, image2, image3 插入文章對應位置
    let content = article.content;

    // 找到第一個 ## 後的段落末尾，插入 image1
    const h2Pattern = /^## [一二三四五六七八九十]/gm;
    const h2Matches = [...content.matchAll(h2Pattern)];

    const imagePositions = ['image1', 'image2', 'image3'];
    // 在每個 H2 段落的第一個 H3 之後或段落末尾插入對應圖片
    for (let idx = 0; idx < Math.min(h2Matches.length, 3); idx++) {
      const pos = imagePositions[idx];
      const imgData = article.images?.[pos]?.selected;
      if (!imgData?.url) continue;

      const imgMarkdown = `\n\n![${imgData.alt}](${imgData.url})\n`;

      // 找這個 H2 和下一個 H2 之間的範圍
      const startIdx = h2Matches[idx].index! + h2Matches[idx][0].length;
      const endIdx = h2Matches[idx + 1]?.index || content.length;
      const section = content.slice(startIdx, endIdx);

      // 在 section 末尾插入圖片（下一個 H2 之前）
      content = content.slice(0, endIdx) + imgMarkdown + content.slice(endIdx);
    }

    // FAQ frontmatter
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

  async function uploadToGitHub() {
    if (!currentSite?.github_repo) {
      setStatus({ type: 'error', message: '此網站未設定 GitHub' });
      return;
    }

    setLoading(true);
    setStatus({ type: 'info', message: '推送到 GitHub...' });

    let successCount = 0;

    for (const article of articles) {
      try {
        const res = await fetch('/api/upload/github', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            siteId: currentSite.id,
            filename: `${article.slug}.md`,
            content: generateMarkdown(article),
          }),
        });

        if (res.ok) successCount++;
        // 延遲 1 秒避免 GitHub rate limit
        await new Promise((r) => setTimeout(r, 1000));
      } catch {}
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
            siteId: currentSite?.id,
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
      } catch {}
    }

    setLoading(false);
    setStatus({
      type: successCount === articles.length ? 'success' : 'error',
      message: `成功上傳 ${successCount}/${articles.length} 篇到 Supabase`,
    });
  }

  // ========== 圖片操作 ==========

  // 從候選裡隨機換一張
  function randomSwapImage(articleIndex: number, position: string) {
    const updated = [...articles];
    const article = updated[articleIndex];
    const posData = article.images[position];
    if (!posData?.candidates?.length) return;

    const currentUrl = posData.selected.url;
    const others = posData.candidates.filter((c) => c.url !== currentUrl);
    if (others.length === 0) return;

    const random = others[Math.floor(Math.random() * others.length)];
    posData.selected = random;
    setArticles(updated);
  }

  // 從候選裡點選一張
  function selectImage(articleIndex: number, position: string, candidate: ImageItem) {
    const updated = [...articles];
    updated[articleIndex].images[position].selected = candidate;
    setArticles(updated);
    setImageModal(null);
  }

  // 重新搜尋圖片
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
        // 同步更新 keywords
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

  // Login
  if (step === 0) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div className="card" style={{ maxWidth: 400, width: '100%' }}>
          <h1 style={{ textAlign: 'center', marginBottom: 30, color: 'var(--primary-dark)' }}>
            🌸 AI 產文系統
          </h1>

          {status.message && <div className={`status status-${status.type}`}>{status.message}</div>}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={loginForm.email}
                onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>密碼</label>
              <input
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? (
                <>
                  <span className="loading-spinner" /> 登入中...
                </>
              ) : (
                '登入'
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Site Selection
  if (step === 1) {
    return (
      <>
        <header className="header">
          <div className="header-content">
            <h1>🌸 AI 產文系統</h1>
            <div className="header-user">
              <span>{user?.email}</span>
              <button className="btn btn-secondary btn-sm" onClick={handleLogout}>
                登出
              </button>
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

  // Main Writing Flow
  return (
    <>
      <header className="header">
        <div className="header-content">
          <h1>🌸 {currentSite?.name}</h1>
          <div className="header-user">
            <button className="btn btn-secondary btn-sm" onClick={() => setStep(1)}>
              ← 換網站
            </button>
            <span>{user?.email}</span>
            <button className="btn btn-secondary btn-sm" onClick={handleLogout}>
              登出
            </button>
          </div>
        </div>
      </header>

      <div className="container">
        {/* Workflow */}
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

        {/* Step 2: Keywords */}
        {step === 2 && (
          <>
            <div className="card">
              <h3>🔍 Step 1：關鍵字規劃</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>分類</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="行銷">行銷</option>
                    <option value="團購">團購</option>
                    <option value="育兒">育兒</option>
                    <option value="信仰">信仰</option>
                  </select>
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
                  {loading ? (
                    <>
                      <span className="loading-spinner" /> 產生中...
                    </>
                  ) : (
                    '🔍 產生關鍵字'
                  )}
                </button>
                <button className="btn btn-secondary" onClick={() => setStep(3)}>
                  ⏭️ 跳過，直接輸入標題
                </button>
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
                  <button className="btn btn-primary" onClick={generateTitles} disabled={loading}>
                    下一步：生成標題 →
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Step 3: Titles */}
        {step === 3 && (
          <>
            <div className="card">
              <h3>✏️ Step 2：文章標題（可編輯）</h3>

              {titles.length === 0 ? (
                <div className="form-group">
                  <label>輸入標題（每行一個）</label>
                  <textarea
                    id="manual-titles"
                    rows={6}
                    placeholder="如何開始讀聖經？&#10;基督徒可以喝酒嗎？"
                  />
                  <div className="btn-group" style={{ marginTop: 15 }}>
                    <button className="btn btn-secondary" onClick={() => setStep(2)}>
                      ← 上一步
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        const input = (document.getElementById('manual-titles') as HTMLTextAreaElement).value;
                        const manualTitles = input
                          .split('\n')
                          .filter((t) => t.trim())
                          .map((t) => ({
                            keyword: '自訂',
                            title: t.trim(),
                          }));
                        if (manualTitles.length > 0) {
                          setTitles(manualTitles);
                        } else {
                          setStatus({ type: 'error', message: '請輸入至少一個標題' });
                        }
                      }}
                    >
                      確認標題
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="items-list">
                    {titles.map((t, i) => (
                      <div className="item" key={i} style={{ flexWrap: 'wrap' }}>
                        <input type="checkbox" id={`title-${i}`} defaultChecked />
                        <div className="item-content" style={{ flex: 1 }}>
                          <input
                            type="text"
                            id={`title-input-${i}`}
                            defaultValue={t.title}
                            style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 6 }}
                          />
                          <div className="item-meta" style={{ marginTop: 8 }}>
                            原：{t.keyword}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="form-row" style={{ marginTop: 20 }}>
                    <div className="form-group">
                      <label>文章長度</label>
                      <select value={articleLength} onChange={(e) => setArticleLength(e.target.value)}>
                        <option value="short">短（800-1000字）</option>
                        <option value="medium">中（1500-2000字）</option>
                        <option value="long">長（2500-3000字）</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>間隔秒數</label>
                      <input
                        type="number"
                        value={batchDelay}
                        onChange={(e) => setBatchDelay(Number(e.target.value))}
                        min={10}
                      />
                    </div>
                  </div>

                  <div className="btn-group">
                    <button className="btn btn-secondary" onClick={() => { setTitles([]); setStep(2); }}>
                      ← 上一步
                    </button>
                    <button className="btn btn-primary" onClick={startBatchGenerate}>
                      📄 開始產生文章
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* Step 4: Generating */}
        {step === 4 && (
          <div className="card">
            <h3>⏳ 產生中...（含圖片搜尋）</h3>
            <div style={{ marginBottom: 20 }}>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                />
              </div>
              <p style={{ textAlign: 'center', marginTop: 10 }}>
                {batchProgress.current} / {batchProgress.total} - {batchProgress.title}
              </p>
            </div>
            <button className="btn btn-danger" onClick={() => setBatchRunning(false)}>
              ⏹️ 停止
            </button>
          </div>
        )}

        {/* Step 5: Preview & Upload */}
        {step === 5 && (
          <>
            <div className="card">
              <h3>✅ 產生完成！共 {articles.length} 篇（點擊圖片可換圖）</h3>
            </div>

            {/* 每篇文章的預覽 */}
            {articles.map((article, articleIdx) => (
              <div className="card" key={articleIdx}>
                <h3 style={{ fontSize: 16, marginBottom: 15 }}>
                  📄 {article.title}
                </h3>

                {/* 圖片預覽區 */}
                <div className="image-grid">
                  {['cover', 'image1', 'image2', 'image3'].map((pos) => {
                    const imgData = article.images?.[pos];
                    const selected = imgData?.selected;
                    const candidateCount = imgData?.candidates?.length || 0;

                    return (
                      <div className="image-slot" key={pos}>
                        <div className="image-label">{IMAGE_LABELS[pos]}</div>
                        <div
                          className="image-preview"
                          onClick={() => {
                            setImageModal({ articleIndex: articleIdx, position: pos });
                            setSearchQuery(article.imageKeywords?.[pos] || '');
                          }}
                        >
                          {selected?.url ? (
                            <img src={selected.thumbnail || selected.url} alt={selected.alt} />
                          ) : (
                            <div className="image-empty">無圖片</div>
                          )}
                        </div>
                        <div className="image-actions">
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => randomSwapImage(articleIdx, pos)}
                            title="隨機換圖"
                          >
                            🔄
                          </button>
                          <span className="image-count">{candidateCount} 張候選</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 操作按鈕 */}
                <div className="btn-group" style={{ marginTop: 15 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => downloadMarkdown(article)}>
                    📥 下載 Markdown
                  </button>
                </div>
              </div>
            ))}

            {/* 批量操作 */}
            <div className="card">
              <h3>📤 批量操作</h3>
              <div className="btn-group">
                <button className="btn btn-primary" onClick={downloadAllMarkdown}>
                  📥 下載全部 Markdown
                </button>
                {currentSite?.github_repo && (
                  <button className="btn btn-success" onClick={uploadToGitHub} disabled={loading}>
                    {loading ? (
                      <>
                        <span className="loading-spinner" /> 推送中...
                      </>
                    ) : (
                      '🐙 推送到 GitHub'
                    )}
                  </button>
                )}
                <button className="btn btn-secondary" onClick={uploadToSupabase} disabled={loading}>
                  🗄️ 存到 Supabase
                </button>
              </div>
            </div>

            <div className="btn-group">
              <button className="btn btn-secondary" onClick={() => setStep(2)}>
                🔄 重新開始
              </button>
            </div>
          </>
        )}
      </div>

      {/* ========== 圖片候選 Modal ========== */}
      {imageModal && (
        <div className="modal-overlay" onClick={() => setImageModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{IMAGE_LABELS[imageModal.position]} — 候選圖片</h3>
              <button className="modal-close" onClick={() => setImageModal(null)}>
                ✕
              </button>
            </div>

            {/* 搜尋列 */}
            <div className="modal-search">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="輸入英文關鍵字重新搜尋..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    researchImages(imageModal.articleIndex, imageModal.position, searchQuery);
                  }
                }}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={() => researchImages(imageModal.articleIndex, imageModal.position, searchQuery)}
                disabled={searchLoading}
              >
                {searchLoading ? '搜尋中...' : '🔍 搜尋'}
              </button>
            </div>

            {/* 候選圖片 */}
            <div className="modal-grid">
              {articles[imageModal.articleIndex]?.images?.[imageModal.position]?.candidates?.map(
                (candidate, idx) => {
                  const isSelected =
                    candidate.url ===
                    articles[imageModal.articleIndex]?.images?.[imageModal.position]?.selected?.url;
                  return (
                    <div
                      key={idx}
                      className={`modal-image ${isSelected ? 'selected' : ''}`}
                      onClick={() => selectImage(imageModal.articleIndex, imageModal.position, candidate)}
                    >
                      <img src={candidate.thumbnail} alt={candidate.alt} />
                      {isSelected && <div className="modal-image-check">✓</div>}
                      <div className="modal-image-credit">📸 {candidate.photographer}</div>
                    </div>
                  );
                }
              )}
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
