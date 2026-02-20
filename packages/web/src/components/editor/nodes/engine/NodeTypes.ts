/**
 * Node Graph Type Definitions
 * Core types for the node-based effect editor
 */

/**
 * Data types that can flow between nodes
 */
export type PortDataType =
  | 'number'
  | 'vector2'
  | 'vector3'
  | 'color'
  | 'image'
  | 'boolean'
  | 'string'
  | 'any';

/**
 * Port direction
 */
export type PortDirection = 'input' | 'output';

/**
 * Port definition
 */
export interface PortDefinition {
  id: string;
  name: string;
  dataType: PortDataType;
  direction: PortDirection;
  defaultValue?: unknown;
  required?: boolean;
  multiple?: boolean; // Allow multiple connections (for inputs)
}

/**
 * Parameter definition for node UI
 */
export interface ParameterDefinition {
  id: string;
  name: string;
  type: 'number' | 'boolean' | 'string' | 'color' | 'select' | 'vector2';
  defaultValue: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: string | number }>;
}

/**
 * Node type definition
 */
export interface NodeTypeDefinition {
  type: string;
  name: string;
  category: 'input' | 'output' | 'math' | 'color' | 'transform' | 'effect' | 'logic' | 'utility';
  description: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  parameters: ParameterDefinition[];
  // Execution function
  execute: (
    inputs: Record<string, unknown>,
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ) => Record<string, unknown>;
}

/**
 * Node instance in the graph
 */
export interface NodeInstance {
  id: string;
  type: string;
  position: { x: number; y: number };
  parameters: Record<string, unknown>;
  collapsed?: boolean;
}

/**
 * Connection between nodes
 */
export interface NodeConnection {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}

/**
 * Complete node graph
 */
export interface NodeGraph {
  id: string;
  name: string;
  nodes: NodeInstance[];
  connections: NodeConnection[];
}

/**
 * Execution context passed to node execute functions
 */
export interface ExecutionContext {
  time: number;
  frame: number;
  fps: number;
  duration: number;
  resolution: { width: number; height: number };
  // Cache for computed values
  cache: Map<string, unknown>;
}

/**
 * Result of graph execution
 */
export interface ExecutionResult {
  success: boolean;
  outputs: Record<string, unknown>;
  errors?: Array<{ nodeId: string; message: string }>;
  executionTime: number;
}

/**
 * Port compatibility checker
 */
export function arePortsCompatible(
  sourceType: PortDataType,
  targetType: PortDataType
): boolean {
  // Any type is compatible with everything
  if (sourceType === 'any' || targetType === 'any') {
    return true;
  }

  // Exact match
  if (sourceType === targetType) {
    return true;
  }

  // Number can convert to many types
  if (sourceType === 'number') {
    return ['boolean', 'string'].includes(targetType);
  }

  // Vector types can convert to each other
  if (sourceType === 'vector2' && targetType === 'vector3') {
    return true;
  }
  if (sourceType === 'vector3' && targetType === 'vector2') {
    return true;
  }

  // Boolean can convert to number
  if (sourceType === 'boolean' && targetType === 'number') {
    return true;
  }

  return false;
}

/**
 * Convert value between types
 */
export function convertValue(
  value: unknown,
  fromType: PortDataType,
  toType: PortDataType
): unknown {
  if (fromType === toType) {
    return value;
  }

  // Number conversions
  if (fromType === 'number') {
    switch (toType) {
      case 'boolean':
        return (value as number) !== 0;
      case 'string':
        return String(value);
      case 'vector2':
        return { x: value as number, y: value as number };
      case 'vector3':
        return { x: value as number, y: value as number, z: value as number };
      case 'color':
        const v = value as number;
        return { r: v, g: v, b: v };
    }
  }

  // Boolean conversions
  if (fromType === 'boolean') {
    switch (toType) {
      case 'number':
        return (value as boolean) ? 1 : 0;
      case 'string':
        return String(value);
    }
  }

  // Vector conversions
  if (fromType === 'vector2' && toType === 'vector3') {
    const v = value as { x: number; y: number };
    return { x: v.x, y: v.y, z: 0 };
  }
  if (fromType === 'vector3' && toType === 'vector2') {
    const v = value as { x: number; y: number; z: number };
    return { x: v.x, y: v.y };
  }

  // String conversions
  if (toType === 'string') {
    return JSON.stringify(value);
  }

  // Fallback
  return value;
}

/**
 * Get default value for a data type
 */
export function getDefaultValue(dataType: PortDataType): unknown {
  switch (dataType) {
    case 'number':
      return 0;
    case 'vector2':
      return { x: 0, y: 0 };
    case 'vector3':
      return { x: 0, y: 0, z: 0 };
    case 'color':
      return { r: 0, g: 0, b: 0 };
    case 'boolean':
      return false;
    case 'string':
      return '';
    case 'image':
      return null;
    case 'any':
      return null;
  }
}

/**
 * Color for each data type (for UI)
 */
export const dataTypeColors: Record<PortDataType, string> = {
  number: '#4ade80',      // green
  vector2: '#60a5fa',     // blue
  vector3: '#818cf8',     // indigo
  color: '#f472b6',       // pink
  image: '#fbbf24',       // amber
  boolean: '#f87171',     // red
  string: '#a78bfa',      // purple
  any: '#94a3b8',         // slate
};
