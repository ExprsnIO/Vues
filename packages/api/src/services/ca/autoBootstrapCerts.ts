/**
 * Auto-bootstrap the full certificate chain on first run.
 *
 * Generates: Root CA → Intermediate CA → Code-Signing cert + TLS server cert.
 * Writes fullchain.pem and privkey.pem to deploy/nginx/ssl/ for nginx/Hono TLS.
 *
 * Idempotent: skips if certs already exist unless force is true.
 * Requires PostgreSQL — silently skips if the database is unavailable.
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface BootstrapOptions {
  /** Force regeneration even if certs exist */
  force?: boolean;
  /** Domain name for TLS SAN entries */
  domain?: string;
  /** Additional Subject Alternative Names */
  additionalSANs?: string[];
  /** Output directory for fullchain.pem / privkey.pem */
  outputDir?: string;
}

export interface BootstrapResult {
  success: boolean;
  skipped?: boolean;
  rootCA?: { id: string; fingerprint: string };
  intermediateCA?: { id: string; fingerprint: string };
  codeSigningCert?: { id: string; fingerprint: string };
  tlsServerCert?: { id: string; fingerprint: string };
  error?: string;
}

/**
 * Auto-generate the complete certificate chain.
 */
export async function autoBootstrapCertificateChain(
  options?: BootstrapOptions
): Promise<BootstrapResult> {
  const outputDir = options?.outputDir || resolve(__dirname, '../../../../../deploy/nginx/ssl');
  const fullchainPath = resolve(outputDir, 'fullchain.pem');
  const privkeyPath = resolve(outputDir, 'privkey.pem');

  // Idempotent check
  if (!options?.force && existsSync(fullchainPath) && existsSync(privkeyPath)) {
    console.log('[ca-bootstrap] Certificates already exist — skipping (use force: true to regenerate)');
    return { success: true, skipped: true };
  }

  // Try to import DB and CertificateManager — fail silently if DB unavailable
  let certificateManager: any;
  try {
    const caModule = await import('./index.js');
    certificateManager = caModule.certificateManager;
    // Quick DB connectivity check — if ensureRootCA throws because of a connection
    // error we catch it below.
  } catch (err) {
    console.warn('[ca-bootstrap] Could not import CA module — skipping certificate generation');
    return { success: false, skipped: true, error: 'CA module unavailable' };
  }

  try {
    // 1. Root CA (20-year, RSA 4096)
    console.log('[ca-bootstrap] Ensuring Root CA...');
    const rootCA = await certificateManager.ensureRootCA({
      commonName: 'Exprsn Root CA',
      organization: 'Exprsn',
      organizationalUnit: 'Certificate Authority',
      country: 'US',
      validityDays: 7300,
    });
    console.log(`[ca-bootstrap] Root CA ready: ${rootCA.fingerprint.slice(0, 16)}...`);

    // 2. Intermediate CA (10-year)
    console.log('[ca-bootstrap] Creating Intermediate CA...');
    const intermediateCA = await certificateManager.createIntermediateCA({
      commonName: 'Exprsn Signing CA',
      organization: 'Exprsn',
      organizationalUnit: 'Entity Signing',
      validityDays: 3650,
      pathLength: 0,
    });
    console.log(`[ca-bootstrap] Intermediate CA ready: ${intermediateCA.fingerprint.slice(0, 16)}...`);

    // 3. Code-Signing certificate
    console.log('[ca-bootstrap] Issuing Code-Signing certificate...');
    const codeSigningCert = await certificateManager.issueEntityCertificate({
      commonName: 'Exprsn Code Signing',
      type: 'code_signing',
      organization: 'Exprsn',
      intermediateId: intermediateCA.id,
      validityDays: 365,
    });
    console.log(`[ca-bootstrap] Code-Signing cert ready: ${codeSigningCert.fingerprint.slice(0, 16)}...`);

    // 4. TLS Server certificate with SANs
    const domain = options?.domain || process.env.SERVICE_DOMAIN || 'localhost';
    const sans = [
      domain,
      `*.${domain}`,
      `api.${domain}`,
      'localhost',
      '127.0.0.1',
      ...(options?.additionalSANs || []),
    ];

    console.log(`[ca-bootstrap] Issuing TLS Server certificate for ${domain}...`);
    const tlsCert = await certificateManager.issueEntityCertificate({
      commonName: domain,
      type: 'server',
      organization: 'Exprsn',
      subjectAltNames: sans,
      intermediateId: intermediateCA.id,
      validityDays: 365,
    });
    console.log(`[ca-bootstrap] TLS Server cert ready: ${tlsCert.fingerprint.slice(0, 16)}...`);

    // 5. Write fullchain.pem and privkey.pem
    mkdirSync(outputDir, { recursive: true });

    // fullchain = server cert + intermediate cert + root cert
    const fullchain = [
      tlsCert.certificate,
      intermediateCA.certificate,
      rootCA.certificate,
    ].join('\n');

    writeFileSync(fullchainPath, fullchain, 'utf-8');
    writeFileSync(privkeyPath, tlsCert.privateKey, { mode: 0o600, encoding: 'utf-8' });

    console.log(`[ca-bootstrap] Wrote ${fullchainPath}`);
    console.log(`[ca-bootstrap] Wrote ${privkeyPath}`);

    return {
      success: true,
      rootCA: { id: rootCA.id, fingerprint: rootCA.fingerprint },
      intermediateCA: { id: intermediateCA.id, fingerprint: intermediateCA.fingerprint },
      codeSigningCert: { id: codeSigningCert.id, fingerprint: codeSigningCert.fingerprint },
      tlsServerCert: { id: tlsCert.id, fingerprint: tlsCert.fingerprint },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Check if this is a DB connection error — these are expected before first setup
    if (
      message.includes('ECONNREFUSED') ||
      message.includes('connect ECONNREFUSED') ||
      message.includes('Connection terminated') ||
      message.includes('relation') && message.includes('does not exist')
    ) {
      console.warn('[ca-bootstrap] Database not available — skipping certificate generation');
      return { success: false, skipped: true, error: 'Database unavailable' };
    }
    console.error('[ca-bootstrap] Certificate chain generation failed:', message);
    return { success: false, error: message };
  }
}
