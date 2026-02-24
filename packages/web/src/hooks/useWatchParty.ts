'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  WatchPartyView,
  WatchPartyParticipant,
  WatchPartyQueueItem,
  WatchPartyMessage,
  WatchPartyPlaybackState,
} from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

interface UseWatchPartyOptions {
  partyId: string;
  token: string;
  onPlaybackUpdate?: (state: WatchPartyPlaybackState & { controlledBy?: string; action?: string }) => void;
  onParticipantJoined?: (participant: WatchPartyParticipant) => void;
  onParticipantLeft?: (userDid: string) => void;
  onNewMessage?: (message: WatchPartyMessage) => void;
  onQueueUpdated?: (queue: WatchPartyQueueItem[]) => void;
  onError?: (error: string) => void;
}

interface WatchPartyState {
  party: WatchPartyView | null;
  participants: WatchPartyParticipant[];
  queue: WatchPartyQueueItem[];
  messages: WatchPartyMessage[];
  playbackState: WatchPartyPlaybackState | null;
  isConnected: boolean;
  isJoined: boolean;
}

export function useWatchParty({
  partyId,
  token,
  onPlaybackUpdate,
  onParticipantJoined,
  onParticipantLeft,
  onNewMessage,
  onQueueUpdated,
  onError,
}: UseWatchPartyOptions) {
  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<WatchPartyState>({
    party: null,
    participants: [],
    queue: [],
    messages: [],
    playbackState: null,
    isConnected: false,
    isJoined: false,
  });

  // Position sync interval ref
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastPositionRef = useRef<number>(0);

  // Connect to WebSocket
  useEffect(() => {
    if (!partyId || !token) return;

    const socket = io(`${API_URL}/watch-party`, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setState((prev) => ({ ...prev, isConnected: true }));
      // Join the party room
      socket.emit('join-party', { partyId });
    });

    socket.on('disconnect', () => {
      setState((prev) => ({ ...prev, isConnected: false, isJoined: false }));
    });

    // Full party state on join
    socket.on('party-state', (data) => {
      setState((prev) => ({
        ...prev,
        party: data.party,
        participants: data.participants,
        queue: data.queue,
        messages: data.recentMessages || [],
        playbackState: data.party ? {
          videoUri: data.party.currentVideoUri,
          position: data.party.currentPosition,
          isPlaying: data.party.isPlaying,
          updatedAt: Date.now(),
        } : null,
        isJoined: true,
      }));
    });

    // Playback updates
    socket.on('playback-update', (data) => {
      const playbackState = {
        videoUri: data.videoUri,
        position: data.position,
        isPlaying: data.isPlaying,
        updatedAt: data.updatedAt || Date.now(),
      };
      setState((prev) => ({ ...prev, playbackState }));
      onPlaybackUpdate?.(data);
    });

    // Position sync from host
    socket.on('position-sync', (data) => {
      setState((prev) => {
        if (!prev.playbackState) return prev;
        return {
          ...prev,
          playbackState: {
            ...prev.playbackState,
            position: data.position,
            updatedAt: data.timestamp,
          },
        };
      });
    });

    // Participant events
    socket.on('participant-joined', (data) => {
      setState((prev) => ({
        ...prev,
        participants: [...prev.participants, data.participant],
      }));
      onParticipantJoined?.(data.participant);
    });

    socket.on('participant-left', (data) => {
      setState((prev) => ({
        ...prev,
        participants: prev.participants.map((p) =>
          p.userDid === data.userDid ? { ...p, isPresent: false } : p
        ),
      }));
      onParticipantLeft?.(data.userDid);
    });

    // Chat messages
    socket.on('new-message', (data) => {
      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, data],
      }));
      onNewMessage?.(data);
    });

    // Queue updates
    socket.on('queue-updated', (data) => {
      setState((prev) => ({ ...prev, queue: data.queue }));
      onQueueUpdated?.(data.queue);
    });

    // Errors
    socket.on('error', (data) => {
      onError?.(data.message);
    });

    return () => {
      socket.emit('leave-party', { partyId });
      socket.disconnect();
      socketRef.current = null;
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [partyId, token]);

  // Control playback (host/cohost only)
  const controlPlayback = useCallback(
    (action: 'play' | 'pause' | 'seek' | 'next', position?: number, videoUri?: string) => {
      if (!socketRef.current) return;
      socketRef.current.emit('playback-control', {
        partyId,
        action,
        position,
        videoUri,
      });
    },
    [partyId]
  );

  const play = useCallback((position?: number) => {
    controlPlayback('play', position);
  }, [controlPlayback]);

  const pause = useCallback((position?: number) => {
    controlPlayback('pause', position);
  }, [controlPlayback]);

  const seek = useCallback((position: number) => {
    controlPlayback('seek', position);
  }, [controlPlayback]);

  const nextVideo = useCallback(() => {
    controlPlayback('next');
  }, [controlPlayback]);

  // Send position sync (called by host when playing)
  const syncPosition = useCallback(
    (position: number) => {
      if (!socketRef.current) return;
      lastPositionRef.current = position;
      socketRef.current.emit('position-sync', { partyId, position });
    },
    [partyId]
  );

  // Start position sync interval (call when host starts playing)
  const startPositionSync = useCallback(() => {
    if (syncIntervalRef.current) return;
    syncIntervalRef.current = setInterval(() => {
      if (socketRef.current && state.playbackState?.isPlaying) {
        syncPosition(lastPositionRef.current);
      }
    }, 3000);
  }, [syncPosition, state.playbackState?.isPlaying]);

  // Stop position sync interval
  const stopPositionSync = useCallback(() => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
  }, []);

  // Update local position (for sync interval)
  const updateLocalPosition = useCallback((position: number) => {
    lastPositionRef.current = position;
  }, []);

  // Request current state sync
  const requestSync = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.emit('sync-request', { partyId });
  }, [partyId]);

  // Send chat message
  const sendMessage = useCallback(
    (text: string, messageType: 'text' | 'emoji' | 'reaction' = 'text') => {
      if (!socketRef.current) return;
      socketRef.current.emit('send-message', { partyId, text, messageType });
    },
    [partyId]
  );

  // Add video to queue
  const addToQueue = useCallback(
    (videoUri: string) => {
      if (!socketRef.current) return;
      socketRef.current.emit('queue-add', { partyId, videoUri });
    },
    [partyId]
  );

  return {
    ...state,
    play,
    pause,
    seek,
    nextVideo,
    sendMessage,
    addToQueue,
    requestSync,
    syncPosition,
    startPositionSync,
    stopPositionSync,
    updateLocalPosition,
  };
}
