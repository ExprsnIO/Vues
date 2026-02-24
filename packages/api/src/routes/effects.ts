import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware, optionalAuthMiddleware } from '../auth/middleware.js';
import { db, editorEffectPresets } from '../db/index.js';
import { eq, desc, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import {
  EFFECT_DEFINITIONS,
  type EffectCategory,
} from '../services/studio/EffectsService.js';

export const effectsRouter = new Hono();

// Simplified effect definition without ffmpegFilter for API responses
interface EffectResponse {
  type: string;
  name: string;
  description: string;
  category: string;
  params: Array<{
    name: string;
    label: string;
    type: string;
    default: number | string | boolean;
    min?: number;
    max?: number;
    step?: number;
    options?: Array<{ value: string | number; label: string }>;
  }>;
}

// Effect presets (predefined effect combinations)
const EFFECT_PRESETS = [
  {
    id: 'vintage',
    name: 'Vintage',
    description: 'Classic retro film look',
    category: 'style',
    effects: [
      { type: 'saturation', params: { value: 0.7 } },
      { type: 'contrast', params: { value: 0.9 } },
      { type: 'temperature', params: { value: 5500 } },
      { type: 'vignette', params: { value: 0.3 } },
      { type: 'filmGrain', params: { amount: 0.2 } },
    ],
    thumbnail: '/presets/vintage.jpg',
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    description: 'Movie-like dramatic look',
    category: 'style',
    effects: [
      { type: 'contrast', params: { value: 1.2 } },
      { type: 'saturation', params: { value: 0.85 } },
      { type: 'letterbox', params: { ratio: 2.35 } },
      { type: 'colorBalance', params: { shadowsBlue: 0.1, highlightsOrange: 0.1 } },
    ],
    thumbnail: '/presets/cinematic.jpg',
  },
  {
    id: 'warm',
    name: 'Warm Glow',
    description: 'Cozy warm tones',
    category: 'color',
    effects: [
      { type: 'temperature', params: { value: 7500 } },
      { type: 'saturation', params: { value: 1.1 } },
      { type: 'exposure', params: { value: 0.1 } },
    ],
    thumbnail: '/presets/warm.jpg',
  },
  {
    id: 'cool',
    name: 'Cool Tones',
    description: 'Crisp cool blue tones',
    category: 'color',
    effects: [
      { type: 'temperature', params: { value: 5500 } },
      { type: 'saturation', params: { value: 0.9 } },
      { type: 'contrast', params: { value: 1.1 } },
    ],
    thumbnail: '/presets/cool.jpg',
  },
  {
    id: 'blackAndWhite',
    name: 'Black & White',
    description: 'Classic monochrome',
    category: 'style',
    effects: [
      { type: 'saturation', params: { value: 0 } },
      { type: 'contrast', params: { value: 1.2 } },
    ],
    thumbnail: '/presets/bw.jpg',
  },
  {
    id: 'dramatic',
    name: 'Dramatic',
    description: 'High contrast dramatic look',
    category: 'style',
    effects: [
      { type: 'contrast', params: { value: 1.4 } },
      { type: 'saturation', params: { value: 1.2 } },
      { type: 'vignette', params: { value: 0.4 } },
      { type: 'sharpen', params: { value: 1.5 } },
    ],
    thumbnail: '/presets/dramatic.jpg',
  },
  {
    id: 'fade',
    name: 'Faded',
    description: 'Soft faded look',
    category: 'style',
    effects: [
      { type: 'contrast', params: { value: 0.8 } },
      { type: 'saturation', params: { value: 0.8 } },
      { type: 'exposure', params: { value: 0.15 } },
    ],
    thumbnail: '/presets/fade.jpg',
  },
  {
    id: 'vibrant',
    name: 'Vibrant',
    description: 'Punchy vivid colors',
    category: 'color',
    effects: [
      { type: 'saturation', params: { value: 1.4 } },
      { type: 'vibrance', params: { value: 0.5 } },
      { type: 'contrast', params: { value: 1.1 } },
    ],
    thumbnail: '/presets/vibrant.jpg',
  },
];

// Categories with metadata
const EFFECT_CATEGORIES: {
  id: EffectCategory;
  name: string;
  description: string;
  icon: string;
}[] = [
  { id: 'color', name: 'Color', description: 'Color adjustments and grading', icon: 'palette' },
  { id: 'blur', name: 'Blur', description: 'Blur and focus effects', icon: 'droplet' },
  { id: 'stylize', name: 'Stylize', description: 'Artistic styles and filters', icon: 'sparkles' },
  { id: 'distort', name: 'Distort', description: 'Distortion effects', icon: 'waves' },
  { id: 'keying', name: 'Keying', description: 'Chroma key and masking', icon: 'key' },
  { id: 'transform', name: 'Transform', description: 'Scale, rotate, crop', icon: 'move' },
  { id: 'time', name: 'Time', description: 'Speed and time effects', icon: 'clock' },
  { id: 'generate', name: 'Generate', description: 'Generated overlays', icon: 'wand' },
];

/**
 * Get all available effects
 * GET /xrpc/io.exprsn.studio.effects.list
 */
effectsRouter.get('/io.exprsn.studio.effects.list', optionalAuthMiddleware, async (c) => {
  const category = c.req.query('category') as EffectCategory | undefined;

  let effects = EFFECT_DEFINITIONS;

  if (category) {
    effects = effects.filter((e) => e.category === category);
  }

  // Group effects by category (excluding ffmpegFilter for API response)
  const effectsByCategory: Record<string, EffectResponse[]> = {};

  for (const effect of EFFECT_DEFINITIONS) {
    const cat = effect.category;
    if (!effectsByCategory[cat]) {
      effectsByCategory[cat] = [];
    }
    const categoryEffects = effectsByCategory[cat]!;
    categoryEffects.push({
      type: effect.type,
      name: effect.name,
      description: effect.description,
      category: effect.category,
      params: effect.params,
    });
  }

  return c.json({
    categories: EFFECT_CATEGORIES,
    effectsByCategory,
    totalEffects: EFFECT_DEFINITIONS.length,
  });
});

/**
 * Get presets
 * GET /xrpc/io.exprsn.studio.effects.presets
 */
effectsRouter.get('/io.exprsn.studio.effects.presets', optionalAuthMiddleware, async (c) => {
  const userDid = c.get('did');
  const category = c.req.query('category');

  let presets = [...EFFECT_PRESETS];

  // Get user's custom presets if logged in
  // Note: The schema stores individual effects, we use 'params' to store effect combinations as JSON
  let userPresets: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    effects: Array<{ type: string; params: Record<string, number | string | boolean> }>;
    thumbnail?: string;
    isCustom: boolean;
  }> = [];

  if (userDid) {
    const savedPresets = await db.query.editorEffectPresets.findMany({
      where: eq(editorEffectPresets.ownerDid, userDid),
      orderBy: desc(editorEffectPresets.createdAt),
    });

    userPresets = savedPresets.map((p) => {
      // The params field stores the effects array as JSON for user presets
      const effects = Array.isArray(p.params) ? p.params : [{ type: p.type, params: p.params }];
      return {
        id: p.id,
        name: p.name,
        description: '',
        category: 'custom',
        effects: effects as Array<{ type: string; params: Record<string, number | string | boolean> }>,
        thumbnail: p.thumbnail || undefined,
        isCustom: true,
      };
    });
  }

  // Filter by category if specified
  if (category) {
    presets = presets.filter((p) => p.category === category);
    userPresets = userPresets.filter((p) => category === 'custom' || p.category === category);
  }

  return c.json({
    presets,
    userPresets,
    categories: ['style', 'color', 'custom'],
  });
});

/**
 * Save custom preset
 * POST /xrpc/io.exprsn.studio.effects.savePreset
 */
effectsRouter.post('/io.exprsn.studio.effects.savePreset', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const { name, effects, thumbnail } = await c.req.json();

  if (!name || !effects || !Array.isArray(effects)) {
    throw new HTTPException(400, { message: 'Name and effects array are required' });
  }

  const presetId = nanoid();

  // Store effects array in the params field as JSON
  await db.insert(editorEffectPresets).values({
    id: presetId,
    ownerDid: userDid,
    name,
    category: 'custom',
    type: 'preset', // Special type for combination presets
    params: effects as any, // Store effects array as JSON in params
    thumbnail: thumbnail || null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return c.json({
    id: presetId,
    name,
    effects,
    thumbnail,
    createdAt: new Date().toISOString(),
  });
});

/**
 * Delete custom preset
 * POST /xrpc/io.exprsn.studio.effects.deletePreset
 */
effectsRouter.post('/io.exprsn.studio.effects.deletePreset', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const { presetId } = await c.req.json();

  if (!presetId) {
    throw new HTTPException(400, { message: 'Preset ID is required' });
  }

  const preset = await db.query.editorEffectPresets.findFirst({
    where: and(
      eq(editorEffectPresets.id, presetId),
      eq(editorEffectPresets.ownerDid, userDid)
    ),
  });

  if (!preset) {
    throw new HTTPException(404, { message: 'Preset not found' });
  }

  await db.delete(editorEffectPresets).where(eq(editorEffectPresets.id, presetId));

  return c.json({ success: true });
});

/**
 * Get FFmpeg filter string for effects preview
 * POST /xrpc/io.exprsn.studio.effects.preview
 */
effectsRouter.post('/io.exprsn.studio.effects.preview', optionalAuthMiddleware, async (c) => {
  const { effects } = await c.req.json();

  if (!effects || !Array.isArray(effects)) {
    throw new HTTPException(400, { message: 'Effects array is required' });
  }

  const filterParts: string[] = [];

  for (const effect of effects) {
    const definition = EFFECT_DEFINITIONS.find((d) => d.type === effect.type);
    if (definition) {
      const params = effect.params || {};
      // Fill in defaults for missing params
      for (const param of definition.params) {
        if (params[param.name] === undefined) {
          params[param.name] = param.default;
        }
      }
      filterParts.push(definition.ffmpegFilter(params));
    }
  }

  const filterString = filterParts.join(',');

  return c.json({
    filterString,
    effectCount: effects.length,
  });
});

/**
 * Get effect definition by type
 * GET /xrpc/io.exprsn.studio.effects.get
 */
effectsRouter.get('/io.exprsn.studio.effects.get', async (c) => {
  const type = c.req.query('type');

  if (!type) {
    throw new HTTPException(400, { message: 'Effect type is required' });
  }

  const effect = EFFECT_DEFINITIONS.find((e) => e.type === type);

  if (!effect) {
    throw new HTTPException(404, { message: 'Effect not found' });
  }

  return c.json({
    type: effect.type,
    name: effect.name,
    description: effect.description,
    category: effect.category,
    params: effect.params,
  });
});

export default effectsRouter;
