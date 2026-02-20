/**
 * Transform Nodes
 * Position, rotation, scale, and vector operations
 */

import type { NodeTypeDefinition } from '../engine/NodeTypes';

type Vector2 = { x: number; y: number };
type Vector3 = { x: number; y: number; z: number };

/**
 * Vector2 Constant Node
 */
export const Vector2Node: NodeTypeDefinition = {
  type: 'transform.vector2',
  name: 'Vector2',
  category: 'input',
  description: 'A 2D vector value',
  inputs: [],
  outputs: [
    { id: 'vector', name: 'Vector', dataType: 'vector2', direction: 'output' },
    { id: 'x', name: 'X', dataType: 'number', direction: 'output' },
    { id: 'y', name: 'Y', dataType: 'number', direction: 'output' },
  ],
  parameters: [
    { id: 'x', name: 'X', type: 'number', defaultValue: 0 },
    { id: 'y', name: 'Y', type: 'number', defaultValue: 0 },
  ],
  execute: (_, parameters) => ({
    vector: { x: parameters.x as number, y: parameters.y as number },
    x: parameters.x as number,
    y: parameters.y as number,
  }),
};

/**
 * Vector3 Constant Node
 */
export const Vector3Node: NodeTypeDefinition = {
  type: 'transform.vector3',
  name: 'Vector3',
  category: 'input',
  description: 'A 3D vector value',
  inputs: [],
  outputs: [
    { id: 'vector', name: 'Vector', dataType: 'vector3', direction: 'output' },
    { id: 'x', name: 'X', dataType: 'number', direction: 'output' },
    { id: 'y', name: 'Y', dataType: 'number', direction: 'output' },
    { id: 'z', name: 'Z', dataType: 'number', direction: 'output' },
  ],
  parameters: [
    { id: 'x', name: 'X', type: 'number', defaultValue: 0 },
    { id: 'y', name: 'Y', type: 'number', defaultValue: 0 },
    { id: 'z', name: 'Z', type: 'number', defaultValue: 0 },
  ],
  execute: (_, parameters) => ({
    vector: {
      x: parameters.x as number,
      y: parameters.y as number,
      z: parameters.z as number,
    },
    x: parameters.x as number,
    y: parameters.y as number,
    z: parameters.z as number,
  }),
};

/**
 * Combine Vector2 Node
 */
export const CombineVector2Node: NodeTypeDefinition = {
  type: 'transform.combineVector2',
  name: 'Combine XY',
  category: 'transform',
  description: 'Combines X and Y into a vector',
  inputs: [
    { id: 'x', name: 'X', dataType: 'number', direction: 'input', defaultValue: 0 },
    { id: 'y', name: 'Y', dataType: 'number', direction: 'input', defaultValue: 0 },
  ],
  outputs: [
    { id: 'vector', name: 'Vector', dataType: 'vector2', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => ({
    vector: { x: inputs.x as number, y: inputs.y as number },
  }),
};

/**
 * Split Vector2 Node
 */
export const SplitVector2Node: NodeTypeDefinition = {
  type: 'transform.splitVector2',
  name: 'Split XY',
  category: 'transform',
  description: 'Splits a vector into X and Y',
  inputs: [
    { id: 'vector', name: 'Vector', dataType: 'vector2', direction: 'input', defaultValue: { x: 0, y: 0 } },
  ],
  outputs: [
    { id: 'x', name: 'X', dataType: 'number', direction: 'output' },
    { id: 'y', name: 'Y', dataType: 'number', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => {
    const vector = inputs.vector as Vector2;
    return { x: vector.x, y: vector.y };
  },
};

/**
 * Combine Vector3 Node
 */
export const CombineVector3Node: NodeTypeDefinition = {
  type: 'transform.combineVector3',
  name: 'Combine XYZ',
  category: 'transform',
  description: 'Combines X, Y, Z into a vector',
  inputs: [
    { id: 'x', name: 'X', dataType: 'number', direction: 'input', defaultValue: 0 },
    { id: 'y', name: 'Y', dataType: 'number', direction: 'input', defaultValue: 0 },
    { id: 'z', name: 'Z', dataType: 'number', direction: 'input', defaultValue: 0 },
  ],
  outputs: [
    { id: 'vector', name: 'Vector', dataType: 'vector3', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => ({
    vector: {
      x: inputs.x as number,
      y: inputs.y as number,
      z: inputs.z as number,
    },
  }),
};

/**
 * Split Vector3 Node
 */
export const SplitVector3Node: NodeTypeDefinition = {
  type: 'transform.splitVector3',
  name: 'Split XYZ',
  category: 'transform',
  description: 'Splits a vector into X, Y, Z',
  inputs: [
    { id: 'vector', name: 'Vector', dataType: 'vector3', direction: 'input', defaultValue: { x: 0, y: 0, z: 0 } },
  ],
  outputs: [
    { id: 'x', name: 'X', dataType: 'number', direction: 'output' },
    { id: 'y', name: 'Y', dataType: 'number', direction: 'output' },
    { id: 'z', name: 'Z', dataType: 'number', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => {
    const vector = inputs.vector as Vector3;
    return { x: vector.x, y: vector.y, z: vector.z };
  },
};

/**
 * Vector Add Node
 */
export const VectorAddNode: NodeTypeDefinition = {
  type: 'transform.vectorAdd',
  name: 'Vector Add',
  category: 'transform',
  description: 'Adds two vectors',
  inputs: [
    { id: 'a', name: 'A', dataType: 'vector2', direction: 'input', defaultValue: { x: 0, y: 0 } },
    { id: 'b', name: 'B', dataType: 'vector2', direction: 'input', defaultValue: { x: 0, y: 0 } },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'vector2', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => {
    const a = inputs.a as Vector2;
    const b = inputs.b as Vector2;
    return { result: { x: a.x + b.x, y: a.y + b.y } };
  },
};

/**
 * Vector Subtract Node
 */
export const VectorSubtractNode: NodeTypeDefinition = {
  type: 'transform.vectorSubtract',
  name: 'Vector Subtract',
  category: 'transform',
  description: 'Subtracts two vectors',
  inputs: [
    { id: 'a', name: 'A', dataType: 'vector2', direction: 'input', defaultValue: { x: 0, y: 0 } },
    { id: 'b', name: 'B', dataType: 'vector2', direction: 'input', defaultValue: { x: 0, y: 0 } },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'vector2', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => {
    const a = inputs.a as Vector2;
    const b = inputs.b as Vector2;
    return { result: { x: a.x - b.x, y: a.y - b.y } };
  },
};

/**
 * Vector Multiply Node
 */
export const VectorMultiplyNode: NodeTypeDefinition = {
  type: 'transform.vectorMultiply',
  name: 'Vector Multiply',
  category: 'transform',
  description: 'Multiplies a vector by a scalar',
  inputs: [
    { id: 'vector', name: 'Vector', dataType: 'vector2', direction: 'input', defaultValue: { x: 1, y: 1 } },
    { id: 'scalar', name: 'Scalar', dataType: 'number', direction: 'input', defaultValue: 1 },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'vector2', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => {
    const vector = inputs.vector as Vector2;
    const scalar = inputs.scalar as number;
    return { result: { x: vector.x * scalar, y: vector.y * scalar } };
  },
};

/**
 * Vector Length Node
 */
export const VectorLengthNode: NodeTypeDefinition = {
  type: 'transform.vectorLength',
  name: 'Vector Length',
  category: 'transform',
  description: 'Returns the length of a vector',
  inputs: [
    { id: 'vector', name: 'Vector', dataType: 'vector2', direction: 'input', defaultValue: { x: 1, y: 0 } },
  ],
  outputs: [
    { id: 'length', name: 'Length', dataType: 'number', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => {
    const vector = inputs.vector as Vector2;
    return { length: Math.sqrt(vector.x * vector.x + vector.y * vector.y) };
  },
};

/**
 * Vector Normalize Node
 */
export const VectorNormalizeNode: NodeTypeDefinition = {
  type: 'transform.vectorNormalize',
  name: 'Normalize',
  category: 'transform',
  description: 'Normalizes a vector to unit length',
  inputs: [
    { id: 'vector', name: 'Vector', dataType: 'vector2', direction: 'input', defaultValue: { x: 1, y: 0 } },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'vector2', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => {
    const vector = inputs.vector as Vector2;
    const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
    if (length === 0) return { result: { x: 0, y: 0 } };
    return { result: { x: vector.x / length, y: vector.y / length } };
  },
};

/**
 * Dot Product Node
 */
export const DotProductNode: NodeTypeDefinition = {
  type: 'transform.dotProduct',
  name: 'Dot Product',
  category: 'transform',
  description: 'Calculates the dot product of two vectors',
  inputs: [
    { id: 'a', name: 'A', dataType: 'vector2', direction: 'input', defaultValue: { x: 1, y: 0 } },
    { id: 'b', name: 'B', dataType: 'vector2', direction: 'input', defaultValue: { x: 0, y: 1 } },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'number', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => {
    const a = inputs.a as Vector2;
    const b = inputs.b as Vector2;
    return { result: a.x * b.x + a.y * b.y };
  },
};

/**
 * Vector Lerp Node
 */
export const VectorLerpNode: NodeTypeDefinition = {
  type: 'transform.vectorLerp',
  name: 'Vector Lerp',
  category: 'transform',
  description: 'Linear interpolation between two vectors',
  inputs: [
    { id: 'a', name: 'A', dataType: 'vector2', direction: 'input', defaultValue: { x: 0, y: 0 } },
    { id: 'b', name: 'B', dataType: 'vector2', direction: 'input', defaultValue: { x: 1, y: 1 } },
    { id: 't', name: 'T', dataType: 'number', direction: 'input', defaultValue: 0.5 },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'vector2', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => {
    const a = inputs.a as Vector2;
    const b = inputs.b as Vector2;
    const t = inputs.t as number;
    return {
      result: {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      },
    };
  },
};

/**
 * Rotate Vector Node
 */
export const RotateVectorNode: NodeTypeDefinition = {
  type: 'transform.rotateVector',
  name: 'Rotate',
  category: 'transform',
  description: 'Rotates a vector by an angle (degrees)',
  inputs: [
    { id: 'vector', name: 'Vector', dataType: 'vector2', direction: 'input', defaultValue: { x: 1, y: 0 } },
    { id: 'angle', name: 'Angle', dataType: 'number', direction: 'input', defaultValue: 0 },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'vector2', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => {
    const vector = inputs.vector as Vector2;
    const angle = (inputs.angle as number) * (Math.PI / 180);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      result: {
        x: vector.x * cos - vector.y * sin,
        y: vector.x * sin + vector.y * cos,
      },
    };
  },
};

/**
 * Distance Node
 */
export const DistanceNode: NodeTypeDefinition = {
  type: 'transform.distance',
  name: 'Distance',
  category: 'transform',
  description: 'Calculates distance between two points',
  inputs: [
    { id: 'a', name: 'A', dataType: 'vector2', direction: 'input', defaultValue: { x: 0, y: 0 } },
    { id: 'b', name: 'B', dataType: 'vector2', direction: 'input', defaultValue: { x: 1, y: 1 } },
  ],
  outputs: [
    { id: 'distance', name: 'Distance', dataType: 'number', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => {
    const a = inputs.a as Vector2;
    const b = inputs.b as Vector2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return { distance: Math.sqrt(dx * dx + dy * dy) };
  },
};

/**
 * Transform Node
 */
export const TransformNode: NodeTypeDefinition = {
  type: 'transform.transform',
  name: 'Transform',
  category: 'transform',
  description: 'Applies position, rotation, and scale',
  inputs: [
    { id: 'position', name: 'Position', dataType: 'vector2', direction: 'input', defaultValue: { x: 0, y: 0 } },
    { id: 'rotation', name: 'Rotation', dataType: 'number', direction: 'input', defaultValue: 0 },
    { id: 'scale', name: 'Scale', dataType: 'vector2', direction: 'input', defaultValue: { x: 1, y: 1 } },
    { id: 'anchor', name: 'Anchor', dataType: 'vector2', direction: 'input', defaultValue: { x: 0.5, y: 0.5 } },
  ],
  outputs: [
    { id: 'matrix', name: 'Matrix', dataType: 'any', direction: 'output' },
    { id: 'position', name: 'Position', dataType: 'vector2', direction: 'output' },
    { id: 'rotation', name: 'Rotation', dataType: 'number', direction: 'output' },
    { id: 'scale', name: 'Scale', dataType: 'vector2', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => {
    const position = inputs.position as Vector2;
    const rotation = inputs.rotation as number;
    const scale = inputs.scale as Vector2;
    const anchor = inputs.anchor as Vector2;

    // Create transformation matrix
    const radians = rotation * (Math.PI / 180);
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    // 3x3 transformation matrix as array
    const matrix = [
      scale.x * cos, -scale.y * sin, position.x - anchor.x * scale.x * cos + anchor.y * scale.y * sin,
      scale.x * sin, scale.y * cos, position.y - anchor.x * scale.x * sin - anchor.y * scale.y * cos,
      0, 0, 1,
    ];

    return {
      matrix,
      position,
      rotation,
      scale,
    };
  },
};

/**
 * Resolution Node
 */
export const ResolutionNode: NodeTypeDefinition = {
  type: 'transform.resolution',
  name: 'Resolution',
  category: 'input',
  description: 'Current canvas resolution',
  inputs: [],
  outputs: [
    { id: 'resolution', name: 'Resolution', dataType: 'vector2', direction: 'output' },
    { id: 'width', name: 'Width', dataType: 'number', direction: 'output' },
    { id: 'height', name: 'Height', dataType: 'number', direction: 'output' },
    { id: 'aspect', name: 'Aspect', dataType: 'number', direction: 'output' },
  ],
  parameters: [],
  execute: (_, __, context) => {
    const { width, height } = context.resolution;
    return {
      resolution: { x: width, y: height },
      width,
      height,
      aspect: height > 0 ? width / height : 1,
    };
  },
};

/**
 * All transform nodes
 */
export const transformNodes: NodeTypeDefinition[] = [
  Vector2Node,
  Vector3Node,
  CombineVector2Node,
  SplitVector2Node,
  CombineVector3Node,
  SplitVector3Node,
  VectorAddNode,
  VectorSubtractNode,
  VectorMultiplyNode,
  VectorLengthNode,
  VectorNormalizeNode,
  DotProductNode,
  VectorLerpNode,
  RotateVectorNode,
  DistanceNode,
  TransformNode,
  ResolutionNode,
];
