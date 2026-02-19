'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  TextOverlay,
  Caption,
  CaptionStyle,
  AudioTrack,
  Sound,
  BlendMode,
  TransitionType,
  EasingType,
  Transition,
  Keyframe,
  AnimatableProperty,
} from './types';
import { getEasingFunction, EASING_CATEGORIES, lerp } from './easing';

interface LoopEditorProps {
  originalVideo: {
    uri: string;
    thumbnailUrl?: string;
    videoUrl?: string;
    duration: number;
    author: {
      handle: string;
      displayName?: string;
    };
    caption?: string;
  };
  clipStart: number;
  clipEnd: number;
  onClipChange: (start: number, end: number) => void;
  onPublish: (data: LoopPublishData) => void;
  onCancel: () => void;
}

export interface LoopPublishData {
  originalUri: string;
  clipStart: number;
  clipEnd: number;
  responseVideoFile?: File;
  caption: string;
  textOverlays: TextOverlay[];
  captions: Caption[];
  audioTracks: AudioTrack[];
  transition: Transition | null;
}

type EditorTab = 'clip' | 'response' | 'text' | 'captions' | 'music' | 'effects' | 'preview';

const MAX_CLIP_DURATION = 5;
const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;
const FPS = 30;

const BLEND_MODES: BlendMode[] = [
  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
  'color-dodge', 'color-burn', 'hard-light', 'soft-light',
  'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
];

const TRANSITION_TYPES: { value: TransitionType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'cross-dissolve', label: 'Cross Dissolve' },
  { value: 'fade-to-black', label: 'Fade to Black' },
  { value: 'fade-to-white', label: 'Fade to White' },
  { value: 'wipe-left', label: 'Wipe Left' },
  { value: 'wipe-right', label: 'Wipe Right' },
  { value: 'wipe-up', label: 'Wipe Up' },
  { value: 'wipe-down', label: 'Wipe Down' },
  { value: 'push-left', label: 'Push Left' },
  { value: 'push-right', label: 'Push Right' },
  { value: 'zoom-in', label: 'Zoom In' },
  { value: 'zoom-out', label: 'Zoom Out' },
  { value: 'iris-in', label: 'Iris In' },
  { value: 'iris-out', label: 'Iris Out' },
];

export function LoopEditor({
  originalVideo,
  clipStart,
  clipEnd,
  onClipChange,
  onPublish,
  onCancel,
}: LoopEditorProps) {
  const [activeTab, setActiveTab] = useState<EditorTab>('clip');
  const [responseVideo, setResponseVideo] = useState<File | null>(null);
  const [responseVideoUrl, setResponseVideoUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');

  // Text overlays with keyframe support
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [selectedOverlay, setSelectedOverlay] = useState<string | null>(null);

  // Closed captions
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [selectedCaption, setSelectedCaption] = useState<string | null>(null);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>({
    position: 'bottom',
    align: 'center',
    fontSize: 'medium',
    fontColor: '#ffffff',
    backgroundColor: '#000000',
    backgroundOpacity: 0.75,
  });

  // Audio/Music
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<string | null>(null);

  // Transition between clip and response
  const [transition, setTransition] = useState<Transition | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentFrame, setCurrentFrame] = useState(0);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playbackRef = useRef<number | null>(null);

  const clipDuration = clipEnd - clipStart;
  const responseDuration = responseVideo ? 30 : 0;
  const transitionDuration = transition ? transition.duration / FPS : 0;
  const totalDuration = clipDuration + responseDuration;
  const totalFrames = Math.ceil(totalDuration * FPS);

  // Fetch trending sounds from platform
  const { data: soundsData } = useQuery({
    queryKey: ['sounds', 'trending'],
    queryFn: async () => {
      // Use the sounds API if available
      if ('getTrendingSounds' in api && typeof (api as Record<string, unknown>).getTrendingSounds === 'function') {
        return (api as unknown as { getTrendingSounds: () => Promise<{ sounds: Sound[] }> }).getTrendingSounds();
      }
      return { sounds: [] };
    },
    enabled: activeTab === 'music',
  });

  const platformSounds: Sound[] = soundsData?.sounds ?? [];

  // Playback timer
  useEffect(() => {
    if (isPlaying) {
      const startTime = performance.now() - currentTime * 1000;

      const tick = () => {
        const elapsed = (performance.now() - startTime) / 1000;
        if (elapsed >= totalDuration) {
          setCurrentTime(0);
          setCurrentFrame(0);
          setIsPlaying(false);
        } else {
          setCurrentTime(elapsed);
          setCurrentFrame(Math.floor(elapsed * FPS));
          playbackRef.current = requestAnimationFrame(tick);
        }
      };

      playbackRef.current = requestAnimationFrame(tick);

      return () => {
        if (playbackRef.current) {
          cancelAnimationFrame(playbackRef.current);
        }
      };
    }
  }, [isPlaying, totalDuration]);

  // Handle response video upload
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('video/')) {
      setResponseVideo(file);
      setResponseVideoUrl(URL.createObjectURL(file));
      setActiveTab('text');
    }
  }, []);

  // Handle audio upload
  const handleAudioSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('audio/')) {
      const newTrack: AudioTrack = {
        id: Date.now().toString(),
        type: 'music',
        file,
        startFrame: 0,
        endFrame: totalFrames,
        trimStart: 0,
        trimEnd: 0,
        volume: 1,
        fadeIn: 0,
        fadeOut: 0,
        loop: false,
      };
      setAudioTracks((prev) => [...prev, newTrack]);
      setSelectedAudioTrack(newTrack.id);
    }
  }, [totalFrames]);

  // Add sound from platform
  const handleAddPlatformSound = useCallback((sound: Sound) => {
    const newTrack: AudioTrack = {
      id: Date.now().toString(),
      type: 'music',
      sound,
      startFrame: 0,
      endFrame: Math.min(sound.duration * FPS, totalFrames),
      trimStart: 0,
      trimEnd: 0,
      volume: 0.8,
      fadeIn: 15, // 0.5s fade in
      fadeOut: 15,
      loop: false,
    };
    setAudioTracks((prev) => [...prev, newTrack]);
    setSelectedAudioTrack(newTrack.id);
  }, [totalFrames]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (responseVideoUrl) {
        URL.revokeObjectURL(responseVideoUrl);
      }
    };
  }, [responseVideoUrl]);

  // Add text overlay with keyframe support
  const addTextOverlay = useCallback(() => {
    const newOverlay: TextOverlay = {
      id: Date.now().toString(),
      text: 'New Text',
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT / 2,
      fontSize: 48,
      fontFamily: 'Inter',
      fontWeight: 'bold',
      color: '#ffffff',
      blendMode: 'normal',
      opacity: 1,
      rotation: 0,
      startTime: 0,
      endTime: totalDuration,
      properties: [
        {
          id: `${Date.now()}-opacity`,
          name: 'Opacity',
          path: 'opacity',
          type: 'number',
          keyframes: [],
        },
        {
          id: `${Date.now()}-scale`,
          name: 'Scale',
          path: 'scale',
          type: 'number',
          keyframes: [],
        },
      ],
    };
    setTextOverlays((prev) => [...prev, newOverlay]);
    setSelectedOverlay(newOverlay.id);
  }, [totalDuration]);

  // Add caption
  const addCaption = useCallback(() => {
    const newCaption: Caption = {
      id: Date.now().toString(),
      text: 'Caption text',
      startTime: currentTime,
      endTime: Math.min(currentTime + 3, totalDuration),
      style: { ...captionStyle },
    };
    setCaptions((prev) => [...prev, newCaption]);
    setSelectedCaption(newCaption.id);
  }, [currentTime, totalDuration, captionStyle]);

  // Update text overlay
  const updateOverlay = useCallback((id: string, updates: Partial<TextOverlay>) => {
    setTextOverlays((prev) =>
      prev.map((overlay) => (overlay.id === id ? { ...overlay, ...updates } : overlay))
    );
  }, []);

  // Delete text overlay
  const deleteOverlay = useCallback((id: string) => {
    setTextOverlays((prev) => prev.filter((overlay) => overlay.id !== id));
    setSelectedOverlay(null);
  }, []);

  // Update caption
  const updateCaption = useCallback((id: string, updates: Partial<Caption>) => {
    setCaptions((prev) =>
      prev.map((cap) => (cap.id === id ? { ...cap, ...updates } : cap))
    );
  }, []);

  // Delete caption
  const deleteCaption = useCallback((id: string) => {
    setCaptions((prev) => prev.filter((cap) => cap.id !== id));
    setSelectedCaption(null);
  }, []);

  // Add keyframe to overlay property
  const addKeyframe = useCallback((overlayId: string, propertyPath: string, value: number) => {
    setTextOverlays((prev) =>
      prev.map((overlay) => {
        if (overlay.id !== overlayId) return overlay;

        const properties = overlay.properties.map((prop) => {
          if (prop.path !== propertyPath) return prop;

          const newKeyframe: Keyframe = {
            id: Date.now().toString(),
            frame: currentFrame,
            value,
            interpolation: 'bezier',
            easing: 'ease-in-out',
          };

          // Remove existing keyframe at same frame
          const filteredKeyframes = prop.keyframes.filter((kf) => kf.frame !== currentFrame);

          return {
            ...prop,
            keyframes: [...filteredKeyframes, newKeyframe].sort((a, b) => a.frame - b.frame),
          };
        });

        return { ...overlay, properties };
      })
    );
  }, [currentFrame]);

  // Draw canvas preview
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Determine which segment we're in
    const inClip = currentTime < clipDuration;
    const inTransition = transition && currentTime >= clipDuration - transitionDuration / 2 && currentTime < clipDuration + transitionDuration / 2;

    // Draw segment label
    ctx.fillStyle = '#666';
    ctx.font = '32px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';

    if (inTransition) {
      ctx.fillText('Transition', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);
    } else if (inClip) {
      ctx.fillText('Original Clip', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);
    } else {
      ctx.fillText('Your Response', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);
    }

    // Draw text overlays
    textOverlays.forEach((overlay) => {
      if (currentTime >= overlay.startTime && currentTime <= overlay.endTime) {
        ctx.save();

        // Apply blend mode
        ctx.globalCompositeOperation = overlay.blendMode as GlobalCompositeOperation;

        // Calculate animated opacity
        let opacity = overlay.opacity;
        const opacityProp = overlay.properties.find((p) => p.path === 'opacity');
        if (opacityProp && opacityProp.keyframes.length > 0) {
          opacity = evaluateProperty(opacityProp, currentFrame);
        }
        ctx.globalAlpha = opacity;

        // Apply transition effects
        if (overlay.transitionIn && currentTime < overlay.startTime + overlay.transitionIn.duration / FPS) {
          const t = (currentTime - overlay.startTime) / (overlay.transitionIn.duration / FPS);
          const easedT = getEasingFunction(overlay.transitionIn.easing)(t);
          ctx.globalAlpha *= easedT;
        }
        if (overlay.transitionOut && currentTime > overlay.endTime - overlay.transitionOut.duration / FPS) {
          const t = (overlay.endTime - currentTime) / (overlay.transitionOut.duration / FPS);
          const easedT = getEasingFunction(overlay.transitionOut.easing)(t);
          ctx.globalAlpha *= easedT;
        }

        ctx.translate(overlay.x, overlay.y);
        ctx.rotate((overlay.rotation * Math.PI) / 180);

        // Draw background if present
        if (overlay.backgroundColor) {
          const metrics = ctx.measureText(overlay.text);
          const padding = overlay.backgroundPadding || 10;
          const radius = overlay.borderRadius || 8;

          ctx.fillStyle = overlay.backgroundColor;
          roundRect(
            ctx,
            -metrics.width / 2 - padding,
            -overlay.fontSize / 2 - padding,
            metrics.width + padding * 2,
            overlay.fontSize + padding * 2,
            radius
          );
          ctx.fill();
        }

        // Draw shadow
        if (overlay.shadow) {
          ctx.shadowColor = overlay.shadow.color;
          ctx.shadowBlur = overlay.shadow.blur;
          ctx.shadowOffsetX = overlay.shadow.offsetX;
          ctx.shadowOffsetY = overlay.shadow.offsetY;
        }

        // Draw stroke
        if (overlay.stroke) {
          ctx.strokeStyle = overlay.stroke.color;
          ctx.lineWidth = overlay.stroke.width;
          ctx.font = `${overlay.fontWeight} ${overlay.fontSize}px ${overlay.fontFamily}, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.strokeText(overlay.text, 0, 0);
        }

        // Draw text
        ctx.fillStyle = overlay.color;
        ctx.font = `${overlay.fontWeight} ${overlay.fontSize}px ${overlay.fontFamily}, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(overlay.text, 0, 0);

        // Draw selection box
        if (selectedOverlay === overlay.id) {
          ctx.shadowColor = 'transparent';
          const metrics = ctx.measureText(overlay.text);
          ctx.strokeStyle = '#6366f1';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.strokeRect(
            -metrics.width / 2 - 10,
            -overlay.fontSize / 2 - 10,
            metrics.width + 20,
            overlay.fontSize + 20
          );
        }

        ctx.restore();
      }
    });

    // Draw captions
    captions.forEach((cap) => {
      if (currentTime >= cap.startTime && currentTime <= cap.endTime) {
        const style = cap.style || captionStyle;

        ctx.save();

        // Position
        let y: number;
        switch (style.position) {
          case 'top':
            y = 150;
            break;
          case 'center':
            y = CANVAS_HEIGHT / 2;
            break;
          default:
            y = CANVAS_HEIGHT - 200;
        }

        // Background
        ctx.font = `${style.fontSize === 'small' ? 32 : style.fontSize === 'large' ? 56 : 44}px Inter, system-ui, sans-serif`;
        ctx.textAlign = style.align;
        const metrics = ctx.measureText(cap.text);
        const padding = 16;

        ctx.globalAlpha = style.backgroundOpacity;
        ctx.fillStyle = style.backgroundColor;
        const bgX = style.align === 'center' ? CANVAS_WIDTH / 2 - metrics.width / 2 - padding
          : style.align === 'left' ? 40
          : CANVAS_WIDTH - metrics.width - 40 - padding * 2;
        ctx.fillRect(bgX, y - 30, metrics.width + padding * 2, 60);

        // Text
        ctx.globalAlpha = 1;
        ctx.fillStyle = style.fontColor;
        const textX = style.align === 'center' ? CANVAS_WIDTH / 2
          : style.align === 'left' ? 40 + padding
          : CANVAS_WIDTH - 40 - padding;
        ctx.fillText(cap.text, textX, y + 10);

        // Speaker label
        if (cap.speaker) {
          ctx.font = '24px Inter, system-ui, sans-serif';
          ctx.fillStyle = '#aaa';
          ctx.fillText(`[${cap.speaker}]`, textX, y - 40);
        }

        ctx.restore();
      }
    });

    // Draw safe zone guides
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    const margin = 60;
    ctx.strokeRect(margin, margin, CANVAS_WIDTH - margin * 2, CANVAS_HEIGHT - margin * 2);
  }, [currentTime, currentFrame, textOverlays, captions, selectedOverlay, clipDuration, transition, transitionDuration, captionStyle]);

  // Evaluate animated property at frame
  function evaluateProperty(property: AnimatableProperty, frame: number): number {
    const keyframes = property.keyframes;
    if (keyframes.length === 0) return 1;
    if (keyframes.length === 1) return keyframes[0].value as number;

    // Find surrounding keyframes
    let prev = keyframes[0];
    let next = keyframes[keyframes.length - 1];

    for (let i = 0; i < keyframes.length - 1; i++) {
      if (frame >= keyframes[i].frame && frame <= keyframes[i + 1].frame) {
        prev = keyframes[i];
        next = keyframes[i + 1];
        break;
      }
    }

    if (frame <= prev.frame) return prev.value as number;
    if (frame >= next.frame) return next.value as number;

    const progress = (frame - prev.frame) / (next.frame - prev.frame);
    const easingFn = getEasingFunction(prev.easing);
    const easedProgress = easingFn(progress);

    return lerp(prev.value as number, next.value as number, easedProgress);
  }

  // Handle publish
  const handlePublish = useCallback(() => {
    onPublish({
      originalUri: originalVideo.uri,
      clipStart,
      clipEnd,
      responseVideoFile: responseVideo || undefined,
      caption,
      textOverlays,
      captions,
      audioTracks,
      transition,
    });
  }, [originalVideo.uri, clipStart, clipEnd, responseVideo, caption, textOverlays, captions, audioTracks, transition, onPublish]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * FPS);
    return `${mins}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
  };

  const selectedOverlayData = textOverlays.find((o) => o.id === selectedOverlay);
  const selectedCaptionData = captions.find((c) => c.id === selectedCaption);
  const selectedAudioData = audioTracks.find((a) => a.id === selectedAudioTrack);

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="h-14 bg-background-alt border-b border-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={onCancel}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <CloseIcon className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <LoopIcon className="w-5 h-5 text-accent" />
            <span className="font-semibold text-text-primary">Loop Editor</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <span>{FPS} fps</span>
          <span className="w-px h-4 bg-border" />
          <span className="font-mono">{formatTime(currentTime)}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('preview')}
            className="px-4 py-2 text-sm text-text-primary hover:bg-surface rounded-lg transition-colors"
          >
            Preview
          </button>
          <button
            onClick={handlePublish}
            disabled={!responseVideo}
            className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Publish Loop
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-border bg-background-alt shrink-0 overflow-x-auto">
        {(['clip', 'response', 'text', 'captions', 'music', 'effects', 'preview'] as EditorTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab
                ? 'text-accent border-b-2 border-accent'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {tab === 'clip' && 'Clip'}
            {tab === 'response' && 'Response'}
            {tab === 'text' && 'Text'}
            {tab === 'captions' && 'Captions'}
            {tab === 'music' && 'Music'}
            {tab === 'effects' && 'Effects'}
            {tab === 'preview' && 'Preview'}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas area */}
        <div className="flex-1 flex items-center justify-center bg-gray-900 p-4">
          <div className="relative" style={{ transform: 'scale(0.35)', transformOrigin: 'center' }}>
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              className="rounded-lg shadow-2xl bg-black"
            />
          </div>
        </div>

        {/* Right panel */}
        <div className="w-80 bg-background-alt border-l border-border flex flex-col overflow-y-auto">
          {activeTab === 'clip' && (
            <ClipPanel
              originalVideo={originalVideo}
              clipStart={clipStart}
              clipEnd={clipEnd}
              onClipChange={onClipChange}
              maxDuration={MAX_CLIP_DURATION}
            />
          )}

          {activeTab === 'response' && (
            <ResponsePanel
              responseVideo={responseVideo}
              responseVideoUrl={responseVideoUrl}
              fileInputRef={fileInputRef}
              onFileSelect={handleFileSelect}
            />
          )}

          {activeTab === 'text' && (
            <TextPanel
              textOverlays={textOverlays}
              selectedOverlay={selectedOverlayData}
              onAddText={addTextOverlay}
              onSelectOverlay={setSelectedOverlay}
              onUpdateOverlay={updateOverlay}
              onDeleteOverlay={deleteOverlay}
              onAddKeyframe={addKeyframe}
              currentFrame={currentFrame}
              blendModes={BLEND_MODES}
            />
          )}

          {activeTab === 'captions' && (
            <CaptionsPanel
              captions={captions}
              selectedCaption={selectedCaptionData}
              captionStyle={captionStyle}
              onAddCaption={addCaption}
              onSelectCaption={setSelectedCaption}
              onUpdateCaption={updateCaption}
              onDeleteCaption={deleteCaption}
              onUpdateStyle={setCaptionStyle}
            />
          )}

          {activeTab === 'music' && (
            <MusicPanel
              audioTracks={audioTracks}
              selectedTrack={selectedAudioData}
              platformSounds={platformSounds}
              audioInputRef={audioInputRef}
              onAudioSelect={handleAudioSelect}
              onAddPlatformSound={handleAddPlatformSound}
              onSelectTrack={setSelectedAudioTrack}
              onUpdateTrack={(id, updates) => {
                setAudioTracks((prev) =>
                  prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
                );
              }}
              onDeleteTrack={(id) => {
                setAudioTracks((prev) => prev.filter((t) => t.id !== id));
                setSelectedAudioTrack(null);
              }}
              totalFrames={totalFrames}
            />
          )}

          {activeTab === 'effects' && (
            <EffectsPanel
              transition={transition}
              onTransitionChange={setTransition}
              transitionTypes={TRANSITION_TYPES}
              clipDuration={clipDuration}
            />
          )}

          {activeTab === 'preview' && (
            <PreviewPanel
              caption={caption}
              onCaptionChange={setCaption}
              clipDuration={clipDuration}
              originalAuthor={originalVideo.author}
              textCount={textOverlays.length}
              captionCount={captions.length}
              audioCount={audioTracks.length}
              hasTransition={!!transition}
            />
          )}
        </div>
      </div>

      {/* Timeline */}
      <Timeline
        currentTime={currentTime}
        currentFrame={currentFrame}
        totalDuration={totalDuration}
        totalFrames={totalFrames}
        clipDuration={clipDuration}
        isPlaying={isPlaying}
        textOverlays={textOverlays}
        captions={captions}
        audioTracks={audioTracks}
        transition={transition}
        selectedOverlay={selectedOverlay}
        selectedCaption={selectedCaption}
        selectedAudioTrack={selectedAudioTrack}
        onTimeChange={(time) => {
          setCurrentTime(time);
          setCurrentFrame(Math.floor(time * FPS));
        }}
        onPlayPause={() => setIsPlaying(!isPlaying)}
        onSelectOverlay={setSelectedOverlay}
        onSelectCaption={setSelectedCaption}
        onSelectAudioTrack={setSelectedAudioTrack}
        fps={FPS}
      />

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleFileSelect}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleAudioSelect}
      />
    </div>
  );
}

// Helper to draw rounded rectangles
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// Panel Components (simplified for brevity - full implementations follow the same pattern as before)

function ClipPanel({ originalVideo, clipStart, clipEnd, onClipChange, maxDuration }: {
  originalVideo: LoopEditorProps['originalVideo'];
  clipStart: number;
  clipEnd: number;
  onClipChange: (start: number, end: number) => void;
  maxDuration: number;
}) {
  const duration = originalVideo.duration;
  return (
    <div className="p-4 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-2">Original Video</h3>
        <div className="aspect-video bg-black rounded-lg overflow-hidden">
          {originalVideo.thumbnailUrl ? (
            <img src={originalVideo.thumbnailUrl} alt="Original" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-text-muted">
              <VideoIcon className="w-8 h-8" />
            </div>
          )}
        </div>
        <p className="text-xs text-text-muted mt-2">By @{originalVideo.author.handle}</p>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-3">Select Clip</h3>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-text-muted block mb-1">Start: {clipStart.toFixed(1)}s</label>
            <input
              type="range"
              min={0}
              max={Math.max(0, duration - 1)}
              step={0.1}
              value={clipStart}
              onChange={(e) => {
                const newStart = parseFloat(e.target.value);
                const newEnd = Math.min(newStart + maxDuration, duration);
                onClipChange(newStart, Math.max(newEnd, newStart + 1));
              }}
              className="w-full accent-accent"
            />
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">End: {clipEnd.toFixed(1)}s</label>
            <input
              type="range"
              min={clipStart + 1}
              max={Math.min(clipStart + maxDuration, duration)}
              step={0.1}
              value={clipEnd}
              onChange={(e) => onClipChange(clipStart, parseFloat(e.target.value))}
              className="w-full accent-accent"
            />
          </div>
          <div className="p-3 bg-surface rounded-lg">
            <p className="text-sm text-text-primary">
              Duration: <span className="font-semibold">{(clipEnd - clipStart).toFixed(1)}s</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResponsePanel({ responseVideo, responseVideoUrl, fileInputRef, onFileSelect }: {
  responseVideo: File | null;
  responseVideoUrl: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="p-4 space-y-6">
      <h3 className="text-sm font-semibold text-text-primary">Your Response Video</h3>
      {responseVideo ? (
        <div className="space-y-4">
          <div className="aspect-video bg-black rounded-lg overflow-hidden">
            {responseVideoUrl && <video src={responseVideoUrl} className="w-full h-full object-cover" controls />}
          </div>
          <button onClick={() => fileInputRef.current?.click()} className="text-sm text-accent hover:underline">
            Change video
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full aspect-video bg-surface border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center hover:border-accent transition-colors"
        >
          <UploadIcon className="w-10 h-10 text-text-muted mb-2" />
          <span className="text-sm text-text-primary font-medium">Upload Video</span>
        </button>
      )}
    </div>
  );
}

function TextPanel({ textOverlays, selectedOverlay, onAddText, onSelectOverlay, onUpdateOverlay, onDeleteOverlay, onAddKeyframe, currentFrame, blendModes }: {
  textOverlays: TextOverlay[];
  selectedOverlay: TextOverlay | undefined;
  onAddText: () => void;
  onSelectOverlay: (id: string | null) => void;
  onUpdateOverlay: (id: string, updates: Partial<TextOverlay>) => void;
  onDeleteOverlay: (id: string) => void;
  onAddKeyframe: (overlayId: string, propertyPath: string, value: number) => void;
  currentFrame: number;
  blendModes: BlendMode[];
}) {
  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Text Overlays</h3>
        <button onClick={onAddText} className="text-sm text-accent hover:text-accent-hover flex items-center gap-1">
          <PlusIcon className="w-4 h-4" /> Add Text
        </button>
      </div>
      {textOverlays.length === 0 ? (
        <p className="text-center py-8 text-text-muted text-sm">No text overlays yet.</p>
      ) : (
        <div className="space-y-2">
          {textOverlays.map((overlay) => (
            <button
              key={overlay.id}
              onClick={() => onSelectOverlay(overlay.id)}
              className={`w-full p-3 rounded-lg text-left transition-colors ${
                selectedOverlay?.id === overlay.id ? 'bg-accent/20 border border-accent' : 'bg-surface hover:bg-surface-hover'
              }`}
            >
              <p className="text-sm text-text-primary truncate">{overlay.text}</p>
            </button>
          ))}
        </div>
      )}
      {selectedOverlay && (
        <div className="space-y-4 pt-4 border-t border-border">
          <div>
            <label className="text-xs text-text-muted block mb-1">Text</label>
            <input
              type="text"
              value={selectedOverlay.text}
              onChange={(e) => onUpdateOverlay(selectedOverlay.id, { text: e.target.value })}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-muted block mb-1">Size</label>
              <input
                type="number"
                min={12}
                max={120}
                value={selectedOverlay.fontSize}
                onChange={(e) => onUpdateOverlay(selectedOverlay.id, { fontSize: parseInt(e.target.value) })}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Color</label>
              <input
                type="color"
                value={selectedOverlay.color}
                onChange={(e) => onUpdateOverlay(selectedOverlay.id, { color: e.target.value })}
                className="w-full h-10 bg-surface border border-border rounded-lg cursor-pointer"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">Blend Mode</label>
            <select
              value={selectedOverlay.blendMode}
              onChange={(e) => onUpdateOverlay(selectedOverlay.id, { blendMode: e.target.value as BlendMode })}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary text-sm"
            >
              {blendModes.map((mode) => (
                <option key={mode} value={mode}>{mode}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">Opacity</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={selectedOverlay.opacity}
                onChange={(e) => onUpdateOverlay(selectedOverlay.id, { opacity: parseFloat(e.target.value) })}
                className="flex-1 accent-accent"
              />
              <button
                onClick={() => onAddKeyframe(selectedOverlay.id, 'opacity', selectedOverlay.opacity)}
                className="p-1 text-accent hover:bg-accent/20 rounded"
                title="Add keyframe"
              >
                <KeyframeIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
          <button
            onClick={() => onDeleteOverlay(selectedOverlay.id)}
            className="w-full py-2 text-sm text-red-500 hover:bg-red-500/10 rounded-lg"
          >
            Delete Text
          </button>
        </div>
      )}
    </div>
  );
}

function CaptionsPanel({ captions, selectedCaption, captionStyle, onAddCaption, onSelectCaption, onUpdateCaption, onDeleteCaption, onUpdateStyle }: {
  captions: Caption[];
  selectedCaption: Caption | undefined;
  captionStyle: Caption['style'] & {};
  onAddCaption: () => void;
  onSelectCaption: (id: string | null) => void;
  onUpdateCaption: (id: string, updates: Partial<Caption>) => void;
  onDeleteCaption: (id: string) => void;
  onUpdateStyle: (style: typeof captionStyle) => void;
}) {
  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Closed Captions</h3>
        <button onClick={onAddCaption} className="text-sm text-accent hover:text-accent-hover flex items-center gap-1">
          <PlusIcon className="w-4 h-4" /> Add Caption
        </button>
      </div>

      {/* Caption style settings */}
      <div className="p-3 bg-surface rounded-lg space-y-3">
        <h4 className="text-xs font-medium text-text-muted uppercase">Default Style</h4>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={captionStyle.position}
            onChange={(e) => onUpdateStyle({ ...captionStyle, position: e.target.value as 'top' | 'center' | 'bottom' })}
            className="px-2 py-1.5 bg-background border border-border rounded text-xs text-text-primary"
          >
            <option value="top">Top</option>
            <option value="center">Center</option>
            <option value="bottom">Bottom</option>
          </select>
          <select
            value={captionStyle.fontSize}
            onChange={(e) => onUpdateStyle({ ...captionStyle, fontSize: e.target.value as 'small' | 'medium' | 'large' })}
            className="px-2 py-1.5 bg-background border border-border rounded text-xs text-text-primary"
          >
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
        </div>
      </div>

      {captions.length === 0 ? (
        <p className="text-center py-8 text-text-muted text-sm">No captions yet.</p>
      ) : (
        <div className="space-y-2">
          {captions.map((cap) => (
            <button
              key={cap.id}
              onClick={() => onSelectCaption(cap.id)}
              className={`w-full p-3 rounded-lg text-left transition-colors ${
                selectedCaption?.id === cap.id ? 'bg-accent/20 border border-accent' : 'bg-surface hover:bg-surface-hover'
              }`}
            >
              <p className="text-sm text-text-primary truncate">{cap.text}</p>
              <p className="text-xs text-text-muted">{cap.startTime.toFixed(1)}s - {cap.endTime.toFixed(1)}s</p>
            </button>
          ))}
        </div>
      )}

      {selectedCaption && (
        <div className="space-y-4 pt-4 border-t border-border">
          <div>
            <label className="text-xs text-text-muted block mb-1">Text</label>
            <textarea
              value={selectedCaption.text}
              onChange={(e) => onUpdateCaption(selectedCaption.id, { text: e.target.value })}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary text-sm resize-none h-20"
            />
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">Speaker (optional)</label>
            <input
              type="text"
              value={selectedCaption.speaker || ''}
              onChange={(e) => onUpdateCaption(selectedCaption.id, { speaker: e.target.value })}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary text-sm"
              placeholder="e.g., Narrator"
            />
          </div>
          <button
            onClick={() => onDeleteCaption(selectedCaption.id)}
            className="w-full py-2 text-sm text-red-500 hover:bg-red-500/10 rounded-lg"
          >
            Delete Caption
          </button>
        </div>
      )}
    </div>
  );
}

function MusicPanel({ audioTracks, selectedTrack, platformSounds, audioInputRef, onAudioSelect, onAddPlatformSound, onSelectTrack, onUpdateTrack, onDeleteTrack, totalFrames }: {
  audioTracks: AudioTrack[];
  selectedTrack: AudioTrack | undefined;
  platformSounds: Sound[];
  audioInputRef: React.RefObject<HTMLInputElement | null>;
  onAudioSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAddPlatformSound: (sound: Sound) => void;
  onSelectTrack: (id: string | null) => void;
  onUpdateTrack: (id: string, updates: Partial<AudioTrack>) => void;
  onDeleteTrack: (id: string) => void;
  totalFrames: number;
}) {
  return (
    <div className="p-4 space-y-6">
      <h3 className="text-sm font-semibold text-text-primary">Music & Audio</h3>

      <button
        onClick={() => audioInputRef.current?.click()}
        className="w-full p-3 bg-surface border border-dashed border-border rounded-lg text-center hover:border-accent transition-colors"
      >
        <MusicIcon className="w-6 h-6 mx-auto text-text-muted mb-1" />
        <span className="text-sm text-text-primary">Upload Audio</span>
      </button>

      {platformSounds.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-text-muted uppercase mb-2">Trending Sounds</h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {platformSounds.slice(0, 5).map((sound) => (
              <button
                key={sound.id}
                onClick={() => onAddPlatformSound(sound)}
                className="w-full p-2 bg-surface rounded-lg flex items-center gap-3 hover:bg-surface-hover transition-colors"
              >
                {sound.coverUrl && (
                  <img src={sound.coverUrl} alt={sound.title} className="w-10 h-10 rounded object-cover" />
                )}
                <div className="flex-1 text-left">
                  <p className="text-sm text-text-primary truncate">{sound.title}</p>
                  <p className="text-xs text-text-muted">{sound.artist}</p>
                </div>
                <PlusIcon className="w-4 h-4 text-accent" />
              </button>
            ))}
          </div>
        </div>
      )}

      {audioTracks.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-text-muted uppercase mb-2">Added Tracks</h4>
          <div className="space-y-2">
            {audioTracks.map((track) => (
              <button
                key={track.id}
                onClick={() => onSelectTrack(track.id)}
                className={`w-full p-3 rounded-lg text-left transition-colors ${
                  selectedTrack?.id === track.id ? 'bg-accent/20 border border-accent' : 'bg-surface hover:bg-surface-hover'
                }`}
              >
                <p className="text-sm text-text-primary truncate">
                  {track.sound?.title || track.file?.name || 'Audio Track'}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedTrack && (
        <div className="space-y-4 pt-4 border-t border-border">
          <div>
            <label className="text-xs text-text-muted block mb-1">Volume</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={selectedTrack.volume}
              onChange={(e) => onUpdateTrack(selectedTrack.id, { volume: parseFloat(e.target.value) })}
              className="w-full accent-accent"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-muted block mb-1">Fade In (frames)</label>
              <input
                type="number"
                min={0}
                max={60}
                value={selectedTrack.fadeIn}
                onChange={(e) => onUpdateTrack(selectedTrack.id, { fadeIn: parseInt(e.target.value) })}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Fade Out (frames)</label>
              <input
                type="number"
                min={0}
                max={60}
                value={selectedTrack.fadeOut}
                onChange={(e) => onUpdateTrack(selectedTrack.id, { fadeOut: parseInt(e.target.value) })}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary text-sm"
              />
            </div>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedTrack.loop}
              onChange={(e) => onUpdateTrack(selectedTrack.id, { loop: e.target.checked })}
              className="accent-accent"
            />
            <span className="text-sm text-text-primary">Loop</span>
          </label>
          <button
            onClick={() => onDeleteTrack(selectedTrack.id)}
            className="w-full py-2 text-sm text-red-500 hover:bg-red-500/10 rounded-lg"
          >
            Remove Track
          </button>
        </div>
      )}
    </div>
  );
}

function EffectsPanel({ transition, onTransitionChange, transitionTypes, clipDuration }: {
  transition: Transition | null;
  onTransitionChange: (t: Transition | null) => void;
  transitionTypes: { value: TransitionType; label: string }[];
  clipDuration: number;
}) {
  const handleTypeChange = (type: TransitionType) => {
    if (type === 'none') {
      onTransitionChange(null);
    } else {
      onTransitionChange({
        id: 'transition-1',
        type,
        duration: 15, // 0.5s at 30fps
        easing: 'ease-in-out',
      });
    }
  };

  return (
    <div className="p-4 space-y-6">
      <h3 className="text-sm font-semibold text-text-primary">Transition Effect</h3>
      <p className="text-xs text-text-muted">
        Add a transition between the original clip and your response.
      </p>

      <div>
        <label className="text-xs text-text-muted block mb-1">Transition Type</label>
        <select
          value={transition?.type || 'none'}
          onChange={(e) => handleTypeChange(e.target.value as TransitionType)}
          className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary text-sm"
        >
          {transitionTypes.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {transition && (
        <>
          <div>
            <label className="text-xs text-text-muted block mb-1">Duration (frames)</label>
            <input
              type="range"
              min={5}
              max={30}
              value={transition.duration}
              onChange={(e) => onTransitionChange({ ...transition, duration: parseInt(e.target.value) })}
              className="w-full accent-accent"
            />
            <p className="text-xs text-text-muted mt-1">{(transition.duration / 30).toFixed(2)}s</p>
          </div>

          <div>
            <label className="text-xs text-text-muted block mb-1">Easing</label>
            <select
              value={transition.easing}
              onChange={(e) => onTransitionChange({ ...transition, easing: e.target.value as EasingType })}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary text-sm"
            >
              {Object.entries(EASING_CATEGORIES).map(([category, easings]) => (
                <optgroup key={category} label={category.charAt(0).toUpperCase() + category.slice(1)}>
                  {easings.map((easing) => (
                    <option key={easing} value={easing}>{easing}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </>
      )}
    </div>
  );
}

function PreviewPanel({ caption, onCaptionChange, clipDuration, originalAuthor, textCount, captionCount, audioCount, hasTransition }: {
  caption: string;
  onCaptionChange: (c: string) => void;
  clipDuration: number;
  originalAuthor: { handle: string };
  textCount: number;
  captionCount: number;
  audioCount: number;
  hasTransition: boolean;
}) {
  return (
    <div className="p-4 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-3">Caption</h3>
        <textarea
          value={caption}
          onChange={(e) => onCaptionChange(e.target.value)}
          placeholder="Add a caption..."
          className="w-full h-24 px-3 py-2 bg-surface border border-border rounded-lg text-text-primary text-sm resize-none"
        />
      </div>
      <div className="p-4 bg-surface rounded-lg">
        <h4 className="text-sm font-medium text-text-primary mb-3">Summary</h4>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-text-muted">Original clip</dt>
            <dd className="text-text-primary">{clipDuration.toFixed(1)}s</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-muted">Credit</dt>
            <dd className="text-text-primary">@{originalAuthor.handle}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-muted">Text overlays</dt>
            <dd className="text-text-primary">{textCount}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-muted">Captions</dt>
            <dd className="text-text-primary">{captionCount}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-muted">Audio tracks</dt>
            <dd className="text-text-primary">{audioCount}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-muted">Transition</dt>
            <dd className="text-text-primary">{hasTransition ? 'Yes' : 'None'}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function Timeline({ currentTime, currentFrame, totalDuration, totalFrames, clipDuration, isPlaying, textOverlays, captions, audioTracks, transition, selectedOverlay, selectedCaption, selectedAudioTrack, onTimeChange, onPlayPause, onSelectOverlay, onSelectCaption, onSelectAudioTrack, fps }: {
  currentTime: number;
  currentFrame: number;
  totalDuration: number;
  totalFrames: number;
  clipDuration: number;
  isPlaying: boolean;
  textOverlays: TextOverlay[];
  captions: Caption[];
  audioTracks: AudioTrack[];
  transition: Transition | null;
  selectedOverlay: string | null;
  selectedCaption: string | null;
  selectedAudioTrack: string | null;
  onTimeChange: (time: number) => void;
  onPlayPause: () => void;
  onSelectOverlay: (id: string | null) => void;
  onSelectCaption: (id: string | null) => void;
  onSelectAudioTrack: (id: string | null) => void;
  fps: number;
}) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="h-36 bg-background-alt border-t border-border shrink-0">
      <div className="h-10 border-b border-border flex items-center px-4 gap-4">
        <button onClick={onPlayPause} className="p-2 rounded-full bg-accent text-white hover:bg-accent-hover">
          {isPlaying ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
        </button>
        <span className="text-sm text-text-primary font-mono">{formatTime(currentTime)}</span>
      </div>
      <div className="p-4 space-y-1">
        {/* Video tracks */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted w-16">Video</span>
          <div className="flex-1 h-6 bg-surface rounded relative">
            <div className="absolute top-0 h-full bg-purple-600 rounded" style={{ left: 0, width: `${(clipDuration / totalDuration) * 100}%` }} />
            <div className="absolute top-0 h-full bg-accent rounded" style={{ left: `${(clipDuration / totalDuration) * 100}%`, width: `${((totalDuration - clipDuration) / totalDuration) * 100}%` }} />
          </div>
        </div>
        {/* Text track */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted w-16">Text</span>
          <div className="flex-1 h-6 bg-surface rounded relative">
            {textOverlays.map((o) => (
              <div
                key={o.id}
                className={`absolute top-0.5 h-5 rounded cursor-pointer ${selectedOverlay === o.id ? 'bg-pink-500' : 'bg-pink-600/70'}`}
                style={{ left: `${(o.startTime / totalDuration) * 100}%`, width: `${((o.endTime - o.startTime) / totalDuration) * 100}%`, minWidth: 4 }}
                onClick={() => onSelectOverlay(o.id)}
              />
            ))}
          </div>
        </div>
        {/* Captions track */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted w-16">Captions</span>
          <div className="flex-1 h-6 bg-surface rounded relative">
            {captions.map((c) => (
              <div
                key={c.id}
                className={`absolute top-0.5 h-5 rounded cursor-pointer ${selectedCaption === c.id ? 'bg-yellow-500' : 'bg-yellow-600/70'}`}
                style={{ left: `${(c.startTime / totalDuration) * 100}%`, width: `${((c.endTime - c.startTime) / totalDuration) * 100}%`, minWidth: 4 }}
                onClick={() => onSelectCaption(c.id)}
              />
            ))}
          </div>
        </div>
        {/* Audio track */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted w-16">Audio</span>
          <div className="flex-1 h-6 bg-surface rounded relative">
            {audioTracks.map((a) => (
              <div
                key={a.id}
                className={`absolute top-0.5 h-5 rounded cursor-pointer ${selectedAudioTrack === a.id ? 'bg-green-500' : 'bg-green-600/70'}`}
                style={{ left: `${(a.startFrame / totalFrames) * 100}%`, width: `${((a.endFrame - a.startFrame) / totalFrames) * 100}%`, minWidth: 4 }}
                onClick={() => onSelectAudioTrack(a.id)}
              />
            ))}
          </div>
        </div>
        {/* Playhead slider */}
        <input
          type="range"
          min={0}
          max={totalDuration}
          step={0.033}
          value={currentTime}
          onChange={(e) => onTimeChange(parseFloat(e.target.value))}
          className="w-full mt-1 accent-accent"
        />
      </div>
    </div>
  );
}

// Icons
function CloseIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>;
}
function LoopIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" /></svg>;
}
function VideoIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" /></svg>;
}
function PlayIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v14l11-7-11-7z" /></svg>;
}
function PauseIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>;
}
function UploadIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>;
}
function PlusIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>;
}
function MusicIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" /></svg>;
}
function KeyframeIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7.794 7.794a1 1 0 010 1.412L12 21l-7.794-7.794a1 1 0 010-1.412L12 3z" /></svg>;
}
