/**
 * Connection Component
 * Visual connection lines between node ports
 */

'use client';

import { useMemo } from 'react';
import type { NodeConnection, PortDataType } from '../engine/NodeTypes';
import { dataTypeColors } from '../engine/NodeTypes';

interface ConnectionProps {
  connection: NodeConnection;
  sourcePosition: { x: number; y: number };
  targetPosition: { x: number; y: number };
  dataType: PortDataType;
  selected?: boolean;
  hovering?: boolean;
  onClick?: (connectionId: string) => void;
}

/**
 * Calculate bezier curve control points
 */
function calculateBezierPath(
  source: { x: number; y: number },
  target: { x: number; y: number }
): string {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Control point offset based on distance
  const offset = Math.min(distance * 0.5, 100);

  // Control points extend horizontally from ports
  const cp1x = source.x + offset;
  const cp1y = source.y;
  const cp2x = target.x - offset;
  const cp2y = target.y;

  return `M ${source.x} ${source.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${target.x} ${target.y}`;
}

export function Connection({
  connection,
  sourcePosition,
  targetPosition,
  dataType,
  selected = false,
  hovering = false,
  onClick,
}: ConnectionProps) {
  const path = useMemo(
    () => calculateBezierPath(sourcePosition, targetPosition),
    [sourcePosition, targetPosition]
  );

  const color = dataTypeColors[dataType] || dataTypeColors.any;
  const strokeWidth = selected || hovering ? 3 : 2;
  const opacity = hovering ? 1 : 0.8;

  return (
    <g
      className="cursor-pointer"
      onClick={() => onClick?.(connection.id)}
    >
      {/* Invisible wider path for easier clicking */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        strokeLinecap="round"
      />

      {/* Glow effect */}
      {(selected || hovering) && (
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth + 4}
          strokeLinecap="round"
          opacity={0.3}
          filter="blur(4px)"
        />
      )}

      {/* Main line */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        opacity={opacity}
        className="transition-all duration-150"
      />

      {/* Flow animation dots */}
      <circle r={3} fill={color}>
        <animateMotion
          dur="1.5s"
          repeatCount="indefinite"
          path={path}
        />
      </circle>
    </g>
  );
}

/**
 * Pending connection while dragging
 */
interface PendingConnectionProps {
  sourcePosition: { x: number; y: number };
  targetPosition: { x: number; y: number };
  dataType: PortDataType;
  valid: boolean;
}

export function PendingConnection({
  sourcePosition,
  targetPosition,
  dataType,
  valid,
}: PendingConnectionProps) {
  const path = useMemo(
    () => calculateBezierPath(sourcePosition, targetPosition),
    [sourcePosition, targetPosition]
  );

  const color = valid ? dataTypeColors[dataType] || dataTypeColors.any : '#ef4444';

  return (
    <path
      d={path}
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeDasharray={valid ? 'none' : '5 5'}
      opacity={0.8}
      className="pointer-events-none"
    />
  );
}

/**
 * Connection SVG layer
 */
interface ConnectionLayerProps {
  connections: Array<{
    connection: NodeConnection;
    sourcePosition: { x: number; y: number };
    targetPosition: { x: number; y: number };
    dataType: PortDataType;
  }>;
  selectedConnections: Set<string>;
  hoveringConnection: string | null;
  pendingConnection: {
    sourcePosition: { x: number; y: number };
    targetPosition: { x: number; y: number };
    dataType: PortDataType;
    valid: boolean;
  } | null;
  onConnectionClick: (connectionId: string) => void;
}

export function ConnectionLayer({
  connections,
  selectedConnections,
  hoveringConnection,
  pendingConnection,
  onConnectionClick,
}: ConnectionLayerProps) {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      style={{ zIndex: 0 }}
    >
      <defs>
        {/* Gradient definitions for connections */}
        {Object.entries(dataTypeColors).map(([type, color]) => (
          <linearGradient key={type} id={`gradient-${type}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color} stopOpacity={0.6} />
            <stop offset="50%" stopColor={color} stopOpacity={1} />
            <stop offset="100%" stopColor={color} stopOpacity={0.6} />
          </linearGradient>
        ))}
      </defs>

      <g className="pointer-events-auto">
        {connections.map(({ connection, sourcePosition, targetPosition, dataType }) => (
          <Connection
            key={connection.id}
            connection={connection}
            sourcePosition={sourcePosition}
            targetPosition={targetPosition}
            dataType={dataType}
            selected={selectedConnections.has(connection.id)}
            hovering={hoveringConnection === connection.id}
            onClick={onConnectionClick}
          />
        ))}
      </g>

      {pendingConnection && (
        <PendingConnection
          sourcePosition={pendingConnection.sourcePosition}
          targetPosition={pendingConnection.targetPosition}
          dataType={pendingConnection.dataType}
          valid={pendingConnection.valid}
        />
      )}
    </svg>
  );
}

export default Connection;
