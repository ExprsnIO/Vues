'use client';

import { useState, useEffect } from 'react';
import { twMerge } from 'tailwind-merge';

interface Step4SettingsProps {
  visibility: 'public' | 'followers' | 'private' | 'unlisted';
  allowComments: boolean;
  allowDuets: boolean;
  allowStitches: boolean;
  onUpdate: (settings: {
    visibility: 'public' | 'followers' | 'private' | 'unlisted';
    allowComments: boolean;
    allowDuets: boolean;
    allowStitches: boolean;
  }) => void;
  onNext: () => void;
  onBack: () => void;
}

const VISIBILITY_OPTIONS = [
  {
    value: 'public' as const,
    icon: GlobeIcon,
    label: 'Public',
    description: 'Everyone can see your video',
  },
  {
    value: 'followers' as const,
    icon: UsersIcon,
    label: 'Followers',
    description: 'Only your followers can see it',
  },
  {
    value: 'unlisted' as const,
    icon: LinkIcon,
    label: 'Unlisted',
    description: 'Anyone with the link can view',
  },
  {
    value: 'private' as const,
    icon: LockIcon,
    label: 'Private',
    description: 'Only you can see this video',
  },
];

export function Step4Settings({
  visibility,
  allowComments,
  allowDuets,
  allowStitches,
  onUpdate,
  onNext,
  onBack,
}: Step4SettingsProps) {
  const [localSettings, setLocalSettings] = useState({
    visibility,
    allowComments,
    allowDuets,
    allowStitches,
  });

  // Auto-save changes
  useEffect(() => {
    const timer = setTimeout(() => {
      onUpdate(localSettings);
    }, 300);

    return () => clearTimeout(timer);
  }, [localSettings, onUpdate]);

  const handleVisibilityChange = (value: typeof visibility) => {
    setLocalSettings((prev) => ({ ...prev, visibility: value }));
  };

  const toggleSetting = (key: 'allowComments' | 'allowDuets' | 'allowStitches') => {
    setLocalSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Configure settings</h2>
        <p className="text-gray-400">Choose who can see and interact with your video</p>
      </div>

      <div className="space-y-8">
        {/* Visibility Settings */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">
            Who can watch this video
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {VISIBILITY_OPTIONS.map((option) => {
              const Icon = option.icon;
              const isSelected = localSettings.visibility === option.value;

              return (
                <button
                  key={option.value}
                  onClick={() => handleVisibilityChange(option.value)}
                  className={twMerge(
                    'p-4 rounded-lg border-2 transition-all text-left hover:scale-[1.02]',
                    isSelected
                      ? 'border-primary-500 bg-primary-500/10'
                      : 'border-zinc-700 bg-zinc-900 hover:border-zinc-600'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={twMerge(
                        'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
                        isSelected ? 'bg-primary-500/20' : 'bg-zinc-800'
                      )}
                    >
                      <Icon
                        className={twMerge(
                          'w-5 h-5',
                          isSelected ? 'text-primary-400' : 'text-gray-400'
                        )}
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-white">{option.label}</p>
                        {isSelected && (
                          <CheckIcon className="w-4 h-4 text-primary-400" />
                        )}
                      </div>
                      <p className="text-sm text-gray-400">{option.description}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Interaction Settings */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">
            Allow interactions
          </h3>
          <div className="space-y-3">
            {/* Comments */}
            <div className="flex items-center justify-between p-4 bg-zinc-900 rounded-lg border border-zinc-800">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0">
                  <CommentIcon className="w-5 h-5 text-gray-400" />
                </div>
                <div>
                  <p className="font-medium text-white">Comments</p>
                  <p className="text-sm text-gray-400">
                    Let viewers share their thoughts
                  </p>
                </div>
              </div>
              <button
                onClick={() => toggleSetting('allowComments')}
                className={twMerge(
                  'relative w-12 h-6 rounded-full transition-colors',
                  localSettings.allowComments ? 'bg-primary-500' : 'bg-zinc-700'
                )}
              >
                <span
                  className={twMerge(
                    'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform',
                    localSettings.allowComments && 'translate-x-6'
                  )}
                />
              </button>
            </div>

            {/* Duets */}
            <div className="flex items-center justify-between p-4 bg-zinc-900 rounded-lg border border-zinc-800">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0">
                  <DuetIcon className="w-5 h-5 text-gray-400" />
                </div>
                <div>
                  <p className="font-medium text-white">Duets</p>
                  <p className="text-sm text-gray-400">
                    Allow others to create duets with your video
                  </p>
                </div>
              </div>
              <button
                onClick={() => toggleSetting('allowDuets')}
                className={twMerge(
                  'relative w-12 h-6 rounded-full transition-colors',
                  localSettings.allowDuets ? 'bg-primary-500' : 'bg-zinc-700'
                )}
              >
                <span
                  className={twMerge(
                    'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform',
                    localSettings.allowDuets && 'translate-x-6'
                  )}
                />
              </button>
            </div>

            {/* Stitches */}
            <div className="flex items-center justify-between p-4 bg-zinc-900 rounded-lg border border-zinc-800">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0">
                  <StitchIcon className="w-5 h-5 text-gray-400" />
                </div>
                <div>
                  <p className="font-medium text-white">Stitches</p>
                  <p className="text-sm text-gray-400">
                    Allow others to include parts of your video
                  </p>
                </div>
              </div>
              <button
                onClick={() => toggleSetting('allowStitches')}
                className={twMerge(
                  'relative w-12 h-6 rounded-full transition-colors',
                  localSettings.allowStitches ? 'bg-primary-500' : 'bg-zinc-700'
                )}
              >
                <span
                  className={twMerge(
                    'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform',
                    localSettings.allowStitches && 'translate-x-6'
                  )}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
          <div className="flex gap-3">
            <InfoIcon className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-gray-300 mb-2">
                You can change these settings anytime after publishing
              </p>
              <p className="text-xs text-gray-500">
                Visibility and interaction settings can be modified from your video's
                settings menu.
              </p>
            </div>
          </div>
        </div>
      </div>

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
          className="px-8 py-3 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

// Icons
function GlobeIcon({ className }: { className?: string }) {
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
        d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"
      />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
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
        d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
      />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
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
        d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
      />
    </svg>
  );
}

function LinkIcon({ className }: { className?: string }) {
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
        d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
      />
    </svg>
  );
}

function CommentIcon({ className }: { className?: string }) {
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
        d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
      />
    </svg>
  );
}

function DuetIcon({ className }: { className?: string }) {
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
        d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
      />
    </svg>
  );
}

function StitchIcon({ className }: { className?: string }) {
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
        d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
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
        d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
      />
    </svg>
  );
}
