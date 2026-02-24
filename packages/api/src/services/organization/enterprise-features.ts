import { eq, and, desc, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../../db/index.js';
import {
  organizationCustomData,
  organizationActivity,
  organizationMembers,
  users,
} from '../../db/schema.js';
import type { EnterpriseDepartment, ComplianceSetting } from '@exprsn/shared';

/**
 * Enterprise Feature Service
 *
 * Provides functionality for enterprise organizations:
 * - Department hierarchy management
 * - Compliance settings
 * - Audit logging
 */
export class EnterpriseFeatureService {
  // ============================================
  // Department Management
  // ============================================

  /**
   * Create a department
   */
  static async createDepartment(
    organizationId: string,
    data: Omit<EnterpriseDepartment, 'id' | 'organizationId' | 'memberCount' | 'children' | 'head'>,
    createdBy: string
  ): Promise<EnterpriseDepartment> {
    // If parentId provided, verify parent exists
    if (data.parentId) {
      const parent = await this.getDepartment(organizationId, data.parentId);
      if (!parent) {
        throw new Error('Parent department not found');
      }
    }

    const deptId = nanoid();

    await db.insert(organizationCustomData).values({
      id: deptId,
      organizationId,
      dataType: 'department',
      data: { ...data, organizationId, memberCount: 0 },
      parentId: data.parentId,
      status: 'active',
    });

    // Log activity
    await db.insert(organizationActivity).values({
      id: nanoid(),
      organizationId,
      actorDid: createdBy,
      action: 'department_created',
      targetType: 'department',
      targetId: deptId,
      details: { name: data.name, parentId: data.parentId },
    });

    return {
      id: deptId,
      organizationId,
      ...data,
      memberCount: 0,
    };
  }

  /**
   * Update department
   */
  static async updateDepartment(
    organizationId: string,
    deptId: string,
    updates: Partial<EnterpriseDepartment>,
    updatedBy: string
  ): Promise<EnterpriseDepartment> {
    const existing = await db
      .select()
      .from(organizationCustomData)
      .where(
        and(
          eq(organizationCustomData.id, deptId),
          eq(organizationCustomData.organizationId, organizationId),
          eq(organizationCustomData.dataType, 'department')
        )
      )
      .limit(1);

    if (!existing[0]) {
      throw new Error('Department not found');
    }

    // Prevent circular parent references
    if (updates.parentId) {
      if (updates.parentId === deptId) {
        throw new Error('Department cannot be its own parent');
      }
      // Check if new parent is a descendant
      const descendants = await this.getDepartmentDescendants(organizationId, deptId);
      if (descendants.some(d => d.id === updates.parentId)) {
        throw new Error('Cannot set a descendant as parent');
      }
    }

    const currentData = existing[0].data as EnterpriseDepartment;
    const newData = { ...currentData, ...updates, id: deptId };

    await db
      .update(organizationCustomData)
      .set({
        data: newData,
        parentId: updates.parentId !== undefined ? updates.parentId : existing[0].parentId,
        updatedAt: new Date(),
      })
      .where(eq(organizationCustomData.id, deptId));

    // Log activity
    await db.insert(organizationActivity).values({
      id: nanoid(),
      organizationId,
      actorDid: updatedBy,
      action: 'department_updated',
      targetType: 'department',
      targetId: deptId,
      details: { updatedFields: Object.keys(updates) },
    });

    return newData;
  }

  /**
   * Get department by ID
   */
  static async getDepartment(
    organizationId: string,
    deptId: string
  ): Promise<EnterpriseDepartment | null> {
    const result = await db
      .select()
      .from(organizationCustomData)
      .where(
        and(
          eq(organizationCustomData.id, deptId),
          eq(organizationCustomData.organizationId, organizationId),
          eq(organizationCustomData.dataType, 'department')
        )
      )
      .limit(1);

    if (!result[0]) return null;

    const data = result[0].data as Omit<EnterpriseDepartment, 'id' | 'head'>;

    // Get head user if specified
    let head: EnterpriseDepartment['head'];
    if (data.headUserDid) {
      const headUser = await db
        .select()
        .from(users)
        .where(eq(users.did, data.headUserDid))
        .limit(1);

      if (headUser[0]) {
        head = {
          did: headUser[0].did,
          handle: headUser[0].handle,
          displayName: headUser[0].displayName || undefined,
          avatar: headUser[0].avatar || undefined,
        };
      }
    }

    return { id: result[0].id, ...data, head };
  }

  /**
   * Get all departments (flat list)
   */
  static async getDepartments(
    organizationId: string,
    options?: {
      parentId?: string | null;
      limit?: number;
      offset?: number;
    }
  ): Promise<EnterpriseDepartment[]> {
    let whereClause = and(
      eq(organizationCustomData.organizationId, organizationId),
      eq(organizationCustomData.dataType, 'department'),
      eq(organizationCustomData.status, 'active')
    );

    // Filter by parent if specified
    if (options?.parentId !== undefined) {
      if (options.parentId === null) {
        whereClause = and(whereClause, isNull(organizationCustomData.parentId));
      } else {
        whereClause = and(whereClause, eq(organizationCustomData.parentId, options.parentId));
      }
    }

    const results = await db
      .select()
      .from(organizationCustomData)
      .where(whereClause)
      .orderBy(desc(organizationCustomData.createdAt))
      .limit(options?.limit || 100)
      .offset(options?.offset || 0);

    // Get all head user DIDs
    const headDids = results
      .map(r => (r.data as EnterpriseDepartment).headUserDid)
      .filter(Boolean) as string[];

    // Batch fetch head users
    const headMap = new Map<string, typeof users.$inferSelect>();
    for (const did of headDids) {
      const user = await db.select().from(users).where(eq(users.did, did)).limit(1);
      if (user[0]) headMap.set(did, user[0]);
    }

    return results.map(r => {
      const data = r.data as Omit<EnterpriseDepartment, 'id' | 'head'>;
      const headUser = data.headUserDid ? headMap.get(data.headUserDid) : undefined;

      return {
        id: r.id,
        ...data,
        head: headUser
          ? {
              did: headUser.did,
              handle: headUser.handle,
              displayName: headUser.displayName || undefined,
              avatar: headUser.avatar || undefined,
            }
          : undefined,
      };
    });
  }

  /**
   * Get department hierarchy (tree structure)
   */
  static async getDepartmentHierarchy(
    organizationId: string
  ): Promise<EnterpriseDepartment[]> {
    // Get all departments
    const allDepts = await this.getDepartments(organizationId);

    // Build tree structure
    const deptMap = new Map<string, EnterpriseDepartment & { children: EnterpriseDepartment[] }>();
    const rootDepts: (EnterpriseDepartment & { children: EnterpriseDepartment[] })[] = [];

    // Initialize all departments with empty children arrays
    for (const dept of allDepts) {
      deptMap.set(dept.id, { ...dept, children: [] });
    }

    // Build parent-child relationships
    for (const dept of allDepts) {
      const deptWithChildren = deptMap.get(dept.id)!;
      if (dept.parentId && deptMap.has(dept.parentId)) {
        deptMap.get(dept.parentId)!.children.push(deptWithChildren);
      } else {
        rootDepts.push(deptWithChildren);
      }
    }

    return rootDepts;
  }

  /**
   * Get all descendants of a department
   */
  static async getDepartmentDescendants(
    organizationId: string,
    deptId: string
  ): Promise<EnterpriseDepartment[]> {
    const allDepts = await this.getDepartments(organizationId);
    const descendants: EnterpriseDepartment[] = [];

    const findDescendants = (parentId: string) => {
      const children = allDepts.filter(d => d.parentId === parentId);
      for (const child of children) {
        descendants.push(child);
        findDescendants(child.id);
      }
    };

    findDescendants(deptId);
    return descendants;
  }

  /**
   * Set department head
   */
  static async setDepartmentHead(
    organizationId: string,
    deptId: string,
    headUserDid: string | null,
    setBy: string
  ): Promise<void> {
    if (headUserDid) {
      // Verify user exists and is a member
      const member = await db
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, organizationId),
            eq(organizationMembers.userDid, headUserDid)
          )
        )
        .limit(1);

      if (!member[0]) {
        throw new Error('User must be an organization member to be department head');
      }
    }

    await this.updateDepartment(
      organizationId,
      deptId,
      { headUserDid: headUserDid || undefined },
      setBy
    );
  }

  /**
   * Delete department (soft delete)
   */
  static async deleteDepartment(
    organizationId: string,
    deptId: string,
    deletedBy: string,
    reassignChildrenTo?: string
  ): Promise<void> {
    // Check for children
    const children = await this.getDepartments(organizationId, { parentId: deptId });

    if (children.length > 0 && !reassignChildrenTo) {
      throw new Error('Cannot delete department with children. Provide reassignChildrenTo or delete children first.');
    }

    // Reassign children if specified
    if (children.length > 0 && reassignChildrenTo) {
      for (const child of children) {
        await this.updateDepartment(
          organizationId,
          child.id,
          { parentId: reassignChildrenTo },
          deletedBy
        );
      }
    }

    // Soft delete
    await db
      .update(organizationCustomData)
      .set({
        status: 'archived',
        updatedAt: new Date(),
      })
      .where(eq(organizationCustomData.id, deptId));

    // Log activity
    await db.insert(organizationActivity).values({
      id: nanoid(),
      organizationId,
      actorDid: deletedBy,
      action: 'department_deleted',
      targetType: 'department',
      targetId: deptId,
      details: { reassignedChildrenTo: reassignChildrenTo },
    });
  }

  // ============================================
  // Compliance Settings
  // ============================================

  /**
   * Create compliance setting
   */
  static async createComplianceSetting(
    organizationId: string,
    data: Omit<ComplianceSetting, 'id' | 'organizationId'>,
    createdBy: string
  ): Promise<ComplianceSetting> {
    const settingId = nanoid();

    await db.insert(organizationCustomData).values({
      id: settingId,
      organizationId,
      dataType: 'compliance_setting',
      data: { ...data, organizationId },
      status: 'active',
    });

    // Log activity
    await db.insert(organizationActivity).values({
      id: nanoid(),
      organizationId,
      actorDid: createdBy,
      action: 'compliance_setting_created',
      targetType: 'compliance',
      targetId: settingId,
      details: { name: data.name, type: data.type, category: data.category },
    });

    return { id: settingId, organizationId, ...data };
  }

  /**
   * Update compliance setting
   */
  static async updateComplianceSetting(
    organizationId: string,
    settingId: string,
    updates: Partial<ComplianceSetting>,
    updatedBy: string
  ): Promise<ComplianceSetting> {
    const existing = await db
      .select()
      .from(organizationCustomData)
      .where(
        and(
          eq(organizationCustomData.id, settingId),
          eq(organizationCustomData.organizationId, organizationId),
          eq(organizationCustomData.dataType, 'compliance_setting')
        )
      )
      .limit(1);

    if (!existing[0]) {
      throw new Error('Compliance setting not found');
    }

    const currentData = existing[0].data as ComplianceSetting;
    const newData = { ...currentData, ...updates, id: settingId };

    await db
      .update(organizationCustomData)
      .set({
        data: newData,
        updatedAt: new Date(),
      })
      .where(eq(organizationCustomData.id, settingId));

    // Log activity
    await db.insert(organizationActivity).values({
      id: nanoid(),
      organizationId,
      actorDid: updatedBy,
      action: 'compliance_setting_updated',
      targetType: 'compliance',
      targetId: settingId,
      details: { updatedFields: Object.keys(updates) },
    });

    return newData;
  }

  /**
   * Get compliance setting by ID
   */
  static async getComplianceSetting(
    organizationId: string,
    settingId: string
  ): Promise<ComplianceSetting | null> {
    const result = await db
      .select()
      .from(organizationCustomData)
      .where(
        and(
          eq(organizationCustomData.id, settingId),
          eq(organizationCustomData.organizationId, organizationId),
          eq(organizationCustomData.dataType, 'compliance_setting')
        )
      )
      .limit(1);

    if (!result[0]) return null;

    return { id: result[0].id, ...(result[0].data as Omit<ComplianceSetting, 'id'>) };
  }

  /**
   * List compliance settings
   */
  static async getComplianceSettings(
    organizationId: string,
    options?: {
      category?: string;
      type?: ComplianceSetting['type'];
      enforcementLevel?: ComplianceSetting['enforcementLevel'];
      departmentId?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<ComplianceSetting[]> {
    const results = await db
      .select()
      .from(organizationCustomData)
      .where(
        and(
          eq(organizationCustomData.organizationId, organizationId),
          eq(organizationCustomData.dataType, 'compliance_setting'),
          eq(organizationCustomData.status, 'active')
        )
      )
      .orderBy(desc(organizationCustomData.createdAt))
      .limit(options?.limit || 100)
      .offset(options?.offset || 0);

    let settings = results.map(r => ({
      id: r.id,
      ...(r.data as Omit<ComplianceSetting, 'id'>),
    }));

    // Apply filters
    if (options?.category) {
      settings = settings.filter(s => s.category === options.category);
    }
    if (options?.type) {
      settings = settings.filter(s => s.type === options.type);
    }
    if (options?.enforcementLevel) {
      settings = settings.filter(s => s.enforcementLevel === options.enforcementLevel);
    }
    if (options?.departmentId) {
      settings = settings.filter(
        s => s.appliesTo.includes('all') || s.appliesTo.includes(options.departmentId!)
      );
    }

    return settings;
  }

  /**
   * Get compliance settings applicable to a department
   */
  static async getDepartmentComplianceSettings(
    organizationId: string,
    departmentId: string
  ): Promise<ComplianceSetting[]> {
    // Get the department and all ancestors
    const dept = await this.getDepartment(organizationId, departmentId);
    if (!dept) {
      throw new Error('Department not found');
    }

    const departmentIds = [departmentId];

    // Walk up the hierarchy to get parent department IDs
    let currentParentId = dept.parentId;
    while (currentParentId) {
      departmentIds.push(currentParentId);
      const parent = await this.getDepartment(organizationId, currentParentId);
      currentParentId = parent?.parentId;
    }

    // Get all settings
    const allSettings = await this.getComplianceSettings(organizationId);

    // Filter to settings that apply to this department or any ancestor
    return allSettings.filter(
      s => s.appliesTo.includes('all') || s.appliesTo.some(id => departmentIds.includes(id))
    );
  }

  /**
   * Delete compliance setting
   */
  static async deleteComplianceSetting(
    organizationId: string,
    settingId: string,
    deletedBy: string
  ): Promise<void> {
    await db
      .update(organizationCustomData)
      .set({
        status: 'archived',
        updatedAt: new Date(),
      })
      .where(eq(organizationCustomData.id, settingId));

    // Log activity
    await db.insert(organizationActivity).values({
      id: nanoid(),
      organizationId,
      actorDid: deletedBy,
      action: 'compliance_setting_deleted',
      targetType: 'compliance',
      targetId: settingId,
    });
  }

  // ============================================
  // Statistics
  // ============================================

  /**
   * Get enterprise statistics
   */
  static async getEnterpriseStats(organizationId: string): Promise<{
    totalDepartments: number;
    rootDepartments: number;
    maxDepth: number;
    totalComplianceSettings: number;
    settingsByCategory: Record<string, number>;
    settingsByType: Record<string, number>;
    settingsByEnforcement: Record<string, number>;
  }> {
    const departments = await this.getDepartments(organizationId);
    const settings = await this.getComplianceSettings(organizationId);

    // Calculate max depth
    const hierarchy = await this.getDepartmentHierarchy(organizationId);
    const calculateDepth = (dept: EnterpriseDepartment & { children?: EnterpriseDepartment[] }, depth: number): number => {
      if (!dept.children || dept.children.length === 0) return depth;
      return Math.max(...dept.children.map(c => calculateDepth(c as EnterpriseDepartment & { children?: EnterpriseDepartment[] }, depth + 1)));
    };
    const maxDepth = hierarchy.length > 0
      ? Math.max(...hierarchy.map(d => calculateDepth(d as EnterpriseDepartment & { children?: EnterpriseDepartment[] }, 1)))
      : 0;

    const settingsByCategory: Record<string, number> = {};
    const settingsByType: Record<string, number> = {};
    const settingsByEnforcement: Record<string, number> = {};

    for (const setting of settings) {
      settingsByCategory[setting.category] = (settingsByCategory[setting.category] || 0) + 1;
      settingsByType[setting.type] = (settingsByType[setting.type] || 0) + 1;
      settingsByEnforcement[setting.enforcementLevel] = (settingsByEnforcement[setting.enforcementLevel] || 0) + 1;
    }

    return {
      totalDepartments: departments.length,
      rootDepartments: hierarchy.length,
      maxDepth,
      totalComplianceSettings: settings.length,
      settingsByCategory,
      settingsByType,
      settingsByEnforcement,
    };
  }
}
