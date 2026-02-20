/**
 * NodeLibrary Component
 * Palette of available nodes to add to the graph
 */

'use client';

import { useState, useMemo, useCallback } from 'react';
import type { NodeTypeDefinition } from '../engine/NodeTypes';
import { allNodes, categoryNames, categoryOrder, getNodesByCategory } from '../nodes';

interface NodeLibraryProps {
  onAddNode: (nodeType: string, position?: { x: number; y: number }) => void;
  onClose?: () => void;
  position?: { x: number; y: number };
  isContextMenu?: boolean;
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

export function NodeLibrary({
  onAddNode,
  onClose,
  position,
  isContextMenu = false,
}: NodeLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(categoryOrder)
  );

  const nodesByCategory = useMemo(() => getNodesByCategory(), []);

  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) {
      return nodesByCategory;
    }

    const query = searchQuery.toLowerCase();
    const filtered = new Map<string, NodeTypeDefinition[]>();

    for (const [category, nodes] of nodesByCategory) {
      const matchingNodes = nodes.filter(
        (node) =>
          node.name.toLowerCase().includes(query) ||
          node.description.toLowerCase().includes(query) ||
          node.type.toLowerCase().includes(query)
      );

      if (matchingNodes.length > 0) {
        filtered.set(category, matchingNodes);
      }
    }

    return filtered;
  }, [searchQuery, nodesByCategory]);

  const toggleCategory = useCallback((category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const handleNodeClick = useCallback(
    (nodeType: string) => {
      onAddNode(nodeType, position);
      onClose?.();
    },
    [onAddNode, onClose, position]
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, nodeType: string) => {
      e.dataTransfer.setData('application/node-type', nodeType);
      e.dataTransfer.effectAllowed = 'copy';
    },
    []
  );

  return (
    <div
      className={`${
        isContextMenu
          ? 'absolute z-50 rounded-lg border border-gray-600 shadow-2xl'
          : 'h-full border-r border-gray-700'
      } flex w-64 flex-col bg-gray-800`}
      style={
        isContextMenu && position
          ? { left: position.x, top: position.y }
          : undefined
      }
    >
      {/* Header */}
      <div className="border-b border-gray-700 p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-white">
            {isContextMenu ? 'Add Node' : 'Node Library'}
          </h3>
          {isContextMenu && onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative mt-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search nodes..."
            className="w-full rounded-md bg-gray-700 px-3 py-1.5 pl-8 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus={isContextMenu}
          />
          <svg
            className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      {/* Node List */}
      <div className="flex-1 overflow-y-auto p-2">
        {categoryOrder
          .filter((category) => filteredNodes.has(category))
          .map((category) => {
            const nodes = filteredNodes.get(category) || [];
            const isExpanded = expandedCategories.has(category) || searchQuery.trim() !== '';

            return (
              <div key={category} className="mb-2">
                {/* Category Header */}
                <button
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-gray-700"
                  onClick={() => toggleCategory(category)}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: categoryColors[category] }}
                    />
                    <span className="text-sm font-medium text-gray-200">
                      {categoryNames[category]}
                    </span>
                    <span className="text-xs text-gray-500">
                      ({nodes.length})
                    </span>
                  </div>
                  <svg
                    className={`h-4 w-4 text-gray-400 transition-transform ${
                      isExpanded ? 'rotate-90' : ''
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>

                {/* Node Items */}
                {isExpanded && (
                  <div className="ml-4 mt-1 space-y-0.5">
                    {nodes.map((node) => (
                      <div
                        key={node.type}
                        className="group flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-gray-700"
                        onClick={() => handleNodeClick(node.type)}
                        draggable
                        onDragStart={(e) => handleDragStart(e, node.type)}
                        title={node.description}
                      >
                        <span className="text-sm text-gray-300 group-hover:text-white">
                          {node.name}
                        </span>
                        <span className="flex-1" />
                        <span className="invisible text-xs text-gray-500 group-hover:visible">
                          +
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

        {filteredNodes.size === 0 && (
          <div className="py-8 text-center text-sm text-gray-400">
            No nodes found for "{searchQuery}"
          </div>
        )}
      </div>

      {/* Footer */}
      {!isContextMenu && (
        <div className="border-t border-gray-700 p-3">
          <p className="text-xs text-gray-400">
            Drag nodes to canvas or click to add at center
          </p>
        </div>
      )}
    </div>
  );
}

export default NodeLibrary;
