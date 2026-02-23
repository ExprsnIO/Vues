/**
 * Editor Service
 * Production video editing operations
 */

import { db } from '../../db/index.js';
import {
  editorProjects,
  editorTracks,
  editorClips,
  editorTransitions,
  editorAssets,
  editorProjectHistory,
  editorEffectPresets,
  editorTemplates,
} from '../../db/schema.js';
import { eq, and, desc, asc, gte, lte, gt, lt, or } from 'drizzle-orm';
import { nanoid } from 'nanoid';

// =============================================================================
// Types
// =============================================================================

export interface ProjectSettings {
  fps: number;
  width: number;
  height: number;
  duration: number;
  backgroundColor?: string;
}

export interface ClipTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  anchorX: number;
  anchorY: number;
  opacity: number;
}

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  color: string;
  backgroundColor?: string;
  align: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'middle' | 'bottom';
  lineHeight: number;
  letterSpacing: number;
  stroke?: { color: string; width: number };
  shadow?: { color: string; blur: number; offsetX: number; offsetY: number };
}

export interface ShapeStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius?: number;
  sides?: number;
  innerRadius?: number;
}

export interface ClipEffect {
  id: string;
  type: string;
  enabled: boolean;
  params: Record<string, number | string | boolean>;
}

export interface Keyframe {
  frame: number;
  value: number | string | { x: number; y: number };
  easing: string;
}

export interface TransitionParams {
  direction?: 'left' | 'right' | 'up' | 'down';
  softness?: number;
  color?: string;
  angle?: number;
}

export type TrackType = 'video' | 'audio' | 'text' | 'overlay';
export type ClipType = 'video' | 'audio' | 'image' | 'text' | 'shape' | 'solid';
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' |
  'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light' | 'difference' | 'exclusion';

// =============================================================================
// Editor Service
// =============================================================================

export class EditorService {
  // ===========================================================================
  // Project Operations
  // ===========================================================================

  /**
   * Create a new editor project
   */
  async createProject(
    ownerDid: string,
    title: string,
    settings?: Partial<ProjectSettings>
  ): Promise<string> {
    const projectId = `proj_${nanoid()}`;
    const defaultSettings: ProjectSettings = {
      fps: 30,
      width: 1920,
      height: 1080,
      duration: 300, // 10 seconds at 30fps
      ...settings,
    };

    await db.insert(editorProjects).values({
      id: projectId,
      ownerDid,
      title,
      settings: defaultSettings,
    });

    // Create default tracks
    await this.createTrack(projectId, 'Video 1', 'video', 0);
    await this.createTrack(projectId, 'Audio 1', 'audio', 1);

    return projectId;
  }

  /**
   * Get project by ID
   */
  async getProject(projectId: string): Promise<{
    id: string;
    ownerDid: string;
    title: string;
    settings: ProjectSettings;
    tracks: Array<{
      id: string;
      name: string;
      type: TrackType;
      order: number;
      clips: Array<Record<string, unknown>>;
    }>;
  } | null> {
    const project = await db.query.editorProjects.findFirst({
      where: eq(editorProjects.id, projectId),
    });

    if (!project) return null;

    // Get tracks with clips
    const tracks = await db
      .select()
      .from(editorTracks)
      .where(eq(editorTracks.projectId, projectId))
      .orderBy(asc(editorTracks.order));

    const tracksWithClips = await Promise.all(
      tracks.map(async (track) => {
        const clips = await db
          .select()
          .from(editorClips)
          .where(eq(editorClips.trackId, track.id))
          .orderBy(asc(editorClips.startFrame));

        return {
          id: track.id,
          name: track.name,
          type: track.type as TrackType,
          order: track.order,
          locked: track.locked || false,
          muted: track.muted || false,
          visible: track.visible ?? true,
          volume: track.volume || 1.0,
          color: track.color,
          clips,
        };
      })
    );

    return {
      id: project.id,
      ownerDid: project.ownerDid,
      title: project.title,
      settings: project.settings as ProjectSettings,
      tracks: tracksWithClips,
    };
  }

  /**
   * Update project settings
   */
  async updateProjectSettings(
    projectId: string,
    settings: Partial<ProjectSettings>
  ): Promise<void> {
    const project = await db.query.editorProjects.findFirst({
      where: eq(editorProjects.id, projectId),
    });

    if (!project) throw new Error('Project not found');

    const currentSettings = project.settings as ProjectSettings;
    await db
      .update(editorProjects)
      .set({
        settings: { ...currentSettings, ...settings },
        updatedAt: new Date(),
      })
      .where(eq(editorProjects.id, projectId));
  }

  /**
   * Get user's projects
   */
  async getUserProjects(
    ownerDid: string,
    limit = 20,
    cursor?: string
  ): Promise<Array<{
    id: string;
    title: string;
    settings: ProjectSettings;
    createdAt: Date;
    updatedAt: Date;
  }>> {
    const conditions = [eq(editorProjects.ownerDid, ownerDid)];

    if (cursor) {
      conditions.push(lt(editorProjects.id, cursor));
    }

    const projects = await db
      .select()
      .from(editorProjects)
      .where(and(...conditions))
      .orderBy(desc(editorProjects.updatedAt))
      .limit(limit);

    return projects.map((p) => ({
      id: p.id,
      title: p.title,
      settings: p.settings as ProjectSettings,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  }

  /**
   * Delete a project
   */
  async deleteProject(projectId: string): Promise<void> {
    // Tracks, clips, transitions, history are cascade deleted via FK
    await db.delete(editorProjects).where(eq(editorProjects.id, projectId));
  }

  /**
   * Duplicate a project
   */
  async duplicateProject(projectId: string, newTitle: string): Promise<string> {
    const project = await this.getProject(projectId);
    if (!project) throw new Error('Project not found');

    const newProjectId = await this.createProject(
      project.ownerDid,
      newTitle,
      project.settings
    );

    // Delete default tracks (we'll copy from original)
    await db.delete(editorTracks).where(eq(editorTracks.projectId, newProjectId));

    // Copy tracks and clips
    for (const track of project.tracks) {
      const newTrackId = await this.createTrack(
        newProjectId,
        track.name,
        track.type,
        track.order
      );

      for (const clip of track.clips) {
        await this.duplicateClipToTrack(clip.id as string, newTrackId);
      }
    }

    return newProjectId;
  }

  // ===========================================================================
  // Track Operations
  // ===========================================================================

  /**
   * Create a new track
   */
  async createTrack(
    projectId: string,
    name: string,
    type: TrackType,
    order?: number
  ): Promise<string> {
    const trackId = `track_${nanoid()}`;

    // Get max order if not specified
    if (order === undefined) {
      const maxTrack = await db
        .select({ order: editorTracks.order })
        .from(editorTracks)
        .where(eq(editorTracks.projectId, projectId))
        .orderBy(desc(editorTracks.order))
        .limit(1);
      order = maxTrack[0] ? maxTrack[0].order + 1 : 0;
    }

    await db.insert(editorTracks).values({
      id: trackId,
      projectId,
      name,
      type,
      order,
    });

    return trackId;
  }

  /**
   * Update track properties
   */
  async updateTrack(
    trackId: string,
    updates: {
      name?: string;
      locked?: boolean;
      muted?: boolean;
      solo?: boolean;
      visible?: boolean;
      volume?: number;
      color?: string;
    }
  ): Promise<void> {
    await db
      .update(editorTracks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(editorTracks.id, trackId));
  }

  /**
   * Reorder tracks
   */
  async reorderTracks(projectId: string, trackIds: string[]): Promise<void> {
    for (let i = 0; i < trackIds.length; i++) {
      await db
        .update(editorTracks)
        .set({ order: i, updatedAt: new Date() })
        .where(eq(editorTracks.id, trackIds[i]!));
    }
  }

  /**
   * Get track by ID
   */
  async getTrack(trackId: string): Promise<{
    id: string;
    projectId: string;
    name: string;
    type: TrackType;
  } | null> {
    const track = await db.query.editorTracks.findFirst({
      where: eq(editorTracks.id, trackId),
    });

    if (!track) return null;

    return {
      id: track.id,
      projectId: track.projectId,
      name: track.name,
      type: track.type as TrackType,
    };
  }

  /**
   * Delete a track
   */
  async deleteTrack(trackId: string): Promise<void> {
    // Clips are cascade deleted via FK
    await db.delete(editorTracks).where(eq(editorTracks.id, trackId));
  }

  // ===========================================================================
  // Clip Operations
  // ===========================================================================

  /**
   * Add a clip to a track
   */
  async addClip(
    projectId: string,
    trackId: string,
    clip: {
      type: ClipType;
      name: string;
      assetId?: string;
      startFrame: number;
      endFrame: number;
      sourceStart?: number;
      sourceEnd?: number;
      transform?: Partial<ClipTransform>;
      textContent?: string;
      textStyle?: Partial<TextStyle>;
      shapeType?: string;
      shapeStyle?: Partial<ShapeStyle>;
      solidColor?: string;
    }
  ): Promise<string> {
    const clipId = `clip_${nanoid()}`;

    const defaultTransform: ClipTransform = {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      anchorX: 0.5,
      anchorY: 0.5,
      opacity: 1,
    };

    await db.insert(editorClips).values({
      id: clipId,
      projectId,
      trackId,
      type: clip.type,
      name: clip.name,
      assetId: clip.assetId,
      startFrame: clip.startFrame,
      endFrame: clip.endFrame,
      sourceStart: clip.sourceStart || 0,
      sourceEnd: clip.sourceEnd,
      transform: { ...defaultTransform, ...clip.transform },
      textContent: clip.textContent,
      textStyle: clip.textStyle as TextStyle,
      shapeType: clip.shapeType,
      shapeStyle: clip.shapeStyle as ShapeStyle,
      solidColor: clip.solidColor,
      effects: [],
      keyframes: {},
    });

    // Record history
    await this.recordHistory(projectId, 'add_clip', `Add ${clip.name}`, {
      clipId,
      trackId,
    });

    return clipId;
  }

  /**
   * Update a clip
   */
  async updateClip(
    clipId: string,
    updates: Partial<{
      name: string;
      startFrame: number;
      endFrame: number;
      sourceStart: number;
      sourceEnd: number;
      speed: number;
      reverse: boolean;
      loop: boolean;
      loopCount: number;
      transform: Partial<ClipTransform>;
      volume: number;
      fadeIn: number;
      fadeOut: number;
      textContent: string;
      textStyle: Partial<TextStyle>;
      shapeStyle: Partial<ShapeStyle>;
      solidColor: string;
      effects: ClipEffect[];
      keyframes: Record<string, Keyframe[]>;
      blendMode: BlendMode;
      locked: boolean;
    }>
  ): Promise<void> {
    const clip = await db.query.editorClips.findFirst({
      where: eq(editorClips.id, clipId),
    });

    if (!clip) throw new Error('Clip not found');

    // Build update object with only the provided fields
    const updateFields: Record<string, unknown> = { updatedAt: new Date() };

    // Simple scalar fields
    if (updates.name !== undefined) updateFields.name = updates.name;
    if (updates.startFrame !== undefined) updateFields.startFrame = updates.startFrame;
    if (updates.endFrame !== undefined) updateFields.endFrame = updates.endFrame;
    if (updates.sourceStart !== undefined) updateFields.sourceStart = updates.sourceStart;
    if (updates.sourceEnd !== undefined) updateFields.sourceEnd = updates.sourceEnd;
    if (updates.speed !== undefined) updateFields.speed = updates.speed;
    if (updates.reverse !== undefined) updateFields.reverse = updates.reverse;
    if (updates.loop !== undefined) updateFields.loop = updates.loop;
    if (updates.loopCount !== undefined) updateFields.loopCount = updates.loopCount;
    if (updates.volume !== undefined) updateFields.volume = updates.volume;
    if (updates.fadeIn !== undefined) updateFields.fadeIn = updates.fadeIn;
    if (updates.fadeOut !== undefined) updateFields.fadeOut = updates.fadeOut;
    if (updates.textContent !== undefined) updateFields.textContent = updates.textContent;
    if (updates.solidColor !== undefined) updateFields.solidColor = updates.solidColor;
    if (updates.blendMode !== undefined) updateFields.blendMode = updates.blendMode;
    if (updates.locked !== undefined) updateFields.locked = updates.locked;

    // Complex JSONB fields - merge with existing values
    if (updates.transform !== undefined) {
      updateFields.transform = { ...(clip.transform as ClipTransform), ...updates.transform };
    }
    if (updates.textStyle !== undefined) {
      updateFields.textStyle = { ...(clip.textStyle as TextStyle || {}), ...updates.textStyle };
    }
    if (updates.shapeStyle !== undefined) {
      updateFields.shapeStyle = { ...(clip.shapeStyle as ShapeStyle || {}), ...updates.shapeStyle };
    }
    if (updates.effects !== undefined) {
      updateFields.effects = updates.effects;
    }
    if (updates.keyframes !== undefined) {
      updateFields.keyframes = updates.keyframes;
    }

    await db
      .update(editorClips)
      .set(updateFields)
      .where(eq(editorClips.id, clipId));
  }

  /**
   * Move a clip to a different position or track
   */
  async moveClip(
    clipId: string,
    options: {
      trackId?: string;
      startFrame?: number;
    }
  ): Promise<void> {
    const clip = await db.query.editorClips.findFirst({
      where: eq(editorClips.id, clipId),
    });

    if (!clip) throw new Error('Clip not found');

    const duration = clip.endFrame - clip.startFrame;
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (options.trackId) {
      updates.trackId = options.trackId;
    }

    if (options.startFrame !== undefined) {
      updates.startFrame = options.startFrame;
      updates.endFrame = options.startFrame + duration;
    }

    await db
      .update(editorClips)
      .set(updates)
      .where(eq(editorClips.id, clipId));

    await this.recordHistory(clip.projectId, 'move_clip', `Move ${clip.name}`, {
      clipId,
      from: { trackId: clip.trackId, startFrame: clip.startFrame },
      to: { trackId: options.trackId || clip.trackId, startFrame: options.startFrame || clip.startFrame },
    });
  }

  /**
   * Trim clip (adjust start/end frames)
   */
  async trimClip(
    clipId: string,
    options: {
      trimStart?: number; // Frames to remove from start
      trimEnd?: number; // Frames to remove from end
      newStartFrame?: number; // Absolute new start
      newEndFrame?: number; // Absolute new end
    }
  ): Promise<void> {
    const clip = await db.query.editorClips.findFirst({
      where: eq(editorClips.id, clipId),
    });

    if (!clip) throw new Error('Clip not found');

    let newStart = clip.startFrame;
    let newEnd = clip.endFrame;
    let sourceStart = clip.sourceStart || 0;
    let sourceEnd = clip.sourceEnd;

    if (options.trimStart !== undefined) {
      newStart += options.trimStart;
      sourceStart += options.trimStart;
    }

    if (options.trimEnd !== undefined) {
      newEnd -= options.trimEnd;
      if (sourceEnd !== null) {
        sourceEnd -= options.trimEnd;
      }
    }

    if (options.newStartFrame !== undefined) {
      const trimAmount = options.newStartFrame - clip.startFrame;
      newStart = options.newStartFrame;
      sourceStart += trimAmount;
    }

    if (options.newEndFrame !== undefined) {
      const trimAmount = clip.endFrame - options.newEndFrame;
      newEnd = options.newEndFrame;
      if (sourceEnd !== null) {
        sourceEnd -= trimAmount;
      }
    }

    // Validate
    if (newEnd <= newStart) {
      throw new Error('Invalid trim: end must be after start');
    }

    await db
      .update(editorClips)
      .set({
        startFrame: newStart,
        endFrame: newEnd,
        sourceStart,
        sourceEnd,
        updatedAt: new Date(),
      })
      .where(eq(editorClips.id, clipId));

    await this.recordHistory(clip.projectId, 'trim_clip', `Trim ${clip.name}`, {
      clipId,
      before: { startFrame: clip.startFrame, endFrame: clip.endFrame },
      after: { startFrame: newStart, endFrame: newEnd },
    });
  }

  /**
   * Split a clip at a specific frame
   */
  async splitClip(clipId: string, splitFrame: number): Promise<{ clipA: string; clipB: string }> {
    const clip = await db.query.editorClips.findFirst({
      where: eq(editorClips.id, clipId),
    });

    if (!clip) throw new Error('Clip not found');

    if (splitFrame <= clip.startFrame || splitFrame >= clip.endFrame) {
      throw new Error('Split frame must be within clip bounds');
    }

    const sourceOffset = (clip.sourceStart || 0) + (splitFrame - clip.startFrame);

    // Update original clip to end at split point
    await db
      .update(editorClips)
      .set({
        endFrame: splitFrame,
        sourceEnd: sourceOffset,
        updatedAt: new Date(),
      })
      .where(eq(editorClips.id, clipId));

    // Create new clip from split point to original end
    const newClipId = `clip_${nanoid()}`;
    await db.insert(editorClips).values({
      id: newClipId,
      projectId: clip.projectId,
      trackId: clip.trackId,
      assetId: clip.assetId,
      type: clip.type,
      name: `${clip.name} (split)`,
      startFrame: splitFrame,
      endFrame: clip.endFrame,
      sourceStart: sourceOffset,
      sourceEnd: clip.sourceEnd,
      speed: clip.speed,
      reverse: clip.reverse,
      loop: clip.loop,
      transform: clip.transform,
      volume: clip.volume,
      fadeIn: 0,
      fadeOut: clip.fadeOut,
      effects: clip.effects,
      keyframes: {}, // Keyframes would need to be split too
      blendMode: clip.blendMode,
    });

    await this.recordHistory(clip.projectId, 'split_clip', `Split ${clip.name}`, {
      originalClipId: clipId,
      newClipId,
      splitFrame,
    });

    return { clipA: clipId, clipB: newClipId };
  }

  /**
   * Duplicate a clip
   */
  async duplicateClip(clipId: string, offsetFrames = 0): Promise<string> {
    const clip = await db.query.editorClips.findFirst({
      where: eq(editorClips.id, clipId),
    });

    if (!clip) throw new Error('Clip not found');

    const duration = clip.endFrame - clip.startFrame;
    const newStartFrame = clip.endFrame + offsetFrames;

    const newClipId = `clip_${nanoid()}`;
    await db.insert(editorClips).values({
      ...clip,
      id: newClipId,
      name: `${clip.name} (copy)`,
      startFrame: newStartFrame,
      endFrame: newStartFrame + duration,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return newClipId;
  }

  /**
   * Duplicate clip to a specific track
   */
  private async duplicateClipToTrack(clipId: string, newTrackId: string): Promise<string> {
    const clip = await db.query.editorClips.findFirst({
      where: eq(editorClips.id, clipId),
    });

    if (!clip) throw new Error('Clip not found');

    // Get the project ID from the new track
    const track = await db.query.editorTracks.findFirst({
      where: eq(editorTracks.id, newTrackId),
    });

    if (!track) throw new Error('Track not found');

    const newClipId = `clip_${nanoid()}`;
    await db.insert(editorClips).values({
      ...clip,
      id: newClipId,
      projectId: track.projectId,
      trackId: newTrackId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return newClipId;
  }

  /**
   * Get clip by ID
   */
  async getClip(clipId: string): Promise<{
    id: string;
    projectId: string;
    trackId: string;
    name: string;
    type: ClipType;
  } | null> {
    const clip = await db.query.editorClips.findFirst({
      where: eq(editorClips.id, clipId),
    });

    if (!clip) return null;

    return {
      id: clip.id,
      projectId: clip.projectId,
      trackId: clip.trackId,
      name: clip.name,
      type: clip.type as ClipType,
    };
  }

  /**
   * Delete a clip
   */
  async deleteClip(clipId: string): Promise<void> {
    const clip = await db.query.editorClips.findFirst({
      where: eq(editorClips.id, clipId),
    });

    if (!clip) throw new Error('Clip not found');

    await db.delete(editorClips).where(eq(editorClips.id, clipId));

    await this.recordHistory(clip.projectId, 'delete_clip', `Delete ${clip.name}`, {
      clipId,
      clipData: clip,
    });
  }

  /**
   * Set clip speed (time stretch)
   */
  async setClipSpeed(clipId: string, speed: number): Promise<void> {
    if (speed <= 0 || speed > 10) {
      throw new Error('Speed must be between 0.1 and 10');
    }

    const clip = await db.query.editorClips.findFirst({
      where: eq(editorClips.id, clipId),
    });

    if (!clip) throw new Error('Clip not found');

    const currentDuration = clip.endFrame - clip.startFrame;
    const newDuration = Math.round(currentDuration / speed);

    await db
      .update(editorClips)
      .set({
        speed,
        endFrame: clip.startFrame + newDuration,
        updatedAt: new Date(),
      })
      .where(eq(editorClips.id, clipId));
  }

  /**
   * Set clip loop
   */
  async setClipLoop(
    clipId: string,
    loop: boolean,
    loopCount?: number
  ): Promise<void> {
    await db
      .update(editorClips)
      .set({
        loop,
        loopCount: loop ? loopCount : null,
        updatedAt: new Date(),
      })
      .where(eq(editorClips.id, clipId));
  }

  // ===========================================================================
  // Effects Operations
  // ===========================================================================

  /**
   * Add effect to clip
   */
  async addEffectToClip(
    clipId: string,
    effect: { type: string; params?: Record<string, number | string | boolean> }
  ): Promise<string> {
    const clip = await db.query.editorClips.findFirst({
      where: eq(editorClips.id, clipId),
    });

    if (!clip) throw new Error('Clip not found');

    const effectId = `fx_${nanoid(8)}`;
    const currentEffects = (clip.effects as ClipEffect[]) || [];
    const defaultParams = this.getDefaultEffectParams(effect.type);

    currentEffects.push({
      id: effectId,
      type: effect.type,
      enabled: true,
      params: { ...defaultParams, ...effect.params },
    });

    await db
      .update(editorClips)
      .set({ effects: currentEffects, updatedAt: new Date() })
      .where(eq(editorClips.id, clipId));

    return effectId;
  }

  /**
   * Update effect on clip
   */
  async updateClipEffect(
    clipId: string,
    effectId: string,
    updates: { enabled?: boolean; params?: Record<string, number | string | boolean> }
  ): Promise<void> {
    const clip = await db.query.editorClips.findFirst({
      where: eq(editorClips.id, clipId),
    });

    if (!clip) throw new Error('Clip not found');

    const effects = (clip.effects as ClipEffect[]) || [];
    const effectIndex = effects.findIndex((e) => e.id === effectId);

    if (effectIndex === -1) throw new Error('Effect not found');

    if (updates.enabled !== undefined) {
      effects[effectIndex]!.enabled = updates.enabled;
    }
    if (updates.params) {
      effects[effectIndex]!.params = { ...effects[effectIndex]!.params, ...updates.params };
    }

    await db
      .update(editorClips)
      .set({ effects, updatedAt: new Date() })
      .where(eq(editorClips.id, clipId));
  }

  /**
   * Remove effect from clip
   */
  async removeClipEffect(clipId: string, effectId: string): Promise<void> {
    const clip = await db.query.editorClips.findFirst({
      where: eq(editorClips.id, clipId),
    });

    if (!clip) throw new Error('Clip not found');

    const effects = (clip.effects as ClipEffect[]) || [];
    const filteredEffects = effects.filter((e) => e.id !== effectId);

    await db
      .update(editorClips)
      .set({ effects: filteredEffects, updatedAt: new Date() })
      .where(eq(editorClips.id, clipId));
  }

  /**
   * Reorder effects on clip
   */
  async reorderClipEffects(clipId: string, effectIds: string[]): Promise<void> {
    const clip = await db.query.editorClips.findFirst({
      where: eq(editorClips.id, clipId),
    });

    if (!clip) throw new Error('Clip not found');

    const effects = (clip.effects as ClipEffect[]) || [];
    const effectMap = new Map(effects.map((e) => [e.id, e]));
    const reorderedEffects = effectIds.map((id) => effectMap.get(id)).filter(Boolean) as ClipEffect[];

    await db
      .update(editorClips)
      .set({ effects: reorderedEffects, updatedAt: new Date() })
      .where(eq(editorClips.id, clipId));
  }

  /**
   * Get default parameters for effect type
   */
  private getDefaultEffectParams(type: string): Record<string, number | string | boolean> {
    const defaults: Record<string, Record<string, number | string | boolean>> = {
      // Color effects
      brightness: { value: 0 },
      contrast: { value: 0 },
      saturation: { value: 0 },
      hue: { value: 0 },
      exposure: { value: 0 },
      gamma: { red: 1, green: 1, blue: 1 },
      colorBalance: { shadows: 0, midtones: 0, highlights: 0 },
      vibrance: { value: 0 },
      temperature: { value: 6500 },
      tint: { value: 0 },
      // Blur effects
      blur: { radius: 10, type: 'gaussian' },
      motionBlur: { angle: 0, distance: 10 },
      radialBlur: { amount: 10, centerX: 0.5, centerY: 0.5 },
      zoomBlur: { amount: 10, centerX: 0.5, centerY: 0.5 },
      // Stylize effects
      sharpen: { amount: 50 },
      vignette: { amount: 50, softness: 50 },
      grain: { amount: 25, size: 1 },
      chromaAberration: { amount: 5 },
      glitch: { intensity: 50, frequency: 50 },
      pixelate: { size: 10 },
      posterize: { levels: 4 },
      // Distort effects
      warp: { type: 'wave', amplitude: 10, frequency: 5 },
      bulge: { amount: 50, centerX: 0.5, centerY: 0.5, radius: 0.5 },
      pinch: { amount: 50, centerX: 0.5, centerY: 0.5, radius: 0.5 },
      ripple: { amplitude: 10, frequency: 5, phase: 0 },
      // Keying
      chromaKey: { color: '#00ff00', tolerance: 0.1, softness: 0.1 },
      lumaKey: { threshold: 0.5, softness: 0.1, invert: false },
    };

    return defaults[type] || {};
  }

  // ===========================================================================
  // Transitions Operations
  // ===========================================================================

  /**
   * Add transition between two clips
   */
  async addTransition(
    projectId: string,
    trackId: string,
    clipAId: string,
    clipBId: string,
    options: {
      type: string;
      duration?: number;
      easing?: string;
      params?: TransitionParams;
    }
  ): Promise<string> {
    const transitionId = `trans_${nanoid()}`;

    await db.insert(editorTransitions).values({
      id: transitionId,
      projectId,
      trackId,
      clipAId,
      clipBId,
      type: options.type,
      duration: options.duration || 30,
      easing: options.easing || 'ease-in-out',
      params: options.params || {},
    });

    return transitionId;
  }

  /**
   * Update transition
   */
  async updateTransition(
    transitionId: string,
    updates: {
      type?: string;
      duration?: number;
      easing?: string;
      params?: TransitionParams;
    }
  ): Promise<void> {
    await db
      .update(editorTransitions)
      .set(updates)
      .where(eq(editorTransitions.id, transitionId));
  }

  /**
   * Get transition by ID
   */
  async getTransition(transitionId: string): Promise<{
    id: string;
    projectId: string;
    trackId: string;
  } | null> {
    const transition = await db.query.editorTransitions.findFirst({
      where: eq(editorTransitions.id, transitionId),
    });

    if (!transition) return null;

    return {
      id: transition.id,
      projectId: transition.projectId,
      trackId: transition.trackId,
    };
  }

  /**
   * Delete transition
   */
  async deleteTransition(transitionId: string): Promise<void> {
    await db.delete(editorTransitions).where(eq(editorTransitions.id, transitionId));
  }

  /**
   * Get available transition types
   */
  getTransitionTypes(): Array<{ type: string; name: string; category: string }> {
    return [
      // Fade
      { type: 'fade', name: 'Fade', category: 'fade' },
      { type: 'fadeToBlack', name: 'Fade to Black', category: 'fade' },
      { type: 'fadeToWhite', name: 'Fade to White', category: 'fade' },
      { type: 'crossDissolve', name: 'Cross Dissolve', category: 'fade' },
      // Wipe
      { type: 'wipeLeft', name: 'Wipe Left', category: 'wipe' },
      { type: 'wipeRight', name: 'Wipe Right', category: 'wipe' },
      { type: 'wipeUp', name: 'Wipe Up', category: 'wipe' },
      { type: 'wipeDown', name: 'Wipe Down', category: 'wipe' },
      { type: 'irisWipe', name: 'Iris Wipe', category: 'wipe' },
      { type: 'clockWipe', name: 'Clock Wipe', category: 'wipe' },
      // Slide
      { type: 'slideLeft', name: 'Slide Left', category: 'slide' },
      { type: 'slideRight', name: 'Slide Right', category: 'slide' },
      { type: 'slideUp', name: 'Slide Up', category: 'slide' },
      { type: 'slideDown', name: 'Slide Down', category: 'slide' },
      { type: 'pushLeft', name: 'Push Left', category: 'slide' },
      { type: 'pushRight', name: 'Push Right', category: 'slide' },
      // Zoom
      { type: 'zoomIn', name: 'Zoom In', category: 'zoom' },
      { type: 'zoomOut', name: 'Zoom Out', category: 'zoom' },
      { type: 'zoomRotate', name: 'Zoom Rotate', category: 'zoom' },
      // Effects
      { type: 'blur', name: 'Blur', category: 'effect' },
      { type: 'pixelate', name: 'Pixelate', category: 'effect' },
      { type: 'glitch', name: 'Glitch', category: 'effect' },
      { type: 'flash', name: 'Flash', category: 'effect' },
      // 3D
      { type: 'flipHorizontal', name: 'Flip Horizontal', category: '3d' },
      { type: 'flipVertical', name: 'Flip Vertical', category: '3d' },
      { type: 'cube', name: 'Cube', category: '3d' },
      { type: 'doorway', name: 'Doorway', category: '3d' },
    ];
  }

  // ===========================================================================
  // Keyframe Operations
  // ===========================================================================

  /**
   * Add keyframe to clip
   */
  async addKeyframe(
    clipId: string,
    property: string,
    frame: number,
    value: number | string | { x: number; y: number },
    easing = 'linear'
  ): Promise<void> {
    const clip = await db.query.editorClips.findFirst({
      where: eq(editorClips.id, clipId),
    });

    if (!clip) throw new Error('Clip not found');

    const keyframes = (clip.keyframes as Record<string, Keyframe[]>) || {};
    if (!keyframes[property]) {
      keyframes[property] = [];
    }

    // Remove existing keyframe at same frame
    keyframes[property] = keyframes[property]!.filter((k) => k.frame !== frame);

    // Add new keyframe
    keyframes[property]!.push({ frame, value, easing });

    // Sort by frame
    keyframes[property]!.sort((a, b) => a.frame - b.frame);

    await db
      .update(editorClips)
      .set({ keyframes, updatedAt: new Date() })
      .where(eq(editorClips.id, clipId));
  }

  /**
   * Remove keyframe from clip
   */
  async removeKeyframe(clipId: string, property: string, frame: number): Promise<void> {
    const clip = await db.query.editorClips.findFirst({
      where: eq(editorClips.id, clipId),
    });

    if (!clip) throw new Error('Clip not found');

    const keyframes = (clip.keyframes as Record<string, Keyframe[]>) || {};
    if (keyframes[property]) {
      keyframes[property] = keyframes[property]!.filter((k) => k.frame !== frame);
      if (keyframes[property]!.length === 0) {
        delete keyframes[property];
      }
    }

    await db
      .update(editorClips)
      .set({ keyframes, updatedAt: new Date() })
      .where(eq(editorClips.id, clipId));
  }

  /**
   * Get available easing functions
   */
  getEasingFunctions(): string[] {
    return [
      'linear',
      'ease',
      'ease-in',
      'ease-out',
      'ease-in-out',
      'ease-in-quad',
      'ease-out-quad',
      'ease-in-out-quad',
      'ease-in-cubic',
      'ease-out-cubic',
      'ease-in-out-cubic',
      'ease-in-quart',
      'ease-out-quart',
      'ease-in-out-quart',
      'ease-in-quint',
      'ease-out-quint',
      'ease-in-out-quint',
      'ease-in-sine',
      'ease-out-sine',
      'ease-in-out-sine',
      'ease-in-expo',
      'ease-out-expo',
      'ease-in-out-expo',
      'ease-in-circ',
      'ease-out-circ',
      'ease-in-out-circ',
      'ease-in-back',
      'ease-out-back',
      'ease-in-out-back',
      'ease-in-elastic',
      'ease-out-elastic',
      'ease-in-out-elastic',
      'ease-in-bounce',
      'ease-out-bounce',
      'ease-in-out-bounce',
    ];
  }

  // ===========================================================================
  // History Operations
  // ===========================================================================

  /**
   * Record history entry
   */
  private async recordHistory(
    projectId: string,
    action: string,
    description: string,
    undoData: Record<string, unknown>,
    batchId?: string
  ): Promise<void> {
    await db.insert(editorProjectHistory).values({
      id: `hist_${nanoid()}`,
      projectId,
      userDid: 'system', // Should be passed from context
      action,
      description,
      undoData,
      redoData: {}, // Would need to capture redo data
      batchId,
    });

    // Clean up old history (keep last 100 entries)
    const oldEntries = await db
      .select({ id: editorProjectHistory.id })
      .from(editorProjectHistory)
      .where(eq(editorProjectHistory.projectId, projectId))
      .orderBy(desc(editorProjectHistory.createdAt))
      .offset(100);

    if (oldEntries.length > 0) {
      await db
        .delete(editorProjectHistory)
        .where(
          and(
            eq(editorProjectHistory.projectId, projectId),
            or(...oldEntries.map((e) => eq(editorProjectHistory.id, e.id)))
          )
        );
    }
  }

  /**
   * Get project history
   */
  async getProjectHistory(
    projectId: string,
    limit = 50
  ): Promise<Array<{ id: string; action: string; description: string; createdAt: Date }>> {
    const history = await db
      .select()
      .from(editorProjectHistory)
      .where(eq(editorProjectHistory.projectId, projectId))
      .orderBy(desc(editorProjectHistory.createdAt))
      .limit(limit);

    return history.map((h) => ({
      id: h.id,
      action: h.action,
      description: h.description || '',
      createdAt: h.createdAt,
    }));
  }

  // ===========================================================================
  // Asset Operations
  // ===========================================================================

  /**
   * Get user assets
   */
  async getUserAssets(
    ownerDid: string,
    options: { type?: string; projectId?: string; limit?: number }
  ): Promise<Array<{
    id: string;
    name: string;
    type: string;
    cdnUrl: string;
    thumbnailUrl?: string;
    duration?: number;
    width?: number;
    height?: number;
  }>> {
    const conditions = [eq(editorAssets.ownerDid, ownerDid)];

    if (options.type) {
      conditions.push(eq(editorAssets.type, options.type));
    }
    if (options.projectId) {
      conditions.push(eq(editorAssets.projectId, options.projectId));
    }

    const assets = await db
      .select()
      .from(editorAssets)
      .where(and(...conditions))
      .orderBy(desc(editorAssets.createdAt))
      .limit(options.limit || 50);

    return assets.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      cdnUrl: a.cdnUrl || '',
      thumbnailUrl: a.thumbnailUrl || undefined,
      duration: a.duration || undefined,
      width: a.width || undefined,
      height: a.height || undefined,
    }));
  }

  // ===========================================================================
  // Templates Operations
  // ===========================================================================

  /**
   * Get available templates
   */
  async getTemplates(options: {
    category?: string;
    aspectRatio?: string;
    isPublic?: boolean;
    ownerDid?: string;
    limit?: number;
  }): Promise<Array<{
    id: string;
    name: string;
    description?: string;
    category: string;
    aspectRatio: string;
    thumbnailUrl?: string;
    usageCount: number;
  }>> {
    const conditions = [];

    if (options.category) {
      conditions.push(eq(editorTemplates.category, options.category));
    }
    if (options.aspectRatio) {
      conditions.push(eq(editorTemplates.aspectRatio, options.aspectRatio));
    }
    if (options.isPublic !== undefined) {
      conditions.push(eq(editorTemplates.isPublic, options.isPublic));
    }
    if (options.ownerDid) {
      conditions.push(eq(editorTemplates.ownerDid, options.ownerDid));
    }

    const templates = await db
      .select()
      .from(editorTemplates)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(editorTemplates.usageCount))
      .limit(options.limit || 50);

    return templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description || undefined,
      category: t.category,
      aspectRatio: t.aspectRatio,
      thumbnailUrl: t.thumbnailUrl || undefined,
      usageCount: t.usageCount || 0,
    }));
  }

  /**
   * Create project from template
   */
  async createProjectFromTemplate(
    templateId: string,
    ownerDid: string,
    title: string
  ): Promise<string> {
    const template = await db.query.editorTemplates.findFirst({
      where: eq(editorTemplates.id, templateId),
    });

    if (!template) throw new Error('Template not found');

    const templateData = template.templateData as {
      settings: { fps: number; width: number; height: number };
      tracks: Array<{ name: string; type: string; order: number }>;
      clips: Array<Record<string, unknown>>;
    };

    // Create project
    const projectId = await this.createProject(ownerDid, title, templateData.settings);

    // Delete default tracks
    await db.delete(editorTracks).where(eq(editorTracks.projectId, projectId));

    // Create tracks from template
    const trackIdMap = new Map<string, string>();
    for (const track of templateData.tracks) {
      const newTrackId = await this.createTrack(
        projectId,
        track.name,
        track.type as TrackType,
        track.order
      );
      trackIdMap.set(track.name, newTrackId);
    }

    // Increment usage count
    await db
      .update(editorTemplates)
      .set({ usageCount: (template.usageCount || 0) + 1 })
      .where(eq(editorTemplates.id, templateId));

    return projectId;
  }
}

// Singleton
let editorService: EditorService | null = null;

export function getEditorService(): EditorService {
  if (!editorService) {
    editorService = new EditorService();
  }
  return editorService;
}

export default EditorService;
