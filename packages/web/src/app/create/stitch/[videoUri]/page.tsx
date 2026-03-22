'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import toast from 'react-hot-toast';

type Step = 'trim' | 'record' | 'preview';

const MAX_CLIP_SECONDS = 5;

export default function StitchPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const videoUri = decodeURIComponent(params.videoUri as string);

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const [step, setStep] = useState<Step>('trim');
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(MAX_CLIP_SECONDS);

  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);

  const [previewPhase, setPreviewPhase] = useState<'clip' | 'response'>('clip');

  // ---------------------------------------------------------------------------
  // Refs
  // ---------------------------------------------------------------------------
  const originalRef = useRef<HTMLVideoElement>(null);   // Original in trim/preview
  const cameraRef = useRef<HTMLVideoElement>(null);     // Live camera
  const recordedRef = useRef<HTMLVideoElement>(null);   // Recorded response preview
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxRecordDuration = 60; // seconds allowed for the response clip

  // ---------------------------------------------------------------------------
  // Auth guard
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!user) router.push('/login');
  }, [user, router]);

  // ---------------------------------------------------------------------------
  // Fetch original video
  // ---------------------------------------------------------------------------
  const { data: videoData, isLoading: videoLoading } = useQuery({
    queryKey: ['video', videoUri],
    queryFn: () => api.getVideo(videoUri),
    enabled: !!videoUri,
  });

  const originalVideo = videoData?.video;
  const videoDuration = originalVideo?.video?.duration ?? originalVideo?.duration ?? 60;
  const originalSrc =
    originalVideo?.video?.hlsPlaylist ??
    originalVideo?.video?.cdnUrl ??
    originalVideo?.hlsPlaylist ??
    originalVideo?.cdnUrl ??
    '';

  // Keep trimEnd in bounds when video loads
  useEffect(() => {
    if (videoDuration > 0) {
      setTrimEnd(Math.min(MAX_CLIP_SECONDS, videoDuration));
    }
  }, [videoDuration]);

  // ---------------------------------------------------------------------------
  // Camera init (only when entering record step)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (step !== 'record') return;
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
      if (step === 'record') {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setCameraReady(false);
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [step]);

  // ---------------------------------------------------------------------------
  // Preview phase orchestration: play clip, then response
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (step !== 'preview') return;

    const clipVideo = originalRef.current;
    if (!clipVideo || !originalSrc) return;

    setPreviewPhase('clip');
    clipVideo.currentTime = trimStart;
    clipVideo.play().catch(() => {});

    const handleTimeUpdate = () => {
      if (clipVideo.currentTime >= trimEnd) {
        clipVideo.pause();
        setPreviewPhase('response');
        if (recordedRef.current) {
          recordedRef.current.currentTime = 0;
          recordedRef.current.play().catch(() => {});
        }
      }
    };

    clipVideo.addEventListener('timeupdate', handleTimeUpdate);
    return () => clipVideo.removeEventListener('timeupdate', handleTimeUpdate);
  }, [step, trimStart, trimEnd, originalSrc]);

  // ---------------------------------------------------------------------------
  // Recording controls
  // ---------------------------------------------------------------------------
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
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
      setStep('preview');
    };

    recorder.start(100);
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
    setRecordingTime(0);

    timerRef.current = setInterval(() => {
      setRecordingTime((prev) => {
        if (prev >= maxRecordDuration) {
          stopRecording();
          return prev;
        }
        return prev + 1;
      });
    }, 1000);
  }, [maxRecordDuration, stopRecording]);

  const discardAndReRecord = () => {
    setRecordedBlob(null);
    setRecordingTime(0);
    setPreviewPhase('clip');
    setStep('record');
  };

  const backToTrim = () => {
    setRecordedBlob(null);
    setIsRecording(false);
    setRecordingTime(0);
    if (timerRef.current) clearInterval(timerRef.current);
    setStep('trim');
  };

  // ---------------------------------------------------------------------------
  // Upload mutation
  // ---------------------------------------------------------------------------
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!recordedBlob) throw new Error('No response recording');

      // 1. Get upload URL
      const { uploadId, uploadUrl } = await api.getUploadUrl('video/webm');

      // 2. Upload to storage
      const storageResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: recordedBlob,
        headers: { 'Content-Type': 'video/webm' },
      });
      if (!storageResponse.ok) throw new Error('Upload to storage failed');

      // 3. Trigger processing
      await api.completeUpload(uploadId);

      // 4. Poll for completion
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
        caption: `Stitch with @${originalVideo?.author?.handle ?? 'creator'}`,
        tags: ['stitch'],
        visibility: 'public',
        duration: recordingTime,
        aspectRatio: { width: 9, height: 16 },
      });

      // 6. Register the stitch relationship
      await api.createStitch({
        videoUri: postResult.uri,
        originalVideoUri: videoUri,
        startTime: trimStart,
        endTime: trimEnd,
      });

      return postResult;
    },
    onSuccess: () => {
      toast.success('Stitch published!');
      router.push('/');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Upload failed');
    },
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const clipDuration = trimEnd - trimStart;
  const recordProgressPct = Math.min((recordingTime / maxRecordDuration) * 100, 100);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* ── STEP INDICATOR ── */}
      <div className="flex items-center gap-0 shrink-0">
        {(['trim', 'record', 'preview'] as Step[]).map((s, i) => (
          <div key={s} className="flex-1 relative">
            <div
              className={`h-1 ${
                step === s
                  ? 'bg-accent'
                  : ['trim', 'record', 'preview'].indexOf(step) > i
                  ? 'bg-accent/50'
                  : 'bg-white/20'
              }`}
            />
          </div>
        ))}
      </div>

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/90 z-10 shrink-0">
        <button
          onClick={() => {
            if (step === 'record') backToTrim();
            else if (step === 'preview') discardAndReRecord();
            else router.back();
          }}
          className="text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
          aria-label="Go back"
        >
          {step === 'trim' ? 'Cancel' : 'Back'}
        </button>

        <span className="text-white text-sm font-semibold">
          {step === 'trim' && 'Select Clip'}
          {step === 'record' && 'Record Response'}
          {step === 'preview' && 'Preview Stitch'}
        </span>

        {/* Right action */}
        {step === 'trim' ? (
          <button
            onClick={() => setStep('record')}
            disabled={videoLoading || !originalSrc}
            className="text-sm font-semibold text-accent disabled:text-accent/40 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Proceed to record step"
          >
            Next
          </button>
        ) : (
          <div className="w-16" />
        )}
      </div>

      {/* ── BODY ── */}
      <div className="flex-1 overflow-hidden">
        {/* ---- TRIM STEP ---- */}
        {step === 'trim' && (
          <TrimStep
            src={originalSrc}
            videoDuration={videoDuration}
            trimStart={trimStart}
            trimEnd={trimEnd}
            onTrimChange={(start, end) => {
              setTrimStart(start);
              setTrimEnd(end);
            }}
            videoRef={originalRef}
            originalVideo={originalVideo}
            videoLoading={videoLoading}
          />
        )}

        {/* ---- RECORD STEP ---- */}
        {step === 'record' && (
          <div className="w-full h-full flex flex-col">
            {/* Camera fullscreen */}
            <div className="flex-1 relative bg-zinc-900 min-h-0">
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
                  <span className="text-white text-sm">Loading camera...</span>
                </div>
              )}

              {/* Clip info overlay */}
              <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2">
                <p className="text-white text-xs font-medium">
                  Clip: {trimStart.toFixed(1)}s – {trimEnd.toFixed(1)}s ({clipDuration.toFixed(1)}s)
                </p>
                <p className="text-white/60 text-xs">
                  @{originalVideo?.author?.handle ?? '...'}
                </p>
              </div>

              {/* Recording timer */}
              {isRecording && (
                <div className="absolute top-3 right-3 flex items-center gap-2 bg-black/70 rounded-full px-3 py-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
                  <span className="text-white text-sm font-mono" aria-live="polite">
                    {formatTime(recordingTime)}
                  </span>
                </div>
              )}

              {/* Recording progress */}
              {isRecording && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
                  <div
                    className="h-full bg-red-500 transition-all duration-1000 ease-linear"
                    style={{ width: `${recordProgressPct}%` }}
                    role="progressbar"
                    aria-valuenow={recordingTime}
                    aria-valuemax={maxRecordDuration}
                  />
                </div>
              )}
            </div>

            {/* Record controls */}
            <div className="px-4 py-6 bg-black/90 flex items-center justify-center shrink-0">
              <RecordButton
                isRecording={isRecording}
                disabled={!cameraReady}
                onStart={startRecording}
                onStop={stopRecording}
              />
            </div>
          </div>
        )}

        {/* ---- PREVIEW STEP ---- */}
        {step === 'preview' && (
          <div className="w-full h-full flex flex-col">
            <div className="flex-1 relative bg-black min-h-0">
              {/* Phase label */}
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1">
                <span className="text-white text-xs font-medium">
                  {previewPhase === 'clip'
                    ? `Clip from @${originalVideo?.author?.handle ?? '...'}`
                    : 'Your response'}
                </span>
              </div>

              {/* Original clip — visible only during clip phase */}
              <video
                ref={originalRef}
                src={originalSrc}
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                  previewPhase === 'clip' ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
                playsInline
                muted
              />

              {/* Recorded response — visible only during response phase */}
              <video
                ref={recordedRef}
                src={recordedBlob ? URL.createObjectURL(recordedBlob) : undefined}
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                  previewPhase === 'response' ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
                playsInline
              />
            </div>

            {/* Preview controls */}
            <div className="px-4 py-6 bg-black/90 flex items-center justify-center gap-4 shrink-0">
              <button
                onClick={discardAndReRecord}
                className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-medium transition-colors"
              >
                Re-record
              </button>
              <button
                onClick={backToTrim}
                className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-medium transition-colors"
              >
                Edit Clip
              </button>
              <button
                onClick={() => uploadMutation.mutate()}
                disabled={uploadMutation.isPending}
                className="px-8 py-3 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors min-w-[130px]"
              >
                {uploadMutation.isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <SpinnerIcon className="w-4 h-4 animate-spin" />
                    Publishing...
                  </span>
                ) : (
                  'Post Stitch'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trim Step component
// ---------------------------------------------------------------------------
interface TrimStepProps {
  src: string;
  videoDuration: number;
  trimStart: number;
  trimEnd: number;
  onTrimChange: (start: number, end: number) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalVideo: any;
  videoLoading: boolean;
}

function TrimStep({
  src,
  videoDuration,
  trimStart,
  trimEnd,
  onTrimChange,
  videoRef,
  originalVideo,
  videoLoading,
}: TrimStepProps) {
  const clipDuration = trimEnd - trimStart;
  const safeTotal = videoDuration > 0 ? videoDuration : 1;

  // Seek video when handles change
  const handleStartChange = (value: number) => {
    const newStart = Math.min(value, trimEnd - 1);
    const newEnd = Math.min(trimEnd, newStart + MAX_CLIP_SECONDS);
    onTrimChange(newStart, newEnd);
    if (videoRef.current) videoRef.current.currentTime = newStart;
  };

  const handleEndChange = (value: number) => {
    const clampedEnd = Math.min(value, trimStart + MAX_CLIP_SECONDS, videoDuration);
    const newEnd = Math.max(clampedEnd, trimStart + 0.5);
    onTrimChange(trimStart, newEnd);
    if (videoRef.current) videoRef.current.currentTime = newEnd;
  };

  const previewClip = () => {
    if (!videoRef.current || !src) return;
    videoRef.current.currentTime = trimStart;
    videoRef.current.play().catch(() => {});
    const stopAt = trimEnd;
    const check = setInterval(() => {
      if (!videoRef.current || videoRef.current.currentTime >= stopAt) {
        videoRef.current?.pause();
        clearInterval(check);
      }
    }, 100);
  };

  return (
    <div className="w-full h-full flex flex-col overflow-auto bg-black">
      {/* Video preview */}
      <div className="relative bg-black" style={{ aspectRatio: '9/16', maxHeight: '55vh' }}>
        {videoLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <SpinnerIcon className="w-8 h-8 animate-spin text-white/50" />
          </div>
        ) : src ? (
          <video
            ref={videoRef}
            src={src}
            className="w-full h-full object-cover"
            playsInline
            muted
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-white/40 text-sm">
            No video source
          </div>
        )}

        {/* Author overlay */}
        {originalVideo && (
          <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
            <p className="text-white text-sm font-medium truncate">
              {originalVideo.caption || 'Untitled video'}
            </p>
            <p className="text-white/70 text-xs">@{originalVideo.author?.handle}</p>
          </div>
        )}
      </div>

      {/* Trim controls */}
      <div className="flex-1 p-4 space-y-5">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-white text-sm font-semibold">Select Clip</span>
            <span className="text-accent text-sm font-mono">
              {clipDuration.toFixed(1)}s / {MAX_CLIP_SECONDS}s max
            </span>
          </div>

          {/* Visual timeline */}
          <div className="relative h-10 bg-zinc-800 rounded-lg overflow-hidden mb-3">
            {/* Full track */}
            <div className="absolute inset-0 flex items-center">
              <div className="w-full h-4 bg-zinc-700 rounded" />
            </div>

            {/* Selected region */}
            <div
              className="absolute top-1 bottom-1 bg-accent/60 border-x-2 border-accent rounded"
              style={{
                left: `${(trimStart / safeTotal) * 100}%`,
                width: `${((trimEnd - trimStart) / safeTotal) * 100}%`,
              }}
            />

            {/* Start handle */}
            <div
              className="absolute top-0 bottom-0 w-1 bg-accent cursor-ew-resize"
              style={{ left: `${(trimStart / safeTotal) * 100}%` }}
            />
            {/* End handle */}
            <div
              className="absolute top-0 bottom-0 w-1 bg-accent cursor-ew-resize"
              style={{ left: `${(trimEnd / safeTotal) * 100}%` }}
            />
          </div>

          {/* Range sliders */}
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs text-white/50 mb-1">
                <label htmlFor="stitch-trim-start" className="text-white/70">
                  Start: {trimStart.toFixed(1)}s
                </label>
              </div>
              <input
                id="stitch-trim-start"
                type="range"
                min={0}
                max={Math.max(0, videoDuration - 0.5)}
                step={0.1}
                value={trimStart}
                onChange={(e) => handleStartChange(parseFloat(e.target.value))}
                className="w-full accent-accent"
                aria-label="Clip start time"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="stitch-trim-end" className="text-white/70">
                  End: {trimEnd.toFixed(1)}s
                </label>
              </div>
              <input
                id="stitch-trim-end"
                type="range"
                min={trimStart + 0.5}
                max={Math.min(trimStart + MAX_CLIP_SECONDS, videoDuration)}
                step={0.1}
                value={trimEnd}
                onChange={(e) => handleEndChange(parseFloat(e.target.value))}
                className="w-full accent-accent"
                aria-label="Clip end time"
              />
            </div>
          </div>

          {/* Duration markers */}
          <div className="flex justify-between text-xs text-white/30 mt-1 px-0.5">
            <span>0s</span>
            <span>{(videoDuration / 2).toFixed(0)}s</span>
            <span>{videoDuration.toFixed(0)}s</span>
          </div>
        </div>

        {/* Preview clip button */}
        <button
          onClick={previewClip}
          disabled={!src}
          className="w-full py-2.5 bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
          aria-label="Preview selected clip"
        >
          <PlayIcon className="w-4 h-4" />
          Preview Clip ({clipDuration.toFixed(1)}s)
        </button>

        {/* Info */}
        <p className="text-white/40 text-xs text-center">
          Select up to {MAX_CLIP_SECONDS} seconds from the original video. Your response will play
          immediately after.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------
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
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
