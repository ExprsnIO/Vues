/**
 * Fix rickholland handle and verify password
 * Run: cd packages/api && npx tsx scripts/fix-handle.ts
 */
import { db } from '../src/db/index.js';
import { actorRepos } from '../src/db/schema.js';
import { like, eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

async function main() {
  // Show current state
  const actors = await db
    .select({ did: actorRepos.did, handle: actorRepos.handle, email: actorRepos.email, didMethod: actorRepos.didMethod })
    .from(actorRepos)
    .where(like(actorRepos.handle, '%rick%'));
  console.log('Current actorRepos:', JSON.stringify(actors, null, 2));

  // The login looks up by exact handle match
  // Update handle to just 'rickholland' so login works with that
  for (const actor of actors) {
    if (actor.handle === 'rickholland.exprsn.io') {
      await db
        .update(actorRepos)
        .set({ handle: 'rickholland' })
        .where(eq(actorRepos.did, actor.did));
      console.log(`\nUpdated handle: ${actor.handle} → rickholland`);
    }
  }

  // Verify password works
  const [account] = await db
    .select()
    .from(actorRepos)
    .where(eq(actorRepos.handle, 'rickholland'))
    .limit(1);

  if (account) {
    const valid = await bcrypt.compare('exprsn2026', account.passwordHash || '');
    console.log(`\nPassword verification: ${valid ? 'PASS' : 'FAIL'}`);
    console.log(`DID: ${account.did}`);
    console.log(`Handle: ${account.handle}`);
    console.log(`Email: ${account.email}`);
    console.log(`Method: ${account.didMethod}`);
  } else {
    console.log('\nNo account found with handle "rickholland"');
  }

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
