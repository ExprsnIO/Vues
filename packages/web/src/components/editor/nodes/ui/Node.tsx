/**
 * Node Component
 * Visual representation of a node in the graph
 */

'use client';

import { useCallback, useState, useMemo } from 'react';
import type { NodeInstance, NodeTypeDefinition, PortDefinition } from '../engine/NodeTypes';
import { getNodeType } from '../engine/NodeEngine';
import { Port } from './Port';

interface NodeProps {
  node: NodeInstance;
  selected: boolean;
  connectedPorts: Set<string>;
  onSelect: (nodeId: string, addToSelection: boolean) => void;
  onMove: (nodeId: string, delta: { x: number; y: number }) => void;
  onStartConnection: (
    nodeId: string,
    portId: string,
    direction: 'input' | 'output',
    element: HTMLElement
  ) => void;
  onEndConnection: (nodeId: string, portId: string) => void;
  onPortHover: (nodeId: string, portId: string, hovering: boolean) => void;
  onParameterChange: (nodeId: string, parameterId: string, value: unknown) => void;
  onDelete: (nodeId: string) => void;
  onCollapse: (nodeId: string) => void;
}

/**
 * Category colors
 */
const categoryColors: Record<string, string> = {
  input: '#22c55e',
  output: '#ef4444',
  math: '#3b82f6',
  color: '#ec4899',
  transform: '#8b5cf6',
  effect: '#f97316',
  logic: '#06b6d4',
  utility: '#6b7280',
};

export function Node({
  node,
  selected,
  connectedPorts,
  onSelect,
  onMove,
  onStartConnection,
  onEndConnection,
  onPortHover,
  onParameterChange,
  onDelete,
  onCollapse,
}: NodeProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const nodeType = useMemo(() => getNodeType(node.type), [node.type]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-port-id]')) {
        return; // Don't drag when clicking on ports
      }

      e.stopPropagation();
      onSelect(node.id, e.shiftKey);
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = {
          x: moveEvent.clientX - dragStart.x,
          y: moveEvent.clientY - dragStart.y,
        };
        onMove(node.id, delta);
        setDragStart({ x: moveEvent.clientX, y: moveEvent.clientY });
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [node.id, onSelect, onMove, dragStart]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onDelete(node.id);
      }
    },
    [node.id, onDelete]
  );

  const handleDoubleClick = useCallback(() => {
    onCollapse(node.id);
  }, [node.id, onCollapse]);

  if (!nodeType) {
    return (
      <div
        className="absolute rounded-lg border border-red-500 bg-red-900/50 px-4 py-2"
        style={{
          left: node.position.x,
          top: node.position.y,
        }}
      >
        <span className="text-sm text-red-300">Unknown: {node.type}</span>
      </div>
    );
  }

  const headerColor = categoryColors[nodeType.category] || categoryColors.utility;

  return (
    <div
      className={`absolute min-w-[180px] select-none rounded-lg border bg-gray-800 shadow-xl transition-shadow ${
        selected
          ? 'border-blue-500 ring-2 ring-blue-500/50'
          : 'border-gray-600 hover:border-gray-500'
      } ${isDragging ? 'cursor-grabbing shadow-2xl' : 'cursor-grab'}`}
      style={{
        left: node.position.x,
        top: node.position.y,
        zIndex: selected ? 100 : isDragging ? 99 : 1,
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between rounded-t-lg px-3 py-2"
        style={{ backgroundColor: headerColor }}
      >
        <span className="text-sm font-medium text-white">{nodeType.name}</span>
        <div className="flex items-center gap-1">
          <span className="text-[10px] uppercase text-white/60">
            {nodeType.category}
          </span>
        </div>
      </div>

      {/* Body */}
      {!node.collapsed && (
        <div className="p-2">
          {/* Inputs and Outputs */}
          <div className="flex justify-between gap-4">
            {/* Inputs */}
            <div className="flex flex-col">
              {nodeType.inputs.map((port) => (
                <Port
                  key={port.id}
                  port={port}
                  nodeId={node.id}
                  isConnected={connectedPorts.has(`${node.id}:${port.id}`)}
                  onStartConnection={onStartConnection}
                  onEndConnection={onEndConnection}
                  onHover={onPortHover}
                />
              ))}
            </div>

            {/* Outputs */}
            <div className="flex flex-col">
              {nodeType.outputs.map((port) => (
                <Port
                  key={port.id}
                  port={port}
                  nodeId={node.id}
                  isConnected={connectedPorts.has(`${node.id}:${port.id}`)}
                  onStartConnection={onStartConnection}
                  onEndConnection={onEndConnection}
                  onHover={onPortHover}
                />
              ))}
            </div>
          </div>

          {/* Parameters */}
          {nodeType.parameters.length > 0 && (
            <div className="mt-2 border-t border-gray-700 pt-2">
              {nodeType.parameters.map((param) => (
                <ParameterControl
                  key={param.id}
                  param={param}
                  value={node.parameters[param.id] ?? param.defaultValue}
                  onChange={(value) => onParameterChange(node.id, param.id, value)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Collapsed indicator */}
      {node.collapsed && (
        <div className="px-3 py-1 text-center text-xs text-gray-400">
          {nodeType.inputs.length} in / {nodeType.outputs.length} out
        </div>
      )}
    </div>
  );
}

/**
 * Parameter Control Component
 */
function ParameterControl({
  param,
  value,
  onChange,
}: {
  param: NodeTypeDefinition['parameters'][0];
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const handleNumberChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(parseFloat(e.target.value) || 0);
    },
    [onChange]
  );

  const handleBooleanChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.checked);
    },
    [onChange]
  );

  const handleStringChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  const handleSelectChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  const handleColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  return (
    <div className="mb-1 flex items-center justify-between gap-2">
      <label className="text-xs text-gray-400">{param.name}</label>

      {param.type === 'number' && (
        <input
          type="number"
          value={value as number}
          min={param.min}
          max={param.max}
          step={param.step || 0.1}
          onChange={handleNumberChange}
          className="w-16 rounded bg-gray-700 px-1 py-0.5 text-right text-xs text-white"
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {param.type === 'boolean' && (
        <input
          type="checkbox"
          checked={value as boolean}
          onChange={handleBooleanChange}
          className="h-3 w-3 rounded"
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {param.type === 'string' && (
        <input
          type="text"
          value={value as string}
          onChange={handleStringChange}
          className="w-20 rounded bg-gray-700 px-1 py-0.5 text-xs text-white"
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {param.type === 'select' && param.options && (
        <select
          value={value as string}
          onChange={handleSelectChange}
          className="rounded bg-gray-700 px-1 py-0.5 text-xs text-white"
          onClick={(e) => e.stopPropagation()}
        >
          {param.options.map((opt) => (
            <option key={String(opt.value)} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}

      {param.type === 'color' && (
        <input
          type="color"
          value={value as string}
          onChange={handleColorChange}
          className="h-5 w-8 cursor-pointer rounded border-0 bg-transparent"
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {param.type === 'vector2' && (
        <div className="flex gap-1">
          <input
            type="number"
            value={(value as { x: number; y: number })?.x ?? 0}
            step={0.1}
            onChange={(e) =>
              onChange({
                ...(value as { x: number; y: number }),
                x: parseFloat(e.target.value) || 0,
              })
            }
            className="w-12 rounded bg-gray-700 px-1 py-0.5 text-right text-xs text-white"
            onClick={(e) => e.stopPropagation()}
          />
          <input
            type="number"
            value={(value as { x: number; y: number })?.y ?? 0}
            step={0.1}
            onChange={(e) =>
              onChange({
                ...(value as { x: number; y: number }),
                y: parseFloat(e.target.value) || 0,
              })
            }
            className="w-12 rounded bg-gray-700 px-1 py-0.5 text-right text-xs text-white"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

export default Node;
