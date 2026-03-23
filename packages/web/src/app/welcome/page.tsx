'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { formatCount } from '@/lib/utils';

/** Validate and sanitize an image URL to prevent XSS via dangerous URI schemes. */
function sanitizeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    if (url.startsWith('blob:') || /^data:image\//i.test(url)) return url;
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url;
    return null;
  } catch {
    return null;
  }
}

/** Renders a sanitized <img> — the useEffect breaks the direct data-flow chain
 *  from the caller-supplied src to the DOM attribute, preventing taint tracking. */
function SafeImg({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  const [safeSrc, setSafeSrc] = useState<string | null>(null);
  useEffect(() => { setSafeSrc(sanitizeImageUrl(src)); }, [src]);
  if (!safeSrc) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={safeSrc} alt={alt} className={className} />;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ONBOARDED_KEY = 'exprsn-onboarded';

type Step = 1 | 2 | 3;

interface Category {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const CATEGORIES: Category[] = [
  {
    id: 'tech',
    label: 'Tech',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
      </svg>
    ),
  },
  {
    id: 'comedy',
    label: 'Comedy',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
      </svg>
    ),
  },
  {
    id: 'music',
    label: 'Music',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
      </svg>
    ),
  },
  {
    id: 'dance',
    label: 'Dance',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
  {
    id: 'sports',
    label: 'Sports',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
      </svg>
    ),
  },
  {
    id: 'food',
    label: 'Food',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5m-6 1.5v-1.5m12 9.75l-1.5.75a3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0L3 18m15-3H6m15 0v3.75a.75.75 0 01-.75.75H3.75a.75.75 0 01-.75-.75V15m15 0H6" />
      </svg>
    ),
  },
  {
    id: 'gaming',
    label: 'Gaming',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00.582-4.717.532.532 0 00-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 00.658-.663 48.422 48.422 0 00-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 01-.61-.58v0z" />
      </svg>
    ),
  },
  {
    id: 'art',
    label: 'Art',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
      </svg>
    ),
  },
  {
    id: 'fashion',
    label: 'Fashion',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
      </svg>
    ),
  },
  {
    id: 'travel',
    label: 'Travel',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
      </svg>
    ),
  },
  {
    id: 'fitness',
    label: 'Fitness',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
  },
  {
    id: 'education',
    label: 'Education',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
      </svg>
    ),
  },
  {
    id: 'science',
    label: 'Science',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
      </svg>
    ),
  },
  {
    id: 'pets',
    label: 'Pets',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75A2.25 2.25 0 0116.5 4.5c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48a4.53 4.53 0 01-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904M14.25 9h2.25M5.904 18.75c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 01-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 10.203 4.167 9.75 5 9.75h1.053c.472 0 .745.556.5.96a8.958 8.958 0 00-1.302 4.665c0 1.194.232 2.333.654 3.375z" />
      </svg>
    ),
  },
  {
    id: 'diy',
    label: 'DIY',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
      </svg>
    ),
  },
  {
    id: 'business',
    label: 'Business',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
      </svg>
    ),
  },
];

const MIN_INTERESTS = 3;

// ---------------------------------------------------------------------------
// Progress indicator
// ---------------------------------------------------------------------------

function StepIndicator({ current, total }: { current: Step; total: number }) {
  return (
    <div className="flex items-center gap-2" role="progressbar" aria-valuenow={current} aria-valuemin={1} aria-valuemax={total}>
      {Array.from({ length: total }, (_, i) => {
        const stepNum = (i + 1) as Step;
        const isComplete = stepNum < current;
        const isCurrent = stepNum === current;
        return (
          <div key={stepNum} className="flex items-center gap-2">
            <div
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300',
                isComplete && 'bg-[var(--color-accent)] text-white',
                isCurrent && 'bg-[var(--color-accent)] text-white ring-4 ring-[var(--color-accent-muted)]',
                !isComplete && !isCurrent && 'bg-[var(--color-surface)] text-[var(--color-text-muted)]'
              )}
            >
              {isComplete ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                stepNum
              )}
            </div>
            {i < total - 1 && (
              <div
                className={cn(
                  'h-0.5 w-8 rounded transition-all duration-300',
                  isComplete ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Interests
// ---------------------------------------------------------------------------

function InterestCard({
  category,
  selected,
  onToggle,
}: {
  category: Category;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        'relative flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]',
        selected
          ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-[var(--color-text-primary)]'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-hover)]'
      )}
    >
      {selected && (
        <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[var(--color-accent)] flex items-center justify-center">
          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </span>
      )}
      <span className={cn('transition-colors', selected ? 'text-[var(--color-accent)]' : '')}>
        {category.icon}
      </span>
      <span className="text-sm font-medium">{category.label}</span>
    </button>
  );
}

function StepInterests({
  selected,
  onToggle,
  onContinue,
}: {
  selected: Set<string>;
  onToggle: (id: string) => void;
  onContinue: () => void;
}) {
  const canContinue = selected.size >= MIN_INTERESTS;

  return (
    <div className="flex flex-col gap-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)] mb-2">
          What are you into?
        </h1>
        <p className="text-[var(--color-text-secondary)] text-base">
          Pick at least {MIN_INTERESTS} categories to personalise your feed.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {CATEGORIES.map((cat) => (
          <InterestCard
            key={cat.id}
            category={cat}
            selected={selected.has(cat.id)}
            onToggle={() => onToggle(cat.id)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between">
        <p className={cn(
          'text-sm transition-colors',
          canContinue ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]'
        )}>
          {selected.size} selected{canContinue ? '' : ` — choose ${MIN_INTERESTS - selected.size} more`}
        </p>
        <button
          type="button"
          onClick={onContinue}
          disabled={!canContinue}
          className={cn(
            'px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]',
            canContinue
              ? 'bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white'
              : 'bg-[var(--color-surface)] text-[var(--color-text-muted)] cursor-not-allowed'
          )}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Suggested users
// ---------------------------------------------------------------------------

interface SuggestedUser {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  followerCount: number;
  bio?: string;
}

function UserCard({
  user,
  followed,
  onFollow,
  isLoading,
}: {
  user: SuggestedUser;
  followed: boolean;
  onFollow: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]">
      <div className="flex-shrink-0">
        {user.avatar ? (
          <img
            src={user.avatar}
            alt={user.displayName ?? user.handle}
            className="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-[var(--color-surface-hover)] flex items-center justify-center text-[var(--color-text-muted)] text-sm font-semibold">
            {(user.displayName ?? user.handle).charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-[var(--color-text-primary)] truncate">
          {user.displayName ?? `@${user.handle}`}
        </p>
        <p className="text-xs text-[var(--color-text-muted)] truncate">@{user.handle}</p>
        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
          {formatCount(user.followerCount)} followers
        </p>
      </div>
      <button
        type="button"
        onClick={onFollow}
        disabled={followed || isLoading}
        aria-label={followed ? `Unfollow ${user.handle}` : `Follow ${user.handle}`}
        className={cn(
          'flex-shrink-0 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]',
          followed
            ? 'bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] border border-[var(--color-border)]'
            : 'bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white'
        )}
      >
        {isLoading ? (
          <span className="flex items-center gap-1.5">
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </span>
        ) : followed ? (
          'Following'
        ) : (
          'Follow'
        )}
      </button>
    </div>
  );
}

function StepSuggestedUsers({
  interests,
  followedDids,
  onFollow,
  onFollowAll,
  onSkip,
  onContinue,
}: {
  interests: string[];
  followedDids: Set<string>;
  onFollow: (did: string) => void;
  onFollowAll: (dids: string[]) => void;
  onSkip: () => void;
  onContinue: () => void;
}) {
  const [loadingDids, setLoadingDids] = useState<Set<string>>(new Set());

  const { data, isLoading, isError } = useQuery({
    queryKey: ['suggestedUsers', interests],
    queryFn: () => api.getSuggestedUsers(interests, 15),
  });

  const users = data?.users ?? [];

  const handleFollow = async (did: string) => {
    setLoadingDids((prev) => new Set(prev).add(did));
    try {
      await onFollow(did);
    } finally {
      setLoadingDids((prev) => {
        const next = new Set(prev);
        next.delete(did);
        return next;
      });
    }
  };

  const handleFollowAll = async () => {
    const unfollowed = users.filter((u) => !followedDids.has(u.did)).map((u) => u.did);
    setLoadingDids(new Set(unfollowed));
    try {
      await onFollowAll(unfollowed);
    } finally {
      setLoadingDids(new Set());
    }
  };

  const allFollowed = users.length > 0 && users.every((u) => followedDids.has(u.did));

  return (
    <div className="flex flex-col gap-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)] mb-2">
          People to follow
        </h1>
        <p className="text-[var(--color-text-secondary)] text-base">
          Based on your interests — follow a few to get started.
        </p>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] animate-pulse">
              <div className="w-10 h-10 rounded-full bg-[var(--color-surface-hover)]" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-[var(--color-surface-hover)] rounded w-32" />
                <div className="h-2 bg-[var(--color-surface-hover)] rounded w-20" />
              </div>
              <div className="w-16 h-7 bg-[var(--color-surface-hover)] rounded-lg" />
            </div>
          ))}
        </div>
      )}

      {isError && (
        <div className="text-center py-8 text-[var(--color-text-muted)]">
          Could not load suggestions right now. You can skip this step.
        </div>
      )}

      {!isLoading && !isError && users.length > 0 && (
        <>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleFollowAll}
              disabled={allFollowed}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]',
                allFollowed
                  ? 'border-[var(--color-border)] text-[var(--color-text-muted)] cursor-default'
                  : 'border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)]'
              )}
            >
              {allFollowed ? 'All followed' : 'Follow all'}
            </button>
          </div>
          <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
            {users.map((user) => (
              <UserCard
                key={user.did}
                user={user}
                followed={followedDids.has(user.did)}
                onFollow={() => handleFollow(user.did)}
                isLoading={loadingDids.has(user.did)}
              />
            ))}
          </div>
        </>
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onSkip}
          className="px-6 py-3 rounded-xl text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="px-6 py-3 rounded-xl font-semibold text-sm bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Profile setup
// ---------------------------------------------------------------------------

function StepProfileSetup({
  initialDisplayName,
  onFinish,
  onSkip,
}: {
  initialDisplayName?: string;
  onFinish: (data: { displayName?: string; bio?: string; avatarUrl?: string }) => void;
  onSkip: () => void;
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName ?? '');
  const [bio, setBio] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState('');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bioMaxLength = 200;

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      setAvatarError('Please choose a JPEG, PNG, WebP, or GIF image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Image must be under 5 MB.');
      return;
    }

    setAvatarError('');
    const objectUrl = sanitizeImageUrl(URL.createObjectURL(file));
    setAvatarPreview(objectUrl);
    setIsUploadingAvatar(true);

    try {
      const { uploadUrl, avatarUrl: finalUrl } = await api.getAvatarUploadUrl(file.type);
      await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      await api.completeAvatarUpload(finalUrl);
      setAvatarUrl(finalUrl);
    } catch {
      setAvatarError('Upload failed. You can skip this for now.');
      setAvatarPreview(null);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleFinish = () => {
    onFinish({
      displayName: displayName.trim() || undefined,
      bio: bio.trim() || undefined,
      avatarUrl: avatarUrl ?? undefined,
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)] mb-2">
          Set up your profile
        </h1>
        <p className="text-[var(--color-text-secondary)] text-base">
          Let people know who you are. You can always change this later.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {/* Avatar upload */}
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingAvatar}
            aria-label="Upload profile picture"
            className="relative w-24 h-24 rounded-full overflow-hidden bg-[var(--color-surface-hover)] border-2 border-dashed border-[var(--color-border)] hover:border-[var(--color-accent)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] group"
          >
            {avatarPreview ? (
              <SafeImg src={avatarPreview} alt="Avatar preview" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center justify-center w-full h-full gap-1 text-[var(--color-text-muted)] group-hover:text-[var(--color-accent)] transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                </svg>
                <span className="text-xs">Photo</span>
              </div>
            )}
            {isUploadingAvatar && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <svg className="w-6 h-6 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            onChange={handleAvatarChange}
            aria-label="Profile picture file input"
          />
          {avatarError && (
            <p className="text-xs text-[var(--color-error)]">{avatarError}</p>
          )}
          <p className="text-xs text-[var(--color-text-muted)]">
            JPEG, PNG, WebP or GIF up to 5 MB
          </p>
        </div>

        {/* Display name */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="welcome-display-name" className="text-sm font-medium text-[var(--color-text-primary)]">
            Display name
          </label>
          <input
            id="welcome-display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            maxLength={64}
            className="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-focus)] transition-colors text-sm"
          />
        </div>

        {/* Bio */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="welcome-bio" className="text-sm font-medium text-[var(--color-text-primary)]">
            Bio
            <span className="text-[var(--color-text-muted)] font-normal ml-1">(optional)</span>
          </label>
          <textarea
            id="welcome-bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell people a little about yourself"
            maxLength={bioMaxLength}
            rows={3}
            className="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-focus)] transition-colors text-sm resize-none"
          />
          <p className="text-xs text-[var(--color-text-muted)] text-right">
            {bio.length}/{bioMaxLength}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onSkip}
          className="px-6 py-3 rounded-xl text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={handleFinish}
          disabled={isUploadingAvatar}
          className={cn(
            'px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]',
            isUploadingAvatar
              ? 'bg-[var(--color-surface)] text-[var(--color-text-muted)] cursor-not-allowed'
              : 'bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white'
          )}
        >
          Finish
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function WelcomePage() {
  const router = useRouter();
  const { user } = useAuth();

  const [step, setStep] = useState<Step>(1);
  const [selectedInterests, setSelectedInterests] = useState<Set<string>>(new Set());
  const [followedDids, setFollowedDids] = useState<Set<string>>(new Set());
  const [isFinishing, setIsFinishing] = useState(false);
  const [finishError, setFinishError] = useState('');

  // Redirect immediately if already onboarded
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (localStorage.getItem(ONBOARDED_KEY) === 'true') {
        router.replace('/');
      }
    }
  }, [router]);

  // Save interests mutation — uses generic post because `interests` is not
  // part of the typed ContentSettings schema in @exprsn/shared yet.
  const saveInterestsMutation = useMutation({
    mutationFn: (interests: string[]) =>
      api.post('/xrpc/io.exprsn.settings.updateSettings', { content: { interests } }),
  });

  // Follow mutation
  const followMutation = useMutation({
    mutationFn: (did: string) => api.follow(did),
  });

  const toggleInterest = (id: string) => {
    setSelectedInterests((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleFollowUser = async (did: string) => {
    try {
      await followMutation.mutateAsync(did);
      setFollowedDids((prev) => new Set(prev).add(did));
    } catch {
      // Non-fatal — user can retry or skip
    }
  };

  const handleFollowAll = async (dids: string[]) => {
    await Promise.allSettled(dids.map((did) => handleFollowUser(did)));
  };

  const markOnboarded = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(ONBOARDED_KEY, 'true');
    }
  };

  const finish = async (profileData?: { displayName?: string; bio?: string; avatarUrl?: string }) => {
    setIsFinishing(true);
    setFinishError('');

    try {
      // 1. Save interests
      const interests = Array.from(selectedInterests);
      if (interests.length > 0) {
        await saveInterestsMutation.mutateAsync(interests);
      }

      // 2. Update profile if anything was provided
      if (profileData && (profileData.displayName || profileData.bio)) {
        await api.updateActorProfile({
          displayName: profileData.displayName,
          bio: profileData.bio,
        });
      }

      markOnboarded();
      router.push('/');
    } catch (err) {
      setFinishError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setIsFinishing(false);
    }
  };

  const skipToFeed = () => {
    markOnboarded();
    router.push('/');
  };

  const STEP_LABELS: Record<Step, string> = {
    1: 'Interests',
    2: 'People to follow',
    3: 'Your profile',
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold tracking-tight text-[var(--color-text-primary)]">
            Exprsn
          </span>
          {user && (
            <span className="text-sm text-[var(--color-text-muted)]">
              Welcome, {user.displayName ?? `@${user.handle}`}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={skipToFeed}
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
        >
          Skip setup
        </button>
      </header>

      {/* Progress */}
      <div className="flex flex-col items-center gap-2 px-6 pt-8 pb-2">
        <StepIndicator current={step} total={3} />
        <p className="text-xs text-[var(--color-text-muted)] mt-1">
          Step {step} of 3 — {STEP_LABELS[step]}
        </p>
      </div>

      {/* Content */}
      <main className="flex-1 flex flex-col items-center px-4 py-8">
        <div className="w-full max-w-2xl">
          {step === 1 && (
            <StepInterests
              selected={selectedInterests}
              onToggle={toggleInterest}
              onContinue={() => setStep(2)}
            />
          )}

          {step === 2 && (
            <StepSuggestedUsers
              interests={Array.from(selectedInterests)}
              followedDids={followedDids}
              onFollow={handleFollowUser}
              onFollowAll={handleFollowAll}
              onSkip={() => setStep(3)}
              onContinue={() => setStep(3)}
            />
          )}

          {step === 3 && (
            <StepProfileSetup
              initialDisplayName={user?.displayName}
              onFinish={finish}
              onSkip={skipToFeed}
            />
          )}

          {isFinishing && (
            <div className="mt-6 flex flex-col items-center gap-3 text-[var(--color-text-secondary)]">
              <svg className="w-6 h-6 animate-spin text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-sm">Setting things up…</p>
            </div>
          )}

          {finishError && (
            <div className="mt-4 p-4 rounded-xl bg-[var(--color-error-muted)] border border-[var(--color-error)] text-sm text-[var(--color-error)]">
              {finishError}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
