'use client';

import { useRouter, usePathname } from 'next/navigation';
import { twMerge } from 'tailwind-merge';

export interface FeedTab {
  id: string;
  label: string;
  path: string;
}

interface FeedTabsHeaderProps {
  className?: string;
}

const FEED_TABS: FeedTab[] = [
  { id: 'foryou', label: 'For You', path: '/' },
  { id: 'following', label: 'Following', path: '/following' },
];

export function FeedTabsHeader({ className }: FeedTabsHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();

  const activeTab = FEED_TABS.find((tab) => tab.path === pathname) || FEED_TABS[0];

  const handleTabChange = (tab: FeedTab) => {
    if (tab.path !== pathname) {
      router.push(tab.path);
    }
  };

  return (
    <div
      className={twMerge(
        'sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border',
        className
      )}
    >
      <div className="flex items-center justify-center h-12">
        <div className="flex gap-8">
          {FEED_TABS.map((tab) => {
            const isActive = tab.id === activeTab.id;

            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab)}
                className="relative flex items-center justify-center group"
              >
                <span
                  className={twMerge(
                    'px-2 py-1 text-base font-semibold transition-colors',
                    isActive
                      ? 'text-text-primary'
                      : 'text-text-muted hover:text-text-secondary'
                  )}
                >
                  {tab.label}
                </span>
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
