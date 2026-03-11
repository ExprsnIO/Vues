# Exprsn API Routes Documentation

Complete reference for all API endpoints in the @exprsn/api package.

## Table of Contents

- [XRPC Endpoints](#xrpc-endpoints)
  - [Video](#video-endpoints)
  - [Actor/Profile](#profile--actor-endpoints)
  - [Graph/Social](#graphsocial-endpoints)
  - [Feed](#feed-endpoints)
  - [Identity (did:exprsn)](#identity-didexprsn-endpoints)
- [Authentication](#authentication-endpoints)
- [OAuth & SSO](#oauth-endpoints)
- [Well-Known](#well-known-endpoints)
- [Admin](#admin-endpoints)
- [Payments](#payment-endpoints)
- [AT Protocol](#atproto-protocol-endpoints)
- [WebSocket Namespaces](#websocket-namespaces)
- [Reference](#reference)

---

## XRPC Endpoints

### Video Endpoints

| Route | Method | Required Params | Optional Params | Auth | Description |
|-------|--------|-----------------|-----------------|------|-------------|
| `/xrpc/io.exprsn.video.getFeed` | GET | - | `feed` (trending\|following\|foryou\|sound:\|tag:), `limit`, `cursor` | Optional | Get video feed with pagination |
| `/xrpc/io.exprsn.video.getVideo` | GET | `uri` | - | Optional | Get single video details |
| `/xrpc/io.exprsn.video.getComments` | GET | `uri` | `limit`, `cursor`, `sort` (top\|hot\|recent) | Optional | Get video comments with replies |
| `/xrpc/io.exprsn.video.getCommentReplies` | GET | `parentUri` | `limit`, `cursor` | Optional | Get nested comment replies |
| `/xrpc/io.exprsn.video.getSounds` | GET | - | `query`, `trending`, `limit` | None | Search/list sounds |
| `/xrpc/io.exprsn.video.getSound` | GET | `id` | - | None | Get single sound details |
| `/xrpc/io.exprsn.video.getTrendingTags` | GET | - | `limit` | None | Get trending hashtags |
| `/xrpc/io.exprsn.video.search` | GET | `q` | `type` (all\|videos\|users\|sounds), `limit` | Optional | Full-text search |
| `/xrpc/io.exprsn.video.uploadVideo` | POST | Body: `contentType`, `size` | - | Required | Get upload URL (rate limited) |
| `/xrpc/io.exprsn.video.completeUpload` | POST | Body: `uploadId` | - | Required | Mark upload as complete |
| `/xrpc/io.exprsn.video.getUploadStatus` | GET | `uploadId` | - | Required | Check upload processing status |
| `/xrpc/io.exprsn.video.createPost` | POST | Body: `uploadId` | `caption`, `tags`, `soundUri`, `visibility`, `allowDuet`, `allowStitch`, `allowComments` | Required | Create video post |
| `/xrpc/io.exprsn.video.like` | POST | Body: `uri`, `cid` | - | Required | Like a video |
| `/xrpc/io.exprsn.video.unlike` | POST | Body: `likeUri` | - | Required | Unlike a video |
| `/xrpc/io.exprsn.video.trackView` | POST | Body: `videoUri` | `watchDuration`, `completed`, `loopCount`, `engagementActions`, `milestone` | Optional | Track video view with engagement signals |
| `/xrpc/io.exprsn.video.trackEvent` | POST | Body: `videoUri`, `eventType` | `engagementActions` | Required | Track conversion events |
| `/xrpc/io.exprsn.video.notInterested` | POST | Body: `feedbackType` | `videoUri`, `authorDid`, `tag`, `soundId`, `reason` | Required | Submit "not interested" feedback |
| `/xrpc/io.exprsn.video.removeFeedback` | POST | Body: `targetType`, `targetId`, `feedbackType` | - | Required | Remove negative feedback |
| `/xrpc/io.exprsn.video.createComment` | POST | Body: `videoUri`, `text` | `parentUri` | Required | Create comment/reply |
| `/xrpc/io.exprsn.video.deleteComment` | POST | Body: `uri` | - | Required | Delete own comment |
| `/xrpc/io.exprsn.video.reactToComment` | POST | Body: `commentUri`, `reactionType` | - | Required | React to comment (like\|love\|dislike) |
| `/xrpc/io.exprsn.video.unreactToComment` | POST | Body: `commentUri` | - | Required | Remove reaction from comment |

### Profile & Actor Endpoints

| Route | Method | Required Params | Optional Params | Auth | Description |
|-------|--------|-----------------|-----------------|------|-------------|
| `/xrpc/io.exprsn.actor.getProfile` | GET | `handle` or `did` | - | Optional | Get user profile |
| `/xrpc/io.exprsn.actor.updateProfile` | POST | - | Body: `displayName`, `bio`, `avatar` | Required | Update own profile |
| `/xrpc/io.exprsn.actor.getAvatarUploadUrl` | POST | Body: `contentType` | - | Required | Get avatar upload URL |
| `/xrpc/io.exprsn.actor.completeAvatarUpload` | POST | Body: `uploadId` | - | Required | Complete avatar upload |
| `/xrpc/io.exprsn.actor.getVideos` | GET | `handle` or `did` | `cursor`, `limit` | Optional | Get user's videos |
| `/xrpc/io.exprsn.actor.getSuggestions` | GET | - | `limit` | Optional | Get creator suggestions |
| `/xrpc/io.exprsn.actor.searchActors` | GET | `q` | `limit` | None | Search users |
| `/xrpc/io.exprsn.actor.getPreferences` | GET | - | - | Required | Get user preferences |
| `/xrpc/io.exprsn.actor.putPreferences` | POST | Body: preferences | - | Required | Update user preferences |

### Graph/Social Endpoints

| Route | Method | Required Params | Optional Params | Auth | Description |
|-------|--------|-----------------|-----------------|------|-------------|
| `/xrpc/io.exprsn.graph.follow` | POST | Body: `did` | - | Required | Follow user |
| `/xrpc/io.exprsn.graph.unfollow` | POST | Body: `uri` or `did` | - | Required | Unfollow user |
| `/xrpc/io.exprsn.graph.getFollowers` | GET | `handle` or `did` | `cursor`, `limit` | Optional | Get user's followers |
| `/xrpc/io.exprsn.graph.getFollowing` | GET | `handle` or `did` | `cursor`, `limit` | Optional | Get who user follows |
| `/xrpc/io.exprsn.graph.block` | POST | Body: `did` | - | Required | Block user |
| `/xrpc/io.exprsn.graph.unblock` | POST | Body: `did` | - | Required | Unblock user |
| `/xrpc/io.exprsn.graph.mute` | POST | Body: `did` | - | Required | Mute user |
| `/xrpc/io.exprsn.graph.unmute` | POST | Body: `did` | - | Required | Unmute user |
| `/xrpc/io.exprsn.graph.getBlocks` | GET | - | `cursor`, `limit` | Required | Get blocked users |
| `/xrpc/io.exprsn.graph.getMutes` | GET | - | `cursor`, `limit` | Required | Get muted users |
| `/xrpc/io.exprsn.graph.getLists` | GET | `actor` | `cursor`, `limit` | Optional | Get user's lists |
| `/xrpc/io.exprsn.graph.getList` | GET | `list` | `cursor`, `limit` | Optional | Get list members |
| `/xrpc/io.exprsn.graph.createList` | POST | Body: `name`, `purpose` | `description`, `avatar` | Required | Create list |
| `/xrpc/io.exprsn.graph.updateList` | POST | Body: `list` | `name`, `description`, `avatar` | Required | Update list |
| `/xrpc/io.exprsn.graph.deleteList` | POST | Body: `list` | - | Required | Delete list |
| `/xrpc/io.exprsn.graph.addToList` | POST | Body: `list`, `subject` | - | Required | Add user to list |
| `/xrpc/io.exprsn.graph.removeFromList` | POST | Body: `listitem` | - | Required | Remove from list |
| `/xrpc/io.exprsn.video.repost` | POST | Body: `uri`, `cid` | `caption` | Required | Repost video |
| `/xrpc/io.exprsn.video.unrepost` | POST | Body: `uri` | - | Required | Delete repost |
| `/xrpc/io.exprsn.video.bookmark` | POST | Body: `uri` | `folder` | Required | Bookmark video |
| `/xrpc/io.exprsn.video.unbookmark` | POST | Body: `uri` | - | Required | Remove bookmark |

### Feed Endpoints

| Route | Method | Required Params | Optional Params | Auth | Description |
|-------|--------|-----------------|-----------------|------|-------------|
| `/xrpc/io.exprsn.feed.getTimeline` | GET | - | `limit`, `cursor` | Required | Timeline from followed users |
| `/xrpc/io.exprsn.feed.getActorLikes` | GET | `actor` | `limit`, `cursor` | Optional | User's liked videos |
| `/xrpc/io.exprsn.feed.getActorFeed` | GET | `actor` | `limit`, `cursor`, `filter` | Optional | User's posts and reposts |
| `/xrpc/io.exprsn.feed.getSuggestedFeed` | GET | - | `limit`, `cursor` | Required | Personalized recommendations |
| `/xrpc/io.exprsn.feed.getFollowingBlend` | GET | - | `limit`, `cursor` | Required | Mixed following + discovery |
| `/xrpc/io.exprsn.feed.getExplore` | GET | - | `limit`, `cursor`, `category` | Optional | Trending discovery |
| `/xrpc/io.exprsn.feed.getChallenges` | GET | - | `limit`, `cursor` | Optional | Active challenges |

### Identity (did:exprsn) Endpoints

| Route | Method | Required Params | Optional Params | Auth | Description |
|-------|--------|-----------------|-----------------|------|-------------|
| `/xrpc/io.exprsn.identity.createDid` | POST | Body: `handle` | `displayName`, `organizationId` | Required | Create did:exprsn identity |
| `/xrpc/io.exprsn.identity.resolveDid` | GET | `did` | - | None | Resolve DID to document |
| `/xrpc/io.exprsn.identity.rotateKeys` | POST | Body: `did`, `challenge`, `signature` | - | Required | Rotate certificate/keys |
| `/xrpc/io.exprsn.identity.revokeDid` | POST | Body: `did`, `reason` | - | Admin | Revoke DID (admin only) |
| `/xrpc/io.exprsn.identity.getCertificateStatus` | GET | `did` | - | None | OCSP-like certificate status |
| `/xrpc/io.exprsn.identity.getCertificateInfo` | GET | `did` | - | None | Certificate details |

---

## Authentication Endpoints

| Route | Method | Required Params | Optional Params | Auth | Rate Limit | Description |
|-------|--------|-----------------|-----------------|------|------------|-------------|
| `/xrpc/io.exprsn.auth.createAccount` | POST | Body: `handle`, `email`, `password` | `displayName`, `accountType`, `didMethod`, `organizationName` | None | 3/hour/IP | Create new account |
| `/xrpc/io.exprsn.auth.createSession` | POST | Body: `identifier`, `password` | - | None | 5/15min/IP | Login with credentials |
| `/xrpc/io.exprsn.auth.getSession` | GET | Authorization header | - | Required | - | Get current session info |
| `/xrpc/io.exprsn.auth.refreshSession` | POST | Authorization header (refresh token) | - | None | 30/min | Refresh access token |
| `/xrpc/io.exprsn.auth.deleteSession` | POST | Authorization header | - | Required | - | Logout/delete session |
| `/xrpc/io.exprsn.auth.listSessions` | GET | Authorization header | - | Required | - | List all user sessions |
| `/xrpc/io.exprsn.auth.revokeSession` | POST | Body: `sessionId` | - | Required | - | Revoke specific session |
| `/xrpc/io.exprsn.auth.revokeAllSessions` | POST | Authorization header | - | Required | - | Revoke all other sessions |
| `/xrpc/io.exprsn.auth.getLoginHistory` | GET | Authorization header | - | Required | - | Get login history (last 50) |

---

## OAuth Endpoints

| Route | Method | Required Params | Optional Params | Auth | Description |
|-------|--------|-----------------|-----------------|------|-------------|
| `/oauth/login` | GET | `handle` | - | None | Initiate OAuth flow |
| `/oauth/callback` | GET | `code`, `state` | - | None | OAuth callback handler |
| `/oauth/session` | GET | Authorization header | - | None | Check OAuth session |
| `/oauth/logout` | POST | Authorization header | - | None | Logout OAuth session |
| `/oauth/authorize` | GET | `client_id`, `redirect_uri`, `scope`, `state` | `code_challenge` | None | OAuth authorization endpoint |
| `/oauth/token` | POST | Body: `grant_type`, `code`, `client_id`, `redirect_uri` | - | None | OAuth token endpoint |
| `/oauth/jwks` | GET | - | - | None | JWKS for token verification |
| `/sso/oidc/authorize` | GET | OIDC parameters | - | None | OpenID Connect authorization |
| `/sso/saml/metadata` | GET | - | - | None | SAML metadata |
| `/sso/saml/acs` | POST | SAML assertion | - | None | SAML assertion consumer service |

---

## Well-Known Endpoints

| Route | Method | Description |
|-------|--------|-------------|
| `/.well-known/atproto-did` | GET | AT Protocol service DID |
| `/.well-known/did.json` | GET | DID document |
| `/.well-known/oauth-authorization-server` | GET | OAuth 2.0 server metadata (RFC 8414) |
| `/.well-known/openid-configuration` | GET | OpenID Connect discovery document |
| `/.well-known/exprsn-services` | GET | Exprsn service registry |
| `/.well-known/nodeinfo` | GET | NodeInfo links |
| `/.well-known/nodeinfo/2.1` | GET | NodeInfo 2.1 schema |
| `/.well-known/webfinger` | GET | WebFinger for handle discovery (`resource` query param) |
| `/.well-known/crl.pem` | GET | Certificate Revocation List (PEM) |
| `/.well-known/crl.der` | GET | Certificate Revocation List (DER) |
| `/.well-known/crl-delta.pem` | GET | Delta CRL (24-hour revocations) |
| `/.well-known/ca/cdp.json` | GET | CRL Distribution Points |
| `/.well-known/ca/status.json` | GET | CA status information |
| `/.well-known/did-exprsn/:did` | GET | Resolve did:exprsn DID document |
| `/.well-known/did-exprsn/:did/certificate-chain` | GET | Certificate chain for did:exprsn |
| `/.well-known/did-exprsn/:did/status` | GET | Certificate status (OCSP-like) |
| `/.well-known/did-configuration.json` | GET | DID configuration for domain verification |
| `/ocsp` | POST | OCSP responder (binary) |
| `/ocsp/:request` | GET | OCSP responder (GET method) |
| `/ocsp/status/:serialNumber` | GET | Simple certificate status check |

---

## Admin Endpoints

### User & Moderation

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/admin/users` | GET | Admin | List all users with filters |
| `/admin/users/:userId/sanctions` | POST | Admin | Create sanction on user |
| `/admin/users/:userId/unsanction` | POST | Admin | Remove user sanction |
| `/admin/users/bulk-action` | POST | Admin | Bulk actions on users |
| `/admin/reports` | GET | Admin | List content reports |
| `/admin/reports/:reportId` | POST | Admin | Handle report (approve/reject) |
| `/admin/reports/:reportId/evidence` | GET | Admin | Get report evidence |

### Video Moderation

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/admin/videos/moderation-status` | GET | Admin | List videos by moderation status |
| `/admin/videos/:videoUri/approve` | POST | Admin | Approve video |
| `/admin/videos/:videoUri/reject` | POST | Admin | Reject/remove video |
| `/admin/videos/:videoUri/flag` | POST | Admin | Flag video for review |

### Platform Settings

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/admin/settings/platform` | GET | Admin | Get platform settings |
| `/admin/settings/platform` | POST | Admin | Update platform settings |
| `/admin/settings/blocked-words` | GET/POST | Admin | List/add blocked words |
| `/admin/settings/blocked-words/:id` | DELETE | Admin | Remove blocked word |
| `/admin/settings/banned-tags` | GET/POST | Admin | List/add banned tags |
| `/admin/settings/banned-tags/:id` | DELETE | Admin | Remove banned tag |
| `/admin/settings/moderation-agents` | GET/POST | Admin | List/create AI moderation agents |
| `/admin/settings/moderation-agents/:id` | DELETE | Admin | Delete AI agent |

### Domain Management

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/admin/domains` | GET/POST | Admin | List/create domains |
| `/admin/domains/:domainId` | GET | Admin | Get domain details |
| `/admin/domains/:domainId/roles` | GET/POST | Admin | List/create domain roles |
| `/admin/domains/:domainId/auth-providers` | GET/POST | Admin | List/configure auth providers |
| `/admin/domains/:domainId/users` | GET | Admin | List domain users |

### Analytics & Exports

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/admin/analytics/overview` | GET | Admin | Platform analytics overview |
| `/admin/analytics/users` | GET | Admin | User analytics |
| `/admin/analytics/videos` | GET | Admin | Video analytics |
| `/admin/export/users` | GET | Admin | Export users (format: csv\|json) |
| `/admin/export/reports` | GET | Admin | Export moderation reports |
| `/admin/export/audit-logs` | GET | Admin | Export audit logs |

### Render & GPU

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/admin/render-jobs` | GET | Admin | List all render jobs |
| `/admin/render-jobs/:jobId` | GET | Admin | Get render job details |
| `/admin/render-jobs/:jobId/cancel` | POST | Admin | Cancel render job |
| `/admin/render-quota` | GET | Admin | View render quotas |
| `/admin/gpu/devices` | GET | Admin | List GPU devices |
| `/admin/gpu/status` | GET | Admin | GPU cluster status |
| `/admin/gpu/queue` | GET | Admin | Render queue status |

### Cluster

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/admin/cluster/status` | GET | Admin | Cluster health status |
| `/admin/cluster/nodes` | GET | Admin | List cluster nodes |
| `/admin/cluster/settings` | POST | Admin | Update cluster settings |

### Payments Admin

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/admin/payments/providers` | GET | Admin | List payment providers |
| `/admin/payments/transactions` | GET | Admin | List all transactions |
| `/admin/payments/subscriptions` | GET | Admin | List subscriptions |
| `/admin/payments/refunds` | POST | Admin | Process refund |

---

## Payment Endpoints

| Route | Method | Required Params | Optional Params | Auth | Description |
|-------|--------|-----------------|-----------------|------|-------------|
| `/payments/methods` | GET | - | - | Required | List payment methods |
| `/payments/methods` | POST | Body: payment method | - | Required | Add payment method |
| `/payments/methods/:id` | DELETE | `id` | - | Required | Remove payment method |
| `/payments/charge` | POST | Body: `amount`, `currency`, `paymentMethodId` | `description` | Required | Charge user |
| `/payments/refund` | POST | Body: `transactionId` | `amount`, `reason` | Required | Refund transaction |
| `/payments/tip` | POST | Body: `videoUri`, `amount` | `message` | Required | Tip creator (min $1) |
| `/payments/subscribe` | POST | Body: `tierId` | - | Required | Subscribe to tier |
| `/payments/subscriptions` | GET | - | - | Required | Get user subscriptions |
| `/payments/subscriptions/:id/cancel` | POST | `id` | - | Required | Cancel subscription |
| `/payments/config` | GET | - | - | Required | Get payment config |
| `/payments/config` | POST | Body: provider config | - | Required | Create/update payment config |

---

## Organization Endpoints

| Route | Method | Required Params | Optional Params | Auth | Description |
|-------|--------|-----------------|-----------------|------|-------------|
| `/xrpc/io.exprsn.org.create` | POST | Body: `name`, `type` | `handle`, `description`, `avatar` | Required | Create organization |
| `/xrpc/io.exprsn.org.get` | GET | `id` or `handle` | - | Optional | Get organization details |
| `/xrpc/io.exprsn.org.update` | POST | Body: `id` | `name`, `description`, `avatar`, `settings` | Required | Update organization |
| `/xrpc/io.exprsn.org.delete` | POST | Body: `id` | - | Required | Delete organization |
| `/xrpc/io.exprsn.org.getMembers` | GET | `id` | `cursor`, `limit`, `role` | Optional | List organization members |
| `/xrpc/io.exprsn.org.invite` | POST | Body: `organizationId`, `email` or `did` | `role`, `message` | Required | Invite member |
| `/xrpc/io.exprsn.org.acceptInvite` | POST | Body: `token` | - | Required | Accept invite |
| `/xrpc/io.exprsn.org.removeMember` | POST | Body: `organizationId`, `memberDid` | - | Required | Remove member |
| `/xrpc/io.exprsn.org.updateMemberRole` | POST | Body: `organizationId`, `memberDid`, `role` | - | Required | Update member role |
| `/xrpc/io.exprsn.org.getRoles` | GET | `organizationId` | - | Optional | List organization roles |
| `/xrpc/io.exprsn.org.createRole` | POST | Body: `organizationId`, `name`, `permissions` | `color`, `priority` | Required | Create role |
| `/xrpc/io.exprsn.org.follow` | POST | Body: `organizationId` | - | Required | Follow organization |
| `/xrpc/io.exprsn.org.unfollow` | POST | Body: `organizationId` | - | Required | Unfollow organization |

---

## Settings Endpoints

| Route | Method | Required Params | Optional Params | Auth | Description |
|-------|--------|-----------------|-----------------|------|-------------|
| `/xrpc/io.exprsn.settings.get` | GET | - | - | Required | Get user settings |
| `/xrpc/io.exprsn.settings.updateSettings` | POST | Body: settings | - | Required | Update user settings |
| `/xrpc/io.exprsn.settings.getNotificationPreferences` | GET | - | - | Required | Get notification preferences |
| `/xrpc/io.exprsn.settings.updateNotificationPreferences` | POST | Body: preferences | - | Required | Update notification preferences |

---

## Notification Endpoints

| Route | Method | Required Params | Optional Params | Auth | Description |
|-------|--------|-----------------|-----------------|------|-------------|
| `/xrpc/io.exprsn.notification.list` | GET | - | `limit`, `cursor` | Required | Get user notifications |
| `/xrpc/io.exprsn.notification.getUnreadCount` | GET | - | - | Required | Get unread count |
| `/xrpc/io.exprsn.notification.markRead` | POST | Body: `notificationId` | - | Required | Mark as read |
| `/xrpc/io.exprsn.notification.markAllRead` | POST | - | - | Required | Mark all as read |
| `/xrpc/io.exprsn.notification.updateSeen` | POST | Body: `seenAt` | - | Required | Update seen timestamp |

---

## Studio/Render Endpoints

| Route | Method | Required Params | Optional Params | Auth | Description |
|-------|--------|-----------------|-----------------|------|-------------|
| `/studio/projects` | GET | - | `cursor`, `limit` | Required | List user's projects |
| `/studio/projects` | POST | Body: `name` | `description` | Required | Create project |
| `/studio/projects/:id` | GET | `id` | - | Required | Get project details |
| `/studio/projects/:id` | PUT | `id`, Body: project data | - | Required | Update project |
| `/studio/projects/:id` | DELETE | `id` | - | Required | Delete project |
| `/studio/render` | POST | Body: `projectId`, `format`, `quality` | `resolution`, `fps` | Required | Create render job |
| `/studio/render/:jobId/status` | GET | `jobId` | - | Required | Get render status |
| `/studio/render/:jobId/cancel` | POST | `jobId` | - | Required | Cancel render job |
| `/studio/effects` | GET | - | `category` | Required | List available effects |
| `/studio/presets` | GET | - | - | Required | List render presets |
| `/studio/templates` | GET | - | `category`, `cursor`, `limit` | Required | List templates |

---

## AT Protocol Endpoints

### Repository Operations

| Route | Method | Description |
|-------|--------|-------------|
| `/xrpc/com.atproto.repo.createRecord` | POST | Create record in repository |
| `/xrpc/com.atproto.repo.getRecord` | GET | Get single record |
| `/xrpc/com.atproto.repo.listRecords` | GET | List records by collection |
| `/xrpc/com.atproto.repo.putRecord` | POST | Update record |
| `/xrpc/com.atproto.repo.deleteRecord` | POST | Delete record |
| `/xrpc/com.atproto.repo.applyWrites` | POST | Batch write operations |
| `/xrpc/com.atproto.repo.describeRepo` | GET | Get repository metadata |
| `/xrpc/com.atproto.repo.uploadBlob` | POST | Upload blob to repository |

### Sync Operations

| Route | Method | Description |
|-------|--------|-------------|
| `/xrpc/com.atproto.sync.getBlob` | GET | Retrieve blob by hash |
| `/xrpc/com.atproto.sync.getBlocks` | GET | Get data blocks |
| `/xrpc/com.atproto.sync.getCheckout` | GET | Get repository checkout |
| `/xrpc/com.atproto.sync.getHead` | GET | Get HEAD commit |
| `/xrpc/com.atproto.sync.getLatestCommit` | GET | Get latest commit |
| `/xrpc/com.atproto.sync.getRecord` | GET | Get record by path |
| `/xrpc/com.atproto.sync.getRepo` | GET | Download repository CAR |
| `/xrpc/com.atproto.sync.listBlobs` | GET | List repository blobs |
| `/xrpc/com.atproto.sync.listRepos` | GET | List all repositories |
| `/xrpc/com.atproto.sync.subscribeRepos` | GET | Subscribe to repository events (WebSocket) |
| `/xrpc/com.atproto.sync.notifyOfUpdate` | POST | Notify of repository update |
| `/xrpc/com.atproto.sync.requestCrawl` | POST | Request crawl of repository |

---

## WebSocket Namespaces

| Namespace | Authentication | Description |
|-----------|----------------|-------------|
| `/chat` | Required | Direct messaging between users |
| `/editor-collab` | Required | Collaborative video editing (Yjs CRDT) |
| `/render-progress` | Required | Real-time render job status updates |
| `/watch-party` | Required | Synchronized video playback |
| `/admin` | Admin | Admin notifications and alerts |
| `/live-chat` | Required | Live stream chat |

---

## Health Endpoints

| Route | Method | Description |
|-------|--------|-------------|
| `/health` | GET | Full health check with component status |
| `/health/live` | GET | Kubernetes liveness probe |
| `/health/ready` | GET | Kubernetes readiness probe |

---

## Reference

### Authentication Levels

| Level | Description |
|-------|-------------|
| **None** | Public endpoint, no authentication required |
| **Optional** | Authentication optional, enhanced results if authenticated |
| **Required** | Must provide valid Bearer token in Authorization header |
| **Admin** | Must be authenticated admin user with appropriate permissions |

### Rate Limits

| Endpoint | Limit |
|----------|-------|
| Signup | 3 per hour per IP |
| Login | 5 attempts per 15 minutes per IP |
| Token Refresh | 30 per minute per user |
| Video Upload | Per-user daily/hourly quotas based on account tier |
| General XRPC | Configurable per domain |

### Response Format

All endpoints return JSON responses with standard HTTP status codes:

| Code | Description |
|------|-------------|
| 200 | Success |
| 206 | Partial content (range request) |
| 400 | Bad request (validation error) |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not found |
| 409 | Conflict (duplicate resource) |
| 422 | Unprocessable entity |
| 429 | Too many requests (rate limited) |
| 500 | Internal server error |
| 503 | Service unavailable |

### Error Response Format

```json
{
  "error": "InvalidRequest",
  "code": "INVALID_HANDLE",
  "message": "Handle must be 3-20 characters",
  "details": {
    "field": "handle",
    "value": "ab"
  }
}
```

---

## Source Files

| Category | File Path |
|----------|-----------|
| XRPC Video/Feed | `src/routes/xrpc.ts`, `src/routes/feed.ts` |
| Authentication | `src/routes/auth.ts` |
| OAuth | `src/routes/oauth.ts` |
| Well-Known | `src/routes/well-known.ts` |
| Admin | `src/routes/admin.ts`, `src/routes/admin-*.ts` |
| Actor/Profile | `src/routes/actor.ts` |
| Social | `src/routes/social.ts` |
| Graph | `src/routes/graph.ts` |
| Studio | `src/routes/studio.ts` |
| Payments | `src/routes/payments.ts` |
| Organization | `src/routes/organization.ts` |
| Settings | `src/routes/settings.ts` |
| Notifications | `src/routes/notifications.ts` |
| AT Protocol | `src/routes/atproto-repo.ts`, `src/routes/atproto-sync.ts` |
| Identity | `src/routes/identity-exprsn.ts` |
