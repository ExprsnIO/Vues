/**
 * SSO Routes - Mount point for all SSO-related routes
 */

import { Hono } from 'hono';
import oidcProviderRoutes from './oidc-provider.js';
import samlProviderRoutes from './saml-provider.js';
import externalLoginRoutes from './external-login.js';
import domainSsoRoutes from './domain-sso.js';
import authRoutes from './auth.js';

const app = new Hono();

// Unified auth routes (social login, OAuth provider, session management)
app.route('/auth', authRoutes);

// OIDC Provider endpoints
app.route('/', oidcProviderRoutes);

// SAML Provider endpoints
app.route('/', samlProviderRoutes);

// External Login (Social Login / Enterprise SSO)
app.route('/', externalLoginRoutes);

// Domain SSO Configuration
app.route('/', domainSsoRoutes);

export default app;
