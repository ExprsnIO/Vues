import { db } from '../src/db/index.js';
import { sql } from 'drizzle-orm';
async function main() {
  const cols = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'videos' ORDER BY ordinal_position`);
  console.log(JSON.stringify((cols as any[]).map((c: any) => c.column_name)));
  process.exit(0);
}
main();
