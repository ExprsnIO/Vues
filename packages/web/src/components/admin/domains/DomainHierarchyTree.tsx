'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useDragReparent } from '@/hooks/useDragReparent';

// ---- Icon components ----

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function GripIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}

// ---- Types ----

interface DomainNode {
  id: string;
  name: string;
  domain: string;
  type: string;
  status: string;
  parentDomainId?: string | null;
  userCount?: number;
  hierarchyLevel?: number;
}

interface TreeNode extends DomainNode {
  children: TreeNode[];
}

interface DomainHierarchyTreeProps {
  domains: DomainNode[];
  onReparent?: (domainId: string, newParentId: string | null) => void;
  onCreateSubdomain?: (parentId: string) => void;
  className?: string;
}

// ---- Helpers ----

function buildTree(domains: DomainNode[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const d of domains) {
    nodeMap.set(d.id, { ...d, children: [] });
  }

  for (const node of nodeMap.values()) {
    if (node.parentDomainId && nodeMap.has(node.parentDomainId)) {
      nodeMap.get(node.parentDomainId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function collectDescendantIds(node: TreeNode): string[] {
  const ids: string[] = [];
  function walk(n: TreeNode) {
    for (const child of n.children) {
      ids.push(child.id);
      walk(child);
    }
  }
  walk(node);
  return ids;
}

function statusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'active':
      return 'bg-emerald-500';
    case 'suspended':
      return 'bg-yellow-500';
    case 'inactive':
    case 'disabled':
      return 'bg-zinc-500';
    default:
      return 'bg-blue-500';
  }
}

function typeBadgeClass(type: string): string {
  switch (type.toLowerCase()) {
    case 'platform':
      return 'bg-purple-500/15 text-purple-400';
    case 'organization':
      return 'bg-blue-500/15 text-blue-400';
    case 'community':
      return 'bg-green-500/15 text-green-400';
    default:
      return 'bg-zinc-500/15 text-zinc-400';
  }
}

// ---- Sub-component: single tree node row ----

interface DomainTreeNodeProps {
  node: TreeNode;
  depth: number;
  isLast: boolean;
  parentLines: boolean[];
  dragState: {
    isDragging: boolean;
    dragId: string | null;
    overId: string | null;
    isValidDrop: boolean;
  };
  getDragProps: (id: string) => {
    draggable: true;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: (e: React.DragEvent) => void;
  };
  getDropTargetProps: (id: string) => {
    onDragOver: (e: React.DragEvent) => void;
    onDragEnter: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  onCreateSubdomain?: (parentId: string) => void;
  router: ReturnType<typeof useRouter>;
  allNodes: Map<string, TreeNode>;
}

function DomainTreeNode({
  node,
  depth,
  isLast,
  parentLines,
  dragState,
  getDragProps,
  getDropTargetProps,
  onCreateSubdomain,
  router,
  allNodes,
}: DomainTreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  const isBeingDragged = dragState.dragId === node.id;
  const isDropTarget = dragState.overId === node.id;
  const isValidDropTarget = isDropTarget && dragState.isValidDrop;
  const isInvalidDropTarget = isDropTarget && !dragState.isValidDrop;

  const dropTargetProps = getDropTargetProps(node.id);
  const dragProps = getDragProps(node.id);

  function handleNavigate() {
    router.push(`/admin/d/${node.id}/settings`);
  }

  // Build the indentation guide lines
  // parentLines[i] = true means there is a continuing vertical line at that depth level
  const indentWidth = 24; // px per level

  return (
    <div>
      {/* Row */}
      <div
        className={[
          'group relative flex items-center gap-1 rounded-lg transition-colors select-none',
          'hover:bg-surface-hover',
          isBeingDragged ? 'opacity-40' : '',
          isValidDropTarget ? 'ring-2 ring-accent ring-inset bg-accent/5' : '',
          isInvalidDropTarget ? 'ring-2 ring-red-500/50 ring-inset' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        {...dropTargetProps}
      >
        {/* Vertical guide lines for ancestors */}
        {depth > 0 && (
          <div
            className="absolute left-0 top-0 bottom-0 pointer-events-none"
            style={{ width: depth * indentWidth }}
          >
            {parentLines.map((hasLine, i) =>
              hasLine ? (
                <span
                  key={i}
                  className="absolute top-0 bottom-0 border-l border-border"
                  style={{ left: i * indentWidth + 11 }}
                />
              ) : null
            )}
          </div>
        )}

        {/* Horizontal connector */}
        {depth > 0 && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: (depth - 1) * indentWidth + 12,
              top: '50%',
              width: 12,
              height: 1,
              background: 'var(--border)',
            }}
          />
        )}

        {/* Content row — indented */}
        <div
          className="flex items-center gap-2 flex-1 min-w-0 py-2 pr-2"
          style={{ paddingLeft: depth * indentWidth + 4 }}
        >
          {/* Drag handle */}
          <button
            className="flex-shrink-0 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
            aria-label="Drag to reparent"
            {...dragProps}
            // Override onClick so clicking the handle doesn't navigate
            onClick={(e) => e.stopPropagation()}
          >
            <GripIcon className="w-4 h-4" />
          </button>

          {/* Expand/collapse chevron */}
          <button
            className={[
              'flex-shrink-0 text-text-muted hover:text-text-primary transition-colors',
              !hasChildren ? 'invisible' : '',
            ].join(' ')}
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <ChevronRightIcon
              className={`w-4 h-4 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
            />
          </button>

          {/* Status dot */}
          <span
            className={`flex-shrink-0 w-2 h-2 rounded-full ${statusColor(node.status)}`}
            title={node.status}
          />

          {/* Name + domain */}
          <button
            className="flex-1 min-w-0 text-left"
            onClick={handleNavigate}
          >
            <span className="block truncate text-sm font-medium text-text-primary leading-tight">
              {node.name}
            </span>
            <span className="block truncate text-xs text-text-muted leading-tight">
              {node.domain}
            </span>
          </button>

          {/* Right-side badges + actions */}
          <div className="flex-shrink-0 flex items-center gap-2">
            {/* User count */}
            {typeof node.userCount === 'number' && (
              <span className="text-xs text-text-muted tabular-nums">
                {node.userCount.toLocaleString()} users
              </span>
            )}

            {/* Type badge */}
            <span
              className={`px-2 py-0.5 text-xs rounded-full font-medium capitalize ${typeBadgeClass(node.type)}`}
            >
              {node.type}
            </span>

            {/* Add subdomain button */}
            {onCreateSubdomain && (
              <button
                className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-2 py-1 text-xs text-accent hover:bg-accent/10 rounded-md"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateSubdomain(node.id);
                }}
                aria-label={`Add subdomain under ${node.name}`}
              >
                <PlusIcon className="w-3 h-3" />
                Add subdomain
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div>
          {node.children.map((child, idx) => {
            const childIsLast = idx === node.children.length - 1;
            // Propagate parent lines: for the current depth, add a line only if this node is NOT last
            const childParentLines = [...parentLines, !isLast];

            return (
              <DomainTreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                isLast={childIsLast}
                parentLines={childParentLines}
                dragState={dragState}
                getDragProps={getDragProps}
                getDropTargetProps={getDropTargetProps}
                onCreateSubdomain={onCreateSubdomain}
                router={router}
                allNodes={allNodes}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- Main exported component ----

export function DomainHierarchyTree({
  domains,
  onReparent,
  onCreateSubdomain,
  className = '',
}: DomainHierarchyTreeProps) {
  const router = useRouter();

  // Build a flat lookup map for descendant queries
  const nodeMap = useMemo(() => {
    const treeNodes = buildTree(domains);
    const map = new Map<string, TreeNode>();

    function index(nodes: TreeNode[]) {
      for (const n of nodes) {
        map.set(n.id, n);
        index(n.children);
      }
    }

    index(treeNodes);
    return map;
  }, [domains]);

  const getDescendantIds = useCallback(
    (id: string): string[] => {
      const node = nodeMap.get(id);
      if (!node) return [];
      return collectDescendantIds(node);
    },
    [nodeMap]
  );

  const validateDrop = useCallback(
    (dragId: string, targetId: string): boolean => {
      if (dragId === targetId) return false;
      const descendants = getDescendantIds(dragId);
      return !descendants.includes(targetId);
    },
    [getDescendantIds]
  );

  const handleReparent = useCallback(
    (itemId: string, newParentId: string | null) => {
      onReparent?.(itemId, newParentId);
    },
    [onReparent]
  );

  const [dragState, { getDragProps, getDropTargetProps, getRootDropProps }] = useDragReparent({
    validateDrop,
    onReparent: handleReparent,
    getDescendantIds,
  });

  const tree = useMemo(() => buildTree(domains), [domains]);

  if (domains.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-16 text-center ${className}`}>
        <p className="text-text-muted text-sm">No domains to display.</p>
      </div>
    );
  }

  return (
    <div
      className={`relative ${className}`}
      {...getRootDropProps()}
    >
      {/* Root drop zone indicator */}
      {dragState.isDragging && dragState.overId === '__root__' && (
        <div className="mb-2 px-3 py-2 rounded-lg border-2 border-dashed border-accent text-xs text-accent text-center">
          Drop here to make a root-level domain
        </div>
      )}

      <div className="space-y-0.5">
        {tree.map((node, idx) => (
          <DomainTreeNode
            key={node.id}
            node={node}
            depth={0}
            isLast={idx === tree.length - 1}
            parentLines={[]}
            dragState={dragState}
            getDragProps={getDragProps}
            getDropTargetProps={getDropTargetProps}
            onCreateSubdomain={onCreateSubdomain}
            router={router}
            allNodes={nodeMap}
          />
        ))}
      </div>
    </div>
  );
}
