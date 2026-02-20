/**
 * PresenceIndicators Component
 * Shows who is currently editing the project
 */

'use client';

import { useMemo } from 'react';
import type { CollaboratorPresence } from '@/services/editorCollaboration';

interface PresenceIndicatorsProps {
  collaborators: CollaboratorPresence[];
  currentUserDid: string;
  maxAvatars?: number;
  size?: 'sm' | 'md' | 'lg';
  showNames?: boolean;
  showActiveView?: boolean;
}

/**
 * Avatar component
 */
function Avatar({
  user,
  size,
  isActive,
  showTooltip,
  activeView,
}: {
  user: CollaboratorPresence['user'];
  size: 'sm' | 'md' | 'lg';
  isActive: boolean;
  showTooltip?: boolean;
  activeView?: CollaboratorPresence['activeView'];
}) {
  const sizeClasses = {
    sm: 'h-6 w-6 text-xs',
    md: 'h-8 w-8 text-sm',
    lg: 'h-10 w-10 text-base',
  };

  const viewLabels: Record<CollaboratorPresence['activeView'], string> = {
    timeline: 'Timeline',
    canvas: 'Canvas',
    inspector: 'Inspector',
    library: 'Library',
  };

  return (
    <div className="group relative">
      <div
        className={`${sizeClasses[size]} relative flex items-center justify-center overflow-hidden rounded-full border-2 font-medium transition-transform hover:scale-110`}
        style={{
          borderColor: user.color,
          backgroundColor: user.avatar ? 'transparent' : user.color,
        }}
      >
        {user.avatar ? (
          <img
            src={user.avatar}
            alt={user.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-white">
            {user.name.charAt(0).toUpperCase()}
          </span>
        )}

        {/* Active indicator */}
        {isActive && (
          <span
            className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white"
            style={{ backgroundColor: '#22c55e' }}
          />
        )}
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div className="invisible absolute -bottom-12 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100">
          <div className="font-medium">{user.name}</div>
          {activeView && (
            <div className="text-gray-400">{viewLabels[activeView]}</div>
          )}
          <div
            className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-gray-900"
          />
        </div>
      )}
    </div>
  );
}

/**
 * PresenceIndicators Component
 */
export function PresenceIndicators({
  collaborators,
  currentUserDid,
  maxAvatars = 5,
  size = 'md',
  showNames = false,
  showActiveView = true,
}: PresenceIndicatorsProps) {
  // Sort collaborators: current user first, then by lastSeen
  const sortedCollaborators = useMemo(
    () =>
      [...collaborators].sort((a, b) => {
        if (a.user.did === currentUserDid) return -1;
        if (b.user.did === currentUserDid) return 1;
        return b.lastSeen - a.lastSeen;
      }),
    [collaborators, currentUserDid]
  );

  const visibleCollaborators = sortedCollaborators.slice(0, maxAvatars);
  const hiddenCount = Math.max(0, sortedCollaborators.length - maxAvatars);

  const sizeClasses = {
    sm: '-space-x-2',
    md: '-space-x-3',
    lg: '-space-x-4',
  };

  const hiddenCountSizes = {
    sm: 'h-6 w-6 text-xs',
    md: 'h-8 w-8 text-sm',
    lg: 'h-10 w-10 text-base',
  };

  return (
    <div className="flex items-center gap-3">
      {/* Avatar stack */}
      <div className={`flex ${sizeClasses[size]}`}>
        {visibleCollaborators.map((collaborator) => (
          <Avatar
            key={collaborator.user.did}
            user={collaborator.user}
            size={size}
            isActive={Date.now() - collaborator.lastSeen < 30000}
            showTooltip
            activeView={showActiveView ? collaborator.activeView : undefined}
          />
        ))}

        {/* Hidden count */}
        {hiddenCount > 0 && (
          <div
            className={`${hiddenCountSizes[size]} flex items-center justify-center rounded-full border-2 border-gray-300 bg-gray-100 font-medium text-gray-600`}
          >
            +{hiddenCount}
          </div>
        )}
      </div>

      {/* Names list (optional) */}
      {showNames && sortedCollaborators.length > 0 && (
        <div className="text-sm text-gray-600">
          {sortedCollaborators.length === 1 ? (
            <span>{sortedCollaborators[0].user.name}</span>
          ) : sortedCollaborators.length === 2 ? (
            <span>
              {sortedCollaborators[0].user.name} and{' '}
              {sortedCollaborators[1].user.name}
            </span>
          ) : (
            <span>
              {sortedCollaborators[0].user.name} and{' '}
              {sortedCollaborators.length - 1} others
            </span>
          )}
        </div>
      )}

      {/* Live indicator */}
      {sortedCollaborators.some((c) => Date.now() - c.lastSeen < 5000) && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
          </span>
          <span>Live</span>
        </div>
      )}
    </div>
  );
}

export default PresenceIndicators;
