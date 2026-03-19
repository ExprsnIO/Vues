'use client';

import { ReactNode, useState, useMemo, useCallback, useEffect } from 'react';
import { useDragReparent } from '@/hooks/useDragReparent';
import { cn } from '@/lib/utils';

export interface TreeNode {
  id: string;
  name: string;
  parentId: string | null;
  children?: TreeNode[];
  [key: string]: unknown;
}

export interface HierarchyTreeProps<T extends TreeNode> {
  nodes: T[];
  renderNode: (
    node: T,
    depth: number,
    isExpanded: boolean,
    toggleExpand: () => void
  ) => ReactNode;
  onReparent?: (itemId: string, newParentId: string | null) => void;
  searchQuery?: string;
  defaultExpandDepth?: number;
  className?: string;
}

// Build a tree structure from a flat array
function buildTree<T extends TreeNode>(flatNodes: T[]): T[] {
  const nodeMap = new Map<string, T & { children: T[] }>();

  // Clone all nodes so we can attach children without mutating props
  for (const node of flatNodes) {
    nodeMap.set(node.id, { ...node, children: node.children ? [...(node.children as T[])] : [] });
  }

  const roots: (T & { children: T[] })[] = [];

  for (const node of nodeMap.values()) {
    if (node.parentId && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId)!.children.push(node as unknown as T);
    } else {
      roots.push(node);
    }
  }

  return roots as unknown as T[];
}

// Collect all descendant ids of a node in the built tree
function collectDescendants(nodeId: string, nodeMap: Map<string, TreeNode>): string[] {
  const result: string[] = [];
  const node = nodeMap.get(nodeId);
  if (!node?.children) return result;

  for (const child of node.children as TreeNode[]) {
    result.push(child.id);
    result.push(...collectDescendants(child.id, nodeMap));
  }

  return result;
}

// Find all node ids that match the search query (by name), plus their ancestors
function getMatchingIds(query: string, nodes: TreeNode[]): Set<string> {
  const matched = new Set<string>();
  const ancestors = new Set<string>();

  function traverse(node: TreeNode, path: string[]): boolean {
    const isMatch = node.name.toLowerCase().includes(query.toLowerCase());
    let childMatched = false;

    for (const child of (node.children as TreeNode[] | undefined) ?? []) {
      if (traverse(child, [...path, node.id])) {
        childMatched = true;
      }
    }

    if (isMatch || childMatched) {
      matched.add(node.id);
      for (const ancestorId of path) {
        ancestors.add(ancestorId);
      }
    }

    return isMatch || childMatched;
  }

  for (const node of nodes) {
    traverse(node, []);
  }

  return new Set([...matched, ...ancestors]);
}

// Initialise expand state: expand nodes up to defaultExpandDepth
function getDefaultExpanded(nodes: TreeNode[], depth: number, maxDepth: number): Set<string> {
  const expanded = new Set<string>();
  if (depth >= maxDepth) return expanded;

  for (const node of nodes) {
    if (node.children && (node.children as TreeNode[]).length > 0) {
      expanded.add(node.id);
      const childExpanded = getDefaultExpanded(node.children as TreeNode[], depth + 1, maxDepth);
      for (const id of childExpanded) expanded.add(id);
    }
  }

  return expanded;
}

export function HierarchyTree<T extends TreeNode>({
  nodes,
  renderNode,
  onReparent,
  searchQuery = '',
  defaultExpandDepth = 1,
  className,
}: HierarchyTreeProps<T>) {
  // Build tree once from flat nodes
  const treeNodes = useMemo(() => buildTree(nodes), [nodes]);

  // Build a flat map for descendant lookups
  const nodeMap = useMemo(() => {
    const map = new Map<string, TreeNode>();
    for (const node of treeNodes) {
      function index(n: TreeNode) {
        map.set(n.id, n);
        for (const c of (n.children as TreeNode[] | undefined) ?? []) index(c);
      }
      index(node as unknown as TreeNode);
    }
    return map;
  }, [treeNodes]);

  // Expand state
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() =>
    getDefaultExpanded(treeNodes as unknown as TreeNode[], 0, defaultExpandDepth)
  );

  // When search query changes, auto-expand matching paths
  useEffect(() => {
    if (!searchQuery) return;
    const matching = getMatchingIds(searchQuery, treeNodes as unknown as TreeNode[]);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      for (const id of matching) next.add(id);
      return next;
    });
  }, [searchQuery, treeNodes]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Drag-and-drop reparenting
  const [dragState, dragHandlers] = useDragReparent({
    validateDrop: (dragId, targetId) => {
      // Prevent dropping onto a descendant (circular)
      const descendants = collectDescendants(dragId, nodeMap);
      return !descendants.includes(targetId) && dragId !== targetId;
    },
    onReparent: (itemId, newParentId) => {
      onReparent?.(itemId, newParentId);
    },
    getDescendantIds: (id) => collectDescendants(id, nodeMap),
  });

  // Compute matching ids for search highlight
  const matchingIds = useMemo(() => {
    if (!searchQuery) return null;
    return getMatchingIds(searchQuery, treeNodes as unknown as TreeNode[]);
  }, [searchQuery, treeNodes]);

  // Recursive renderer
  function renderTreeNode(node: T, depth: number): ReactNode {
    // Filter by search
    if (matchingIds && !matchingIds.has(node.id)) return null;

    const children = (node.children as T[] | undefined) ?? [];
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const isDragging = dragState.dragId === node.id;
    const isDropTarget = dragState.overId === node.id;
    const isValidDropTarget = isDropTarget && dragState.isValidDrop;

    const dragProps = onReparent ? dragHandlers.getDragProps(node.id) : {};
    const dropProps = onReparent ? dragHandlers.getDropTargetProps(node.id) : {};

    return (
      <div key={node.id} role="treeitem" aria-expanded={hasChildren ? isExpanded : undefined}>
        {/* Node row */}
        <div
          className={cn(
            'group relative flex items-stretch rounded-lg transition-colors',
            isDragging && 'opacity-40',
            isValidDropTarget && 'ring-2 ring-accent ring-inset bg-accent/5',
            isDropTarget && !isValidDropTarget && 'ring-2 ring-red-400/40 ring-inset'
          )}
          {...dropProps}
        >
          {/* Connecting lines for depth > 0 */}
          {depth > 0 && (
            <div
              className="flex-shrink-0 flex items-stretch"
              style={{ width: depth * 20 }}
              aria-hidden="true"
            >
              {Array.from({ length: depth }).map((_, lineIdx) => (
                <div
                  key={lineIdx}
                  className="w-5 flex-shrink-0 relative"
                >
                  {/* Vertical line */}
                  <span className="absolute left-1/2 top-0 bottom-0 border-l border-border" />
                  {/* Horizontal connector for last segment */}
                  {lineIdx === depth - 1 && (
                    <span className="absolute left-1/2 top-1/2 w-1/2 border-t border-border" />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Drag handle + node content */}
          <div className="flex-1 flex items-center min-w-0" {...dragProps}>
            {onReparent && (
              <button
                className="flex-shrink-0 p-1 mr-1 text-text-muted opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity"
                tabIndex={-1}
                aria-hidden="true"
              >
                <GripIcon className="w-3.5 h-3.5" />
              </button>
            )}

            <div className="flex-1 min-w-0">
              {renderNode(
                node,
                depth,
                isExpanded,
                () => toggleExpand(node.id)
              )}
            </div>
          </div>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div role="group">
            {children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  if (treeNodes.length === 0) {
    return (
      <div className={cn('py-8 text-center text-text-muted text-sm', className)}>
        No items to display.
      </div>
    );
  }

  return (
    <div
      className={cn('space-y-0.5', className)}
      role="tree"
      {...(onReparent ? dragHandlers.getRootDropProps() : {})}
    >
      {treeNodes.map((node) => renderTreeNode(node, 0))}

      {/* Root drop zone indicator when dragging */}
      {dragState.isDragging && onReparent && (
        <div
          className={cn(
            'mt-2 py-2 px-3 border-2 border-dashed rounded-lg text-xs text-center transition-colors',
            dragState.overId === '__root__'
              ? 'border-accent text-accent bg-accent/5'
              : 'border-border text-text-muted'
          )}
          {...dragHandlers.getRootDropProps()}
        >
          Drop here to move to top level
        </div>
      )}
    </div>
  );
}

// Convenience: default expand/collapse toggle button for use inside renderNode
export interface ExpandToggleProps {
  hasChildren: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  className?: string;
}

export function ExpandToggle({ hasChildren, isExpanded, onToggle, className }: ExpandToggleProps) {
  if (!hasChildren) {
    return <span className={cn('w-5 h-5 flex-shrink-0 inline-block', className)} />;
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        'w-5 h-5 flex-shrink-0 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors',
        className
      )}
      aria-label={isExpanded ? 'Collapse' : 'Expand'}
    >
      <ChevronRightIcon
        className={cn('w-3.5 h-3.5 transition-transform', isExpanded && 'rotate-90')}
      />
    </button>
  );
}

// Icons
function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function GripIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <circle cx="9" cy="7" r="1.5" />
      <circle cx="15" cy="7" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="17" r="1.5" />
      <circle cx="15" cy="17" r="1.5" />
    </svg>
  );
}
