import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const { siteId } = await request.json();

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
      return NextResponse.json({ articles: [] });
    }

    const dirPath = site.github_path || 'src/content/posts/';

    // Fetch file list from GitHub
    const response = await fetch(
      `https://api.github.com/repos/${site.github_repo}/contents/${dirPath}`,
      {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json({ articles: [] });
    }

    const files = await response.json();
    if (!Array.isArray(files)) {
      return NextResponse.json({ articles: [] });
    }

    // Extract titles from filenames (slug → readable)
    // Also fetch a few files to get actual titles from frontmatter
    const mdFiles = files.filter((f: any) => f.name.endsWith('.md'));

    // For performance, only fetch frontmatter of latest 50 articles
    const recentFiles = mdFiles.slice(-50);

    const articles: Array<{ title: string; slug: string; url: string }> = [];

    await Promise.all(
      recentFiles.map(async (file: any) => {
        try {
          const fileRes = await fetch(file.download_url);
          const content = await fileRes.text();

          // Extract title from frontmatter
          const titleMatch = content.match(/^title:\s*"?(.+?)"?\s*$/m);
          if (titleMatch) {
            const slug = file.name.replace('.md', '');
            articles.push({
              title: titleMatch[1],
              slug,
              url: `/posts/${encodeURIComponent(slug)}/`,
            });
          }
        } catch { }
      })
    );

    return NextResponse.json({ articles });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}