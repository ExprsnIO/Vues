'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';

interface VideoData {
  uri: string;
  caption?: string;
  author?: {
    handle: string;
    displayName?: string;
  };
  video?: {
    thumbnail?: string;
    hlsPlaylist?: string;
    cdnUrl?: string;
  };
  // Legacy flat fields
  thumbnailUrl?: string;
  hlsPlaylist?: string;
  cdnUrl?: string;
}

export default function EmbedPage() {
  const params = useParams();
  const rawUri = Array.isArray(params.uri) ? params.uri[0] : params.uri;
  const decodedUri = rawUri ? decodeURIComponent(rawUri) : '';

  const [video, setVideo] = useState<VideoData | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!decodedUri) return;

    fetch(`${API_BASE}/xrpc/io.exprsn.video.getVideo?uri=${encodeURIComponent(decodedUri)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then((data) => {
        setVideo(data.video);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [decodedUri]);

  useEffect(() => {
    if (!video) return;

    const hlsUrl = video.video?.hlsPlaylist || video.hlsPlaylist;
    const el = videoRef.current;
    if (!hlsUrl || !el) return;

    let destroyed = false;

    import('hls.js').then(({ default: Hls }) => {
      if (destroyed || !videoRef.current) return;
      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(hlsUrl);
        hls.attachMedia(videoRef.current);
        (videoRef.current as HTMLVideoElement & { _hls?: typeof hls })._hls = hls;
      } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        videoRef.current.src = hlsUrl;
      }
    });

    return () => {
      destroyed = true;
      const el = videoRef.current as (HTMLVideoElement & { _hls?: { destroy(): void } }) | null;
      el?._hls?.destroy();
    };
  }, [video]);

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#000',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            border: '3px solid #f83b85',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#000',
          color: '#fff',
          fontFamily: 'system-ui, sans-serif',
          fontSize: 14,
        }}
      >
        Video not found
      </div>
    );
  }

  const hlsUrl = video.video?.hlsPlaylist || video.hlsPlaylist;
  const cdnUrl = video.video?.cdnUrl || video.cdnUrl;
  const thumbnail = video.video?.thumbnail || video.thumbnailUrl;
  const videoPageUrl = `${APP_URL}/video/${encodeURIComponent(decodedUri)}`;

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #000; overflow: hidden; }
        .embed-container { position: relative; width: 100vw; height: 100vh; }
        video { width: 100%; height: 100%; object-fit: contain; display: block; }
        .watermark {
          position: absolute;
          bottom: 12px;
          left: 12px;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 6px;
          background: rgba(0,0,0,0.6);
          backdrop-filter: blur(4px);
          text-decoration: none;
          color: #fff;
          font-family: system-ui, sans-serif;
          font-size: 12px;
          font-weight: 600;
          transition: background 0.2s;
          z-index: 10;
        }
        .watermark:hover { background: rgba(0,0,0,0.85); }
        .author {
          position: absolute;
          bottom: 12px;
          right: 12px;
          padding: 4px 10px;
          border-radius: 6px;
          background: rgba(0,0,0,0.6);
          backdrop-filter: blur(4px);
          color: #fff;
          font-family: system-ui, sans-serif;
          font-size: 11px;
          z-index: 10;
          max-width: 150px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>

      <div className="embed-container">
        <video
          ref={videoRef}
          poster={thumbnail || undefined}
          controls
          autoPlay
          muted
          loop
          playsInline
        >
          {cdnUrl && !hlsUrl && <source src={cdnUrl} type="video/mp4" />}
        </video>

        <a
          className="watermark"
          href={videoPageUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <rect width="24" height="24" rx="5" fill="#f83b85" />
            <text
              x="12"
              y="17"
              fontSize="14"
              fontWeight="800"
              fill="white"
              textAnchor="middle"
              fontFamily="system-ui, sans-serif"
            >
              E
            </text>
          </svg>
          Exprsn
        </a>

        {video.author && (
          <div className="author">@{video.author.handle}</div>
        )}
      </div>
    </>
  );
}
