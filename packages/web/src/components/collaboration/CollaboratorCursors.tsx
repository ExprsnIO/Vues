/**
 * CollaboratorCursors Component
 * Displays real-time cursor positions of collaborators
 */

'use client';

import { useMemo, useEffect, useState } from 'react';
import type { CollaboratorPresence } from '@/services/editorCollaboration';

interface CollaboratorCursorsProps {
  collaborators: CollaboratorPresence[];
  currentUserDid: string;
  containerRef?: React.RefObject<HTMLElement | null>;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
}

interface CursorState {
  x: number;
  y: number;
  visible: boolean;
  lastUpdate: number;
}

/**
 * Individual cursor component
 */
function Cursor({
  user,
  x,
  y,
  color,
  visible,
}: {
  user: { name: string; avatar?: string };
  x: number;
  y: number;
  color: string;
  visible: boolean;
}) {
  if (!visible) return null;

  return (
    <div
      className="pointer-events-none absolute z-50 transition-all duration-75"
      style={{
        left: x,
        top: y,
        transform: 'translate(-2px, -2px)',
      }}
    >
      {/* Cursor SVG */}
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-md"
      >
        <path
          d="M5.5 3.21V20.79L10.35 15.94H18.5L5.5 3.21Z"
          fill={color}
          stroke="white"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>

      {/* Username label */}
      <div
        className="absolute left-4 top-4 whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium text-white shadow-md"
        style={{ backgroundColor: color }}
      >
        {user.name}
      </div>
    </div>
  );
}

/**
 * CollaboratorCursors Component
 */
export function CollaboratorCursors({
  collaborators,
  currentUserDid,
  containerRef,
  scale = 1,
  offsetX = 0,
  offsetY = 0,
}: CollaboratorCursorsProps) {
  const [cursorStates, setCursorStates] = useState<Map<string, CursorState>>(new Map());

  // Filter out current user and users without cursors
  const otherCollaborators = useMemo(
    () =>
      collaborators.filter(
        (c) => c.user.did !== currentUserDid && c.cursor
      ),
    [collaborators, currentUserDid]
  );

  // Update cursor positions with smooth interpolation
  useEffect(() => {
    const newStates = new Map<string, CursorState>();

    for (const collaborator of otherCollaborators) {
      if (!collaborator.cursor) continue;

      const { x, y } = collaborator.cursor;
      const screenX = (x - offsetX) * scale;
      const screenY = (y - offsetY) * scale;

      const existing = cursorStates.get(collaborator.user.did);
      const isVisible = Date.now() - collaborator.lastSeen < 5000;

      newStates.set(collaborator.user.did, {
        x: screenX,
        y: screenY,
        visible: isVisible,
        lastUpdate: Date.now(),
      });
    }

    setCursorStates(newStates);
  }, [otherCollaborators, scale, offsetX, offsetY]);

  // Hide stale cursors after timeout
  useEffect(() => {
    const interval = setInterval(() => {
      setCursorStates((prev) => {
        const now = Date.now();
        const updated = new Map(prev);
        let changed = false;

        for (const [did, state] of updated) {
          if (state.visible && now - state.lastUpdate > 5000) {
            updated.set(did, { ...state, visible: false });
            changed = true;
          }
        }

        return changed ? updated : prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {otherCollaborators.map((collaborator) => {
        const state = cursorStates.get(collaborator.user.did);
        if (!state) return null;

        return (
          <Cursor
            key={collaborator.user.did}
            user={collaborator.user}
            x={state.x}
            y={state.y}
            color={collaborator.user.color}
            visible={state.visible}
          />
        );
      })}
    </>
  );
}

export default CollaboratorCursors;
