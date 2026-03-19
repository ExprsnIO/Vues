import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const url = searchParams.get('url');
  const maxwidth = Math.min(parseInt(searchParams.get('maxwidth') || '480', 10), 480);
  const maxheight = Math.min(parseInt(searchParams.get('maxheight') || '854', 10), 854);

  if (!url) {
    return NextResponse.json({ error: 'url parameter required' }, { status: 400 });
  }

  // Extract video URI from a URL like: https://exprsn.io/video/<encoded-uri>
  const match = url.match(/\/video\/(.+?)(?:\?.*)?$/);
  if (!match) {
    return NextResponse.json({ error: 'Invalid video URL' }, { status: 404 });
  }

  const videoUri = decodeURIComponent(match[1]);

  try {
    const res = await fetch(
      `${API_BASE}/xrpc/io.exprsn.video.getVideo?uri=${encodeURIComponent(videoUri)}`,
      { next: { revalidate: 60 } }
    );

    if (!res.ok) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const data = await res.json();
    const video = data.video;

    const thumbnail = video.video?.thumbnail || video.thumbnailUrl;
    const authorHandle = video.author?.handle ?? 'unknown';
    const authorDisplayName = video.author?.displayName || `@${authorHandle}`;
    const title = video.caption
      ? video.caption.slice(0, 100)
      : `Video by @${authorHandle}`;

    const oembed = {
      version: '1.0',
      type: 'video',
      provider_name: 'Exprsn',
      provider_url: APP_URL,
      title,
      author_name: authorDisplayName,
      author_url: `${APP_URL}/profile/${authorHandle}`,
      thumbnail_url: thumbnail ?? undefined,
      thumbnail_width: 360,
      thumbnail_height: 640,
      width: maxwidth,
      height: maxheight,
      html: `<iframe src="${APP_URL}/embed/${encodeURIComponent(videoUri)}" width="${maxwidth}" height="${maxheight}" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`,
    };

    return NextResponse.json(oembed, {
      headers: {
        'Content-Type': 'application/json+oembed',
        'Cache-Control': 'public, max-age=60, s-maxage=60',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch video' }, { status: 500 });
  }
}
