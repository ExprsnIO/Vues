# AT Protocol Integration Guide

This guide shows how to integrate the new AT Protocol endpoints into the Exprsn API server.

## Files Created

### New Route Files
- `/packages/api/src/routes/atproto.ts` - Main AT Protocol router
- `/packages/api/src/routes/atproto-repo.ts` - Repository XRPC endpoints
- `/packages/api/src/routes/atproto-sync.ts` - Sync XRPC endpoints

### New Service Files
- `/packages/api/src/services/repository/index.ts` - Repository service
- `/packages/api/src/services/sync/index.ts` - Sync service

### Database Schema Updates
- Added tables to `/packages/api/src/db/schema.ts`:
  - `repositories` - User repositories
  - `repo_records` - Records in repositories
  - `repo_blobs` - Binary content
  - `repo_commits` - Commit history
  - `sync_subscriptions` - Firehose subscriptions
  - `sync_events` - Firehose events

## Integration Steps

### 1. Import the New Router

In `/packages/api/src/index.ts`, add the import:

```typescript
import { atprotoRouter } from './routes/atproto.js';
```

### 2. Mount the Router

Find the section where routes are mounted (around line 240) and add:

```typescript
// AT Protocol endpoints
app.route('/xrpc', atprotoRouter);
```

This should be placed alongside the other XRPC routes like:

```typescript
app.route('/xrpc', authRouter);
app.route('/xrpc', xrpcRouter);
app.route('/xrpc', atprotoRouter);  // <-- Add this line
app.route('/xrpc', settingsRouter);
// ... etc
```

### 3. Run Database Migration

Generate and apply the migration for the new tables:

```bash
# Generate migration from schema changes
pnpm db:generate

# Apply migration to database
pnpm db:migrate

# Or for development, push directly
pnpm db:push
```

### 4. Environment Variables

No new environment variables are required. The endpoints use existing configuration.

### 5. Test the Endpoints

Start the development server:

```bash
pnpm dev
```

#### Test Repository Creation

```bash
# Create a record (requires authentication)
curl -X POST http://localhost:3000/xrpc/com.atproto.repo.createRecord \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "repo": "did:plc:YOUR_DID",
    "collection": "io.exprsn.video.post",
    "record": {
      "$type": "io.exprsn.video.post",
      "title": "Test Video",
      "createdAt": "'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'"
    }
  }'
```

#### Test Repository Listing

```bash
# List records in a collection
curl "http://localhost:3000/xrpc/com.atproto.repo.listRecords?repo=did:plc:YOUR_DID&collection=io.exprsn.video.post"
```

#### Test Repository Description

```bash
# Describe a repository
curl "http://localhost:3000/xrpc/com.atproto.repo.describeRepo?repo=did:plc:YOUR_DID"
```

#### Test Sync Endpoints

```bash
# Get repository head
curl "http://localhost:3000/xrpc/com.atproto.sync.getHead?did=did:plc:YOUR_DID"

# List repositories
curl "http://localhost:3000/xrpc/com.atproto.sync.listRepos?limit=10"

# List blobs
curl "http://localhost:3000/xrpc/com.atproto.sync.listBlobs?did=did:plc:YOUR_DID"
```

#### Test Firehose Subscription (WebSocket)

```javascript
const ws = new WebSocket('ws://localhost:3000/xrpc/com.atproto.sync.subscribeRepos?cursor=0');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Firehose event:', data);
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};
```

#### Test Firehose Subscription (SSE)

```javascript
const eventSource = new EventSource('http://localhost:3000/xrpc/com.atproto.sync.subscribeRepos?cursor=0');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('SSE event:', data);
};

eventSource.onerror = (error) => {
  console.error('SSE error:', error);
};
```

## New API Endpoints Available

### com.atproto.repo.* (Repository Operations)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/xrpc/com.atproto.repo.createRecord` | Create a new record |
| GET | `/xrpc/com.atproto.repo.getRecord` | Get a specific record |
| GET | `/xrpc/com.atproto.repo.listRecords` | List records in collection |
| POST | `/xrpc/com.atproto.repo.putRecord` | Update/create record |
| POST | `/xrpc/com.atproto.repo.deleteRecord` | Delete a record |
| POST | `/xrpc/com.atproto.repo.applyWrites` | Atomic multi-write |
| GET | `/xrpc/com.atproto.repo.describeRepo` | Get repo metadata |
| POST | `/xrpc/com.atproto.repo.uploadBlob` | Upload binary content |

### com.atproto.sync.* (Synchronization)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/xrpc/com.atproto.sync.getBlob` | Fetch blob by CID |
| GET | `/xrpc/com.atproto.sync.getBlocks` | Get repo blocks |
| GET | `/xrpc/com.atproto.sync.getCheckout` | Full repo checkout |
| GET | `/xrpc/com.atproto.sync.getHead` | Current commit CID |
| GET | `/xrpc/com.atproto.sync.getLatestCommit` | Latest commit |
| GET | `/xrpc/com.atproto.sync.getRecord` | Record with proof |
| GET | `/xrpc/com.atproto.sync.getRepo` | Full repository |
| GET | `/xrpc/com.atproto.sync.listBlobs` | List blobs |
| GET | `/xrpc/com.atproto.sync.listRepos` | List repositories |
| GET | `/xrpc/com.atproto.sync.subscribeRepos` | Subscribe to firehose |
| POST | `/xrpc/com.atproto.sync.notifyOfUpdate` | Notify of update |
| POST | `/xrpc/com.atproto.sync.requestCrawl` | Request crawl |

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   API Server (Hono)                 │
├─────────────────────────────────────────────────────┤
│                                                      │
│  /xrpc/com.atproto.repo.*                          │
│  ┌────────────────────────────────────────────┐    │
│  │     atproto-repo.ts (Route Handler)        │    │
│  │  - createRecord, getRecord, listRecords    │    │
│  │  - putRecord, deleteRecord, applyWrites    │    │
│  │  - describeRepo, uploadBlob                │    │
│  └───────────────────┬────────────────────────┘    │
│                      │                              │
│                      ▼                              │
│  ┌────────────────────────────────────────────┐    │
│  │  repository/index.ts (Service Layer)       │    │
│  │  - Repository management                   │    │
│  │  - Record CRUD operations                  │    │
│  │  - Blob storage                            │    │
│  │  - Transaction handling                    │    │
│  └───────────────────┬────────────────────────┘    │
│                      │                              │
│                      ▼                              │
│  ┌────────────────────────────────────────────┐    │
│  │         Database (PostgreSQL/SQLite)       │    │
│  │  - repositories, repo_records              │    │
│  │  - repo_blobs, repo_commits                │    │
│  └────────────────────────────────────────────┘    │
│                                                      │
│  /xrpc/com.atproto.sync.*                          │
│  ┌────────────────────────────────────────────┐    │
│  │     atproto-sync.ts (Route Handler)        │    │
│  │  - getBlob, getBlocks, getRepo             │    │
│  │  - listRepos, listBlobs                    │    │
│  │  - subscribeRepos (WebSocket/SSE)          │    │
│  └───────────────────┬────────────────────────┘    │
│                      │                              │
│                      ▼                              │
│  ┌────────────────────────────────────────────┐    │
│  │    sync/index.ts (Service Layer)           │    │
│  │  - Firehose event streaming                │    │
│  │  - Repository synchronization              │    │
│  │  - Blob fetching                           │    │
│  │  - Event broadcasting (EventEmitter)       │    │
│  └───────────────────┬────────────────────────┘    │
│                      │                              │
│                      ▼                              │
│  ┌────────────────────────────────────────────┐    │
│  │         Database (PostgreSQL/SQLite)       │    │
│  │  - sync_subscriptions, sync_events         │    │
│  └────────────────────────────────────────────┘    │
│                                                      │
└─────────────────────────────────────────────────────┘
```

## Data Flow Examples

### Creating a Video Post (Full Stack)

```
User Action
    │
    ▼
Web/Mobile App
    │ POST /xrpc/io.exprsn.video.createPost
    ▼
API Server (xrpc.ts)
    │
    ├─► Upload video to S3
    │
    ├─► Create video record in videos table
    │
    └─► Call repositoryService.createRecord()
            │
            ▼
        Repository Service
            │
            ├─► Generate TID (rkey)
            ├─► Create CID (content hash)
            ├─► Insert into repo_records
            ├─► Update repositories.rev
            │
            └─► Call syncService.emitCommitEvent()
                    │
                    ▼
                Sync Service (Firehose)
                    │
                    ├─► Store in sync_events
                    ├─► Increment sequence number
                    │
                    └─► Broadcast to WebSocket/SSE subscribers
                            │
                            ▼
                        Remote Instances
                        (Federation)
```

### Subscribing to Firehose

```
Remote Instance
    │
    ▼
WebSocket Connection
    │ GET /xrpc/com.atproto.sync.subscribeRepos?cursor=0
    ▼
Sync Service
    │
    ├─► Load historical events from sync_events (seq > cursor)
    │       │
    │       └─► Send via WebSocket
    │
    └─► Subscribe to live events (EventEmitter)
            │
            └─► Forward new events as they occur
                    │
                    ▼
                Remote Instance
                (Stays in sync)
```

## Best Practices

### 1. Repository Operations
- Always validate records against lexicon schemas
- Use TIDs (timestamp IDs) for record keys
- Batch operations with `applyWrites` when possible
- Handle CID mismatches with swap parameters

### 2. Firehose Subscription
- Store cursor position for resume capability
- Implement exponential backoff on errors
- Handle connection drops gracefully
- Process events asynchronously to avoid blocking

### 3. Blob Storage
- Verify CIDs match content
- Use CDN for blob delivery
- Implement garbage collection for unused blobs
- Compress large blobs before storage

### 4. Federation
- Validate remote DIDs before trusting content
- Implement rate limiting per remote host
- Cache frequently accessed remote content
- Respect remote instance moderation policies

## Troubleshooting

### Issue: "Repository not found"
**Solution:** Ensure repository is initialized:
```typescript
await repositoryService.initializeRepo(did);
```

### Issue: "Record CID mismatch"
**Solution:** Use correct swap CID when updating:
```typescript
await repositoryService.putRecord({
  did,
  collection,
  rkey,
  record,
  swapRecord: currentCid,  // Must match current CID
});
```

### Issue: "Firehose not emitting events"
**Solution:** Ensure commits are being emitted:
```typescript
import { syncService } from './services/sync';

// After creating/updating record
await syncService.emitCommitEvent(did, commitCid, [
  { action: 'create', path: `${collection}/${rkey}`, cid },
]);
```

### Issue: "WebSocket connection fails"
**Solution:** Check Deno WebSocket availability. Fallback to SSE:
```typescript
// Server detects upgrade header and uses WebSocket if available
// Otherwise falls back to SSE automatically
```

## Performance Considerations

### Database Indexes
All critical queries are indexed:
- `repo_records` has composite index on `(did, collection, rkey)`
- `sync_events` has index on `seq` for cursor queries
- `repositories` has index on `did` for fast lookups

### Caching Strategy
- Cache DID documents (1 hour TTL)
- Cache repository heads (5 minute TTL)
- Cache blob URLs (permanent, content-addressed)

### Connection Pooling
```typescript
// PostgreSQL connection pool (default)
max: 20,
min: 2,
idle: 10000,
```

## Security

### Authentication
All write operations require authentication:
```typescript
router.post('/com.atproto.repo.createRecord', authMiddleware, async (c) => {
  const userDid = c.get('did');
  // Only allow creating records in own repository
  if (body.repo !== userDid) {
    throw new HTTPException(403);
  }
});
```

### Authorization
- Users can only modify their own repositories
- Admin operations require admin role
- DID ownership verified via JWT

### Input Validation
- All inputs sanitized
- Record schemas validated against lexicons
- CIDs verified against content
- Signatures checked for operations

## Monitoring

### Metrics to Track
- Repository count: `SELECT COUNT(*) FROM repositories`
- Records per collection: `SELECT collection, COUNT(*) FROM repo_records GROUP BY collection`
- Firehose lag: `SELECT MAX(seq) - cursor FROM sync_subscriptions`
- Event throughput: Events/second from `sync_events`

### Health Checks
```typescript
// Check if firehose is running
GET /xrpc/com.atproto.sync.listRepos?limit=1

// Check if repositories are accessible
GET /xrpc/com.atproto.repo.describeRepo?repo=did:plc:test
```

## Next Steps

1. **Test the integration** - Run all test endpoints
2. **Monitor logs** - Check for any errors during startup
3. **Create test records** - Verify CRUD operations work
4. **Test firehose** - Subscribe and verify events flow
5. **Load test** - Ensure performance is acceptable

## Support

For issues or questions:
- Check logs in `console.log` output
- Review database schema in `packages/api/src/db/schema.ts`
- Read full implementation details in `DID_EXPRSN_IMPLEMENTATION.md`

---

**Integration Status:** Ready for testing
**Last Updated:** 2026-03-09
