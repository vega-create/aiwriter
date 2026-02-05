#!/bin/bash
# AI Writer Batch API 安裝腳本
# 在 ai-writer-system 目錄下執行: bash install-batch-api.sh

set -e
echo "🚀 安裝 Batch API..."

# 1. auth-helper
echo "📁 建立 src/lib/auth-helper.ts"
cat > src/lib/auth-helper.ts << 'EOF'
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

export async function getAuthUser() {
  const cookieStore = cookies();
  const accessToken = cookieStore.get('sb-access-token')?.value;
  if (!accessToken) return null;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}
EOF

# 2. POST /api/batch/create
echo "📁 建立 api/batch/create"
mkdir -p src/app/api/batch/create
cat > src/app/api/batch/create/route.ts << 'EOF'
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthUser } from '@/lib/auth-helper';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();

    const { data, error } = await supabase
      .from('aw_batches')
      .insert({
        user_id: user.id,
        mode: body.mode || 'single',
        status: 'draft',
        article_length: body.articleLength || 'medium',
        schedule_start: body.scheduleStart || null,
        schedule_interval: body.scheduleInterval || 1,
        site_ids: body.siteIds || [],
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ batch: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
EOF

# 3. GET /api/batch/list
echo "📁 建立 api/batch/list"
mkdir -p src/app/api/batch/list
cat > src/app/api/batch/list/route.ts << 'EOF'
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthUser } from '@/lib/auth-helper';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('aw_batches')
      .select('*, aw_articles(count)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return NextResponse.json({ batches: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
EOF

# 4. GET /api/batch/[id]
echo "📁 建立 api/batch/[id]"
mkdir -p "src/app/api/batch/[id]"
cat > "src/app/api/batch/[id]/route.ts" << 'EOF'
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthUser } from '@/lib/auth-helper';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: batch, error: batchError } = await supabase
      .from('aw_batches')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single();

    if (batchError || !batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    const { data: keywords } = await supabase
      .from('aw_keywords')
      .select('*')
      .eq('batch_id', params.id)
      .order('created_at');

    const { data: titles } = await supabase
      .from('aw_titles')
      .select('*')
      .eq('batch_id', params.id)
      .order('created_at');

    const { data: articles } = await supabase
      .from('aw_articles')
      .select('*')
      .eq('batch_id', params.id)
      .order('created_at');

    return NextResponse.json({
      batch,
      keywords: keywords || [],
      titles: titles || [],
      articles: articles || [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
EOF

# 5. POST /api/batch/keywords
echo "📁 建立 api/batch/keywords"
mkdir -p src/app/api/batch/keywords
cat > src/app/api/batch/keywords/route.ts << 'EOF'
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthUser } from '@/lib/auth-helper';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { batchId, keywords } = await request.json();

    const { data: batch } = await supabase
      .from('aw_batches')
      .select('id')
      .eq('id', batchId)
      .eq('user_id', user.id)
      .single();

    if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });

    await supabase.from('aw_keywords').delete().eq('batch_id', batchId);

    const rows = keywords.map((kw: any) => ({
      batch_id: batchId,
      site_id: kw.siteId || null,
      site_slug: kw.siteSlug || null,
      keyword: kw.keyword,
      difficulty: kw.difficulty || null,
      checked: kw.checked !== false,
    }));

    const { data, error } = await supabase
      .from('aw_keywords')
      .insert(rows)
      .select();

    if (error) throw error;
    return NextResponse.json({ keywords: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
EOF

# 6. POST /api/batch/titles
echo "📁 建立 api/batch/titles"
mkdir -p src/app/api/batch/titles
cat > src/app/api/batch/titles/route.ts << 'EOF'
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthUser } from '@/lib/auth-helper';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { batchId, titles } = await request.json();

    const { data: batch } = await supabase
      .from('aw_batches')
      .select('id')
      .eq('id', batchId)
      .eq('user_id', user.id)
      .single();

    if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });

    await supabase.from('aw_titles').delete().eq('batch_id', batchId);

    const rows = titles.map((t: any) => ({
      batch_id: batchId,
      site_id: t.siteId || null,
      site_slug: t.siteSlug || null,
      site_name: t.siteName || null,
      keyword: t.keyword,
      title: t.title,
      category: t.category || null,
      checked: t.checked !== false,
    }));

    const { data, error } = await supabase
      .from('aw_titles')
      .insert(rows)
      .select();

    if (error) throw error;
    return NextResponse.json({ titles: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
EOF

# 7. POST /api/batch/articles
echo "📁 建立 api/batch/articles"
mkdir -p src/app/api/batch/articles
cat > src/app/api/batch/articles/route.ts << 'EOF'
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthUser } from '@/lib/auth-helper';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { batchId, article } = await request.json();

    const { data: batch } = await supabase
      .from('aw_batches')
      .select('id')
      .eq('id', batchId)
      .eq('user_id', user.id)
      .single();

    if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });

    const row = {
      batch_id: batchId,
      site_id: article.siteId || null,
      site_slug: article.siteSlug || null,
      site_name: article.siteName || null,
      title: article.title,
      slug: article.slug,
      content: article.content,
      category: article.category || null,
      faq: article.faq || [],
      images: article.images || {},
      image_keywords: article.imageKeywords || {},
      scheduled_date: article.scheduledDate || null,
      github_pushed: false,
      status: 'draft',
    };

    const { data, error } = await supabase
      .from('aw_articles')
      .insert(row)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ article: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
EOF

# 8. PATCH /api/batch/articles/[id]
echo "📁 建立 api/batch/articles/[id]"
mkdir -p "src/app/api/batch/articles/[id]"
cat > "src/app/api/batch/articles/[id]/route.ts" << 'EOF'
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthUser } from '@/lib/auth-helper';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();

    // Verify ownership via batch
    const { data: existing } = await supabase
      .from('aw_articles')
      .select('id, batch_id')
      .eq('id', params.id)
      .single();

    if (!existing) return NextResponse.json({ error: 'Article not found' }, { status: 404 });

    const { data: batch } = await supabase
      .from('aw_batches')
      .select('id')
      .eq('id', existing.batch_id)
      .eq('user_id', user.id)
      .single();

    if (!batch) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    // Build update object
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

    const { data, error } = await supabase
      .from('aw_articles')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ article: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
EOF

echo ""
echo "✅ 全部完成！建立了以下檔案："
echo "  src/lib/auth-helper.ts"
echo "  src/app/api/batch/create/route.ts"
echo "  src/app/api/batch/list/route.ts"
echo "  src/app/api/batch/[id]/route.ts"
echo "  src/app/api/batch/keywords/route.ts"
echo "  src/app/api/batch/titles/route.ts"
echo "  src/app/api/batch/articles/route.ts"
echo "  src/app/api/batch/articles/[id]/route.ts"
echo ""
echo "🚀 接下來部署: vercel --prod"
