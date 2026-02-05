// src/app/api/articles/list/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { siteId } = await request.json();
    if (!siteId) return NextResponse.json({ articles: [] });

    // Get site info for domain
    const { data: site } = await supabase
      .from('sites')
      .select('slug, domain')
      .eq('id', siteId)
      .single();

    const allArticles: Array<{ title: string; slug: string; url: string }> = [];
    const seenSlugs = new Set<string>();

    // 1. From posts table (already published)
    const { data: posts } = await supabase
      .from('posts')
      .select('title, slug')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
      .limit(200);

    (posts || []).forEach((p: any) => {
      if (p.slug && !seenSlugs.has(p.slug)) {
        seenSlugs.add(p.slug);
        allArticles.push({
          title: p.title,
          slug: p.slug,
          url: `/posts/${p.slug}`,
        });
      }
    });

    // 2. From aw_articles (AI Writer generated, pushed to GitHub)
    const { data: awArticles } = await supabase
      .from('aw_articles')
      .select('title, slug')
      .eq('site_id', siteId)
      .eq('github_pushed', true)
      .order('created_at', { ascending: false })
      .limit(200);

    (awArticles || []).forEach((a: any) => {
      if (a.slug && !seenSlugs.has(a.slug)) {
        seenSlugs.add(a.slug);
        allArticles.push({
          title: a.title,
          slug: a.slug,
          url: `/posts/${a.slug}`,
        });
      }
    });

    return NextResponse.json({ articles: allArticles });
  } catch (err: any) {
    return NextResponse.json({ articles: [] });
  }
}