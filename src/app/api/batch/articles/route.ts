import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthUser } from '@/lib/auth-helper';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { batchId, article } = await request.json();
    const { data: batch } = await supabase.from('aw_batches').select('id').eq('id', batchId).eq('user_id', user.id).single();
    if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    const row = {
      batch_id: batchId, site_id: article.siteId || null, site_slug: article.siteSlug || null,
      site_name: article.siteName || null, title: article.title, slug: article.slug,
      content: article.content, category: article.category || null, faq: article.faq || [],
      images: article.images || {}, image_keywords: article.imageKeywords || {},
      scheduled_date: article.scheduledDate || null, github_pushed: false, status: 'draft',
    };
    const { data, error } = await supabase.from('aw_articles').insert(row).select().single();
    if (error) throw error;
    return NextResponse.json({ article: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
