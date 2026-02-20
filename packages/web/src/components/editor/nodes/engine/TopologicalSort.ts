/**
 * Topological Sort
 * Determines execution order for node graphs
 */

import type { NodeInstance, NodeConnection } from './NodeTypes';

/**
 * Build adjacency list from connections
 */
function buildAdjacencyList(
  nodes: NodeInstance[],
  connections: NodeConnection[]
): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();

  // Initialize all nodes
  for (const node of nodes) {
    adjacency.set(node.id, new Set());
  }

  // Add edges (source -> target)
  for (const conn of connections) {
    const deps = adjacency.get(conn.targetNodeId);
    if (deps) {
      deps.add(conn.sourceNodeId);
    }
  }

  return adjacency;
}

/**
 * Compute in-degree for each node
 */
function computeInDegree(
  nodes: NodeInstance[],
  adjacency: Map<string, Set<string>>
): Map<string, number> {
  const inDegree = new Map<string, number>();

  // Initialize all nodes with 0
  for (const node of nodes) {
    inDegree.set(node.id, 0);
  }

  // Count incoming edges
  for (const [nodeId, deps] of adjacency) {
    inDegree.set(nodeId, deps.size);
  }

  return inDegree;
}

/**
 * Kahn's algorithm for topological sorting
 * Returns nodes in execution order (sources first)
 */
export function topologicalSort(
  nodes: NodeInstance[],
  connections: NodeConnection[]
): string[] {
  if (nodes.length === 0) {
    return [];
  }

  // Build dependency graph
  const adjacency = buildAdjacencyList(nodes, connections);
  const inDegree = computeInDegree(nodes, adjacency);

  // Find all nodes with no dependencies
  const queue: string[] = [];
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }

  // Build reverse adjacency for traversal
  const reverseAdj = new Map<string, Set<string>>();
  for (const node of nodes) {
    reverseAdj.set(node.id, new Set());
  }
  for (const conn of connections) {
    const targets = reverseAdj.get(conn.sourceNodeId);
    if (targets) {
      targets.add(conn.targetNodeId);
    }
  }

  // Process queue
  const result: string[] = [];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const nodeId = queue.shift()!;

    if (visited.has(nodeId)) {
      continue;
    }

    visited.add(nodeId);
    result.push(nodeId);

    // Reduce in-degree of dependent nodes
    const dependents = reverseAdj.get(nodeId) || new Set();
    for (const dependent of dependents) {
      const newDegree = (inDegree.get(dependent) || 0) - 1;
      inDegree.set(dependent, newDegree);

      if (newDegree === 0 && !visited.has(dependent)) {
        queue.push(dependent);
      }
    }
  }

  // Check if all nodes were visited (no cycles)
  if (result.length !== nodes.length) {
    // There's a cycle - some nodes weren't processed
    const unvisited = nodes.filter((n) => !visited.has(n.id)).map((n) => n.id);
    console.warn('Cycle detected in node graph. Unprocessed nodes:', unvisited);
    // Add remaining nodes anyway for partial execution
    result.push(...unvisited);
  }

  return result;
}

/**
 * Get all upstream nodes (dependencies) of a given node
 */
export function getUpstreamNodes(
  nodeId: string,
  nodes: NodeInstance[],
  connections: NodeConnection[]
): Set<string> {
  const upstream = new Set<string>();
  const visited = new Set<string>();
  const queue = [nodeId];

  // Build dependency map
  const deps = new Map<string, Set<string>>();
  for (const node of nodes) {
    deps.set(node.id, new Set());
  }
  for (const conn of connections) {
    const nodeDeps = deps.get(conn.targetNodeId);
    if (nodeDeps) {
      nodeDeps.add(conn.sourceNodeId);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (visited.has(current)) {
      continue;
    }

    visited.add(current);

    const currentDeps = deps.get(current) || new Set();
    for (const dep of currentDeps) {
      upstream.add(dep);
      if (!visited.has(dep)) {
        queue.push(dep);
      }
    }
  }

  return upstream;
}

/**
 * Get all downstream nodes (dependents) of a given node
 */
export function getDownstreamNodes(
  nodeId: string,
  nodes: NodeInstance[],
  connections: NodeConnection[]
): Set<string> {
  const downstream = new Set<string>();
  const visited = new Set<string>();
  const queue = [nodeId];

  // Build dependents map
  const dependents = new Map<string, Set<string>>();
  for (const node of nodes) {
    dependents.set(node.id, new Set());
  }
  for (const conn of connections) {
    const nodeDeps = dependents.get(conn.sourceNodeId);
    if (nodeDeps) {
      nodeDeps.add(conn.targetNodeId);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (visited.has(current)) {
      continue;
    }

    visited.add(current);

    const currentDeps = dependents.get(current) || new Set();
    for (const dep of currentDeps) {
      downstream.add(dep);
      if (!visited.has(dep)) {
        queue.push(dep);
      }
    }
  }

  return downstream;
}

/**
 * Get nodes that need to be re-executed when a node changes
 */
export function getAffectedNodes(
  nodeId: string,
  nodes: NodeInstance[],
  connections: NodeConnection[]
): string[] {
  const downstream = getDownstreamNodes(nodeId, nodes, connections);
  const affected = [nodeId, ...downstream];

  // Return in topological order
  const order = topologicalSort(nodes, connections);
  return order.filter((id) => affected.includes(id));
}
