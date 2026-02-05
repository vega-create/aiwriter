// src/app/api/batch/existing-titles/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
    try {
        const { siteIds } = await request.json();

        // Get titles from aw_articles
        let query = supabase.from('aw_articles').select('title, site_id, site_slug');
        if (siteIds && siteIds.length > 0) {
            query = query.in('site_id', siteIds);
        }

        const { data: awArticles } = await query;

        // Also get from posts table (existing published articles)
        let postsQuery = supabase.from('posts').select('title, site_id');
        if (siteIds && siteIds.length > 0) {
            postsQuery = postsQuery.in('site_id', siteIds);
        }

        const { data: posts } = await postsQuery;

        // Combine and deduplicate
        const allTitles = new Set<string>();
        (awArticles || []).forEach((a: any) => allTitles.add(a.title));
        (posts || []).forEach((p: any) => allTitles.add(p.title));

        return NextResponse.json({ existingTitles: Array.from(allTitles) });
    } catch (err: any) {
        return NextResponse.json({ existingTitles: [] });
    }
}