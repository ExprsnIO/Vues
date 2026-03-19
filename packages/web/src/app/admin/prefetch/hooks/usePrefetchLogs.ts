'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface PrefetchLogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
  source: string;
  metadata?: Record<string, unknown>;
}

export function usePrefetchLogs(level?: string) {
  const { data, refetch } = useQuery({
    queryKey: ['admin', 'prefetch', 'logs', level],
    queryFn: () => {
      const params = new URLSearchParams();
      if (level) params.set('level', level);
      params.set('limit', '200');
      return api.get<{ logs: PrefetchLogEntry[] }>(
        `/xrpc/io.exprsn.admin.prefetch.logs?${params.toString()}`
      );
    },
    refetchInterval: 5000,
    staleTime: 3000,
  });

  return {
    logs: data?.logs ?? [],
    refetchLogs: refetch,
  };
}
