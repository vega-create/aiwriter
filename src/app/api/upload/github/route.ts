import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const { siteId, filename, content } = await request.json();
    
    // Get site config from Supabase
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('*')
      .eq('id', siteId)
      .single();
    
    if (siteError || !site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }
    
    if (!site.github_repo || !site.github_token) {
      return NextResponse.json({ error: 'GitHub not configured for this site' }, { status: 400 });
    }
    
    const filePath = `${site.github_path || 'src/content/posts/'}${filename}`;
    
    // Upload to GitHub
    const response = await fetch(
      `https://api.github.com/repos/${site.github_repo}/contents/${filePath}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${site.github_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Add article: ${filename}`,
          content: Buffer.from(content).toString('base64'),
        }),
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json({ error: error.message }, { status: response.status });
    }
    
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
