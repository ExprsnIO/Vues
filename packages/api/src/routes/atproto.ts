import { Hono } from 'hono';
import { repositoryService } from '../services/repository/index.js';
import { syncService } from '../services/sync/index.js';
import { createAtprotoRepoRouter } from './atproto-repo.js';
import { createAtprotoSyncRouter } from './atproto-sync.js';

/**
 * AT Protocol Routes
 * Combines all AT Protocol XRPC endpoints
 */

const atprotoRouter = new Hono();

// Mount com.atproto.repo.* endpoints
const repoRouter = createAtprotoRepoRouter(repositoryService);
atprotoRouter.route('/', repoRouter);

// Mount com.atproto.sync.* endpoints
const syncRouter = createAtprotoSyncRouter(syncService);
atprotoRouter.route('/', syncRouter);

export { atprotoRouter };
export default atprotoRouter;
