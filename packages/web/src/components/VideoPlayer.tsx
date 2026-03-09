'use client';

import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import Hls from 'hls.js';
import { cn } from '@/lib/utils';

export interface VideoPlayerProps {
  src: string;
  poster?: string;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  className?: string;
  showControls?: boolean;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onDoubleTap?: () => void;
}

export interface QualityLevel {
  index: number;
  height: number;
  bitrate: number;
  label: string;
}

export interface VideoPlayerHandle {
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  toggleMute: () => void;
  setQuality: (levelIndex: number) => void;
  getQualityLevels: () => QualityLevel[];
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(function VideoPlayer(
  {
    src,
    poster,
    autoPlay = false,
    loop = true,
    muted = false,
    className,
    showControls = true,
    onPlay,
    onPause,
    onEnded,
    onTimeUpdate,
    onDoubleTap,
  },
  ref
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const lastTapRef = useRef<number>(0);
  const doubleTapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(muted);
  const [showPlayIcon, setShowPlayIcon] = useState(false);
  const [showLikeAnimation, setShowLikeAnimation] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [showControlsOverlay, setShowControlsOverlay] = useState(false);
  const [qualityLevels, setQualityLevels] = useState<QualityLevel[]>([]);
  const [currentQuality, setCurrentQuality] = useState(-1); // -1 = auto
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);

  // Expose controls to parent
  useImperativeHandle(ref, () => ({
    play: () => videoRef.current?.play(),
    pause: () => videoRef.current?.pause(),
    seek: (time: number) => {
      if (videoRef.current) {
        videoRef.current.currentTime = time;
      }
    },
    toggleMute: () => {
      if (videoRef.current) {
        videoRef.current.muted = !videoRef.current.muted;
        setIsMuted(videoRef.current.muted);
      }
    },
    setQuality: (levelIndex: number) => {
      if (hlsRef.current) {
        hlsRef.current.currentLevel = levelIndex;
        setCurrentQuality(levelIndex);
      }
    },
    getQualityLevels: () => qualityLevels,
  }), [qualityLevels]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    const attemptPlay = () => {
      if (autoPlay && video.paused) {
        video.play().catch((err) => {
          console.log('Autoplay failed:', err.message);
        });
      }
    };

    if (src.includes('.m3u8')) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          startLevel: -1, // Auto quality
        });
        hls.loadSource(src);
        hls.attachMedia(video);
        hlsRef.current = hls;

        hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
          // Extract quality levels
          const levels: QualityLevel[] = data.levels.map((level, index) => ({
            index,
            height: level.height,
            bitrate: level.bitrate,
            label: level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)}kbps`,
          }));
          setQualityLevels(levels);
          attemptPlay();
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
          setCurrentQuality(data.level);
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            console.error('HLS fatal error:', data.type, data.details);
          }
        });

        return () => {
          hls.destroy();
          hlsRef.current = null;
          setQualityLevels([]);
        };
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS
        video.src = src;
        video.addEventListener('canplay', attemptPlay, { once: true });
      }
    } else {
      // For MP4 and other formats
      video.src = src;
      video.load();
      video.addEventListener('canplay', attemptPlay, { once: true });
    }

    return () => {
      video.removeEventListener('canplay', attemptPlay);
    };
  }, [src, autoPlay]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      setIsPlaying(true);
      setIsBuffering(false);
      onPlay?.();
    };

    const handlePause = () => {
      setIsPlaying(false);
      onPause?.();
    };

    const handleEnded = () => {
      if (!loop) {
        setIsPlaying(false);
      }
      onEnded?.();
    };

    const handleTimeUpdate = () => {
      if (!isSeeking) {
        setCurrentTime(video.currentTime);
      }
      setDuration(video.duration || 0);
      onTimeUpdate?.(video.currentTime, video.duration);
    };

    const handleProgress = () => {
      if (video.buffered.length > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        setBuffered(bufferedEnd);
      }
    };

    const handleWaiting = () => {
      setIsBuffering(true);
    };

    const handleCanPlay = () => {
      setIsBuffering(false);
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration || 0);
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [loop, onPlay, onPause, onEnded, onTimeUpdate, isSeeking]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  // Handle click with double-tap detection
  const handleClick = useCallback((e: React.MouseEvent) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      // Double tap detected
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
        doubleTapTimeoutRef.current = null;
      }
      setShowLikeAnimation(true);
      setTimeout(() => setShowLikeAnimation(false), 1000);
      onDoubleTap?.();
    } else {
      // Single tap - wait to see if it's a double tap
      doubleTapTimeoutRef.current = setTimeout(() => {
        togglePlay();
        setShowPlayIcon(true);
        setTimeout(() => setShowPlayIcon(false), 500);
      }, DOUBLE_TAP_DELAY);
    }

    lastTapRef.current = now;
  }, [togglePlay, onDoubleTap]);

  // Progress bar seek
  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    const progressBar = progressRef.current;
    if (!video || !progressBar || !duration) return;

    const rect = progressBar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const seekTime = percentage * duration;

    video.currentTime = seekTime;
    setCurrentTime(seekTime);
  }, [duration]);

  // Handle progress bar drag
  const handleSeekStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setIsSeeking(true);
    handleSeek(e);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const progressBar = progressRef.current;
      const video = videoRef.current;
      if (!progressBar || !video || !duration) return;

      const rect = progressBar.getBoundingClientRect();
      const clickX = moveEvent.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, clickX / rect.width));
      const seekTime = percentage * duration;

      setCurrentTime(seekTime);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      const progressBar = progressRef.current;
      const video = videoRef.current;
      if (!progressBar || !video || !duration) return;

      const rect = progressBar.getBoundingClientRect();
      const clickX = upEvent.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, clickX / rect.width));
      video.currentTime = percentage * duration;

      setIsSeeking(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [duration, handleSeek]);

  // Format time for display
  const formatTime = useCallback((seconds: number): string => {
    if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Show controls on hover
  const handleMouseEnter = useCallback(() => {
    setShowControlsOverlay(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setShowControlsOverlay(false);
    setShowQualityMenu(false);
  }, []);

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercentage = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div
      className={cn(
        'video-container relative h-full w-full bg-black cursor-pointer group',
        className
      )}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        poster={poster}
        playsInline
        loop={loop}
        muted={isMuted}
        autoPlay={autoPlay}
        preload={autoPlay ? 'auto' : 'metadata'}
      />

      {/* Buffering indicator */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* Play/Pause overlay icon */}
      {showPlayIcon && !isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/50 rounded-full p-6 animate-scale-up">
            {isPlaying ? (
              <PauseIcon className="w-12 h-12 text-white" />
            ) : (
              <PlayIcon className="w-12 h-12 text-white" />
            )}
          </div>
        </div>
      )}

      {/* Double-tap like animation */}
      {showLikeAnimation && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <HeartIcon className="w-24 h-24 text-red-500 animate-like-pop" />
        </div>
      )}

      {/* Controls overlay */}
      {showControls && (
        <div
          className={cn(
            'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 transition-opacity duration-200',
            showControlsOverlay ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Progress bar */}
          <div
            ref={progressRef}
            className="relative h-1 bg-white/30 rounded-full cursor-pointer mb-3 group/progress"
            onMouseDown={handleSeekStart}
          >
            {/* Buffered progress */}
            <div
              className="absolute top-0 left-0 h-full bg-white/50 rounded-full"
              style={{ width: `${bufferedPercentage}%` }}
            />
            {/* Current progress */}
            <div
              className="absolute top-0 left-0 h-full bg-accent rounded-full transition-all duration-75"
              style={{ width: `${progressPercentage}%` }}
            />
            {/* Seek handle */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover/progress:opacity-100 transition-opacity"
              style={{ left: `calc(${progressPercentage}% - 6px)` }}
            />
          </div>

          {/* Controls row */}
          <div className="flex items-center justify-between">
            {/* Left side: Play/Pause and Time */}
            <div className="flex items-center gap-3">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                className="p-1 hover:bg-white/20 rounded transition-colors"
              >
                {isPlaying ? (
                  <PauseIcon className="w-5 h-5 text-white" />
                ) : (
                  <PlayIcon className="w-5 h-5 text-white" />
                )}
              </button>
              <span className="text-white text-xs font-medium tabular-nums">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            {/* Right side: Quality and Mute */}
            <div className="flex items-center gap-2">
              {/* Quality selector */}
              {qualityLevels.length > 1 && (
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowQualityMenu(!showQualityMenu);
                    }}
                    className="p-1.5 hover:bg-white/20 rounded transition-colors flex items-center gap-1"
                  >
                    <SettingsIcon className="w-4 h-4 text-white" />
                    <span className="text-white text-xs">
                      {currentQuality === -1
                        ? 'Auto'
                        : qualityLevels[currentQuality]?.label || 'Auto'}
                    </span>
                  </button>

                  {/* Quality menu */}
                  {showQualityMenu && (
                    <div className="absolute bottom-full right-0 mb-2 bg-black/90 rounded-lg overflow-hidden min-w-[100px]">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (hlsRef.current) {
                            hlsRef.current.currentLevel = -1;
                            setCurrentQuality(-1);
                          }
                          setShowQualityMenu(false);
                        }}
                        className={cn(
                          'w-full px-3 py-2 text-left text-sm hover:bg-white/10 transition-colors',
                          currentQuality === -1 ? 'text-accent' : 'text-white'
                        )}
                      >
                        Auto
                      </button>
                      {qualityLevels.map((level) => (
                        <button
                          key={level.index}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (hlsRef.current) {
                              hlsRef.current.currentLevel = level.index;
                              setCurrentQuality(level.index);
                            }
                            setShowQualityMenu(false);
                          }}
                          className={cn(
                            'w-full px-3 py-2 text-left text-sm hover:bg-white/10 transition-colors',
                            currentQuality === level.index ? 'text-accent' : 'text-white'
                          )}
                        >
                          {level.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Mute button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMute();
                }}
                className="p-1.5 hover:bg-white/20 rounded transition-colors"
              >
                {isMuted ? (
                  <MutedIcon className="w-5 h-5 text-white" />
                ) : (
                  <VolumeIcon className="w-5 h-5 text-white" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Simple mute button when controls are hidden */}
      {!showControls && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleMute();
          }}
          className="absolute bottom-4 right-4 p-2 bg-black/50 rounded-full hover:bg-black/70 transition-colors"
        >
          {isMuted ? (
            <MutedIcon className="w-5 h-5 text-white" />
          ) : (
            <VolumeIcon className="w-5 h-5 text-white" />
          )}
        </button>
      )}
    </div>
  );
});

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}

function VolumeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  );
}

function MutedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
    </svg>
  );
}

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
