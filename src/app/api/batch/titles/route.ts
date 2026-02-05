import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthUser } from '@/lib/auth-helper';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { batchId, titles } = await request.json();
    const { data: batch } = await supabase.from('aw_batches').select('id').eq('id', batchId).eq('user_id', user.id).single();
    if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    await supabase.from('aw_titles').delete().eq('batch_id', batchId);
    const rows = titles.map((t: any) => ({
      batch_id: batchId, site_id: t.siteId || null, site_slug: t.siteSlug || null,
      site_name: t.siteName || null, keyword: t.keyword, title: t.title,
      category: t.category || null, checked: t.checked !== false,
    }));
    const { data, error } = await supabase.from('aw_titles').insert(rows).select();
    if (error) throw error;
    return NextResponse.json({ titles: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
