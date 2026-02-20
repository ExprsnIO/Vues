/**
 * Math Nodes
 * Basic mathematical operations for node graphs
 */

import type { NodeTypeDefinition } from '../engine/NodeTypes';

/**
 * Add Node - Adds two numbers
 */
export const AddNode: NodeTypeDefinition = {
  type: 'math.add',
  name: 'Add',
  category: 'math',
  description: 'Adds two values together',
  inputs: [
    { id: 'a', name: 'A', dataType: 'number', direction: 'input', defaultValue: 0 },
    { id: 'b', name: 'B', dataType: 'number', direction: 'input', defaultValue: 0 },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'number', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => ({
    result: (inputs.a as number) + (inputs.b as number),
  }),
};

/**
 * Subtract Node
 */
export const SubtractNode: NodeTypeDefinition = {
  type: 'math.subtract',
  name: 'Subtract',
  category: 'math',
  description: 'Subtracts B from A',
  inputs: [
    { id: 'a', name: 'A', dataType: 'number', direction: 'input', defaultValue: 0 },
    { id: 'b', name: 'B', dataType: 'number', direction: 'input', defaultValue: 0 },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'number', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => ({
    result: (inputs.a as number) - (inputs.b as number),
  }),
};

/**
 * Multiply Node
 */
export const MultiplyNode: NodeTypeDefinition = {
  type: 'math.multiply',
  name: 'Multiply',
  category: 'math',
  description: 'Multiplies two values',
  inputs: [
    { id: 'a', name: 'A', dataType: 'number', direction: 'input', defaultValue: 1 },
    { id: 'b', name: 'B', dataType: 'number', direction: 'input', defaultValue: 1 },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'number', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => ({
    result: (inputs.a as number) * (inputs.b as number),
  }),
};

/**
 * Divide Node
 */
export const DivideNode: NodeTypeDefinition = {
  type: 'math.divide',
  name: 'Divide',
  category: 'math',
  description: 'Divides A by B',
  inputs: [
    { id: 'a', name: 'A', dataType: 'number', direction: 'input', defaultValue: 1 },
    { id: 'b', name: 'B', dataType: 'number', direction: 'input', defaultValue: 1 },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'number', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => {
    const b = inputs.b as number;
    if (b === 0) return { result: 0 };
    return { result: (inputs.a as number) / b };
  },
};

/**
 * Modulo Node
 */
export const ModuloNode: NodeTypeDefinition = {
  type: 'math.modulo',
  name: 'Modulo',
  category: 'math',
  description: 'Returns remainder of A divided by B',
  inputs: [
    { id: 'a', name: 'A', dataType: 'number', direction: 'input', defaultValue: 0 },
    { id: 'b', name: 'B', dataType: 'number', direction: 'input', defaultValue: 1 },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'number', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => {
    const b = inputs.b as number;
    if (b === 0) return { result: 0 };
    return { result: (inputs.a as number) % b };
  },
};

/**
 * Power Node
 */
export const PowerNode: NodeTypeDefinition = {
  type: 'math.power',
  name: 'Power',
  category: 'math',
  description: 'Raises A to the power of B',
  inputs: [
    { id: 'base', name: 'Base', dataType: 'number', direction: 'input', defaultValue: 2 },
    { id: 'exponent', name: 'Exponent', dataType: 'number', direction: 'input', defaultValue: 2 },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'number', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => ({
    result: Math.pow(inputs.base as number, inputs.exponent as number),
  }),
};

/**
 * Square Root Node
 */
export const SqrtNode: NodeTypeDefinition = {
  type: 'math.sqrt',
  name: 'Square Root',
  category: 'math',
  description: 'Returns the square root of a value',
  inputs: [
    { id: 'value', name: 'Value', dataType: 'number', direction: 'input', defaultValue: 1 },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'number', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => ({
    result: Math.sqrt(Math.max(0, inputs.value as number)),
  }),
};

/**
 * Absolute Value Node
 */
export const AbsNode: NodeTypeDefinition = {
  type: 'math.abs',
  name: 'Absolute',
  category: 'math',
  description: 'Returns the absolute value',
  inputs: [
    { id: 'value', name: 'Value', dataType: 'number', direction: 'input', defaultValue: 0 },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'number', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => ({
    result: Math.abs(inputs.value as number),
  }),
};

/**
 * Negate Node
 */
export const NegateNode: NodeTypeDefinition = {
  type: 'math.negate',
  name: 'Negate',
  category: 'math',
  description: 'Negates a value',
  inputs: [
    { id: 'value', name: 'Value', dataType: 'number', direction: 'input', defaultValue: 0 },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'number', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => ({
    result: -(inputs.value as number),
  }),
};

/**
 * Sin Node
 */
export const SinNode: NodeTypeDefinition = {
  type: 'math.sin',
  name: 'Sine',
  category: 'math',
  description: 'Returns the sine of an angle (radians)',
  inputs: [
    { id: 'angle', name: 'Angle', dataType: 'number', direction: 'input', defaultValue: 0 },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'number', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => ({
    result: Math.sin(inputs.angle as number),
  }),
};

/**
 * Cos Node
 */
export const CosNode: NodeTypeDefinition = {
  type: 'math.cos',
  name: 'Cosine',
  category: 'math',
  description: 'Returns the cosine of an angle (radians)',
  inputs: [
    { id: 'angle', name: 'Angle', dataType: 'number', direction: 'input', defaultValue: 0 },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'number', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => ({
    result: Math.cos(inputs.angle as number),
  }),
};

/**
 * Tan Node
 */
export const TanNode: NodeTypeDefinition = {
  type: 'math.tan',
  name: 'Tangent',
  category: 'math',
  description: 'Returns the tangent of an angle (radians)',
  inputs: [
    { id: 'angle', name: 'Angle', dataType: 'number', direction: 'input', defaultValue: 0 },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'number', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => ({
    result: Math.tan(inputs.angle as number),
  }),
};

/**
 * Clamp Node
 */
export const ClampNode: NodeTypeDefinition = {
  type: 'math.clamp',
  name: 'Clamp',
  category: 'math',
  description: 'Clamps a value between min and max',
  inputs: [
    { id: 'value', name: 'Value', dataType: 'number', direction: 'input', defaultValue: 0 },
    { id: 'min', name: 'Min', dataType: 'number', direction: 'input', defaultValue: 0 },
    { id: 'max', name: 'Max', dataType: 'number', direction: 'input', defaultValue: 1 },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'number', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => ({
    result: Math.min(Math.max(inputs.value as number, inputs.min as number), inputs.max as number),
  }),
};

/**
 * Lerp Node
 */
export const LerpNode: NodeTypeDefinition = {
  type: 'math.lerp',
  name: 'Lerp',
  category: 'math',
  description: 'Linear interpolation between A and B',
  inputs: [
    { id: 'a', name: 'A', dataType: 'number', direction: 'input', defaultValue: 0 },
    { id: 'b', name: 'B', dataType: 'number', direction: 'input', defaultValue: 1 },
    { id: 't', name: 'T', dataType: 'number', direction: 'input', defaultValue: 0.5 },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'number', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => {
    const a = inputs.a as number;
    const b = inputs.b as number;
    const t = inputs.t as number;
    return { result: a + (b - a) * t };
  },
};

/**
 * Map Range Node
 */
export const MapRangeNode: NodeTypeDefinition = {
  type: 'math.mapRange',
  name: 'Map Range',
  category: 'math',
  description: 'Maps a value from one range to another',
  inputs: [
    { id: 'value', name: 'Value', dataType: 'number', direction: 'input', defaultValue: 0.5 },
    { id: 'inMin', name: 'In Min', dataType: 'number', direction: 'input', defaultValue: 0 },
    { id: 'inMax', name: 'In Max', dataType: 'number', direction: 'input', defaultValue: 1 },
    { id: 'outMin', name: 'Out Min', dataType: 'number', direction: 'input', defaultValue: 0 },
    { id: 'outMax', name: 'Out Max', dataType: 'number', direction: 'input', defaultValue: 100 },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'number', direction: 'output' },
  ],
  parameters: [
    {
      id: 'clamp',
      name: 'Clamp',
      type: 'boolean',
      defaultValue: false,
    },
  ],
  execute: (inputs, parameters) => {
    const value = inputs.value as number;
    const inMin = inputs.inMin as number;
    const inMax = inputs.inMax as number;
    const outMin = inputs.outMin as number;
    const outMax = inputs.outMax as number;
    const clamp = parameters.clamp as boolean;

    const inRange = inMax - inMin;
    if (inRange === 0) return { result: outMin };

    let t = (value - inMin) / inRange;
    if (clamp) {
      t = Math.min(Math.max(t, 0), 1);
    }

    return { result: outMin + t * (outMax - outMin) };
  },
};

/**
 * Number Constant Node
 */
export const NumberNode: NodeTypeDefinition = {
  type: 'math.number',
  name: 'Number',
  category: 'input',
  description: 'A constant number value',
  inputs: [],
  outputs: [
    { id: 'value', name: 'Value', dataType: 'number', direction: 'output' },
  ],
  parameters: [
    {
      id: 'value',
      name: 'Value',
      type: 'number',
      defaultValue: 0,
    },
  ],
  execute: (_, parameters) => ({
    value: parameters.value as number,
  }),
};

/**
 * Random Node
 */
export const RandomNode: NodeTypeDefinition = {
  type: 'math.random',
  name: 'Random',
  category: 'math',
  description: 'Generates a random number',
  inputs: [
    { id: 'min', name: 'Min', dataType: 'number', direction: 'input', defaultValue: 0 },
    { id: 'max', name: 'Max', dataType: 'number', direction: 'input', defaultValue: 1 },
    { id: 'seed', name: 'Seed', dataType: 'number', direction: 'input', defaultValue: 0 },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'number', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => {
    const min = inputs.min as number;
    const max = inputs.max as number;
    const seed = inputs.seed as number;

    // Seeded random using simple hash
    const hash = Math.sin(seed * 12.9898) * 43758.5453;
    const random = hash - Math.floor(hash);

    return { result: min + random * (max - min) };
  },
};

/**
 * Floor Node
 */
export const FloorNode: NodeTypeDefinition = {
  type: 'math.floor',
  name: 'Floor',
  category: 'math',
  description: 'Rounds down to nearest integer',
  inputs: [
    { id: 'value', name: 'Value', dataType: 'number', direction: 'input', defaultValue: 0 },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'number', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => ({
    result: Math.floor(inputs.value as number),
  }),
};

/**
 * Ceil Node
 */
export const CeilNode: NodeTypeDefinition = {
  type: 'math.ceil',
  name: 'Ceil',
  category: 'math',
  description: 'Rounds up to nearest integer',
  inputs: [
    { id: 'value', name: 'Value', dataType: 'number', direction: 'input', defaultValue: 0 },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'number', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => ({
    result: Math.ceil(inputs.value as number),
  }),
};

/**
 * Round Node
 */
export const RoundNode: NodeTypeDefinition = {
  type: 'math.round',
  name: 'Round',
  category: 'math',
  description: 'Rounds to nearest integer',
  inputs: [
    { id: 'value', name: 'Value', dataType: 'number', direction: 'input', defaultValue: 0 },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'number', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => ({
    result: Math.round(inputs.value as number),
  }),
};

/**
 * Time Node
 */
export const TimeNode: NodeTypeDefinition = {
  type: 'math.time',
  name: 'Time',
  category: 'input',
  description: 'Current time and frame information',
  inputs: [],
  outputs: [
    { id: 'time', name: 'Time', dataType: 'number', direction: 'output' },
    { id: 'frame', name: 'Frame', dataType: 'number', direction: 'output' },
    { id: 'normalizedTime', name: 'Normalized', dataType: 'number', direction: 'output' },
  ],
  parameters: [],
  execute: (_, __, context) => ({
    time: context.time,
    frame: context.frame,
    normalizedTime: context.duration > 0 ? context.time / context.duration : 0,
  }),
};

/**
 * All math nodes
 */
export const mathNodes: NodeTypeDefinition[] = [
  NumberNode,
  TimeNode,
  AddNode,
  SubtractNode,
  MultiplyNode,
  DivideNode,
  ModuloNode,
  PowerNode,
  SqrtNode,
  AbsNode,
  NegateNode,
  SinNode,
  CosNode,
  TanNode,
  ClampNode,
  LerpNode,
  MapRangeNode,
  RandomNode,
  FloorNode,
  CeilNode,
  RoundNode,
];
