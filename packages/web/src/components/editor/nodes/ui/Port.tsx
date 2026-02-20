/**
 * Port Component
 * Input/output ports on nodes
 */

'use client';

import { useCallback, useRef } from 'react';
import type { PortDefinition } from '../engine/NodeTypes';
import { dataTypeColors } from '../engine/NodeTypes';

interface PortProps {
  port: PortDefinition;
  nodeId: string;
  isConnected: boolean;
  onStartConnection?: (nodeId: string, portId: string, direction: 'input' | 'output', element: HTMLElement) => void;
  onEndConnection?: (nodeId: string, portId: string) => void;
  onHover?: (nodeId: string, portId: string, hovering: boolean) => void;
}

export function Port({
  port,
  nodeId,
  isConnected,
  onStartConnection,
  onEndConnection,
  onHover,
}: PortProps) {
  const portRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onStartConnection && portRef.current) {
        onStartConnection(nodeId, port.id, port.direction, portRef.current);
      }
    },
    [nodeId, port.id, port.direction, onStartConnection]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onEndConnection?.(nodeId, port.id);
    },
    [nodeId, port.id, onEndConnection]
  );

  const handleMouseEnter = useCallback(() => {
    onHover?.(nodeId, port.id, true);
  }, [nodeId, port.id, onHover]);

  const handleMouseLeave = useCallback(() => {
    onHover?.(nodeId, port.id, false);
  }, [nodeId, port.id, onHover]);

  const color = dataTypeColors[port.dataType];
  const isInput = port.direction === 'input';

  return (
    <div
      className={`flex items-center gap-2 py-1 ${isInput ? '' : 'flex-row-reverse'}`}
    >
      {/* Port connector */}
      <div
        ref={portRef}
        className="relative h-3 w-3 cursor-pointer rounded-full border-2 transition-transform hover:scale-125"
        style={{
          borderColor: color,
          backgroundColor: isConnected ? color : 'transparent',
        }}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        data-node-id={nodeId}
        data-port-id={port.id}
        data-port-direction={port.direction}
        data-port-type={port.dataType}
      >
        {/* Connection indicator for multiple connections */}
        {port.multiple && isConnected && (
          <span
            className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full text-[8px] font-bold leading-none"
            style={{ backgroundColor: color }}
          />
        )}
      </div>

      {/* Port label */}
      <span className="text-xs text-gray-300">{port.name}</span>

      {/* Required indicator */}
      {port.required && !isConnected && (
        <span className="text-[10px] text-red-400">*</span>
      )}
    </div>
  );
}

export default Port;
