'use client';

import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useEditor } from '@/app/editor/page';
import type { EditorElement } from '@/app/editor/page';
import { effectEngine, type EffectInstance } from './effects';
import { builtinFilters } from './effects/filters';
import { expressionEngine } from '@/engine/scripting';

export function EditorCanvasEnhanced() {
  const { state, selectElement, updateElement, dispatch } = useEditor();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragElementId, setDragElementId] = useState<string | null>(null);
  const [effectsInitialized, setEffectsInitialized] = useState(false);

  const { project, selectedElementIds, selectedTool, currentFrame, zoom, showGuides, showSafeZone, nodeGraphEffects } = state;
  const { width: CANVAS_WIDTH, height: CANVAS_HEIGHT } = project;

  // Calculate current time in seconds
  const currentTime = useMemo(() => currentFrame / project.fps, [currentFrame, project.fps]);

  // Collect all active effects (global + per-element + node graph)
  const allActiveEffects = useMemo(() => {
    const effects: EffectInstance[] = [...(project.globalEffects || [])];

    // Add effects from visible elements
    const visibleElements = project.elements.filter(
      el => el.visible && currentFrame >= el.startFrame && currentFrame <= el.endFrame
    );

    visibleElements.forEach(el => {
      if (el.effects) {
        effects.push(...el.effects);
      }
    });

    // Add effects generated from node graph
    if (nodeGraphEffects && nodeGraphEffects.length > 0) {
      // Adjust order to place node graph effects after existing effects
      const maxOrder = effects.reduce((max, e) => Math.max(max, e.order), 0);
      const adjustedNodeEffects = nodeGraphEffects.map((e, idx) => ({
        ...e,
        order: maxOrder + 1 + idx,
      }));
      effects.push(...adjustedNodeEffects);
    }

    return effects.filter(e => e.enabled).sort((a, b) => a.order - b.order);
  }, [project.globalEffects, project.elements, currentFrame, nodeGraphEffects]);

  // Initialize effect engine
  useEffect(() => {
    if (glCanvasRef.current && !effectsInitialized) {
      try {
        effectEngine.initialize(glCanvasRef.current);

        // Register built-in filters
        builtinFilters.forEach(filter => {
          effectEngine.registerEffect(filter);
        });

        effectEngine.resize(CANVAS_WIDTH, CANVAS_HEIGHT);
        setEffectsInitialized(true);
      } catch (err) {
        console.warn('WebGL effects not available:', err);
      }
    }
  }, [effectsInitialized, CANVAS_WIDTH, CANVAS_HEIGHT]);

  // Resize effect engine when canvas size changes
  useEffect(() => {
    if (effectsInitialized) {
      effectEngine.resize(CANVAS_WIDTH, CANVAS_HEIGHT);
    }
  }, [CANVAS_WIDTH, CANVAS_HEIGHT, effectsInitialized]);

  // Create offscreen canvas for 2D rendering
  useEffect(() => {
    if (!offscreenCanvasRef.current ||
        offscreenCanvasRef.current.width !== CANVAS_WIDTH ||
        offscreenCanvasRef.current.height !== CANVAS_HEIGHT) {
      const offscreen = document.createElement('canvas');
      offscreen.width = CANVAS_WIDTH;
      offscreen.height = CANVAS_HEIGHT;
      offscreenCanvasRef.current = offscreen;
    }
  }, [CANVAS_WIDTH, CANVAS_HEIGHT]);

  // Interpolate keyframe values with expression support
  const getAnimatedValue = useCallback((element: EditorElement, property: string, defaultValue: number): number => {
    const keyframes = element.keyframes[property];
    if (!keyframes || keyframes.length === 0) return defaultValue;

    // Find surrounding keyframes
    let prevKf = keyframes[0];
    let nextKf = keyframes[keyframes.length - 1];

    for (let i = 0; i < keyframes.length; i++) {
      if (keyframes[i].frame <= currentFrame) {
        prevKf = keyframes[i];
      }
      if (keyframes[i].frame >= currentFrame && (nextKf.frame < currentFrame || keyframes[i].frame < nextKf.frame)) {
        nextKf = keyframes[i];
      }
    }

    // Calculate base interpolated value
    let interpolatedValue: number;
    if (prevKf.frame === nextKf.frame) {
      interpolatedValue = typeof prevKf.value === 'number' ? prevKf.value : defaultValue;
    } else {
      // Linear interpolation (TODO: apply easing function)
      const t = (currentFrame - prevKf.frame) / (nextKf.frame - prevKf.frame);
      const prevVal = typeof prevKf.value === 'number' ? prevKf.value : defaultValue;
      const nextVal = typeof nextKf.value === 'number' ? nextKf.value : defaultValue;
      interpolatedValue = prevVal + (nextVal - prevVal) * t;
    }

    // Check if current keyframe has an expression
    if (prevKf.expression) {
      try {
        const expressionResult = expressionEngine.evaluateNumber(prevKf.expression, {
          time: currentFrame / project.fps,
          frame: currentFrame,
          fps: project.fps,
          duration: project.duration / project.fps,
          value: interpolatedValue,
          propertyName: property,
          width: project.width,
          height: project.height,
          clipId: element.id,
          clipStartTime: element.startFrame / project.fps,
          clipEndTime: element.endFrame / project.fps,
          clipDuration: (element.endFrame - element.startFrame) / project.fps,
        }, interpolatedValue);

        return expressionResult;
      } catch {
        // If expression fails, return interpolated value
        return interpolatedValue;
      }
    }

    return interpolatedValue;
  }, [currentFrame, project.fps, project.duration, project.width, project.height]);

  // Draw scene to 2D canvas (offscreen)
  const drawScene = useCallback((ctx: CanvasRenderingContext2D) => {
    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw elements that are visible at current frame
    const visibleElements = project.elements.filter(
      el => el.visible && currentFrame >= el.startFrame && currentFrame <= el.endFrame
    );

    visibleElements.forEach((element) => {
      // Get animated values
      const opacity = getAnimatedValue(element, 'opacity', element.opacity);
      const rotation = getAnimatedValue(element, 'rotation', element.rotation);
      const scaleX = getAnimatedValue(element, 'scale.x', element.scale.x);
      const scaleY = getAnimatedValue(element, 'scale.y', element.scale.y);

      ctx.save();
      ctx.globalAlpha = opacity;

      // Apply blend mode
      if (element.blendMode && element.blendMode !== 'normal') {
        ctx.globalCompositeOperation = element.blendMode as GlobalCompositeOperation;
      }

      // Transform from center
      const centerX = element.x + element.width * element.anchor.x;
      const centerY = element.y + element.height * element.anchor.y;
      ctx.translate(centerX, centerY);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(scaleX, scaleY);
      ctx.translate(-element.width * element.anchor.x, -element.height * element.anchor.y);

      // Draw based on type
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
      } else if (element.type === 'image' && element.src) {
        // Would load and draw image here
        ctx.fillStyle = '#333';
        ctx.fillRect(0, 0, element.width, element.height);
        ctx.fillStyle = '#666';
        ctx.font = '24px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Image', element.width / 2, element.height / 2);
      }

      ctx.restore();
    });
  }, [project.elements, currentFrame, CANVAS_WIDTH, CANVAS_HEIGHT, getAnimatedValue]);

  // Draw overlays (selection, guides) - these should not be affected by effects
  const drawOverlays = useCallback((ctx: CanvasRenderingContext2D) => {
    const visibleElements = project.elements.filter(
      el => el.visible && currentFrame >= el.startFrame && currentFrame <= el.endFrame
    );

    visibleElements.forEach((element) => {
      // Draw selection box
      if (selectedElementIds.includes(element.id)) {
        const rotation = getAnimatedValue(element, 'rotation', element.rotation);
        const scaleX = getAnimatedValue(element, 'scale.x', element.scale.x);
        const scaleY = getAnimatedValue(element, 'scale.y', element.scale.y);

        const centerX = element.x + element.width * element.anchor.x;
        const centerY = element.y + element.height * element.anchor.y;

        ctx.save();
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 4]);
        ctx.translate(centerX, centerY);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.scale(scaleX, scaleY);

        const halfW = element.width * element.anchor.x;
        const halfH = element.height * element.anchor.y;
        ctx.strokeRect(
          -halfW - 4,
          -halfH - 4,
          element.width + 8,
          element.height + 8
        );

        // Draw handles
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2;
        const handleSize = 10;
        const handles = [
          [-halfW, -halfH],
          [element.width - halfW, -halfH],
          [-halfW, element.height - halfH],
          [element.width - halfW, element.height - halfH],
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

    // Draw guides
    if (showGuides) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      // Center guides
      ctx.beginPath();
      ctx.moveTo(CANVAS_WIDTH / 2, 0);
      ctx.lineTo(CANVAS_WIDTH / 2, CANVAS_HEIGHT);
      ctx.moveTo(0, CANVAS_HEIGHT / 2);
      ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT / 2);
      ctx.stroke();
    }

    // Draw safe zone
    if (showSafeZone) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      const margin = 60;
      ctx.strokeRect(margin, margin, CANVAS_WIDTH - margin * 2, CANVAS_HEIGHT - margin * 2);
    }
  }, [project.elements, selectedElementIds, currentFrame, CANVAS_WIDTH, CANVAS_HEIGHT, showGuides, showSafeZone, getAnimatedValue]);

  // Main draw function
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const glCanvas = glCanvasRef.current;
    const offscreen = offscreenCanvasRef.current;

    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // If no effects or WebGL not initialized, draw directly
    if (allActiveEffects.length === 0 || !effectsInitialized || !glCanvas || !offscreen) {
      drawScene(ctx);
      drawOverlays(ctx);
      return;
    }

    // Draw scene to offscreen canvas
    const offscreenCtx = offscreen.getContext('2d');
    if (!offscreenCtx) {
      drawScene(ctx);
      drawOverlays(ctx);
      return;
    }

    drawScene(offscreenCtx);

    // Get WebGL context from the effect engine's canvas
    const gl = glCanvas.getContext('webgl', {
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });

    if (!gl) {
      // Fallback to non-effect rendering
      ctx.drawImage(offscreen, 0, 0);
      drawOverlays(ctx);
      return;
    }

    // Create texture from offscreen canvas
    const sourceTexture = gl.createTexture();
    if (!sourceTexture) {
      ctx.drawImage(offscreen, 0, 0);
      drawOverlays(ctx);
      return;
    }

    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, offscreen);

    // Apply effects
    const processedTexture = effectEngine.applyEffects(sourceTexture, allActiveEffects, {
      time: currentTime,
      resolution: [CANVAS_WIDTH, CANVAS_HEIGHT],
    });

    // Read result back and draw to main canvas
    // For now, draw the WebGL result to the 2D canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Copy WebGL result to main canvas
    ctx.drawImage(glCanvas, 0, 0);

    // Cleanup source texture
    gl.deleteTexture(sourceTexture);

    // Draw overlays on top (not affected by effects)
    drawOverlays(ctx);
  }, [drawScene, drawOverlays, allActiveEffects, effectsInitialized, currentTime, CANVAS_WIDTH, CANVAS_HEIGHT]);

  useEffect(() => {
    draw();
  }, [draw]);

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
    [CANVAS_WIDTH, CANVAS_HEIGHT]
  );

  const hitTest = useCallback(
    (x: number, y: number): EditorElement | null => {
      // Check elements in reverse order (top to bottom)
      const visibleElements = project.elements.filter(
        el => el.visible && currentFrame >= el.startFrame && currentFrame <= el.endFrame
      );

      for (let i = visibleElements.length - 1; i >= 0; i--) {
        const el = visibleElements[i];
        if (el.locked) continue;
        if (x >= el.x && x <= el.x + el.width && y >= el.y && y <= el.y + el.height) {
          return el;
        }
      }
      return null;
    },
    [project.elements, currentFrame]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const pos = getMousePos(e);
      const hit = hitTest(pos.x, pos.y);

      if (hit) {
        selectElement(hit.id, e.shiftKey);
        if (selectedTool === 'select' || selectedTool === 'move') {
          setIsDragging(true);
          setDragElementId(hit.id);
          setDragOffset({ x: pos.x - hit.x, y: pos.y - hit.y });
        }
      } else {
        dispatch({ type: 'DESELECT_ALL' });
      }
    },
    [getMousePos, hitTest, selectedTool, selectElement, dispatch]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDragging || !dragElementId) return;

      const pos = getMousePos(e);
      let newX = pos.x - dragOffset.x;
      let newY = pos.y - dragOffset.y;

      // Snap to grid if enabled
      if (state.snapToGrid) {
        const gridSize = 10;
        newX = Math.round(newX / gridSize) * gridSize;
        newY = Math.round(newY / gridSize) * gridSize;
      }

      updateElement(dragElementId, { x: newX, y: newY });
    },
    [isDragging, dragElementId, getMousePos, dragOffset, state.snapToGrid, updateElement]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragElementId(null);
  }, []);

  // Calculate scale to fit canvas in container
  const scale = (zoom / 100) * 0.4;

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center overflow-auto"
    >
      <div
        className="relative"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
        {/* Main display canvas */}
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
        {/* Hidden WebGL canvas for effect processing */}
        <canvas
          ref={glCanvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="hidden"
        />
        {/* Canvas size indicator */}
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs text-text-muted whitespace-nowrap">
          {CANVAS_WIDTH} x {CANVAS_HEIGHT}
          {allActiveEffects.length > 0 && (
            <span className="ml-2 text-accent">
              ({allActiveEffects.length} effect{allActiveEffects.length !== 1 ? 's' : ''})
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
