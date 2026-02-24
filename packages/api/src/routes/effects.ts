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
  // ═══════════════════════════════════════════════════════════════════════════
  // STYLE PRESETS
  // ═══════════════════════════════════════════════════════════════════════════
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
    id: 'filmNoir',
    name: 'Film Noir',
    description: 'Classic detective movie style',
    category: 'style',
    effects: [
      { type: 'saturation', params: { value: 0 } },
      { type: 'contrast', params: { value: 1.5 } },
      { type: 'exposure', params: { value: -0.1 } },
      { type: 'vignette', params: { value: 0.5 } },
    ],
    thumbnail: '/presets/film-noir.jpg',
  },
  {
    id: 'retro80s',
    name: 'Retro 80s',
    description: 'Neon-soaked synthwave vibes',
    category: 'style',
    effects: [
      { type: 'saturation', params: { value: 1.5 } },
      { type: 'contrast', params: { value: 1.3 } },
      { type: 'colorBalance', params: { shadowsMagenta: 0.2, highlightsCyan: 0.15 } },
      { type: 'filmGrain', params: { amount: 0.15 } },
    ],
    thumbnail: '/presets/retro-80s.jpg',
  },
  {
    id: 'vhs',
    name: 'VHS',
    description: 'Nostalgic tape recording look',
    category: 'style',
    effects: [
      { type: 'saturation', params: { value: 0.85 } },
      { type: 'contrast', params: { value: 0.9 } },
      { type: 'sharpen', params: { value: -0.3 } },
      { type: 'filmGrain', params: { amount: 0.35 } },
      { type: 'colorBalance', params: { shadowsBlue: 0.1 } },
    ],
    thumbnail: '/presets/vhs.jpg',
  },
  {
    id: 'polaroid',
    name: 'Polaroid',
    description: 'Instant camera aesthetic',
    category: 'style',
    effects: [
      { type: 'saturation', params: { value: 0.9 } },
      { type: 'contrast', params: { value: 0.95 } },
      { type: 'temperature', params: { value: 6500 } },
      { type: 'exposure', params: { value: 0.1 } },
      { type: 'vignette', params: { value: 0.2 } },
    ],
    thumbnail: '/presets/polaroid.jpg',
  },
  {
    id: 'sepia',
    name: 'Sepia',
    description: 'Antique photograph tones',
    category: 'style',
    effects: [
      { type: 'saturation', params: { value: 0.2 } },
      { type: 'temperature', params: { value: 8000 } },
      { type: 'contrast', params: { value: 1.1 } },
    ],
    thumbnail: '/presets/sepia.jpg',
  },
  {
    id: 'lofi',
    name: 'Lo-Fi',
    description: 'Chill low-quality aesthetic',
    category: 'style',
    effects: [
      { type: 'saturation', params: { value: 0.75 } },
      { type: 'contrast', params: { value: 0.85 } },
      { type: 'sharpen', params: { value: -0.4 } },
      { type: 'filmGrain', params: { amount: 0.25 } },
      { type: 'vignette', params: { value: 0.3 } },
    ],
    thumbnail: '/presets/lofi.jpg',
  },
  {
    id: 'dreamy',
    name: 'Dreamy',
    description: 'Soft ethereal glow',
    category: 'style',
    effects: [
      { type: 'saturation', params: { value: 0.9 } },
      { type: 'contrast', params: { value: 0.85 } },
      { type: 'exposure', params: { value: 0.15 } },
      { type: 'blur', params: { value: 0.1 } },
      { type: 'bloom', params: { value: 0.3 } },
    ],
    thumbnail: '/presets/dreamy.jpg',
  },
  {
    id: 'grunge',
    name: 'Grunge',
    description: 'Dark gritty underground',
    category: 'style',
    effects: [
      { type: 'saturation', params: { value: 0.6 } },
      { type: 'contrast', params: { value: 1.4 } },
      { type: 'exposure', params: { value: -0.15 } },
      { type: 'filmGrain', params: { amount: 0.4 } },
      { type: 'vignette', params: { value: 0.5 } },
    ],
    thumbnail: '/presets/grunge.jpg',
  },
  {
    id: 'comic',
    name: 'Comic Book',
    description: 'Bold graphic novel style',
    category: 'style',
    effects: [
      { type: 'saturation', params: { value: 1.4 } },
      { type: 'contrast', params: { value: 1.6 } },
      { type: 'sharpen', params: { value: 2.0 } },
    ],
    thumbnail: '/presets/comic.jpg',
  },
  {
    id: 'softFocus',
    name: 'Soft Focus',
    description: 'Romantic portrait blur',
    category: 'style',
    effects: [
      { type: 'blur', params: { value: 0.15 } },
      { type: 'contrast', params: { value: 0.9 } },
      { type: 'bloom', params: { value: 0.2 } },
    ],
    thumbnail: '/presets/soft-focus.jpg',
  },
  {
    id: 'crossProcess',
    name: 'Cross Process',
    description: 'Film development technique',
    category: 'style',
    effects: [
      { type: 'saturation', params: { value: 1.2 } },
      { type: 'contrast', params: { value: 1.3 } },
      { type: 'colorBalance', params: { shadowsCyan: 0.15, highlightsYellow: 0.2 } },
    ],
    thumbnail: '/presets/cross-process.jpg',
  },
  {
    id: 'kodachrome',
    name: 'Kodachrome',
    description: 'Classic Kodak film simulation',
    category: 'style',
    effects: [
      { type: 'saturation', params: { value: 1.15 } },
      { type: 'contrast', params: { value: 1.1 } },
      { type: 'temperature', params: { value: 6200 } },
      { type: 'colorBalance', params: { highlightsRed: 0.05 } },
    ],
    thumbnail: '/presets/kodachrome.jpg',
  },
  {
    id: 'fujifilm',
    name: 'Fujifilm',
    description: 'Japanese film aesthetic',
    category: 'style',
    effects: [
      { type: 'saturation', params: { value: 1.1 } },
      { type: 'contrast', params: { value: 1.05 } },
      { type: 'temperature', params: { value: 5800 } },
      { type: 'colorBalance', params: { shadowsGreen: 0.05, highlightsMagenta: 0.03 } },
    ],
    thumbnail: '/presets/fujifilm.jpg',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COLOR PRESETS
  // ═══════════════════════════════════════════════════════════════════════════
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
  {
    id: 'goldenHour',
    name: 'Golden Hour',
    description: 'Warm sunset lighting',
    category: 'color',
    effects: [
      { type: 'temperature', params: { value: 8500 } },
      { type: 'saturation', params: { value: 1.2 } },
      { type: 'exposure', params: { value: 0.1 } },
      { type: 'colorBalance', params: { highlightsOrange: 0.15 } },
    ],
    thumbnail: '/presets/golden-hour.jpg',
  },
  {
    id: 'blueHour',
    name: 'Blue Hour',
    description: 'Twilight cool tones',
    category: 'color',
    effects: [
      { type: 'temperature', params: { value: 4500 } },
      { type: 'saturation', params: { value: 1.1 } },
      { type: 'exposure', params: { value: -0.05 } },
      { type: 'colorBalance', params: { shadowsBlue: 0.2 } },
    ],
    thumbnail: '/presets/blue-hour.jpg',
  },
  {
    id: 'moonlight',
    name: 'Moonlight',
    description: 'Cool nighttime atmosphere',
    category: 'color',
    effects: [
      { type: 'temperature', params: { value: 4000 } },
      { type: 'saturation', params: { value: 0.7 } },
      { type: 'exposure', params: { value: -0.2 } },
      { type: 'contrast', params: { value: 1.2 } },
      { type: 'colorBalance', params: { shadowsBlue: 0.25 } },
    ],
    thumbnail: '/presets/moonlight.jpg',
  },
  {
    id: 'tropical',
    name: 'Tropical',
    description: 'Bright beach vibes',
    category: 'color',
    effects: [
      { type: 'saturation', params: { value: 1.35 } },
      { type: 'temperature', params: { value: 7000 } },
      { type: 'exposure', params: { value: 0.15 } },
      { type: 'vibrance', params: { value: 0.3 } },
    ],
    thumbnail: '/presets/tropical.jpg',
  },
  {
    id: 'pastel',
    name: 'Pastel',
    description: 'Soft muted tones',
    category: 'color',
    effects: [
      { type: 'saturation', params: { value: 0.65 } },
      { type: 'contrast', params: { value: 0.85 } },
      { type: 'exposure', params: { value: 0.2 } },
    ],
    thumbnail: '/presets/pastel.jpg',
  },
  {
    id: 'neon',
    name: 'Neon',
    description: 'Electric vivid colors',
    category: 'color',
    effects: [
      { type: 'saturation', params: { value: 1.6 } },
      { type: 'contrast', params: { value: 1.3 } },
      { type: 'vibrance', params: { value: 0.5 } },
      { type: 'colorBalance', params: { shadowsMagenta: 0.1, highlightsCyan: 0.1 } },
    ],
    thumbnail: '/presets/neon.jpg',
  },
  {
    id: 'earthTones',
    name: 'Earth Tones',
    description: 'Natural organic colors',
    category: 'color',
    effects: [
      { type: 'saturation', params: { value: 0.85 } },
      { type: 'temperature', params: { value: 6500 } },
      { type: 'colorBalance', params: { shadowsGreen: 0.05, highlightsOrange: 0.1 } },
    ],
    thumbnail: '/presets/earth-tones.jpg',
  },
  {
    id: 'autumn',
    name: 'Autumn',
    description: 'Warm fall foliage tones',
    category: 'color',
    effects: [
      { type: 'saturation', params: { value: 1.2 } },
      { type: 'temperature', params: { value: 7200 } },
      { type: 'colorBalance', params: { highlightsOrange: 0.2, shadowsRed: 0.1 } },
    ],
    thumbnail: '/presets/autumn.jpg',
  },
  {
    id: 'winter',
    name: 'Winter',
    description: 'Cold icy atmosphere',
    category: 'color',
    effects: [
      { type: 'saturation', params: { value: 0.8 } },
      { type: 'temperature', params: { value: 4500 } },
      { type: 'exposure', params: { value: 0.1 } },
      { type: 'colorBalance', params: { shadowsBlue: 0.15, highlightsCyan: 0.1 } },
    ],
    thumbnail: '/presets/winter.jpg',
  },
  {
    id: 'spring',
    name: 'Spring',
    description: 'Fresh blooming colors',
    category: 'color',
    effects: [
      { type: 'saturation', params: { value: 1.15 } },
      { type: 'temperature', params: { value: 6000 } },
      { type: 'exposure', params: { value: 0.1 } },
      { type: 'colorBalance', params: { highlightsGreen: 0.1, shadowsMagenta: 0.05 } },
    ],
    thumbnail: '/presets/spring.jpg',
  },
  {
    id: 'summer',
    name: 'Summer',
    description: 'Bright sunny days',
    category: 'color',
    effects: [
      { type: 'saturation', params: { value: 1.25 } },
      { type: 'temperature', params: { value: 7500 } },
      { type: 'exposure', params: { value: 0.15 } },
      { type: 'contrast', params: { value: 1.1 } },
    ],
    thumbnail: '/presets/summer.jpg',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm orange sky tones',
    category: 'color',
    effects: [
      { type: 'temperature', params: { value: 9000 } },
      { type: 'saturation', params: { value: 1.3 } },
      { type: 'colorBalance', params: { highlightsOrange: 0.25, shadowsMagenta: 0.1 } },
    ],
    thumbnail: '/presets/sunset.jpg',
  },
  {
    id: 'teal',
    name: 'Teal & Orange',
    description: 'Hollywood color grade',
    category: 'color',
    effects: [
      { type: 'saturation', params: { value: 1.1 } },
      { type: 'contrast', params: { value: 1.15 } },
      { type: 'colorBalance', params: { shadowsCyan: 0.2, highlightsOrange: 0.2 } },
    ],
    thumbnail: '/presets/teal-orange.jpg',
  },
  {
    id: 'candy',
    name: 'Candy',
    description: 'Sweet colorful pop',
    category: 'color',
    effects: [
      { type: 'saturation', params: { value: 1.5 } },
      { type: 'contrast', params: { value: 1.1 } },
      { type: 'exposure', params: { value: 0.1 } },
      { type: 'colorBalance', params: { highlightsMagenta: 0.1 } },
    ],
    thumbnail: '/presets/candy.jpg',
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Deep woodland greens',
    category: 'color',
    effects: [
      { type: 'saturation', params: { value: 1.1 } },
      { type: 'temperature', params: { value: 5500 } },
      { type: 'colorBalance', params: { shadowsGreen: 0.15, highlightsCyan: 0.05 } },
    ],
    thumbnail: '/presets/forest.jpg',
  },
  {
    id: 'lavender',
    name: 'Lavender',
    description: 'Soft purple tones',
    category: 'color',
    effects: [
      { type: 'saturation', params: { value: 0.95 } },
      { type: 'temperature', params: { value: 5500 } },
      { type: 'colorBalance', params: { shadowsMagenta: 0.1, highlightsBlue: 0.1 } },
    ],
    thumbnail: '/presets/lavender.jpg',
  },
  {
    id: 'rose',
    name: 'Rose Gold',
    description: 'Elegant pink warmth',
    category: 'color',
    effects: [
      { type: 'saturation', params: { value: 1.05 } },
      { type: 'temperature', params: { value: 6800 } },
      { type: 'colorBalance', params: { highlightsMagenta: 0.15, shadowsOrange: 0.1 } },
    ],
    thumbnail: '/presets/rose-gold.jpg',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MOOD PRESETS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'moody',
    name: 'Moody',
    description: 'Dark atmospheric feel',
    category: 'mood',
    effects: [
      { type: 'saturation', params: { value: 0.75 } },
      { type: 'contrast', params: { value: 1.3 } },
      { type: 'exposure', params: { value: -0.2 } },
      { type: 'vignette', params: { value: 0.4 } },
    ],
    thumbnail: '/presets/moody.jpg',
  },
  {
    id: 'cheerful',
    name: 'Cheerful',
    description: 'Bright happy vibes',
    category: 'mood',
    effects: [
      { type: 'saturation', params: { value: 1.3 } },
      { type: 'exposure', params: { value: 0.2 } },
      { type: 'contrast', params: { value: 1.05 } },
      { type: 'temperature', params: { value: 6500 } },
    ],
    thumbnail: '/presets/cheerful.jpg',
  },
  {
    id: 'mysterious',
    name: 'Mysterious',
    description: 'Dark with hints of color',
    category: 'mood',
    effects: [
      { type: 'saturation', params: { value: 0.8 } },
      { type: 'contrast', params: { value: 1.4 } },
      { type: 'exposure', params: { value: -0.25 } },
      { type: 'vignette', params: { value: 0.5 } },
      { type: 'colorBalance', params: { shadowsBlue: 0.15 } },
    ],
    thumbnail: '/presets/mysterious.jpg',
  },
  {
    id: 'romantic',
    name: 'Romantic',
    description: 'Soft dreamy warmth',
    category: 'mood',
    effects: [
      { type: 'saturation', params: { value: 0.9 } },
      { type: 'contrast', params: { value: 0.9 } },
      { type: 'temperature', params: { value: 7000 } },
      { type: 'bloom', params: { value: 0.25 } },
      { type: 'vignette', params: { value: 0.2 } },
    ],
    thumbnail: '/presets/romantic.jpg',
  },
  {
    id: 'energetic',
    name: 'Energetic',
    description: 'High energy pop',
    category: 'mood',
    effects: [
      { type: 'saturation', params: { value: 1.4 } },
      { type: 'contrast', params: { value: 1.35 } },
      { type: 'sharpen', params: { value: 1.5 } },
      { type: 'vibrance', params: { value: 0.4 } },
    ],
    thumbnail: '/presets/energetic.jpg',
  },
  {
    id: 'serene',
    name: 'Serene',
    description: 'Calm peaceful tones',
    category: 'mood',
    effects: [
      { type: 'saturation', params: { value: 0.85 } },
      { type: 'contrast', params: { value: 0.9 } },
      { type: 'temperature', params: { value: 5800 } },
      { type: 'exposure', params: { value: 0.05 } },
    ],
    thumbnail: '/presets/serene.jpg',
  },
  {
    id: 'melancholy',
    name: 'Melancholy',
    description: 'Sad wistful atmosphere',
    category: 'mood',
    effects: [
      { type: 'saturation', params: { value: 0.6 } },
      { type: 'contrast', params: { value: 1.1 } },
      { type: 'temperature', params: { value: 5000 } },
      { type: 'vignette', params: { value: 0.35 } },
    ],
    thumbnail: '/presets/melancholy.jpg',
  },
  {
    id: 'epic',
    name: 'Epic',
    description: 'Grand cinematic drama',
    category: 'mood',
    effects: [
      { type: 'contrast', params: { value: 1.5 } },
      { type: 'saturation', params: { value: 1.1 } },
      { type: 'letterbox', params: { ratio: 2.39 } },
      { type: 'vignette', params: { value: 0.3 } },
      { type: 'colorBalance', params: { shadowsBlue: 0.1, highlightsOrange: 0.1 } },
    ],
    thumbnail: '/presets/epic.jpg',
  },
  {
    id: 'horror',
    name: 'Horror',
    description: 'Creepy unsettling vibe',
    category: 'mood',
    effects: [
      { type: 'saturation', params: { value: 0.5 } },
      { type: 'contrast', params: { value: 1.6 } },
      { type: 'exposure', params: { value: -0.3 } },
      { type: 'vignette', params: { value: 0.6 } },
      { type: 'colorBalance', params: { shadowsGreen: 0.1 } },
    ],
    thumbnail: '/presets/horror.jpg',
  },
  {
    id: 'noir',
    name: 'Neo-Noir',
    description: 'Modern dark mystery',
    category: 'mood',
    effects: [
      { type: 'saturation', params: { value: 0.3 } },
      { type: 'contrast', params: { value: 1.5 } },
      { type: 'exposure', params: { value: -0.15 } },
      { type: 'vignette', params: { value: 0.45 } },
      { type: 'colorBalance', params: { highlightsBlue: 0.1 } },
    ],
    thumbnail: '/presets/neo-noir.jpg',
  },
  {
    id: 'euphoric',
    name: 'Euphoric',
    description: 'Intense emotional high',
    category: 'mood',
    effects: [
      { type: 'saturation', params: { value: 1.3 } },
      { type: 'contrast', params: { value: 1.2 } },
      { type: 'bloom', params: { value: 0.4 } },
      { type: 'exposure', params: { value: 0.15 } },
    ],
    thumbnail: '/presets/euphoric.jpg',
  },
  {
    id: 'nostalgic',
    name: 'Nostalgic',
    description: 'Warm memory feel',
    category: 'mood',
    effects: [
      { type: 'saturation', params: { value: 0.8 } },
      { type: 'contrast', params: { value: 0.9 } },
      { type: 'temperature', params: { value: 7000 } },
      { type: 'filmGrain', params: { amount: 0.2 } },
      { type: 'vignette', params: { value: 0.25 } },
    ],
    thumbnail: '/presets/nostalgic.jpg',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SOCIAL MEDIA PRESETS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'instagram',
    name: 'Insta Pop',
    description: 'Social media ready',
    category: 'social',
    effects: [
      { type: 'saturation', params: { value: 1.25 } },
      { type: 'contrast', params: { value: 1.1 } },
      { type: 'sharpen', params: { value: 1.2 } },
      { type: 'vibrance', params: { value: 0.3 } },
    ],
    thumbnail: '/presets/insta-pop.jpg',
  },
  {
    id: 'selfie',
    name: 'Selfie Glow',
    description: 'Flattering portrait light',
    category: 'social',
    effects: [
      { type: 'exposure', params: { value: 0.15 } },
      { type: 'contrast', params: { value: 0.95 } },
      { type: 'saturation', params: { value: 1.05 } },
      { type: 'bloom', params: { value: 0.15 } },
      { type: 'sharpen', params: { value: 0.8 } },
    ],
    thumbnail: '/presets/selfie-glow.jpg',
  },
  {
    id: 'foodie',
    name: 'Foodie',
    description: 'Appetizing food shots',
    category: 'social',
    effects: [
      { type: 'saturation', params: { value: 1.2 } },
      { type: 'temperature', params: { value: 6800 } },
      { type: 'contrast', params: { value: 1.1 } },
      { type: 'sharpen', params: { value: 1.3 } },
    ],
    thumbnail: '/presets/foodie.jpg',
  },
  {
    id: 'travel',
    name: 'Travel',
    description: 'Wanderlust vibes',
    category: 'social',
    effects: [
      { type: 'saturation', params: { value: 1.15 } },
      { type: 'contrast', params: { value: 1.1 } },
      { type: 'vibrance', params: { value: 0.25 } },
      { type: 'vignette', params: { value: 0.15 } },
    ],
    thumbnail: '/presets/travel.jpg',
  },
  {
    id: 'fitness',
    name: 'Fitness',
    description: 'Athletic energy boost',
    category: 'social',
    effects: [
      { type: 'contrast', params: { value: 1.3 } },
      { type: 'saturation', params: { value: 1.15 } },
      { type: 'sharpen', params: { value: 1.5 } },
      { type: 'temperature', params: { value: 5800 } },
    ],
    thumbnail: '/presets/fitness.jpg',
  },
  {
    id: 'aesthetic',
    name: 'Aesthetic',
    description: 'Tumblr-style visual',
    category: 'social',
    effects: [
      { type: 'saturation', params: { value: 0.85 } },
      { type: 'contrast', params: { value: 1.15 } },
      { type: 'colorBalance', params: { shadowsBlue: 0.1, highlightsMagenta: 0.05 } },
      { type: 'vignette', params: { value: 0.2 } },
    ],
    thumbnail: '/presets/aesthetic.jpg',
  },
  {
    id: 'vsco',
    name: 'VSCO',
    description: 'Clean minimal edit',
    category: 'social',
    effects: [
      { type: 'saturation', params: { value: 0.9 } },
      { type: 'contrast', params: { value: 0.95 } },
      { type: 'exposure', params: { value: 0.1 } },
      { type: 'filmGrain', params: { amount: 0.1 } },
    ],
    thumbnail: '/presets/vsco.jpg',
  },
  {
    id: 'dark',
    name: 'Dark Mode',
    description: 'Moody dark aesthetic',
    category: 'social',
    effects: [
      { type: 'exposure', params: { value: -0.2 } },
      { type: 'contrast', params: { value: 1.25 } },
      { type: 'saturation', params: { value: 0.9 } },
      { type: 'vignette', params: { value: 0.3 } },
    ],
    thumbnail: '/presets/dark-mode.jpg',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PORTRAIT PRESETS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'portrait',
    name: 'Portrait',
    description: 'Flattering skin tones',
    category: 'portrait',
    effects: [
      { type: 'saturation', params: { value: 0.95 } },
      { type: 'contrast', params: { value: 1.05 } },
      { type: 'temperature', params: { value: 6200 } },
      { type: 'sharpen', params: { value: 0.8 } },
    ],
    thumbnail: '/presets/portrait.jpg',
  },
  {
    id: 'beauty',
    name: 'Beauty',
    description: 'Smooth glamorous look',
    category: 'portrait',
    effects: [
      { type: 'saturation', params: { value: 1.0 } },
      { type: 'contrast', params: { value: 0.95 } },
      { type: 'blur', params: { value: 0.05 } },
      { type: 'bloom', params: { value: 0.2 } },
      { type: 'exposure', params: { value: 0.1 } },
    ],
    thumbnail: '/presets/beauty.jpg',
  },
  {
    id: 'editorial',
    name: 'Editorial',
    description: 'Magazine cover style',
    category: 'portrait',
    effects: [
      { type: 'contrast', params: { value: 1.2 } },
      { type: 'saturation', params: { value: 0.95 } },
      { type: 'sharpen', params: { value: 1.3 } },
      { type: 'vignette', params: { value: 0.15 } },
    ],
    thumbnail: '/presets/editorial.jpg',
  },
  {
    id: 'golden',
    name: 'Golden Skin',
    description: 'Sun-kissed warmth',
    category: 'portrait',
    effects: [
      { type: 'temperature', params: { value: 7500 } },
      { type: 'saturation', params: { value: 1.1 } },
      { type: 'exposure', params: { value: 0.1 } },
      { type: 'colorBalance', params: { highlightsOrange: 0.1 } },
    ],
    thumbnail: '/presets/golden-skin.jpg',
  },
  {
    id: 'porcelain',
    name: 'Porcelain',
    description: 'Pale luminous skin',
    category: 'portrait',
    effects: [
      { type: 'exposure', params: { value: 0.15 } },
      { type: 'contrast', params: { value: 0.9 } },
      { type: 'saturation', params: { value: 0.85 } },
      { type: 'temperature', params: { value: 5500 } },
    ],
    thumbnail: '/presets/porcelain.jpg',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LANDSCAPE / NATURE PRESETS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'landscape',
    name: 'Landscape',
    description: 'Scenic nature enhancement',
    category: 'landscape',
    effects: [
      { type: 'saturation', params: { value: 1.2 } },
      { type: 'contrast', params: { value: 1.15 } },
      { type: 'vibrance', params: { value: 0.3 } },
      { type: 'sharpen', params: { value: 1.2 } },
    ],
    thumbnail: '/presets/landscape.jpg',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Coastal blue tones',
    category: 'landscape',
    effects: [
      { type: 'saturation', params: { value: 1.15 } },
      { type: 'temperature', params: { value: 5200 } },
      { type: 'contrast', params: { value: 1.1 } },
      { type: 'colorBalance', params: { highlightsCyan: 0.15 } },
    ],
    thumbnail: '/presets/ocean.jpg',
  },
  {
    id: 'mountain',
    name: 'Mountain',
    description: 'Crisp alpine clarity',
    category: 'landscape',
    effects: [
      { type: 'contrast', params: { value: 1.25 } },
      { type: 'saturation', params: { value: 1.1 } },
      { type: 'sharpen', params: { value: 1.4 } },
      { type: 'temperature', params: { value: 5500 } },
    ],
    thumbnail: '/presets/mountain.jpg',
  },
  {
    id: 'desert',
    name: 'Desert',
    description: 'Warm sandy tones',
    category: 'landscape',
    effects: [
      { type: 'temperature', params: { value: 7500 } },
      { type: 'saturation', params: { value: 1.1 } },
      { type: 'contrast', params: { value: 1.15 } },
      { type: 'colorBalance', params: { highlightsOrange: 0.15 } },
    ],
    thumbnail: '/presets/desert.jpg',
  },
  {
    id: 'jungle',
    name: 'Jungle',
    description: 'Lush green canopy',
    category: 'landscape',
    effects: [
      { type: 'saturation', params: { value: 1.25 } },
      { type: 'contrast', params: { value: 1.1 } },
      { type: 'colorBalance', params: { shadowsGreen: 0.2, highlightsCyan: 0.1 } },
    ],
    thumbnail: '/presets/jungle.jpg',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    description: 'Northern lights magic',
    category: 'landscape',
    effects: [
      { type: 'saturation', params: { value: 1.4 } },
      { type: 'contrast', params: { value: 1.2 } },
      { type: 'exposure', params: { value: -0.1 } },
      { type: 'colorBalance', params: { highlightsGreen: 0.2, shadowsMagenta: 0.1 } },
    ],
    thumbnail: '/presets/aurora.jpg',
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
    categories: ['style', 'color', 'mood', 'social', 'portrait', 'landscape', 'custom'],
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
