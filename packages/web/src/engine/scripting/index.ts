/**
 * Expression Scripting Engine for Vues
 *
 * Provides After Effects-style expression support for keyframe animation.
 * Features:
 * - Secure sandbox execution with configurable security levels
 * - Rich builtin library: math, animation, vector, color, easing
 * - Expression caching for performance
 * - Type-safe evaluation with coercion helpers
 *
 * Usage:
 * ```typescript
 * import { expressionEngine } from './engine/scripting';
 *
 * const result = expressionEngine.evaluate(
 *   'wiggle(5, 10)',
 *   { time: 1.5, frame: 45, fps: 30, duration: 10 }
 * );
 *
 * if (result.success) {
 *   console.log(result.value);
 * }
 * ```
 */

// Core engine
export {
  ExpressionEngine,
  expressionEngine,
  type ExpressionContext,
  type ExpressionEngineConfig,
} from './ExpressionEngine';

// Sandbox
export {
  Sandbox,
  sandbox,
  type ExecutionResult,
  type ExecutionError,
  type SandboxOptions,
  type SecurityPolicy,
  type SecurityLevel,
  type SafeContext,
} from './Sandbox';

// Builtin functions
export {
  builtinFunctions,
  getBuiltinContext,
  getBuiltinFunctionNames,
  isBuiltinFunction,
} from './builtin';

// Individual builtin modules
export { mathFunctions } from './builtin/math';
export { animationFunctions } from './builtin/animation';
export { vectorFunctions, type Vector2, type Vector3, type Vector4 } from './builtin/vector';
export { colorFunctions, type RGB, type RGBA, type HSL, type HSV } from './builtin/color';
export { easingFunctions, EASING_CATEGORIES } from './builtin/easing';
