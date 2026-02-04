import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const accessToken = cookieStore.get('sb-access-token')?.value;
    
    if (!accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });
    
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }
    
    // Get user's sites
    const { data: userSites } = await supabase
      .from('user_sites')
      .select('*, sites(*)')
      .eq('user_id', user.id);
    
    const sites = userSites?.map(us => us.sites) || [];
    const isAdmin = userSites?.some(us => us.role === 'admin');
    
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        role: isAdmin ? 'admin' : 'editor',
      },
      sites,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
