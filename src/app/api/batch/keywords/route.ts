import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthUser } from '@/lib/auth-helper';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { batchId, keywords } = await request.json();
    const { data: batch } = await supabase.from('aw_batches').select('id').eq('id', batchId).eq('user_id', user.id).single();
    if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    await supabase.from('aw_keywords').delete().eq('batch_id', batchId);
    const rows = keywords.map((kw: any) => ({
      batch_id: batchId, site_id: kw.siteId || null, site_slug: kw.siteSlug || null,
      keyword: kw.keyword, difficulty: kw.difficulty || null, checked: kw.checked !== false,
    }));
    const { data, error } = await supabase.from('aw_keywords').insert(rows).select();
    if (error) throw error;
    return NextResponse.json({ keywords: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
