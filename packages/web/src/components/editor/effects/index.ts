/**
 * Visual Effects Module
 * WebGL-based visual effects for video editing
 *
 * Usage:
 * ```typescript
 * import { effectEngine, builtinFilters } from './effects';
 *
 * // Initialize with canvas
 * effectEngine.initialize(canvas);
 *
 * // Register all builtin filters
 * builtinFilters.forEach(filter => effectEngine.registerEffect(filter));
 *
 * // Apply effects
 * const outputTexture = effectEngine.applyEffects(inputTexture, [
 *   { id: '1', effectId: 'glitch', enabled: true, parameters: { amount: 0.5 }, order: 0 },
 *   { id: '2', effectId: 'vhs', enabled: true, parameters: { amount: 0.3 }, order: 1 },
 * ], { time: 0.5, resolution: [1920, 1080] });
 * ```
 */

// Effect engine
export {
  EffectEngine,
  effectEngine,
  DEFAULT_VERTEX_SHADER,
  type EffectDefinition,
  type EffectParameter,
  type EffectInstance,
} from './EffectEngine';

// Filters
export {
  builtinFilters,
  filterCategories,
  getFiltersByCategory,
  getFilterById,
  GlitchFilter,
  VHSFilter,
  FilmGrainFilter,
  ChromaticAberrationFilter,
  CRTFilter,
  BloomFilter,
} from './filters';

import { effectEngine } from './EffectEngine';
import { builtinFilters } from './filters';

/**
 * Initialize effect engine with all builtin filters
 */
export function initializeEffects(canvas: HTMLCanvasElement): void {
  effectEngine.initialize(canvas);

  for (const filter of builtinFilters) {
    effectEngine.registerEffect(filter);
  }
}
