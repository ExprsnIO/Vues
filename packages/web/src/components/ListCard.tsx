'use client';

import Link from 'next/link';
import type { ListView } from '@/lib/api';

interface ListCardProps {
  list: ListView;
}

export function ListCard({ list }: ListCardProps) {
  return (
    <Link
      href={`/lists/${encodeURIComponent(list.uri)}`}
      className="flex items-center gap-4 p-4 rounded-xl bg-surface hover:bg-surface-hover transition-colors group"
    >
      {/* List avatar/icon */}
      <div className="w-12 h-12 rounded-lg bg-background overflow-hidden flex-shrink-0">
        {list.avatar ? (
          <img
            src={list.avatar}
            alt={list.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-accent/20">
            <ListIcon className="w-6 h-6 text-accent" />
          </div>
        )}
      </div>

      {/* List info */}
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-text-primary truncate">{list.name}</h3>
        {list.description && (
          <p className="text-sm text-text-muted truncate">{list.description}</p>
        )}
        <div className="flex items-center gap-3 mt-1 text-sm text-text-muted">
          <span>{list.memberCount} members</span>
          <span className="text-xs capitalize px-2 py-0.5 bg-surface-hover rounded">
            {list.purpose === 'modlist' ? 'Mod list' : 'List'}
          </span>
        </div>
      </div>

      {/* Arrow */}
      <ChevronRightIcon className="w-5 h-5 text-text-muted flex-shrink-0" />
    </Link>
  );
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
      />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}
