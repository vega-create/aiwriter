import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const { siteId, article } = await request.json();
    
    // Get user from cookie
    const cookieStore = cookies();
    const accessToken = cookieStore.get('sb-access-token')?.value;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get user
    let userId = null;
    if (accessToken) {
      const anonClient = createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY!, {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      });
      const { data: { user } } = await anonClient.auth.getUser();
      userId = user?.id;
    }
    
    // Insert article
    const { error } = await supabase.from('posts').insert({
      site_id: siteId,
      title: article.title,
      slug: article.slug,
      description: article.title,
      content: article.content,
      category: article.category,
      image: article.image,
      status: 'draft',
      created_by: userId,
      publish_date: new Date().toISOString().split('T')[0],
    });
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
