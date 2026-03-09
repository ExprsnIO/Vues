/**
 * Admin user creation step
 *
 * Creates the first super_admin user during setup.
 */

import { db } from '@exprsn/api/db';
import { adminUsers, users } from '@exprsn/api/db';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import bcrypt from 'bcryptjs';

export interface AdminUserResult {
  success: boolean;
  admin: {
    id: string;
    userDid: string;
    handle: string;
    role: string;
  } | null;
  error?: string;
}

export interface AdminUserOptions {
  handle: string;
  email?: string;
  password: string;
  displayName?: string;
}

/**
 * Create the first admin user
 *
 * This creates both the user account and grants super_admin privileges.
 */
export async function createAdminUser(options: AdminUserOptions): Promise<AdminUserResult> {
  try {
    // Validate input
    if (!options.handle || options.handle.length < 3) {
      return {
        success: false,
        admin: null,
        error: 'Handle must be at least 3 characters',
      };
    }

    if (!options.password || options.password.length < 8) {
      return {
        success: false,
        admin: null,
        error: 'Password must be at least 8 characters',
      };
    }

    // Check if handle already exists
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.handle, options.handle))
      .limit(1);

    let userDid: string;

    if (existingUser) {
      userDid = existingUser.did;
    } else {
      // Create new user
      userDid = `did:plc:${nanoid(24)}`;

      await db.insert(users).values({
        did: userDid,
        handle: options.handle,
        displayName: options.displayName || options.handle,
        verified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        indexedAt: new Date(),
      });
    }

    // Check if user is already an admin
    const [existingAdmin] = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.userDid, userDid))
      .limit(1);

    if (existingAdmin) {
      return {
        success: true,
        admin: {
          id: existingAdmin.id,
          userDid: existingAdmin.userDid,
          handle: options.handle,
          role: existingAdmin.role,
        },
      };
    }

    // Hash password for admin authentication
    const passwordHash = await bcrypt.hash(options.password, 12);

    // Create admin user with super_admin role
    const adminId = nanoid();
    await db.insert(adminUsers).values({
      id: adminId,
      userDid,
      role: 'super_admin',
      permissions: [
        'users.view',
        'users.manage',
        'content.view',
        'content.moderate',
        'content.delete',
        'reports.view',
        'reports.manage',
        'analytics.view',
        'settings.view',
        'settings.manage',
        'admins.view',
        'admins.manage',
        'federation.view',
        'federation.manage',
        'ca.view',
        'ca.manage',
        'infrastructure.view',
        'infrastructure.manage',
      ],
    });

    // Store password hash in system config for admin login
    // Note: In production, this should use a proper admin auth table
    const { systemConfig } = await import('@exprsn/api/db');
    await db
      .insert(systemConfig)
      .values({
        key: `admin_password:${adminId}`,
        value: { hash: passwordHash, email: options.email },
        description: 'Admin user credentials',
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: systemConfig.key,
        set: {
          value: { hash: passwordHash, email: options.email },
          updatedAt: new Date(),
        },
      });

    return {
      success: true,
      admin: {
        id: adminId,
        userDid,
        handle: options.handle,
        role: 'super_admin',
      },
    };
  } catch (error) {
    return {
      success: false,
      admin: null,
      error: error instanceof Error ? error.message : 'Failed to create admin user',
    };
  }
}

/**
 * Check if any admin users exist
 */
export async function hasAdminUsers(): Promise<boolean> {
  const [admin] = await db.select().from(adminUsers).limit(1);
  return !!admin;
}

/**
 * Get the count of admin users
 */
export async function getAdminCount(): Promise<number> {
  const result = await db.select().from(adminUsers);
  return result.length;
}
