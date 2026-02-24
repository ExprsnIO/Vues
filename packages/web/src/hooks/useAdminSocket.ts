/**
 * Admin WebSocket Hook
 * Real-time admin dashboard stats and notifications
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/lib/auth-context';
import { getLocalSession } from '@/lib/auth';

// Types
export interface AdminStats {
  activeUsers: number;
  totalUsers: number;
  newUsersToday: number;
  pendingReports: number;
  activeRenderJobs: number;
  queuedRenderJobs: number;
  activeSanctions: number;
  onlineAdmins: number;
  systemHealth: {
    api: 'healthy' | 'degraded' | 'down';
    database: 'healthy' | 'degraded' | 'down';
    redis: 'healthy' | 'degraded' | 'down';
    storage: 'healthy' | 'degraded' | 'down';
  };
}

export interface AdminNotification {
  id: string;
  type: 'report' | 'sanction' | 'user' | 'system' | 'render';
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface AdminActivityEvent {
  adminDid: string;
  adminHandle: string;
  action: string;
  targetType?: string;
  targetId?: string;
  timestamp: string;
}

export interface ConnectedAdmin {
  did: string;
  handle: string;
  role: 'super_admin' | 'admin' | 'moderator' | 'support';
}

// Socket singleton
let socket: Socket | null = null;
let socketRefCount = 0;

function getSocket(token: string): Socket {
  if (!socket || !socket.connected) {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

    socket = io(`${apiUrl}/admin`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('AdminSocket: Connected');
    });

    socket.on('disconnect', (reason) => {
      console.log('AdminSocket: Disconnected:', reason);
    });

    socket.on('connect_error', (error) => {
      console.error('AdminSocket: Connection error:', error.message);
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

export interface UseAdminSocketOptions {
  onStats?: (stats: AdminStats) => void;
  onNotification?: (notification: AdminNotification) => void;
  onActivity?: (event: AdminActivityEvent) => void;
  onAdminJoined?: (admin: ConnectedAdmin) => void;
  onAdminLeft?: (admin: { did: string; handle: string }) => void;
  enabled?: boolean;
}

export interface UseAdminSocketResult {
  stats: AdminStats | null;
  notifications: AdminNotification[];
  connectedAdmins: ConnectedAdmin[];
  isConnected: boolean;
  refreshStats: () => void;
  broadcastActivity: (action: string, targetType?: string, targetId?: string) => void;
  clearNotifications: () => void;
}

/**
 * Hook for admin WebSocket connection
 * Provides real-time stats, notifications, and admin activity tracking
 */
export function useAdminSocket(
  options: UseAdminSocketOptions = {}
): UseAdminSocketResult {
  const {
    onStats,
    onNotification,
    onActivity,
    onAdminJoined,
    onAdminLeft,
    enabled = true,
  } = options;

  const { user } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [connectedAdmins, setConnectedAdmins] = useState<ConnectedAdmin[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  // Callback refs to avoid re-subscriptions
  const onStatsRef = useRef(onStats);
  const onNotificationRef = useRef(onNotification);
  const onActivityRef = useRef(onActivity);
  const onAdminJoinedRef = useRef(onAdminJoined);
  const onAdminLeftRef = useRef(onAdminLeft);

  useEffect(() => {
    onStatsRef.current = onStats;
    onNotificationRef.current = onNotification;
    onActivityRef.current = onActivity;
    onAdminJoinedRef.current = onAdminJoined;
    onAdminLeftRef.current = onAdminLeft;
  }, [onStats, onNotification, onActivity, onAdminJoined, onAdminLeft]);

  useEffect(() => {
    if (!enabled || !user) return;

    const localSession = getLocalSession();
    const token = localSession?.accessJwt;

    if (!token) return;

    socketRefCount++;
    const sock = getSocket(token);
    socketRef.current = sock;

    // Connection status
    const handleConnect = () => {
      setIsConnected(true);
      // Request initial data
      sock.emit('get-stats');
      sock.emit('get-connected-admins');
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    // Stats updates
    const handleStats = (newStats: AdminStats) => {
      setStats(newStats);
      onStatsRef.current?.(newStats);
    };

    // Notifications
    const handleNotification = (notification: AdminNotification) => {
      setNotifications((prev) => [notification, ...prev].slice(0, 50)); // Keep last 50
      onNotificationRef.current?.(notification);
    };

    // Admin activity
    const handleActivity = (event: AdminActivityEvent) => {
      onActivityRef.current?.(event);
    };

    // Connected admins
    const handleConnectedAdmins = (admins: ConnectedAdmin[]) => {
      setConnectedAdmins(admins);
    };

    const handleAdminJoined = (admin: ConnectedAdmin) => {
      setConnectedAdmins((prev) => {
        if (prev.some((a) => a.did === admin.did)) return prev;
        return [...prev, admin];
      });
      onAdminJoinedRef.current?.(admin);
    };

    const handleAdminLeft = (admin: { did: string; handle: string }) => {
      setConnectedAdmins((prev) => prev.filter((a) => a.did !== admin.did));
      onAdminLeftRef.current?.(admin);
    };

    // Register event listeners
    sock.on('connect', handleConnect);
    sock.on('disconnect', handleDisconnect);
    sock.on('stats', handleStats);
    sock.on('notification', handleNotification);
    sock.on('admin-activity', handleActivity);
    sock.on('connected-admins', handleConnectedAdmins);
    sock.on('admin-joined', handleAdminJoined);
    sock.on('admin-left', handleAdminLeft);

    // If already connected, request data
    if (sock.connected) {
      setIsConnected(true);
      sock.emit('get-stats');
      sock.emit('get-connected-admins');
    }

    return () => {
      sock.off('connect', handleConnect);
      sock.off('disconnect', handleDisconnect);
      sock.off('stats', handleStats);
      sock.off('notification', handleNotification);
      sock.off('admin-activity', handleActivity);
      sock.off('connected-admins', handleConnectedAdmins);
      sock.off('admin-joined', handleAdminJoined);
      sock.off('admin-left', handleAdminLeft);
      releaseSocket();
    };
  }, [enabled, user]);

  // Request fresh stats
  const refreshStats = useCallback(() => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('get-stats');
    }
  }, []);

  // Broadcast activity
  const broadcastActivity = useCallback(
    (action: string, targetType?: string, targetId?: string) => {
      if (socketRef.current?.connected) {
        socketRef.current.emit('activity', { action, targetType, targetId });
      }
    },
    []
  );

  // Clear notifications
  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  return {
    stats,
    notifications,
    connectedAdmins,
    isConnected,
    refreshStats,
    broadcastActivity,
    clearNotifications,
  };
}

/**
 * Hook for admin notifications only (lighter weight)
 */
export function useAdminNotifications(
  options: { onNotification?: (notification: AdminNotification) => void; enabled?: boolean } = {}
): {
  notifications: AdminNotification[];
  clearNotifications: () => void;
} {
  const { onNotification, enabled = true } = options;
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);

  const result = useAdminSocket({
    enabled,
    onNotification: (notification) => {
      onNotification?.(notification);
    },
  });

  return {
    notifications: result.notifications,
    clearNotifications: result.clearNotifications,
  };
}
