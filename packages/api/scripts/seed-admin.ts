/**
 * Seed admin users
 *
 * Run with: pnpm --filter @exprsn/api seed:admin
 */

import { db } from '../src/db/index.js';
import { users, adminUsers } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

async function seedAdmin() {
  console.log('Seeding admin users...');

  // Get existing users to promote to admin
  const existingUsers = await db.select().from(users).limit(5);

  if (existingUsers.length === 0) {
    console.log('No users found. Please run seed:community first.');
    process.exit(1);
  }

  // Clear existing admin users
  await db.delete(adminUsers);
  console.log('Cleared existing admin users');

  // Make the first user a super admin
  const superAdmin = existingUsers[0];
  await db.insert(adminUsers).values({
    id: nanoid(),
    userDid: superAdmin.did,
    role: 'super_admin',
    permissions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  console.log(`Created super_admin: @${superAdmin.handle}`);

  // Make additional users moderators if available
  if (existingUsers.length > 1) {
    const moderator = existingUsers[1];
    await db.insert(adminUsers).values({
      id: nanoid(),
      userDid: moderator.did,
      role: 'moderator',
      permissions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log(`Created moderator: @${moderator.handle}`);
  }

  if (existingUsers.length > 2) {
    const support = existingUsers[2];
    await db.insert(adminUsers).values({
      id: nanoid(),
      userDid: support.did,
      role: 'support',
      permissions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log(`Created support: @${support.handle}`);
  }

  console.log('\nAdmin users created successfully!');
  console.log('\nAdmin accounts:');
  const admins = await db
    .select({
      role: adminUsers.role,
      handle: users.handle,
    })
    .from(adminUsers)
    .leftJoin(users, eq(adminUsers.userDid, users.did));

  for (const admin of admins) {
    console.log(`  - @${admin.handle} (${admin.role})`);
  }

  console.log('\nTo access the admin panel:');
  console.log('  1. Log in as one of the admin accounts');
  console.log('  2. Navigate to http://localhost:3001/admin');

  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error('Failed to seed admin users:', err);
  process.exit(1);
});
