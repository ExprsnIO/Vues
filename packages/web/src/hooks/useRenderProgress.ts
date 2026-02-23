/**
 * Render Progress WebSocket Hook
 * Real-time render job progress updates
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/lib/auth-context';
import { getLocalSession } from '@/lib/auth';

// Types
export interface RenderProgress {
  jobId: string;
  status: 'pending' | 'queued' | 'rendering' | 'encoding' | 'uploading' | 'completed' | 'failed' | 'paused';
  progress: number;
  currentStep?: string;
  currentTime?: number;
  totalTime?: number;
  fps?: number;
  eta?: number;
  error?: string;
}

export interface RenderJobUpdate {
  jobId: string;
  projectId: string;
  userDid: string;
  status: string;
  progress: number;
  outputUrl?: string;
  outputKey?: string;
  fileSize?: number;
  duration?: number;
  error?: string;
}

// Socket singleton
let socket: Socket | null = null;
let socketRefCount = 0;

function getSocket(token: string, userDid: string): Socket {
  if (!socket || !socket.connected) {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

    socket = io(`${apiUrl}/render-progress`, {
      auth: {
        token,
        userDid,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('RenderProgress: Connected to WebSocket');
    });

    socket.on('disconnect', (reason) => {
      console.log('RenderProgress: Disconnected:', reason);
    });

    socket.on('connect_error', (error) => {
      console.error('RenderProgress: Connection error:', error);
    });
  }

  return socket;
}

function releaseSocket() {
  socketRefCount--;
  if (socketRefCount <= 0 && socket) {
    socket.disconnect();
    socket = null;
    socketRefCount = 0;
  }
}

export interface UseRenderProgressOptions {
  onProgress?: (progress: RenderProgress) => void;
  onComplete?: (update: RenderJobUpdate) => void;
  onFailed?: (update: RenderJobUpdate) => void;
  enabled?: boolean;
}

export interface UseRenderProgressResult {
  progress: RenderProgress | null;
  isConnected: boolean;
  subscribe: (jobId: string) => void;
  unsubscribe: (jobId: string) => void;
  subscribeToProject: (projectId: string) => void;
}

/**
 * Hook to subscribe to a specific render job's progress
 */
export function useRenderProgress(
  jobId: string | null,
  options: UseRenderProgressOptions = {}
): UseRenderProgressResult {
  const { onProgress, onComplete, onFailed, enabled = true } = options;
  const { user } = useAuth();
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const subscribedJobsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || !user) return;

    const localSession = getLocalSession();
    const token = localSession?.accessJwt;

    if (!token) return;

    socketRefCount++;
    const sock = getSocket(token, user.did);
    socketRef.current = sock;

    sock.on('connect', () => {
      setIsConnected(true);
      // Re-subscribe to any jobs after reconnect
      for (const jId of subscribedJobsRef.current) {
        sock.emit('subscribe', { jobId: jId });
      }
    });

    sock.on('disconnect', () => {
      setIsConnected(false);
    });

    sock.on('progress', (data: RenderProgress) => {
      if (!jobId || data.jobId === jobId) {
        setProgress(data);
        onProgress?.(data);
      }
    });

    sock.on('complete', (data: RenderJobUpdate) => {
      if (!jobId || data.jobId === jobId) {
        setProgress({
          jobId: data.jobId,
          status: 'completed',
          progress: 100,
        });
        onComplete?.(data);
      }
    });

    sock.on('failed', (data: RenderJobUpdate) => {
      if (!jobId || data.jobId === jobId) {
        setProgress({
          jobId: data.jobId,
          status: 'failed',
          progress: 0,
          error: data.error,
        });
        onFailed?.(data);
      }
    });

    // Subscribe to specific job if provided
    if (jobId) {
      subscribedJobsRef.current.add(jobId);
      sock.emit('subscribe', { jobId });
    }

    return () => {
      if (jobId) {
        subscribedJobsRef.current.delete(jobId);
        sock.emit('unsubscribe', { jobId });
      }
      releaseSocket();
    };
  }, [enabled, user, jobId, onProgress, onComplete, onFailed]);

  const subscribe = useCallback((jId: string) => {
    if (socketRef.current?.connected) {
      subscribedJobsRef.current.add(jId);
      socketRef.current.emit('subscribe', { jobId: jId });
    }
  }, []);

  const unsubscribe = useCallback((jId: string) => {
    if (socketRef.current?.connected) {
      subscribedJobsRef.current.delete(jId);
      socketRef.current.emit('unsubscribe', { jobId: jId });
    }
  }, []);

  const subscribeToProject = useCallback((projectId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe-project', { projectId });
    }
  }, []);

  return {
    progress,
    isConnected,
    subscribe,
    unsubscribe,
    subscribeToProject,
  };
}

/**
 * Hook to listen for any render job updates for the current user
 */
export function useRenderJobNotifications(
  options: Omit<UseRenderProgressOptions, 'enabled'> = {}
): {
  isConnected: boolean;
  completedJobs: RenderJobUpdate[];
  failedJobs: RenderJobUpdate[];
  clearNotifications: () => void;
} {
  const { onComplete, onFailed } = options;
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [completedJobs, setCompletedJobs] = useState<RenderJobUpdate[]>([]);
  const [failedJobs, setFailedJobs] = useState<RenderJobUpdate[]>([]);

  useEffect(() => {
    if (!user) return;

    const localSession = getLocalSession();
    const token = localSession?.accessJwt;

    if (!token) return;

    socketRefCount++;
    const sock = getSocket(token, user.did);

    sock.on('connect', () => {
      setIsConnected(true);
    });

    sock.on('disconnect', () => {
      setIsConnected(false);
    });

    sock.on('job-complete', (data: RenderJobUpdate) => {
      setCompletedJobs((prev) => [...prev, data]);
      onComplete?.(data);
    });

    sock.on('job-failed', (data: RenderJobUpdate) => {
      setFailedJobs((prev) => [...prev, data]);
      onFailed?.(data);
    });

    return () => {
      releaseSocket();
    };
  }, [user, onComplete, onFailed]);

  const clearNotifications = useCallback(() => {
    setCompletedJobs([]);
    setFailedJobs([]);
  }, []);

  return {
    isConnected,
    completedJobs,
    failedJobs,
    clearNotifications,
  };
}

export default useRenderProgress;
