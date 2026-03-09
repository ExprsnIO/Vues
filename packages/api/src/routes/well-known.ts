import { Hono } from 'hono';
import { JWTService } from '../services/sso/JWTService.js';
import { CRLService } from '../services/ca/CRLService.js';
import { OCSPResponder } from '../services/ca/OCSPResponder.js';

/**
 * Well-known routes configuration
 */
export interface WellKnownConfig {
  serviceDid: string;
  domain: string;
  pdsEndpoint?: string;
  relayEndpoint?: string;
  appviewEndpoint?: string;
  oauthConfig?: {
    authorizationEndpoint: string;
    tokenEndpoint: string;
    jwksUri: string;
    scopes: string[];
  };
  exprnServices?: Array<{
    id: string;
    type: string;
    endpoint: string;
    status: 'active' | 'inactive';
  }>;
}

/**
 * Create well-known routes for AT Protocol and Exprsn federation
 */
export function createWellKnownRouter(config: WellKnownConfig) {
  const router = new Hono();

  /**
   * /.well-known/atproto-did
   * Return the service DID for this server
   */
  router.get('/atproto-did', (c) => {
    return c.text(config.serviceDid);
  });

  /**
   * /.well-known/did.json
   * Return the full DID document for this service
   */
  router.get('/did.json', (c) => {
    const services: Array<{
      id: string;
      type: string;
      serviceEndpoint: string;
    }> = [];

    if (config.pdsEndpoint) {
      services.push({
        id: `${config.serviceDid}#atproto_pds`,
        type: 'AtprotoPersonalDataServer',
        serviceEndpoint: config.pdsEndpoint,
      });
    }

    if (config.relayEndpoint) {
      services.push({
        id: `${config.serviceDid}#atproto_relay`,
        type: 'AtprotoRelay',
        serviceEndpoint: config.relayEndpoint,
      });
    }

    if (config.appviewEndpoint) {
      services.push({
        id: `${config.serviceDid}#atproto_appview`,
        type: 'AtprotoAppView',
        serviceEndpoint: config.appviewEndpoint,
      });
    }

    const didDocument = {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/multikey/v1',
        'https://w3id.org/security/suites/secp256k1-2019/v1',
      ],
      id: config.serviceDid,
      alsoKnownAs: [`at://${config.domain}`],
      service: services,
    };

    return c.json(didDocument);
  });

  /**
   * /.well-known/oauth-authorization-server
   * OAuth 2.0 Authorization Server Metadata (RFC 8414)
   */
  router.get('/oauth-authorization-server', (c) => {
    if (!config.oauthConfig) {
      return c.json({ error: 'OAuth not configured' }, 404);
    }

    const metadata = {
      issuer: `https://${config.domain}`,
      authorization_endpoint: config.oauthConfig.authorizationEndpoint,
      token_endpoint: config.oauthConfig.tokenEndpoint,
      jwks_uri: config.oauthConfig.jwksUri,
      scopes_supported: config.oauthConfig.scopes,
      response_types_supported: ['code'],
      response_modes_supported: ['query', 'fragment'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: [
        'private_key_jwt',
        'client_secret_basic',
      ],
      code_challenge_methods_supported: ['S256'],
      dpop_signing_alg_values_supported: ['ES256', 'ES384'],
      authorization_response_iss_parameter_supported: true,
      pushed_authorization_request_endpoint: `https://${config.domain}/oauth/par`,
      require_pushed_authorization_requests: false,
    };

    return c.json(metadata);
  });

  /**
   * /.well-known/openid-configuration
   * OpenID Connect Discovery Document (RFC 8414)
   * This is the standard OIDC discovery endpoint that external apps use
   */
  router.get('/openid-configuration', (c) => {
    const metadata = JWTService.getDiscoveryMetadata();
    return c.json(metadata);
  });

  /**
   * /.well-known/exprsn-services
   * Exprsn service registry for federation
   */
  router.get('/exprsn-services', (c) => {
    const services = config.exprnServices || [];

    const registry = {
      version: '1.0',
      domain: config.domain,
      did: config.serviceDid,
      services: services.map((s) => ({
        id: s.id,
        type: s.type,
        endpoint: s.endpoint,
        status: s.status,
      })),
      capabilities: [
        'federation',
        'sync',
        'relay',
        ...(config.pdsEndpoint ? ['pds'] : []),
        ...(config.relayEndpoint ? ['firehose'] : []),
      ],
      timestamp: new Date().toISOString(),
    };

    return c.json(registry);
  });

  /**
   * /.well-known/nodeinfo
   * NodeInfo for software discovery (compatible with other federated software)
   */
  router.get('/nodeinfo', (c) => {
    return c.json({
      links: [
        {
          rel: 'http://nodeinfo.diaspora.software/ns/schema/2.1',
          href: `https://${config.domain}/.well-known/nodeinfo/2.1`,
        },
      ],
    });
  });

  /**
   * /.well-known/nodeinfo/2.1
   * NodeInfo 2.1 schema
   */
  router.get('/nodeinfo/2.1', (c) => {
    return c.json({
      version: '2.1',
      software: {
        name: 'exprsn',
        version: '0.1.0',
        repository: 'https://github.com/exprsn/exprsn',
      },
      protocols: ['atproto'],
      usage: {
        users: {
          total: 0,
          activeMonth: 0,
          activeHalfyear: 0,
        },
        localPosts: 0,
      },
      openRegistrations: true,
      metadata: {
        nodeName: config.domain,
        nodeDescription: 'Exprsn - Decentralized Social Video Platform',
        features: ['video', 'federation', 'atproto'],
      },
    });
  });

  /**
   * /.well-known/webfinger
   * WebFinger for handle discovery
   */
  router.get('/webfinger', async (c) => {
    const resource = c.req.query('resource');

    if (!resource) {
      return c.json({ error: 'Missing resource parameter' }, 400);
    }

    // Parse acct:handle@domain or at:did
    let subject: string | null = null;
    let did: string | null = null;

    if (resource.startsWith('acct:')) {
      const [handle, domain] = resource.slice(5).split('@');
      if (domain === config.domain) {
        subject = resource;
        // Would look up DID from handle
      }
    } else if (resource.startsWith('at:')) {
      did = resource.slice(3);
      subject = resource;
    }

    if (!subject) {
      return c.json({ error: 'Resource not found' }, 404);
    }

    const response = {
      subject,
      links: [
        {
          rel: 'self',
          type: 'application/activity+json',
          href: `https://${config.domain}/users/${did || 'unknown'}`,
        },
        {
          rel: 'http://webfinger.net/rel/profile-page',
          type: 'text/html',
          href: `https://${config.domain}/@${did || 'unknown'}`,
        },
      ],
    };

    return c.json(response);
  });

  /**
   * /.well-known/crl.pem
   * Certificate Revocation List (PEM format)
   */
  router.get('/crl.pem', async (c) => {
    try {
      const crl = await CRLService.getCurrentCRL('pem');
      return new Response(crl as string, {
        headers: {
          'Content-Type': 'application/x-pem-file',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    } catch (error) {
      console.error('Failed to get CRL:', error);
      return c.json({ error: 'CRL not available' }, 500);
    }
  });

  /**
   * /.well-known/crl.der
   * Certificate Revocation List (DER format)
   */
  router.get('/crl.der', async (c) => {
    try {
      const crl = await CRLService.getCurrentCRL('der');
      return new Response(crl as Buffer, {
        headers: {
          'Content-Type': 'application/pkix-crl',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    } catch (error) {
      console.error('Failed to get CRL:', error);
      return c.json({ error: 'CRL not available' }, 500);
    }
  });

  /**
   * /.well-known/crl-delta.pem
   * Delta CRL (certificates revoked in last 24 hours)
   */
  router.get('/crl-delta.pem', async (c) => {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const result = await CRLService.getDeltaCRL(since);
      return new Response(result.crlPem, {
        headers: {
          'Content-Type': 'application/x-pem-file',
          'Cache-Control': 'public, max-age=3600',
          'X-Revoked-Count': result.revokedCount.toString(),
        },
      });
    } catch (error) {
      console.error('Failed to get delta CRL:', error);
      return c.json({ error: 'Delta CRL not available' }, 500);
    }
  });

  /**
   * /.well-known/ca/cdp.json
   * CRL Distribution Points information
   */
  router.get('/ca/cdp.json', (c) => {
    const baseUrl = `https://${config.domain}`;
    const cdp = CRLService.getCRLDistributionPoints(baseUrl);
    return c.json(cdp);
  });

  /**
   * /.well-known/ca/status.json
   * CA status information
   */
  router.get('/ca/status.json', async (c) => {
    try {
      const status = await CRLService.getStatus();
      return c.json({
        crl: {
          lastGenerated: status.lastGenerated?.toISOString() || null,
          nextUpdate: status.nextUpdate?.toISOString() || null,
          revokedCertificates: status.revokedCount,
          crlNumber: status.crlNumber,
        },
        ocsp: {
          enabled: true,
          endpoint: `https://${config.domain}/ocsp`,
        },
      });
    } catch (error) {
      return c.json({ error: 'Status not available' }, 500);
    }
  });

  return router;
}

/**
 * Create OCSP router (separate due to binary content)
 */
export function createOCSPRouter() {
  const router = new Hono();

  /**
   * POST /ocsp
   * OCSP responder - binary request/response
   */
  router.post('/', async (c) => {
    try {
      const body = await c.req.arrayBuffer();
      const request = OCSPResponder.parseOCSPRequest(Buffer.from(body));
      const response = await OCSPResponder.buildSignedResponse(request);

      return new Response(response, {
        headers: {
          'Content-Type': 'application/ocsp-response',
          'Cache-Control': 'max-age=3600',
        },
      });
    } catch (error) {
      console.error('OCSP error:', error);
      // Return internal error response
      return new Response(Buffer.from([0x30, 0x03, 0x0a, 0x01, 0x02]), {
        headers: { 'Content-Type': 'application/ocsp-response' },
      });
    }
  });

  /**
   * GET /ocsp/{base64Request}
   * OCSP responder - GET method with base64-encoded request
   */
  router.get('/:request', async (c) => {
    try {
      const encodedRequest = c.req.param('request');
      const requestBuffer = Buffer.from(encodedRequest, 'base64url');
      const request = OCSPResponder.parseOCSPRequest(requestBuffer);
      const response = await OCSPResponder.buildSignedResponse(request);

      return new Response(response, {
        headers: {
          'Content-Type': 'application/ocsp-response',
          'Cache-Control': 'max-age=3600',
        },
      });
    } catch (error) {
      console.error('OCSP error:', error);
      return new Response(Buffer.from([0x30, 0x03, 0x0a, 0x01, 0x02]), {
        headers: { 'Content-Type': 'application/ocsp-response' },
      });
    }
  });

  /**
   * GET /ocsp/status/{serialNumber}
   * Simple JSON status check (not standard OCSP)
   */
  router.get('/status/:serialNumber', async (c) => {
    const serialNumber = c.req.param('serialNumber');
    const status = await OCSPResponder.checkStatus(serialNumber);
    return c.json(status);
  });

  return router;
}

/**
 * Create well-known routes with environment-based configuration
 */
export function createWellKnownRouterFromEnv() {
  const domain = process.env.DOMAIN || 'localhost:3000';
  const appUrl = process.env.APP_URL || `https://${domain}`;
  const serviceDid =
    process.env.SERVICE_DID || `did:web:${domain.replace(/:/g, '%3A')}`;

  return createWellKnownRouter({
    serviceDid,
    domain,
    pdsEndpoint: process.env.PDS_ENDPOINT || `${appUrl}/xrpc`,
    relayEndpoint: process.env.RELAY_ENDPOINT,
    appviewEndpoint: process.env.APPVIEW_ENDPOINT,
    oauthConfig: process.env.OAUTH_ENABLED
      ? {
          authorizationEndpoint: `${appUrl}/oauth/authorize`,
          tokenEndpoint: `${appUrl}/oauth/token`,
          jwksUri: `${appUrl}/oauth/jwks`,
          scopes: ['atproto', 'openid', 'profile'],
        }
      : undefined,
  });
}

export default createWellKnownRouter;
