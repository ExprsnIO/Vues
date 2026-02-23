/**
 * Studio Services
 * Production video editing, export, rendering, and publishing
 */

export {
  RenderService,
  getRenderService,
  initializeRenderService,
  S3StorageProvider,
  type StorageProvider,
  type RenderJobData,
} from './RenderService.js';

export {
  PublishingService,
  getPublishingService,
  initializePublishingService,
  type PublishOptions,
  type PublishResult,
} from './PublishingService.js';

export {
  EditorService,
  getEditorService,
  type ProjectSettings,
  type ClipTransform,
  type TextStyle,
  type ShapeStyle,
  type ClipEffect,
  type Keyframe,
  type TransitionParams,
  type TrackType,
  type ClipType,
  type BlendMode,
} from './EditorService.js';

export {
  EffectsService,
  getEffectsService,
  EFFECT_DEFINITIONS,
  type EffectDefinition,
  type EffectParam,
  type EffectCategory,
} from './EffectsService.js';
