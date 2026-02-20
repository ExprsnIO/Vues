/**
 * Cycle Detection
 * Prevents feedback loops in node graphs
 */

import type { NodeInstance, NodeConnection } from './NodeTypes';

/**
 * Detect if adding a connection would create a cycle
 */
export function wouldCreateCycle(
  nodes: NodeInstance[],
  connections: NodeConnection[],
  newConnection: { sourceNodeId: string; targetNodeId: string }
): boolean {
  // If connecting to self, it's a cycle
  if (newConnection.sourceNodeId === newConnection.targetNodeId) {
    return true;
  }

  // Build adjacency list including the new connection
  const adjacency = new Map<string, Set<string>>();

  for (const node of nodes) {
    adjacency.set(node.id, new Set());
  }

  for (const conn of connections) {
    const deps = adjacency.get(conn.sourceNodeId);
    if (deps) {
      deps.add(conn.targetNodeId);
    }
  }

  // Add the new connection
  const sourceDeps = adjacency.get(newConnection.sourceNodeId);
  if (sourceDeps) {
    sourceDeps.add(newConnection.targetNodeId);
  }

  // Use DFS to detect cycle
  return hasCycleDFS(adjacency, nodes.map((n) => n.id));
}

/**
 * Check if the graph has any cycles using DFS
 */
function hasCycleDFS(
  adjacency: Map<string, Set<string>>,
  nodeIds: string[]
): boolean {
  const WHITE = 0; // Not visited
  const GRAY = 1;  // Being processed
  const BLACK = 2; // Fully processed

  const color = new Map<string, number>();

  for (const nodeId of nodeIds) {
    color.set(nodeId, WHITE);
  }

  function dfs(nodeId: string): boolean {
    color.set(nodeId, GRAY);

    const neighbors = adjacency.get(nodeId) || new Set();
    for (const neighbor of neighbors) {
      const neighborColor = color.get(neighbor);

      if (neighborColor === GRAY) {
        // Found a back edge - cycle detected
        return true;
      }

      if (neighborColor === WHITE && dfs(neighbor)) {
        return true;
      }
    }

    color.set(nodeId, BLACK);
    return false;
  }

  for (const nodeId of nodeIds) {
    if (color.get(nodeId) === WHITE && dfs(nodeId)) {
      return true;
    }
  }

  return false;
}

/**
 * Find all cycles in a graph
 */
export function findAllCycles(
  nodes: NodeInstance[],
  connections: NodeConnection[]
): string[][] {
  const adjacency = new Map<string, Set<string>>();

  for (const node of nodes) {
    adjacency.set(node.id, new Set());
  }

  for (const conn of connections) {
    const deps = adjacency.get(conn.sourceNodeId);
    if (deps) {
      deps.add(conn.targetNodeId);
    }
  }

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];

  function dfs(nodeId: string): void {
    visited.add(nodeId);
    recStack.add(nodeId);
    path.push(nodeId);

    const neighbors = adjacency.get(nodeId) || new Set();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recStack.has(neighbor)) {
        // Found a cycle - extract it from path
        const cycleStart = path.indexOf(neighbor);
        const cycle = path.slice(cycleStart);
        cycles.push([...cycle, neighbor]); // Add the start node to close the cycle
      }
    }

    path.pop();
    recStack.delete(nodeId);
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id);
    }
  }

  return cycles;
}

/**
 * Get nodes involved in cycles
 */
export function getNodesInCycles(
  nodes: NodeInstance[],
  connections: NodeConnection[]
): Set<string> {
  const cycles = findAllCycles(nodes, connections);
  const nodesInCycles = new Set<string>();

  for (const cycle of cycles) {
    for (const nodeId of cycle) {
      nodesInCycles.add(nodeId);
    }
  }

  return nodesInCycles;
}

/**
 * Check if a specific node is part of a cycle
 */
export function isNodeInCycle(
  nodeId: string,
  nodes: NodeInstance[],
  connections: NodeConnection[]
): boolean {
  const nodesInCycles = getNodesInCycles(nodes, connections);
  return nodesInCycles.has(nodeId);
}

/**
 * Suggest connections to remove to break cycles
 */
export function suggestCycleBreaks(
  nodes: NodeInstance[],
  connections: NodeConnection[]
): NodeConnection[] {
  const cycles = findAllCycles(nodes, connections);

  if (cycles.length === 0) {
    return [];
  }

  const suggestedRemovals: NodeConnection[] = [];
  const removedConnections = new Set<string>();

  for (const cycle of cycles) {
    // Find connections in this cycle
    for (let i = 0; i < cycle.length - 1; i++) {
      const fromNode = cycle[i];
      const toNode = cycle[i + 1];

      const connection = connections.find(
        (c) =>
          c.sourceNodeId === fromNode &&
          c.targetNodeId === toNode &&
          !removedConnections.has(c.id)
      );

      if (connection) {
        // Suggest removing this connection
        suggestedRemovals.push(connection);
        removedConnections.add(connection.id);
        break; // One removal per cycle is enough
      }
    }
  }

  return suggestedRemovals;
}

/**
 * Validate graph structure
 */
export function validateGraph(
  nodes: NodeInstance[],
  connections: NodeConnection[]
): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for cycles
  const cycles = findAllCycles(nodes, connections);
  if (cycles.length > 0) {
    errors.push(`Graph contains ${cycles.length} cycle(s)`);
    for (const cycle of cycles) {
      errors.push(`  Cycle: ${cycle.join(' -> ')}`);
    }
  }

  // Check for dangling connections
  const nodeIds = new Set(nodes.map((n) => n.id));
  for (const conn of connections) {
    if (!nodeIds.has(conn.sourceNodeId)) {
      errors.push(`Connection ${conn.id} references non-existent source node ${conn.sourceNodeId}`);
    }
    if (!nodeIds.has(conn.targetNodeId)) {
      errors.push(`Connection ${conn.id} references non-existent target node ${conn.targetNodeId}`);
    }
  }

  // Check for isolated nodes (warning only)
  const connectedNodes = new Set<string>();
  for (const conn of connections) {
    connectedNodes.add(conn.sourceNodeId);
    connectedNodes.add(conn.targetNodeId);
  }

  for (const node of nodes) {
    if (!connectedNodes.has(node.id)) {
      warnings.push(`Node ${node.id} is not connected to any other nodes`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
