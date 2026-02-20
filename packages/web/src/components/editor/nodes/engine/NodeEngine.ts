/**
 * Node Engine
 * Executes node graphs in topological order
 */

import type {
  NodeInstance,
  NodeConnection,
  NodeTypeDefinition,
  ExecutionContext,
  ExecutionResult,
  PortDataType,
} from './NodeTypes';
import { convertValue, getDefaultValue, arePortsCompatible } from './NodeTypes';
export { arePortsCompatible } from './NodeTypes';
import { topologicalSort, getAffectedNodes } from './TopologicalSort';
import { wouldCreateCycle } from './CycleDetector';

/**
 * Registry of all available node types
 */
const nodeTypeRegistry = new Map<string, NodeTypeDefinition>();

/**
 * Register a node type
 */
export function registerNodeType(definition: NodeTypeDefinition): void {
  nodeTypeRegistry.set(definition.type, definition);
}

/**
 * Get a node type definition
 */
export function getNodeType(type: string): NodeTypeDefinition | undefined {
  return nodeTypeRegistry.get(type);
}

/**
 * Get all registered node types
 */
export function getAllNodeTypes(): NodeTypeDefinition[] {
  return Array.from(nodeTypeRegistry.values());
}

/**
 * Get node types by category
 */
export function getNodeTypesByCategory(
  category: NodeTypeDefinition['category']
): NodeTypeDefinition[] {
  return getAllNodeTypes().filter((def) => def.category === category);
}

/**
 * Node Engine class for executing graphs
 */
export class NodeEngine {
  private nodes: NodeInstance[] = [];
  private connections: NodeConnection[] = [];
  private outputCache: Map<string, Record<string, unknown>> = new Map();
  private executionContext: ExecutionContext;

  constructor() {
    this.executionContext = this.createDefaultContext();
  }

  /**
   * Create default execution context
   */
  private createDefaultContext(): ExecutionContext {
    return {
      time: 0,
      frame: 0,
      fps: 30,
      duration: 10,
      resolution: { width: 1920, height: 1080 },
      cache: new Map(),
    };
  }

  /**
   * Set the graph to execute
   */
  setGraph(nodes: NodeInstance[], connections: NodeConnection[]): void {
    this.nodes = nodes;
    this.connections = connections;
    this.outputCache.clear();
  }

  /**
   * Update execution context
   */
  setContext(context: Partial<ExecutionContext>): void {
    this.executionContext = { ...this.executionContext, ...context };
  }

  /**
   * Check if a connection can be added
   */
  canConnect(sourceNodeId: string, targetNodeId: string): boolean {
    return !wouldCreateCycle(this.nodes, this.connections, {
      sourceNodeId,
      targetNodeId,
    });
  }

  /**
   * Get input values for a node
   */
  private getNodeInputs(
    nodeId: string,
    nodeType: NodeTypeDefinition
  ): Record<string, unknown> {
    const inputs: Record<string, unknown> = {};

    // Start with default values
    for (const input of nodeType.inputs) {
      inputs[input.id] = input.defaultValue ?? getDefaultValue(input.dataType);
    }

    // Override with connected values
    const incomingConnections = this.connections.filter(
      (c) => c.targetNodeId === nodeId
    );

    for (const conn of incomingConnections) {
      const sourceOutputs = this.outputCache.get(conn.sourceNodeId);
      if (sourceOutputs && conn.sourcePortId in sourceOutputs) {
        const sourceValue = sourceOutputs[conn.sourcePortId];

        // Find port types for conversion
        const sourceNodeType = getNodeType(
          this.nodes.find((n) => n.id === conn.sourceNodeId)?.type || ''
        );
        const sourcePort = sourceNodeType?.outputs.find(
          (p) => p.id === conn.sourcePortId
        );
        const targetPort = nodeType.inputs.find(
          (p) => p.id === conn.targetPortId
        );

        if (sourcePort && targetPort) {
          inputs[conn.targetPortId] = convertValue(
            sourceValue,
            sourcePort.dataType,
            targetPort.dataType
          );
        } else {
          inputs[conn.targetPortId] = sourceValue;
        }
      }
    }

    return inputs;
  }

  /**
   * Execute a single node
   */
  private executeNode(node: NodeInstance): Record<string, unknown> {
    const nodeType = getNodeType(node.type);
    if (!nodeType) {
      console.warn(`Unknown node type: ${node.type}`);
      return {};
    }

    const inputs = this.getNodeInputs(node.id, nodeType);
    const parameters = { ...node.parameters };

    // Apply default parameter values
    for (const param of nodeType.parameters) {
      if (!(param.id in parameters)) {
        parameters[param.id] = param.defaultValue;
      }
    }

    try {
      return nodeType.execute(inputs, parameters, this.executionContext);
    } catch (error) {
      console.error(`Error executing node ${node.id}:`, error);
      return {};
    }
  }

  /**
   * Execute the entire graph
   */
  execute(): ExecutionResult {
    const startTime = performance.now();
    const errors: Array<{ nodeId: string; message: string }> = [];

    // Get execution order
    const order = topologicalSort(this.nodes, this.connections);

    // Clear cache
    this.outputCache.clear();

    // Execute nodes in order
    for (const nodeId of order) {
      const node = this.nodes.find((n) => n.id === nodeId);
      if (!node) continue;

      try {
        const outputs = this.executeNode(node);
        this.outputCache.set(nodeId, outputs);
      } catch (error) {
        errors.push({
          nodeId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Collect outputs from output nodes
    const finalOutputs: Record<string, unknown> = {};
    const outputNodes = this.nodes.filter((n) => {
      const nodeType = getNodeType(n.type);
      return nodeType?.category === 'output';
    });

    for (const node of outputNodes) {
      const nodeOutputs = this.outputCache.get(node.id);
      if (nodeOutputs) {
        for (const [key, value] of Object.entries(nodeOutputs)) {
          finalOutputs[`${node.id}.${key}`] = value;
        }
      }
    }

    return {
      success: errors.length === 0,
      outputs: finalOutputs,
      errors: errors.length > 0 ? errors : undefined,
      executionTime: performance.now() - startTime,
    };
  }

  /**
   * Execute only affected nodes after a change
   */
  executePartial(changedNodeId: string): ExecutionResult {
    const startTime = performance.now();
    const errors: Array<{ nodeId: string; message: string }> = [];

    // Get affected nodes
    const affected = getAffectedNodes(changedNodeId, this.nodes, this.connections);

    // Execute only affected nodes
    for (const nodeId of affected) {
      const node = this.nodes.find((n) => n.id === nodeId);
      if (!node) continue;

      try {
        const outputs = this.executeNode(node);
        this.outputCache.set(nodeId, outputs);
      } catch (error) {
        errors.push({
          nodeId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Collect outputs
    const finalOutputs: Record<string, unknown> = {};
    const outputNodes = this.nodes.filter((n) => {
      const nodeType = getNodeType(n.type);
      return nodeType?.category === 'output';
    });

    for (const node of outputNodes) {
      const nodeOutputs = this.outputCache.get(node.id);
      if (nodeOutputs) {
        for (const [key, value] of Object.entries(nodeOutputs)) {
          finalOutputs[`${node.id}.${key}`] = value;
        }
      }
    }

    return {
      success: errors.length === 0,
      outputs: finalOutputs,
      errors: errors.length > 0 ? errors : undefined,
      executionTime: performance.now() - startTime,
    };
  }

  /**
   * Get cached output for a node
   */
  getNodeOutput(nodeId: string): Record<string, unknown> | undefined {
    return this.outputCache.get(nodeId);
  }

  /**
   * Get output value for a specific port
   */
  getPortValue(nodeId: string, portId: string): unknown {
    const outputs = this.outputCache.get(nodeId);
    return outputs?.[portId];
  }

  /**
   * Validate the current graph
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const nodeIds = new Set(this.nodes.map((n) => n.id));

    // Check for unknown node types
    for (const node of this.nodes) {
      if (!getNodeType(node.type)) {
        errors.push(`Unknown node type: ${node.type}`);
      }
    }

    // Check connections
    for (const conn of this.connections) {
      if (!nodeIds.has(conn.sourceNodeId)) {
        errors.push(`Connection references non-existent source: ${conn.sourceNodeId}`);
      }
      if (!nodeIds.has(conn.targetNodeId)) {
        errors.push(`Connection references non-existent target: ${conn.targetNodeId}`);
      }

      // Check port compatibility
      const sourceNode = this.nodes.find((n) => n.id === conn.sourceNodeId);
      const targetNode = this.nodes.find((n) => n.id === conn.targetNodeId);

      if (sourceNode && targetNode) {
        const sourceType = getNodeType(sourceNode.type);
        const targetType = getNodeType(targetNode.type);

        if (sourceType && targetType) {
          const sourcePort = sourceType.outputs.find((p) => p.id === conn.sourcePortId);
          const targetPort = targetType.inputs.find((p) => p.id === conn.targetPortId);

          if (!sourcePort) {
            errors.push(`Unknown output port: ${conn.sourcePortId} on ${sourceNode.type}`);
          }
          if (!targetPort) {
            errors.push(`Unknown input port: ${conn.targetPortId} on ${targetNode.type}`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

/**
 * Create a new node instance
 */
export function createNodeInstance(
  type: string,
  position: { x: number; y: number },
  id?: string
): NodeInstance | null {
  const nodeType = getNodeType(type);
  if (!nodeType) {
    return null;
  }

  // Initialize parameters with defaults
  const parameters: Record<string, unknown> = {};
  for (const param of nodeType.parameters) {
    parameters[param.id] = param.defaultValue;
  }

  return {
    id: id || `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    position,
    parameters,
  };
}

/**
 * Create a connection
 */
export function createConnection(
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string
): NodeConnection {
  return {
    id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    sourceNodeId,
    sourcePortId,
    targetNodeId,
    targetPortId,
  };
}

/**
 * Singleton engine instance
 */
let engineInstance: NodeEngine | null = null;

export function getNodeEngine(): NodeEngine {
  if (!engineInstance) {
    engineInstance = new NodeEngine();
  }
  return engineInstance;
}
