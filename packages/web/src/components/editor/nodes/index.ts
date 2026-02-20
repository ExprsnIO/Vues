/**
 * Node-based Editor
 * Visual effect pipeline editor for Vues
 */

// Engine exports
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
} from './engine';

export {
  NodeEngine,
  registerNodeType,
  getNodeType,
  getAllNodeTypes,
  getNodeTypesByCategory,
  createNodeInstance,
  createConnection,
  getNodeEngine,
  arePortsCompatible,
  convertValue,
  getDefaultValue,
  dataTypeColors,
  topologicalSort,
  getUpstreamNodes,
  getDownstreamNodes,
  getAffectedNodes,
  wouldCreateCycle,
  findAllCycles,
  getNodesInCycles,
  isNodeInCycle,
  suggestCycleBreaks,
  validateGraph,
} from './engine';

// Node definitions exports
export {
  allNodes,
  registerAllNodes,
  getNodesByCategory,
  categoryNames,
  categoryOrder,
  mathNodes,
  colorNodes,
  transformNodes,
  effectNodes,
  logicNodes,
} from './nodes';

// UI component exports
export {
  Port,
  Node,
  Connection,
  PendingConnection,
  ConnectionLayer,
  NodeLibrary,
  NodeEditor,
} from './ui';
