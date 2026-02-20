/**
 * Editor Collaboration Client
 * Real-time collaboration using Socket.IO and Yjs
 */

import * as Y from 'yjs';
import { io, Socket } from 'socket.io-client';

/**
 * User presence information
 */
export interface CollaboratorPresence {
  user: {
    did: string;
    name: string;
    avatar?: string;
    color: string;
  };
  cursor?: {
    x: number;
    y: number;
    trackId?: string;
    clipId?: string;
    frame?: number;
  };
  selection?: {
    type: 'clip' | 'keyframe' | 'track' | 'region';
    ids: string[];
    trackId?: string;
    startFrame?: number;
    endFrame?: number;
  };
  activeView: 'timeline' | 'canvas' | 'inspector' | 'library';
  lastSeen: number;
}

/**
 * Collaboration event callbacks
 */
export interface CollaborationCallbacks {
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  onError?: (error: Error) => void;
  onPresenceUpdate?: (presence: Map<string, CollaboratorPresence>) => void;
  onCursorUpdate?: (userDid: string, cursor: CollaboratorPresence['cursor']) => void;
  onSelectionUpdate?: (userDid: string, selection: CollaboratorPresence['selection']) => void;
  onDocumentUpdate?: () => void;
  onUserJoin?: (presence: CollaboratorPresence) => void;
  onUserLeave?: (userDid: string) => void;
}

/**
 * Connection configuration
 */
export interface CollaborationConfig {
  serverUrl: string;
  token: string;
  userDid: string;
  userName: string;
  userAvatar?: string;
}

/**
 * Editor Collaboration Client
 */
export class EditorCollaborationClient {
  private socket: Socket | null = null;
  private doc: Y.Doc;
  private projectId: string | null = null;
  private presence: Map<string, CollaboratorPresence> = new Map();
  private callbacks: CollaborationCallbacks = {};
  private config: CollaborationConfig | null = null;
  private isConnected: boolean = false;

  constructor() {
    this.doc = new Y.Doc();
  }

  /**
   * Get the Yjs document
   */
  getDocument(): Y.Doc {
    return this.doc;
  }

  /**
   * Get all collaborator presence data
   */
  getPresence(): Map<string, CollaboratorPresence> {
    return new Map(this.presence);
  }

  /**
   * Check if connected
   */
  isActive(): boolean {
    return this.isConnected && this.socket !== null;
  }

  /**
   * Set event callbacks
   */
  setCallbacks(callbacks: CollaborationCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Connect to collaboration server
   */
  connect(config: CollaborationConfig): void {
    this.config = config;

    this.socket = io(`${config.serverUrl}/editor-collab`, {
      auth: {
        token: config.token,
        userDid: config.userDid,
        userName: config.userName,
        userAvatar: config.userAvatar,
      },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    this.setupSocketListeners();
  }

  /**
   * Setup socket event listeners
   */
  private setupSocketListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.isConnected = true;
      this.callbacks.onConnect?.();

      // Rejoin project if we were in one
      if (this.projectId) {
        this.joinProject(this.projectId);
      }
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      this.callbacks.onDisconnect?.(reason);
    });

    this.socket.on('connect_error', (error) => {
      this.callbacks.onError?.(error);
    });

    // Sync state from server
    this.socket.on('sync-state', (data: { state: number[]; version: number }) => {
      const state = new Uint8Array(data.state);
      Y.applyUpdate(this.doc, state);
      this.callbacks.onDocumentUpdate?.();
    });

    // Receive Yjs updates from other clients
    this.socket.on('yjs-update', (data: { update: number[]; origin: string }) => {
      const update = new Uint8Array(data.update);
      Y.applyUpdate(this.doc, update, data.origin);
      this.callbacks.onDocumentUpdate?.();
    });

    // Presence sync
    this.socket.on('presence-sync', (presenceList: CollaboratorPresence[]) => {
      this.presence.clear();
      for (const p of presenceList) {
        this.presence.set(p.user.did, p);
      }
      this.callbacks.onPresenceUpdate?.(this.presence);
    });

    // User joined
    this.socket.on('presence-join', (presence: CollaboratorPresence) => {
      this.presence.set(presence.user.did, presence);
      this.callbacks.onUserJoin?.(presence);
      this.callbacks.onPresenceUpdate?.(this.presence);
    });

    // User left
    this.socket.on('presence-leave', (data: { userDid: string }) => {
      this.presence.delete(data.userDid);
      this.callbacks.onUserLeave?.(data.userDid);
      this.callbacks.onPresenceUpdate?.(this.presence);
    });

    // Cursor updates
    this.socket.on('cursor-update', (data: { userDid: string; cursor: CollaboratorPresence['cursor'] }) => {
      const presence = this.presence.get(data.userDid);
      if (presence) {
        presence.cursor = data.cursor;
        presence.lastSeen = Date.now();
        this.callbacks.onCursorUpdate?.(data.userDid, data.cursor);
      }
    });

    // Selection updates
    this.socket.on('selection-update', (data: { userDid: string; selection: CollaboratorPresence['selection'] }) => {
      const presence = this.presence.get(data.userDid);
      if (presence) {
        presence.selection = data.selection;
        presence.lastSeen = Date.now();
        this.callbacks.onSelectionUpdate?.(data.userDid, data.selection);
      }
    });

    // View updates
    this.socket.on('view-update', (data: { userDid: string; view: CollaboratorPresence['activeView'] }) => {
      const presence = this.presence.get(data.userDid);
      if (presence) {
        presence.activeView = data.view;
        presence.lastSeen = Date.now();
        this.callbacks.onPresenceUpdate?.(this.presence);
      }
    });

    // Setup Yjs document observer
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      // Only broadcast updates that originated locally
      if (origin !== 'remote' && this.socket?.connected) {
        this.socket.emit('yjs-update', {
          update: Array.from(update),
        });
      }
    });
  }

  /**
   * Join a project
   */
  joinProject(projectId: string): void {
    this.projectId = projectId;

    if (!this.socket?.connected) {
      return;
    }

    // Reset document for new project
    this.doc = new Y.Doc();
    this.setupSocketListeners();

    this.socket.emit('join-project', { projectId });
  }

  /**
   * Leave current project
   */
  leaveProject(): void {
    if (!this.socket?.connected || !this.projectId) {
      return;
    }

    this.socket.emit('leave-project');
    this.projectId = null;
    this.presence.clear();
    this.doc = new Y.Doc();
  }

  /**
   * Update cursor position
   */
  updateCursor(cursor: CollaboratorPresence['cursor']): void {
    if (!this.socket?.connected) return;
    this.socket.emit('cursor-move', cursor);
  }

  /**
   * Update selection
   */
  updateSelection(selection: CollaboratorPresence['selection']): void {
    if (!this.socket?.connected) return;
    this.socket.emit('selection-change', selection);
  }

  /**
   * Update active view
   */
  updateActiveView(view: CollaboratorPresence['activeView']): void {
    if (!this.socket?.connected) return;
    this.socket.emit('view-change', { view });
  }

  /**
   * Request awareness sync
   */
  syncAwareness(): void {
    if (!this.socket?.connected) return;
    this.socket.emit('sync-awareness');
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.isConnected = false;
    this.projectId = null;
    this.presence.clear();
    this.doc = new Y.Doc();
  }
}

// Singleton instance
export const collaborationClient = new EditorCollaborationClient();

export default EditorCollaborationClient;
