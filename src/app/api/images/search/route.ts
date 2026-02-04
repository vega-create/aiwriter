import { NextRequest, NextResponse } from 'next/server';

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!PEXELS_API_KEY) {
      return NextResponse.json({ error: 'Pexels API key not configured' }, { status: 500 });
    }

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=20`,
      { headers: { Authorization: PEXELS_API_KEY } }
    );

    const data = await response.json();

    if (!data.photos?.length) {
      return NextResponse.json({ candidates: [] });
    }

    const candidates = data.photos.map((photo: any) => ({
      url: photo.src.large2x,
      thumbnail: photo.src.medium,
      alt: photo.alt || query,
      photographer: photo.photographer,
    }));

    return NextResponse.json({ candidates });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
