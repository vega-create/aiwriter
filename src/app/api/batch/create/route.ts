import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthUser } from '@/lib/auth-helper';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const { data, error } = await supabase.from('aw_batches').insert({
      user_id: user.id,
      mode: body.mode || 'single',
      status: 'draft',
      article_length: body.articleLength || 'medium',
      schedule_start: body.scheduleStart || null,
      schedule_interval: body.scheduleInterval || 1,
      site_ids: body.siteIds || [],
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ batch: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
