# did:exprsn Platform Implementation Summary

This document outlines the current state and recent advancements of the **did:exprsn** AT Protocol-based decentralized identity and video platform.

## Overview

Exprsn is built on the AT Protocol (ATProto), the same protocol powering Bluesky. It extends the protocol with video-specific features while maintaining full compatibility with the broader AT Protocol ecosystem.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Exprsn Platform                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Web App    │  │  Mobile App  │  │  Admin UI    │     │
│  │  (Next.js)   │  │   (Expo)     │  │              │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                  │                  │              │
│         └──────────────────┴──────────────────┘              │
│                            │                                 │
│                    ┌───────▼────────┐                       │
│                    │   API Server   │                       │
│                    │   (Hono)       │                       │
│                    └───────┬────────┘                       │
│                            │                                 │
│         ┌──────────────────┼──────────────────┐             │
│         │                  │                  │             │
│  ┌──────▼──────┐  ┌────────▼────────┐  ┌────▼─────┐       │
│  │     PDS     │  │   PLC Directory  │  │  Relay   │       │
│  │  (Personal  │  │   (Identity)     │  │(Firehose)│       │
│  │ Data Server)│  │                  │  │          │       │
│  └─────────────┘  └──────────────────┘  └──────────┘       │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Storage Layer (PostgreSQL/SQLite)          │  │
│  │  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌──────────┐ │  │
│  │  │Repos│Records│ │DIDs/PLCs│ │  Videos  │ │  Social  │ │  │
│  │  └─────────┘ └─────────┘ └──────────┘ └──────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │     Blob Storage (S3/MinIO) + CDN (CloudFront)       │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. PLC Directory (Identity Layer)

**Location:** `packages/api/src/services/plc/`

The PLC (Placeholder) Directory is Exprsn's self-hosted DID registry that manages decentralized identities.

#### Features Implemented:
- ✅ **DID Creation** - Generate unique `did:plc:` identifiers
- ✅ **Handle Management** - Format validation (e.g., `@user.exprsn`, `@org.corp.exprsn`)
- ✅ **Key Rotation** - Secure rotation of signing and rotation keys
- ✅ **DID Updates** - Change handle, PDS endpoint, or services
- ✅ **Tombstoning** - Permanent deactivation of DIDs
- ✅ **Audit Trail** - Complete history of all operations
- ✅ **Organization DIDs** - Type-specific handles and services for orgs
- ✅ **Signature Verification** - Cryptographic validation of operations
- ✅ **Chain Validation** - Verify integrity of operation history

#### Key Files:
- `index.ts` - Main PLC service with all operations
- `crypto.ts` - Cryptographic functions for signing and verification

#### API Endpoints:
```
POST /xrpc/io.exprsn.plc.createDid         - Create new DID
POST /xrpc/io.exprsn.plc.updateDid         - Update DID metadata
POST /xrpc/io.exprsn.plc.rotateKeys        - Rotate signing keys
GET  /xrpc/io.exprsn.plc.resolveHandle     - Resolve handle → DID
GET  /xrpc/io.exprsn.plc.getIdentity       - Get identity info
GET  /xrpc/io.exprsn.plc.validateHandle    - Check handle format
POST /xrpc/io.exprsn.plc.reserveHandle     - Reserve handle (admin)
POST /xrpc/io.exprsn.plc.tombstoneDid      - Deactivate DID (admin)
GET  /xrpc/io.exprsn.plc.listIdentities    - List all identities (admin)
GET  /xrpc/io.exprsn.plc.getStats          - Identity statistics
GET  /xrpc/io.exprsn.plc.validateChain     - Validate operation chain
GET  /xrpc/io.exprsn.plc.fullValidation    - Full validation (chain + sigs)
```

#### Database Schema:
```sql
-- PLC identities - current state
plc_identities (
  did, handle, pds_endpoint, signing_key, rotation_keys,
  also_known_as, services, last_operation_cid, status,
  tombstoned_at, tombstoned_by, tombstone_reason
)

-- PLC operations - operation history
plc_operations (
  did, cid, operation, nullified, created_at
)

-- Handle reservations
plc_handle_reservations (
  handle, handle_type, organization_id, reserved_by, status
)

-- Audit log
plc_audit_log (
  did, action, operation_cid, previous_state, new_state,
  ip_address, user_agent, created_at
)
```

### 2. Personal Data Server (PDS)

**Location:** `packages/pds/` & `packages/api/src/services/repository/`

The PDS manages user data repositories using Merkle Search Trees (MST) for efficient synchronization.

#### Features Implemented:
- ✅ **Repository Management** - Create and manage user repositories
- ✅ **Record Operations** - Create, read, update, delete records
- ✅ **MST Structure** - Merkle Search Tree for efficient diffs
- ✅ **Blob Storage** - Binary content (images, videos) with CID
- ✅ **Atomic Writes** - Apply multiple operations atomically
- ✅ **Record Validation** - Validate against lexicon schemas
- ✅ **Commit History** - Track all repository changes

#### New API Endpoints:
```
POST /xrpc/com.atproto.repo.createRecord     - Create record
GET  /xrpc/com.atproto.repo.getRecord        - Get record
GET  /xrpc/com.atproto.repo.listRecords      - List records
POST /xrpc/com.atproto.repo.putRecord        - Update record
POST /xrpc/com.atproto.repo.deleteRecord     - Delete record
POST /xrpc/com.atproto.repo.applyWrites      - Atomic multi-write
GET  /xrpc/com.atproto.repo.describeRepo     - Repo metadata
POST /xrpc/com.atproto.repo.uploadBlob       - Upload blob
```

#### Database Schema:
```sql
-- Repositories
repositories (
  did, head, rev, created_at, updated_at
)

-- Records
repo_records (
  uri, did, collection, rkey, cid, value,
  created_at, indexed_at
)

-- Blobs
repo_blobs (
  cid, did, mime_type, size, url, created_at
)

-- Commits
repo_commits (
  cid, did, prev, data, rev, sig, created_at
)
```

### 3. Sync & Firehose (Federation Layer)

**Location:** `packages/api/src/services/sync/` & `packages/relay/`

Real-time synchronization and event streaming for federated instances.

#### Features Implemented:
- ✅ **Firehose Subscription** - WebSocket/SSE event stream
- ✅ **Repository Sync** - Pull and push repository updates
- ✅ **Blob Sync** - Synchronize binary content across instances
- ✅ **Commit Events** - Broadcast repository changes
- ✅ **Cursor-based Pagination** - Resume from any point
- ✅ **Event History** - Store and replay events

#### API Endpoints:
```
GET  /xrpc/com.atproto.sync.getBlob          - Fetch blob by CID
GET  /xrpc/com.atproto.sync.getBlocks        - Get repo blocks (CAR)
GET  /xrpc/com.atproto.sync.getCheckout      - Full repo checkout
GET  /xrpc/com.atproto.sync.getHead          - Current commit CID
GET  /xrpc/com.atproto.sync.getLatestCommit  - Latest commit
GET  /xrpc/com.atproto.sync.getRecord        - Record with proof
GET  /xrpc/com.atproto.sync.getRepo          - Full repository
GET  /xrpc/com.atproto.sync.listBlobs        - List blobs
GET  /xrpc/com.atproto.sync.listRepos        - List repositories
GET  /xrpc/com.atproto.sync.subscribeRepos   - Subscribe to firehose
POST /xrpc/com.atproto.sync.notifyOfUpdate   - Notify of update
POST /xrpc/com.atproto.sync.requestCrawl     - Request crawl
```

#### Database Schema:
```sql
-- Sync subscriptions
sync_subscriptions (
  id, service, cursor, status, last_sync,
  error_count, error_message
)

-- Sync events (firehose)
sync_events (
  id, seq, did, event_type, commit, ops,
  blocks, rebase, too_big, created_at
)
```

### 4. Lexicons (Schema Definitions)

**Location:** `packages/lexicons/schemas/io/exprsn/`

Type definitions for all Exprsn record types.

#### Collections:
- `io.exprsn.video.post` - Video posts
- `io.exprsn.video.like` - Video likes
- `io.exprsn.video.comment` - Comments
- `io.exprsn.graph.follow` - Follow relationships
- `io.exprsn.graph.block` - Blocks
- `io.exprsn.graph.mute` - Mutes
- `io.exprsn.actor.*` - User profiles
- `io.exprsn.chat.*` - Direct messages
- `io.exprsn.notification.*` - Notifications
- `io.exprsn.feed.*` - Feed algorithms

### 5. Well-Known Routes (Discovery)

**Location:** `packages/api/src/routes/well-known.ts`

Federation discovery and service metadata.

#### Endpoints:
- `/.well-known/atproto-did` - Service DID
- `/.well-known/did.json` - DID document
- `/.well-known/oauth-authorization-server` - OAuth metadata
- `/.well-known/openid-configuration` - OIDC discovery
- `/.well-known/exprsn-services` - Service registry
- `/.well-known/nodeinfo` - NodeInfo for federation
- `/.well-known/webfinger` - WebFinger for handles

## Integration Points

### PDS Package Integration

The PDS package (`@exprsn/pds`) provides core AT Protocol primitives:

```typescript
import { Repository, MerkleSearchTree } from '@exprsn/pds';

// Create repository
const repo = await Repository.create(did, blockStore, signFn);

// Create record
await repo.createRecord('io.exprsn.video.post', videoData);

// Commit changes
const commit = await repo.commit();
```

### Repository Service

Bridges PDS primitives with API database:

```typescript
import { repositoryService } from './services/repository';

// Create record
const result = await repositoryService.createRecord({
  did: userDid,
  collection: 'io.exprsn.video.post',
  record: videoData,
});
```

### Sync Service

Manages firehose and federation:

```typescript
import { syncService } from './services/sync';

// Subscribe to firehose
await syncService.subscribeWebSocket(context, cursor);

// Emit commit event
await syncService.emitCommitEvent(did, commitCid, ops);
```

## Video-Specific Features

Exprsn extends AT Protocol for video content:

### Video Records
```typescript
{
  $type: 'io.exprsn.video.post',
  title: string,
  description?: string,
  video: Blob,  // Binary video content
  thumbnail?: Blob,
  duration: number,
  aspectRatio: { width: number, height: number },
  tags?: string[],
  soundUri?: string,
  allowDuet: boolean,
  allowStitch: boolean,
  createdAt: datetime
}
```

### Video Processing Pipeline
1. Upload → S3/MinIO
2. Queue FFmpeg job (BullMQ)
3. Generate HLS segments + thumbnails
4. Store metadata in repository
5. Index for feeds
6. Emit to firehose

## Federation

### Outbound Federation
- Broadcast commits to relay
- Push updates to subscribed instances
- Serve repository data via sync endpoints

### Inbound Federation
- Subscribe to remote firehoses
- Pull repository updates
- Cache remote content
- Respect moderation policies

## Authentication & Authorization

### OAuth 2.0 / OIDC
- Authorization Code flow with PKCE
- DPoP (Demonstration of Proof-of-Possession)
- JWT access tokens
- Refresh token rotation

### Admin Roles
- `super_admin` - Full system control
- `admin` - User/content management
- `moderator` - Content moderation
- `support` - User support

## Development Workflow

### Start Development Server
```bash
pnpm dev
```

### Generate Types from Lexicons
```bash
pnpm lexicon:gen
```

### Database Operations
```bash
pnpm db:generate    # Generate migration
pnpm db:push        # Push to database
pnpm db:studio      # Open Drizzle Studio
```

### Docker Infrastructure
```bash
pnpm docker:up      # Start PostgreSQL, Redis, MinIO
pnpm docker:down    # Stop containers
```

## API Integration Example

### Create Video Post

```typescript
// 1. Upload video
const uploadResponse = await fetch('/xrpc/io.exprsn.video.uploadVideo', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    contentType: 'video/mp4',
    size: videoBlob.size,
  }),
});
const { uploadUrl, uploadId } = await uploadResponse.json();

// 2. Upload to S3
await fetch(uploadUrl, {
  method: 'PUT',
  body: videoBlob,
});

// 3. Complete upload (triggers processing)
await fetch('/xrpc/io.exprsn.video.completeUpload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ uploadId }),
});

// 4. Create video record
const createResponse = await fetch('/xrpc/io.exprsn.video.createPost', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    uploadId,
    caption: 'My awesome video!',
    tags: ['tutorial', 'coding'],
    allowDuet: true,
    allowStitch: true,
  }),
});
const { uri, cid } = await createResponse.json();
```

### Subscribe to Firehose

```typescript
const ws = new WebSocket('wss://exprsn.io/xrpc/com.atproto.sync.subscribeRepos?cursor=0');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event:', data);

  // {
  //   seq: 12345,
  //   did: 'did:plc:abc123',
  //   eventType: 'commit',
  //   commit: 'bafyreiabc...',
  //   ops: [
  //     {
  //       action: 'create',
  //       path: 'io.exprsn.video.post/3jk2l4m5n6',
  //       cid: 'bafyrei...'
  //     }
  //   ],
  //   time: '2026-03-09T12:34:56.789Z'
  // }
};
```

## Security Considerations

### DID Security
- Private keys never leave user's device
- Rotation keys for key recovery
- Signature verification on all operations
- Audit trail for forensics

### Content Security
- Blob CID verification
- Replay attack prevention
- Rate limiting per user
- CORS and CSRF protection

### Federation Security
- TLS required for all sync
- DID-based authentication
- Content signing
- Moderation policies

## Performance Optimizations

### Caching
- Redis for hot data
- DID resolution cache (1 hour)
- Feed cache with invalidation
- Blob CDN caching

### Database
- Indexed queries (did, collection, rkey)
- Cursor-based pagination
- Connection pooling
- Read replicas support

### Firehose
- Event batching
- Cursor checkpointing
- Backpressure handling
- Rate limiting

## Monitoring & Observability

### Metrics
- DID operations/sec
- Firehose lag
- Repository count
- Blob storage usage
- API latency

### Logs
- Structured JSON logging
- PLC audit trail
- Sync event log
- Error tracking

## Next Steps

### Short Term
1. ✅ Complete blob sync implementation
2. ⬜ Add CAR file generation for repos
3. ⬜ Implement MST diffing
4. ⬜ Add blob garbage collection
5. ⬜ Improve error handling

### Medium Term
1. ⬜ Multi-instance federation testing
2. ⬜ Performance benchmarking
3. ⬜ Admin UI for PLC management
4. ⬜ Backup and recovery tools
5. ⬜ Migration from external PLC

### Long Term
1. ⬜ Custom feed algorithms
2. ⬜ Advanced moderation tools
3. ⬜ Analytics dashboard
4. ⬜ Mobile app integration
5. ⬜ Production deployment

## Resources

### Documentation
- AT Protocol Spec: https://atproto.com
- Bluesky PDS: https://github.com/bluesky-social/atproto
- DID Spec: https://www.w3.org/TR/did-core/
- PLC Directory: https://github.com/did-method-plc/plc-directory

### Tools
- Drizzle ORM: https://orm.drizzle.team
- Hono Framework: https://hono.dev
- IPLD DAG-CBOR: https://ipld.io
- Multiformats: https://multiformats.io

## Contributing

To contribute to did:exprsn:

1. Fork the repository
2. Create feature branch
3. Implement changes
4. Write tests
5. Update documentation
6. Submit pull request

## License

[License information]

---

**Last Updated:** 2026-03-09
**Version:** 0.1.0
**Status:** Active Development
