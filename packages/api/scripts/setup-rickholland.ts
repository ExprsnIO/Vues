/**
 * Setup script for rickholland
 * - Makes rickholland a superuser admin
 * - Adds all users as followers of rickholland
 *
 * Run with: npx tsx packages/api/scripts/setup-rickholland.ts
 */

import { db } from '../src/db/index.js';
import { users, adminUsers, follows } from '../src/db/schema.js';
import { eq, ne } from 'drizzle-orm';
import { nanoid } from 'nanoid';

async function setupRickholland() {
  console.log('Setting up rickholland...\n');

  // Find rickholland user
  const [rickholland] = await db
    .select()
    .from(users)
    .where(eq(users.handle, 'rickholland'))
    .limit(1);

  if (!rickholland) {
    console.error('User rickholland not found in the database.');
    console.log('\nAvailable users:');
    const allUsers = await db.select({ handle: users.handle }).from(users).limit(10);
    for (const u of allUsers) {
      console.log(`  - @${u.handle}`);
    }
    process.exit(1);
  }

  console.log(`Found rickholland: ${rickholland.did}`);

  // 1. Make rickholland a superuser admin
  console.log('\n1. Making rickholland a superuser admin...');

  // Check if already an admin
  const [existingAdmin] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.userDid, rickholland.did))
    .limit(1);

  if (existingAdmin) {
    // Update to super_admin if not already
    if (existingAdmin.role !== 'super_admin') {
      await db
        .update(adminUsers)
        .set({ role: 'super_admin', updatedAt: new Date() })
        .where(eq(adminUsers.userDid, rickholland.did));
      console.log(`  Updated @rickholland from ${existingAdmin.role} to super_admin`);
    } else {
      console.log('  @rickholland is already a super_admin');
    }
  } else {
    // Create new admin entry
    await db.insert(adminUsers).values({
      id: nanoid(),
      userDid: rickholland.did,
      role: 'super_admin',
      permissions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log('  Created super_admin entry for @rickholland');
  }

  // 2. Add all users as followers of rickholland
  console.log('\n2. Adding all users as followers of rickholland...');

  // Get all users except rickholland
  const otherUsers = await db
    .select()
    .from(users)
    .where(ne(users.did, rickholland.did));

  console.log(`  Found ${otherUsers.length} other users`);

  let addedCount = 0;
  let skippedCount = 0;

  for (const user of otherUsers) {
    // Check if already following
    const [existingFollow] = await db
      .select()
      .from(follows)
      .where(eq(follows.followerDid, user.did))
      .limit(1);

    const isFollowing = existingFollow && existingFollow.followeeDid === rickholland.did;

    if (isFollowing) {
      skippedCount++;
      continue;
    }

    // Create follow record
    const uri = `at://${user.did}/app.bsky.graph.follow/${nanoid()}`;
    const cid = nanoid(); // Simplified CID for this purpose

    try {
      await db.insert(follows).values({
        uri,
        cid,
        followerDid: user.did,
        followeeDid: rickholland.did,
        createdAt: new Date(),
        indexedAt: new Date(),
      });
      addedCount++;
    } catch (err) {
      // Likely a duplicate, skip
      skippedCount++;
    }
  }

  // Update rickholland's follower count
  await db
    .update(users)
    .set({ followerCount: otherUsers.length })
    .where(eq(users.did, rickholland.did));

  console.log(`  Added ${addedCount} new followers`);
  console.log(`  Skipped ${skippedCount} (already following)`);

  // Summary
  console.log('\n=== Setup Complete ===');
  console.log(`@rickholland is now:`);
  console.log(`  - Role: super_admin`);
  console.log(`  - Followers: ${otherUsers.length}`);
  console.log('\nYou can now:');
  console.log('  1. Access the admin panel at /admin');
  console.log('  2. View all followers on your profile');

  process.exit(0);
}

setupRickholland().catch((err) => {
  console.error('Failed to setup rickholland:', err);
  process.exit(1);
});
