/**
 * Animation Engine for Vues Loop Editor
 * Handles keyframe evaluation, interpolation, and expression support
 */

import type {
  Keyframe,
  KeyframeValue,
  AnimatableProperty,
  VideoClip,
  TextOverlay,
  EditorTrack,
  EditorState,
  EasingFunction,
  BezierHandle,
} from '../types';
import {
  getEasingFunction,
  createBezierEasing,
  lerp,
  lerpVector2,
  lerpColor,
} from '../easing';

// Animation context for expression evaluation
export interface AnimationContext {
  frame: number;
  time: number;
  fps: number;
  duration: number;
  value?: KeyframeValue;
  property?: AnimatableProperty;
}

/**
 * Find surrounding keyframes for a given frame
 */
function findSurroundingKeyframes(
  keyframes: Keyframe[],
  frame: number
): { prev: Keyframe | null; next: Keyframe | null } {
  if (keyframes.length === 0) {
    return { prev: null, next: null };
  }

  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame);

  let prev: Keyframe | null = null;
  for (const kf of sorted) {
    if (kf.frame <= frame) {
      prev = kf;
    } else {
      break;
    }
  }

  let next: Keyframe | null = null;
  for (const kf of sorted) {
    if (kf.frame > frame) {
      next = kf;
      break;
    }
  }

  return { prev, next };
}

/**
 * Get the easing function for interpolation between keyframes
 */
function getInterpolationEasing(prevKf: Keyframe, nextKf: Keyframe): EasingFunction {
  const interpolation = prevKf.interpolation;

  switch (interpolation) {
    case 'hold':
      return () => 0;

    case 'bezier':
      if (prevKf.handleOut && nextKf.handleIn) {
        return createBezierEasing(prevKf.handleOut, nextKf.handleIn);
      }
      return getEasingFunction(prevKf.easing);

    case 'auto-bezier':
      return getEasingFunction('ease-in-out');

    case 'linear':
    default:
      if (prevKf.easing) {
        return getEasingFunction(prevKf.easing);
      }
      return getEasingFunction('linear');
  }
}

/**
 * Interpolate between two keyframe values
 */
function interpolateValue(
  prev: KeyframeValue,
  next: KeyframeValue,
  t: number,
  type: AnimatableProperty['type']
): KeyframeValue {
  if (t === 0) return prev;
  if (t >= 1) return next;

  switch (type) {
    case 'number':
      if (typeof prev === 'number' && typeof next === 'number') {
        return lerp(prev, next, t);
      }
      break;

    case 'vector2':
      if (
        typeof prev === 'object' &&
        typeof next === 'object' &&
        'x' in prev &&
        'y' in prev &&
        'x' in next &&
        'y' in next
      ) {
        return lerpVector2(prev, next, t);
      }
      break;

    case 'color':
      if (typeof prev === 'string' && typeof next === 'string') {
        return lerpColor(prev, next, t);
      }
      break;

    case 'string':
      return t >= 0.5 ? next : prev;
  }

  return prev;
}

/**
 * Evaluate a property at a given frame
 */
export function evaluateProperty(
  property: AnimatableProperty,
  frame: number,
  context?: AnimationContext
): KeyframeValue | null {
  const { keyframes } = property;

  if (keyframes.length === 0) {
    return null;
  }

  // Single keyframe - return its value
  if (keyframes.length === 1) {
    return evaluateKeyframeExpression(keyframes[0], keyframes[0].value, context);
  }

  const { prev, next } = findSurroundingKeyframes(keyframes, frame);

  let interpolatedValue: KeyframeValue | null = null;

  // Before first keyframe
  if (!prev && next) {
    interpolatedValue = next.value;
  }
  // After last keyframe
  else if (prev && !next) {
    interpolatedValue = prev.value;
  }
  // Between keyframes
  else if (prev && next) {
    if (prev.frame === frame) {
      interpolatedValue = prev.value;
    } else {
      const frameDelta = next.frame - prev.frame;
      const progress = (frame - prev.frame) / frameDelta;
      const easingFn = getInterpolationEasing(prev, next);
      const easedProgress = easingFn(progress);
      interpolatedValue = interpolateValue(prev.value, next.value, easedProgress, property.type);
    }
  }

  // Apply expression if present
  const activeKeyframe = findActiveKeyframe(keyframes, frame);
  if (activeKeyframe) {
    interpolatedValue = evaluateKeyframeExpression(activeKeyframe, interpolatedValue, context);
  }

  return interpolatedValue;
}

/**
 * Find the active keyframe at a given frame
 */
function findActiveKeyframe(keyframes: Keyframe[], frame: number): Keyframe | null {
  if (keyframes.length === 0) return null;

  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame);
  let active: Keyframe | null = null;

  for (const kf of sorted) {
    if (kf.frame <= frame) {
      active = kf;
    } else {
      break;
    }
  }

  return active;
}

/**
 * Evaluate expression on a keyframe value
 */
function evaluateKeyframeExpression(
  keyframe: Keyframe,
  interpolatedValue: KeyframeValue | null,
  context?: AnimationContext
): KeyframeValue | null {
  if (!keyframe.expression?.trim() || !context) {
    return interpolatedValue;
  }

  try {
    // Build expression context
    const exprContext = {
      time: context.time,
      frame: context.frame,
      fps: context.fps,
      duration: context.duration,
      value: interpolatedValue,
      // Math functions
      sin: Math.sin,
      cos: Math.cos,
      tan: Math.tan,
      abs: Math.abs,
      floor: Math.floor,
      ceil: Math.ceil,
      round: Math.round,
      min: Math.min,
      max: Math.max,
      pow: Math.pow,
      sqrt: Math.sqrt,
      random: Math.random,
      PI: Math.PI,
      // Animation helpers
      wiggle: (freq: number, amp: number) => {
        const t = context.time * freq;
        return amp * (Math.sin(t * 6.283) * 0.5 + Math.sin(t * 2.1 * 6.283) * 0.3 + Math.sin(t * 3.7 * 6.283) * 0.2);
      },
      ease: (t: number, type: string = 'ease-in-out') => {
        const fn = getEasingFunction(type as any);
        return fn(Math.max(0, Math.min(1, t)));
      },
      clamp: (val: number, min: number, max: number) => Math.max(min, Math.min(max, val)),
      lerp: (a: number, b: number, t: number) => a + (b - a) * t,
      loopIn: (type: string = 'cycle', numKeyframes: number = 0) => interpolatedValue,
      loopOut: (type: string = 'cycle', numKeyframes: number = 0) => interpolatedValue,
    };

    // Create safe evaluation function
    const keys = Object.keys(exprContext);
    const values = Object.values(exprContext);
    const fn = new Function(...keys, `return (${keyframe.expression})`);
    const result = fn(...values);

    if (result !== undefined && result !== null) {
      if (typeof result === 'number') return result;
      if (Array.isArray(result) && result.length >= 2) {
        return { x: result[0], y: result[1] };
      }
      if (typeof result === 'object' && 'x' in result && 'y' in result) {
        return result as { x: number; y: number };
      }
      if (typeof result === 'string') return result;
    }
  } catch (e) {
    console.warn('Expression evaluation error:', e);
  }

  return interpolatedValue;
}

/**
 * Apply animated values to a video clip
 */
export function evaluateClipAnimation(
  clip: VideoClip,
  frame: number,
  fps: number,
  duration: number
): Record<string, KeyframeValue> {
  const result: Record<string, KeyframeValue> = {};
  const localFrame = calculateLocalFrame(clip, frame);

  if (localFrame === null) return result;

  const context: AnimationContext = {
    frame: localFrame,
    time: localFrame / fps,
    fps,
    duration: duration / fps,
  };

  for (const property of clip.properties) {
    const value = evaluateProperty(property, localFrame, {
      ...context,
      property,
    });
    if (value !== null) {
      result[property.path] = value;
    }
  }

  return result;
}

/**
 * Apply animated values to a text overlay
 */
export function evaluateTextAnimation(
  text: TextOverlay,
  frame: number,
  fps: number,
  duration: number
): Record<string, KeyframeValue> {
  const result: Record<string, KeyframeValue> = {};

  // Check if text is visible at this frame
  const startFrame = Math.floor(text.startTime * fps);
  const endFrame = Math.floor(text.endTime * fps);

  if (frame < startFrame || frame > endFrame) {
    return result;
  }

  const localFrame = frame - startFrame;

  const context: AnimationContext = {
    frame: localFrame,
    time: localFrame / fps,
    fps,
    duration: (endFrame - startFrame) / fps,
  };

  for (const property of text.properties) {
    const value = evaluateProperty(property, localFrame, {
      ...context,
      property,
    });
    if (value !== null) {
      result[property.path] = value;
    }
  }

  return result;
}

/**
 * Calculate local frame within a clip
 */
function calculateLocalFrame(clip: VideoClip, globalFrame: number): number | null {
  if (globalFrame < clip.startFrame || globalFrame > clip.endFrame) {
    return null;
  }

  const clipProgress = (globalFrame - clip.startFrame) / (clip.endFrame - clip.startFrame);
  let localFrame = clip.trimStart + clipProgress * (clip.trimEnd - clip.trimStart);

  if (clip.reversed) {
    localFrame = clip.trimEnd - (localFrame - clip.trimStart);
  }

  localFrame *= clip.speed;

  return localFrame;
}

/**
 * Evaluate all animations for the current editor state
 */
export function evaluateEditorState(state: EditorState): Map<string, Record<string, KeyframeValue>> {
  const result = new Map<string, Record<string, KeyframeValue>>();

  for (const track of state.tracks) {
    if (track.muted || !track.visible) continue;

    for (const clip of track.clips) {
      if (track.type === 'video' && 'properties' in clip) {
        const videoClip = clip as VideoClip;
        const animations = evaluateClipAnimation(
          videoClip,
          state.currentFrame,
          state.fps,
          state.duration
        );
        if (Object.keys(animations).length > 0) {
          result.set(clip.id, animations);
        }
      } else if (track.type === 'text' && 'properties' in clip) {
        const textOverlay = clip as TextOverlay;
        const animations = evaluateTextAnimation(
          textOverlay,
          state.currentFrame,
          state.fps,
          state.duration
        );
        if (Object.keys(animations).length > 0) {
          result.set(clip.id, animations);
        }
      }
    }
  }

  return result;
}

/**
 * Get all keyframes for a clip
 */
export function getClipKeyframes(clip: VideoClip | TextOverlay): Keyframe[] {
  return clip.properties.flatMap((prop) => prop.keyframes);
}

/**
 * Get all keyframes in the editor state
 */
export function getAllKeyframes(state: EditorState): Array<{
  keyframe: Keyframe;
  property: AnimatableProperty;
  clipId: string;
  trackId: string;
}> {
  const result: Array<{
    keyframe: Keyframe;
    property: AnimatableProperty;
    clipId: string;
    trackId: string;
  }> = [];

  for (const track of state.tracks) {
    for (const clip of track.clips) {
      if ('properties' in clip) {
        for (const property of (clip as VideoClip | TextOverlay).properties) {
          for (const keyframe of property.keyframes) {
            result.push({
              keyframe,
              property,
              clipId: clip.id,
              trackId: track.id,
            });
          }
        }
      }
    }
  }

  return result;
}

/**
 * Find keyframes near a given frame (for snapping)
 */
export function findNearbyKeyframes(
  state: EditorState,
  frame: number,
  threshold: number = 2
): Keyframe[] {
  const all = getAllKeyframes(state);
  return all
    .filter((k) => Math.abs(k.keyframe.frame - frame) <= threshold)
    .map((k) => k.keyframe);
}

/**
 * Calculate auto-bezier handles for smooth interpolation
 */
export function calculateAutoBezierHandles(
  prevKeyframe: Keyframe | null,
  currentKeyframe: Keyframe,
  nextKeyframe: Keyframe | null
): { handleIn: BezierHandle; handleOut: BezierHandle } {
  // Default handles (linear)
  const defaultHandle: BezierHandle = { x: 0.33, y: 0 };

  if (!prevKeyframe && !nextKeyframe) {
    return { handleIn: defaultHandle, handleOut: defaultHandle };
  }

  // Calculate tangent based on surrounding keyframes
  let tangentX = 0;
  let tangentY = 0;

  if (prevKeyframe && nextKeyframe) {
    const dx = nextKeyframe.frame - prevKeyframe.frame;
    const currentValue = typeof currentKeyframe.value === 'number' ? currentKeyframe.value : 0;
    const prevValue = typeof prevKeyframe.value === 'number' ? prevKeyframe.value : 0;
    const nextValue = typeof nextKeyframe.value === 'number' ? nextKeyframe.value : 0;
    const dy = nextValue - prevValue;

    tangentX = 0.33;
    tangentY = (dy / dx) * 0.33 * (currentKeyframe.frame - prevKeyframe.frame) / dx;
  } else if (prevKeyframe) {
    tangentX = 0.33;
    tangentY = 0;
  } else if (nextKeyframe) {
    tangentX = 0.33;
    tangentY = 0;
  }

  return {
    handleIn: { x: tangentX, y: -tangentY },
    handleOut: { x: tangentX, y: tangentY },
  };
}
