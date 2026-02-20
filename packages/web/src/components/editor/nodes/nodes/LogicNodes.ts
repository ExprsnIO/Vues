/**
 * Logic Nodes
 * Boolean logic, conditionals, and utility nodes
 */

import type { NodeTypeDefinition } from '../engine/NodeTypes';

/**
 * Boolean Constant Node
 */
export const BooleanNode: NodeTypeDefinition = {
  type: 'logic.boolean',
  name: 'Boolean',
  category: 'input',
  description: 'A constant boolean value',
  inputs: [],
  outputs: [
    { id: 'value', name: 'Value', dataType: 'boolean', direction: 'output' },
  ],
  parameters: [
    {
      id: 'value',
      name: 'Value',
      type: 'boolean',
      defaultValue: false,
    },
  ],
  execute: (_, parameters) => ({
    value: parameters.value as boolean,
  }),
};

/**
 * Compare Node
 */
export const CompareNode: NodeTypeDefinition = {
  type: 'logic.compare',
  name: 'Compare',
  category: 'logic',
  description: 'Compares two values',
  inputs: [
    { id: 'a', name: 'A', dataType: 'number', direction: 'input', defaultValue: 0 },
    { id: 'b', name: 'B', dataType: 'number', direction: 'input', defaultValue: 0 },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'boolean', direction: 'output' },
  ],
  parameters: [
    {
      id: 'operation',
      name: 'Operation',
      type: 'select',
      defaultValue: 'equal',
      options: [
        { label: 'Equal (=)', value: 'equal' },
        { label: 'Not Equal (≠)', value: 'notEqual' },
        { label: 'Greater Than (>)', value: 'greater' },
        { label: 'Less Than (<)', value: 'less' },
        { label: 'Greater or Equal (≥)', value: 'greaterEqual' },
        { label: 'Less or Equal (≤)', value: 'lessEqual' },
      ],
    },
  ],
  execute: (inputs, parameters) => {
    const a = inputs.a as number;
    const b = inputs.b as number;
    const operation = parameters.operation as string;

    let result: boolean;
    switch (operation) {
      case 'equal':
        result = Math.abs(a - b) < 0.0001;
        break;
      case 'notEqual':
        result = Math.abs(a - b) >= 0.0001;
        break;
      case 'greater':
        result = a > b;
        break;
      case 'less':
        result = a < b;
        break;
      case 'greaterEqual':
        result = a >= b;
        break;
      case 'lessEqual':
        result = a <= b;
        break;
      default:
        result = false;
    }

    return { result };
  },
};

/**
 * AND Node
 */
export const AndNode: NodeTypeDefinition = {
  type: 'logic.and',
  name: 'AND',
  category: 'logic',
  description: 'Logical AND of two booleans',
  inputs: [
    { id: 'a', name: 'A', dataType: 'boolean', direction: 'input', defaultValue: false },
    { id: 'b', name: 'B', dataType: 'boolean', direction: 'input', defaultValue: false },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'boolean', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => ({
    result: (inputs.a as boolean) && (inputs.b as boolean),
  }),
};

/**
 * OR Node
 */
export const OrNode: NodeTypeDefinition = {
  type: 'logic.or',
  name: 'OR',
  category: 'logic',
  description: 'Logical OR of two booleans',
  inputs: [
    { id: 'a', name: 'A', dataType: 'boolean', direction: 'input', defaultValue: false },
    { id: 'b', name: 'B', dataType: 'boolean', direction: 'input', defaultValue: false },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'boolean', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => ({
    result: (inputs.a as boolean) || (inputs.b as boolean),
  }),
};

/**
 * NOT Node
 */
export const NotNode: NodeTypeDefinition = {
  type: 'logic.not',
  name: 'NOT',
  category: 'logic',
  description: 'Logical NOT of a boolean',
  inputs: [
    { id: 'value', name: 'Value', dataType: 'boolean', direction: 'input', defaultValue: false },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'boolean', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => ({
    result: !(inputs.value as boolean),
  }),
};

/**
 * XOR Node
 */
export const XorNode: NodeTypeDefinition = {
  type: 'logic.xor',
  name: 'XOR',
  category: 'logic',
  description: 'Logical XOR of two booleans',
  inputs: [
    { id: 'a', name: 'A', dataType: 'boolean', direction: 'input', defaultValue: false },
    { id: 'b', name: 'B', dataType: 'boolean', direction: 'input', defaultValue: false },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'boolean', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => ({
    result: (inputs.a as boolean) !== (inputs.b as boolean),
  }),
};

/**
 * Switch Node
 */
export const SwitchNode: NodeTypeDefinition = {
  type: 'logic.switch',
  name: 'Switch',
  category: 'logic',
  description: 'Selects between two values based on condition',
  inputs: [
    { id: 'condition', name: 'Condition', dataType: 'boolean', direction: 'input', defaultValue: false },
    { id: 'ifTrue', name: 'If True', dataType: 'any', direction: 'input', defaultValue: 1 },
    { id: 'ifFalse', name: 'If False', dataType: 'any', direction: 'input', defaultValue: 0 },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'any', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => ({
    result: (inputs.condition as boolean) ? inputs.ifTrue : inputs.ifFalse,
  }),
};

/**
 * In Range Node
 */
export const InRangeNode: NodeTypeDefinition = {
  type: 'logic.inRange',
  name: 'In Range',
  category: 'logic',
  description: 'Checks if a value is within a range',
  inputs: [
    { id: 'value', name: 'Value', dataType: 'number', direction: 'input', defaultValue: 0.5 },
    { id: 'min', name: 'Min', dataType: 'number', direction: 'input', defaultValue: 0 },
    { id: 'max', name: 'Max', dataType: 'number', direction: 'input', defaultValue: 1 },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'boolean', direction: 'output' },
  ],
  parameters: [
    {
      id: 'inclusive',
      name: 'Inclusive',
      type: 'boolean',
      defaultValue: true,
    },
  ],
  execute: (inputs, parameters) => {
    const value = inputs.value as number;
    const min = inputs.min as number;
    const max = inputs.max as number;
    const inclusive = parameters.inclusive as boolean;

    let result: boolean;
    if (inclusive) {
      result = value >= min && value <= max;
    } else {
      result = value > min && value < max;
    }

    return { result };
  },
};

/**
 * Step Node
 */
export const StepNode: NodeTypeDefinition = {
  type: 'logic.step',
  name: 'Step',
  category: 'logic',
  description: 'Returns 0 or 1 based on threshold',
  inputs: [
    { id: 'value', name: 'Value', dataType: 'number', direction: 'input', defaultValue: 0.5 },
    { id: 'threshold', name: 'Threshold', dataType: 'number', direction: 'input', defaultValue: 0.5 },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'number', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => ({
    result: (inputs.value as number) >= (inputs.threshold as number) ? 1 : 0,
  }),
};

/**
 * Smoothstep Node
 */
export const SmoothstepNode: NodeTypeDefinition = {
  type: 'logic.smoothstep',
  name: 'Smoothstep',
  category: 'logic',
  description: 'Smooth interpolation between 0 and 1',
  inputs: [
    { id: 'value', name: 'Value', dataType: 'number', direction: 'input', defaultValue: 0.5 },
    { id: 'edge0', name: 'Edge 0', dataType: 'number', direction: 'input', defaultValue: 0 },
    { id: 'edge1', name: 'Edge 1', dataType: 'number', direction: 'input', defaultValue: 1 },
  ],
  outputs: [
    { id: 'result', name: 'Result', dataType: 'number', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => {
    const x = inputs.value as number;
    const edge0 = inputs.edge0 as number;
    const edge1 = inputs.edge1 as number;

    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return { result: t * t * (3 - 2 * t) };
  },
};

/**
 * String Constant Node
 */
export const StringNode: NodeTypeDefinition = {
  type: 'logic.string',
  name: 'String',
  category: 'input',
  description: 'A constant string value',
  inputs: [],
  outputs: [
    { id: 'value', name: 'Value', dataType: 'string', direction: 'output' },
  ],
  parameters: [
    {
      id: 'value',
      name: 'Value',
      type: 'string',
      defaultValue: '',
    },
  ],
  execute: (_, parameters) => ({
    value: parameters.value as string,
  }),
};

/**
 * Debug Node
 */
export const DebugNode: NodeTypeDefinition = {
  type: 'logic.debug',
  name: 'Debug',
  category: 'utility',
  description: 'Displays input value for debugging',
  inputs: [
    { id: 'value', name: 'Value', dataType: 'any', direction: 'input' },
  ],
  outputs: [
    { id: 'value', name: 'Value', dataType: 'any', direction: 'output' },
  ],
  parameters: [
    {
      id: 'label',
      name: 'Label',
      type: 'string',
      defaultValue: 'Debug',
    },
  ],
  execute: (inputs, parameters) => {
    const label = parameters.label as string;
    console.log(`[Node Debug: ${label}]`, inputs.value);
    return { value: inputs.value };
  },
};

/**
 * Comment Node
 */
export const CommentNode: NodeTypeDefinition = {
  type: 'logic.comment',
  name: 'Comment',
  category: 'utility',
  description: 'A comment node for documentation',
  inputs: [],
  outputs: [],
  parameters: [
    {
      id: 'text',
      name: 'Text',
      type: 'string',
      defaultValue: 'Add your comment here',
    },
  ],
  execute: () => ({}),
};

/**
 * Reroute Node
 */
export const RerouteNode: NodeTypeDefinition = {
  type: 'logic.reroute',
  name: 'Reroute',
  category: 'utility',
  description: 'Passes through a value (for organization)',
  inputs: [
    { id: 'input', name: 'Input', dataType: 'any', direction: 'input' },
  ],
  outputs: [
    { id: 'output', name: 'Output', dataType: 'any', direction: 'output' },
  ],
  parameters: [],
  execute: (inputs) => ({
    output: inputs.input,
  }),
};

/**
 * All logic nodes
 */
export const logicNodes: NodeTypeDefinition[] = [
  BooleanNode,
  StringNode,
  CompareNode,
  AndNode,
  OrNode,
  NotNode,
  XorNode,
  SwitchNode,
  InRangeNode,
  StepNode,
  SmoothstepNode,
  DebugNode,
  CommentNode,
  RerouteNode,
];
