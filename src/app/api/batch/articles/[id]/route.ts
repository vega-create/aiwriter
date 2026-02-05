import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthUser } from '@/lib/auth-helper';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const { data: existing } = await supabase.from('aw_articles').select('id, batch_id').eq('id', params.id).single();
    if (!existing) return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    const { data: batch } = await supabase.from('aw_batches').select('id').eq('id', existing.batch_id).eq('user_id', user.id).single();
    if (!batch) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    const updates: any = { updated_at: new Date().toISOString() };
    if (body.content !== undefined) updates.content = body.content;
    if (body.title !== undefined) updates.title = body.title;
    if (body.category !== undefined) updates.category = body.category;
    if (body.slug !== undefined) updates.slug = body.slug;
    if (body.faq !== undefined) updates.faq = body.faq;
    if (body.images !== undefined) updates.images = body.images;
    if (body.imageKeywords !== undefined) updates.image_keywords = body.imageKeywords;
    if (body.scheduledDate !== undefined) updates.scheduled_date = body.scheduledDate;
    if (body.githubPushed !== undefined) updates.github_pushed = body.githubPushed;
    if (body.status !== undefined) updates.status = body.status;
    const { data, error } = await supabase.from('aw_articles').update(updates).eq('id', params.id).select().single();
    if (error) throw error;
    return NextResponse.json({ article: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
