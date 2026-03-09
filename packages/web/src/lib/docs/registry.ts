import type { DocsAdminState, DocsAuthState, DocsSection } from './types';

const docsSections: DocsSection[] = validateSections([
  {
    id: 'docs-setup',
    slug: 'setup',
    title: 'Setup',
    summary:
      'Install the local services, configure environment variables, and complete the first-run wizard before opening the platform to users.',
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
          'Current setup relies on the monorepo workspace, local service containers, and the first-run setup wizard mounted at /first-run by the API server.',
          'For MVP, use the setup flow to validate prerequisites, initialize certificates, create the first admin user, enable services, and finalize the installation.',
        ],
      },
      {
        type: 'section-divider',
        id: 'prerequisites',
        title: 'Prerequisites',
        body: [
          'The repo expects Node.js 20+, pnpm, and access to PostgreSQL and Redis. Local development also uses MinIO, OpenSearch, and MailHog through Docker Compose.',
        ],
      },
      {
        type: 'checklist',
        title: 'Before you start',
        items: [
          'Install Node.js 20 or newer and pnpm 9.',
          'Start local infrastructure with the repository Docker Compose file when you need PostgreSQL, Redis, OpenSearch, MinIO, and MailHog.',
          'Create a local .env file from the project example and update any required values before starting the API.',
          'Generate OAuth client credentials if you want to test the browser OAuth flow instead of local account sign-in.',
        ],
      },
      {
        type: 'section-divider',
        id: 'environment',
        title: 'Environment and services',
        body: [
          'The current source of truth is the root environment example plus Docker Compose. The setup flow depends on database access, host and app URLs, storage settings, and optional external providers.',
        ],
      },
      {
        type: 'table',
        title: 'Key environment groups',
        columns: ['Group', 'Current purpose'],
        rows: [
          ['Server', 'APP_URL, HOST, and PORT define the API and OAuth-facing base URLs.'],
          [
            'Data stores',
            'DATABASE_URL and REDIS_URL back the API, admin state, sessions, and queues.',
          ],
          [
            'Storage and media',
            'Blob storage, FFmpeg, and render worker settings control uploads and processed media.',
          ],
          [
            'OAuth and identity',
            'OAUTH_CLIENT_ID, OAUTH_PRIVATE_KEY, PDS settings, and Jetstream settings power login and AT Protocol features.',
          ],
          [
            'Optional providers',
            'AI and search settings enable moderation and search capabilities when configured.',
          ],
        ],
      },
      {
        type: 'definition-list',
        title: 'Docker Compose services',
        items: [
          {
            term: 'postgres',
            definition:
              'Primary relational database for app data, admin state, setup state, and platform configuration.',
          },
          {
            term: 'redis',
            definition:
              'Cache and queue backing service used by render workers, relay, and runtime coordination.',
          },
          {
            term: 'opensearch and dashboards',
            definition:
              'Search and analytics support services available for local development and operational review.',
          },
          {
            term: 'minio and createbuckets',
            definition:
              'Local S3-compatible object storage for uploads and processed media buckets.',
          },
          {
            term: 'render-worker and prefetch-worker',
            definition:
              'Background workers for media rendering and feed prefetch behavior. GPU rendering is optional through a separate profile.',
          },
        ],
      },
      {
        type: 'section-divider',
        id: 'first-run',
        title: 'First-run wizard',
        body: [
          'The first-run wizard is mounted at /first-run by the API server and is hidden after setup is completed.',
          'By current implementation, the wizard is localhost-only unless a temporary setup token is generated and passed in the query string or X-Setup-Token header.',
        ],
      },
      {
        type: 'steps',
        title: 'Wizard sequence',
        items: [
          {
            title: 'Run prerequisites',
            body: 'The setup API checks prerequisites and initializes setup state before allowing the flow to continue.',
          },
          {
            title: 'Initialize certificates',
            body: 'The wizard creates a root CA and an intermediate signing CA. Current defaults use long validity windows and expect a CA encryption key in production.',
          },
          {
            title: 'Create the first admin',
            body: 'The admin step creates the first super-admin account with handle and password validation.',
          },
          {
            title: 'Enable services',
            body: 'The wizard saves service enablement choices for federation, studio, render pipeline, messaging, analytics, and other platform features.',
          },
          {
            title: 'Finalize setup',
            body: 'Finalization marks setup complete and hides the endpoint from normal access.',
          },
        ],
      },
      {
        type: 'callout',
        title: 'Production note',
        tone: 'warning',
        body: [
          'Do not rely on the local CA encryption fallback or development-only defaults in production. Supply production keys, storage credentials, and network settings before exposing the server.',
        ],
      },
      {
        type: 'section-divider',
        id: 'deployment-notes',
        title: 'Deployment notes',
        body: [
          'The repository already includes Kubernetes manifests for the API, web app, PostgreSQL, Redis, and workers. MVP documentation should reference those manifests as deployment starting points, not as a full operations manual.',
        ],
      },
      {
        type: 'link-grid',
        title: 'Related platform entry points',
        links: [
          {
            href: '/docs/backend#ca',
            label: 'Certificate Authority',
            description: 'Review how the root, intermediate, and entity certificates are managed.',
          },
          {
            href: '/docs/administration',
            label: 'Administration',
            description: 'Move from installation into ongoing domain and platform administration.',
          },
        ],
      },
    ],
    sourcePaths: [
      '/Users/rickholland/Projects/Vues/.env.example',
      '/Users/rickholland/Projects/Vues/docker-compose.yml',
      '/Users/rickholland/Projects/Vues/packages/setup/src/api/routes.ts',
      '/Users/rickholland/Projects/Vues/packages/setup/src/middleware.ts',
      '/Users/rickholland/Projects/Vues/packages/setup/src/steps/certificates.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/index.ts',
    ],
  },
  {
    id: 'docs-administration',
    slug: 'administration',
    title: 'Administration',
    summary:
      'Use the admin interface to manage global platform settings, domain-scoped services, certificates, identities, SSO, and audit trails.',
    visibility: 'admin',
    audience: 'platform admins',
    status: 'available',
    toc: [
      { id: 'admin-scope', label: 'Global and domain scope' },
      { id: 'domains', label: 'Domains and access' },
      { id: 'identity-services', label: 'Identity and services' },
      { id: 'moderation-ops', label: 'Moderation and audit' },
    ],
    blocks: [
      {
        type: 'lead',
        body: [
          'The current admin UI supports both global platform administration and domain-scoped management. Domain selection is persisted in browser storage and drives the route set under /admin/d/[domainId].',
          'This section is restricted because it documents active operational controls rather than general product usage.',
        ],
      },
      {
        type: 'section-divider',
        id: 'admin-scope',
        title: 'Global and domain scope',
        body: [
          'The admin layout exposes grouped navigation for users and access, content and moderation, platform services, infrastructure, and system operations. Domain-scoped routes mirror the global structure with domain-specific context.',
        ],
      },
      {
        type: 'definition-list',
        title: 'Administrative scopes',
        items: [
          {
            term: 'Global admin',
            definition:
              'Uses routes such as /admin/users, /admin/content, /admin/settings, and infrastructure-level pages for platform-wide operations.',
          },
          {
            term: 'Domain admin',
            definition:
              'Uses /admin/d/[domainId]/... routes to manage a single domain, including users, groups, organizations, services, SSO, and certificates.',
          },
          {
            term: 'Admin session',
            definition:
              'Determined by the existing admin session flow already used by the admin dashboard. Permissions come from the admin role and permission model.',
          },
        ],
      },
      {
        type: 'section-divider',
        id: 'domains',
        title: 'Domains and access',
        body: [
          'Current schema and UI support domains, domain users, groups, activity logs, reserved handles, and owner relationships to users or organizations.',
        ],
      },
      {
        type: 'table',
        title: 'Domain management areas',
        columns: ['Area', 'Current behavior'],
        rows: [
          [
            'Domain settings',
            'Expose overview, services, identity, SSO, certificates, branding, and federation pages.',
          ],
          [
            'User and group access',
            'Track domain users, roles, permissions, groups, and group membership.',
          ],
          [
            'Handle and identity management',
            'Support handle reservations plus domain-specific identity creation and PLC-related settings.',
          ],
          [
            'Service assignment',
            'Domain services and render cluster relationships are present in the schema and admin flows.',
          ],
        ],
      },
      {
        type: 'callout',
        title: 'In progress for MVP',
        tone: 'info',
        body: [
          'Some domain administration screens are functional but still evolving toward MVP completeness. Document the current UI and label partially implemented flows instead of presenting them as finished automation.',
        ],
      },
      {
        type: 'section-divider',
        id: 'identity-services',
        title: 'Identity and services',
        body: [
          'Domain settings currently include PLC identity controls, certificates, SSO provider configuration, and service/feature toggles.',
        ],
      },
      {
        type: 'checklist',
        title: 'Common domain setup tasks',
        items: [
          'Verify the domain and confirm handle suffix rules before inviting members.',
          'Review PLC configuration, reserve handles, and create domain identities only when the naming policy is settled.',
          'Issue or revoke certificates through the domain certificates UI as needed for services and integrations.',
          'Configure SSO providers and token policies only after access-control requirements are defined.',
        ],
      },
      {
        type: 'section-divider',
        id: 'moderation-ops',
        title: 'Moderation and audit',
        body: [
          'Domain and platform admins both have access to moderation queues, appeals, reports, activity feeds, and audit logs. These controls should be treated as operational records, not end-user messaging.',
        ],
      },
      {
        type: 'link-grid',
        title: 'Related admin topics',
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
        ],
      },
    ],
    sourcePaths: [
      '/Users/rickholland/Projects/Vues/packages/web/src/app/admin/layout.tsx',
      '/Users/rickholland/Projects/Vues/packages/web/src/app/admin/d/[domainId]/settings/page.tsx',
      '/Users/rickholland/Projects/Vues/packages/web/src/app/admin/d/[domainId]/settings/identity/page.tsx',
      '/Users/rickholland/Projects/Vues/packages/web/src/app/admin/d/[domainId]/settings/certificates/page.tsx',
      '/Users/rickholland/Projects/Vues/packages/web/src/app/admin/d/[domainId]/settings/tokens/page.tsx',
      '/Users/rickholland/Projects/Vues/packages/api/drizzle/0021_domains_management.sql',
      '/Users/rickholland/Projects/Vues/packages/api/drizzle/0022_domains_plc_config.sql',
      '/Users/rickholland/Projects/Vues/packages/api/drizzle/0026_domain_clusters_services.sql',
      '/Users/rickholland/Projects/Vues/packages/api/drizzle/0028_sso_infrastructure.sql',
    ],
  },
  {
    id: 'docs-user-experience',
    slug: 'user-experience',
    title: 'User Experience',
    summary:
      'Understand the current sign-in options, navigation model, profile context switching, and settings available to members and creators.',
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
          'The current web app supports local Exprsn accounts and AT Protocol sign-in. After authentication, users navigate the platform from the shared sidebar and mobile navigation shell.',
          'Settings and account context are part of the main product experience and should be documented as current controls, not generic preferences.',
        ],
      },
      {
        type: 'section-divider',
        id: 'sign-in',
        title: 'Sign-in and sessions',
        body: [
          'The login screen offers two modes: local Exprsn sign-in and AT Protocol sign-in. Local sessions use access and refresh token pairs stored for the browser session flow.',
        ],
      },
      {
        type: 'steps',
        title: 'Current sign-in paths',
        items: [
          {
            title: 'Local account sign-in',
            body: 'Users enter a handle or email address plus password. Local account creation validates handle format, email format, and minimum password length.',
          },
          {
            title: 'AT Protocol sign-in',
            body: 'Users start OAuth-based sign-in with their handle. Browser OAuth configuration is driven by the current client metadata and callback route.',
          },
          {
            title: 'Session recovery',
            body: 'On app load, the web client restores local sessions first and falls back to OAuth session lookup when available.',
          },
        ],
      },
      {
        type: 'section-divider',
        id: 'navigation',
        title: 'Navigation',
        body: [
          'The sidebar currently anchors the core experience around For You, Following, Discover, Upload, Notifications, Messages, Bookmarks, and account actions.',
        ],
      },
      {
        type: 'definition-list',
        title: 'Core navigation areas',
        items: [
          {
            term: 'Feed and discovery',
            definition:
              'For You, Following, Discover, sounds, hashtags, and challenge pages drive browsing and exploration.',
          },
          {
            term: 'Creation',
            definition: 'Upload and editor pages support publishing and media workflows.',
          },
          {
            term: 'Communication',
            definition:
              'Notifications, direct messages, live chat, and watch party features appear throughout the current product surface.',
          },
          {
            term: 'Saved content',
            definition: 'Bookmarks and lists allow users to retain and organize content.',
          },
        ],
      },
      {
        type: 'section-divider',
        id: 'profile-context',
        title: 'Profile and organization context',
        body: [
          'The account dropdown lets users switch between a personal account view and organization contexts. Admin users also see a dashboard shortcut there.',
        ],
      },
      {
        type: 'checklist',
        title: 'What the account menu currently does',
        items: [
          'Switch between personal and organization contexts.',
          'Open organization management from settings.',
          'Open the admin dashboard when the current user has an admin session.',
          'Open profile, settings, and documentation links.',
          'Sign out of the current session.',
        ],
      },
      {
        type: 'section-divider',
        id: 'settings',
        title: 'Settings',
        body: [
          'The settings page groups controls into appearance, playback, privacy, notifications, accessibility, content, editor presets, organizations, security, access tokens, blocked and muted, and account management.',
        ],
      },
      {
        type: 'table',
        title: 'Current settings categories',
        columns: ['Category', 'Current controls'],
        rows: [
          ['Appearance', 'Theme, color mode, and layout behavior.'],
          ['Playback', 'Autoplay, default quality, mute, looping, and data saver preferences.'],
          [
            'Privacy',
            'Private account behavior, activity visibility, duets, stitches, comments, and messaging controls.',
          ],
          [
            'Notifications',
            'Likes, comments, follows, mentions, messages, and email digest frequency.',
          ],
          [
            'Accessibility',
            'Reduced motion, high contrast, large text, and screen-reader optimization.',
          ],
          [
            'Content and editor',
            'Language, warnings, sensitive-content display, and editor preset preferences.',
          ],
          [
            'Security and tokens',
            'Session activity plus user token management. Personal token workflows are still in progress for MVP in the current UI.',
          ],
        ],
      },
      {
        type: 'callout',
        title: 'In progress for MVP',
        tone: 'info',
        body: [
          'Some user token interfaces currently use placeholder or mock data. The documentation should explain the intended behavior while clearly labeling those screens as in progress for MVP.',
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
      'Track reports, sanctions, and appeals from the user side, and understand how current moderation queues and policies connect to the admin surface.',
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
          'The public moderation experience focuses on report submission, report status tracking, account standing, and appeals. Domain and platform moderation tools exist separately in admin views.',
        ],
      },
      {
        type: 'section-divider',
        id: 'reporting',
        title: 'Reporting and statuses',
        body: [
          'Users can report content and review the status of submitted reports from the moderation page. Current statuses include pending, reviewed, actioned, and dismissed.',
        ],
      },
      {
        type: 'definition-list',
        title: 'Current report statuses',
        items: [
          {
            term: 'Pending review',
            definition: 'The report has been submitted and is waiting for moderation review.',
          },
          {
            term: 'Reviewed',
            definition:
              'A moderator has reviewed the report but has not recorded an enforcement outcome for the reporting user to see.',
          },
          {
            term: 'Action taken',
            definition: 'A moderation action was applied or recorded for the reported content.',
          },
          {
            term: 'Dismissed',
            definition: 'The report was closed without an enforcement action.',
          },
        ],
      },
      {
        type: 'section-divider',
        id: 'account-status',
        title: 'Account status and sanctions',
        body: [
          'The user-facing moderation API returns an account standing plus active and recent sanctions. Current standings are effectively good, warning, or restricted depending on active sanctions.',
        ],
      },
      {
        type: 'table',
        title: 'What users can review today',
        columns: ['Area', 'Current behavior'],
        rows: [
          [
            'Active sanctions',
            'Show current restrictions, reasons, expiry, and whether an appeal can be submitted.',
          ],
          ['Sanction history', 'Shows recent expired sanctions for reference.'],
          [
            'Appeal state',
            'Each sanction tracks whether an appeal is pending, denied, or otherwise unavailable.',
          ],
        ],
      },
      {
        type: 'section-divider',
        id: 'appeals',
        title: 'Appeals',
        body: [
          'Appeals are tied to user sanctions in the current schema. The user-facing API requires a sanction identifier and a reason with a minimum length before creating a pending appeal.',
        ],
      },
      {
        type: 'steps',
        title: 'Current appeal flow',
        items: [
          {
            title: 'Open account status',
            body: 'Users review active sanctions and confirm whether the item can still be appealed.',
          },
          {
            title: 'Submit the appeal',
            body: 'The appeal stores the sanction reference, reason, optional additional information, and a pending review state.',
          },
          {
            title: 'Wait for moderation review',
            body: 'Once submitted, the sanction and appeal records reflect that an appeal is pending.',
          },
        ],
      },
      {
        type: 'section-divider',
        id: 'ops-overview',
        title: 'Moderator operations overview',
        body: [
          'The admin side currently includes domain moderation queues, banned words, banned tags, global moderation tools, video moderation queues, trusted-user policies, and appeal handling.',
        ],
      },
      {
        type: 'callout',
        title: 'Admin detail lives elsewhere',
        tone: 'neutral',
        body: [
          'Operational queue handling, domain moderation policies, and backend moderation internals should be reviewed from the Administration and Backend Documentation sections by eligible admins.',
        ],
      },
      {
        type: 'link-grid',
        title: 'Continue reading',
        links: [
          {
            href: '/docs/administration',
            label: 'Administration',
            description: 'Review domain moderation pages, reports, appeals, and audit tooling.',
          },
          {
            href: '/docs/backend#auth',
            label: 'Backend Auth',
            description:
              'Review the permission and token model used by moderation endpoints and admin access.',
          },
        ],
      },
    ],
    sourcePaths: [
      '/Users/rickholland/Projects/Vues/packages/web/src/app/moderation/page.tsx',
      '/Users/rickholland/Projects/Vues/packages/web/src/components/moderation/MyReportsTab.tsx',
      '/Users/rickholland/Projects/Vues/packages/api/src/routes/user-moderation.ts',
      '/Users/rickholland/Projects/Vues/packages/api/drizzle/0029_video_moderation_deletion.sql',
      '/Users/rickholland/Projects/Vues/packages/api/drizzle/0030_user_moderation_appeals.sql',
      '/Users/rickholland/Projects/Vues/packages/web/src/app/admin/d/[domainId]/moderation/page.tsx',
    ],
  },
  {
    id: 'docs-backend',
    slug: 'backend',
    title: 'Backend Documentation',
    summary:
      'Review the current certificate authority, authentication, and token behavior used by the API, admin services, and domain integrations.',
    visibility: 'admin',
    audience: 'operators and backend admins',
    status: 'available',
    toc: [
      { id: 'ca', label: 'CA' },
      { id: 'auth', label: 'Auth' },
      { id: 'tokens', label: 'Tokens' },
    ],
    blocks: [
      {
        type: 'lead',
        body: [
          'The backend currently combines local account authentication, AT Protocol and OAuth support, a certificate authority service, and multiple token types for user, service, and domain operations.',
          'These notes document current implementation behavior and highlight places where the UI surface is still catching up to the schema or service layer.',
        ],
      },
      {
        type: 'section-divider',
        id: 'ca',
        title: 'CA',
        body: [
          'The certificate service manages root, intermediate, and entity certificates. Private keys are encrypted at rest with the CA encryption key, and the admin settings model includes CRL and OCSP-related configuration.',
        ],
      },
      {
        type: 'table',
        title: 'Certificate layers',
        columns: ['Layer', 'Current purpose'],
        rows: [
          ['Root CA', 'Long-lived trust anchor created once and reused while active.'],
          [
            'Intermediate CA',
            'Primary signing tier for issuing entity certificates without exposing root usage everywhere.',
          ],
          [
            'Entity certificates',
            'Issued for client, server, and code-signing use cases tied to users or services.',
          ],
          [
            'Revocation data',
            'CRL records and related settings support revocation publishing and lifecycle management.',
          ],
        ],
      },
      {
        type: 'callout',
        title: 'Current implementation detail',
        tone: 'warning',
        body: [
          'The CA service has a development fallback encryption key. That fallback is acceptable only for local development and should be replaced in production before certificate issuance starts.',
        ],
      },
      {
        type: 'section-divider',
        id: 'auth',
        title: 'Auth',
        body: [
          'The API exposes local account creation and session creation plus OAuth flows. Local sign-in uses generated access and refresh token strings, while scope middleware expands OAuth-style scope hierarchies for authorization decisions.',
        ],
      },
      {
        type: 'definition-list',
        title: 'Current auth model',
        items: [
          {
            term: 'Local accounts',
            definition:
              'Stored with handle, email, password hash, and signing keys. Sessions currently issue exp_ access tokens and ref_ refresh tokens.',
          },
          {
            term: 'OAuth and AT Protocol',
            definition:
              'The API serves client metadata and supports browser OAuth flows with scope-aware middleware and token-type enablement checks.',
          },
          {
            term: 'Admin sessions',
            definition:
              'Admin sessions are separate from user sessions and are governed by auth configuration such as duration, MFA requirements, and concurrency limits.',
          },
          {
            term: 'Scope expansion',
            definition:
              'Parent scopes like read and write expand into more granular resource scopes during authorization checks.',
          },
        ],
      },
      {
        type: 'section-divider',
        id: 'tokens',
        title: 'Tokens',
        body: [
          'Current code distinguishes local access tokens, refresh tokens, OAuth tokens, API keys, and service tokens. Domain-level API tokens also expose scopes, status, usage, and optional rate limits through admin routes.',
        ],
      },
      {
        type: 'table',
        title: 'Token families',
        columns: ['Token type', 'Current notes'],
        rows: [
          [
            'Local user access token',
            'Generated with an exp_ prefix and used for local browser sessions.',
          ],
          ['Local refresh token', 'Generated with a ref_ prefix and used for session refresh.'],
          [
            'OAuth token',
            'Handled through OAuth tables and scope-aware logic; raw token values are not stored in the OAuth token tables.',
          ],
          [
            'Domain API token',
            'Managed from domain admin settings with scopes, revocation, refresh, and usage tracking.',
          ],
          [
            'Service token',
            'Recognized by token-type detection and enablement settings even when not fully surfaced in every UI path yet.',
          ],
        ],
      },
      {
        type: 'callout',
        title: 'In progress for MVP',
        tone: 'info',
        body: [
          'The user-facing token settings UI is still catching up to the broader token model in the backend. Document domain/admin token behavior as current, and mark the personal-token UX as in progress for MVP where appropriate.',
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
      '/Users/rickholland/Projects/Vues/packages/api/drizzle/0012_light_roland_deschain.sql',
      '/Users/rickholland/Projects/Vues/packages/api/drizzle/0028_sso_infrastructure.sql',
    ],
  },
  {
    id: 'docs-changelog',
    slug: 'changelog',
    title: 'Platform Updates',
    summary:
      'Recent fixes, improvements, and changes to the platform infrastructure and services.',
    visibility: 'public',
    audience: 'all users',
    status: 'available',
    toc: [
      { id: 'recent-fixes', label: 'Recent fixes' },
      { id: 'infrastructure', label: 'Infrastructure updates' },
    ],
    blocks: [
      {
        type: 'lead',
        body: [
          'This section tracks recent platform updates, bug fixes, and infrastructure improvements. Check here for details on resolved issues and new capabilities.',
        ],
      },
      {
        type: 'section-divider',
        id: 'recent-fixes',
        title: 'Recent fixes',
        body: [
          'The following issues have been resolved in recent updates.',
        ],
      },
      {
        type: 'definition-list',
        title: 'March 2026 fixes',
        items: [
          {
            term: 'Redis subscriber mode error',
            definition:
              'Fixed an error where Redis connections in subscriber mode would fail due to INFO commands being sent after subscribing. The PresenceService now disables ready checks on duplicated connections used for pub/sub.',
          },
          {
            term: 'Database Date serialization errors',
            definition:
              'Resolved postgres.js errors where JavaScript Date objects were passed directly to SQL queries. All timestamp comparisons and inserts now convert Date objects to ISO strings for proper serialization.',
          },
          {
            term: 'Setup certificates TypeScript error',
            definition:
              'Fixed a TypeScript error in the setup wizard certificates step where pathLen was incorrectly named instead of pathLength.',
          },
        ],
      },
      {
        type: 'section-divider',
        id: 'infrastructure',
        title: 'Infrastructure updates',
        body: [
          'Recent infrastructure and schema changes to support platform operations.',
        ],
      },
      {
        type: 'table',
        title: 'Database schema updates',
        columns: ['Table', 'Change'],
        rows: [
          ['actor_repos', 'Added did_method column to support multiple DID methods (plc, web, exprn).'],
          ['actor_repos', 'Added certificate_id column for certificate integration.'],
          ['actor_repos', 'Added is_service boolean flag for service accounts.'],
        ],
      },
      {
        type: 'callout',
        title: 'Migration note',
        tone: 'info',
        body: [
          'If you encounter "column does not exist" errors after updating, run pnpm db:push or apply the schema changes manually using ALTER TABLE statements.',
        ],
      },
    ],
    sourcePaths: [
      '/Users/rickholland/Projects/Vues/packages/api/src/services/presence/PresenceService.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/websocket/chat.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/websocket/admin.ts',
      '/Users/rickholland/Projects/Vues/packages/feed-generator/src/algorithms/challengeLeaderboard.ts',
      '/Users/rickholland/Projects/Vues/packages/setup/src/steps/certificates.ts',
      '/Users/rickholland/Projects/Vues/packages/api/src/db/schema.ts',
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
