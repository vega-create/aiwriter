import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthUser } from '@/lib/auth-helper';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: batch, error: batchError } = await supabase.from('aw_batches')
      .select('*').eq('id', params.id).eq('user_id', user.id).single();
    if (batchError || !batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    const { data: keywords } = await supabase.from('aw_keywords').select('*').eq('batch_id', params.id).order('created_at');
    const { data: titles } = await supabase.from('aw_titles').select('*').eq('batch_id', params.id).order('created_at');
    const { data: articles } = await supabase.from('aw_articles').select('*').eq('batch_id', params.id).order('created_at');
    return NextResponse.json({ batch, keywords: keywords || [], titles: titles || [], articles: articles || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: batch } = await supabase.from('aw_batches')
      .select('id').eq('id', params.id).eq('user_id', user.id).single();
    if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    const body = await request.json();
    const updates: any = {};
    if (body.status) updates.status = body.status;
    const { error } = await supabase.from('aw_batches').update(updates).eq('id', params.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
