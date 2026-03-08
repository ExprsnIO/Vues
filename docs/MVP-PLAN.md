# Exprsn MVP Implementation Plan

## Executive Summary

Exprsn is a federated video social platform built on ATProto (Bluesky protocol). The codebase already has significant infrastructure in place, including video upload/playback, federation, domain management, and moderation. This plan identifies the remaining work to achieve a production-ready MVP with multi-domain federation and hosting administration.

---

## Current State Assessment

### Existing / Mostly Complete

**Core Video Platform:**
- Video upload service with S3/Spaces integration
- Video playback with HLS streaming support
- Video feed with infinite scroll
- Likes, comments, reactions, reposts, bookmarks
- Sounds and challenges system
- Video editor with effects panel
- User profiles and follows
- Direct messaging/chat system
- Watch parties
- Live streaming infrastructure (AWS IVS, SRS)
- Notifications system

**Federation & ATProto:**
- Full PDS (Personal Data Server) implementation
- Federation consumer worker for ingesting content from relays
- Federation routes for sync, search, content push/pull
- Service registry for tracking relays and appviews
- Blob sync for federated media
- PLC directory integration
- Well-known endpoints for AT Protocol discovery

**Admin & Domain Management:**
- Multi-domain infrastructure with domain tables
- Domain-level RBAC system
- Domain admin context switching
- Domain dashboard and settings pages
- Global vs per-domain admin views
- Admin WebSocket for real-time updates
- Admin audit logging

**SSO & Identity:**
- OIDC Provider and Consumer services
- SAML Provider service
- Domain SSO configuration
- JWT service for tokens
- External identity providers

**Moderation:**
- AI-powered content moderation with multiple providers
- Risk scoring and automated actions
- Manual review queue
- User sanctions system
- Appeals workflow
- User-facing moderation dashboard
- Content reports

**Certificate Authority:**
- Root and intermediate CA certificates
- Entity certificate management
- CRL generation

**Organization/Team Features:**
- Organizations with hierarchy
- Roles and permissions
- Member management
- Billing integration

---

## Phase 1: Core Platform Stabilization (2-3 weeks)

### 1.1 Video Pipeline Hardening

**Status:** Mostly complete, needs production hardening

**Tasks:**

| Task | File | Description |
|------|------|-------------|
| Retry Logic | `packages/api/src/services/upload.ts` | Add exponential backoff for transcoding failures |
| Dead Letter Queue | `packages/api/src/workers/` | Implement DLQ for failed transcodes |
| Webhook Notifications | `packages/api/src/services/upload.ts` | Add processing completion webhooks |
| CDN Integration | `packages/api/src/services/upload.ts` | Finalize CDN URL generation, cache invalidation |
| Video Deletion | `packages/api/src/services/video/VideoDeletionService.ts` | Complete soft delete propagation, blob cleanup |

### 1.2 Feed Algorithm Completion

**Status:** Basic feed exists, personalization needs work

**Tasks:**

| Task | File | Description |
|------|------|-------------|
| FYP Algorithm | `packages/api/src/services/feed/ForYouAlgorithm.ts` | Complete user preference computation |
| User Embeddings | `packages/feed-generator/src/algorithms/userPreferences.ts` | Integrate user/video embeddings |
| Diversity Sampling | `packages/api/src/services/feed/` | Avoid filter bubbles |
| Following Feed | `packages/api/src/routes/feed.ts` | Optimize for large follow graphs, add caching |
| Trending | `packages/api/src/services/feed/` | Tune velocity, add viral detection |

### 1.3 Social Features Polish

**Status:** Core features exist, need UX polish

**Tasks:**

| Task | File | Description |
|------|------|-------------|
| Duets/Stitches | `packages/web/src/components/editor/LoopEditor.tsx` | Complete video editor integration |
| Mentions | `packages/web/src/components/` | Implement @mention autocomplete |
| Hashtag Pages | `packages/web/src/app/tag/[tag]/page.tsx` | Add hashtag feeds |
| Sharing | `packages/web/src/hooks/useVideoShare.ts` | Complete share modal, deep linking |

---

## Phase 2: Federation Production Readiness (2-3 weeks)

### 2.1 Federation Consumer Hardening

**Status:** Worker exists, needs production hardening

**Tasks:**

| Task | File | Description |
|------|------|-------------|
| Connection Pooling | `packages/api/src/workers/federationConsumer.ts` | Pool connections for multiple relays |
| Circuit Breaker | `packages/api/src/workers/federationConsumer.ts` | Handle failing relays gracefully |
| Backpressure | `packages/api/src/workers/federationConsumer.ts` | Implement flow control |
| Lexicon Validation | `packages/api/src/workers/federationConsumer.ts` | Validate inbound records |
| Rate Limiting | `packages/api/src/workers/federationConsumer.ts` | Per-DID rate limits |

### 2.2 Outbound Federation

**Status:** Partially implemented

**Tasks:**

| Task | File | Description |
|------|------|-------------|
| Relay Emission | `packages/api/src/services/federation/` | Complete PDS commit handler |
| Collection Filtering | `packages/api/src/services/federation/` | Configurable sync scope |
| Content Sync | `packages/api/src/services/federation/ContentSync.ts` | Push-based sync to partner relays |
| Conflict Resolution | `packages/api/src/services/federation/` | Handle concurrent updates |

### 2.3 Identity Infrastructure

**Status:** PLC integration exists, needs completion

**Tasks:**

| Task | File | Description |
|------|------|-------------|
| DID Cache | `packages/api/src/services/identity/index.ts` | Multi-tier cache (memory, Redis, DB) |
| Background Refresh | `packages/api/src/services/identity/` | Refresh stale DIDs |
| Handle Verification | `packages/api/src/services/identity/` | DNS and HTTP well-known verification |
| Handle Changes | `packages/api/src/services/identity/` | Propagate handle updates |
| Federated Search | `packages/api/src/services/federation/FederatedSearch.ts` | Cross-instance user search |

---

## Phase 3: Multi-Domain Administration (2-3 weeks)

### 3.1 Domain Management UI Completion

**Status:** Basic UI exists, needs functionality

**Tasks:**

| Task | File | Description |
|------|------|-------------|
| Creation Wizard | `packages/web/src/app/admin/domains/new/page.tsx` | DNS verification, cert provisioning |
| PLC Configuration | `packages/web/src/app/admin/plc/page.tsx` | Complete PLC setup flow |
| Branding Config | `packages/web/src/app/admin/d/[domainId]/settings/` | Logo, colors, favicon |
| Feature Flags | `packages/web/src/app/admin/d/[domainId]/settings/` | Per-domain toggles |
| Rate Limits | `packages/api/src/routes/admin.ts` | Domain-specific rate limit config |
| Analytics | `packages/web/src/app/admin/d/[domainId]/analytics/` | Domain metrics dashboard |

### 3.2 Domain RBAC Implementation

**Status:** Schema exists (`0031_domain_admin_rbac.sql`), needs UI integration

**Tasks:**

| Task | File | Description |
|------|------|-------------|
| Role Editor | `packages/web/src/components/admin/` | Create/edit roles UI |
| Permission UI | `packages/web/src/components/admin/` | Permission assignment interface |
| Role Hierarchy | `packages/web/src/components/admin/` | Visualization of role inheritance |
| User Invitation | `packages/web/src/app/admin/d/[domainId]/users/` | Domain user invitation flow |
| Bulk Management | `packages/web/src/app/admin/d/[domainId]/users/` | Bulk user operations |
| Groups | `packages/web/src/components/admin/` | Group-based access control |

### 3.3 Domain Clusters and Services

**Status:** Schema exists (`0026_domain_clusters_services.sql`), needs implementation

**Tasks:**

| Task | File | Description |
|------|------|-------------|
| Service Health | `packages/web/src/components/admin/services/` | Service monitoring UI |
| Service Config | `packages/web/src/components/admin/services/` | Configuration management |
| Failover | `packages/api/src/services/` | Failover configuration |
| Render Clusters | `packages/web/src/app/admin/` | Worker pool configuration |
| Job Routing | `packages/api/src/services/` | Route jobs by domain |
| Capacity Planning | `packages/web/src/app/admin/` | Capacity planning tools |

---

## Phase 4: SSO and Enterprise Features (2 weeks)

### 4.1 SSO Provider Completion

**Status:** Services exist, need full integration

**Tasks:**

| Task | File | Description |
|------|------|-------------|
| OIDC Auth Endpoint | `packages/api/src/services/sso/OIDCProviderService.ts` | Complete authorization flow |
| Token Introspection | `packages/api/src/services/sso/OIDCProviderService.ts` | Add introspection endpoint |
| Refresh Rotation | `packages/api/src/services/sso/OIDCProviderService.ts` | Implement token rotation |
| SAML SP-Init | `packages/api/src/services/sso/SAMLProviderService.ts` | SP-initiated SSO flow |
| SAML IdP-Init | `packages/api/src/services/sso/SAMLProviderService.ts` | IdP-initiated SSO flow |
| SAML SLO | `packages/api/src/services/sso/SAMLProviderService.ts` | Single Logout |
| SSO Config UI | `packages/web/src/components/admin/sso/` | Provider management UI |
| JIT Provisioning | `packages/api/src/services/sso/DomainSSOService.ts` | Just-in-time user creation |
| Attribute Mapping | `packages/api/src/services/sso/DomainSSOService.ts` | Configure attribute mapping |

### 4.2 Social Login Integration

**Status:** Framework exists, needs providers

**Tasks:**

| Task | File | Description |
|------|------|-------------|
| Google OAuth | `packages/api/src/services/sso/OIDCConsumerService.ts` | Google login |
| Apple Sign-In | `packages/api/src/services/sso/OIDCConsumerService.ts` | Apple login |
| Twitter/X OAuth | `packages/api/src/services/sso/OIDCConsumerService.ts` | Twitter login |
| Account Linking | `packages/api/src/services/sso/` | Link identities to existing accounts |
| Conflict Resolution | `packages/api/src/services/sso/` | Handle email collisions |
| Unlinking | `packages/api/src/services/sso/` | Remove linked accounts |

---

## Phase 5: Moderation and Trust & Safety (2 weeks)

### 5.1 Content Moderation Pipeline

**Status:** AI providers and queue exist, need production tuning

**Tasks:**

| Task | File | Description |
|------|------|-------------|
| OpenAI Integration | `packages/api/src/services/moderation/ai-providers.ts` | OpenAI moderation API |
| Anthropic Integration | `packages/api/src/services/moderation/ai-providers.ts` | Anthropic content safety |
| Provider Fallback | `packages/api/src/services/moderation/ai-providers.ts` | Fallback chain |
| Reviewer Assignment | `packages/api/src/services/moderation/WorkflowEngine.ts` | Assignment logic |
| SLA Tracking | `packages/api/src/services/moderation/WorkflowEngine.ts` | Track review times |
| Escalation | `packages/api/src/services/moderation/WorkflowEngine.ts` | Escalation workflows |
| Auto-Actions | `packages/api/src/services/moderation/ContentGateService.ts` | Configure thresholds |
| Shadow Banning | `packages/api/src/services/moderation/ContentGateService.ts` | Implement shadow bans |

### 5.2 Appeals System Completion

**Status:** Backend exists, needs admin UI

**Tasks:**

| Task | File | Description |
|------|------|-------------|
| Appeals Queue | `packages/web/src/app/admin/moderation/appeals/` | Admin review interface |
| Decision Workflow | `packages/web/src/app/admin/moderation/appeals/` | Appeal decision UI |
| Reinstatement | `packages/api/src/services/moderation/` | Auto-reinstatement |
| Notification Templates | `packages/api/src/services/moderation/ModerationNotificationService.ts` | Action notifications |
| Status Updates | `packages/api/src/services/moderation/` | Appeal status notifications |
| Violation History | `packages/web/src/app/moderation/` | User violation view |

### 5.3 Domain-Level Moderation

**Status:** Basic structure exists

**Tasks:**

| Task | File | Description |
|------|------|-------------|
| Domain Policies | `packages/api/src/services/moderation/` | Per-domain rules |
| Blocked Words | `packages/api/src/services/moderation/` | Custom blocked content |
| Policy Inheritance | `packages/api/src/services/moderation/` | Inherit from parent domains |
| Domain Queue | `packages/web/src/app/admin/d/[domainId]/moderation/` | Domain mod queue |
| Bulk Actions | `packages/web/src/app/admin/d/[domainId]/moderation/` | Bulk moderation tools |
| Mod Metrics | `packages/web/src/app/admin/d/[domainId]/moderation/` | Moderator performance |

---

## Phase 6: Production Infrastructure (2 weeks)

### 6.1 Observability

**Tasks:**

| Task | Description |
|------|-------------|
| Structured Logging | Implement correlation IDs across services |
| Log Aggregation | Set up ELK/Loki for log collection |
| Log Alerting | Create log-based alerts |
| Prometheus Metrics | Add metrics endpoints to all services |
| Grafana Dashboards | Create operational dashboards |
| SLO Tracking | Implement SLO monitoring |
| OpenTelemetry | Add distributed tracing |
| Trace Correlation | Correlate traces across services |
| Slow Query Detection | Alert on slow database queries |

### 6.2 Security Hardening

**Tasks:**

| Task | Description |
|------|-------------|
| Token Rotation | Implement automatic token rotation |
| Admin MFA | Require MFA for admin accounts |
| Session Management | Add session management UI |
| OAuth Scopes | Complete scope enforcement |
| Rate Limiting | Per-user and per-domain limits |
| Quota Management | Implement usage quotas |
| Encryption at Rest | Encrypt sensitive fields |
| Key Rotation | Implement key rotation |
| GDPR Export | Create data export functionality |

### 6.3 Deployment Configuration

**Tasks:**

| Task | Description |
|------|-------------|
| Dockerfiles | Create production-optimized images |
| Multi-stage Builds | Minimize image size |
| Image Scanning | Add security scanning |
| K8s Manifests | Create Kubernetes configs |
| Helm Charts | Package as Helm charts |
| HPA | Configure horizontal pod autoscaling |
| Rolling Deployments | Zero-downtime deployments |
| Migration Scripts | Database migration automation |
| Backup/Restore | Backup procedures |
| Read Replicas | Database scaling |

---

## Resource Estimates

| Phase | Duration | Engineers | Focus |
|-------|----------|-----------|-------|
| Phase 1: Core Platform | 2-3 weeks | 2 | Video pipeline, feeds, social features |
| Phase 2: Federation | 2-3 weeks | 2 | Consumer hardening, outbound sync, identity |
| Phase 3: Multi-Domain | 2-3 weeks | 2 | Admin UI, RBAC, clusters |
| Phase 4: SSO | 2 weeks | 1 | OIDC/SAML, social login |
| Phase 5: Moderation | 2 weeks | 2 | AI pipeline, appeals, domain policies |
| Phase 6: Infrastructure | 2 weeks | 1 | Observability, security, deployment |

**Total: 12-16 weeks with 2-3 engineers**

---

## Critical Files Reference

| File | Purpose |
|------|---------|
| `packages/api/src/workers/federationConsumer.ts` | Federation content ingestion |
| `packages/api/src/db/schema.ts` | Complete database schema |
| `packages/api/src/routes/admin.ts` | Admin API endpoints |
| `packages/web/src/lib/admin-domain-context.tsx` | Domain switching pattern |
| `packages/api/src/services/sso/DomainSSOService.ts` | Enterprise SSO |
| `packages/api/src/services/moderation/WorkflowEngine.ts` | Moderation workflows |
| `packages/api/src/services/federation/BlobSync.ts` | Federated media sync |

---

## MVP Launch Checklist

### Pre-Launch (1 week before)
- [ ] Load testing completed
- [ ] Security audit passed
- [ ] Backup/restore tested
- [ ] Monitoring dashboards operational
- [ ] On-call rotation established
- [ ] Runbooks created

### Launch Day
- [ ] DNS configuration verified
- [ ] SSL certificates valid
- [ ] CDN caching confirmed
- [ ] Federation endpoints responding
- [ ] Admin access verified
- [ ] Support channels active

### Post-Launch (Week 1)
- [ ] Daily health checks
- [ ] Performance monitoring
- [ ] Bug triage process active
- [ ] User feedback collection
- [ ] Capacity planning review

---

## Dependencies Graph

```
Phase 1 (Core Platform)
    │
    ├── Phase 2 (Federation) ──┐
    │                          │
    └── Phase 3 (Multi-Domain) ┼── Phase 5 (Moderation)
                               │
        Phase 4 (SSO) ─────────┘
                               │
                               └── Phase 6 (Infrastructure)
```

**Notes:**
- Phase 1 is prerequisite for all other phases
- Phases 2, 3, and 4 can run in parallel after Phase 1
- Phase 5 depends on Phase 3 for domain-level moderation
- Phase 6 should run last but can overlap with Phase 5
