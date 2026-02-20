/**
 * Editor Collaboration Persistence Service
 * Handles database operations for collaborative editing sessions
 */

import { db } from '../db/index.js';
import {
  editorProjects,
  editorCollaborators,
  editorDocumentSnapshots,
} from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import * as Y from 'yjs';
import { v4 as uuid } from 'uuid';

/**
 * Access level for collaborators
 */
export type AccessLevel = 'owner' | 'editor' | 'viewer';

/**
 * Project settings
 */
export interface ProjectSettings {
  fps: number;
  width: number;
  height: number;
  duration: number;
  backgroundColor?: string;
}

/**
 * Create a new editor project
 */
export async function createProject(
  ownerDid: string,
  title: string,
  settings?: Partial<ProjectSettings>
): Promise<string> {
  const id = uuid();

  const defaultSettings: ProjectSettings = {
    fps: 30,
    width: 1920,
    height: 1080,
    duration: 300, // 5 minutes default
    backgroundColor: '#000000',
    ...settings,
  };

  await db.insert(editorProjects).values({
    id,
    ownerDid,
    title,
    settings: defaultSettings,
  });

  // Add owner as collaborator
  await db.insert(editorCollaborators).values({
    id: uuid(),
    projectId: id,
    userDid: ownerDid,
    accessLevel: 'owner',
  });

  return id;
}

/**
 * Get project by ID
 */
export async function getProject(projectId: string): Promise<{
  id: string;
  ownerDid: string;
  title: string;
  settings: ProjectSettings;
  createdAt: Date;
} | null> {
  const result = await db
    .select()
    .from(editorProjects)
    .where(eq(editorProjects.id, projectId))
    .limit(1);

  const project = result[0];
  if (!project) return null;

  // Provide default settings if null
  const defaultSettings: ProjectSettings = {
    fps: 30,
    width: 1920,
    height: 1080,
    duration: 300,
    backgroundColor: '#000000',
  };

  return {
    id: project.id,
    ownerDid: project.ownerDid,
    title: project.title,
    settings: project.settings ?? defaultSettings,
    createdAt: project.createdAt,
  };
}

/**
 * Get projects for a user
 */
export async function getUserProjects(
  userDid: string
): Promise<Array<{
  id: string;
  title: string;
  accessLevel: AccessLevel;
  createdAt: Date;
}>> {
  const results = await db
    .select({
      id: editorProjects.id,
      title: editorProjects.title,
      accessLevel: editorCollaborators.accessLevel,
      createdAt: editorProjects.createdAt,
    })
    .from(editorCollaborators)
    .innerJoin(editorProjects, eq(editorProjects.id, editorCollaborators.projectId))
    .where(eq(editorCollaborators.userDid, userDid))
    .orderBy(desc(editorProjects.createdAt));

  return results.map((r) => ({
    id: r.id,
    title: r.title,
    accessLevel: r.accessLevel as AccessLevel,
    createdAt: r.createdAt!,
  }));
}

/**
 * Update project settings
 */
export async function updateProject(
  projectId: string,
  data: { title?: string; settings?: Partial<ProjectSettings> }
): Promise<void> {
  const updateData: Partial<typeof editorProjects.$inferInsert> = {};

  if (data.title) {
    updateData.title = data.title;
  }

  if (data.settings) {
    const existing = await getProject(projectId);
    if (existing) {
      updateData.settings = { ...existing.settings, ...data.settings };
    }
  }

  await db
    .update(editorProjects)
    .set(updateData)
    .where(eq(editorProjects.id, projectId));
}

/**
 * Delete a project
 */
export async function deleteProject(projectId: string): Promise<void> {
  // Delete snapshots first
  await db
    .delete(editorDocumentSnapshots)
    .where(eq(editorDocumentSnapshots.projectId, projectId));

  // Delete collaborators
  await db
    .delete(editorCollaborators)
    .where(eq(editorCollaborators.projectId, projectId));

  // Delete project
  await db.delete(editorProjects).where(eq(editorProjects.id, projectId));
}

/**
 * Add a collaborator to a project
 */
export async function addCollaborator(
  projectId: string,
  userDid: string,
  accessLevel: AccessLevel
): Promise<void> {
  // Check if already exists
  const existing = await db
    .select()
    .from(editorCollaborators)
    .where(
      and(
        eq(editorCollaborators.projectId, projectId),
        eq(editorCollaborators.userDid, userDid)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // Update access level
    await db
      .update(editorCollaborators)
      .set({ accessLevel })
      .where(
        and(
          eq(editorCollaborators.projectId, projectId),
          eq(editorCollaborators.userDid, userDid)
        )
      );
  } else {
    await db.insert(editorCollaborators).values({
      id: uuid(),
      projectId,
      userDid,
      accessLevel,
    });
  }
}

/**
 * Remove a collaborator from a project
 */
export async function removeCollaborator(
  projectId: string,
  userDid: string
): Promise<void> {
  // Don't allow removing the owner
  const collaborator = await db
    .select()
    .from(editorCollaborators)
    .where(
      and(
        eq(editorCollaborators.projectId, projectId),
        eq(editorCollaborators.userDid, userDid)
      )
    )
    .limit(1);

  if (collaborator[0]?.accessLevel === 'owner') {
    throw new Error('Cannot remove the project owner');
  }

  await db
    .delete(editorCollaborators)
    .where(
      and(
        eq(editorCollaborators.projectId, projectId),
        eq(editorCollaborators.userDid, userDid)
      )
    );
}

/**
 * Get collaborators for a project
 */
export async function getCollaborators(
  projectId: string
): Promise<Array<{ userDid: string; accessLevel: AccessLevel; createdAt: Date }>> {
  const results = await db
    .select()
    .from(editorCollaborators)
    .where(eq(editorCollaborators.projectId, projectId));

  return results.map((r) => ({
    userDid: r.userDid,
    accessLevel: r.accessLevel as AccessLevel,
    createdAt: r.createdAt ?? new Date(),
  }));
}

/**
 * Check if user has access to project
 */
export async function checkAccess(
  projectId: string,
  userDid: string
): Promise<AccessLevel | null> {
  const result = await db
    .select()
    .from(editorCollaborators)
    .where(
      and(
        eq(editorCollaborators.projectId, projectId),
        eq(editorCollaborators.userDid, userDid)
      )
    )
    .limit(1);

  return (result[0]?.accessLevel as AccessLevel) || null;
}

/**
 * Save a document snapshot
 */
export async function saveSnapshot(
  projectId: string,
  doc: Y.Doc
): Promise<number> {
  // Get current version
  const latestSnapshot = await db
    .select({ version: editorDocumentSnapshots.version })
    .from(editorDocumentSnapshots)
    .where(eq(editorDocumentSnapshots.projectId, projectId))
    .orderBy(desc(editorDocumentSnapshots.version))
    .limit(1);

  const version = (latestSnapshot[0]?.version || 0) + 1;

  // Encode state as base64
  const state = Y.encodeStateAsUpdate(doc);
  const base64State = Buffer.from(state).toString('base64');

  await db.insert(editorDocumentSnapshots).values({
    id: uuid(),
    projectId,
    snapshot: base64State,
    version,
  });

  // Clean up old snapshots (keep last 50)
  const allSnapshots = await db
    .select({ id: editorDocumentSnapshots.id })
    .from(editorDocumentSnapshots)
    .where(eq(editorDocumentSnapshots.projectId, projectId))
    .orderBy(desc(editorDocumentSnapshots.version));

  if (allSnapshots.length > 50) {
    const toDelete = allSnapshots.slice(50).map((s) => s.id);
    for (const id of toDelete) {
      await db.delete(editorDocumentSnapshots).where(eq(editorDocumentSnapshots.id, id));
    }
  }

  return version;
}

/**
 * Load the latest document snapshot
 */
export async function loadLatestSnapshot(
  projectId: string
): Promise<{ state: Uint8Array; version: number } | null> {
  const result = await db
    .select()
    .from(editorDocumentSnapshots)
    .where(eq(editorDocumentSnapshots.projectId, projectId))
    .orderBy(desc(editorDocumentSnapshots.version))
    .limit(1);

  const snapshot = result[0];
  if (!snapshot?.snapshot) {
    return null;
  }

  // Decode base64 to Uint8Array
  const buffer = Buffer.from(snapshot.snapshot, 'base64');
  return {
    state: new Uint8Array(buffer),
    version: snapshot.version,
  };
}

/**
 * Load a specific version of the document
 */
export async function loadSnapshotVersion(
  projectId: string,
  version: number
): Promise<Uint8Array | null> {
  const result = await db
    .select()
    .from(editorDocumentSnapshots)
    .where(
      and(
        eq(editorDocumentSnapshots.projectId, projectId),
        eq(editorDocumentSnapshots.version, version)
      )
    )
    .limit(1);

  const snapshot = result[0];
  if (!snapshot?.snapshot) {
    return null;
  }

  // Decode base64 to Uint8Array
  const buffer = Buffer.from(snapshot.snapshot, 'base64');
  return new Uint8Array(buffer);
}

/**
 * Get snapshot history
 */
export async function getSnapshotHistory(
  projectId: string,
  limit: number = 20
): Promise<Array<{ version: number; createdAt: Date }>> {
  const results = await db
    .select({
      version: editorDocumentSnapshots.version,
      createdAt: editorDocumentSnapshots.createdAt,
    })
    .from(editorDocumentSnapshots)
    .where(eq(editorDocumentSnapshots.projectId, projectId))
    .orderBy(desc(editorDocumentSnapshots.version))
    .limit(limit);

  return results.map((r) => ({
    version: r.version,
    createdAt: r.createdAt!,
  }));
}
