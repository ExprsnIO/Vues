/**
 * Visual Effect Filters
 * WebGL shader-based effects for video editing
 */

export { GlitchFilter } from './GlitchFilter';
export { VHSFilter } from './VHSFilter';
export { FilmGrainFilter } from './FilmGrainFilter';
export { ChromaticAberrationFilter } from './ChromaticAberrationFilter';
export { CRTFilter } from './CRTFilter';
export { BloomFilter } from './BloomFilter';

import { GlitchFilter } from './GlitchFilter';
import { VHSFilter } from './VHSFilter';
import { FilmGrainFilter } from './FilmGrainFilter';
import { ChromaticAberrationFilter } from './ChromaticAberrationFilter';
import { CRTFilter } from './CRTFilter';
import { BloomFilter } from './BloomFilter';

import type { EffectDefinition } from '../EffectEngine';

/**
 * All built-in filters
 */
export const builtinFilters: EffectDefinition[] = [
  GlitchFilter,
  VHSFilter,
  FilmGrainFilter,
  ChromaticAberrationFilter,
  CRTFilter,
  BloomFilter,
];

/**
 * Filter categories
 */
export const filterCategories = {
  distortion: {
    name: 'Distortion',
    description: 'Effects that warp or distort the image',
  },
  color: {
    name: 'Color',
    description: 'Color correction and manipulation',
  },
  blur: {
    name: 'Blur',
    description: 'Blur and focus effects',
  },
  stylize: {
    name: 'Stylize',
    description: 'Artistic and stylistic effects',
  },
  time: {
    name: 'Time',
    description: 'Time-based effects',
  },
  generate: {
    name: 'Generate',
    description: 'Pattern and texture generation',
  },
};

/**
 * Get filters by category
 */
export function getFiltersByCategory(
  category: keyof typeof filterCategories
): EffectDefinition[] {
  return builtinFilters.filter((filter) => filter.category === category);
}

/**
 * Get filter by ID
 */
export function getFilterById(id: string): EffectDefinition | undefined {
  return builtinFilters.find((filter) => filter.id === id);
}

export default builtinFilters;
