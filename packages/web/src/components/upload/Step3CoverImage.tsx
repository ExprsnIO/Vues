'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { twMerge } from 'tailwind-merge';

interface Step3CoverImageProps {
  videoUrl: string;
  coverImage: {
    type: 'frame' | 'custom';
    data?: string;
    timestamp?: number;
  } | null;
  onUpdate: (coverImage: {
    type: 'frame' | 'custom';
    data: string;
    timestamp?: number;
  }) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step3CoverImage({
  videoUrl,
  coverImage,
  onUpdate,
  onNext,
  onBack,
}: Step3CoverImageProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(coverImage?.timestamp || 0);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState<'frame' | 'custom'>(
    coverImage?.type || 'frame'
  );
  const [customImage, setCustomImage] = useState<string | null>(
    coverImage?.type === 'custom' ? coverImage.data || null : null
  );
  const [isGenerating, setIsGenerating] = useState(false);

  // Load video metadata and generate thumbnails
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      generateThumbnails();
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => video.removeEventListener('loadedmetadata', handleLoadedMetadata);
  }, []);

  const generateThumbnails = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    setIsGenerating(true);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const thumbCount = 8;
    const interval = video.duration / (thumbCount + 1);
    const newThumbnails: string[] = [];

    for (let i = 1; i <= thumbCount; i++) {
      const time = interval * i;
      video.currentTime = time;

      await new Promise<void>((resolve) => {
        const handleSeeked = () => {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          newThumbnails.push(canvas.toDataURL('image/jpeg', 0.8));
          resolve();
        };
        video.addEventListener('seeked', handleSeeked, { once: true });
      });
    }

    setThumbnails(newThumbnails);
    setIsGenerating(false);

    // Set default to middle thumbnail
    if (!coverImage && newThumbnails.length > 0) {
      const middleIndex = Math.floor(newThumbnails.length / 2);
      onUpdate({
        type: 'frame',
        data: newThumbnails[middleIndex],
        timestamp: interval * (middleIndex + 1),
      });
      setCurrentTime(interval * (middleIndex + 1));
    }
  };

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    onUpdate({
      type: 'frame',
      data: dataUrl,
      timestamp: video.currentTime,
    });
  }, [onUpdate]);

  const handleTimeUpdate = useCallback(
    (time: number) => {
      const video = videoRef.current;
      if (!video) return;

      video.currentTime = time;
      setCurrentTime(time);
      captureFrame();
    },
    [captureFrame]
  );

  const handleCustomImageUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setCustomImage(dataUrl);
        setSelectedType('custom');
        onUpdate({
          type: 'custom',
          data: dataUrl,
        });
      };
      reader.readAsDataURL(file);
    },
    [onUpdate]
  );

  const handleThumbnailSelect = useCallback(
    (index: number) => {
      const interval = duration / (thumbnails.length + 1);
      const time = interval * (index + 1);
      setSelectedType('frame');
      setCurrentTime(time);
      onUpdate({
        type: 'frame',
        data: thumbnails[index],
        timestamp: time,
      });
    },
    [duration, thumbnails, onUpdate]
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Choose cover image</h2>
        <p className="text-gray-400">
          Select a thumbnail that best represents your video
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Left: Preview */}
        <div>
          <div className="sticky top-4 space-y-4">
            {/* Current cover preview */}
            <div className="aspect-[9/16] bg-zinc-900 rounded-xl overflow-hidden">
              {selectedType === 'custom' && customImage ? (
                <img
                  src={customImage}
                  alt="Custom cover"
                  className="w-full h-full object-cover"
                />
              ) : (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="w-full h-full object-contain"
                  muted
                  playsInline
                />
              )}
            </div>

            {/* Video scrubber (only for frame selection) */}
            {selectedType === 'frame' && (
              <div className="p-4 bg-zinc-900 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-white">Scrub to find frame</p>
                  <p className="text-xs text-gray-400">
                    {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
                  </p>
                </div>
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={0.1}
                  value={currentTime}
                  onChange={(e) => handleTimeUpdate(parseFloat(e.target.value))}
                  className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary-500"
                />
                <button
                  onClick={captureFrame}
                  className="w-full mt-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Capture This Frame
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Options */}
        <div className="space-y-6">
          {/* Selection tabs */}
          <div className="flex gap-3">
            <button
              onClick={() => setSelectedType('frame')}
              className={twMerge(
                'flex-1 py-3 rounded-lg font-medium transition-colors',
                selectedType === 'frame'
                  ? 'bg-primary-500 text-white'
                  : 'bg-zinc-800 text-gray-300 hover:bg-zinc-700'
              )}
            >
              Video Frame
            </button>
            <button
              onClick={() => setSelectedType('custom')}
              className={twMerge(
                'flex-1 py-3 rounded-lg font-medium transition-colors',
                selectedType === 'custom'
                  ? 'bg-primary-500 text-white'
                  : 'bg-zinc-800 text-gray-300 hover:bg-zinc-700'
              )}
            >
              Custom Image
            </button>
          </div>

          {/* Auto-generated thumbnails */}
          {selectedType === 'frame' && (
            <div>
              <p className="text-sm font-medium text-white mb-3">
                Quick select from auto-generated thumbnails
              </p>
              {isGenerating ? (
                <div className="grid grid-cols-4 gap-2">
                  {[...Array(8)].map((_, i) => (
                    <div
                      key={i}
                      className="aspect-[9/16] bg-zinc-800 rounded-lg animate-pulse"
                    />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {thumbnails.map((thumb, index) => (
                    <button
                      key={index}
                      onClick={() => handleThumbnailSelect(index)}
                      className={twMerge(
                        'aspect-[9/16] rounded-lg overflow-hidden border-2 transition-all hover:scale-105',
                        coverImage?.data === thumb
                          ? 'border-primary-500 ring-2 ring-primary-500/30'
                          : 'border-transparent hover:border-zinc-600'
                      )}
                    >
                      <img
                        src={thumb}
                        alt={`Thumbnail ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Custom image upload */}
          {selectedType === 'custom' && (
            <div>
              <p className="text-sm font-medium text-white mb-3">
                Upload a custom thumbnail
              </p>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-zinc-700 hover:border-zinc-500 rounded-lg p-8 text-center cursor-pointer transition-colors"
              >
                {customImage ? (
                  <div className="space-y-3">
                    <CheckIcon className="w-12 h-12 text-green-500 mx-auto" />
                    <p className="text-white font-medium">Image uploaded</p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      className="text-primary-400 text-sm hover:underline"
                    >
                      Change image
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <ImageIcon className="w-12 h-12 text-gray-500 mx-auto" />
                    <p className="text-white font-medium">Click to upload</p>
                    <p className="text-xs text-gray-500">
                      PNG, JPG, or GIF (recommended: 1080x1920)
                    </p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleCustomImageUpload}
                className="hidden"
              />
            </div>
          )}

          {/* Tips */}
          <div className="mt-6 p-4 bg-blue-900/20 border border-blue-700/30 rounded-lg">
            <div className="flex gap-3">
              <TipIcon className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-200 mb-2">
                  Cover image best practices
                </p>
                <ul className="text-xs text-blue-300 space-y-1">
                  <li>Choose a clear, visually appealing frame</li>
                  <li>Avoid blurry or dark images</li>
                  <li>Make sure important elements are visible</li>
                  <li>Vertical format (9:16) works best</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Action Buttons */}
      <div className="mt-8 flex justify-between gap-3">
        <button
          onClick={onBack}
          className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-lg transition-colors"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!coverImage}
          className="px-8 py-3 bg-primary-500 hover:bg-primary-600 disabled:bg-zinc-800 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ImageIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
      />
    </svg>
  );
}

function TipIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
      />
    </svg>
  );
}
