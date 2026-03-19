'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface PrefetchConfig {
  enabled: boolean;
  version: number;
  cache: {
    tiers: {
      hot: { ttlMs: number; maxKeys: number };
      warm: { ttlMs: number; maxKeys: number };
      cold: { ttlMs: number; maxKeys: number };
    };
    evictionPolicy: 'lru' | 'lfu' | 'ttl';
    autoPromotion: boolean;
    compression: { enabled: boolean; threshold: number };
  };
  queue: {
    timelineWorker: {
      concurrency: number;
      retries: number;
      timeoutMs: number;
      backoffType: 'exponential' | 'linear';
      baseDelayMs: number;
    };
    videoWorker: { concurrency: number; lookahead: number };
    rateLimit: number;
    batchSize: number;
  };
  strategy: {
    type: 'activity' | 'predictive' | 'hybrid';
    activity: {
      checkIntervalMs: number;
      inactivityTimeoutMs: number;
      fetchLimit: number;
    };
    priorityBuckets: { high: number; medium: number; low: number };
    adaptiveEnabled: boolean;
  };
  resilience: {
    circuitBreaker: {
      enabled: boolean;
      failureThreshold: number;
      resetTimeoutMs: number;
      halfOpenProbes: number;
    };
    metricsRetentionDays: number;
    snapshotIntervalMs: number;
  };
  edge: {
    enabled: boolean;
    replicationMode: 'push' | 'pull' | 'hybrid';
    consistency: 'eventual' | 'strong';
    syncIntervalMs: number;
  };
  federation: {
    prefetchEnabled: boolean;
    relaySubscriptions: boolean;
    blobSync: boolean;
    remotePDSCacheTTL: number;
  };
}

export function usePrefetchConfig() {
  const queryClient = useQueryClient();
  const [localConfig, setLocalConfig] = useState<PrefetchConfig | null>(null);
  const originalRef = useRef<PrefetchConfig | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'prefetch', 'config'],
    queryFn: () => api.get<{ config: PrefetchConfig }>('/xrpc/io.exprsn.admin.prefetch.config'),
    staleTime: 30000,
  });

  useEffect(() => {
    if (data?.config && !localConfig) {
      setLocalConfig(data.config);
      originalRef.current = JSON.parse(JSON.stringify(data.config));
    }
  }, [data, localConfig]);

  const saveMutation = useMutation({
    mutationFn: (config: Partial<PrefetchConfig>) =>
      api.post<{ config: PrefetchConfig }>('/xrpc/io.exprsn.admin.prefetch.config', config),
    onSuccess: (result) => {
      queryClient.setQueryData(['admin', 'prefetch', 'config'], result);
      setLocalConfig(result.config);
      originalRef.current = JSON.parse(JSON.stringify(result.config));
    },
  });

  const updateConfig = useCallback((updates: Partial<PrefetchConfig>) => {
    setLocalConfig((prev) => {
      if (!prev) return prev;
      return deepMerge(prev, updates);
    });
  }, []);

  const saveConfig = useCallback(() => {
    if (localConfig) {
      saveMutation.mutate(localConfig);
    }
  }, [localConfig, saveMutation]);

  const discardChanges = useCallback(() => {
    if (originalRef.current) {
      setLocalConfig(JSON.parse(JSON.stringify(originalRef.current)));
    }
  }, []);

  const isDirty = localConfig && originalRef.current
    ? JSON.stringify(localConfig) !== JSON.stringify(originalRef.current)
    : false;

  return {
    config: localConfig,
    isLoading,
    error,
    isDirty,
    updateConfig,
    saveConfig,
    discardChanges,
    isSaving: saveMutation.isPending,
  };
}

function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const output = { ...target };
  for (const key of Object.keys(source) as (keyof T)[]) {
    const val = source[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      output[key] = deepMerge(target[key] as any, val as any);
    } else if (val !== undefined) {
      (output as any)[key] = val;
    }
  }
  return output;
}
