import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    
    // Get user's sites
    const { data: userSites } = await supabase
      .from('user_sites')
      .select('*, sites(*)')
      .eq('user_id', data.user.id);
    
    const sites = userSites?.map(us => us.sites) || [];
    
    // Get user role (check if admin)
    const isAdmin = userSites?.some(us => us.role === 'admin');
    
    // Set session cookie
    const response = NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        role: isAdmin ? 'admin' : 'editor',
      },
      sites,
    });
    
    // Store session in cookie
    response.cookies.set('sb-access-token', data.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    
    response.cookies.set('sb-refresh-token', data.session.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
    });
    
    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
