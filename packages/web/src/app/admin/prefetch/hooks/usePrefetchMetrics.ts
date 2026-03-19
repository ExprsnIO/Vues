'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface PrefetchMetrics {
  cache: {
    hitRate: number;
    hotHits: number;
    warmHits: number;
    coldHits: number;
    misses: number;
  };
  prefetch: {
    totalJobs: number;
    successful: number;
    failed: number;
    avgDuration: number;
  };
  queue: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  };
}

export interface PrefetchHealth {
  healthy: boolean;
  components: {
    redis: { status: string; type?: string };
    queue: { status: string; waiting?: number; active?: number; failed?: number; reason?: string };
  };
}

export function usePrefetchMetrics() {
  const { data: metricsData } = useQuery({
    queryKey: ['admin', 'prefetch', 'metrics'],
    queryFn: () => api.get<{ metrics: PrefetchMetrics; timestamp: string }>('/xrpc/io.exprsn.admin.prefetch.metrics'),
    refetchInterval: 5000,
    staleTime: 3000,
  });

  const { data: healthData } = useQuery({
    queryKey: ['admin', 'prefetch', 'health'],
    queryFn: () => api.get<PrefetchHealth>('/xrpc/io.exprsn.admin.prefetch.health'),
    refetchInterval: 10000,
    staleTime: 8000,
  });

  return {
    metrics: metricsData?.metrics ?? null,
    timestamp: metricsData?.timestamp ?? null,
    health: healthData ?? null,
  };
}
