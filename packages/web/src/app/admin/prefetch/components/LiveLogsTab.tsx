'use client';

import { useState, useRef, useEffect } from 'react';

interface PrefetchLogEntry {
  level: string;
  message: string;
  timestamp: string;
  source: string;
  metadata?: Record<string, unknown>;
}

interface LiveLogsTabProps {
  logs: PrefetchLogEntry[];
  onRefresh: () => void;
}

const LEVEL_COLORS: Record<string, string> = {
  debug: 'text-text-muted',
  info: 'text-accent',
  warn: 'text-warning',
  error: 'text-error',
};

const LEVEL_BG: Record<string, string> = {
  debug: 'bg-text-muted/10',
  info: 'bg-accent/10',
  warn: 'bg-warning/10',
  error: 'bg-error/10',
};

export function LiveLogsTab({ logs, onRefresh }: LiveLogsTabProps) {
  const [levelFilter, setLevelFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter((log) => {
    if (levelFilter && log.level !== levelFilter) return false;
    if (search) {
      const searchLower = search.toLowerCase();
      return log.message.toLowerCase().includes(searchLower) ||
        JSON.stringify(log.metadata || {}).toLowerCase().includes(searchLower);
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
          className="bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text-secondary"
        >
          <option value="">All Levels</option>
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>
        <input
          type="text"
          placeholder="Search logs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text-secondary focus:outline-none focus:border-accent"
        />
        <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="rounded border-border"
          />
          Auto-scroll
        </label>
        <button
          onClick={onRefresh}
          className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary border border-border rounded-lg"
        >
          Refresh
        </button>
      </div>

      {/* Log stream */}
      <div
        ref={scrollRef}
        className="bg-background border border-border/50 rounded-lg overflow-auto font-mono text-xs"
        style={{ maxHeight: '600px' }}
      >
        {filteredLogs.length === 0 ? (
          <div className="text-center py-12 text-text-muted">
            <p>No log entries</p>
            <p className="text-xs mt-1">Logs will appear as the prefetch engine runs</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredLogs.map((log, i) => (
              <div key={i} className={`px-3 py-1.5 flex items-start gap-2 ${LEVEL_BG[log.level] || ''}`}>
                <span className="text-text-muted shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={`shrink-0 uppercase w-12 ${LEVEL_COLORS[log.level] || 'text-text-muted'}`}>
                  [{log.level}]
                </span>
                <span className="text-text-muted shrink-0">[{log.source}]</span>
                <span className="text-text-secondary">{log.message}</span>
                {log.metadata && Object.keys(log.metadata).length > 0 && (
                  <span className="text-text-muted ml-auto shrink-0">
                    {JSON.stringify(log.metadata)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-text-muted text-right">
        Showing {filteredLogs.length} of {logs.length} entries (polling every 5s)
      </p>
    </div>
  );
}
