/**
 * useEditorCollaboration Hook
 * React hook for real-time collaborative editing
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as Y from 'yjs';
import {
  EditorCollaborationClient,
  collaborationClient,
  type CollaboratorPresence,
  type CollaborationConfig,
} from '@/services/editorCollaboration';

/**
 * Collaboration state
 */
interface CollaborationState {
  isConnected: boolean;
  collaborators: CollaboratorPresence[];
  currentUser: CollaboratorPresence | null;
  projectId: string | null;
}

/**
 * Collaboration hook options
 */
interface UseEditorCollaborationOptions {
  serverUrl?: string;
  autoConnect?: boolean;
}

/**
 * Collaboration hook return type
 */
interface UseEditorCollaborationReturn {
  // State
  state: CollaborationState;
  doc: Y.Doc;

  // Actions
  connect: (config: Omit<CollaborationConfig, 'serverUrl'>) => void;
  disconnect: () => void;
  joinProject: (projectId: string) => void;
  leaveProject: () => void;
  updateCursor: (cursor: CollaboratorPresence['cursor']) => void;
  updateSelection: (selection: CollaboratorPresence['selection']) => void;
  updateActiveView: (view: CollaboratorPresence['activeView']) => void;

  // Helpers
  getCollaboratorColor: (userDid: string) => string;
  getCollaboratorById: (userDid: string) => CollaboratorPresence | undefined;
}

const DEFAULT_SERVER_URL = process.env.NEXT_PUBLIC_COLLAB_SERVER_URL || 'http://localhost:3000';

/**
 * Hook for editor collaboration
 */
export function useEditorCollaboration(
  options: UseEditorCollaborationOptions = {}
): UseEditorCollaborationReturn {
  const { serverUrl = DEFAULT_SERVER_URL, autoConnect = false } = options;

  const [state, setState] = useState<CollaborationState>({
    isConnected: false,
    collaborators: [],
    currentUser: null,
    projectId: null,
  });

  const clientRef = useRef<EditorCollaborationClient>(collaborationClient);
  const configRef = useRef<CollaborationConfig | null>(null);

  // Setup callbacks on mount
  useEffect(() => {
    const client = clientRef.current;

    client.setCallbacks({
      onConnect: () => {
        setState((prev) => ({ ...prev, isConnected: true }));
      },

      onDisconnect: () => {
        setState((prev) => ({
          ...prev,
          isConnected: false,
        }));
      },

      onError: (error) => {
        console.error('Collaboration error:', error);
      },

      onPresenceUpdate: (presence) => {
        const collaborators = Array.from(presence.values());
        const currentUser = configRef.current
          ? presence.get(configRef.current.userDid) || null
          : null;

        setState((prev) => ({
          ...prev,
          collaborators,
          currentUser,
        }));
      },

      onUserJoin: (presence) => {
        console.log('User joined:', presence.user.name);
      },

      onUserLeave: (userDid) => {
        console.log('User left:', userDid);
      },
    });

    return () => {
      // Cleanup on unmount
      client.disconnect();
    };
  }, []);

  /**
   * Connect to collaboration server
   */
  const connect = useCallback(
    (config: Omit<CollaborationConfig, 'serverUrl'>) => {
      const fullConfig: CollaborationConfig = {
        ...config,
        serverUrl,
      };

      configRef.current = fullConfig;
      clientRef.current.connect(fullConfig);
    },
    [serverUrl]
  );

  /**
   * Disconnect from server
   */
  const disconnect = useCallback(() => {
    clientRef.current.disconnect();
    configRef.current = null;
    setState({
      isConnected: false,
      collaborators: [],
      currentUser: null,
      projectId: null,
    });
  }, []);

  /**
   * Join a project
   */
  const joinProject = useCallback((projectId: string) => {
    clientRef.current.joinProject(projectId);
    setState((prev) => ({ ...prev, projectId }));
  }, []);

  /**
   * Leave current project
   */
  const leaveProject = useCallback(() => {
    clientRef.current.leaveProject();
    setState((prev) => ({ ...prev, projectId: null, collaborators: [] }));
  }, []);

  /**
   * Update cursor position
   */
  const updateCursor = useCallback((cursor: CollaboratorPresence['cursor']) => {
    clientRef.current.updateCursor(cursor);
  }, []);

  /**
   * Update selection
   */
  const updateSelection = useCallback((selection: CollaboratorPresence['selection']) => {
    clientRef.current.updateSelection(selection);
  }, []);

  /**
   * Update active view
   */
  const updateActiveView = useCallback((view: CollaboratorPresence['activeView']) => {
    clientRef.current.updateActiveView(view);
  }, []);

  /**
   * Get collaborator color by DID
   */
  const getCollaboratorColor = useCallback(
    (userDid: string): string => {
      const collaborator = state.collaborators.find((c) => c.user.did === userDid);
      return collaborator?.user.color || '#888888';
    },
    [state.collaborators]
  );

  /**
   * Get collaborator by DID
   */
  const getCollaboratorById = useCallback(
    (userDid: string): CollaboratorPresence | undefined => {
      return state.collaborators.find((c) => c.user.did === userDid);
    },
    [state.collaborators]
  );

  return {
    state,
    doc: clientRef.current.getDocument(),
    connect,
    disconnect,
    joinProject,
    leaveProject,
    updateCursor,
    updateSelection,
    updateActiveView,
    getCollaboratorColor,
    getCollaboratorById,
  };
}

export default useEditorCollaboration;
