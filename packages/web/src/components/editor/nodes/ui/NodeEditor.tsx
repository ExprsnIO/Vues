/**
 * NodeEditor Component
 * Main canvas for the node-based visual editor
 */

'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { NodeInstance, NodeConnection, PortDataType, ExecutionContext } from '../engine/NodeTypes';
import {
  NodeEngine,
  getNodeEngine,
  createNodeInstance,
  createConnection,
  getNodeType,
  arePortsCompatible,
} from '../engine/NodeEngine';
import { wouldCreateCycle } from '../engine/CycleDetector';
import { registerAllNodes } from '../nodes';
import { Node } from './Node';
import { ConnectionLayer } from './Connection';
import { NodeLibrary } from './NodeLibrary';

interface NodeEditorProps {
  initialNodes?: NodeInstance[];
  initialConnections?: NodeConnection[];
  onChange?: (nodes: NodeInstance[], connections: NodeConnection[]) => void;
  context?: Partial<ExecutionContext>;
  readOnly?: boolean;
}

interface PendingConnection {
  sourceNodeId: string;
  sourcePortId: string;
  sourceDirection: 'input' | 'output';
  sourcePosition: { x: number; y: number };
  sourceDataType: PortDataType;
}

export function NodeEditor({
  initialNodes = [],
  initialConnections = [],
  onChange,
  context,
  readOnly = false,
}: NodeEditorProps) {
  // State
  const [nodes, setNodes] = useState<NodeInstance[]>(initialNodes);
  const [connections, setConnections] = useState<NodeConnection[]>(initialConnections);
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [selectedConnections, setSelectedConnections] = useState<Set<string>>(new Set());
  const [hoveringConnection, setHoveringConnection] = useState<string | null>(null);
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [showLibrary, setShowLibrary] = useState(true);

  const canvasRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<NodeEngine>(getNodeEngine());

  // Initialize nodes
  useEffect(() => {
    registerAllNodes();
  }, []);

  // Update engine when graph changes
  useEffect(() => {
    engineRef.current.setGraph(nodes, connections);
    if (context) {
      engineRef.current.setContext(context);
    }
    onChange?.(nodes, connections);
  }, [nodes, connections, context, onChange]);

  // Get port position for a node
  const getPortPosition = useCallback(
    (nodeId: string, portId: string, direction: 'input' | 'output'): { x: number; y: number } => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return { x: 0, y: 0 };

      const nodeType = getNodeType(node.type);
      if (!nodeType) return { x: 0, y: 0 };

      const ports = direction === 'input' ? nodeType.inputs : nodeType.outputs;
      const portIndex = ports.findIndex((p) => p.id === portId);
      if (portIndex === -1) return { x: 0, y: 0 };

      // Calculate approximate port position
      const nodeWidth = 180;
      const headerHeight = 36;
      const portSpacing = 28;

      return {
        x: node.position.x + (direction === 'input' ? 6 : nodeWidth - 6),
        y: node.position.y + headerHeight + 12 + portIndex * portSpacing + 6,
      };
    },
    [nodes]
  );

  // Get connected ports
  const connectedPorts = useMemo(() => {
    const connected = new Set<string>();
    for (const conn of connections) {
      connected.add(`${conn.sourceNodeId}:${conn.sourcePortId}`);
      connected.add(`${conn.targetNodeId}:${conn.targetPortId}`);
    }
    return connected;
  }, [connections]);

  // Connection data for rendering
  const connectionData = useMemo(() => {
    return connections.map((conn) => {
      const sourceNode = nodes.find((n) => n.id === conn.sourceNodeId);
      const sourceNodeType = sourceNode ? getNodeType(sourceNode.type) : null;
      const sourcePort = sourceNodeType?.outputs.find((p) => p.id === conn.sourcePortId);

      return {
        connection: conn,
        sourcePosition: getPortPosition(conn.sourceNodeId, conn.sourcePortId, 'output'),
        targetPosition: getPortPosition(conn.targetNodeId, conn.targetPortId, 'input'),
        dataType: sourcePort?.dataType || 'any',
      };
    });
  }, [connections, nodes, getPortPosition]);

  // Pending connection for rendering
  const pendingConnectionData = useMemo(() => {
    if (!pendingConnection) return null;

    const isFromOutput = pendingConnection.sourceDirection === 'output';

    return {
      sourcePosition: isFromOutput
        ? pendingConnection.sourcePosition
        : mousePosition,
      targetPosition: isFromOutput
        ? mousePosition
        : pendingConnection.sourcePosition,
      dataType: pendingConnection.sourceDataType,
      valid: true, // Will be updated on hover
    };
  }, [pendingConnection, mousePosition]);

  // Handle node selection
  const handleNodeSelect = useCallback((nodeId: string, addToSelection: boolean) => {
    if (readOnly) return;

    setSelectedConnections(new Set());

    if (addToSelection) {
      setSelectedNodes((prev) => {
        const next = new Set(prev);
        if (next.has(nodeId)) {
          next.delete(nodeId);
        } else {
          next.add(nodeId);
        }
        return next;
      });
    } else {
      setSelectedNodes(new Set([nodeId]));
    }
  }, [readOnly]);

  // Handle node movement
  const handleNodeMove = useCallback(
    (nodeId: string, delta: { x: number; y: number }) => {
      if (readOnly) return;

      setNodes((prev) =>
        prev.map((node) => {
          if (selectedNodes.has(node.id) || node.id === nodeId) {
            return {
              ...node,
              position: {
                x: node.position.x + delta.x / zoom,
                y: node.position.y + delta.y / zoom,
              },
            };
          }
          return node;
        })
      );
    },
    [selectedNodes, zoom, readOnly]
  );

  // Handle starting a connection
  const handleStartConnection = useCallback(
    (
      nodeId: string,
      portId: string,
      direction: 'input' | 'output',
      element: HTMLElement
    ) => {
      if (readOnly) return;

      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      const nodeType = getNodeType(node.type);
      if (!nodeType) return;

      const ports = direction === 'input' ? nodeType.inputs : nodeType.outputs;
      const port = ports.find((p) => p.id === portId);
      if (!port) return;

      const rect = element.getBoundingClientRect();
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) return;

      setPendingConnection({
        sourceNodeId: nodeId,
        sourcePortId: portId,
        sourceDirection: direction,
        sourcePosition: {
          x: (rect.left + rect.width / 2 - canvasRect.left - pan.x) / zoom,
          y: (rect.top + rect.height / 2 - canvasRect.top - pan.y) / zoom,
        },
        sourceDataType: port.dataType,
      });
    },
    [nodes, pan, zoom, readOnly]
  );

  // Handle ending a connection
  const handleEndConnection = useCallback(
    (nodeId: string, portId: string) => {
      if (!pendingConnection || readOnly) {
        setPendingConnection(null);
        return;
      }

      const targetNode = nodes.find((n) => n.id === nodeId);
      if (!targetNode) {
        setPendingConnection(null);
        return;
      }

      const targetNodeType = getNodeType(targetNode.type);
      if (!targetNodeType) {
        setPendingConnection(null);
        return;
      }

      // Determine source and target based on direction
      let sourceNodeId: string;
      let sourcePortId: string;
      let targetNodeId: string;
      let targetPortId: string;

      if (pendingConnection.sourceDirection === 'output') {
        sourceNodeId = pendingConnection.sourceNodeId;
        sourcePortId = pendingConnection.sourcePortId;
        targetNodeId = nodeId;
        targetPortId = portId;
      } else {
        sourceNodeId = nodeId;
        sourcePortId = portId;
        targetNodeId = pendingConnection.sourceNodeId;
        targetPortId = pendingConnection.sourcePortId;
      }

      // Validate connection
      const sourceNode = nodes.find((n) => n.id === sourceNodeId);
      const sourceNodeType = sourceNode ? getNodeType(sourceNode.type) : null;
      const sourcePort = sourceNodeType?.outputs.find((p) => p.id === sourcePortId);
      const targetPort = targetNodeType.inputs.find((p) => p.id === targetPortId);

      if (!sourcePort || !targetPort) {
        setPendingConnection(null);
        return;
      }

      // Check port compatibility
      if (!arePortsCompatible(sourcePort.dataType, targetPort.dataType)) {
        setPendingConnection(null);
        return;
      }

      // Check for cycles
      if (wouldCreateCycle(nodes, connections, { sourceNodeId, targetNodeId })) {
        setPendingConnection(null);
        return;
      }

      // Check if connection already exists
      const existingConnection = connections.find(
        (c) =>
          c.sourceNodeId === sourceNodeId &&
          c.sourcePortId === sourcePortId &&
          c.targetNodeId === targetNodeId &&
          c.targetPortId === targetPortId
      );

      if (existingConnection) {
        setPendingConnection(null);
        return;
      }

      // Remove existing connection to target port (unless multiple allowed)
      if (!targetPort.multiple) {
        setConnections((prev) =>
          prev.filter(
            (c) => !(c.targetNodeId === targetNodeId && c.targetPortId === targetPortId)
          )
        );
      }

      // Create new connection
      const newConnection = createConnection(
        sourceNodeId,
        sourcePortId,
        targetNodeId,
        targetPortId
      );

      setConnections((prev) => [...prev, newConnection]);
      setPendingConnection(null);
    },
    [pendingConnection, nodes, connections, readOnly]
  );

  // Handle port hover
  const handlePortHover = useCallback((nodeId: string, portId: string, hovering: boolean) => {
    // Could add visual feedback for valid drop targets
  }, []);

  // Handle parameter change
  const handleParameterChange = useCallback(
    (nodeId: string, parameterId: string, value: unknown) => {
      if (readOnly) return;

      setNodes((prev) =>
        prev.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              parameters: {
                ...node.parameters,
                [parameterId]: value,
              },
            };
          }
          return node;
        })
      );
    },
    [readOnly]
  );

  // Handle node deletion
  const handleNodeDelete = useCallback(
    (nodeId: string) => {
      if (readOnly) return;

      const nodesToDelete = selectedNodes.has(nodeId)
        ? selectedNodes
        : new Set([nodeId]);

      setNodes((prev) => prev.filter((n) => !nodesToDelete.has(n.id)));
      setConnections((prev) =>
        prev.filter(
          (c) => !nodesToDelete.has(c.sourceNodeId) && !nodesToDelete.has(c.targetNodeId)
        )
      );
      setSelectedNodes(new Set());
    },
    [selectedNodes, readOnly]
  );

  // Handle node collapse
  const handleNodeCollapse = useCallback((nodeId: string) => {
    setNodes((prev) =>
      prev.map((node) => {
        if (node.id === nodeId) {
          return { ...node, collapsed: !node.collapsed };
        }
        return node;
      })
    );
  }, []);

  // Handle connection click
  const handleConnectionClick = useCallback(
    (connectionId: string) => {
      if (readOnly) return;

      setSelectedNodes(new Set());
      setSelectedConnections(new Set([connectionId]));
    },
    [readOnly]
  );

  // Handle adding a node
  const handleAddNode = useCallback(
    (nodeType: string, position?: { x: number; y: number }) => {
      if (readOnly) return;

      const canvasRect = canvasRef.current?.getBoundingClientRect();
      const nodePosition = position || {
        x: canvasRect
          ? (canvasRect.width / 2 - pan.x) / zoom
          : 400,
        y: canvasRect
          ? (canvasRect.height / 2 - pan.y) / zoom
          : 300,
      };

      const newNode = createNodeInstance(nodeType, nodePosition);
      if (newNode) {
        setNodes((prev) => [...prev, newNode]);
        setSelectedNodes(new Set([newNode.id]));
      }
    },
    [pan, zoom, readOnly]
  );

  // Handle canvas mouse events
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        // Middle mouse button or Alt+click for panning
        setIsPanning(true);
        e.preventDefault();
      } else if (e.button === 0) {
        // Left click on canvas - deselect all
        if ((e.target as HTMLElement) === canvasRef.current) {
          setSelectedNodes(new Set());
          setSelectedConnections(new Set());
        }
      }
    },
    []
  );

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (canvasRect) {
        setMousePosition({
          x: (e.clientX - canvasRect.left - pan.x) / zoom,
          y: (e.clientY - canvasRect.top - pan.y) / zoom,
        });
      }

      if (isPanning) {
        setPan((prev) => ({
          x: prev.x + e.movementX,
          y: prev.y + e.movementY,
        }));
      }
    },
    [isPanning, pan, zoom]
  );

  const handleCanvasMouseUp = useCallback(() => {
    setIsPanning(false);
    if (pendingConnection) {
      setPendingConnection(null);
    }
  }, [pendingConnection]);

  // Handle context menu
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (readOnly) return;

      e.preventDefault();
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (canvasRect) {
        setContextMenuPosition({
          x: (e.clientX - canvasRect.left - pan.x) / zoom,
          y: (e.clientY - canvasRect.top - pan.y) / zoom,
        });
        setShowContextMenu(true);
      }
    },
    [pan, zoom, readOnly]
  );

  // Handle wheel for zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom((prev) => Math.min(2, Math.max(0.25, prev * delta)));
    } else {
      // Scroll to pan
      setPan((prev) => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }));
    }
  }, []);

  // Handle keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (readOnly) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedConnections.size > 0) {
          setConnections((prev) =>
            prev.filter((c) => !selectedConnections.has(c.id))
          );
          setSelectedConnections(new Set());
        } else if (selectedNodes.size > 0) {
          setNodes((prev) => prev.filter((n) => !selectedNodes.has(n.id)));
          setConnections((prev) =>
            prev.filter(
              (c) =>
                !selectedNodes.has(c.sourceNodeId) &&
                !selectedNodes.has(c.targetNodeId)
            )
          );
          setSelectedNodes(new Set());
        }
      }

      if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setSelectedNodes(new Set(nodes.map((n) => n.id)));
      }

      if (e.key === 'Escape') {
        setSelectedNodes(new Set());
        setSelectedConnections(new Set());
        setPendingConnection(null);
        setShowContextMenu(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodes, selectedConnections, nodes, readOnly]);

  // Handle drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const nodeType = e.dataTransfer.getData('application/node-type');
      if (nodeType) {
        const canvasRect = canvasRef.current?.getBoundingClientRect();
        if (canvasRect) {
          handleAddNode(nodeType, {
            x: (e.clientX - canvasRect.left - pan.x) / zoom,
            y: (e.clientY - canvasRect.top - pan.y) / zoom,
          });
        }
      }
    },
    [handleAddNode, pan, zoom]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  return (
    <div className="flex h-full w-full bg-gray-900">
      {/* Library Panel */}
      {showLibrary && !readOnly && (
        <NodeLibrary
          onAddNode={handleAddNode}
        />
      )}

      {/* Canvas */}
      <div className="relative flex-1 overflow-hidden">
        {/* Toolbar */}
        <div className="absolute left-2 top-2 z-10 flex gap-2">
          {!readOnly && (
            <button
              onClick={() => setShowLibrary(!showLibrary)}
              className="rounded bg-gray-700 px-3 py-1.5 text-sm text-white hover:bg-gray-600"
            >
              {showLibrary ? 'Hide Library' : 'Show Library'}
            </button>
          )}
          <button
            onClick={() => {
              setPan({ x: 0, y: 0 });
              setZoom(1);
            }}
            className="rounded bg-gray-700 px-3 py-1.5 text-sm text-white hover:bg-gray-600"
          >
            Reset View
          </button>
          <span className="rounded bg-gray-700 px-3 py-1.5 text-sm text-gray-300">
            {Math.round(zoom * 100)}%
          </span>
        </div>

        {/* Main Canvas */}
        <div
          ref={canvasRef}
          className={`h-full w-full ${isPanning ? 'cursor-grabbing' : 'cursor-default'}`}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          onContextMenu={handleContextMenu}
          onWheel={handleWheel}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          {/* Grid background */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `
                radial-gradient(circle, #374151 1px, transparent 1px)
              `,
              backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
              backgroundPosition: `${pan.x}px ${pan.y}px`,
            }}
          />

          {/* Transform container */}
          <div
            className="absolute"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
            }}
          >
            {/* Connections */}
            <ConnectionLayer
              connections={connectionData}
              selectedConnections={selectedConnections}
              hoveringConnection={hoveringConnection}
              pendingConnection={pendingConnectionData}
              onConnectionClick={handleConnectionClick}
            />

            {/* Nodes */}
            {nodes.map((node) => (
              <Node
                key={node.id}
                node={node}
                selected={selectedNodes.has(node.id)}
                connectedPorts={connectedPorts}
                onSelect={handleNodeSelect}
                onMove={handleNodeMove}
                onStartConnection={handleStartConnection}
                onEndConnection={handleEndConnection}
                onPortHover={handlePortHover}
                onParameterChange={handleParameterChange}
                onDelete={handleNodeDelete}
                onCollapse={handleNodeCollapse}
              />
            ))}
          </div>
        </div>

        {/* Context Menu */}
        {showContextMenu && !readOnly && (
          <NodeLibrary
            onAddNode={handleAddNode}
            onClose={() => setShowContextMenu(false)}
            position={contextMenuPosition}
            isContextMenu
          />
        )}
      </div>
    </div>
  );
}

export default NodeEditor;
