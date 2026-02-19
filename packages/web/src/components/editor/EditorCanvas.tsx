'use client';

import { useRef, useEffect, useState, useCallback } from 'react';

interface EditorCanvasProps {
  zoom: number;
  currentFrame: number;
  selectedTool: 'select' | 'move' | 'scale' | 'rotate';
}

interface CanvasElement {
  id: string;
  type: 'video' | 'image' | 'text' | 'shape';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  content?: string;
  color?: string;
}

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;

export function EditorCanvas({ zoom, currentFrame, selectedTool }: EditorCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [elements, setElements] = useState<CanvasElement[]>([
    // Demo elements
    {
      id: '1',
      type: 'shape',
      x: 340,
      y: 760,
      width: 400,
      height: 400,
      rotation: 0,
      opacity: 1,
      color: '#6366f1',
    },
    {
      id: '2',
      type: 'text',
      x: 440,
      y: 500,
      width: 200,
      height: 60,
      rotation: 0,
      opacity: 1,
      content: 'Sample Text',
      color: '#ffffff',
    },
  ]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Draw canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw elements
    elements.forEach((element) => {
      ctx.save();
      ctx.globalAlpha = element.opacity;
      ctx.translate(element.x + element.width / 2, element.y + element.height / 2);
      ctx.rotate((element.rotation * Math.PI) / 180);
      ctx.translate(-element.width / 2, -element.height / 2);

      if (element.type === 'shape') {
        ctx.fillStyle = element.color || '#6366f1';
        ctx.beginPath();
        ctx.roundRect(0, 0, element.width, element.height, 16);
        ctx.fill();
      } else if (element.type === 'text') {
        ctx.fillStyle = element.color || '#ffffff';
        ctx.font = 'bold 48px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(element.content || '', element.width / 2, element.height / 2);
      }

      ctx.restore();

      // Draw selection box
      if (selectedElement === element.id) {
        ctx.save();
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 4]);
        ctx.translate(element.x + element.width / 2, element.y + element.height / 2);
        ctx.rotate((element.rotation * Math.PI) / 180);
        ctx.strokeRect(-element.width / 2 - 4, -element.height / 2 - 4, element.width + 8, element.height + 8);

        // Draw handles
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2;
        const handleSize = 10;
        const handles = [
          [-element.width / 2, -element.height / 2],
          [element.width / 2, -element.height / 2],
          [-element.width / 2, element.height / 2],
          [element.width / 2, element.height / 2],
        ];
        handles.forEach(([hx, hy]) => {
          ctx.beginPath();
          ctx.arc(hx, hy, handleSize / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });

        ctx.restore();
      }
    });

    // Draw safe zone guides
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    const margin = 60;
    ctx.strokeRect(margin, margin, CANVAS_WIDTH - margin * 2, CANVAS_HEIGHT - margin * 2);

    // Draw center guides
    ctx.beginPath();
    ctx.moveTo(CANVAS_WIDTH / 2, 0);
    ctx.lineTo(CANVAS_WIDTH / 2, CANVAS_HEIGHT);
    ctx.moveTo(0, CANVAS_HEIGHT / 2);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT / 2);
    ctx.stroke();
  }, [elements, selectedElement]);

  useEffect(() => {
    draw();
  }, [draw, currentFrame]);

  // Handle mouse events for element manipulation
  const getMousePos = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };

      const rect = canvas.getBoundingClientRect();
      const scaleX = CANVAS_WIDTH / rect.width;
      const scaleY = CANVAS_HEIGHT / rect.height;

      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    },
    []
  );

  const hitTest = useCallback(
    (x: number, y: number): CanvasElement | null => {
      // Check elements in reverse order (top to bottom)
      for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i];
        if (x >= el.x && x <= el.x + el.width && y >= el.y && y <= el.y + el.height) {
          return el;
        }
      }
      return null;
    },
    [elements]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const pos = getMousePos(e);
      const hit = hitTest(pos.x, pos.y);

      if (hit) {
        setSelectedElement(hit.id);
        if (selectedTool === 'select' || selectedTool === 'move') {
          setIsDragging(true);
          setDragOffset({ x: pos.x - hit.x, y: pos.y - hit.y });
        }
      } else {
        setSelectedElement(null);
      }
    },
    [getMousePos, hitTest, selectedTool]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDragging || !selectedElement) return;

      const pos = getMousePos(e);
      setElements((prev) =>
        prev.map((el) =>
          el.id === selectedElement
            ? { ...el, x: pos.x - dragOffset.x, y: pos.y - dragOffset.y }
            : el
        )
      );
    },
    [isDragging, selectedElement, getMousePos, dragOffset]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Calculate scale to fit canvas in container
  const scale = zoom / 100;

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center overflow-auto"
    >
      <div
        className="relative"
        style={{
          transform: `scale(${scale * 0.4})`,
          transformOrigin: 'center center',
        }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="rounded-lg shadow-2xl cursor-crosshair"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
        {/* Canvas size indicator */}
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs text-text-muted whitespace-nowrap">
          {CANVAS_WIDTH} × {CANVAS_HEIGHT}
        </div>
      </div>
    </div>
  );
}
