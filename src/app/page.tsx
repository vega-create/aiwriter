'use client';

import { useState, useEffect } from 'react';

interface Site {
  id: string;
  name: string;
  slug: string;
  github_repo?: string;
  github_path?: string;
  categories?: string[];
  system_prompt?: string;
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

interface Article {
  title: string;
  content: string;
  image: string;
  category: string;
  slug: string;
}

function markdownToHtml(md: string): string {
  let html = md
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2 id="$1">$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/^\- (.*$)/gm, '<li>$1</li>')
    .replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');
  html = html.replace(/((?:<li>.*<\/li>\s*)+)/g, '<ul>$1</ul>');
  return '<p>' + html + '</p>';
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
  const [customCategory, setCustomCategory] = useState('');
  const [kwCount, setKwCount] = useState(20);
  const [articleLength, setArticleLength] = useState('medium');
  const [batchDelay, setBatchDelay] = useState(30);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, title: '' });
  const [batchRunning, setBatchRunning] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [showPreview, setShowPreview] = useState(true);

  // Get categories from current site's DB data
  function getSiteCategories(): string[] {
    if (!currentSite) return [];
    // categories from Supabase is stored as JSONB, API returns it as array or string
    let cats: string[] = [];
    if (Array.isArray(currentSite.categories)) {
      cats = currentSite.categories;
    } else if (typeof currentSite.categories === 'string') {
      try { cats = JSON.parse(currentSite.categories); } catch { cats = []; }
    }
    return cats;
  }

  useEffect(() => { checkAuth(); }, []);
  useEffect(() => {
    if (currentSite) {
      const cats = getSiteCategories();
      setCategory(cats[0] || '');
      setCustomCategory('');
    }
  }, [currentSite]);

  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) { const data = await res.json(); setUser(data.user); setSites(data.sites || []); setStep(1); }
    } catch { }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setStatus({ type: '', message: '' });
    try {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(loginForm) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '登入失敗');
      setUser(data.user); setSites(data.sites || []); setStep(1);
      setStatus({ type: 'success', message: '登入成功！' });
    } catch (err: any) { setStatus({ type: 'error', message: err.message }); }
    finally { setLoading(false); }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null); setSites([]); setCurrentSite(null); setStep(0);
  }

  function selectSite(site: Site) {
    setCurrentSite(site); setStep(2); setKeywords([]); setTitles([]); setArticles([]);
  }

  async function generateKeywords() {
    const finalCategory = category || customCategory;
    if (!finalCategory) { setStatus({ type: 'error', message: '請選擇或輸入分類' }); return; }
    setLoading(true); setStatus({ type: 'info', message: 'AI 正在規劃關鍵字...' });
    try {
      const res = await fetch('/api/keywords', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: finalCategory, count: kwCount }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      setKeywords(data.keywords); setStatus({ type: 'success', message: '成功產生 ' + data.keywords.length + ' 個關鍵字！' });
    } catch (err: any) { setStatus({ type: 'error', message: err.message }); }
    finally { setLoading(false); }
  }

  async function generateTitles() {
    const selected = keywords.filter((_, i) => (document.getElementById('kw-' + i) as HTMLInputElement)?.checked);
    if (selected.length === 0) { setStatus({ type: 'error', message: '請先選擇關鍵字' }); return; }
    setLoading(true); setStatus({ type: 'info', message: 'AI 正在生成標題...' });
    try {
      const res = await fetch('/api/titles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keywords: selected.map(k => k.keyword) }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      setTitles(data.titles); setStep(3);
      setStatus({ type: 'success', message: '成功生成 ' + data.titles.length + ' 個標題！' });
    } catch (err: any) { setStatus({ type: 'error', message: err.message }); }
    finally { setLoading(false); }
  }

  async function startBatchGenerate() {
    const selectedTitles = titles.filter((_, i) => { const cb = document.getElementById('title-' + i) as HTMLInputElement; return cb?.checked; })
      .map((t, i) => { const input = document.getElementById('title-input-' + i) as HTMLInputElement; return input?.value || t.title; });
    if (selectedTitles.length === 0) { setStatus({ type: 'error', message: '請先選擇標題' }); return; }
    setBatchRunning(true); setBatchProgress({ current: 0, total: selectedTitles.length, title: '' }); setStep(4); setArticles([]);
    const lengthGuide: Record<string, string> = { short: '800-1000字', medium: '1500-2000字', long: '2500-3000字' };
    const finalCategory = category || customCategory;
    const newArticles: Article[] = [];
    for (let i = 0; i < selectedTitles.length; i++) {
      const title = selectedTitles[i];
      setBatchProgress({ current: i + 1, total: selectedTitles.length, title });
      try {
        const res = await fetch('/api/article', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, category: finalCategory, length: lengthGuide[articleLength], sitePrompt: currentSite?.system_prompt })
        });
        const data = await res.json();
        if (res.ok) { newArticles.push({ title, content: data.content, image: data.image || '', category: finalCategory, slug: generateSlug(title) }); setArticles([...newArticles]); }
      } catch { }
      if (i < selectedTitles.length - 1) await new Promise(r => setTimeout(r, batchDelay * 1000));
    }
    setArticles(newArticles); setBatchRunning(false); setStep(5);
    setStatus({ type: 'success', message: '成功產生 ' + newArticles.length + ' 篇文章！' });
  }

  function generateSlug(title: string): string {
    return title.toLowerCase().replace(/[^\w\s\u4e00-\u9fff-]/g, '').replace(/\s+/g, '-').slice(0, 50) + '-' + Date.now().toString(36);
  }

  function generateMarkdown(article: Article): string {
    const date = new Date().toISOString().split('T')[0];
    return '---\ntitle: "' + article.title + '"\ndescription: "' + article.title + '"\npublishDate: ' + date + '\ncategory: "' + article.category + '"\ntags: []\nimage: "' + article.image + '"\nauthor: "' + (user?.email || 'AI Writer') + '"\n---\n\n' + article.content;
  }

  function downloadMarkdown(article: Article) {
    const content = generateMarkdown(article); const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = article.slug + '.md'; a.click(); URL.revokeObjectURL(url);
  }
  function downloadAllMarkdown() { articles.forEach(a => downloadMarkdown(a)); setStatus({ type: 'success', message: '已下載 ' + articles.length + ' 篇文章' }); }

  async function uploadToGitHub() {
    if (!currentSite?.github_repo) { setStatus({ type: 'error', message: '此網站未設定 GitHub' }); return; }
    setLoading(true); setStatus({ type: 'info', message: '推送到 GitHub...' }); let sc = 0;
    for (const article of articles) {
      try {
        const res = await fetch('/api/upload/github', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteId: currentSite.id, filename: article.slug + '.md', content: generateMarkdown(article) })
        });
        if (res.ok) sc++;
      } catch { }
    }
    setLoading(false); setStatus({ type: sc === articles.length ? 'success' : 'error', message: '成功推送 ' + sc + '/' + articles.length + ' 篇到 GitHub' });
  }

  async function uploadToSupabase() {
    setLoading(true); setStatus({ type: 'info', message: '上傳到 Supabase...' }); let sc = 0;
    for (const article of articles) {
      try {
        const res = await fetch('/api/upload/supabase', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteId: currentSite?.id, article: { title: article.title, slug: article.slug, content: article.content, category: article.category, image: article.image } })
        });
        if (res.ok) sc++;
      } catch { }
    }
    setLoading(false); setStatus({ type: sc === articles.length ? 'success' : 'error', message: '成功上傳 ' + sc + '/' + articles.length + ' 篇到 Supabase' });
  }

  function openPreview(i: number) { setPreviewIndex(i); setEditIndex(null); }
  function openEdit(i: number) { setEditIndex(i); setEditContent(articles[i].content); setEditTitle(articles[i].title); setPreviewIndex(null); }
  function saveEdit() { if (editIndex === null) return; const u = [...articles]; u[editIndex] = { ...u[editIndex], title: editTitle, content: editContent }; setArticles(u); setEditIndex(null); setStatus({ type: 'success', message: '文章已更新！' }); }
  function closeModal() { setPreviewIndex(null); setEditIndex(null); }

  const ov: React.CSSProperties = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 };
  const ms: React.CSSProperties = { background: 'white', borderRadius: 16, width: '100%', maxWidth: 900, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' };
  const mh: React.CSSProperties = { padding: '20px 24px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
  const mb_style: React.CSSProperties = { padding: 24, overflowY: 'auto', flex: 1 };
  const mf: React.CSSProperties = { padding: '16px 24px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', gap: 10 };
  const chip = (a: boolean): React.CSSProperties => ({ padding: '6px 14px', borderRadius: 20, border: a ? '2px solid var(--primary)' : '1px solid #ddd', background: a ? 'var(--primary-light)' : 'white', color: a ? 'var(--primary-dark)' : 'var(--text)', cursor: 'pointer', fontSize: 14, fontWeight: a ? 600 : 400, transition: 'all 0.2s' });

  function renderPreviewModal() {
    if (previewIndex === null) return null; const article = articles[previewIndex];
    return (<div style={ov} onClick={closeModal}><div style={ms} onClick={e => e.stopPropagation()}>
      <div style={mh}><h3 style={{ margin: 0, color: 'var(--primary-dark)' }}>📖 文章預覽</h3>
        <div style={{ display: 'flex', gap: 10 }}><button className="btn btn-primary btn-sm" onClick={() => openEdit(previewIndex)}>✏️ 編輯</button><button className="btn btn-secondary btn-sm" onClick={closeModal}>✕</button></div></div>
      <div style={mb_style}>{article.image && <img src={article.image} alt={article.title} style={{ width: '100%', maxHeight: 300, objectFit: 'cover', borderRadius: 8, marginBottom: 20 }} />}
        <div className="article-preview" dangerouslySetInnerHTML={{ __html: markdownToHtml(article.content) }} style={{ lineHeight: 1.8, fontSize: 16 }} /></div>
      <div style={mf}><button className="btn btn-secondary" onClick={() => downloadMarkdown(article)}>📥 下載</button><button className="btn btn-primary" onClick={() => openEdit(previewIndex)}>✏️ 編輯文章</button></div>
    </div></div>);
  }

  function renderEditModal() {
    if (editIndex === null) return null;
    return (<div style={ov} onClick={closeModal}><div style={{ ...ms, maxWidth: 1100 }} onClick={e => e.stopPropagation()}>
      <div style={mh}><h3 style={{ margin: 0, color: 'var(--primary-dark)' }}>✏️ 編輯文章</h3><button className="btn btn-secondary btn-sm" onClick={closeModal}>✕</button></div>
      <div style={{ ...mb_style, padding: 0 }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #eee' }}><label style={{ fontSize: 14, color: 'var(--text-light)', marginBottom: 6, display: 'block' }}>文章標題</label>
          <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} style={{ width: '100%', padding: 12, fontSize: 16, border: '1px solid #ddd', borderRadius: 8 }} /></div>
        <div style={{ padding: '12px 24px', borderBottom: '1px solid #eee', display: 'flex', gap: 10 }}>
          <button className={'btn btn-sm ' + (!showPreview ? 'btn-primary' : 'btn-secondary')} onClick={() => setShowPreview(false)}>📝 原始碼</button>
          <button className={'btn btn-sm ' + (showPreview ? 'btn-primary' : 'btn-secondary')} onClick={() => setShowPreview(true)}>👁️ 預覽</button></div>
        <div style={{ display: 'flex', height: 'calc(90vh - 250px)' }}>
          <div style={{ flex: 1, display: showPreview ? 'none' : 'block' }}><textarea value={editContent} onChange={e => setEditContent(e.target.value)}
            style={{ width: '100%', height: '100%', padding: 24, border: 'none', outline: 'none', fontFamily: 'monospace', fontSize: 14, lineHeight: 1.8, resize: 'none' }} /></div>
          <div style={{ flex: 1, display: showPreview ? 'block' : 'none', padding: 24, overflowY: 'auto' }}>
            <div className="article-preview" dangerouslySetInnerHTML={{ __html: markdownToHtml(editContent) }} style={{ lineHeight: 1.8, fontSize: 16 }} /></div>
        </div></div>
      <div style={mf}><button className="btn btn-secondary" onClick={closeModal}>取消</button><button className="btn btn-primary" onClick={saveEdit}>💾 儲存修改</button></div>
    </div></div>);
  }

  function renderCategorySelector() {
    const cats = getSiteCategories();
    return (<div className="form-group"><label>分類</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {cats.map(cat => <span key={cat} style={chip(category === cat)} onClick={() => { setCategory(cat); setCustomCategory(''); }}>{cat}</span>)}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 14, color: 'var(--text-light)', whiteSpace: 'nowrap' }}>或自訂：</span>
        <input type="text" value={customCategory} onChange={e => { setCustomCategory(e.target.value); if (e.target.value) setCategory(''); }}
          placeholder="輸入自訂分類..." style={{ flex: 1 }} />
      </div>
      {(category || customCategory) && <p style={{ fontSize: 13, color: 'var(--primary-dark)', marginTop: 8 }}>✓ 目前分類：<strong>{category || customCategory}</strong></p>}
    </div>);
  }

  if (step === 0) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="card" style={{ maxWidth: 400, width: '100%' }}>
        <h1 style={{ textAlign: 'center', marginBottom: 30, color: 'var(--primary-dark)' }}>🌸 AI 產文系統</h1>
        {status.message && <div className={'status status-' + status.type}>{status.message}</div>}
        <form onSubmit={handleLogin}>
          <div className="form-group"><label>Email</label><input type="email" value={loginForm.email} onChange={e => setLoginForm({ ...loginForm, email: e.target.value })} required /></div>
          <div className="form-group"><label>密碼</label><input type="password" value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} required /></div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>{loading ? '登入中...' : '登入'}</button>
        </form></div></div>);

  if (step === 1) return (<>
    <header className="header"><div className="header-content"><h1>🌸 AI 產文系統</h1><div className="header-user"><span>{user?.email}</span><button className="btn btn-secondary btn-sm" onClick={handleLogout}>登出</button></div></div></header>
    <div className="container"><div className="card"><h3>選擇網站</h3><div className="sites-grid">
      {sites.map(site => <div key={site.id} className="site-card" onClick={() => selectSite(site)}><h3>{site.name}</h3><p>{site.slug}</p></div>)}
      {user?.role === 'admin' && <div className="site-card" style={{ border: '2px dashed var(--border)' }}><h3 style={{ color: 'var(--text-light)' }}>+ 新增網站</h3><p>管理員功能</p></div>}
    </div></div></div></>);

  return (<>
    <header className="header"><div className="header-content"><h1>🌸 {currentSite?.name}</h1><div className="header-user">
      <button className="btn btn-secondary btn-sm" onClick={() => setStep(1)}>← 換網站</button><span>{user?.email}</span><button className="btn btn-secondary btn-sm" onClick={handleLogout}>登出</button></div></div></header>
    <div className="container">
      <div className="workflow">
        <div className={'workflow-step ' + (step >= 2 ? (step > 2 ? 'done' : 'active') : '')}>1. 關鍵字</div><span className="workflow-arrow">→</span>
        <div className={'workflow-step ' + (step >= 3 ? (step > 3 ? 'done' : 'active') : '')}>2. 標題</div><span className="workflow-arrow">→</span>
        <div className={'workflow-step ' + (step >= 4 ? (step > 4 ? 'done' : 'active') : '')}>3. 產文</div><span className="workflow-arrow">→</span>
        <div className={'workflow-step ' + (step >= 5 ? 'active' : '')}>4. 上傳</div></div>
      {status.message && <div className={'status status-' + status.type}>{status.message}</div>}

      {step === 2 && (<><div className="card"><h3>🔍 Step 1：關鍵字規劃</h3>
        {renderCategorySelector()}
        <div className="form-group"><label>數量</label><select value={kwCount} onChange={e => setKwCount(Number(e.target.value))}>
          <option value={10}>10 個</option><option value={20}>20 個</option><option value={30}>30 個</option></select></div>
        <div className="btn-group"><button className="btn btn-primary" onClick={generateKeywords} disabled={loading}>{loading ? '產生中...' : '🔍 產生關鍵字'}</button>
          <button className="btn btn-secondary" onClick={() => setStep(3)}>⏭️ 跳過，直接輸入標題</button></div></div>
        {keywords.length > 0 && <div className="card"><h3>📋 關鍵字列表</h3><div className="items-list">
          {keywords.map((kw, i) => <div className="item" key={i}><input type="checkbox" id={'kw-' + i} defaultChecked /><div className="item-content"><div className="item-title">{kw.keyword}</div><div className="item-meta">{kw.difficulty}</div></div></div>)}</div>
          <div className="btn-group" style={{ marginTop: 20 }}><button className="btn btn-primary" onClick={generateTitles} disabled={loading}>下一步：生成標題 →</button></div></div>}</>)}

      {step === 3 && <div className="card"><h3>✏️ Step 2：文章標題（可編輯）</h3>
        {titles.length === 0 ? <div className="form-group"><label>輸入標題（每行一個）</label><textarea id="manual-titles" rows={6} placeholder="新手必看！團購入門指南" />
          <div className="btn-group" style={{ marginTop: 15 }}><button className="btn btn-secondary" onClick={() => setStep(2)}>← 上一步</button>
            <button className="btn btn-primary" onClick={() => {
              const input = (document.getElementById('manual-titles') as HTMLTextAreaElement).value;
              const mt = input.split('\n').filter(t => t.trim()).map(t => ({ keyword: '自訂', title: t.trim() }));
              if (mt.length > 0) setTitles(mt); else setStatus({ type: 'error', message: '請輸入至少一個標題' });
            }}>確認標題</button></div></div>
          : <><div className="items-list">{titles.map((t, i) => <div className="item" key={i} style={{ flexWrap: 'wrap' }}>
            <input type="checkbox" id={'title-' + i} defaultChecked /><div className="item-content" style={{ flex: 1 }}>
              <input type="text" id={'title-input-' + i} defaultValue={t.title} style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 6 }} />
              <div className="item-meta" style={{ marginTop: 8 }}>原：{t.keyword}</div></div></div>)}</div>
            <div className="form-row" style={{ marginTop: 20 }}>
              <div className="form-group"><label>文章長度</label><select value={articleLength} onChange={e => setArticleLength(e.target.value)}>
                <option value="short">短（800-1000字）</option><option value="medium">中（1500-2000字）</option><option value="long">長（2500-3000字）</option></select></div>
              <div className="form-group"><label>間隔秒數</label><input type="number" value={batchDelay} onChange={e => setBatchDelay(Number(e.target.value))} min={10} /></div></div>
            <div className="btn-group"><button className="btn btn-secondary" onClick={() => { setTitles([]); setStep(2); }}>← 上一步</button>
              <button className="btn btn-primary" onClick={startBatchGenerate}>📄 開始產生文章</button></div></>}</div>}

      {step === 4 && <div className="card"><h3>⏳ 產生中...</h3><div style={{ marginBottom: 20 }}><div className="progress-bar">
        <div className="progress-fill" style={{ width: (batchProgress.current / batchProgress.total * 100) + '%' }} /></div>
        <p style={{ textAlign: 'center', marginTop: 10 }}>{batchProgress.current} / {batchProgress.total} - {batchProgress.title}</p></div></div>}

      {step === 5 && <><div className="card"><h3>✅ 產生完成！共 {articles.length} 篇</h3>
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>{articles.map((article, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
          <img src={article.image || 'https://via.placeholder.com/80x60/f5f0eb/c9a8a0?text=📄'} alt="" style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 6 }} />
          <div style={{ flex: 1 }}><strong>{article.title}</strong><p style={{ fontSize: 12, color: 'var(--text-light)', margin: '4px 0 0' }}>{article.content.length} 字 · {article.category}</p></div>
          <div style={{ display: 'flex', gap: 6 }}><button className="btn btn-secondary btn-sm" onClick={() => openPreview(i)} title="預覽">👁️</button>
            <button className="btn btn-secondary btn-sm" onClick={() => openEdit(i)} title="編輯">✏️</button>
            <button className="btn btn-secondary btn-sm" onClick={() => downloadMarkdown(article)} title="下載">📥</button></div></div>)}</div></div>
        <div className="card"><h3>📤 上傳方式</h3><div className="btn-group">
          <button className="btn btn-primary" onClick={downloadAllMarkdown}>📥 下載全部 Markdown</button>
          {currentSite?.github_repo && <button className="btn btn-secondary" onClick={uploadToGitHub} disabled={loading}>🐙 推送到 GitHub</button>}
          <button className="btn btn-secondary" onClick={uploadToSupabase} disabled={loading}>🗄️ 存到 Supabase</button></div></div>
        <div className="btn-group"><button className="btn btn-secondary" onClick={() => setStep(2)}>🔄 重新開始</button></div></>}
    </div>
    {renderPreviewModal()}
    {renderEditModal()}
  </>);
}