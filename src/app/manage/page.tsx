'use client';

import { useState, useEffect } from 'react';

interface Batch {
    id: string;
    mode: string;
    status: string;
    article_length: string;
    site_ids: string[];
    created_at: string;
    aw_articles: { count: number }[];
}

interface ArticleRecord {
    id: string;
    batch_id: string;
    site_id: string;
    site_slug: string;
    site_name: string;
    title: string;
    slug: string;
    content: string;
    category: string;
    faq: Array<{ q: string; a: string }>;
    images: any;
    image_keywords: any;
    scheduled_date: string;
    github_pushed: boolean;
    status: string;
    created_at: string;
    updated_at: string;
}

interface KeywordRecord {
    id: string;
    keyword: string;
    site_slug: string;
    difficulty: string;
    checked: boolean;
}

interface TitleRecord {
    id: string;
    keyword: string;
    title: string;
    site_slug: string;
    site_name: string;
    category: string;
    checked: boolean;
}

// ========== Markdown → HTML ==========
function markdownToHtml(md: string): string {
    let html = md;
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
            let tableHtml = '<table><thead><tr>';
            headers.forEach((h: string) => { tableHtml += `<th>${h}</th>`; });
            tableHtml += '</tr></thead><tbody>';
            rows.slice(2).forEach((row: string) => {
                const cells = parseRow(row);
                tableHtml += '<tr>';
                cells.forEach((c: string) => { tableHtml += `<td>${c}</td>`; });
                tableHtml += '</tr>';
            });
            tableHtml += '</tbody></table>';
            return tableHtml;
        }
    );
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$2</h2>'.replace('$2', '$1'));
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:8px;margin:10px 0" />');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    html = html.replace(/^---$/gm, '<hr/>');
    html = html.replace(/\n{2,}/g, '</p><p>');
    html = '<p>' + html + '</p>';
    html = html.replace(/<p>\s*(<h[123]>)/g, '$1');
    html = html.replace(/(<\/h[123]>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<table>)/g, '$1');
    html = html.replace(/(<\/table>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<ul>)/g, '$1');
    html = html.replace(/(<\/ul>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<blockquote>)/g, '$1');
    html = html.replace(/(<\/blockquote>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<hr\/>)/g, '$1');
    html = html.replace(/(<hr\/>)\s*<\/p>/g, '$1');
    html = html.replace(/<p>\s*(<img )/g, '$1');
    html = html.replace(/<p>\s*<\/p>/g, '');
    return html;
}

export default function ManagePage() {
    const [user, setUser] = useState<any>(null);
    const [batches, setBatches] = useState<Batch[]>([]);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState({ type: '', message: '' });

    // Detail view
    const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
    const [batchDetail, setBatchDetail] = useState<{
        batch: any;
        keywords: KeywordRecord[];
        titles: TitleRecord[];
        articles: ArticleRecord[];
    } | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    // Article editor
    const [editArticle, setEditArticle] = useState<ArticleRecord | null>(null);
    const [editContent, setEditContent] = useState('');
    const [editTab, setEditTab] = useState<'preview' | 'markdown'>('preview');
    const [saving, setSaving] = useState(false);

    // Filters
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [filterSite, setFilterSite] = useState<string>('all');

    useEffect(() => { checkAuth(); }, []);

    async function checkAuth() {
        try {
            const res = await fetch('/api/auth/me');
            const data = await res.json();
            if (res.ok) {
                setUser(data.user);
                loadBatches();
            }
        } catch { }
        setLoading(false);
    }

    async function loadBatches() {
        try {
            const res = await fetch('/api/batch/list');
            const data = await res.json();
            if (res.ok) setBatches(data.batches || []);
        } catch { }
    }

    async function openBatch(batchId: string) {
        setSelectedBatch(batchId);
        setDetailLoading(true);
        setBatchDetail(null);
        try {
            const res = await fetch(`/api/batch/${batchId}`);
            const data = await res.json();
            if (res.ok) setBatchDetail(data);
        } catch { }
        setDetailLoading(false);
    }

    function closeBatch() {
        setSelectedBatch(null);
        setBatchDetail(null);
        setEditArticle(null);
    }

    function openEditor(article: ArticleRecord) {
        setEditArticle(article);
        setEditContent(article.content);
        setEditTab('preview');
    }

    async function saveArticle() {
        if (!editArticle) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/batch/articles/${editArticle.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: editContent }),
            });
            if (res.ok) {
                setStatus({ type: 'success', message: '文章已儲存！' });
                // Update local state
                if (batchDetail) {
                    const updated = batchDetail.articles.map((a) =>
                        a.id === editArticle.id ? { ...a, content: editContent } : a
                    );
                    setBatchDetail({ ...batchDetail, articles: updated });
                }
                setEditArticle({ ...editArticle, content: editContent });
            } else {
                throw new Error('Save failed');
            }
        } catch {
            setStatus({ type: 'error', message: '儲存失敗' });
        }
        setSaving(false);
    }

    async function pushSingleToGitHub(article: ArticleRecord) {
        setStatus({ type: 'info', message: `推送 "${article.title}" 到 GitHub...` });
        try {
            // Generate markdown with frontmatter
            const date = article.scheduled_date || new Date().toISOString().split('T')[0];
            const coverImage = article.images?.cover?.selected?.url || '';
            const coverAlt = article.images?.cover?.selected?.alt || article.title;
            const faqYaml = (article.faq || []).map((f: any) => `  - q: "${f.q}"\n    a: "${f.a}"`).join('\n');

            const markdown = `---
title: "${article.title}"
description: "${article.title}"
publishDate: ${date}
category: ${article.category || 'general'}
tags: []
image: "${coverImage}"
imageAlt: "${coverAlt}"
faq:
${faqYaml}
---

${article.content}`;

            const res = await fetch('/api/upload/github', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    siteId: article.site_id,
                    filename: `${article.slug}.md`,
                    content: markdown,
                }),
            });

            if (res.ok) {
                // Mark as pushed
                await fetch(`/api/batch/articles/${article.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ githubPushed: true, status: 'published' }),
                });
                // Update local state
                if (batchDetail) {
                    const updated = batchDetail.articles.map((a) =>
                        a.id === article.id ? { ...a, github_pushed: true, status: 'published' } : a
                    );
                    setBatchDetail({ ...batchDetail, articles: updated });
                }
                setStatus({ type: 'success', message: `"${article.title}" 已推送！` });
            } else {
                throw new Error('Push failed');
            }
        } catch {
            setStatus({ type: 'error', message: `推送失敗` });
        }
    }

    async function pushAllToGitHub() {
        if (!batchDetail) return;
        const unpushed = batchDetail.articles.filter((a) => !a.github_pushed);
        if (unpushed.length === 0) {
            setStatus({ type: 'info', message: '所有文章都已推送' });
            return;
        }
        setStatus({ type: 'info', message: `開始推送 ${unpushed.length} 篇文章...` });
        let success = 0;
        for (const article of unpushed) {
            await pushSingleToGitHub(article);
            success++;
            await new Promise((r) => setTimeout(r, 1000));
        }
        setStatus({ type: 'success', message: `推送完成！${success}/${unpushed.length} 篇成功` });
    }

    // Helpers
    function formatDate(dateStr: string) {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString('zh-TW', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
        });
    }

    function getStatusBadge(status: string, pushed: boolean) {
        if (pushed) return { label: '✅ 已推送', color: '#28a745' };
        if (status === 'published') return { label: '📤 已發布', color: '#17a2b8' };
        return { label: '📝 草稿', color: '#ffc107' };
    }

    // Filtered articles
    const filteredArticles = batchDetail?.articles.filter((a) => {
        if (filterStatus !== 'all') {
            if (filterStatus === 'pushed' && !a.github_pushed) return false;
            if (filterStatus === 'draft' && a.github_pushed) return false;
        }
        if (filterSite !== 'all' && a.site_slug !== filterSite) return false;
        return true;
    }) || [];

    // ========== Login check ==========
    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
                <p>載入中...</p>
            </div>
        );
    }

    if (!user) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
                <div className="card" style={{ maxWidth: 400, textAlign: 'center' }}>
                    <h3>請先登入</h3>
                    <p style={{ margin: '15px 0', color: 'var(--text-light)' }}>前往首頁登入後再來管理文章</p>
                    <a href="/" className="btn btn-primary">前往首頁</a>
                </div>
            </div>
        );
    }

    // ========== Article Editor Modal ==========
    if (editArticle) {
        return (
            <>
                <header className="header">
                    <div className="header-content">
                        <h1 style={{ cursor: 'pointer' }} onClick={() => setEditArticle(null)}>
                            ← 返回文章列表
                        </h1>
                        <div className="header-user">
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={saveArticle}
                                disabled={saving}
                            >
                                {saving ? '儲存中...' : '💾 儲存'}
                            </button>
                            <button
                                className="btn btn-success btn-sm"
                                onClick={() => pushSingleToGitHub(editArticle)}
                            >
                                🚀 推送 GitHub
                            </button>
                        </div>
                    </div>
                </header>
                <div className="container">
                    {status.message && (
                        <div className={`status-bar ${status.type}`} style={{ marginBottom: 15 }}>
                            {status.message}
                        </div>
                    )}

                    <div className="card" style={{ marginBottom: 15 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: 20 }}>{editArticle.title}</h3>
                                <div style={{ display: 'flex', gap: 15, marginTop: 8, fontSize: 13, color: 'var(--text-light)' }}>
                                    <span>🏷️ {editArticle.category}</span>
                                    <span>🌐 {editArticle.site_name || editArticle.site_slug}</span>
                                    <span>📅 {editArticle.scheduled_date}</span>
                                    {(() => {
                                        const badge = getStatusBadge(editArticle.status, editArticle.github_pushed);
                                        return <span style={{ color: badge.color }}>{badge.label}</span>;
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Tab Toggle */}
                    <div style={{ display: 'flex', gap: 5, marginBottom: 15 }}>
                        <button
                            className={`btn btn-sm ${editTab === 'preview' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setEditTab('preview')}
                        >
                            👁️ 預覽
                        </button>
                        <button
                            className={`btn btn-sm ${editTab === 'markdown' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setEditTab('markdown')}
                        >
                            ✏️ 編輯 Markdown
                        </button>
                    </div>

                    <div className="card">
                        {editTab === 'preview' ? (
                            <div
                                className="article-preview"
                                dangerouslySetInnerHTML={{ __html: markdownToHtml(editContent) }}
                            />
                        ) : (
                            <textarea
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                style={{
                                    width: '100%',
                                    minHeight: 600,
                                    fontFamily: 'monospace',
                                    fontSize: 14,
                                    lineHeight: 1.6,
                                    padding: 15,
                                    border: '1px solid var(--border)',
                                    borderRadius: 8,
                                    resize: 'vertical',
                                }}
                            />
                        )}
                    </div>

                    {/* FAQ Section */}
                    {editArticle.faq && editArticle.faq.length > 0 && (
                        <div className="card" style={{ marginTop: 15 }}>
                            <h3>❓ FAQ ({editArticle.faq.length})</h3>
                            {editArticle.faq.map((f: any, i: number) => (
                                <div key={i} style={{ marginBottom: 12, padding: '10px 15px', background: 'var(--gray)', borderRadius: 8 }}>
                                    <strong>Q: {f.q}</strong>
                                    <p style={{ marginTop: 4, fontSize: 14, color: 'var(--text-light)' }}>A: {f.a}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </>
        );
    }

    // ========== Batch Detail View ==========
    if (selectedBatch) {
        return (
            <>
                <header className="header">
                    <div className="header-content">
                        <h1 style={{ cursor: 'pointer' }} onClick={closeBatch}>
                            ← 返回批次列表
                        </h1>
                        <div className="header-user">
                            {batchDetail && batchDetail.articles.length > 0 && (
                                <button className="btn btn-success btn-sm" onClick={pushAllToGitHub}>
                                    🚀 全部推送 GitHub
                                </button>
                            )}
                        </div>
                    </div>
                </header>
                <div className="container">
                    {status.message && (
                        <div className={`status-bar ${status.type}`} style={{ marginBottom: 15 }}>
                            {status.message}
                        </div>
                    )}

                    {detailLoading ? (
                        <div style={{ textAlign: 'center', padding: 60 }}>
                            <div className="spinner" />
                            <p style={{ marginTop: 15 }}>載入批次資料...</p>
                        </div>
                    ) : batchDetail ? (
                        <>
                            {/* Batch Summary */}
                            <div className="card">
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 20 }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary-dark)' }}>
                                            {batchDetail.articles.length}
                                        </div>
                                        <div style={{ fontSize: 13, color: 'var(--text-light)' }}>篇文章</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 28, fontWeight: 700, color: '#28a745' }}>
                                            {batchDetail.articles.filter((a) => a.github_pushed).length}
                                        </div>
                                        <div style={{ fontSize: 13, color: 'var(--text-light)' }}>已推送</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 28, fontWeight: 700, color: '#ffc107' }}>
                                            {batchDetail.articles.filter((a) => !a.github_pushed).length}
                                        </div>
                                        <div style={{ fontSize: 13, color: 'var(--text-light)' }}>草稿</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)' }}>
                                            {batchDetail.keywords.length}
                                        </div>
                                        <div style={{ fontSize: 13, color: 'var(--text-light)' }}>關鍵字</div>
                                    </div>
                                </div>
                            </div>

                            {/* Filters */}
                            {batchDetail.articles.length > 0 && (
                                <div style={{ display: 'flex', gap: 10, marginBottom: 15, flexWrap: 'wrap' }}>
                                    <select
                                        value={filterStatus}
                                        onChange={(e) => setFilterStatus(e.target.value)}
                                        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
                                    >
                                        <option value="all">全部狀態</option>
                                        <option value="draft">📝 草稿</option>
                                        <option value="pushed">✅ 已推送</option>
                                    </select>
                                    {(() => {
                                        const sites = Array.from(new Set(batchDetail.articles.map((a) => a.site_slug).filter(Boolean)));
                                        if (sites.length <= 1) return null;
                                        return (
                                            <select
                                                value={filterSite}
                                                onChange={(e) => setFilterSite(e.target.value)}
                                                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
                                            >
                                                <option value="all">全部網站</option>
                                                {sites.map((s) => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                        );
                                    })()}
                                </div>
                            )}

                            {/* Articles Table */}
                            {filteredArticles.length > 0 ? (
                                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                                        <thead>
                                            <tr style={{ background: 'var(--gray)', textAlign: 'left' }}>
                                                <th style={{ padding: '12px 15px', fontWeight: 500 }}>標題</th>
                                                <th style={{ padding: '12px 15px', fontWeight: 500, width: 100 }}>網站</th>
                                                <th style={{ padding: '12px 15px', fontWeight: 500, width: 100 }}>分類</th>
                                                <th style={{ padding: '12px 15px', fontWeight: 500, width: 110 }}>排程日期</th>
                                                <th style={{ padding: '12px 15px', fontWeight: 500, width: 90 }}>狀態</th>
                                                <th style={{ padding: '12px 15px', fontWeight: 500, width: 180 }}>操作</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredArticles.map((article) => {
                                                const badge = getStatusBadge(article.status, article.github_pushed);
                                                return (
                                                    <tr
                                                        key={article.id}
                                                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                                                        onMouseEnter={(e) => (e.currentTarget.style.background = '#faf8f6')}
                                                        onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                                                    >
                                                        <td
                                                            style={{ padding: '12px 15px' }}
                                                            onClick={() => openEditor(article)}
                                                        >
                                                            <div style={{ fontWeight: 500 }}>{article.title}</div>
                                                            <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 2 }}>
                                                                /{article.slug}
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '12px 15px', fontSize: 13 }}>
                                                            {article.site_name || article.site_slug || '-'}
                                                        </td>
                                                        <td style={{ padding: '12px 15px', fontSize: 13 }}>
                                                            {article.category || '-'}
                                                        </td>
                                                        <td style={{ padding: '12px 15px', fontSize: 13 }}>
                                                            {article.scheduled_date || '-'}
                                                        </td>
                                                        <td style={{ padding: '12px 15px' }}>
                                                            <span style={{
                                                                padding: '3px 10px',
                                                                borderRadius: 20,
                                                                fontSize: 12,
                                                                background: badge.color + '20',
                                                                color: badge.color,
                                                                fontWeight: 500,
                                                            }}>
                                                                {badge.label}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '12px 15px' }}>
                                                            <div style={{ display: 'flex', gap: 6 }}>
                                                                <button
                                                                    className="btn btn-secondary btn-sm"
                                                                    style={{ padding: '5px 10px', fontSize: 12 }}
                                                                    onClick={(e) => { e.stopPropagation(); openEditor(article); }}
                                                                >
                                                                    ✏️ 編輯
                                                                </button>
                                                                {!article.github_pushed && (
                                                                    <button
                                                                        className="btn btn-success btn-sm"
                                                                        style={{ padding: '5px 10px', fontSize: 12 }}
                                                                        onClick={(e) => { e.stopPropagation(); pushSingleToGitHub(article); }}
                                                                    >
                                                                        🚀 推送
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-light)' }}>
                                    {batchDetail.articles.length === 0
                                        ? '此批次還沒有文章'
                                        : '沒有符合篩選條件的文章'}
                                </div>
                            )}

                            {/* Keywords & Titles (collapsed) */}
                            {batchDetail.keywords.length > 0 && (
                                <details style={{ marginTop: 15 }}>
                                    <summary className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                                        📋 查看關鍵字 ({batchDetail.keywords.length})
                                    </summary>
                                    <div className="card" style={{ marginTop: 10 }}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                            {batchDetail.keywords.map((kw) => (
                                                <span key={kw.id} style={{
                                                    padding: '4px 12px',
                                                    background: 'var(--gray)',
                                                    borderRadius: 20,
                                                    fontSize: 13,
                                                }}>
                                                    {kw.keyword}
                                                    {kw.difficulty && <span style={{ color: 'var(--text-light)', marginLeft: 4 }}>({kw.difficulty})</span>}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </details>
                            )}

                            {batchDetail.titles.length > 0 && (
                                <details style={{ marginTop: 10 }}>
                                    <summary className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                                        📝 查看標題 ({batchDetail.titles.length})
                                    </summary>
                                    <div className="card" style={{ marginTop: 10 }}>
                                        {batchDetail.titles.map((t) => (
                                            <div key={t.id} style={{
                                                padding: '8px 0',
                                                borderBottom: '1px solid var(--border)',
                                                fontSize: 14,
                                            }}>
                                                <span style={{ fontWeight: 500 }}>{t.title}</span>
                                                <span style={{ color: 'var(--text-light)', marginLeft: 10, fontSize: 12 }}>
                                                    🔑 {t.keyword} · 🌐 {t.site_name || t.site_slug}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            )}
                        </>
                    ) : (
                        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                            <p>載入失敗，請重試</p>
                        </div>
                    )}
                </div>
            </>
        );
    }

    // ========== Batch List View ==========
    return (
        <>
            <header className="header">
                <div className="header-content">
                    <h1>📋 文章管理</h1>
                    <div className="header-user">
                        <a href="/" className="btn btn-secondary btn-sm">✍️ 產文</a>
                        <a href="/batch" className="btn btn-secondary btn-sm">📦 批量</a>
                        <span style={{ fontSize: 13 }}>{user?.email}</span>
                    </div>
                </div>
            </header>
            <div className="container">
                {status.message && (
                    <div className={`status-bar ${status.type}`} style={{ marginBottom: 15 }}>
                        {status.message}
                    </div>
                )}

                <div style={{ marginBottom: 25 }}>
                    <h2 style={{ fontSize: 20, marginBottom: 5 }}>歷史批次</h2>
                    <p style={{ color: 'var(--text-light)', fontSize: 14 }}>
                        查看所有產文記錄，管理文章狀態
                    </p>
                </div>

                {batches.length === 0 ? (
                    <div className="card" style={{ textAlign: 'center', padding: 60 }}>
                        <div style={{ fontSize: 48, marginBottom: 15 }}>📭</div>
                        <p style={{ fontSize: 16, marginBottom: 10 }}>還沒有產文記錄</p>
                        <p style={{ color: 'var(--text-light)', fontSize: 14, marginBottom: 20 }}>
                            去產文頁面開始你的第一批文章吧！
                        </p>
                        <a href="/" className="btn btn-primary">開始產文</a>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: 15 }}>
                        {batches.map((batch) => {
                            const articleCount = batch.aw_articles?.[0]?.count || 0;
                            const isMulti = batch.mode === 'batch';
                            return (
                                <div
                                    key={batch.id}
                                    className="card"
                                    style={{ cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s' }}
                                    onClick={() => openBatch(batch.id)}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                        e.currentTarget.style.boxShadow = '0 5px 25px rgba(0,0,0,0.1)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = '';
                                        e.currentTarget.style.boxShadow = '';
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                                <span style={{ fontSize: 20 }}>{isMulti ? '📦' : '✍️'}</span>
                                                <h3 style={{ margin: 0, fontSize: 16 }}>
                                                    {isMulti ? '多站批量' : '單站產文'} · {articleCount} 篇文章
                                                </h3>
                                                <span style={{
                                                    padding: '2px 10px',
                                                    borderRadius: 20,
                                                    fontSize: 11,
                                                    background: batch.status === 'draft' ? '#ffc10720' : '#28a74520',
                                                    color: batch.status === 'draft' ? '#ffc107' : '#28a745',
                                                    fontWeight: 500,
                                                }}>
                                                    {batch.status === 'draft' ? '草稿' : batch.status}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', gap: 20, fontSize: 13, color: 'var(--text-light)' }}>
                                                <span>📅 {formatDate(batch.created_at)}</span>
                                                <span>📐 {batch.article_length === 'medium' ? '中篇' : batch.article_length === 'long' ? '長篇' : '超長篇'}</span>
                                            </div>
                                        </div>
                                        <div style={{ fontSize: 20, color: 'var(--text-light)' }}>→</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </>
    );
}