'use client';

import { useState } from 'react';

export default function AdminContentPage() {
  const [contentType, setContentType] = useState('video');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Content</h1>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <select
          value={contentType}
          onChange={(e) => setContentType(e.target.value)}
          className="px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="video">Videos</option>
          <option value="comment">Comments</option>
        </select>
      </div>

      {/* Placeholder */}
      <div className="bg-surface border border-border rounded-xl p-12 text-center">
        <ContentIcon className="w-12 h-12 text-text-muted mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-text-primary mb-2">Content Moderation</h2>
        <p className="text-text-muted">
          Content moderation interface coming soon. Use the Reports page to review flagged content.
        </p>
      </div>
    </div>
  );
}

function ContentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}
