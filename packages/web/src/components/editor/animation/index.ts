// Animation Engine exports
export {
  evaluateProperty,
  evaluateClipAnimation,
  evaluateTextAnimation,
  evaluateEditorState,
  getClipKeyframes,
  getAllKeyframes,
  findNearbyKeyframes,
  calculateAutoBezierHandles,
  type AnimationContext,
} from './AnimationEngine';

// Re-export easing utilities
export {
  getEasingFunction,
  cubicBezier,
  createBezierEasing,
  spring,
  lerp,
  lerpVector2,
  lerpColor,
  getEasingNames,
  EASING_CATEGORIES,
} from '../easing';
