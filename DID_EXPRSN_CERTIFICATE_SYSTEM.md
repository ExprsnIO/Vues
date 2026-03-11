# did:exprsn Certificate-Backed Identity System

## Overview

The did:exprsn method is a certificate-backed DID system that integrates X.509 certificates with the AT Protocol. It provides enterprise-grade identity management with cryptographic verification through certificate chains.

**Implementation Date:** March 10, 2026
**Status:** Complete ✅

## Architecture

### DID Format

```
did:exprsn:<base32(sha256(cert_fingerprint)[0:15])>
```

Example: `did:exprsn:a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7`

The DID is derived from the SHA-256 fingerprint of the primary client authentication certificate, ensuring a stable identifier even when certificates are rotated.

### Certificate Hierarchy

```
Vues Root CA
├── Platform-issued certificates (for individual creators)
│   ├── Client auth certificate (primary)
│   └── Code signing certificate (optional)
└── Organization Intermediate CAs (for enterprise/network/label/brand)
    ├── Organization owner certificates
    └── Organization member certificates
```

## Implementation Files

### 1. Lexicon Schemas ✅

**Location:** `/packages/lexicons/schemas/io/exprsn/identity/`

- `createDid.json` - Create new did:exprsn identity
- `resolveDid.json` - Resolve DID to document with certificate chain
- `rotateKeys.json` - Rotate certificate/keys
- `revokeDid.json` - Revoke DID (admin only)
- `getCertificateStatus.json` - Check certificate status (OCSP-like)
- `getCertificateInfo.json` - Get detailed certificate information

### 2. XRPC Endpoints ✅

**File:** `/packages/api/src/routes/identity-exprsn.ts`

#### Public Endpoints

```typescript
// Create a new did:exprsn
POST /xrpc/io.exprsn.identity.createDid
Request: {
  "handle": "alice",
  "email": "alice@example.com",
  "certificateType": "creator" | "organization" | "member",
  "organizationId": "org_123" // required for org/member types
}
Response: {
  "did": "did:exprsn:...",
  "handle": "alice.exprsn",
  "certificate": {
    "id": "cert_123",
    "pem": "-----BEGIN CERTIFICATE-----\n...",
    "fingerprint": "sha256:...",
    "validUntil": "2027-03-10T00:00:00Z"
  },
  "privateKey": "-----BEGIN PRIVATE KEY-----\n...", // RETURNED ONCE!
  "publicKeyMultibase": "z6Mk...",
  "additionalCertificates": {
    "codeSigning": { /* ... */ }
  }
}

// Resolve did:exprsn to DID document
GET /xrpc/io.exprsn.identity.resolveDid?did=did:exprsn:...
Response: {
  "did": "did:exprsn:...",
  "document": { /* W3C DID Document */ },
  "handle": "alice.exprsn",
  "certificateChain": ["-----BEGIN CERTIFICATE-----\n..."],
  "status": "active" | "revoked" | "deactivated"
}

// Get DID document (application/did+json)
GET /xrpc/io.exprsn.identity.getDidDocument?did=did:exprsn:...

// Check certificate status
GET /xrpc/io.exprsn.identity.getCertificateStatus?did=did:exprsn:...
Response: {
  "status": "good" | "revoked" | "unknown",
  "certificateId": "cert_123",
  "revocationTime": "2026-03-10T00:00:00Z",
  "revocationReason": "Account suspended"
}

// Get certificate info
GET /xrpc/io.exprsn.identity.getCertificateInfo?did=did:exprsn:...
```

#### Authenticated Endpoints

```typescript
// Rotate keys (reissue certificate)
POST /xrpc/io.exprsn.identity.rotateKeys
Request: {
  "did": "did:exprsn:..."
}
// Note: User can only rotate their own DID, unless admin
```

#### Admin Endpoints

```typescript
// Revoke a DID
POST /xrpc/io.exprsn.identity.revokeDid
Request: {
  "did": "did:exprsn:...",
  "reason": "Account suspension"
}

// Create organization intermediate CA
POST /xrpc/io.exprsn.identity.createOrganizationCA
Request: {
  "organizationId": "org_123",
  "organizationName": "Acme Corp",
  "organizationType": "enterprise",
  "validityDays": 3650
}
```

### 3. Well-Known Endpoints ✅

**File:** `/packages/api/src/routes/well-known.ts`

```typescript
// DID document resolution (with did query param)
GET /.well-known/did.json?did=did:exprsn:...
Content-Type: application/did+json

// did:exprsn specific resolution
GET /.well-known/did-exprsn/:did
Cache-Control: public, max-age=3600

// Certificate chain (PEM format)
GET /.well-known/did-exprsn/:did/certificate-chain
Content-Type: application/x-pem-file

// Certificate status (OCSP-like)
GET /.well-known/did-exprsn/:did/status
Cache-Control: public, max-age=300

// DID Configuration Resource
GET /.well-known/did-configuration.json
```

### 4. Certificate-Based Authentication ✅

**File:** `/packages/api/src/routes/auth-certificate.ts`

Challenge-response authentication flow:

```typescript
// 1. Request challenge
POST /xrpc/io.exprsn.auth.requestCertChallenge
Request: {
  "certificatePem": "-----BEGIN CERTIFICATE-----\n..."
}
Response: {
  "challenge": "base64-encoded-random-challenge",
  "challengeId": "chal_123",
  "expiresIn": 300, // 5 minutes
  "fingerprint": "sha256:...",
  "instructions": "Sign the challenge using your certificate private key..."
}

// 2. Sign challenge with private key and submit
POST /xrpc/io.exprsn.auth.loginWithCertificate
Request: {
  "challengeId": "chal_123",
  "signedChallenge": "base64-encoded-signature",
  "certificatePem": "-----BEGIN CERTIFICATE-----\n..."
}
Response: {
  "success": true,
  "did": "did:exprsn:...",
  "accessJwt": "eyJ...",
  "refreshJwt": "eyJ...",
  "authMethod": "certificate",
  "sessionId": "sess_123"
}

// 3. Verify certificate (public endpoint)
POST /xrpc/io.exprsn.auth.verifyCertificate
Request: {
  "certificatePem": "-----BEGIN CERTIFICATE-----\n..."
}
Response: {
  "valid": true,
  "did": "did:exprsn:...",
  "fingerprint": "sha256:...",
  "subject": { "CN": "alice.exprsn", ... },
  "issuer": { "CN": "Vues Root CA", ... },
  "notBefore": "2026-03-10T00:00:00Z",
  "notAfter": "2027-03-10T00:00:00Z"
}
```

### 5. DID Resolution Integration ✅

**File:** `/packages/api/src/services/identity/DIDResolver.ts`

The DID resolver now supports did:exprsn alongside did:plc and did:web:

```typescript
/**
 * Resolve from did:exprsn (certificate-backed DID)
 */
private async resolveFromExprsn(did: string): Promise<ResolvedIdentity | null> {
  const { ExprsnDidService } = await import('../did/exprsn.js');
  const document = await ExprsnDidService.getDidDocument(did);
  if (!document) return null;
  return this.parseDocument(did, document as unknown as DIDDocument, 'web');
}
```

Multi-tier caching:
1. In-memory cache (5 minutes)
2. Redis cache (1 hour)
3. Database cache (persistent)
4. Authoritative source (ExprsnDidService)

### 6. Core Service Implementation ✅

**File:** `/packages/api/src/services/did/exprsn.ts`

The `ExprsnDidService` class provides all did:exprsn operations:

```typescript
// Create creator DID
static async createCreatorDid(input: {
  handle: string;
  email?: string;
  displayName?: string;
}): Promise<ExprsnDidResult>

// Create organization DID (with intermediate CA)
static async createOrganizationDid(input: {
  handle: string;
  organizationId: string;
  organizationType: OrganizationType;
  organizationName: string;
  email?: string;
}): Promise<ExprsnDidResult>

// Create member DID (uses org intermediate CA)
static async createMemberDid(input: {
  handle: string;
  organizationId: string;
  role: string;
  email?: string;
}): Promise<ExprsnDidResult>

// Get DID document
static async getDidDocument(did: string): Promise<ExprsnDidDocument | null>

// Get certificate chain
static async getCertificateChain(did: string): Promise<string[]>

// Revoke DID
static async revokeDid(
  did: string,
  reason: string,
  performedBy: string
): Promise<void>

// Rotate keys
static async rotateKeys(did: string): Promise<ExprsnDidResult>

// Check certificate status
static async checkCertificateStatus(did: string): Promise<{
  status: 'good' | 'revoked' | 'unknown';
  revocationTime?: Date;
  revocationReason?: string;
}>

// Get certificate info
static async getCertificateInfo(did: string): Promise<CertificateInfo | null>
```

## DID Document Format

```json
{
  "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://w3id.org/security/suites/x509-2020/v1",
    "https://w3id.org/security/multikey/v1"
  ],
  "id": "did:exprsn:a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7",
  "alsoKnownAs": ["at://alice.exprsn"],
  "verificationMethod": [
    {
      "id": "did:exprsn:...#key-1",
      "type": "X509Certificate2020",
      "controller": "did:exprsn:...",
      "x509CertificateChain": [
        "-----BEGIN CERTIFICATE-----\nentity cert\n-----END CERTIFICATE-----",
        "-----BEGIN CERTIFICATE-----\nintermediate cert\n-----END CERTIFICATE-----",
        "-----BEGIN CERTIFICATE-----\nroot cert\n-----END CERTIFICATE-----"
      ]
    },
    {
      "id": "did:exprsn:...#atproto",
      "type": "Multikey",
      "controller": "did:exprsn:...",
      "publicKeyMultibase": "z6Mk..."
    }
  ],
  "authentication": ["did:exprsn:...#key-1"],
  "assertionMethod": ["did:exprsn:...#key-1"],
  "service": [
    {
      "id": "did:exprsn:...#atproto_pds",
      "type": "AtprotoPersonalDataServer",
      "serviceEndpoint": "https://pds.exprsn.io"
    }
  ]
}
```

## Database Schema

### exprsn_did_certificates

```sql
CREATE TABLE exprsn_did_certificates (
  id TEXT PRIMARY KEY,
  did TEXT NOT NULL UNIQUE,  -- The did:exprsn identifier
  certificate_id TEXT NOT NULL REFERENCES ca_entity_certificates(id) ON DELETE CASCADE,
  issuer_intermediate_id TEXT REFERENCES ca_intermediate_certificates(id) ON DELETE SET NULL,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  certificate_type TEXT NOT NULL,  -- 'platform' | 'organization'
  public_key_multibase TEXT NOT NULL,
  status TEXT NOT NULL,  -- 'active' | 'revoked'
  revoked_at TIMESTAMP,
  revoked_by TEXT,
  revocation_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX exprsn_did_certs_did_idx ON exprsn_did_certificates(did);
CREATE INDEX exprsn_did_certs_cert_idx ON exprsn_did_certificates(certificate_id);
CREATE INDEX exprsn_did_certs_org_idx ON exprsn_did_certificates(organization_id);
CREATE INDEX exprsn_did_certs_status_idx ON exprsn_did_certificates(status);
```

### organization_intermediate_cas

```sql
CREATE TABLE organization_intermediate_cas (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  intermediate_cert_id TEXT NOT NULL REFERENCES ca_intermediate_certificates(id) ON DELETE CASCADE,
  common_name TEXT NOT NULL,  -- e.g., "Acme Corp CA"
  max_path_length INTEGER NOT NULL,  -- 0 = cannot issue further intermediates
  status TEXT NOT NULL,  -- 'active' | 'revoked'
  created_at TIMESTAMP DEFAULT NOW()
);
```

### plc_identities (updated)

```sql
-- Added certificate integration fields
ALTER TABLE plc_identities ADD COLUMN certificate_id TEXT REFERENCES ca_entity_certificates(id) ON DELETE SET NULL;
ALTER TABLE plc_identities ADD COLUMN certificate_fingerprint TEXT;

CREATE INDEX plc_identities_cert_fingerprint_idx ON plc_identities(certificate_fingerprint);
```

## Usage Examples

### Creating a Creator DID

```typescript
import { ExprsnDidService } from './services/did/exprsn.js';

const result = await ExprsnDidService.createCreatorDid({
  handle: 'alice',
  email: 'alice@example.com',
  displayName: 'Alice Smith'
});

// Result contains:
// - did: "did:exprsn:..."
// - handle: "alice.exprsn"
// - certificate: { id, pem, fingerprint, validUntil }
// - privateKey: "-----BEGIN PRIVATE KEY-----\n..." (SAVE THIS!)
// - publicKeyMultibase: "z6Mk..."
// - additionalCertificates: { codeSigning: {...} }

// IMPORTANT: Save the privateKey securely!
// It will never be returned again.
```

### Creating an Organization with Intermediate CA

```typescript
// 1. Create organization intermediate CA
const ca = await ExprsnDidService.createOrganizationCA({
  organizationId: 'org_acme',
  organizationName: 'Acme Corporation',
  organizationType: 'enterprise',
  validityDays: 3650 // 10 years
});

// 2. Create organization owner DID
const ownerDid = await ExprsnDidService.createOrganizationDid({
  handle: 'admin',
  organizationId: 'org_acme',
  organizationType: 'enterprise',
  organizationName: 'Acme Corporation',
  email: 'admin@acme.com'
});

// 3. Create member DIDs (issued by org intermediate CA)
const memberDid = await ExprsnDidService.createMemberDid({
  handle: 'bob',
  organizationId: 'org_acme',
  role: 'editor',
  email: 'bob@acme.com'
});
```

### Resolving a DID

```typescript
// Get DID document
const doc = await ExprsnDidService.getDidDocument('did:exprsn:...');

// Get certificate chain (entity → intermediate → root)
const chain = await ExprsnDidService.getCertificateChain('did:exprsn:...');
// Returns: ["-----BEGIN CERTIFICATE-----\n...", ...]

// Check certificate status
const status = await ExprsnDidService.checkCertificateStatus('did:exprsn:...');
// Returns: { status: 'good' | 'revoked' | 'unknown', ... }

// Get certificate info
const info = await ExprsnDidService.getCertificateInfo('did:exprsn:...');
```

### Key Rotation

```typescript
// Rotate keys (reissues certificate, optionally revokes old one)
const rotated = await ExprsnDidService.rotateKeys('did:exprsn:...');

// Result contains new certificate and private key
// DID remains the same!
// Old certificate is revoked automatically
```

### Revoking a DID

```typescript
// Admin-only operation
await ExprsnDidService.revokeDid(
  'did:exprsn:...',
  'Account suspended for terms violation',
  'did:plc:admin123'
);

// This:
// 1. Revokes the underlying certificate
// 2. Updates exprsn_did_certificates status to 'revoked'
// 3. Tombstones the PLC identity record
```

## Organization Types with Intermediate CAs

Only certain organization types receive their own intermediate CA:

- ✅ **enterprise** - Large corporations
- ✅ **network** - Network/MCN operators
- ✅ **label** - Record labels
- ✅ **brand** - Brand accounts

Other org types use platform-issued certificates:
- ❌ **agency** - Talent agencies
- ❌ **studio** - Production studios
- ❌ **creator_team** - Creator collaborations
- ❌ **non_profit** - Non-profit organizations

```typescript
// Check if org type qualifies
const shouldCreate = ExprsnDidService.shouldCreateIntermediateCA('enterprise');
// Returns: true
```

## Security Considerations

### Private Key Storage

**CRITICAL**: Private keys are only returned once during DID creation. They are NOT stored on the server (except encrypted CA keys).

- Store user private keys securely (encrypted locally)
- Use hardware security modules (HSMs) for CA private keys in production
- Implement key rotation policies (recommend annual rotation)

### Certificate Validation

All certificates are validated through:
1. X.509 certificate chain verification
2. Expiration checking
3. Revocation checking (via CRL and OCSP)
4. DID-certificate binding verification

### Challenge-Response Authentication

- Challenges expire after 5 minutes
- Challenges are single-use only
- Signatures use RSA-SHA256
- Client must prove possession of private key

### Revocation

- CRL updated every 24 hours
- Delta CRL for recent revocations
- OCSP responder for real-time status
- Well-known endpoints for CRL distribution

## AT Protocol Compatibility

did:exprsn integrates seamlessly with AT Protocol:

1. **PLC Integration**: Each did:exprsn has a corresponding PLC identity record
2. **Handle Resolution**: Handles follow AT Protocol conventions
3. **Service Endpoints**: Standard atproto_pds service endpoint
4. **Signing Keys**: Multibase public key for AT Protocol operations
5. **Federation**: Works with PDS, relay, and AppView

## Testing

```bash
# Test DID creation
curl -X POST http://localhost:3000/xrpc/io.exprsn.identity.createDid \
  -H "Content-Type: application/json" \
  -d '{"handle":"alice","certificateType":"creator","email":"alice@example.com"}'

# Test DID resolution
curl http://localhost:3000/xrpc/io.exprsn.identity.resolveDid?did=did:exprsn:...

# Test well-known endpoint
curl http://localhost:3000/.well-known/did-exprsn/did:exprsn:...

# Test certificate status
curl http://localhost:3000/xrpc/io.exprsn.identity.getCertificateStatus?did=did:exprsn:...

# Test certificate chain
curl http://localhost:3000/.well-known/did-exprsn/did:exprsn:.../certificate-chain
```

## Implementation Checklist

- ✅ Lexicon schemas for did:exprsn operations
- ✅ XRPC endpoints for identity management
- ✅ Well-known endpoints for DID resolution
- ✅ Certificate-based authentication routes
- ✅ PLC integration for did:exprsn compatibility
- ✅ DID resolver support for did:exprsn
- ✅ ExprsnDidService core implementation
- ✅ Database schema integration
- ✅ Route registration in main app
- ✅ W3C DID Document generation
- ✅ Certificate chain construction
- ✅ Key rotation support
- ✅ Revocation support
- ✅ Organization intermediate CA support
- ✅ Challenge-response authentication

## Related Files

### Core Implementation
- `/packages/api/src/services/did/exprsn.ts` - Main did:exprsn service
- `/packages/api/src/services/did/index.ts` - DID services export

### Routes
- `/packages/api/src/routes/identity-exprsn.ts` - XRPC endpoints
- `/packages/api/src/routes/well-known.ts` - Discovery endpoints
- `/packages/api/src/routes/auth-certificate.ts` - Certificate auth
- `/packages/api/src/index.ts` - Route registration

### Services
- `/packages/api/src/services/identity/DIDResolver.ts` - Universal DID resolver
- `/packages/api/src/services/identity/index.ts` - Identity service
- `/packages/api/src/services/ca/CertificateManager.ts` - Certificate management
- `/packages/api/src/services/ca/CAAuditService.ts` - CA audit logging
- `/packages/api/src/services/ca/CRLService.ts` - CRL generation
- `/packages/api/src/services/ca/OCSPResponder.ts` - OCSP responder

### Lexicons
- `/packages/lexicons/schemas/io/exprsn/identity/createDid.json`
- `/packages/lexicons/schemas/io/exprsn/identity/resolveDid.json`
- `/packages/lexicons/schemas/io/exprsn/identity/rotateKeys.json`
- `/packages/lexicons/schemas/io/exprsn/identity/revokeDid.json`
- `/packages/lexicons/schemas/io/exprsn/identity/getCertificateStatus.json`
- `/packages/lexicons/schemas/io/exprsn/identity/getCertificateInfo.json`

## Future Enhancements

1. **Hardware Security Module Integration** - HSM support for CA keys
2. **Certificate Transparency** - Log all certificates to public CT logs
3. **Cross-Signing** - Support for external CA cross-signing
4. **Smart Contract Anchoring** - Blockchain anchoring for audit trail
5. **Biometric Binding** - WebAuthn integration for certificate issuance
6. **Recovery Keys** - Social recovery for lost certificates
7. **Delegation Certificates** - Short-lived delegation tokens
8. **Attribute Certificates** - Verified claims (age, location, verification badges)

## References

- [W3C DID Core Specification](https://www.w3.org/TR/did-core/)
- [AT Protocol Specifications](https://atproto.com/specs/did)
- [X.509 Internet Public Key Infrastructure](https://datatracker.ietf.org/doc/html/rfc5280)
- [OCSP - RFC 6960](https://datatracker.ietf.org/doc/html/rfc6960)
- [Multibase - Multiformats](https://github.com/multiformats/multibase)
- [X.509 Certificate and CRL Profile](https://datatracker.ietf.org/doc/html/rfc5280)

---

**Last Updated:** 2026-03-10
**Version:** 1.0.0
**Status:** Production Ready ✅
