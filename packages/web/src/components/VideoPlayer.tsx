'use client';

import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import Hls from 'hls.js';
import { cn } from '@/lib/utils';
import { useAccessibility } from '@/stores/settings-store';

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
  const [volume, setVolume] = useState(1);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
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
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number>(0);
  const [isPiPSupported, setIsPiPSupported] = useState(false);
  const [isPiPActive, setIsPiPActive] = useState(false);

  const { reducedMotion } = useAccessibility();

  // Detect OS-level reduced motion preference as a fallback
  const prefersReducedMotion =
    reducedMotion ||
    (typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Keyboard controls — active whenever the player container or the window
  // receives a keydown that isn't aimed at a text input.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;

      // Don't intercept when focus is inside a form control
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          video.paused ? video.play().catch(() => {}) : video.pause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          video.currentTime = Math.min(video.duration, video.currentTime + 5);
          break;
        case 'ArrowUp':
          e.preventDefault();
          video.volume = Math.min(1, video.volume + 0.1);
          setVolume(Math.min(1, video.volume));
          break;
        case 'ArrowDown':
          e.preventDefault();
          video.volume = Math.max(0, video.volume - 0.1);
          setVolume(Math.max(0, video.volume));
          break;
        case 'm':
        case 'M':
          video.muted = !video.muted;
          setIsMuted(video.muted);
          break;
        case 'f':
        case 'F':
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            video.parentElement?.requestFullscreen();
          }
          break;
        case 'Escape':
          if (document.fullscreenElement) {
            document.exitFullscreen();
          }
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Load saved preferences
  useEffect(() => {
    const savedVolume = localStorage.getItem('exprsn-video-volume');
    const savedSpeed = localStorage.getItem('exprsn-video-speed');

    if (savedVolume) {
      const vol = parseFloat(savedVolume);
      setVolume(vol);
      if (videoRef.current) {
        videoRef.current.volume = vol;
      }
    }

    if (savedSpeed) {
      const speed = parseFloat(savedSpeed);
      setPlaybackSpeed(speed);
      if (videoRef.current) {
        videoRef.current.playbackRate = speed;
      }
    }

    // Check PiP support
    if (document.pictureInPictureEnabled) {
      setIsPiPSupported(true);
    }
  }, []);

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
      if (autoPlay && !prefersReducedMotion && video.paused) {
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
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                // Try to recover from network errors
                console.log('Attempting HLS recovery from network error...');
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                // Try to recover from media errors
                console.log('Attempting HLS recovery from media error...');
                hls.recoverMediaError();
                break;
              default:
                // Fatal error, fall back to MP4 if cdnUrl available
                console.log('Unrecoverable HLS error, attempting MP4 fallback');
                hls.destroy();
                hlsRef.current = null;
                if (video) {
                  const cdnUrl = src.replace(/\/playlist\.m3u8$/, '.mp4').replace(/\/master\.m3u8$/, '.mp4');
                  video.src = cdnUrl;
                  video.load();
                }
                break;
            }
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

  const handleVolumeChange = useCallback((newVolume: number) => {
    const video = videoRef.current;
    if (!video) return;

    video.volume = newVolume;
    setVolume(newVolume);
    localStorage.setItem('exprsn-video-volume', newVolume.toString());

    // Unmute if volume is increased from 0
    if (newVolume > 0 && video.muted) {
      video.muted = false;
      setIsMuted(false);
    }
    // Mute if volume is set to 0
    if (newVolume === 0 && !video.muted) {
      video.muted = true;
      setIsMuted(true);
    }
  }, []);

  const handleSpeedChange = useCallback((speed: number) => {
    const video = videoRef.current;
    if (!video) return;

    video.playbackRate = speed;
    setPlaybackSpeed(speed);
    localStorage.setItem('exprsn-video-speed', speed.toString());
    setShowSpeedMenu(false);
  }, []);

  const togglePiP = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !isPiPSupported) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPiPActive(false);
      } else {
        await video.requestPictureInPicture();
        setIsPiPActive(true);
      }
    } catch (error) {
      console.error('PiP error:', error);
    }
  }, [isPiPSupported]);

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
    setShowVolumeSlider(false);
    setShowSpeedMenu(false);
  }, []);

  // Handle progress bar hover for time preview
  const handleProgressHover = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const progressBar = progressRef.current;
    if (!progressBar || !duration) return;

    const rect = progressBar.getBoundingClientRect();
    const hoverX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, hoverX / rect.width));
    const time = percentage * duration;

    setHoverTime(time);
    setHoverPosition(percentage * 100);
  }, [duration]);

  const handleProgressLeave = useCallback(() => {
    setHoverTime(null);
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
        aria-label={src ? 'Video player' : 'Video player loading'}
        role="application"
        tabIndex={0}
        poster={poster}
        playsInline
        loop={loop}
        muted={isMuted}
        autoPlay={autoPlay && !prefersReducedMotion}
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
            onMouseMove={handleProgressHover}
            onMouseLeave={handleProgressLeave}
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
            {/* Time tooltip on hover */}
            {hoverTime !== null && (
              <div
                className="absolute bottom-full mb-2 -translate-x-1/2 px-2 py-1 bg-black/90 text-white text-xs rounded whitespace-nowrap pointer-events-none"
                style={{ left: `${hoverPosition}%` }}
              >
                {formatTime(hoverTime)}
              </div>
            )}
          </div>

          {/* Keyboard shortcut hints */}
          <div className="absolute bottom-2 right-2 group/shortcuts">
            <button
              className="w-6 h-6 rounded-full bg-black/40 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Keyboard shortcuts"
              onClick={(e) => e.stopPropagation()}
            >
              ?
            </button>
            <div className="absolute bottom-8 right-0 hidden group-hover/shortcuts:block bg-black/80 text-white text-xs rounded-lg p-3 w-48 space-y-1 pointer-events-none z-10">
              <div className="flex justify-between gap-2">
                <span>Play / Pause</span>
                <kbd className="font-mono bg-white/20 px-1 rounded">Space</kbd>
              </div>
              <div className="flex justify-between gap-2">
                <span>Seek ±5s</span>
                <kbd className="font-mono bg-white/20 px-1 rounded">← →</kbd>
              </div>
              <div className="flex justify-between gap-2">
                <span>Volume</span>
                <kbd className="font-mono bg-white/20 px-1 rounded">↑ ↓</kbd>
              </div>
              <div className="flex justify-between gap-2">
                <span>Mute</span>
                <kbd className="font-mono bg-white/20 px-1 rounded">M</kbd>
              </div>
              <div className="flex justify-between gap-2">
                <span>Fullscreen</span>
                <kbd className="font-mono bg-white/20 px-1 rounded">F</kbd>
              </div>
            </div>
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
                aria-label={isPlaying ? 'Pause' : 'Play'}
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

            {/* Right side: Speed, Quality, Volume, and PiP */}
            <div className="flex items-center gap-2">
              {/* Playback speed */}
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowSpeedMenu(!showSpeedMenu);
                  }}
                  aria-label={`Playback speed: ${playbackSpeed}x`}
                  aria-expanded={showSpeedMenu}
                  className="p-1.5 hover:bg-white/20 rounded transition-colors flex items-center gap-1"
                >
                  <span className="text-white text-xs font-medium min-w-[32px]">
                    {playbackSpeed}x
                  </span>
                </button>

                {/* Speed menu */}
                {showSpeedMenu && (
                  <div className="absolute bottom-full right-0 mb-2 bg-black/90 rounded-lg overflow-hidden min-w-[80px]">
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                      <button
                        key={speed}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSpeedChange(speed);
                        }}
                        className={cn(
                          'w-full px-3 py-2 text-left text-sm hover:bg-white/10 transition-colors',
                          playbackSpeed === speed ? 'text-accent' : 'text-white'
                        )}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Quality selector */}
              {qualityLevels.length > 1 && (
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowQualityMenu(!showQualityMenu);
                    }}
                    aria-label={`Video quality: ${currentQuality === -1 ? 'Auto' : qualityLevels[currentQuality]?.label || 'Auto'}`}
                    aria-expanded={showQualityMenu}
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

              {/* Volume control with slider */}
              <div
                className="relative group/volume"
                onMouseEnter={() => setShowVolumeSlider(true)}
                onMouseLeave={() => setShowVolumeSlider(false)}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMute();
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    setShowVolumeSlider(!showVolumeSlider);
                  }}
                  aria-label={isMuted || volume === 0 ? 'Unmute' : 'Mute'}
                  aria-pressed={isMuted || volume === 0}
                  className="p-1.5 hover:bg-white/20 rounded transition-colors"
                >
                  {isMuted || volume === 0 ? (
                    <MutedIcon className="w-5 h-5 text-white" />
                  ) : volume < 0.5 ? (
                    <VolumeLowIcon className="w-5 h-5 text-white" />
                  ) : (
                    <VolumeIcon className="w-5 h-5 text-white" />
                  )}
                </button>

                {/* Volume slider */}
                {showVolumeSlider && (
                  <div className="absolute bottom-full right-0 mb-2 p-2 bg-black/90 rounded-lg">
                    <div className="flex flex-col items-center h-24 w-8">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={volume}
                        aria-label={`Volume: ${Math.round(volume * 100)}%`}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleVolumeChange(parseFloat(e.target.value));
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="volume-slider h-20 w-1"
                        style={{
                          writingMode: 'vertical-lr' as React.CSSProperties['writingMode'],
                          WebkitAppearance: 'slider-vertical' as any,
                          appearance: 'auto',
                          transform: 'rotate(180deg)',
                        }}
                      />
                      <span className="text-white text-xs mt-1">
                        {Math.round(volume * 100)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Picture-in-Picture */}
              {isPiPSupported && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePiP();
                  }}
                  aria-label={isPiPActive ? 'Exit picture-in-picture' : 'Enter picture-in-picture'}
                  aria-pressed={isPiPActive}
                  className={cn(
                    'p-1.5 hover:bg-white/20 rounded transition-colors',
                    isPiPActive && 'bg-white/20'
                  )}
                >
                  <PiPIcon className="w-5 h-5 text-white" />
                </button>
              )}
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
          aria-label={isMuted ? 'Unmute' : 'Mute'}
          aria-pressed={isMuted}
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

function VolumeLowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M7 9v6h4l5 5V4l-5 5H7z" />
    </svg>
  );
}

function PiPIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h6a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V9a2 2 0 012-2h6" />
    </svg>
  );
}
