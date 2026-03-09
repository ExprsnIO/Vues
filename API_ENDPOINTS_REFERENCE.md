# Exprsn API Endpoints - Quick Reference

## New AT Protocol Endpoints

### com.atproto.repo.* (Repository Operations)

#### POST /xrpc/com.atproto.repo.createRecord
Create a new record in repository
```json
{
  "repo": "did:plc:abc123",
  "collection": "io.exprsn.video.post",
  "rkey": "3jk2l4m5n6",  // optional, generated if not provided
  "record": {
    "$type": "io.exprsn.video.post",
    "title": "My Video",
    "createdAt": "2026-03-09T12:00:00.000Z"
  }
}
```
**Response:** `{ uri: "at://...", cid: "..." }`

#### GET /xrpc/com.atproto.repo.getRecord
Get a specific record
```
?repo=did:plc:abc123
&collection=io.exprsn.video.post
&rkey=3jk2l4m5n6
&cid=bafyrei...  // optional, verify specific version
```
**Response:** `{ uri, cid, value }`

#### GET /xrpc/com.atproto.repo.listRecords
List records in a collection
```
?repo=did:plc:abc123
&collection=io.exprsn.video.post
&limit=50
&cursor=3jk2l4m5n6  // optional
&reverse=false      // optional
```
**Response:** `{ records: [...], cursor? }`

#### POST /xrpc/com.atproto.repo.putRecord
Update or create record (upsert)
```json
{
  "repo": "did:plc:abc123",
  "collection": "io.exprsn.video.post",
  "rkey": "3jk2l4m5n6",
  "record": { /* updated data */ },
  "swapRecord": "bafyrei..."  // optional, CAS
}
```
**Response:** `{ uri, cid }`

#### POST /xrpc/com.atproto.repo.deleteRecord
Delete a record
```json
{
  "repo": "did:plc:abc123",
  "collection": "io.exprsn.video.post",
  "rkey": "3jk2l4m5n6",
  "swapRecord": "bafyrei..."  // optional, CAS
}
```
**Response:** `{ success: true }`

#### POST /xrpc/com.atproto.repo.applyWrites
Apply multiple operations atomically
```json
{
  "repo": "did:plc:abc123",
  "writes": [
    {
      "$type": "com.atproto.repo.applyWrites#create",
      "collection": "io.exprsn.video.post",
      "value": { /* record */ }
    },
    {
      "$type": "com.atproto.repo.applyWrites#update",
      "collection": "io.exprsn.video.post",
      "rkey": "3jk2l4m5n6",
      "value": { /* updated record */ }
    },
    {
      "$type": "com.atproto.repo.applyWrites#delete",
      "collection": "io.exprsn.video.like",
      "rkey": "3jk2l4m5n7"
    }
  ]
}
```
**Response:** `{ results: [...] }`

#### GET /xrpc/com.atproto.repo.describeRepo
Get repository metadata
```
?repo=did:plc:abc123
```
**Response:** `{ handle, did, didDoc, collections, handleIsCorrect }`

#### POST /xrpc/com.atproto.repo.uploadBlob
Upload binary content
```
Content-Type: video/mp4
Body: <binary data>
```
**Response:** `{ blob: { $type: "blob", ref: "cid", mimeType, size } }`

---

### com.atproto.sync.* (Synchronization)

#### GET /xrpc/com.atproto.sync.getBlob
Fetch a blob by CID
```
?did=did:plc:abc123
&cid=bafyrei...
```
**Response:** Binary blob data

#### GET /xrpc/com.atproto.sync.getBlocks
Get repository blocks (CAR format)
```
?did=did:plc:abc123
&cids=bafyrei...,bafyrei...  // comma-separated
```
**Response:** CAR file (application/vnd.ipld.car)

#### GET /xrpc/com.atproto.sync.getCheckout
Full repository checkout
```
?did=did:plc:abc123
```
**Response:** CAR file with complete repository

#### GET /xrpc/com.atproto.sync.getHead
Current commit CID
```
?did=did:plc:abc123
```
**Response:** `{ root: "bafyrei..." }`

#### GET /xrpc/com.atproto.sync.getLatestCommit
Latest commit info
```
?did=did:plc:abc123
```
**Response:** `{ cid: "bafyrei...", rev: 42 }`

#### GET /xrpc/com.atproto.sync.getRecord
Get record with merkle proof
```
?did=did:plc:abc123
&collection=io.exprsn.video.post
&rkey=3jk2l4m5n6
&commit=bafyrei...  // optional
```
**Response:** CAR file with record and proof

#### GET /xrpc/com.atproto.sync.getRepo
Full repository export
```
?did=did:plc:abc123
&since=bafyrei...  // optional, incremental
```
**Response:** CAR file

#### GET /xrpc/com.atproto.sync.listBlobs
List blobs in repository
```
?did=did:plc:abc123
&since=2026-03-09T00:00:00.000Z  // optional
&limit=500
&cursor=bafyrei...  // optional
```
**Response:** `{ cids: [...], cursor? }`

#### GET /xrpc/com.atproto.sync.listRepos
List all repositories
```
?limit=500
&cursor=did:plc:xyz  // optional
```
**Response:** `{ repos: [{ did, head, rev }], cursor? }`

#### GET /xrpc/com.atproto.sync.subscribeRepos
Subscribe to firehose (WebSocket or SSE)
```
?cursor=12345  // optional, resume from sequence
```
**WebSocket Events:**
```json
{
  "seq": 12346,
  "did": "did:plc:abc123",
  "eventType": "commit",
  "commit": "bafyrei...",
  "ops": [
    {
      "action": "create",
      "path": "io.exprsn.video.post/3jk2l4m5n6",
      "cid": "bafyrei..."
    }
  ],
  "time": "2026-03-09T12:34:56.789Z"
}
```

#### POST /xrpc/com.atproto.sync.notifyOfUpdate
Notify of repository update
```json
{
  "hostname": "other-instance.social"
}
```
**Response:** `{ success: true }`

#### POST /xrpc/com.atproto.sync.requestCrawl
Request repository crawl
```json
{
  "hostname": "new-instance.social"
}
```
**Response:** `{ success: true }`

---

## Existing Exprsn Endpoints

### io.exprsn.plc.* (Identity Management)

#### POST /xrpc/io.exprsn.plc.createDid
Create new DID
```json
{
  "handle": "user.exprsn",
  "signingKey": "did:key:...",
  "rotationKeys": ["did:key:..."],
  "pdsEndpoint": "https://exprsn.io"
}
```

#### POST /xrpc/io.exprsn.plc.updateDid
Update DID metadata
```json
{
  "did": "did:plc:abc123",
  "handle": "newhandle.exprsn",
  "pdsEndpoint": "https://new-pds.exprsn"
}
```

#### POST /xrpc/io.exprsn.plc.rotateKeys
Rotate signing/rotation keys
```json
{
  "did": "did:plc:abc123",
  "newSigningKey": "did:key:...",
  "rotationKeyUsed": "did:key:...",
  "signature": "..."
}
```

#### GET /xrpc/io.exprsn.plc.resolveHandle
Resolve handle to DID
```
?handle=user.exprsn
```
**Response:** `{ did: "did:plc:abc123" }`

#### GET /xrpc/io.exprsn.plc.getIdentity
Get identity info
```
?did=did:plc:abc123
```
**Response:** Full identity object

---

### io.exprsn.video.* (Video Operations)

#### GET /xrpc/io.exprsn.video.getFeed
Get video feed
```
?feed=trending|following|foryou
&limit=30
&cursor=...
```

#### GET /xrpc/io.exprsn.video.getVideo
Get single video
```
?uri=at://did:plc:abc123/io.exprsn.video.post/3jk2l4m5n6
```

#### POST /xrpc/io.exprsn.video.createPost
Create video post
```json
{
  "uploadId": "...",
  "caption": "My video",
  "tags": ["tutorial"],
  "visibility": "public"
}
```

#### POST /xrpc/io.exprsn.video.like
Like a video
```json
{
  "uri": "at://...",
  "cid": "bafyrei..."
}
```

#### POST /xrpc/io.exprsn.video.trackView
Track video view
```json
{
  "videoUri": "at://...",
  "watchDuration": 15,
  "completed": false
}
```

---

### io.exprsn.actor.* (User Profiles)

#### GET /xrpc/io.exprsn.actor.getProfile
Get user profile
```
?handle=user.exprsn
&did=did:plc:abc123  // either handle or did
```

#### GET /xrpc/io.exprsn.actor.getVideos
Get user's videos
```
?handle=user.exprsn
&limit=30
&cursor=...
```

---

### io.exprsn.graph.* (Social Graph)

#### POST /xrpc/io.exprsn.graph.follow
Follow user
```json
{
  "did": "did:plc:xyz789"
}
```

#### POST /xrpc/io.exprsn.graph.unfollow
Unfollow user
```json
{
  "did": "did:plc:xyz789"
}
```

#### GET /xrpc/io.exprsn.graph.getFollowers
Get followers
```
?did=did:plc:abc123
&limit=50
&cursor=...
```

#### GET /xrpc/io.exprsn.graph.getFollowing
Get following
```
?did=did:plc:abc123
&limit=50
&cursor=...
```

---

## Authentication

All authenticated endpoints require a Bearer token:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Get token via OAuth:
1. `GET /oauth/authorize?handle=user.exprsn`
2. User authorizes
3. `POST /oauth/token` with authorization code
4. Use returned `access_token`

---

## Rate Limits

- Unauthenticated: 100 requests/minute
- Authenticated: 300 requests/minute
- Admin: 1000 requests/minute
- Uploads: User-specific quotas (see `/xrpc/io.exprsn.video.uploadVideo`)

---

## WebSocket Namespaces

- `/chat` - Direct messaging
- `/editor-collab` - Collaborative editing (Yjs)
- `/render-progress` - Video render status
- `/watch-party` - Synchronized playback
- `/admin` - Admin notifications

---

## Well-Known Endpoints

- `/.well-known/atproto-did` - Service DID
- `/.well-known/did.json` - DID document
- `/.well-known/oauth-authorization-server` - OAuth metadata
- `/.well-known/openid-configuration` - OIDC discovery
- `/.well-known/exprsn-services` - Service registry
- `/.well-known/webfinger` - Handle discovery

---

## Error Responses

All errors follow this format:
```json
{
  "error": "ErrorCode",
  "message": "Human-readable description"
}
```

Common error codes:
- `InvalidRequest` - Bad request parameters
- `AuthRequired` - Authentication needed
- `NotFound` - Resource not found
- `Forbidden` - Insufficient permissions
- `RateLimitExceeded` - Too many requests

---

**Last Updated:** 2026-03-09
**API Version:** 0.1.0
