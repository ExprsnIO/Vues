'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import toast from 'react-hot-toast';

type DuetLayout = 'side-by-side' | 'react' | 'green-screen';

export default function DuetPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const videoUri = decodeURIComponent(params.videoUri as string);

  const [layout, setLayout] = useState<DuetLayout>('side-by-side');
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraRef = useRef<HTMLVideoElement>(null);
  const recordedRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Redirect unauthenticated users
  useEffect(() => {
    if (!user) {
      router.push('/login');
    }
  }, [user, router]);

  // Fetch original video
  const { data: videoData } = useQuery({
    queryKey: ['video', videoUri],
    queryFn: () => api.getVideo(videoUri),
    enabled: !!videoUri,
  });

  const originalVideo = videoData?.video;
  const maxDuration = originalVideo?.video?.duration ?? originalVideo?.duration ?? 60;
  const originalSrc =
    originalVideo?.video?.hlsPlaylist ??
    originalVideo?.video?.cdnUrl ??
    originalVideo?.hlsPlaylist ??
    originalVideo?.cdnUrl ??
    '';

  // Initialize camera
  useEffect(() => {
    let mounted = true;

    async function initCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1920 } },
          audio: true,
        });
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (cameraRef.current) {
          cameraRef.current.srcObject = stream;
          cameraRef.current.play().catch(() => {});
        }
        setCameraReady(true);
      } catch {
        toast.error('Camera access denied. Please allow camera permissions.');
      }
    }

    initCamera();

    return () => {
      mounted = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (videoRef.current) videoRef.current.pause();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;

    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
    const recorder = new MediaRecorder(streamRef.current, { mimeType });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      setRecordedBlob(blob);
      setShowPreview(true);
    };

    recorder.start(100);
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
    setRecordingTime(0);

    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }

    timerRef.current = setInterval(() => {
      setRecordingTime((prev) => {
        if (prev >= maxDuration) {
          stopRecording();
          return prev;
        }
        return prev + 1;
      });
    }, 1000);
  }, [maxDuration, stopRecording]);

  const discardRecording = () => {
    setRecordedBlob(null);
    setShowPreview(false);
    setRecordingTime(0);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.pause();
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!recordedBlob) throw new Error('No recording');

      // 1. Get upload URL
      const { uploadId, uploadUrl } = await api.getUploadUrl('video/webm');

      // 2. Upload to S3
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: recordedBlob,
        headers: { 'Content-Type': 'video/webm' },
      });
      if (!uploadResponse.ok) throw new Error('Upload to storage failed');

      // 3. Complete upload (trigger processing)
      await api.completeUpload(uploadId);

      // 4. Poll for processing completion
      let status = 'processing';
      while (status === 'processing' || status === 'pending') {
        await new Promise((r) => setTimeout(r, 2000));
        const result = await api.getUploadStatus(uploadId);
        status = result.status;
        if (status === 'failed') throw new Error('Video processing failed');
      }

      // 5. Create the post
      const postResult = await api.createPost({
        uploadId,
        caption: `Duet with @${originalVideo?.author?.handle ?? 'creator'}`,
        tags: ['duet'],
        visibility: 'public',
        duration: recordingTime,
        aspectRatio:
          layout === 'side-by-side' ? { width: 18, height: 16 } : { width: 9, height: 16 },
      });

      // 6. Register the duet relationship
      await api.createDuet({
        videoUri: postResult.uri,
        originalVideoUri: videoUri,
        layout,
      });

      return postResult;
    },
    onSuccess: () => {
      toast.success('Duet published!');
      router.push('/');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Upload failed');
    },
  });

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progressPct = Math.min((recordingTime / maxDuration) * 100, 100);
  const isReactMode = layout === 'react';
  const flexDir = isReactMode ? 'flex-col' : 'flex-row';

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 z-10 shrink-0">
        <button
          onClick={() => router.back()}
          className="text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
          aria-label="Cancel duet"
        >
          Cancel
        </button>

        <span className="text-white text-sm font-semibold truncate max-w-[160px]">
          Duet with @{originalVideo?.author?.handle ?? '...'}
        </span>

        {/* Layout picker */}
        <div className="flex gap-1" role="group" aria-label="Duet layout">
          {(
            [
              { value: 'side-by-side', label: 'Side', icon: <SideBySideIcon className="w-4 h-4" /> },
              { value: 'react', label: 'React', icon: <ReactModeIcon className="w-4 h-4" /> },
              { value: 'green-screen', label: 'GS', icon: <GreenScreenModeIcon className="w-4 h-4" /> },
            ] as const
          ).map(({ value, label, icon }) => (
            <button
              key={value}
              onClick={() => setLayout(value)}
              aria-pressed={layout === value}
              className={`flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg transition-colors ${
                layout === value
                  ? 'bg-accent text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Recording progress bar */}
      {isRecording && (
        <div className="absolute top-[52px] left-0 right-0 h-1 bg-white/10 z-20">
          <div
            className="h-full bg-red-500 transition-all duration-1000 ease-linear"
            style={{ width: `${progressPct}%` }}
            role="progressbar"
            aria-valuenow={recordingTime}
            aria-valuemax={maxDuration}
          />
        </div>
      )}

      {/* Recording timer pill */}
      {isRecording && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="flex items-center gap-2 bg-black/70 px-3 py-1.5 rounded-full">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
            <span className="text-white text-sm font-mono" aria-live="polite">
              {formatTime(recordingTime)}
            </span>
            <span className="text-white/50 text-xs">/ {maxDuration}s</span>
          </div>
        </div>
      )}

      {/* Split screen */}
      <div className="flex-1 overflow-hidden relative">
        {showPreview ? (
          /* Preview mode */
          <div className={`w-full h-full flex ${flexDir}`}>
            {/* Original */}
            <div className="flex-1 relative bg-black min-h-0">
              <video
                ref={videoRef}
                src={originalSrc}
                className="w-full h-full object-cover"
                playsInline
                loop
                muted
                autoPlay
              />
              <AuthorBadge handle={originalVideo?.author?.handle ?? ''} />
            </div>

            {/* Recorded */}
            <div className="flex-1 relative bg-zinc-900 min-h-0">
              <video
                ref={recordedRef}
                src={recordedBlob ? URL.createObjectURL(recordedBlob) : undefined}
                className="w-full h-full object-cover"
                playsInline
                loop
                autoPlay
              />
              <AuthorBadge handle="You" />
            </div>
          </div>
        ) : (
          /* Live recording mode */
          <div className={`w-full h-full flex ${flexDir}`}>
            {/* Original video */}
            <div className="flex-1 relative bg-black min-h-0">
              <video
                ref={videoRef}
                src={originalSrc}
                className="w-full h-full object-cover"
                playsInline
                loop
                muted={!isRecording}
              />
              <AuthorBadge handle={originalVideo?.author?.handle ?? '...'} />
            </div>

            {/* Camera preview — PiP position in react mode */}
            <div
              className={
                isReactMode
                  ? 'absolute bottom-24 right-4 w-32 h-48 rounded-xl overflow-hidden z-10 border-2 border-white/30 shadow-xl'
                  : 'flex-1 relative bg-zinc-900 min-h-0'
              }
            >
              <video
                ref={cameraRef}
                className="w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
                playsInline
                muted
                aria-label="Camera preview"
              />
              {!cameraReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                  <span className="text-white text-xs text-center px-2">
                    Loading camera...
                  </span>
                </div>
              )}
              {!isReactMode && <AuthorBadge handle="You" />}
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="px-4 py-6 bg-black/90 flex items-center justify-center gap-6 shrink-0 safe-area-bottom">
        {showPreview ? (
          <>
            <button
              onClick={discardRecording}
              className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-medium transition-colors"
            >
              Re-record
            </button>
            <button
              onClick={() => uploadMutation.mutate()}
              disabled={uploadMutation.isPending}
              className="px-8 py-3 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors min-w-[120px]"
            >
              {uploadMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <SpinnerIcon className="w-4 h-4 animate-spin" />
                  Publishing...
                </span>
              ) : (
                'Post Duet'
              )}
            </button>
          </>
        ) : (
          <RecordButton
            isRecording={isRecording}
            disabled={!cameraReady}
            onStart={startRecording}
            onStop={stopRecording}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AuthorBadge({ handle }: { handle: string }) {
  return (
    <div className="absolute top-2 left-2 bg-black/50 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-md">
      @{handle}
    </div>
  );
}

function RecordButton({
  isRecording,
  disabled,
  onStart,
  onStop,
}: {
  isRecording: boolean;
  disabled: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <button
      onClick={isRecording ? onStop : onStart}
      disabled={disabled}
      aria-label={isRecording ? 'Stop recording' : 'Start recording'}
      className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center disabled:opacity-40 transition-opacity"
    >
      {isRecording ? (
        <div className="w-8 h-8 rounded-md bg-red-500" />
      ) : (
        <div className="w-12 h-12 rounded-full bg-red-500" />
      )}
    </button>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function SideBySideIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h8v12H3zM13 6h8v12h-8z" />
    </svg>
  );
}

function ReactModeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18v12H3zM16 18h5v4h-5z" />
    </svg>
  );
}

function GreenScreenModeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18v16H3zM7 10h10v6H7z" />
    </svg>
  );
}
