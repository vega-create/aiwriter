import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const { siteId, filename, content, title } = await request.json();

    // Get site config from Supabase
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('*')
      .eq('id', siteId)
      .single();

    if (siteError || !site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const githubToken = process.env.GITHUB_TOKEN;
    if (!site.github_repo || !githubToken) {
      return NextResponse.json({ error: 'GitHub not configured for this site' }, { status: 400 });
    }

    const filePath = `${site.github_path || 'src/content/posts/'}${filename}`;
    const apiUrl = `https://api.github.com/repos/${site.github_repo}/contents/${filePath}`;

    // 檢查檔案是否已存在（取得 sha）
    let sha: string | undefined;
    const checkRes = await fetch(apiUrl, {
      headers: { 'Authorization': `token ${githubToken}` }
    });
    if (checkRes.ok) {
      const existing = await checkRes.json();
      sha = existing.sha;
    }

    // Upload to GitHub
    const response = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${githubToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `Add article: ${filename}`,
        content: Buffer.from(content).toString('base64'),
        ...(sha ? { sha } : {}),
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json({ error: error.message }, { status: response.status });
    }

    // Auto-update internal_articles in Supabase
    try {
      const slug = filename.replace('.md', '');
      const domain = site.domain ? `https://${site.domain}` : '';
      const newArticle = {
        title: title || slug.replace(/-[a-z0-9]{8}$/, '').replace(/-/g, ' '),
        slug,
        url: `${domain}/posts/${slug}`,
      };

      const existingArticles = site.internal_articles || [];
      // Avoid duplicates
      const alreadyExists = existingArticles.some((a: any) => a.slug === slug);
      if (!alreadyExists) {
        await supabase
          .from('sites')
          .update({ internal_articles: [...existingArticles, newArticle] })
          .eq('id', siteId);
      }
    } catch {
      // Non-critical: don't fail the upload if this fails
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}