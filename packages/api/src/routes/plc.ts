import { Hono } from 'hono';
import { PlcService, getPlcConfig, updatePlcConfig, PlcConfig } from '../services/plc/index.js';

const plcRouter = new Hono();

// ===========================================
// PLC Directory Endpoints (standard did:plc)
// ===========================================

/**
 * GET /:did
 * Resolve a DID to its document (standard PLC endpoint)
 */
plcRouter.get('/:did', async (c) => {
  const did = c.req.param('did');

  if (!did.startsWith('did:plc:')) {
    return c.json({ error: 'InvalidDid', message: 'Invalid DID format' }, 400);
  }

  const config = await getPlcConfig();

  // If external PLC mode, proxy the request
  if (config.mode === 'external' && config.externalPlcUrl) {
    try {
      const response = await fetch(`${config.externalPlcUrl}/${did}`);
      if (!response.ok) {
        return c.json({ error: 'NotFound', message: 'DID not found' }, 404);
      }
      const doc = await response.json();
      return c.json(doc);
    } catch {
      return c.json({ error: 'UpstreamError', message: 'Failed to resolve DID' }, 502);
    }
  }

  // Standalone mode - resolve locally
  const document = await PlcService.getDidDocument(did);
  if (!document) {
    return c.json({ error: 'NotFound', message: 'DID not found' }, 404);
  }

  return c.json(document, 200, {
    'Content-Type': 'application/did+json',
  });
});

/**
 * GET /:did/log
 * Get operations log for a DID
 */
plcRouter.get('/:did/log', async (c) => {
  const did = c.req.param('did');

  if (!did.startsWith('did:plc:')) {
    return c.json({ error: 'InvalidDid', message: 'Invalid DID format' }, 400);
  }

  const operations = await PlcService.getOperationsLog(did);
  if (operations.length === 0) {
    return c.json({ error: 'NotFound', message: 'DID not found' }, 404);
  }

  return c.json({ operations });
});

/**
 * GET /:did/log/audit
 * Get audit log for a DID
 */
plcRouter.get('/:did/log/audit', async (c) => {
  const did = c.req.param('did');
  const limit = parseInt(c.req.query('limit') || '50', 10);

  if (!did.startsWith('did:plc:')) {
    return c.json({ error: 'InvalidDid', message: 'Invalid DID format' }, 400);
  }

  const auditLog = await PlcService.getAuditLog(did, limit);
  return c.json({ entries: auditLog });
});

/**
 * GET /:did/log/last
 * Get last operation for a DID
 */
plcRouter.get('/:did/log/last', async (c) => {
  const did = c.req.param('did');

  if (!did.startsWith('did:plc:')) {
    return c.json({ error: 'InvalidDid', message: 'Invalid DID format' }, 400);
  }

  const operations = await PlcService.getOperationsLog(did);
  if (operations.length === 0) {
    return c.json({ error: 'NotFound', message: 'DID not found' }, 404);
  }

  return c.json(operations[0]);
});

// ===========================================
// Exprsn PLC API (io.exprsn.plc.*)
// ===========================================

/**
 * POST io.exprsn.plc.createDid
 * Create a new DID
 */
plcRouter.post('/xrpc/io.exprsn.plc.createDid', async (c) => {
  const config = await getPlcConfig();

  if (!config.enabled) {
    return c.json({ error: 'Disabled', message: 'PLC service is disabled' }, 503);
  }

  if (config.mode === 'external') {
    return c.json({ error: 'ExternalMode', message: 'PLC is in external mode, create DIDs at the external PLC' }, 400);
  }

  const body = await c.req.json<{
    handle: string;
    signingKey: string;
    rotationKeys: string[];
    pdsEndpoint: string;
  }>();

  if (!body.handle || !body.signingKey || !body.rotationKeys || !body.pdsEndpoint) {
    return c.json({ error: 'InvalidRequest', message: 'Missing required fields' }, 400);
  }

  try {
    const ipAddress = c.req.header('x-forwarded-for') || c.req.header('x-real-ip');
    const userAgent = c.req.header('user-agent');

    const result = await PlcService.createDid(body, ipAddress, userAgent);

    return c.json(result, 201);
  } catch (error) {
    return c.json({
      error: 'CreateFailed',
      message: error instanceof Error ? error.message : 'Failed to create DID',
    }, 400);
  }
});

/**
 * POST io.exprsn.plc.updateDid
 * Update a DID (handle, PDS, etc.)
 */
plcRouter.post('/xrpc/io.exprsn.plc.updateDid', async (c) => {
  const config = await getPlcConfig();

  if (!config.enabled) {
    return c.json({ error: 'Disabled', message: 'PLC service is disabled' }, 503);
  }

  const body = await c.req.json<{
    did: string;
    handle?: string;
    signingKey?: string;
    rotationKeys?: string[];
    pdsEndpoint?: string;
    alsoKnownAs?: string[];
  }>();

  if (!body.did) {
    return c.json({ error: 'InvalidRequest', message: 'Missing did' }, 400);
  }

  try {
    const ipAddress = c.req.header('x-forwarded-for') || c.req.header('x-real-ip');
    const userAgent = c.req.header('user-agent');

    const result = await PlcService.updateDid(body, ipAddress, userAgent);

    return c.json(result);
  } catch (error) {
    return c.json({
      error: 'UpdateFailed',
      message: error instanceof Error ? error.message : 'Failed to update DID',
    }, 400);
  }
});

/**
 * POST io.exprsn.plc.rotateKeys
 * Rotate signing or rotation keys
 */
plcRouter.post('/xrpc/io.exprsn.plc.rotateKeys', async (c) => {
  const config = await getPlcConfig();

  if (!config.enabled) {
    return c.json({ error: 'Disabled', message: 'PLC service is disabled' }, 503);
  }

  const body = await c.req.json<{
    did: string;
    newSigningKey?: string;
    newRotationKeys?: string[];
    rotationKeyUsed: string;
    signature: string;
  }>();

  if (!body.did || !body.rotationKeyUsed || !body.signature) {
    return c.json({ error: 'InvalidRequest', message: 'Missing required fields' }, 400);
  }

  try {
    const ipAddress = c.req.header('x-forwarded-for') || c.req.header('x-real-ip');
    const userAgent = c.req.header('user-agent');

    const result = await PlcService.rotateKeys(body, ipAddress, userAgent);

    return c.json(result);
  } catch (error) {
    return c.json({
      error: 'RotateFailed',
      message: error instanceof Error ? error.message : 'Failed to rotate keys',
    }, 400);
  }
});

/**
 * GET io.exprsn.plc.resolveHandle
 * Resolve a handle to a DID
 */
plcRouter.get('/xrpc/io.exprsn.plc.resolveHandle', async (c) => {
  const handle = c.req.query('handle');

  if (!handle) {
    return c.json({ error: 'InvalidRequest', message: 'Missing handle' }, 400);
  }

  const did = await PlcService.resolveHandle(handle);
  if (!did) {
    return c.json({ error: 'NotFound', message: 'Handle not found' }, 404);
  }

  return c.json({ did });
});

/**
 * GET io.exprsn.plc.getIdentity
 * Get identity information
 */
plcRouter.get('/xrpc/io.exprsn.plc.getIdentity', async (c) => {
  const did = c.req.query('did');

  if (!did) {
    return c.json({ error: 'InvalidRequest', message: 'Missing did' }, 400);
  }

  const identity = await PlcService.getIdentity(did);
  if (!identity) {
    return c.json({ error: 'NotFound', message: 'Identity not found' }, 404);
  }

  return c.json(identity);
});

/**
 * GET io.exprsn.plc.validateHandle
 * Validate a handle format
 */
plcRouter.get('/xrpc/io.exprsn.plc.validateHandle', async (c) => {
  const handle = c.req.query('handle');

  if (!handle) {
    return c.json({ error: 'InvalidRequest', message: 'Missing handle' }, 400);
  }

  const validation = await PlcService.validateHandle(handle);
  const available = validation.valid ? await PlcService.isHandleAvailable(handle) : false;

  return c.json({
    valid: validation.valid,
    available,
    type: validation.type,
    error: validation.error,
  });
});

/**
 * POST io.exprsn.plc.reserveHandle
 * Reserve a handle (admin/organization)
 */
plcRouter.post('/xrpc/io.exprsn.plc.reserveHandle', async (c) => {
  // TODO: Add admin/org auth check

  const body = await c.req.json<{
    handle: string;
    type: 'user' | 'org';
    organizationId?: string;
    reservedBy?: string;
  }>();

  if (!body.handle || !body.type) {
    return c.json({ error: 'InvalidRequest', message: 'Missing handle or type' }, 400);
  }

  try {
    await PlcService.reserveHandle(body.handle, body.type, body.reservedBy, body.organizationId);
    return c.json({ success: true });
  } catch (error) {
    return c.json({
      error: 'ReserveFailed',
      message: error instanceof Error ? error.message : 'Failed to reserve handle',
    }, 400);
  }
});

/**
 * POST io.exprsn.plc.releaseHandle
 * Release a handle reservation
 */
plcRouter.post('/xrpc/io.exprsn.plc.releaseHandle', async (c) => {
  // TODO: Add admin auth check

  const body = await c.req.json<{ handle: string }>();

  if (!body.handle) {
    return c.json({ error: 'InvalidRequest', message: 'Missing handle' }, 400);
  }

  await PlcService.releaseHandle(body.handle);
  return c.json({ success: true });
});

/**
 * GET io.exprsn.plc.getConfig
 * Get PLC configuration (admin)
 */
plcRouter.get('/xrpc/io.exprsn.plc.getConfig', async (c) => {
  // TODO: Add admin auth check

  const config = await getPlcConfig();
  return c.json(config);
});

/**
 * POST io.exprsn.plc.updateConfig
 * Update PLC configuration (admin)
 */
plcRouter.post('/xrpc/io.exprsn.plc.updateConfig', async (c) => {
  // TODO: Add admin auth check

  const body = await c.req.json<Partial<PlcConfig>>();

  await updatePlcConfig(body);
  const newConfig = await getPlcConfig();

  return c.json(newConfig);
});

export { plcRouter };
export default plcRouter;
