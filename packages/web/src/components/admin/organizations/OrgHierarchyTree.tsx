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

function CheckBadgeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
      />
    </svg>
  );
}

function ChevronRightSmIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 20 20"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7l3 3-3 3" />
    </svg>
  );
}

// ---- Types ----

interface OrgNode {
  id: string;
  name: string;
  displayName?: string;
  type?: string;
  parentOrganizationId?: string | null;
  memberCount?: number;
  verified?: boolean;
  avatar?: string;
  status?: string;
}

interface TreeNode extends OrgNode {
  children: TreeNode[];
}

interface OrgHierarchyTreeProps {
  organizations: OrgNode[];
  domainId: string;
  onReparent?: (orgId: string, newParentId: string | null) => void;
  onCreateSubOrg?: (parentId: string) => void;
  className?: string;
}

// ---- Helpers ----

function buildTree(orgs: OrgNode[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const o of orgs) {
    nodeMap.set(o.id, { ...o, children: [] });
  }

  for (const node of nodeMap.values()) {
    if (node.parentOrganizationId && nodeMap.has(node.parentOrganizationId)) {
      nodeMap.get(node.parentOrganizationId)!.children.push(node);
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

function buildAncestorPath(nodeId: string, nodeMap: Map<string, TreeNode>): string[] {
  // Returns ordered list of ancestor names from root down (excluding self)
  const path: string[] = [];
  const visited = new Set<string>();

  function findParent(id: string): string | null {
    const node = nodeMap.get(id);
    return node?.parentOrganizationId ?? null;
  }

  function getDisplayName(id: string): string {
    const node = nodeMap.get(id);
    return node?.displayName || node?.name || id;
  }

  let current: string | null = findParent(nodeId);
  while (current && !visited.has(current)) {
    visited.add(current);
    path.unshift(getDisplayName(current));
    current = findParent(current);
  }

  return path;
}

function typeBadgeClass(type?: string): string {
  switch ((type ?? '').toLowerCase()) {
    case 'enterprise':
      return 'bg-purple-500/15 text-purple-400';
    case 'team':
      return 'bg-blue-500/15 text-blue-400';
    case 'community':
      return 'bg-green-500/15 text-green-400';
    case 'personal':
      return 'bg-yellow-500/15 text-yellow-400';
    default:
      return 'bg-zinc-500/15 text-zinc-400';
  }
}

// ---- Avatar component ----

function OrgAvatar({ org }: { org: OrgNode }) {
  if (org.avatar) {
    return (
      <img
        src={org.avatar}
        alt={org.displayName || org.name}
        className="w-7 h-7 rounded-md object-cover flex-shrink-0"
      />
    );
  }

  const initials = (org.displayName || org.name)
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <span className="flex-shrink-0 w-7 h-7 rounded-md bg-accent/20 text-accent text-xs font-bold flex items-center justify-center select-none">
      {initials}
    </span>
  );
}

// ---- Breadcrumb trail component ----

function AncestorBreadcrumb({ ancestors }: { ancestors: string[] }) {
  if (ancestors.length === 0) return null;

  return (
    <div className="flex items-center flex-wrap gap-0.5 text-xs text-text-muted leading-tight">
      {ancestors.map((name, i) => (
        <span key={i} className="flex items-center gap-0.5">
          {i > 0 && <ChevronRightSmIcon className="w-3 h-3 flex-shrink-0" />}
          <span className="max-w-[80px] truncate" title={name}>
            {name}
          </span>
        </span>
      ))}
    </div>
  );
}

// ---- Sub-component: single tree node row ----

interface OrgTreeNodeProps {
  node: TreeNode;
  depth: number;
  isLast: boolean;
  parentLines: boolean[];
  domainId: string;
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
  onCreateSubOrg?: (parentId: string) => void;
  router: ReturnType<typeof useRouter>;
  nodeMap: Map<string, TreeNode>;
}

function OrgTreeNode({
  node,
  depth,
  isLast,
  parentLines,
  domainId,
  dragState,
  getDragProps,
  getDropTargetProps,
  onCreateSubOrg,
  router,
  nodeMap,
}: OrgTreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  const isBeingDragged = dragState.dragId === node.id;
  const isDropTarget = dragState.overId === node.id;
  const isValidDropTarget = isDropTarget && dragState.isValidDrop;
  const isInvalidDropTarget = isDropTarget && !dragState.isValidDrop;

  const ancestors = useMemo(
    () => buildAncestorPath(node.id, nodeMap),
    [node.id, nodeMap]
  );

  const dropTargetProps = getDropTargetProps(node.id);
  const dragProps = getDragProps(node.id);

  const indentWidth = 24;

  function handleNavigate() {
    router.push(`/admin/organizations/${node.id}`);
  }

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
        {/* Vertical guide lines */}
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
            onClick={(e) => e.stopPropagation()}
          >
            <GripIcon className="w-4 h-4" />
          </button>

          {/* Expand/collapse */}
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

          {/* Org avatar */}
          <OrgAvatar org={node} />

          {/* Name + breadcrumb */}
          <button
            className="flex-1 min-w-0 text-left"
            onClick={handleNavigate}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="block truncate text-sm font-medium text-text-primary leading-tight">
                {node.displayName || node.name}
              </span>
              {node.verified && (
                <CheckBadgeIcon className="flex-shrink-0 w-4 h-4 text-accent" />
              )}
            </div>
            {ancestors.length > 0 && (
              <AncestorBreadcrumb ancestors={ancestors} />
            )}
          </button>

          {/* Right-side info + actions */}
          <div className="flex-shrink-0 flex items-center gap-2">
            {/* Member count */}
            {typeof node.memberCount === 'number' && (
              <span className="text-xs text-text-muted tabular-nums">
                {node.memberCount.toLocaleString()} members
              </span>
            )}

            {/* Type badge */}
            {node.type && (
              <span
                className={`px-2 py-0.5 text-xs rounded-full font-medium capitalize ${typeBadgeClass(node.type)}`}
              >
                {node.type}
              </span>
            )}

            {/* Verification badge */}
            {node.verified && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-accent/15 text-accent font-medium">
                Verified
              </span>
            )}

            {/* Create sub-org button */}
            {onCreateSubOrg && (
              <button
                className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-2 py-1 text-xs text-accent hover:bg-accent/10 rounded-md"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateSubOrg(node.id);
                }}
                aria-label={`Create sub-organization under ${node.displayName || node.name}`}
              >
                <PlusIcon className="w-3 h-3" />
                Create Sub-Organization
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
            const childParentLines = [...parentLines, !isLast];

            return (
              <OrgTreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                isLast={childIsLast}
                parentLines={childParentLines}
                domainId={domainId}
                dragState={dragState}
                getDragProps={getDragProps}
                getDropTargetProps={getDropTargetProps}
                onCreateSubOrg={onCreateSubOrg}
                router={router}
                nodeMap={nodeMap}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- Main exported component ----

export function OrgHierarchyTree({
  organizations,
  domainId,
  onReparent,
  onCreateSubOrg,
  className = '',
}: OrgHierarchyTreeProps) {
  const router = useRouter();

  const nodeMap = useMemo(() => {
    const treeNodes = buildTree(organizations);
    const map = new Map<string, TreeNode>();

    function index(nodes: TreeNode[]) {
      for (const n of nodes) {
        map.set(n.id, n);
        index(n.children);
      }
    }

    index(treeNodes);
    return map;
  }, [organizations]);

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

  const tree = useMemo(() => buildTree(organizations), [organizations]);

  if (organizations.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-16 text-center ${className}`}>
        <p className="text-text-muted text-sm">No organizations to display.</p>
        {onCreateSubOrg && (
          <p className="text-xs text-text-muted mt-1">
            Use the &ldquo;Create Sub-Organization&rdquo; button to get started.
          </p>
        )}
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
          Drop here to make a top-level organization
        </div>
      )}

      <div className="space-y-0.5">
        {tree.map((node, idx) => (
          <OrgTreeNode
            key={node.id}
            node={node}
            depth={0}
            isLast={idx === tree.length - 1}
            parentLines={[]}
            domainId={domainId}
            dragState={dragState}
            getDragProps={getDragProps}
            getDropTargetProps={getDropTargetProps}
            onCreateSubOrg={onCreateSubOrg}
            router={router}
            nodeMap={nodeMap}
          />
        ))}
      </div>
    </div>
  );
}
