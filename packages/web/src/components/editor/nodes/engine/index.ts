/**
 * Node Engine
 * Core execution engine for node graphs
 */

export type {
  PortDataType,
  PortDirection,
  PortDefinition,
  ParameterDefinition,
  NodeTypeDefinition,
  NodeInstance,
  NodeConnection,
  NodeGraph,
  ExecutionContext,
  ExecutionResult,
} from './NodeTypes';

export {
  arePortsCompatible,
  convertValue,
  getDefaultValue,
  dataTypeColors,
} from './NodeTypes';

export {
  topologicalSort,
  getUpstreamNodes,
  getDownstreamNodes,
  getAffectedNodes,
} from './TopologicalSort';

export {
  wouldCreateCycle,
  findAllCycles,
  getNodesInCycles,
  isNodeInCycle,
  suggestCycleBreaks,
  validateGraph,
} from './CycleDetector';

export {
  NodeEngine,
  registerNodeType,
  getNodeType,
  getAllNodeTypes,
  getNodeTypesByCategory,
  createNodeInstance,
  createConnection,
  getNodeEngine,
} from './NodeEngine';
