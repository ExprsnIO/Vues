import type { DocsAdminState, DocsAuthState, DocsSection } from './types';

const docsSections: DocsSection[] = validateSections([
  {
    id: 'docs-setup',
    slug: 'setup',
    title: 'Setup',
    summary:
      'Install local services, configure environment variables, and complete the first-run wizard to launch the platform.',
    visibility: 'public',
    audience: 'all users',
    status: 'available',
    toc: [
      { id: 'prerequisites', label: 'Prerequisites' },
      { id: 'environment', label: 'Environment and services' },
      { id: 'first-run', label: 'First-run wizard' },
      { id: 'deployment-notes', label: 'Deployment notes' },
    ],
    blocks: [
      {
        type: 'lead',
        body: [
          'Exprsn runs as a pnpm monorepo with local service containers and a first-run setup wizard mounted at /setup by the API server.',
          'The setup flow validates prerequisites, initializes the certificate authority, creates the first admin account, enables platform services, and finalizes the installation.',
        ],
      },
      {
        type: 'section-divider',
        id: 'prerequisites',
        title: 'Prerequisites',
        body: [
          'The repository requires Node.js 20 or newer, pnpm 9, and access to PostgreSQL and Redis. Local development uses MinIO, OpenSearch, and MailHog through Docker Compose.',
        ],
      },
      {
        type: 'checklist',
        title: 'Before you start',
        items: [
          'Install Node.js 20+ and pnpm 9.',
          'Run docker compose up -d to start PostgreSQL, Redis, OpenSearch, MinIO, MailHog, and worker containers.',
          'Copy .env.example to .env and update required values (database URL, storage credentials, OAuth keys).',
          'Run pnpm install to install all workspace dependencies.',
          'Generate OAuth client credentials with pnpm --filter @exprsn/api generate-tokens if you need the browser OAuth flow.',
        ],
      },
      {
        type: 'section-divider',
        id: 'environment',
        title: 'Environment and services',
        body: [
          'The .env.example file is the source of truth for all configuration. Docker Compose provides the backing infrastructure.',
        ],
      },
      {
        type: 'table',
        title: 'Environment variable groups',
        columns: ['Group', 'Purpose'],
        rows: [
          ['Server', 'APP_URL, HOST, and PORT define the API and OAuth-facing base URLs.'],
          ['Data stores', 'DATABASE_URL (PostgreSQL) and REDIS_URL power the API, sessions, caching, and job queues.'],
          ['Storage and media', 'DO_SPACES_* variables configure S3-compatible blob storage for uploads and processed media. FFmpeg and render worker settings control transcoding.'],
          ['OAuth and identity', 'OAUTH_CLIENT_ID, OAUTH_PRIVATE_KEY, PDS settings, and Jetstream URL power login, AT Protocol federation, and identity resolution.'],
          ['Optional providers', 'ANTHROPIC_API_KEY and OPENAI_API_KEY enable AI-powered moderation and content analysis when configured.'],
          ['Branding', 'PLATFORM_NAME, accent colors, theme defaults, and feature flags let operators customize the platform appearance and capabilities.'],
        ],
      },
      {
        type: 'definition-list',
        title: 'Docker Compose services',
        items: [
          {
            term: 'postgres (port 5432)',
            definition: 'Primary relational database for all application data, admin state, sessions, and platform configuration.',
          },
          {
            term: 'redis (port 6379)',
            definition: 'Cache, pub/sub, and queue backing service used by BullMQ workers, the prefetch engine, and real-time features.',
          },
          {
            term: 'minio (ports 9000, 9001)',
            definition: 'S3-compatible object storage for video uploads, transcoded HLS segments, and thumbnails. The createbuckets init container provisions the required buckets on first start.',
          },
          {
            term: 'opensearch (port 9200)',
            definition: 'Full-text search engine for video, user, and sound search. Optional in development.',
          },
          {
            term: 'mailhog (port 8025)',
            definition: 'Email testing UI that captures all outbound email from the transactional email service.',
          },
          {
            term: 'render-worker',
            definition: 'FFmpeg-based video rendering worker that processes HLS transcoding, thumbnail generation, and quality ladder production.',
          },
          {
            term: 'prefetch-worker',
            definition: 'Background worker that warms the feed prefetch cache based on activity signals and configured rules.',
          },
        ],
      },
      {
        type: 'section-divider',
        id: 'first-run',
        title: 'First-run wizard',
        body: [
          'The first-run wizard is served at /setup by the API and is automatically hidden after setup completes.',
          'Access is restricted to localhost unless a temporary setup token is passed via query string or X-Setup-Token header.',
        ],
      },
      {
        type: 'steps',
        title: 'Wizard steps',
        items: [
          {
            title: 'Prerequisites check',
            body: 'The wizard validates database connectivity, Redis availability, storage access, and Node.js version before allowing setup to proceed.',
          },
          {
            title: 'Initialize certificates',
            body: 'Creates a root CA and intermediate signing CA for the did:exprsn identity system. Production deployments must supply a CA_ENCRYPTION_KEY environment variable.',
          },
          {
            title: 'Create the first admin',
            body: 'Creates the initial super_admin account with handle and password validation. This account has full platform control.',
          },
          {
            title: 'Enable services',
            body: 'Choose which platform services to activate: federation, studio, render pipeline, messaging, analytics, prefetch engine, and streaming.',
          },
          {
            title: 'Finalize',
            body: 'Marks setup complete, hides the wizard endpoint, and redirects to the main application.',
          },
        ],
      },
      {
        type: 'callout',
        title: 'Production deployment',
        tone: 'warning',
        body: [
          'Never use the development CA encryption fallback in production. Supply production-grade keys, storage credentials, and network configuration before exposing the server to traffic.',
        ],
      },
      {
        type: 'section-divider',
        id: 'deployment-notes',
        title: 'Deployment notes',
        body: [
          'The repository includes Kubernetes manifests for the API, web app, PostgreSQL, Redis, and workers. A production deploy script and annotated environment template are provided for new environments.',
        ],
      },
      {
        type: 'checklist',
        title: 'Production checklist',
        items: [
          'Set NODE_ENV=production and configure all required environment variables.',
          'Run pnpm db:migrate to apply all database migrations.',
          'Configure a reverse proxy (nginx, Caddy) with TLS termination in front of the API and web servers.',
          'Provision object storage buckets and verify upload/download access from the API container.',
          'Set up monitoring for the BullMQ queues (render, transcode, prefetch, email, push, analytics, moderation).',
        ],
      },
      {
        type: 'link-grid',
        title: 'Next steps',
        links: [
          {
            href: '/docs/backend#ca',
            label: 'Certificate Authority',
            description: 'Review how the root, intermediate, and entity certificates are managed.',
          },
          {
            href: '/docs/administration',
            label: 'Administration',
            description: 'Configure domains, users, services, and moderation after installation.',
          },
          {
            href: '/docs/identity',
            label: 'Identity system',
            description: 'Understand did:exprsn identities and the benefits they unlock.',
          },
        ],
      },
    ],
    sourcePaths: [
      '/Users/rickholland/Projects/Vues/.env.example',
      '/Users/rickholland/Projects/Vues/docker-compose.yml',
      '/Users/rickholland/Projects/Vues/packages/setup/src/api/routes.ts',
      '/Users/rickholland/Projects/Vues/packages/setup/src/steps/certificates.ts',
      '/Users/rickholland/Projects/Vues/packages/setup/src/steps/prerequisites.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/index.ts',
    ],
  },
  {
    id: 'docs-administration',
    slug: 'administration',
    title: 'Administration',
    summary:
      'Manage global platform settings, domain-scoped services, identity, certificates, SSO, rate limits, and operational infrastructure.',
    visibility: 'admin',
    audience: 'platform admins',
    status: 'available',
    toc: [
      { id: 'admin-scope', label: 'Global and domain scope' },
      { id: 'domains', label: 'Domains and access' },
      { id: 'identity-services', label: 'Identity and services' },
      { id: 'rate-limit-tiers', label: 'Rate limit tiers' },
      { id: 'moderation-ops', label: 'Moderation and audit' },
      { id: 'prefetch-management', label: 'Prefetch Engine management' },
      { id: 'worker-queues', label: 'Worker queue administration' },
    ],
    blocks: [
      {
        type: 'lead',
        body: [
          'The admin interface supports both global platform administration and domain-scoped management. Domain selection is persisted in browser storage and drives the route set under /admin/d/[domainId].',
          'This section is restricted to authenticated administrators.',
        ],
      },
      {
        type: 'section-divider',
        id: 'admin-scope',
        title: 'Global and domain scope',
        body: [
          'The admin layout provides grouped navigation for users and access, content and moderation, platform services, infrastructure, and system operations. Domain-scoped routes mirror the global structure with domain-specific context.',
        ],
      },
      {
        type: 'definition-list',
        title: 'Administrative scopes',
        items: [
          {
            term: 'Global admin',
            definition: 'Routes under /admin for platform-wide operations: users, content, settings, infrastructure, workers, prefetch, certificates, tokens, and analytics.',
          },
          {
            term: 'Domain admin',
            definition: 'Routes under /admin/d/[domainId] for single-domain management: users, groups, organizations, services, SSO, certificates, invite codes, and prefetch overrides.',
          },
          {
            term: 'Admin session',
            definition: 'Determined by the admin session flow with role-based permissions. Admin roles include super_admin, admin, moderator, and support with descending privilege levels.',
          },
        ],
      },
      {
        type: 'section-divider',
        id: 'domains',
        title: 'Domains and access',
        body: [
          'Domains define tenant boundaries within the platform. Each domain has its own users, groups, handle suffix rules, service assignments, and configuration overrides.',
        ],
      },
      {
        type: 'table',
        title: 'Domain management areas',
        columns: ['Area', 'Capabilities'],
        rows: [
          ['Domain settings', 'Overview, services, identity, SSO, certificates, branding, federation, and invite code configuration.'],
          ['User and group access', 'Domain users, roles with granular permissions, groups, and group membership management.'],
          ['Handle and identity', 'Handle reservations, domain-specific did:exprsn identity creation, and PLC directory configuration.'],
          ['Service assignment', 'Domain-to-service bindings and render cluster relationships for workload distribution.'],
          ['Invite codes', 'Create, manage, and revoke invite codes for controlled domain onboarding.'],
        ],
      },
      {
        type: 'section-divider',
        id: 'identity-services',
        title: 'Identity and services',
        body: [
          'Domain settings include PLC identity controls, certificate management, SSO provider configuration, and feature toggles. The identity system integrates with the platform CA to issue did:exprsn identities to domain members.',
        ],
      },
      {
        type: 'checklist',
        title: 'Domain identity setup',
        items: [
          'Verify the domain and establish handle suffix rules before inviting members.',
          'Configure PLC settings, reserve handles, and create domain identities according to your naming policy.',
          'Issue or revoke certificates through the domain certificates UI for services and integrations.',
          'Configure SSO providers (OIDC, SAML, or social login) and token policies for the domain.',
          'Set up invite codes for controlled member onboarding.',
        ],
      },
      {
        type: 'section-divider',
        id: 'rate-limit-tiers',
        title: 'Rate limit tiers',
        body: [
          'The platform enforces tiered API rate limits based on identity type. The auth configuration table stores per-tier limits that can be adjusted by administrators. Each API response includes X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Burst, and X-RateLimit-Tier headers.',
        ],
      },
      {
        type: 'table',
        title: 'Rate limit tier defaults',
        columns: ['Tier', 'Requests/min', 'Burst', 'Applied to'],
        rows: [
          ['Domain override', 'Custom', 'Custom', 'Requests scoped to a domain with custom rate limits configured.'],
          ['Organization override', 'Custom', 'Custom', 'Requests from users in organizations with custom rate limits.'],
          ['Admin', '120', '50', 'Authenticated users with an active admin session.'],
          ['did:exprsn', '90', '35', 'Authenticated users with a did:exprsn identity.'],
          ['User', '60', '20', 'Authenticated users with did:plc or did:web identities.'],
          ['Anonymous', '30', '10', 'Unauthenticated requests identified by IP address.'],
        ],
      },
      {
        type: 'callout',
        title: 'did:exprsn rate limit benefit',
        tone: 'info',
        body: [
          'Users with a did:exprsn identity automatically receive 50% more API capacity than standard users (90 vs 60 requests/minute). This benefit is applied transparently without any user action beyond having a did:exprsn identity.',
        ],
      },
      {
        type: 'section-divider',
        id: 'moderation-ops',
        title: 'Moderation and audit',
        body: [
          'Domain and platform admins have access to moderation queues, appeals, reports, activity feeds, and audit logs. The moderation pipeline includes automated content screening, SLA tracking, and workflow engine automation.',
        ],
      },
      {
        type: 'definition-list',
        title: 'Moderation tools',
        items: [
          {
            term: 'Moderation queues',
            definition: 'Domain and global queues for pending reports with priority ordering, category filtering, and SLA-tracked response times.',
          },
          {
            term: 'Appeal handling',
            definition: 'Review and resolve user appeals against sanctions. Appeals include the original sanction context, user reasoning, and a decision workflow.',
          },
          {
            term: 'Banned words and tags',
            definition: 'Configure domain-level and global-level content filters for prohibited words and hashtags.',
          },
          {
            term: 'Trusted user policies',
            definition: 'Mark accounts as trusted to bypass certain automated moderation checks.',
          },
          {
            term: 'Audit trail',
            definition: 'All moderation actions are logged with the acting admin, timestamp, and decision reasoning.',
          },
        ],
      },
      {
        type: 'section-divider',
        id: 'prefetch-management',
        title: 'Prefetch Engine management',
        body: [
          'The Prefetch Engine admin dashboard is available at /admin/infrastructure/prefetch with a 10-tab interface covering global settings, per-domain overrides, rules, alerts, metrics, and live activity.',
        ],
      },
      {
        type: 'table',
        title: 'Prefetch admin tabs',
        columns: ['Tab', 'Purpose'],
        rows: [
          ['Overview', 'Engine status, cache hit rate, and queue depth at a glance.'],
          ['Global config', 'Default TTLs, prefetch depth limits, and engine-wide toggles.'],
          ['Domain overrides', 'Per-domain configuration that supersedes global defaults.'],
          ['Rules', 'Signal-based rules that trigger prefetch for specific content patterns.'],
          ['Alerts', 'Thresholds for cache miss rate, queue depth, and error rate alerts.'],
          ['Metrics', 'Time-series charts for hit rate, latency, and throughput.'],
          ['Activity log', 'Recent prefetch decisions with signal source, content target, and outcome.'],
          ['Hot reload', 'Trigger a configuration reload without restarting the prefetch worker.'],
        ],
      },
      {
        type: 'callout',
        title: 'Configuration hot-reload',
        tone: 'info',
        body: [
          'Prefetch configuration changes take effect on the next hot-reload cycle without a process restart. The hot-reload tab shows the last reload timestamp and allows forcing an immediate reload.',
        ],
      },
      {
        type: 'section-divider',
        id: 'worker-queues',
        title: 'Worker queue administration',
        body: [
          'The worker queue admin page surfaces all active BullMQ queues and their current state. Operators can pause, resume, retry failed jobs, and clean completed or stale jobs per queue.',
        ],
      },
      {
        type: 'definition-list',
        title: 'Managed queues',
        items: [
          {
            term: 'render',
            definition: 'FFmpeg video rendering jobs: HLS transcode output, thumbnail generation, and quality ladder production.',
          },
          {
            term: 'transcode',
            definition: 'Adaptive transcode jobs for uploaded source videos before render output.',
          },
          {
            term: 'prefetch',
            definition: 'Background prefetch tasks dispatched by the activity bridge and rules engine.',
          },
          {
            term: 'email',
            definition: 'Outbound email delivery for transactional messages, digests, and security notifications.',
          },
          {
            term: 'push',
            definition: 'Web push notification dispatch using VAPID key authentication.',
          },
          {
            term: 'analytics',
            definition: 'Asynchronous analytics event processing and aggregation for the creator dashboard.',
          },
          {
            term: 'moderation',
            definition: 'Background moderation pipeline jobs including automated screening and SLA tracking.',
          },
        ],
      },
      {
        type: 'checklist',
        title: 'Queue operations',
        items: [
          'Pause a queue to stop workers from picking up new jobs without losing the pending job list.',
          'Resume a paused queue to restore normal processing.',
          'Retry all failed jobs in a queue after diagnosing the underlying cause.',
          'Clean completed or stale jobs older than a configurable age threshold.',
          'Inspect individual job payloads and error traces from the job detail view.',
        ],
      },
      {
        type: 'link-grid',
        title: 'Related topics',
        links: [
          {
            href: '/docs/backend#tokens',
            label: 'Backend Tokens',
            description: 'Review domain API token lifecycle, scopes, and operational constraints.',
          },
          {
            href: '/docs/backend#ca',
            label: 'Backend CA',
            description: 'Review the CA and certificate model behind admin certificate workflows.',
          },
          {
            href: '/docs/backend#federation',
            label: 'Backend Federation',
            description: 'Review AT Protocol federation configuration and audit trail.',
          },
          {
            href: '/docs/identity',
            label: 'Identity system',
            description: 'Understand did:exprsn identities and their platform benefits.',
          },
        ],
      },
    ],
    sourcePaths: [
      '/Users/rickholland/Projects/Vues/packages/web/src/app/admin/layout.tsx',
      '/Users/rickholland/Projects/Vues/packages/web/src/app/admin/d/[domainId]/settings/page.tsx',
      '/Users/rickholland/Projects/Vues/packages/web/src/app/admin/d/[domainId]/settings/identity/page.tsx',
      '/Users/rickholland/Projects/Vues/packages/web/src/app/admin/d/[domainId]/settings/certificates/page.tsx',
      '/Users/rickholland/Projects/Vues/packages/api/src/auth/scope-middleware.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/services/oauth/OAuthAgent.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/workers/index.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/services/streaming/AdaptiveTranscodeService.ts',
    ],
  },
  {
    id: 'docs-user-experience',
    slug: 'user-experience',
    title: 'User Experience',
    summary:
      'Sign in, navigate the platform, switch between personal and organization contexts, and customize your settings.',
    visibility: 'public',
    audience: 'members and creators',
    status: 'available',
    toc: [
      { id: 'sign-in', label: 'Sign-in and sessions' },
      { id: 'navigation', label: 'Navigation' },
      { id: 'profile-context', label: 'Profile and organization context' },
      { id: 'settings', label: 'Settings' },
    ],
    blocks: [
      {
        type: 'lead',
        body: [
          'The web app supports local Exprsn accounts and AT Protocol sign-in. After authentication, the shared sidebar and mobile navigation shell provide access to all platform features.',
        ],
      },
      {
        type: 'section-divider',
        id: 'sign-in',
        title: 'Sign-in and sessions',
        body: [
          'The login screen offers two modes: local Exprsn sign-in and AT Protocol OAuth sign-in. Local sessions use access and refresh token pairs managed by the browser session flow.',
        ],
      },
      {
        type: 'steps',
        title: 'Sign-in paths',
        items: [
          {
            title: 'Local account sign-in',
            body: 'Enter a handle or email address plus password. New account creation validates handle format, email format, and minimum password length.',
          },
          {
            title: 'AT Protocol sign-in',
            body: 'Start OAuth-based sign-in with your AT Protocol handle. The browser OAuth flow uses the platform client metadata and callback route.',
          },
          {
            title: 'Session recovery',
            body: 'On app load, the web client restores local sessions first and falls back to OAuth session lookup when available. 401 responses trigger automatic token refresh with request deduplication.',
          },
        ],
      },
      {
        type: 'callout',
        title: 'New user onboarding',
        tone: 'info',
        body: [
          'First-time users are guided through a three-step /welcome flow covering profile setup, interest selection, and a following starter pack. The wizard is skipped for returning users.',
        ],
      },
      {
        type: 'section-divider',
        id: 'navigation',
        title: 'Navigation',
        body: [
          'The sidebar anchors the core experience with links to For You, Following, Discover, Upload, Notifications, Messages, Bookmarks, and account actions.',
        ],
      },
      {
        type: 'definition-list',
        title: 'Navigation areas',
        items: [
          {
            term: 'Feed and discovery',
            definition: 'For You (personalized algorithmic feed), Following (chronological from followed creators), Discover (search, trending hashtags, trending sounds, and challenges).',
          },
          {
            term: 'Creation',
            definition: 'Upload page for publishing videos, duets, and stitches. The editor supports caption @mentions, #hashtag autocomplete, and optional content signing.',
          },
          {
            term: 'Communication',
            definition: 'Notifications center, persistent messaging drawer for DMs and group chats, live chat for streams, and watch party synchronized playback.',
          },
          {
            term: 'Saved content',
            definition: 'Bookmarks for saving videos to review later.',
          },
        ],
      },
      {
        type: 'section-divider',
        id: 'profile-context',
        title: 'Profile and organization context',
        body: [
          'The account dropdown lets users switch between personal and organization contexts. Organization members see their org roles; admin users see a dashboard shortcut.',
        ],
      },
      {
        type: 'checklist',
        title: 'Account menu actions',
        items: [
          'Switch between personal and organization contexts.',
          'Open organization management from settings.',
          'Open the admin dashboard (visible to admin-role users).',
          'View your profile, identity badge, and certificate details.',
          'Access settings and documentation.',
          'Sign out of the current session.',
        ],
      },
      {
        type: 'section-divider',
        id: 'settings',
        title: 'Settings',
        body: [
          'The settings page organizes controls into categories covering appearance, playback, privacy, notifications, accessibility, content, editor presets, organizations, security, and account management.',
        ],
      },
      {
        type: 'table',
        title: 'Settings categories',
        columns: ['Category', 'Controls'],
        rows: [
          ['Appearance', 'Theme selection (ocean, forest, sunset, lavender, slate), color mode (light, dark, system), and layout behavior.'],
          ['Playback', 'Autoplay, default quality, mute on scroll, looping, and data saver preferences.'],
          ['Privacy', 'Private account toggle, activity visibility, duet/stitch/comment permissions, and messaging controls.'],
          ['Notifications', 'Per-event toggles for likes, comments, follows, mentions, messages, and email digest frequency.'],
          ['Accessibility', 'Reduced motion, high contrast, large text, and screen-reader optimization.'],
          ['Content and editor', 'Language preference, content warnings, sensitive content display, and editor preset preferences.'],
          ['Feed preferences', 'Customize the For You algorithm weighting, content type filters, and discovery ratio.'],
          ['Security', 'Active sessions, password change, and personal access token management.'],
        ],
      },
    ],
    sourcePaths: [
      '/Users/rickholland/Projects/Vues/packages/web/src/app/login/page.tsx',
      '/Users/rickholland/Projects/Vues/packages/web/src/components/Sidebar.tsx',
      '/Users/rickholland/Projects/Vues/packages/web/src/app/settings/page.tsx',
      '/Users/rickholland/Projects/Vues/packages/shared/src/types/settings.ts',
      '/Users/rickholland/Projects/Vues/packages/web/src/lib/auth-context.tsx',
      '/Users/rickholland/Projects/Vues/packages/web/src/app/page.tsx',
    ],
  },
  {
    id: 'docs-moderation',
    slug: 'moderation',
    title: 'Moderation',
    summary:
      'Submit reports, track sanctions, file appeals, and understand how the moderation system protects the community.',
    visibility: 'public',
    audience: 'moderators and admins',
    status: 'available',
    toc: [
      { id: 'reporting', label: 'Reporting and statuses' },
      { id: 'account-status', label: 'Account status and sanctions' },
      { id: 'appeals', label: 'Appeals' },
      { id: 'ops-overview', label: 'Moderator operations overview' },
    ],
    blocks: [
      {
        type: 'lead',
        body: [
          'The moderation system covers report submission, status tracking, account standing, sanctions, and appeals from the user side. Domain and platform moderator tools exist in the admin interface.',
        ],
      },
      {
        type: 'section-divider',
        id: 'reporting',
        title: 'Reporting and statuses',
        body: [
          'Users can report content from any video card, comment, or profile and track their submitted reports from the moderation page.',
        ],
      },
      {
        type: 'definition-list',
        title: 'Report statuses',
        items: [
          {
            term: 'Pending review',
            definition: 'The report has been submitted and is waiting for moderator review. SLA tracking begins at submission.',
          },
          {
            term: 'Reviewed',
            definition: 'A moderator has reviewed the report. The outcome is being processed.',
          },
          {
            term: 'Action taken',
            definition: 'A moderation action (warning, content removal, account restriction) was applied based on the report.',
          },
          {
            term: 'Dismissed',
            definition: 'The report was closed without enforcement action after review.',
          },
        ],
      },
      {
        type: 'section-divider',
        id: 'account-status',
        title: 'Account status and sanctions',
        body: [
          'The user-facing moderation API returns your account standing along with any active and recent sanctions. Standings are derived from active sanctions: good standing, warning, or restricted.',
        ],
      },
      {
        type: 'table',
        title: 'What users can review',
        columns: ['Area', 'Details'],
        rows: [
          ['Active sanctions', 'Current restrictions with reason, type, expiry date, and whether an appeal can be submitted.'],
          ['Sanction history', 'Expired sanctions with original reason and outcome for reference.'],
          ['Appeal state', 'Each sanction shows whether an appeal is available, pending, approved, or denied.'],
        ],
      },
      {
        type: 'section-divider',
        id: 'appeals',
        title: 'Appeals',
        body: [
          'Appeals are tied to individual sanctions. The API requires a sanction identifier and a written explanation before creating a pending appeal.',
        ],
      },
      {
        type: 'steps',
        title: 'Appeal flow',
        items: [
          {
            title: 'Review account status',
            body: 'Check your active sanctions and confirm the sanction is eligible for appeal.',
          },
          {
            title: 'Submit the appeal',
            body: 'Provide the sanction reference, your reasoning, and any supporting context. The appeal enters a pending state.',
          },
          {
            title: 'Await moderator review',
            body: 'The sanction and appeal records reflect the pending review. You receive a notification when the appeal is resolved.',
          },
        ],
      },
      {
        type: 'section-divider',
        id: 'ops-overview',
        title: 'Moderator operations overview',
        body: [
          'The admin interface provides domain and global moderation queues, banned words and tags management, video moderation queues, trusted-user policies, appeal handling, and a workflow engine for automated moderation rules.',
        ],
      },
      {
        type: 'callout',
        title: 'Moderator tools',
        tone: 'neutral',
        body: [
          'Detailed operational queue handling, domain moderation policies, and backend moderation internals are documented in the Administration and Backend Documentation sections.',
        ],
      },
      {
        type: 'link-grid',
        title: 'Related topics',
        links: [
          {
            href: '/docs/administration#moderation-ops',
            label: 'Administration',
            description: 'Review domain moderation pages, reports, appeals, and audit tooling.',
          },
          {
            href: '/docs/backend#auth',
            label: 'Backend Auth',
            description: 'Review the permission and token model used by moderation endpoints.',
          },
        ],
      },
    ],
    sourcePaths: [
      '/Users/rickholland/Projects/Vues/packages/api/src/routes/user-moderation.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/services/moderation/service.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/services/moderation/AppealsService.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/services/moderation/WorkflowEngine.ts',
      '/Users/rickholland/Projects/Vues/packages/web/src/app/admin/d/[domainId]/moderation/page.tsx',
    ],
  },
  {
    id: 'docs-backend',
    slug: 'backend',
    title: 'Backend Documentation',
    summary:
      'Certificate authority, authentication, tokens, federation, rate limits, prefetch, email, and push notification infrastructure.',
    visibility: 'admin',
    audience: 'operators and backend admins',
    status: 'available',
    toc: [
      { id: 'ca', label: 'CA' },
      { id: 'auth', label: 'Auth' },
      { id: 'tokens', label: 'Tokens' },
      { id: 'rate-limits', label: 'Rate limits' },
      { id: 'federation', label: 'Federation' },
      { id: 'prefetch-arch', label: 'Prefetch architecture' },
      { id: 'email-service', label: 'Email service' },
      { id: 'push-infra', label: 'Push notification infrastructure' },
    ],
    blocks: [
      {
        type: 'lead',
        body: [
          'The backend combines local account authentication, AT Protocol OAuth, a certificate authority, tiered rate limits, and multiple token types for user, service, and domain operations.',
          'This section documents current implementation behavior across the API server, workers, and supporting services.',
        ],
      },
      {
        type: 'section-divider',
        id: 'ca',
        title: 'CA',
        body: [
          'The certificate service manages root, intermediate, and entity certificates. Private keys are encrypted at rest with the CA encryption key. The admin configuration includes CRL publishing and OCSP responder settings.',
        ],
      },
      {
        type: 'table',
        title: 'Certificate layers',
        columns: ['Layer', 'Purpose'],
        rows: [
          ['Root CA', 'Long-lived trust anchor created once during setup. All certificates trace back to this root.'],
          ['Intermediate CA', 'Primary signing tier that issues entity certificates without exposing root key material.'],
          ['Entity certificates', 'Issued for client, server, and code-signing use cases tied to users, organizations, or services.'],
          ['Revocation data', 'CRL records and OCSP responses support timely revocation checks by relying parties.'],
        ],
      },
      {
        type: 'callout',
        title: 'Production CA key',
        tone: 'warning',
        body: [
          'The CA service uses a development fallback encryption key when CA_ENCRYPTION_KEY is not set. This fallback must be replaced before issuing certificates in production.',
        ],
      },
      {
        type: 'section-divider',
        id: 'auth',
        title: 'Auth',
        body: [
          'The API supports local account creation, session management, and AT Protocol OAuth flows. Scope-based authorization governs access to all endpoints.',
        ],
      },
      {
        type: 'definition-list',
        title: 'Auth model',
        items: [
          {
            term: 'Local accounts',
            definition: 'Stored with handle, email, password hash, and signing keys. Sessions issue exp_ access tokens and ref_ refresh tokens with configurable expiry.',
          },
          {
            term: 'OAuth and AT Protocol',
            definition: 'The API serves client metadata and supports browser OAuth flows. Scope-aware middleware validates token permissions using hierarchical scope expansion.',
          },
          {
            term: 'Admin sessions',
            definition: 'Separate from user sessions with configurable duration, MFA requirements, and concurrency limits. Four admin roles: super_admin, admin, moderator, support.',
          },
          {
            term: 'Scope expansion',
            definition: 'Parent scopes (read, write) expand into granular resource scopes (videos:read, comments:write, etc.) during authorization checks.',
          },
          {
            term: 'SSO providers',
            definition: 'Domain-level OIDC, SAML, and social login (Google, GitHub, Apple) provider configuration with token policy controls.',
          },
        ],
      },
      {
        type: 'section-divider',
        id: 'tokens',
        title: 'Tokens',
        body: [
          'The platform uses multiple token families with different lifetimes, scopes, and management models.',
        ],
      },
      {
        type: 'table',
        title: 'Token families',
        columns: ['Type', 'Prefix', 'Notes'],
        rows: [
          ['Local access token', 'exp_', 'Short-lived session token for authenticated API requests.'],
          ['Local refresh token', 'ref_', 'Longer-lived token for session refresh without re-authentication.'],
          ['OAuth token', '(JWT)', 'Managed through OAuth tables with scope-aware validation.'],
          ['Domain API token', 'api_', 'Managed from domain admin settings with scopes, revocation, refresh, and usage tracking.'],
          ['Service token', 'svc_', 'Inter-service authentication for federation peers and internal services.'],
        ],
      },
      {
        type: 'section-divider',
        id: 'rate-limits',
        title: 'Rate limits',
        body: [
          'The API enforces tiered rate limits resolved by OAuthAgent.getRateLimit(). The rate limit tier is determined by identity type and included in every response as the X-RateLimit-Tier header.',
        ],
      },
      {
        type: 'table',
        title: 'Rate limit resolution order',
        columns: ['Priority', 'Tier', 'Requests/min', 'Burst'],
        rows: [
          ['1', 'Domain override', 'Custom', 'Custom'],
          ['2', 'Organization override', 'Custom', 'Custom'],
          ['3', 'Admin', '120', '50'],
          ['4', 'did:exprsn', '90', '35'],
          ['5', 'User (did:plc, did:web)', '60', '20'],
          ['6', 'Anonymous', '30', '10'],
        ],
      },
      {
        type: 'definition-list',
        title: 'Rate limit response headers',
        items: [
          {
            term: 'X-RateLimit-Limit',
            definition: 'The maximum number of requests allowed per minute for the current tier.',
          },
          {
            term: 'X-RateLimit-Remaining',
            definition: 'The number of requests remaining in the current window.',
          },
          {
            term: 'X-RateLimit-Burst',
            definition: 'The burst limit for short request spikes.',
          },
          {
            term: 'X-RateLimit-Tier',
            definition: 'The tier name applied to this request: admin, exprsn, user, or anonymous.',
          },
        ],
      },
      {
        type: 'callout',
        title: 'did:exprsn rate limit benefit',
        tone: 'info',
        body: [
          'Users with a did:exprsn identity receive 90 requests/minute and a burst limit of 35, compared to 60/20 for standard users. This tier is applied automatically based on the DID prefix and requires no additional configuration.',
        ],
      },
      {
        type: 'section-divider',
        id: 'federation',
        title: 'Federation',
        body: [
          'The platform implements AT Protocol federation through BlobSync, a firehose relay, DID resolution, ServiceAuth, and .well-known discovery endpoints.',
        ],
      },
      {
        type: 'definition-list',
        title: 'Federation components',
        items: [
          {
            term: 'BlobSync',
            definition: 'Synchronizes binary large objects (video, thumbnails, avatars) between instances by resolving blob CIDs from remote PDS records and mirroring them to local storage.',
          },
          {
            term: 'Firehose relay',
            definition: 'Subscribes to the AT Protocol firehose from configured relay hosts and forwards relevant records to the local event processing pipeline.',
          },
          {
            term: 'DID resolution',
            definition: 'Resolves did:plc, did:web, and did:exprsn identifiers to DID documents for auth verification and profile hydration. Results are cached in Redis with configurable TTLs.',
          },
          {
            term: 'ServiceAuth',
            definition: 'Generates and validates inter-service JWT tokens for authenticated requests between federation peers.',
          },
          {
            term: '/.well-known discovery',
            definition: 'Publishes AT Protocol discovery endpoints (did.json, atproto-did, nodeinfo) for external instances to locate the platform.',
          },
        ],
      },
      {
        type: 'section-divider',
        id: 'prefetch-arch',
        title: 'Prefetch architecture',
        body: [
          'The prefetch system uses a cache-first read model for timeline and feed routes. An activity bridge translates real-time user signals into prefetch tasks, and the configuration service supports hot-reloading without worker restarts.',
        ],
      },
      {
        type: 'steps',
        title: 'Prefetch data flow',
        items: [
          {
            title: 'Activity signal ingestion',
            body: 'View, like, follow, and share events are captured by the activity bridge and converted into weighted prefetch candidates.',
          },
          {
            title: 'Rule evaluation',
            body: 'Configured rules evaluate each candidate against signal thresholds, content type filters, and domain-specific overrides to decide whether to enqueue a prefetch task.',
          },
          {
            title: 'Cache warm',
            body: 'The prefetch worker resolves the feed query and writes the result into the Redis prefetch cache with a TTL from the rule configuration.',
          },
          {
            title: 'Cache-first read',
            body: 'Feed and timeline handlers check the prefetch cache first. Cache hits return directly; misses execute the database query and store the result.',
          },
          {
            title: 'Hot-reload',
            body: 'The configuration service polls for changes and reloads rules and thresholds in-process without dropping the worker or losing queued tasks.',
          },
        ],
      },
      {
        type: 'section-divider',
        id: 'email-service',
        title: 'Email service',
        body: [
          'Transactional and digest email is delivered through a BullMQ queue backed by a configurable SMTP provider. Templates are rendered server-side.',
        ],
      },
      {
        type: 'table',
        title: 'Email message types',
        columns: ['Type', 'Trigger'],
        rows: [
          ['Welcome', 'Sent on successful account creation.'],
          ['Password reset', 'Sent when a user requests a reset token.'],
          ['Security alert', 'Sent on suspicious session activity or account setting changes.'],
          ['Weekly digest', 'Scheduled cron assembles activity highlights and dispatches the digest job.'],
        ],
      },
      {
        type: 'section-divider',
        id: 'push-infra',
        title: 'Push notification infrastructure',
        body: [
          'Browser push notifications use the Web Push Protocol with VAPID key authentication. The platform generates a P-256 key pair on first use.',
        ],
      },
      {
        type: 'definition-list',
        title: 'Push infrastructure',
        items: [
          {
            term: 'VAPID key pair',
            definition: 'A P-256 key pair generated once and stored in environment config. The public key is served to clients for browser verification.',
          },
          {
            term: 'Push subscription storage',
            definition: 'Client subscription objects (endpoint, keys) are stored per user per device. Expired or invalid endpoints are cleaned up on delivery failure.',
          },
          {
            term: 'Service Worker',
            definition: 'Handles push events in the background, displays notifications, and routes tap actions to the correct in-app route.',
          },
          {
            term: 'Push queue worker',
            definition: 'The BullMQ push worker fans out delivery to all active subscriptions, retries transient failures, and removes permanently invalid endpoints.',
          },
        ],
      },
    ],
    sourcePaths: [
      '/Users/rickholland/Projects/Vues/packages/api/src/routes/ca.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/routes/auth.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/routes/admin-settings.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/auth/scope-middleware.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/services/oauth/OAuthAgent.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/services/ca/CertificateManager.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/services/federation/BlobSync.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/services/federation/ServiceAuth.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/services/notifications/push.ts',
    ],
  },
  {
    id: 'docs-changelog',
    slug: 'changelog',
    title: 'Platform Updates',
    summary:
      'Recent features, improvements, and changes to the Exprsn platform.',
    visibility: 'public',
    audience: 'all users',
    status: 'available',
    toc: [
      { id: 'march-2026-identity', label: 'did:exprsn user benefits' },
      { id: 'march-2026-release', label: 'March 2026 release' },
      { id: 'march-2026-features', label: 'New features' },
      { id: 'march-2026-infra', label: 'Infrastructure' },
      { id: 'march-2026-apple', label: 'Apple platforms' },
      { id: 'recent-fixes', label: 'Recent fixes' },
      { id: 'infrastructure', label: 'Schema updates' },
    ],
    blocks: [
      {
        type: 'lead',
        body: [
          'This section tracks platform updates, new features, and infrastructure improvements. Check here for details on recent changes and new capabilities.',
        ],
      },
      {
        type: 'section-divider',
        id: 'march-2026-identity',
        title: 'did:exprsn user benefits',
        body: [
          'Three new tangible benefits for did:exprsn identity holders have been shipped, incentivizing adoption of the stronger certificate-backed identity method.',
        ],
      },
      {
        type: 'definition-list',
        title: 'New did:exprsn benefits',
        items: [
          {
            term: 'Feed and search ranking boost (1.15x)',
            definition: 'Content from did:exprsn authors receives a 15% scoring multiplier in the For You algorithm, trending calculation, and relevance-sorted search results. Chronological timelines and challenge leaderboards are unaffected.',
          },
          {
            term: 'Signed content indicator',
            definition: 'Signed and verified videos now display a green checkmark-shield badge next to the identity badge on the video overlay. Clicking the badge opens a detail panel showing verification status, signing timestamp, signer identity, certificate fingerprint, and issuer.',
          },
          {
            term: 'Tiered rate limits',
            definition: 'did:exprsn users receive 90 API requests/minute with a burst limit of 35, compared to 60/20 for standard users. The tier is reflected in the new X-RateLimit-Tier response header.',
          },
        ],
      },
      {
        type: 'section-divider',
        id: 'march-2026-release',
        title: 'March 2026 release',
        body: [
          'The March 2026 sprint delivered new user-facing features, creator tooling, identity infrastructure, a messaging overhaul, Apple platform support, and broad infrastructure improvements.',
        ],
      },
      {
        type: 'section-divider',
        id: 'march-2026-features',
        title: 'New features',
        body: [
          'Product features shipped in this sprint.',
        ],
      },
      {
        type: 'definition-list',
        title: 'Product features',
        items: [
          {
            term: 'Prefetch Engine admin dashboard',
            definition: 'A 10-tab admin interface covering global configuration, per-domain overrides, prefetch rules, alert thresholds, real-time metrics, and activity logs with hot-reloadable configuration.',
          },
          {
            term: 'Cache-first timeline with activity-based prefetching',
            definition: 'Feed reads resolve from a warm prefetch cache before hitting the database. User activity (views, likes, follows) feeds back into the prefetch engine to keep high-signal content warm.',
          },
          {
            term: 'Messaging UX overhaul',
            definition: 'Direct messages are accessible through a persistent sliding drawer from anywhere in the app. Incoming messages show toast notifications and optionally trigger push or sound alerts.',
          },
          {
            term: 'Worker administration dashboard',
            definition: 'A dedicated admin page surfaces all seven BullMQ queues with pause, resume, retry, and clean operations per queue.',
          },
          {
            term: 'Hashtag follow and trending direction indicators',
            definition: 'Users can follow/unfollow hashtags from tag pages and inline chips. Trending lists show directional indicators (rising, stable, falling) based on velocity.',
          },
          {
            term: 'MentionInput component',
            definition: 'Inline @user mention and #hashtag autocomplete in comment fields and video captions with keyboard navigation.',
          },
          {
            term: 'Group chat',
            definition: 'Multi-participant conversations with group roles, real-time presence, and the same transport as direct messages.',
          },
          {
            term: 'Web push notifications',
            definition: 'VAPID-signed push infrastructure delivers browser notifications for messages, mentions, follows, and system alerts via a Service Worker.',
          },
          {
            term: 'Email notification system',
            definition: 'Transactional email (welcome, password reset, security alerts) plus a weekly digest cron via SMTP.',
          },
          {
            term: 'Creator analytics dashboard',
            definition: 'Four-tab analytics view (Views, Engagement, Audience, Video Performance) with CSS-based charts and sortable per-video metrics.',
          },
          {
            term: 'User onboarding flow',
            definition: 'Three-step /welcome flow: profile setup, interest selection, and following starter pack.',
          },
          {
            term: 'Password reset flow',
            definition: 'Token-based password reset with time-limited links and minimum password strength enforcement.',
          },
          {
            term: 'Terms of Service and Privacy Policy',
            definition: 'Static /terms and /privacy pages linked from sign-up, footer, and settings.',
          },
          {
            term: 'did:exprsn identity badges',
            definition: 'Verified badges backed by the certificate authority with cryptographic verification rather than admin-granted flags.',
          },
          {
            term: 'Signed video posts',
            definition: 'Cryptographic content signing at publish time with authorship attestation badges on video cards.',
          },
          {
            term: 'Organization membership verification',
            definition: 'Certificate-backed organizational membership proof replacing manual verified-member flags.',
          },
          {
            term: 'Admin theme toggle',
            definition: 'Dark, light, and system theme cycling in the admin sidebar with local storage persistence.',
          },
          {
            term: 'Dashboard preferences',
            definition: 'Per-operator dashboard layout, default domain, notification verbosity, and table density options.',
          },
        ],
      },
      {
        type: 'section-divider',
        id: 'march-2026-infra',
        title: 'Infrastructure',
        body: [
          'Platform engineering improvements shipped alongside product features.',
        ],
      },
      {
        type: 'checklist',
        title: 'Infrastructure improvements',
        items: [
          'Structured JSON logging with request ID propagation across API and worker processes.',
          '401 auto-retry with deduplicated token refresh for concurrent requests.',
          'AT Protocol federation audit with six bug fixes across BlobSync, firehose relay, and DID resolution.',
          'Production deploy script and annotated environment template.',
          'Playwright end-to-end test suite covering 11 critical user flows.',
          'Production data preparation scripts for seeding demo environments.',
          'Tiered rate limit system with X-RateLimit-Tier response header.',
          'Feed and search ranking boost for did:exprsn identity holders.',
        ],
      },
      {
        type: 'section-divider',
        id: 'march-2026-apple',
        title: 'Apple platforms',
        body: [
          'A native SwiftUI application was built for macOS, iPadOS, and iPhone.',
        ],
      },
      {
        type: 'definition-list',
        title: 'Apple platform details',
        items: [
          {
            term: 'NavigationSplitView and TabView shells',
            definition: 'macOS and iPad use NavigationSplitView with persistent sidebar. iPhone uses bottom TabView. Both share the same view hierarchy.',
          },
          {
            term: 'AVPlayer HLS playback and AVCaptureSession camera',
            definition: 'Video playback uses AVPlayer with adaptive HLS streaming. Camera capture uses AVCaptureSession with format selection and orientation handling.',
          },
          {
            term: 'Admin dashboard with Swift Charts',
            definition: 'An admin tab surfaces platform metrics using the Swift Charts framework.',
          },
          {
            term: 'Widgets, offline support, and SwiftData',
            definition: 'Home Screen and Lock Screen widgets display trending content and notification counts. SwiftData provides local caching for offline access to feed and bookmarks.',
          },
        ],
      },
      {
        type: 'section-divider',
        id: 'recent-fixes',
        title: 'Recent fixes',
        body: [
          'Resolved issues in recent updates.',
        ],
      },
      {
        type: 'definition-list',
        title: 'Bug fixes',
        items: [
          {
            term: 'Redis subscriber mode error',
            definition: 'Fixed Redis connections in subscriber mode failing due to INFO commands sent after subscribing. PresenceService now disables ready checks on duplicated pub/sub connections.',
          },
          {
            term: 'Database Date serialization',
            definition: 'Resolved postgres.js errors where JavaScript Date objects were passed directly to SQL queries. All timestamp comparisons now convert to ISO strings.',
          },
          {
            term: 'Setup certificates TypeScript error',
            definition: 'Fixed incorrect pathLen property name (should be pathLength) in the setup wizard certificates step.',
          },
        ],
      },
      {
        type: 'section-divider',
        id: 'infrastructure',
        title: 'Schema updates',
        body: [
          'Recent schema changes supporting new platform features.',
        ],
      },
      {
        type: 'table',
        title: 'Database schema updates',
        columns: ['Table', 'Change'],
        rows: [
          ['actor_repos', 'Added did_method column for multiple DID methods (plc, web, exprsn).'],
          ['actor_repos', 'Added certificate_id column for certificate integration.'],
          ['actor_repos', 'Added is_service boolean flag for service accounts.'],
          ['auth_config', 'Added exprsn_rate_limit_per_minute (default 90) and exprsn_burst_limit (default 35) for the did:exprsn rate limit tier.'],
        ],
      },
      {
        type: 'callout',
        title: 'Migration note',
        tone: 'info',
        body: [
          'After updating, run pnpm db:push to apply schema changes. The new rate limit columns have defaults and do not require manual data migration.',
        ],
      },
    ],
    sourcePaths: [
      '/Users/rickholland/Projects/Vues/packages/api/src/services/presence/PresenceService.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/services/feed/TrendingAlgorithm.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/services/feed/ForYouAlgorithm.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/auth/scope-middleware.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/services/oauth/OAuthAgent.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/db/schema.ts',
      '/Users/rickholland/Projects/Vues/packages/web/src/components/SignatureBadge.tsx',
      '/Users/rickholland/Projects/Vues/packages/web/src/components/VideoOverlay.tsx',
      '/Users/rickholland/Projects/Vues/packages/api/src/workers/index.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/services/social/HashtagService.ts',
      '/Users/rickholland/Projects/Vues/packages/setup/src/steps/certificates.ts',
    ],
  },
  {
    id: 'docs-identity',
    slug: 'identity',
    title: 'Identity',
    summary:
      'The did:exprsn identity system: certificate-backed verification, signed content, organization membership, feed boost, and tiered rate limits.',
    visibility: 'public',
    audience: 'all users',
    status: 'available',
    toc: [
      { id: 'did-overview', label: 'did:exprsn overview' },
      { id: 'certificate-backed-identity', label: 'Certificate-backed identity' },
      { id: 'identity-benefits', label: 'did:exprsn benefits' },
      { id: 'verified-badges', label: 'Verified badge system' },
      { id: 'signed-video-posts', label: 'Signed video posts' },
      { id: 'org-membership-proof', label: 'Organization membership proof' },
      { id: 'cert-lifecycle', label: 'Certificate lifecycle' },
    ],
    blocks: [
      {
        type: 'lead',
        body: [
          'Exprsn uses a custom DID method called did:exprsn that ties platform identity to certificate infrastructure. This enables cryptographic verification of user identity, content authorship, and organization membership.',
          'did:exprsn holders receive tangible platform benefits including higher feed ranking, signed content indicators, and increased API rate limits.',
        ],
      },
      {
        type: 'section-divider',
        id: 'did-overview',
        title: 'did:exprsn overview',
        body: [
          'The platform resolves three DID methods. Each serves a different role in the identity model.',
        ],
      },
      {
        type: 'table',
        title: 'DID method comparison',
        columns: ['Method', 'Where it lives', 'Primary use'],
        rows: [
          ['did:plc', 'AT Protocol PLC directory', 'Standard AT Protocol identity for accounts in the broader Bluesky/atproto ecosystem.'],
          ['did:web', 'Hosted at domain /.well-known', 'Domain-anchored identity for organizations and services controlling a web domain.'],
          ['did:exprsn', 'Platform CA + PLC directory', 'Platform-native identity backed by a client certificate from the Exprsn CA chain. Enables cryptographic verification and unlocks platform benefits.'],
        ],
      },
      {
        type: 'callout',
        title: 'did:exprsn is additive',
        tone: 'neutral',
        body: [
          'Users and organizations can hold both a did:plc and a did:exprsn simultaneously. The platform uses did:exprsn for certificate-backed operations and did:plc for AT Protocol federation.',
        ],
      },
      {
        type: 'section-divider',
        id: 'certificate-backed-identity',
        title: 'Certificate-backed identity',
        body: [
          'A did:exprsn identity is issued when the platform CA signs a client certificate for the requesting user or organization. The certificate subject encodes the DID, and the certificate chain traces back to the platform root CA.',
        ],
      },
      {
        type: 'steps',
        title: 'How a did:exprsn identity is created',
        items: [
          {
            title: 'Request identity',
            body: 'The user or organization requests a did:exprsn identity. The platform validates eligibility based on account standing and domain membership.',
          },
          {
            title: 'Generate key pair',
            body: 'A P-256 key pair is generated. The private key is held by the platform on behalf of the user.',
          },
          {
            title: 'Issue client certificate',
            body: 'The intermediate CA signs a client certificate with the DID in the subject common name and the public key from the generated pair.',
          },
          {
            title: 'Publish DID document',
            body: 'A DID document is published to the PLC directory, resolving the did:exprsn identifier to the certificate public key and platform service endpoints.',
          },
        ],
      },
      {
        type: 'section-divider',
        id: 'identity-benefits',
        title: 'did:exprsn benefits',
        body: [
          'Holding a did:exprsn identity unlocks three platform-level benefits that are applied automatically.',
        ],
      },
      {
        type: 'table',
        title: 'did:exprsn benefit summary',
        columns: ['Benefit', 'Details', 'Scope'],
        rows: [
          ['Feed ranking boost', 'A 15% (1.15x) scoring multiplier applied to content from did:exprsn authors in the For You algorithm, trending calculation, feed generator, and relevance-sorted search.', 'Does not affect chronological timelines (Following), challenge leaderboards, or user-specific feeds.'],
          ['Signed content indicator', 'Signed and verified videos display a green checkmark-shield badge on the video overlay. Clicking opens a detail panel with verification status, timestamp, signer identity, certificate fingerprint, and issuer.', 'Only appears on videos that are both signed and verified.'],
          ['Higher rate limits', '90 API requests/minute with a burst limit of 35, compared to 60/20 for standard users. The X-RateLimit-Tier header reports "exprsn" for these requests.', 'Applied automatically to all API requests from did:exprsn users.'],
        ],
      },
      {
        type: 'callout',
        title: 'Automatic activation',
        tone: 'success',
        body: [
          'All three benefits activate automatically once a did:exprsn identity is issued. No additional configuration or opt-in is required.',
        ],
      },
      {
        type: 'section-divider',
        id: 'verified-badges',
        title: 'Verified badge system',
        body: [
          'The verified badge on a user profile reflects the strength of their identity verification.',
        ],
      },
      {
        type: 'definition-list',
        title: 'Badge types',
        items: [
          {
            term: 'Cryptographic verification (did:exprsn)',
            definition: 'The user holds a valid did:exprsn client certificate from the platform CA. The badge is computed from certificate validity at render time. Shown as an accent-colored shield icon.',
          },
          {
            term: 'AT Protocol identity (did:plc)',
            definition: 'Standard AT Protocol identity shown as a blue globe icon. Indicates participation in the broader atproto ecosystem.',
          },
          {
            term: 'Organization-backed verification',
            definition: 'An organization issues a membership certificate through the organization CA path. The badge reflects active organizational membership with a valid certificate.',
          },
        ],
      },
      {
        type: 'section-divider',
        id: 'signed-video-posts',
        title: 'Signed video posts',
        body: [
          'Creators with a did:exprsn identity can cryptographically sign their video posts at publish time. The signature is a detached JWS over a canonical representation of the post payload.',
        ],
      },
      {
        type: 'checklist',
        title: 'What a signature proves',
        items: [
          'The post was published by the holder of the did:exprsn private key at the time of signing.',
          'The post content (title, description, video CID, publish timestamp) has not been modified since signing.',
          'The signing key was valid and not revoked at the time of publication.',
          'The creator held a platform-issued certificate tracing to the root CA.',
        ],
      },
      {
        type: 'definition-list',
        title: 'Signature UI',
        items: [
          {
            term: 'Signature badge',
            definition: 'A green checkmark-shield icon appears next to the identity badge on the video overlay for signed and verified videos.',
          },
          {
            term: 'Signature detail panel',
            definition: 'Clicking the signature badge opens a panel showing: verification status, signing timestamp, signer handle and DID, certificate fingerprint, and issuing CA.',
          },
          {
            term: 'API endpoint',
            definition: 'Signature details are fetched via GET /xrpc/io.exprsn.video.getSignatureInfo?uri={videoUri} and cached for 5 minutes.',
          },
        ],
      },
      {
        type: 'section-divider',
        id: 'org-membership-proof',
        title: 'Organization membership proof',
        body: [
          'Organization membership is attested by a certificate issued to the member through the organization CA path. This provides cryptographic proof that an organization admin approved the membership.',
        ],
      },
      {
        type: 'table',
        title: 'Membership certificate chain',
        columns: ['Layer', 'Issued by', 'Subject'],
        rows: [
          ['Root CA', 'Platform', 'Platform root'],
          ['Intermediate CA', 'Root CA', 'Platform intermediate'],
          ['Organization CA', 'Intermediate CA', 'Organization DID'],
          ['Member certificate', 'Organization CA', 'Member DID'],
        ],
      },
      {
        type: 'section-divider',
        id: 'cert-lifecycle',
        title: 'Certificate lifecycle',
        body: [
          'All certificates follow a lifecycle of issuance, active use, optional renewal, and revocation. CRL and OCSP infrastructure supports timely revocation checks.',
        ],
      },
      {
        type: 'definition-list',
        title: 'Lifecycle stages',
        items: [
          {
            term: 'Issuance',
            definition: 'Certificate is signed by the appropriate CA tier and stored with its serial number, subject, validity window, and encrypted private key.',
          },
          {
            term: 'Renewal',
            definition: 'Before expiry, a renewal request issues a new certificate with an extended validity window using the same or a fresh key pair.',
          },
          {
            term: 'Revocation',
            definition: 'Revoked certificates are recorded in the CRL and flagged in the database. The OCSP responder serves live revocation status.',
          },
          {
            term: 'Expiry',
            definition: 'Certificates past their notAfter timestamp are automatically invalid. Dependent features (verified badge, signing, feed boost, rate limit tier) stop working until renewal.',
          },
        ],
      },
      {
        type: 'link-grid',
        title: 'Related topics',
        links: [
          {
            href: '/docs/backend#ca',
            label: 'Backend CA',
            description: 'Review the CA service, certificate layers, and revocation infrastructure.',
          },
          {
            href: '/docs/creator-tools#content-signing',
            label: 'Content signing',
            description: 'Learn how creators sign posts and where signatures appear in the product.',
          },
          {
            href: '/docs/backend#rate-limits',
            label: 'Rate limits',
            description: 'See the full rate limit tier system and response headers.',
          },
        ],
      },
    ],
    sourcePaths: [
      '/Users/rickholland/Projects/Vues/packages/api/src/services/ca/CertificateManager.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/services/ca/OCSPResponder.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/services/ca/CRLService.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/services/did/exprsn.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/services/feed/TrendingAlgorithm.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/services/feed/ForYouAlgorithm.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/services/oauth/OAuthAgent.ts',
      '/Users/rickholland/Projects/Vues/packages/web/src/components/SignatureBadge.tsx',
      '/Users/rickholland/Projects/Vues/packages/web/src/components/IdentityBadge.tsx',
      '/Users/rickholland/Projects/Vues/packages/shared/src/config/index.ts',
    ],
  },
  {
    id: 'docs-messaging',
    slug: 'messaging',
    title: 'Messaging',
    summary:
      'Direct messages, group chats, real-time features, push notifications, and the persistent messaging drawer.',
    visibility: 'public',
    audience: 'all users',
    status: 'available',
    toc: [
      { id: 'direct-messages', label: 'Direct messages' },
      { id: 'messaging-drawer', label: 'Messaging drawer' },
      { id: 'real-time-features', label: 'Real-time features' },
      { id: 'notifications', label: 'Push and sound notifications' },
      { id: 'send-to-dm', label: 'Send to DM' },
      { id: 'group-chat', label: 'Group chat' },
    ],
    blocks: [
      {
        type: 'lead',
        body: [
          'Messaging on Exprsn supports one-to-one direct messages and group conversations. The messaging drawer persists across all pages, so conversations stay reachable without navigating away.',
          'All messaging runs over the Socket.IO chat namespace with presence tracking, typing indicators, and read receipts.',
        ],
      },
      {
        type: 'section-divider',
        id: 'direct-messages',
        title: 'Direct messages',
        body: [
          'Direct messages are private one-to-one conversations. Message history is stored server-side and synchronized to new devices on sign-in.',
        ],
      },
      {
        type: 'checklist',
        title: 'Direct message capabilities',
        items: [
          'Send text messages with inline @mention and #hashtag support.',
          'Share videos, links, and media inline in the conversation.',
          'React to individual messages with emoji reactions.',
          'Delete your own messages (replaced with a removal notice).',
          'Mute a conversation to suppress notifications without leaving it.',
          'Block a user to prevent future messages from that account.',
        ],
      },
      {
        type: 'section-divider',
        id: 'messaging-drawer',
        title: 'Messaging drawer',
        body: [
          'The messaging drawer is a persistent sliding panel on the right edge of the viewport, accessible from any page.',
        ],
      },
      {
        type: 'definition-list',
        title: 'Drawer behavior',
        items: [
          {
            term: 'Persistent state',
            definition: 'The drawer maintains its open/closed state across page navigation. An open conversation stays open as you browse.',
          },
          {
            term: 'Conversation list',
            definition: 'The collapsed drawer shows recent conversations with unread count badges. Tapping a conversation expands the message thread.',
          },
          {
            term: 'Unread count',
            definition: 'A global unread badge on the drawer toggle reflects total unread count across all conversations, updated in real time.',
          },
          {
            term: 'Keyboard shortcut',
            definition: 'Toggle the drawer with a keyboard shortcut from any page.',
          },
        ],
      },
      {
        type: 'section-divider',
        id: 'real-time-features',
        title: 'Real-time features',
        body: [
          'All real-time features run over the Socket.IO chat namespace. Presence, typing, and read state update continuously while connected.',
        ],
      },
      {
        type: 'table',
        title: 'Real-time features',
        columns: ['Feature', 'Behavior'],
        rows: [
          ['Typing indicators', 'Shows when the other participant is composing. Debounced to avoid excessive events.'],
          ['Presence', 'Online, away, and offline status for conversation participants via the PresenceService pub/sub layer.'],
          ['Read receipts', 'Messages are marked read when the conversation is visible and focused. Senders see delivered then read status.'],
          ['Delivery status', 'Messages show sending, delivered, and failed states. Failed messages can be retried inline.'],
        ],
      },
      {
        type: 'section-divider',
        id: 'notifications',
        title: 'Push and sound notifications',
        body: [
          'Incoming messages trigger notifications through multiple channels based on user preference and app state.',
        ],
      },
      {
        type: 'definition-list',
        title: 'Notification channels',
        items: [
          {
            term: 'In-app toast',
            definition: 'A non-blocking toast appears when a message arrives and the user is active but not viewing that conversation.',
          },
          {
            term: 'Web push notification',
            definition: 'When the app is backgrounded or closed, the Service Worker delivers a browser push notification. Tapping opens the conversation.',
          },
          {
            term: 'Sound alert',
            definition: 'An optional message sound plays on new messages. Configurable in notification preferences.',
          },
        ],
      },
      {
        type: 'section-divider',
        id: 'send-to-dm',
        title: 'Send to DM',
        body: [
          'Videos, profiles, and other content can be shared directly to a DM conversation from multiple entry points.',
        ],
      },
      {
        type: 'checklist',
        title: 'Send to DM entry points',
        items: [
          'Video card action menu on For You and Following feeds.',
          'Share modal from the video player.',
          'Profile page share button.',
          'Long-press context menu on mobile.',
        ],
      },
      {
        type: 'section-divider',
        id: 'group-chat',
        title: 'Group chat',
        body: [
          'Group conversations support multiple participants, group-level roles, and all the same real-time features as direct messages.',
        ],
      },
      {
        type: 'steps',
        title: 'Creating a group chat',
        items: [
          {
            title: 'Open new conversation',
            body: 'Tap the compose button in the messaging drawer or sidebar.',
          },
          {
            title: 'Add participants',
            body: 'Search by handle or name. Select two or more participants to create a group.',
          },
          {
            title: 'Name the group',
            body: 'Optionally set a group name and avatar. Groups without a custom name display the participant list.',
          },
          {
            title: 'Manage members and roles',
            body: 'Group owners can add/remove members and assign admin roles. Admins can manage members but cannot remove the owner.',
          },
        ],
      },
      {
        type: 'link-grid',
        title: 'Related topics',
        links: [
          {
            href: '/docs/user-experience#settings',
            label: 'Notification settings',
            description: 'Configure message notification preferences and sound alerts.',
          },
          {
            href: '/docs/backend#push-infra',
            label: 'Push infrastructure',
            description: 'Review VAPID key setup and Service Worker delivery pipeline.',
          },
        ],
      },
    ],
    sourcePaths: [
      '/Users/rickholland/Projects/Vues/packages/api/src/websocket/chat.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/routes/chat.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/services/presence/PresenceService.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/services/notifications/push.ts',
    ],
  },
  {
    id: 'docs-creator-tools',
    slug: 'creator-tools',
    title: 'Creator Tools',
    summary:
      'Upload and publish videos, review performance analytics, sign content with your did:exprsn identity, and grow your audience with hashtags and @mentions.',
    visibility: 'public',
    audience: 'creators',
    status: 'available',
    toc: [
      { id: 'upload-pipeline', label: 'Video upload pipeline' },
      { id: 'analytics-dashboard', label: 'Analytics dashboard' },
      { id: 'content-signing', label: 'Content signing' },
      { id: 'hashtag-system', label: 'Hashtag system' },
      { id: 'mentions', label: '@mentions' },
    ],
    blocks: [
      {
        type: 'lead',
        body: [
          'Creator tools cover the full publish cycle from recording or importing a video through to performance analytics. Every tool works within the AT Protocol identity model so your content and reputation are portable.',
        ],
      },
      {
        type: 'section-divider',
        id: 'upload-pipeline',
        title: 'Video upload pipeline',
        body: [
          'Videos can be recorded with the in-app camera or imported from your device. After upload, the platform transcodes the source into an adaptive HLS stream with multiple quality levels and generates thumbnails.',
        ],
      },
      {
        type: 'steps',
        title: 'Upload to publish',
        items: [
          {
            title: 'Record or import',
            body: 'Use the Upload page to select a file or record directly. Supported formats: MP4, MOV, and WebM up to the configured size limit.',
          },
          {
            title: 'Add details',
            body: 'Set a caption with @mention and #hashtag autocomplete. Add tags, choose a thumbnail (or let the system generate one), and set privacy options.',
          },
          {
            title: 'Transcode',
            body: 'The upload is queued for transcoding. The worker produces an adaptive HLS manifest with quality-specific segments stored in object storage.',
          },
          {
            title: 'Review and publish',
            body: 'Preview the transcoded video, confirm details, and publish. This creates the AT Protocol record and makes the video visible.',
          },
          {
            title: 'Sign (optional)',
            body: 'If you have a did:exprsn identity, sign the post before publishing. This adds a cryptographic authorship attestation and displays the signature badge on the video card.',
          },
        ],
      },
      {
        type: 'callout',
        title: 'Transcoding progress',
        tone: 'info',
        body: [
          'Transcode time depends on video length, resolution, and render worker queue depth. The upload page shows real-time progress via the render progress WebSocket.',
        ],
      },
      {
        type: 'section-divider',
        id: 'analytics-dashboard',
        title: 'Analytics dashboard',
        body: [
          'The creator analytics dashboard is accessible from the sidebar under Analytics. It displays performance data across four tabs with CSS-based charts.',
        ],
      },
      {
        type: 'table',
        title: 'Analytics tabs',
        columns: ['Tab', 'Metrics'],
        rows: [
          ['Views', 'Total views, unique viewers, view duration, and view-through rate over time.'],
          ['Engagement', 'Likes, comments, shares, bookmarks, and engagement rate by video.'],
          ['Audience', 'Follower growth, audience geography, device type, and traffic source breakdown.'],
          ['Video Performance', 'Sortable per-video table with views, watch time, engagement rate, and completion rate.'],
        ],
      },
      {
        type: 'checklist',
        title: 'Analytics features',
        items: [
          'Date range selector: last 7 days, 30 days, 90 days, and custom ranges.',
          'Sortable Video Performance table with ascending/descending column sorting.',
          'Chart tooltips showing exact values on hover.',
          'CSV export from the Video Performance tab.',
        ],
      },
      {
        type: 'section-divider',
        id: 'content-signing',
        title: 'Content signing',
        body: [
          'Creators with a did:exprsn identity can cryptographically sign video posts before publishing. Signatures provide tamper-proof authorship attestation backed by the platform CA.',
        ],
      },
      {
        type: 'definition-list',
        title: 'Signing details',
        items: [
          {
            term: 'What is signed',
            definition: 'The caption, video content CID, thumbnail CID, and publish timestamp are included in the canonical payload signed as a detached JWS.',
          },
          {
            term: 'Signature badge',
            definition: 'Signed and verified videos display a green checkmark-shield icon next to the identity badge on the video overlay. The badge only appears when both signed and verified.',
          },
          {
            term: 'Signature detail panel',
            definition: 'Clicking the badge opens a panel showing verification status, signing timestamp, signer handle and DID, certificate fingerprint, and issuing CA.',
          },
          {
            term: 'Verification',
            definition: 'Any relying party with access to the creator DID document can independently verify the signature. The API endpoint GET /xrpc/io.exprsn.video.getSignatureInfo returns full verification details.',
          },
        ],
      },
      {
        type: 'callout',
        title: 'did:exprsn required',
        tone: 'neutral',
        body: [
          'Content signing requires a did:exprsn identity. Visit the Identity section of your settings to request one if your account is eligible. Signed content also benefits from the 15% feed ranking boost.',
        ],
      },
      {
        type: 'section-divider',
        id: 'hashtag-system',
        title: 'Hashtag system',
        body: [
          'Hashtags connect your content to topic feeds and help new viewers discover your videos. The platform tracks hashtag velocity and shows trending direction indicators.',
        ],
      },
      {
        type: 'definition-list',
        title: 'Hashtag features',
        items: [
          {
            term: 'Follow a hashtag',
            definition: 'Following a hashtag adds tagged posts to your Following feed. Follow/unfollow buttons appear on tag pages and inline tag chips.',
          },
          {
            term: 'Trending direction',
            definition: 'The trending list shows rising, stable, or falling indicators calculated from recent post velocity vs. the prior window.',
          },
          {
            term: 'Autocomplete',
            definition: 'Typing # in a caption or comment triggers inline autocomplete showing matching hashtags by recent volume.',
          },
          {
            term: 'Tag page',
            definition: 'Each hashtag has a dedicated page showing recent posts, total count, and a follow button.',
          },
        ],
      },
      {
        type: 'section-divider',
        id: 'mentions',
        title: '@mentions',
        body: [
          'Mentioning another user in a caption or comment notifies them and creates a profile link. The MentionInput component provides keyboard-navigable autocomplete.',
        ],
      },
      {
        type: 'checklist',
        title: 'How mentions work',
        items: [
          'Type @ in a caption or comment field to trigger autocomplete.',
          'Results search live by handle prefix with arrow key and Enter navigation.',
          'Selected mentions render as clickable profile links in published content.',
          'Mentioned users receive in-app, optional push, and optional email notifications.',
        ],
      },
      {
        type: 'link-grid',
        title: 'Related topics',
        links: [
          {
            href: '/docs/identity',
            label: 'Identity',
            description: 'Request a did:exprsn identity to enable content signing, verified badges, and platform benefits.',
          },
          {
            href: '/docs/user-experience#settings',
            label: 'Settings',
            description: 'Configure notification preferences for mentions and followers.',
          },
          {
            href: '/docs/identity#identity-benefits',
            label: 'did:exprsn benefits',
            description: 'See all benefits of the did:exprsn identity including feed boost and rate limits.',
          },
        ],
      },
    ],
    sourcePaths: [
      '/Users/rickholland/Projects/Vues/packages/web/src/app/upload',
      '/Users/rickholland/Projects/Vues/packages/api/src/services/upload.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/services/studio/PublishingService.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/routes/analytics.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/services/social/HashtagService.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/services/social/MentionService.ts',
      '/Users/rickholland/Projects/Vues/packages/web/src/components/SignatureBadge.tsx',
    ],
  },
]);

export function getDocsSections(): DocsSection[] {
  return docsSections;
}

export function getDocsSectionBySlug(slug: string): DocsSection | undefined {
  return docsSections.find((section) => section.slug === slug);
}

export function canViewDocsSection(
  section: DocsSection,
  authState: DocsAuthState,
  adminState: DocsAdminState
): boolean {
  if (section.visibility === 'public') {
    return true;
  }

  return authState.isAuthenticated && adminState.isAdmin;
}

function validateSections(sections: DocsSection[]): DocsSection[] {
  const ids = new Set<string>();
  const slugs = new Set<string>();

  for (const section of sections) {
    if (ids.has(section.id)) {
      throw new Error(`Duplicate docs section id: ${section.id}`);
    }
    if (slugs.has(section.slug)) {
      throw new Error(`Duplicate docs section slug: ${section.slug}`);
    }
    ids.add(section.id);
    slugs.add(section.slug);

    const blockAnchorIds = new Set(
      section.blocks.map((block) => block.id).filter((value): value is string => Boolean(value))
    );

    for (const tocItem of section.toc) {
      if (!blockAnchorIds.has(tocItem.id)) {
        throw new Error(
          `Docs TOC item "${tocItem.id}" in section "${section.slug}" does not match a block id`
        );
      }
    }
  }

  return sections;
}
