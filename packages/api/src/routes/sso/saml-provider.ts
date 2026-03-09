/**
 * SAML Provider Routes - SAML 2.0 Identity Provider Endpoints
 *
 * Implements:
 * - GET /saml/metadata - IdP metadata XML
 * - GET /saml/sso - SSO endpoint (HTTP-Redirect binding)
 * - POST /saml/sso - SSO endpoint (HTTP-POST binding)
 * - GET /saml/slo - Single Logout endpoint (HTTP-Redirect)
 * - POST /saml/slo - Single Logout endpoint (HTTP-POST)
 */

import { Hono } from 'hono';
import { SAMLProviderService } from '../../services/sso/SAMLProviderService.js';
import { authMiddleware, optionalAuthMiddleware, adminAuthMiddleware, ADMIN_PERMISSIONS, requirePermission } from '../../auth/middleware.js';

const app = new Hono();

// ==========================================
// IdP Metadata
// ==========================================

/**
 * GET /saml/metadata
 * SAML IdP Metadata XML
 */
app.get('/saml/metadata', (c) => {
  const metadata = SAMLProviderService.generateIdPMetadata();
  c.header('Content-Type', 'application/xml');
  return c.body(metadata);
});

// ==========================================
// SSO Endpoints
// ==========================================

/**
 * GET /saml/sso
 * SSO endpoint with HTTP-Redirect binding
 * Handles AuthnRequest via query parameter
 */
app.get('/saml/sso', optionalAuthMiddleware, async (c) => {
  const samlRequest = c.req.query('SAMLRequest');
  const relayState = c.req.query('RelayState');

  if (!samlRequest) {
    return c.json({ error: 'Missing SAMLRequest parameter' }, 400);
  }

  // Parse the AuthnRequest
  const authnRequest = SAMLProviderService.parseAuthnRequest(samlRequest, true);
  if (!authnRequest) {
    return c.json({ error: 'Invalid SAMLRequest' }, 400);
  }

  // Get Service Provider
  const sp = await SAMLProviderService.getServiceProvider(authnRequest.issuer);
  if (!sp || sp.status !== 'active') {
    return c.json({ error: 'Unknown or inactive Service Provider' }, 400);
  }

  // Check if user is authenticated
  const userDid = c.get('did');

  if (!userDid) {
    // User needs to log in
    if (authnRequest.isPassive) {
      // Cannot prompt for login, return error
      const errorResponse = SAMLProviderService.createErrorResponse(
        sp,
        'urn:oasis:names:tc:SAML:2.0:status:NoPassive',
        'User is not authenticated and passive mode is requested',
        authnRequest.id
      );
      return redirectWithSAMLResponse(sp.acsUrl, errorResponse, relayState);
    }

    // Store SAML request info and redirect to login
    // In a real implementation, store this in session/cache
    const loginUrl = new URL('/login', c.req.url);
    loginUrl.searchParams.set('redirect', c.req.url);
    loginUrl.searchParams.set('saml', 'true');
    return c.redirect(loginUrl.toString());
  }

  // Check if ForceAuthn is required
  if (authnRequest.forceAuthn) {
    // Would need to re-authenticate user
    // For now, proceed with existing session
  }

  try {
    // Create SAML Response
    const { response, sessionIndex } = await SAMLProviderService.createSAMLResponse(
      userDid,
      sp,
      authnRequest.id,
      relayState || undefined
    );

    // Return POST form for HTTP-POST binding
    return c.html(buildAutoSubmitForm(sp.acsUrl, response, relayState));
  } catch (error) {
    console.error('[SAML SSO] Error creating response:', error);
    const errorResponse = SAMLProviderService.createErrorResponse(
      sp,
      'urn:oasis:names:tc:SAML:2.0:status:Responder',
      'An error occurred processing the request',
      authnRequest.id
    );
    return redirectWithSAMLResponse(sp.acsUrl, errorResponse, relayState);
  }
});

/**
 * POST /saml/sso
 * SSO endpoint with HTTP-POST binding
 */
app.post('/saml/sso', optionalAuthMiddleware, async (c) => {
  const body = await c.req.parseBody();
  const samlRequest = body.SAMLRequest as string;
  const relayState = body.RelayState as string | undefined;

  if (!samlRequest) {
    return c.json({ error: 'Missing SAMLRequest' }, 400);
  }

  // Parse the AuthnRequest (not deflated for POST binding)
  const authnRequest = SAMLProviderService.parseAuthnRequest(samlRequest, false);
  if (!authnRequest) {
    return c.json({ error: 'Invalid SAMLRequest' }, 400);
  }

  // Get Service Provider
  const sp = await SAMLProviderService.getServiceProvider(authnRequest.issuer);
  if (!sp || sp.status !== 'active') {
    return c.json({ error: 'Unknown or inactive Service Provider' }, 400);
  }

  // Check if user is authenticated
  const userDid = c.get('did');

  if (!userDid) {
    if (authnRequest.isPassive) {
      const errorResponse = SAMLProviderService.createErrorResponse(
        sp,
        'urn:oasis:names:tc:SAML:2.0:status:NoPassive',
        'User is not authenticated',
        authnRequest.id
      );
      return c.html(buildAutoSubmitForm(sp.acsUrl, errorResponse, relayState));
    }

    // Redirect to login
    const loginUrl = new URL('/login', c.req.url);
    loginUrl.searchParams.set('saml', 'true');
    return c.redirect(loginUrl.toString());
  }

  try {
    const { response } = await SAMLProviderService.createSAMLResponse(
      userDid,
      sp,
      authnRequest.id,
      relayState
    );

    return c.html(buildAutoSubmitForm(sp.acsUrl, response, relayState));
  } catch (error) {
    console.error('[SAML SSO] Error:', error);
    const errorResponse = SAMLProviderService.createErrorResponse(
      sp,
      'urn:oasis:names:tc:SAML:2.0:status:Responder',
      'An error occurred',
      authnRequest.id
    );
    return c.html(buildAutoSubmitForm(sp.acsUrl, errorResponse, relayState));
  }
});

// ==========================================
// SLO Endpoints
// ==========================================

/**
 * GET /saml/slo
 * Single Logout with HTTP-Redirect binding
 */
app.get('/saml/slo', async (c) => {
  const samlRequest = c.req.query('SAMLRequest');
  const relayState = c.req.query('RelayState');

  if (!samlRequest) {
    return c.json({ error: 'Missing SAMLRequest parameter' }, 400);
  }

  const logoutRequest = SAMLProviderService.parseLogoutRequest(samlRequest, true);
  if (!logoutRequest) {
    return c.json({ error: 'Invalid LogoutRequest' }, 400);
  }

  const sp = await SAMLProviderService.getServiceProvider(logoutRequest.issuer);
  if (!sp) {
    return c.json({ error: 'Unknown Service Provider' }, 400);
  }

  try {
    const { loggedOutSessions } = await SAMLProviderService.processLogout(
      logoutRequest.issuer,
      logoutRequest.nameId,
      logoutRequest.sessionIndex
    );

    const response = SAMLProviderService.createLogoutResponse(sp, logoutRequest.id, true);

    if (sp.sloUrl) {
      // Redirect back to SP with logout response
      const redirectUrl = new URL(sp.sloUrl);
      redirectUrl.searchParams.set('SAMLResponse', response);
      if (relayState) {
        redirectUrl.searchParams.set('RelayState', relayState);
      }
      return c.redirect(redirectUrl.toString());
    }

    return c.json({ success: true, loggedOutSessions });
  } catch (error) {
    console.error('[SAML SLO] Error:', error);
    const response = SAMLProviderService.createLogoutResponse(sp, logoutRequest.id, false);
    if (sp.sloUrl) {
      const redirectUrl = new URL(sp.sloUrl);
      redirectUrl.searchParams.set('SAMLResponse', response);
      return c.redirect(redirectUrl.toString());
    }
    return c.json({ error: 'Logout failed' }, 500);
  }
});

/**
 * POST /saml/slo
 * Single Logout with HTTP-POST binding
 */
app.post('/saml/slo', async (c) => {
  const body = await c.req.parseBody();
  const samlRequest = body.SAMLRequest as string;
  const relayState = body.RelayState as string | undefined;

  if (!samlRequest) {
    return c.json({ error: 'Missing SAMLRequest' }, 400);
  }

  const logoutRequest = SAMLProviderService.parseLogoutRequest(samlRequest, false);
  if (!logoutRequest) {
    return c.json({ error: 'Invalid LogoutRequest' }, 400);
  }

  const sp = await SAMLProviderService.getServiceProvider(logoutRequest.issuer);
  if (!sp) {
    return c.json({ error: 'Unknown Service Provider' }, 400);
  }

  try {
    await SAMLProviderService.processLogout(
      logoutRequest.issuer,
      logoutRequest.nameId,
      logoutRequest.sessionIndex
    );

    const response = SAMLProviderService.createLogoutResponse(sp, logoutRequest.id, true);

    if (sp.sloUrl) {
      return c.html(buildAutoSubmitForm(sp.sloUrl, response, relayState, true));
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('[SAML SLO] Error:', error);
    const response = SAMLProviderService.createLogoutResponse(sp, logoutRequest.id, false);
    if (sp.sloUrl) {
      return c.html(buildAutoSubmitForm(sp.sloUrl, response, relayState, true));
    }
    return c.json({ error: 'Logout failed' }, 500);
  }
});

// ==========================================
// SP Management (Admin only)
// ==========================================

/**
 * GET /saml/service-providers
 * List registered Service Providers
 */
app.get('/saml/service-providers', adminAuthMiddleware, requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW), async (c) => {
  const sps = await SAMLProviderService.listServiceProviders();
  return c.json({ serviceProviders: sps });
});

/**
 * POST /saml/service-providers
 * Register a new Service Provider
 */
app.post('/saml/service-providers', adminAuthMiddleware, requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT), async (c) => {
  const body = await c.req.json();

  const {
    entityId,
    name,
    description,
    acsUrl,
    acsBinding,
    sloUrl,
    sloBinding,
    nameIdFormat,
    spCertificate,
    attributeMapping,
    extraAttributes,
    signAssertions,
    signResponse,
  } = body;

  if (!entityId || !name || !acsUrl) {
    return c.json({ error: 'entityId, name, and acsUrl are required' }, 400);
  }

  // Check if entity ID already exists
  const existing = await SAMLProviderService.getServiceProvider(entityId);
  if (existing) {
    return c.json({ error: 'Service Provider with this entity ID already exists' }, 409);
  }

  const sp = await SAMLProviderService.registerServiceProvider({
    entityId,
    name,
    description,
    acsUrl,
    acsBinding: acsBinding || 'HTTP-POST',
    sloUrl,
    sloBinding,
    nameIdFormat: nameIdFormat || 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    spCertificate,
    attributeMapping,
    extraAttributes,
    signAssertions: signAssertions ?? true,
    signResponse: signResponse ?? true,
    status: 'active',
  });

  return c.json({ serviceProvider: sp }, 201);
});

/**
 * GET /saml/service-providers/:id
 * Get Service Provider by ID
 */
app.get('/saml/service-providers/:id', authMiddleware, async (c) => {
  const id = c.req.param('id')!;
  const sp = await SAMLProviderService.getServiceProviderById(id);

  if (!sp) {
    return c.json({ error: 'Service Provider not found' }, 404);
  }

  return c.json({ serviceProvider: sp });
});

/**
 * PUT /saml/service-providers/:id
 * Update Service Provider
 */
app.put('/saml/service-providers/:id', authMiddleware, async (c) => {
  const id = c.req.param('id')!;
  const body = await c.req.json();

  const sp = await SAMLProviderService.updateServiceProvider(id, body);

  if (!sp) {
    return c.json({ error: 'Service Provider not found' }, 404);
  }

  return c.json({ serviceProvider: sp });
});

/**
 * DELETE /saml/service-providers/:id
 * Delete Service Provider
 */
app.delete('/saml/service-providers/:id', authMiddleware, async (c) => {
  const id = c.req.param('id')!;
  const deleted = await SAMLProviderService.deleteServiceProvider(id);

  if (!deleted) {
    return c.json({ error: 'Service Provider not found' }, 404);
  }

  return c.json({ success: true });
});

// ==========================================
// User Sessions
// ==========================================

/**
 * GET /saml/sessions
 * Get current user's SAML sessions
 */
app.get('/saml/sessions', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const sessions = await SAMLProviderService.getUserSessions(userDid);
  return c.json({ sessions });
});

/**
 * DELETE /saml/sessions
 * Logout all SAML sessions for current user
 */
app.delete('/saml/sessions', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const count = await SAMLProviderService.logoutAllSessions(userDid);
  return c.json({ loggedOutSessions: count });
});

// ==========================================
// Helper Functions
// ==========================================

function buildAutoSubmitForm(
  actionUrl: string,
  samlResponse: string,
  relayState?: string,
  isLogoutResponse = false
): string {
  const responseField = isLogoutResponse ? 'SAMLResponse' : 'SAMLResponse';

  return `<!DOCTYPE html>
<html>
<head>
  <title>SAML Response</title>
</head>
<body onload="document.forms[0].submit()">
  <noscript>
    <p>Your browser has JavaScript disabled. Click the button below to continue.</p>
  </noscript>
  <form method="POST" action="${escapeHtml(actionUrl)}">
    <input type="hidden" name="${responseField}" value="${escapeHtml(samlResponse)}" />
    ${relayState ? `<input type="hidden" name="RelayState" value="${escapeHtml(relayState)}" />` : ''}
    <noscript>
      <button type="submit">Continue</button>
    </noscript>
  </form>
</body>
</html>`;
}

function redirectWithSAMLResponse(
  url: string,
  response: string,
  relayState?: string
): Response {
  const redirectUrl = new URL(url);
  redirectUrl.searchParams.set('SAMLResponse', response);
  if (relayState) {
    redirectUrl.searchParams.set('RelayState', relayState);
  }
  return Response.redirect(redirectUrl.toString(), 302);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default app;
