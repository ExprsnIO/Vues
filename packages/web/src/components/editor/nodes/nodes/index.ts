/**
 * Node Definitions
 * Exports all node types and registration
 */

import { registerNodeType } from '../engine/NodeEngine';
import type { NodeTypeDefinition } from '../engine/NodeTypes';

import { mathNodes } from './MathNodes';
import { colorNodes } from './ColorNodes';
import { transformNodes } from './TransformNodes';
import { effectNodes } from './EffectNodes';
import { logicNodes } from './LogicNodes';

// Export all node arrays
export { mathNodes } from './MathNodes';
export { colorNodes } from './ColorNodes';
export { transformNodes } from './TransformNodes';
export { effectNodes } from './EffectNodes';
export { logicNodes } from './LogicNodes';

/**
 * All available nodes
 */
export const allNodes: NodeTypeDefinition[] = [
  ...mathNodes,
  ...colorNodes,
  ...transformNodes,
  ...effectNodes,
  ...logicNodes,
];

/**
 * Register all built-in node types
 */
export function registerAllNodes(): void {
  for (const node of allNodes) {
    registerNodeType(node);
  }
}

/**
 * Get nodes by category
 */
export function getNodesByCategory(): Map<string, NodeTypeDefinition[]> {
  const categories = new Map<string, NodeTypeDefinition[]>();

  for (const node of allNodes) {
    const existing = categories.get(node.category) || [];
    existing.push(node);
    categories.set(node.category, existing);
  }

  return categories;
}

/**
 * Category display names
 */
export const categoryNames: Record<string, string> = {
  input: 'Input',
  output: 'Output',
  math: 'Math',
  color: 'Color',
  transform: 'Transform',
  effect: 'Effects',
  logic: 'Logic',
  utility: 'Utility',
};

/**
 * Category order for display
 */
export const categoryOrder = [
  'input',
  'output',
  'math',
  'color',
  'transform',
  'effect',
  'logic',
  'utility',
];
