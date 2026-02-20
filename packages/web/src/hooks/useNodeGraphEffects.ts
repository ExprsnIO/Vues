'use client';

import { useMemo, useEffect, useRef } from 'react';
import { getNodeEngine, registerNodeType } from '@/components/editor/nodes/engine/NodeEngine';
import type { NodeInstance, NodeConnection, ExecutionContext } from '@/components/editor/nodes/engine/NodeTypes';
import type { EffectInstance } from '@/components/editor/effects';

// Import all node types to register them
import { mathNodes } from '@/components/editor/nodes/nodes/MathNodes';
import { colorNodes } from '@/components/editor/nodes/nodes/ColorNodes';
import { transformNodes } from '@/components/editor/nodes/nodes/TransformNodes';
import { effectNodes } from '@/components/editor/nodes/nodes/EffectNodes';
import { logicNodes } from '@/components/editor/nodes/nodes/LogicNodes';

// Track if nodes have been registered
let nodesRegistered = false;

function registerAllNodes() {
  if (nodesRegistered) return;

  const allNodes = [
    ...mathNodes,
    ...colorNodes,
    ...transformNodes,
    ...effectNodes,
    ...logicNodes,
  ];

  for (const node of allNodes) {
    registerNodeType(node);
  }

  nodesRegistered = true;
}

/**
 * Effect output from a node
 */
interface NodeEffectOutput {
  type: string;
  uniforms: Record<string, unknown>;
}

/**
 * Convert node effect output to EffectInstance
 */
function nodeEffectToInstance(
  nodeId: string,
  output: NodeEffectOutput,
  order: number
): EffectInstance {
  // Map node effect type to actual effect ID
  const effectIdMap: Record<string, string> = {
    glitch: 'glitch',
    vhs: 'vhs',
    filmGrain: 'filmGrain',
    chromaticAberration: 'chromaticAberration',
    bloom: 'bloom',
    crt: 'crt',
    blur: 'blur',
    sharpen: 'sharpen',
    vignette: 'vignette',
    pixelate: 'pixelate',
  };

  const effectId = effectIdMap[output.type] || output.type;

  return {
    id: `node-effect-${nodeId}`,
    effectId,
    enabled: true,
    parameters: output.uniforms as Record<string, unknown>,
    order,
  };
}

/**
 * Process effect chain output
 */
function processEffectChain(
  nodeId: string,
  chain: { effects: NodeEffectOutput[] },
  startOrder: number
): EffectInstance[] {
  return chain.effects
    .filter(Boolean)
    .map((effect, index) => nodeEffectToInstance(
      `${nodeId}-${index}`,
      effect,
      startOrder + index
    ));
}

export interface UseNodeGraphEffectsOptions {
  nodes: NodeInstance[];
  connections: NodeConnection[];
  currentTime: number;
  currentFrame: number;
  fps: number;
  duration: number;
  width: number;
  height: number;
  enabled?: boolean;
}

export interface NodeGraphEffectsResult {
  effects: EffectInstance[];
  outputs: Record<string, unknown>;
  executionTime: number;
  errors: Array<{ nodeId: string; message: string }>;
}

/**
 * Hook that executes a node graph and extracts effect instances
 */
export function useNodeGraphEffects(options: UseNodeGraphEffectsOptions): NodeGraphEffectsResult {
  const {
    nodes,
    connections,
    currentTime,
    currentFrame,
    fps,
    duration,
    width,
    height,
    enabled = true,
  } = options;

  const engineRef = useRef(getNodeEngine());

  // Register nodes on first use
  useEffect(() => {
    registerAllNodes();
  }, []);

  // Execute graph and extract effects
  const result = useMemo(() => {
    if (!enabled || nodes.length === 0) {
      return {
        effects: [],
        outputs: {},
        executionTime: 0,
        errors: [],
      };
    }

    const engine = engineRef.current;

    // Set graph
    engine.setGraph(nodes, connections);

    // Set context
    const context: Partial<ExecutionContext> = {
      time: currentTime,
      frame: currentFrame,
      fps,
      duration,
      resolution: { width, height },
    };
    engine.setContext(context);

    // Execute
    const execResult = engine.execute();

    // Extract effect instances from outputs
    const effects: EffectInstance[] = [];
    let effectOrder = 0;

    for (const [key, value] of Object.entries(execResult.outputs)) {
      if (!value || typeof value !== 'object') continue;

      const output = value as Record<string, unknown>;

      // Check if it's a single effect
      if ('type' in output && 'uniforms' in output && typeof output.type === 'string') {
        effects.push(nodeEffectToInstance(key, output as unknown as NodeEffectOutput, effectOrder++));
      }

      // Check if it's an effect chain
      if (output.type === 'effectChain' && 'effects' in output) {
        const chainEffects = processEffectChain(
          key,
          output as unknown as { effects: NodeEffectOutput[] },
          effectOrder
        );
        effects.push(...chainEffects);
        effectOrder += chainEffects.length;
      }
    }

    // Sort by order
    effects.sort((a, b) => a.order - b.order);

    return {
      effects,
      outputs: execResult.outputs,
      executionTime: execResult.executionTime,
      errors: execResult.errors || [],
    };
  }, [nodes, connections, currentTime, currentFrame, fps, duration, width, height, enabled]);

  return result;
}

/**
 * Get a specific output value from the node graph
 */
export function useNodeOutput(
  nodes: NodeInstance[],
  connections: NodeConnection[],
  nodeId: string,
  portId: string,
  context: Partial<ExecutionContext>
): unknown {
  const engineRef = useRef(getNodeEngine());

  return useMemo(() => {
    if (nodes.length === 0) return undefined;

    const engine = engineRef.current;
    engine.setGraph(nodes, connections);
    engine.setContext(context);
    engine.execute();

    return engine.getPortValue(nodeId, portId);
  }, [nodes, connections, nodeId, portId, context]);
}
