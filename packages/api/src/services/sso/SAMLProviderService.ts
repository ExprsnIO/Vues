/**
 * SAMLProviderService - SAML 2.0 Identity Provider Implementation
 *
 * Handles:
 * - SAML assertion generation and signing
 * - SSO (Single Sign-On) endpoint
 * - SLO (Single Logout) endpoint
 * - IdP metadata generation
 * - Service Provider management
 */

import { nanoid } from 'nanoid';
import { SignedXml } from 'xml-crypto';
import { db } from '../../db/index.js';
import {
  samlServiceProviders,
  samlSessions,
  users,
  actorRepos,
  ssoAuditLog,
  caEntityCertificates,
} from '../../db/schema.js';
import { eq, and, isNull, lte } from 'drizzle-orm';
import crypto from 'crypto';

// Types
export interface SAMLServiceProvider {
  id: string;
  entityId: string;
  name: string;
  description?: string;
  acsUrl: string; // Assertion Consumer Service URL
  acsBinding: string;
  sloUrl?: string;
  sloBinding?: string;
  nameIdFormat: string;
  spCertificate?: string;
  attributeMapping?: Record<string, string>;
  extraAttributes?: Array<{ name: string; value: string }>;
  signAssertions: boolean;
  signResponse: boolean;
  signingCertId?: string;
  status: string;
}

export interface SAMLAuthnRequest {
  id: string;
  issuer: string;
  destination?: string;
  acsUrl: string;
  nameIdPolicy?: {
    format?: string;
    allowCreate?: boolean;
  };
  forceAuthn?: boolean;
  isPassive?: boolean;
  relayState?: string;
}

export interface SAMLAssertion {
  id: string;
  issuer: string;
  subject: {
    nameId: string;
    nameIdFormat: string;
  };
  conditions: {
    notBefore: Date;
    notOnOrAfter: Date;
    audience: string;
  };
  authnStatement: {
    authnInstant: Date;
    sessionIndex: string;
    authnContextClassRef: string;
  };
  attributeStatement: Array<{
    name: string;
    nameFormat: string;
    values: string[];
  }>;
}

export interface SAMLResponse {
  id: string;
  inResponseTo?: string;
  destination: string;
  issuer: string;
  status: {
    code: string;
    message?: string;
  };
  assertion?: SAMLAssertion;
}

class SAMLProviderServiceImpl {
  private issuer: string;
  private readonly ASSERTION_VALIDITY_SECONDS = 300; // 5 minutes
  private readonly SESSION_VALIDITY_HOURS = 8;

  constructor() {
    this.issuer = process.env.APP_URL || 'http://localhost:3002';
  }

  // ==========================================
  // Service Provider Management
  // ==========================================

  /**
   * Register a new SAML Service Provider
   */
  async registerServiceProvider(sp: Omit<SAMLServiceProvider, 'id'>): Promise<SAMLServiceProvider> {
    const id = nanoid();

    const [inserted] = await db
      .insert(samlServiceProviders)
      .values({
        id,
        entityId: sp.entityId,
        name: sp.name,
        description: sp.description,
        assertionConsumerServiceUrl: sp.acsUrl,
        assertionConsumerServiceBinding: sp.acsBinding || 'HTTP-POST',
        singleLogoutServiceUrl: sp.sloUrl,
        singleLogoutServiceBinding: sp.sloBinding || 'HTTP-POST',
        nameIdFormat: sp.nameIdFormat || 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
        spCertificate: sp.spCertificate,
        attributeMapping: sp.attributeMapping,
        extraAttributes: sp.extraAttributes || [],
        signAssertions: sp.signAssertions ?? true,
        signResponse: sp.signResponse ?? true,
        status: 'active',
      })
      .returning();

    return this.toServiceProvider(inserted!);
  }

  /**
   * Get Service Provider by entity ID
   */
  async getServiceProvider(entityId: string): Promise<SAMLServiceProvider | null> {
    const [sp] = await db
      .select()
      .from(samlServiceProviders)
      .where(eq(samlServiceProviders.entityId, entityId));

    return sp ? this.toServiceProvider(sp) : null;
  }

  /**
   * Get Service Provider by ID
   */
  async getServiceProviderById(id: string): Promise<SAMLServiceProvider | null> {
    const [sp] = await db
      .select()
      .from(samlServiceProviders)
      .where(eq(samlServiceProviders.id, id));

    return sp ? this.toServiceProvider(sp) : null;
  }

  /**
   * List all Service Providers
   */
  async listServiceProviders(): Promise<SAMLServiceProvider[]> {
    const sps = await db
      .select()
      .from(samlServiceProviders)
      .where(eq(samlServiceProviders.status, 'active'));

    return sps.map((sp) => this.toServiceProvider(sp));
  }

  /**
   * Update Service Provider
   */
  async updateServiceProvider(
    id: string,
    updates: Partial<SAMLServiceProvider>
  ): Promise<SAMLServiceProvider | null> {
    const [updated] = await db
      .update(samlServiceProviders)
      .set({
        name: updates.name,
        description: updates.description,
        assertionConsumerServiceUrl: updates.acsUrl,
        assertionConsumerServiceBinding: updates.acsBinding,
        singleLogoutServiceUrl: updates.sloUrl,
        singleLogoutServiceBinding: updates.sloBinding,
        nameIdFormat: updates.nameIdFormat,
        spCertificate: updates.spCertificate,
        attributeMapping: updates.attributeMapping,
        extraAttributes: updates.extraAttributes,
        signAssertions: updates.signAssertions,
        signResponse: updates.signResponse,
        status: updates.status,
        updatedAt: new Date(),
      })
      .where(eq(samlServiceProviders.id, id))
      .returning();

    return updated ? this.toServiceProvider(updated) : null;
  }

  /**
   * Delete Service Provider
   */
  async deleteServiceProvider(id: string): Promise<boolean> {
    const result = await db
      .delete(samlServiceProviders)
      .where(eq(samlServiceProviders.id, id))
      .returning();

    return result.length > 0;
  }

  // ==========================================
  // SAML SSO Flow
  // ==========================================

  /**
   * Parse SAML AuthnRequest
   */
  parseAuthnRequest(samlRequest: string, isDeflated = true): SAMLAuthnRequest | null {
    try {
      let xml: string;

      if (isDeflated) {
        // Base64 decode and inflate
        const decoded = Buffer.from(samlRequest, 'base64');
        const inflated = this.inflate(decoded);
        xml = inflated.toString('utf8');
      } else {
        xml = Buffer.from(samlRequest, 'base64').toString('utf8');
      }

      // Simple XML parsing (in production, use a proper XML parser)
      const id = this.extractXmlAttribute(xml, 'AuthnRequest', 'ID');
      const issuer = this.extractXmlValue(xml, 'Issuer');
      const destination = this.extractXmlAttribute(xml, 'AuthnRequest', 'Destination');
      const acsUrl = this.extractXmlAttribute(xml, 'AuthnRequest', 'AssertionConsumerServiceURL');
      const forceAuthn = this.extractXmlAttribute(xml, 'AuthnRequest', 'ForceAuthn') === 'true';
      const isPassive = this.extractXmlAttribute(xml, 'AuthnRequest', 'IsPassive') === 'true';

      if (!id || !issuer) {
        return null;
      }

      return {
        id,
        issuer,
        destination: destination || undefined,
        acsUrl: acsUrl || '',
        forceAuthn,
        isPassive,
      };
    } catch (error) {
      console.error('[SAML] Failed to parse AuthnRequest:', error);
      return null;
    }
  }

  /**
   * Create SAML Response with Assertion
   */
  async createSAMLResponse(
    userDid: string,
    sp: SAMLServiceProvider,
    inResponseTo?: string,
    relayState?: string
  ): Promise<{ response: string; sessionIndex: string }> {
    // Get user info
    const userData = await this.getUserForAssertion(userDid);
    if (!userData) {
      throw new Error('User not found');
    }

    const now = new Date();
    const notOnOrAfter = new Date(now.getTime() + this.ASSERTION_VALIDITY_SECONDS * 1000);
    const sessionIndex = `_${nanoid(32)}`;
    const assertionId = `_${nanoid(32)}`;
    const responseId = `_${nanoid(32)}`;

    // Build name ID based on format
    const nameId = this.buildNameId(userData, sp.nameIdFormat);

    // Build attributes
    const attributes = this.buildAttributes(userData, sp.attributeMapping || {});

    // Add extra attributes from SP config
    const extraAttrs = (sp.extraAttributes || []) as Array<{ name: string; value: string }>;
    for (const attr of extraAttrs) {
      attributes.push({
        name: attr.name,
        nameFormat: 'urn:oasis:names:tc:SAML:2.0:attrname-format:basic',
        values: [attr.value],
      });
    }

    // Create session
    await db.insert(samlSessions).values({
      id: nanoid(),
      sessionIndex,
      spId: sp.id,
      userDid,
      nameId,
      nameIdFormat: sp.nameIdFormat,
      expiresAt: new Date(now.getTime() + this.SESSION_VALIDITY_HOURS * 60 * 60 * 1000),
    });

    // Build SAML Response XML
    const responseXml = this.buildResponseXml({
      id: responseId,
      inResponseTo,
      destination: sp.acsUrl,
      issuer: this.issuer,
      status: {
        code: 'urn:oasis:names:tc:SAML:2.0:status:Success',
      },
      assertion: {
        id: assertionId,
        issuer: this.issuer,
        subject: {
          nameId,
          nameIdFormat: sp.nameIdFormat,
        },
        conditions: {
          notBefore: now,
          notOnOrAfter,
          audience: sp.entityId,
        },
        authnStatement: {
          authnInstant: now,
          sessionIndex,
          authnContextClassRef: 'urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport',
        },
        attributeStatement: attributes,
      },
    });

    // Sign if required
    let signedResponse = responseXml;
    if (sp.signResponse || sp.signAssertions) {
      signedResponse = await this.signXml(responseXml, sp.signingCertId);
    }

    // Base64 encode
    const encodedResponse = Buffer.from(signedResponse).toString('base64');

    // Log audit event
    await this.logAuditEvent('saml_sso', userDid, sp.entityId, true, {
      sessionIndex,
      nameId,
    });

    return { response: encodedResponse, sessionIndex };
  }

  /**
   * Create SAML Error Response
   */
  createErrorResponse(
    sp: SAMLServiceProvider,
    statusCode: string,
    message: string,
    inResponseTo?: string
  ): string {
    const responseId = `_${nanoid(32)}`;

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
    ID="${responseId}"
    ${inResponseTo ? `InResponseTo="${inResponseTo}"` : ''}
    Version="2.0"
    IssueInstant="${new Date().toISOString()}"
    Destination="${sp.acsUrl}">
  <saml:Issuer>${this.escapeXml(this.issuer)}</saml:Issuer>
  <samlp:Status>
    <samlp:StatusCode Value="${statusCode}"/>
    <samlp:StatusMessage>${this.escapeXml(message)}</samlp:StatusMessage>
  </samlp:Status>
</samlp:Response>`;

    return Buffer.from(xml).toString('base64');
  }

  // ==========================================
  // SAML SLO (Single Logout)
  // ==========================================

  /**
   * Parse SAML LogoutRequest
   */
  parseLogoutRequest(samlRequest: string, isDeflated = true): {
    id: string;
    issuer: string;
    nameId: string;
    sessionIndex?: string;
  } | null {
    try {
      let xml: string;

      if (isDeflated) {
        const decoded = Buffer.from(samlRequest, 'base64');
        const inflated = this.inflate(decoded);
        xml = inflated.toString('utf8');
      } else {
        xml = Buffer.from(samlRequest, 'base64').toString('utf8');
      }

      const id = this.extractXmlAttribute(xml, 'LogoutRequest', 'ID');
      const issuer = this.extractXmlValue(xml, 'Issuer');
      const nameId = this.extractXmlValue(xml, 'NameID');
      const sessionIndex = this.extractXmlValue(xml, 'SessionIndex');

      if (!id || !issuer || !nameId) {
        return null;
      }

      return { id, issuer, nameId, sessionIndex: sessionIndex || undefined };
    } catch (error) {
      console.error('[SAML] Failed to parse LogoutRequest:', error);
      return null;
    }
  }

  /**
   * Process Single Logout
   */
  async processLogout(
    spEntityId: string,
    nameId: string,
    sessionIndex?: string
  ): Promise<{ loggedOutSessions: number }> {
    const sp = await this.getServiceProvider(spEntityId);
    if (!sp) {
      throw new Error('Service Provider not found');
    }

    // Find and logout sessions
    let query = db
      .update(samlSessions)
      .set({ loggedOutAt: new Date() })
      .where(
        and(
          eq(samlSessions.spId, sp.id),
          eq(samlSessions.nameId, nameId),
          isNull(samlSessions.loggedOutAt)
        )
      );

    if (sessionIndex) {
      query = db
        .update(samlSessions)
        .set({ loggedOutAt: new Date() })
        .where(
          and(
            eq(samlSessions.sessionIndex, sessionIndex),
            isNull(samlSessions.loggedOutAt)
          )
        );
    }

    const result = await query.returning();

    return { loggedOutSessions: result.length };
  }

  /**
   * Create SAML LogoutResponse
   */
  createLogoutResponse(
    sp: SAMLServiceProvider,
    inResponseTo: string,
    success: boolean
  ): string {
    const responseId = `_${nanoid(32)}`;
    const statusCode = success
      ? 'urn:oasis:names:tc:SAML:2.0:status:Success'
      : 'urn:oasis:names:tc:SAML:2.0:status:Responder';

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:LogoutResponse xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
    ID="${responseId}"
    InResponseTo="${inResponseTo}"
    Version="2.0"
    IssueInstant="${new Date().toISOString()}"
    ${sp.sloUrl ? `Destination="${sp.sloUrl}"` : ''}>
  <saml:Issuer>${this.escapeXml(this.issuer)}</saml:Issuer>
  <samlp:Status>
    <samlp:StatusCode Value="${statusCode}"/>
  </samlp:Status>
</samlp:LogoutResponse>`;

    return Buffer.from(xml).toString('base64');
  }

  // ==========================================
  // IdP Metadata
  // ==========================================

  /**
   * Generate IdP Metadata XML
   */
  generateIdPMetadata(): string {
    const entityId = this.issuer;
    const ssoUrl = `${this.issuer}/sso/saml/sso`;
    const sloUrl = `${this.issuer}/sso/saml/slo`;

    // In production, include actual signing certificate
    const metadata = `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
    xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
    entityID="${this.escapeXml(entityId)}">
  <md:IDPSSODescriptor
      WantAuthnRequestsSigned="false"
      protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">

    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:NameIDFormat>urn:oasis:names:tc:SAML:2.0:nameid-format:persistent</md:NameIDFormat>
    <md:NameIDFormat>urn:oasis:names:tc:SAML:2.0:nameid-format:transient</md:NameIDFormat>

    <md:SingleSignOnService
        Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
        Location="${this.escapeXml(ssoUrl)}"/>
    <md:SingleSignOnService
        Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
        Location="${this.escapeXml(ssoUrl)}"/>

    <md:SingleLogoutService
        Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
        Location="${this.escapeXml(sloUrl)}"/>
    <md:SingleLogoutService
        Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
        Location="${this.escapeXml(sloUrl)}"/>

    <md:Attribute xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
        Name="email"
        NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic"/>
    <md:Attribute xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
        Name="displayName"
        NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic"/>
    <md:Attribute xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
        Name="username"
        NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic"/>
  </md:IDPSSODescriptor>

  <md:Organization>
    <md:OrganizationName xml:lang="en">Exprsn</md:OrganizationName>
    <md:OrganizationDisplayName xml:lang="en">Exprsn</md:OrganizationDisplayName>
    <md:OrganizationURL xml:lang="en">${this.escapeXml(this.issuer)}</md:OrganizationURL>
  </md:Organization>
</md:EntityDescriptor>`;

    return metadata;
  }

  // ==========================================
  // Session Management
  // ==========================================

  /**
   * Get active sessions for a user
   */
  async getUserSessions(userDid: string): Promise<Array<{
    id: string;
    sessionIndex: string;
    spName: string;
    nameId: string;
    createdAt: Date;
    expiresAt: Date;
  }>> {
    const sessions = await db
      .select({
        session: samlSessions,
        sp: samlServiceProviders,
      })
      .from(samlSessions)
      .innerJoin(samlServiceProviders, eq(samlSessions.spId, samlServiceProviders.id))
      .where(
        and(
          eq(samlSessions.userDid, userDid),
          isNull(samlSessions.loggedOutAt)
        )
      );

    return sessions.map((s) => ({
      id: s.session.id,
      sessionIndex: s.session.sessionIndex,
      spName: s.sp.name,
      nameId: s.session.nameId,
      createdAt: s.session.createdAt,
      expiresAt: s.session.expiresAt,
    }));
  }

  /**
   * Logout all sessions for a user
   */
  async logoutAllSessions(userDid: string): Promise<number> {
    const result = await db
      .update(samlSessions)
      .set({ loggedOutAt: new Date() })
      .where(
        and(
          eq(samlSessions.userDid, userDid),
          isNull(samlSessions.loggedOutAt)
        )
      )
      .returning();

    return result.length;
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const result = await db
      .delete(samlSessions)
      .where(lte(samlSessions.expiresAt, new Date()))
      .returning();

    return result.length;
  }

  // ==========================================
  // Private Helpers
  // ==========================================

  private toServiceProvider(sp: typeof samlServiceProviders.$inferSelect): SAMLServiceProvider {
    return {
      id: sp.id,
      entityId: sp.entityId,
      name: sp.name,
      description: sp.description || undefined,
      acsUrl: sp.assertionConsumerServiceUrl,
      acsBinding: sp.assertionConsumerServiceBinding || 'HTTP-POST',
      sloUrl: sp.singleLogoutServiceUrl || undefined,
      sloBinding: sp.singleLogoutServiceBinding || undefined,
      nameIdFormat: sp.nameIdFormat || 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      spCertificate: sp.spCertificate || undefined,
      attributeMapping: (sp.attributeMapping as Record<string, string>) || undefined,
      extraAttributes: (sp.extraAttributes as Array<{ name: string; value: string }>) || [],
      signAssertions: sp.signAssertions ?? true,
      signResponse: sp.signResponse ?? true,
      signingCertId: sp.signingCertId || undefined,
      status: sp.status || 'active',
    };
  }

  private async getUserForAssertion(userDid: string): Promise<{
    did: string;
    handle: string;
    displayName?: string;
    email?: string;
    avatar?: string;
  } | null> {
    const [user] = await db.select().from(users).where(eq(users.did, userDid));
    if (!user) {
      return null;
    }

    // Get email from actorRepos
    const [actor] = await db.select().from(actorRepos).where(eq(actorRepos.did, userDid));

    return {
      did: user.did,
      handle: user.handle,
      displayName: user.displayName || undefined,
      email: actor?.email || undefined,
      avatar: user.avatar || undefined,
    };
  }

  private buildNameId(
    user: { did: string; handle: string; email?: string },
    format: string
  ): string {
    switch (format) {
      case 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress':
        return user.email || `${user.handle}@exprsn.io`;
      case 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent':
        return user.did;
      case 'urn:oasis:names:tc:SAML:2.0:nameid-format:transient':
        return `_${nanoid(32)}`;
      default:
        return user.did;
    }
  }

  private buildAttributes(
    user: { did: string; handle: string; displayName?: string; email?: string },
    mapping: Record<string, string>
  ): Array<{ name: string; nameFormat: string; values: string[] }> {
    const attributes: Array<{ name: string; nameFormat: string; values: string[] }> = [];
    const format = 'urn:oasis:names:tc:SAML:2.0:attrname-format:basic';

    // Default attributes
    if (user.email) {
      attributes.push({ name: mapping.email || 'email', nameFormat: format, values: [user.email] });
    }
    attributes.push({ name: mapping.username || 'username', nameFormat: format, values: [user.handle] });
    if (user.displayName) {
      attributes.push({ name: mapping.displayName || 'displayName', nameFormat: format, values: [user.displayName] });
    }
    attributes.push({ name: mapping.sub || 'sub', nameFormat: format, values: [user.did] });

    return attributes;
  }

  private buildResponseXml(response: SAMLResponse): string {
    const assertion = response.assertion;
    if (!assertion) {
      throw new Error('Assertion required');
    }

    const attributeStatements = assertion.attributeStatement
      .map(
        (attr) =>
          `<saml:Attribute Name="${this.escapeXml(attr.name)}" NameFormat="${attr.nameFormat}">
          ${attr.values.map((v) => `<saml:AttributeValue>${this.escapeXml(v)}</saml:AttributeValue>`).join('')}
        </saml:Attribute>`
      )
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
    ID="${response.id}"
    ${response.inResponseTo ? `InResponseTo="${response.inResponseTo}"` : ''}
    Version="2.0"
    IssueInstant="${new Date().toISOString()}"
    Destination="${this.escapeXml(response.destination)}">
  <saml:Issuer>${this.escapeXml(response.issuer)}</saml:Issuer>
  <samlp:Status>
    <samlp:StatusCode Value="${response.status.code}"/>
    ${response.status.message ? `<samlp:StatusMessage>${this.escapeXml(response.status.message)}</samlp:StatusMessage>` : ''}
  </samlp:Status>
  <saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
      ID="${assertion.id}"
      Version="2.0"
      IssueInstant="${new Date().toISOString()}">
    <saml:Issuer>${this.escapeXml(assertion.issuer)}</saml:Issuer>
    <saml:Subject>
      <saml:NameID Format="${assertion.subject.nameIdFormat}">${this.escapeXml(assertion.subject.nameId)}</saml:NameID>
      <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
        <saml:SubjectConfirmationData
            ${response.inResponseTo ? `InResponseTo="${response.inResponseTo}"` : ''}
            NotOnOrAfter="${assertion.conditions.notOnOrAfter.toISOString()}"
            Recipient="${this.escapeXml(response.destination)}"/>
      </saml:SubjectConfirmation>
    </saml:Subject>
    <saml:Conditions NotBefore="${assertion.conditions.notBefore.toISOString()}" NotOnOrAfter="${assertion.conditions.notOnOrAfter.toISOString()}">
      <saml:AudienceRestriction>
        <saml:Audience>${this.escapeXml(assertion.conditions.audience)}</saml:Audience>
      </saml:AudienceRestriction>
    </saml:Conditions>
    <saml:AuthnStatement AuthnInstant="${assertion.authnStatement.authnInstant.toISOString()}" SessionIndex="${assertion.authnStatement.sessionIndex}">
      <saml:AuthnContext>
        <saml:AuthnContextClassRef>${assertion.authnStatement.authnContextClassRef}</saml:AuthnContextClassRef>
      </saml:AuthnContext>
    </saml:AuthnStatement>
    <saml:AttributeStatement>
      ${attributeStatements}
    </saml:AttributeStatement>
  </saml:Assertion>
</samlp:Response>`;
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private extractXmlAttribute(xml: string, element: string, attribute: string): string | null {
    const regex = new RegExp(`<[^>]*${element}[^>]*${attribute}="([^"]*)"`, 'i');
    const match = xml.match(regex);
    return match && match[1] !== undefined ? match[1] : null;
  }

  private extractXmlValue(xml: string, element: string): string | null {
    const regex = new RegExp(`<[^>]*:?${element}[^>]*>([^<]*)<`, 'i');
    const match = xml.match(regex);
    return match && match[1] !== undefined ? match[1].trim() : null;
  }

  private inflate(data: Buffer): Buffer {
    // Simple zlib inflate - in production use proper library
    try {
      const zlib = require('zlib');
      return zlib.inflateRawSync(data);
    } catch {
      // Return as-is if not compressed
      return data;
    }
  }

  private async signXml(xml: string, signingCertId?: string): Promise<string> {
    // If no signing cert configured, return unsigned
    if (!signingCertId) {
      console.warn('[SAML] No signing certificate configured, returning unsigned XML');
      return xml;
    }

    // Fetch the signing certificate and private key
    const [cert] = await db
      .select()
      .from(caEntityCertificates)
      .where(eq(caEntityCertificates.id, signingCertId));

    if (!cert || cert.status !== 'active') {
      console.error('[SAML] Signing certificate not found or inactive:', signingCertId);
      return xml;
    }

    try {
      // Create SignedXml instance
      const sig = new SignedXml({
        privateKey: cert.privateKey,
        publicCert: cert.certificate,
        signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
        canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
      });

      // Add reference to the Response element
      sig.addReference({
        xpath: "//*[local-name(.)='Response']",
        digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
        transforms: [
          'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
          'http://www.w3.org/2001/10/xml-exc-c14n#',
        ],
      });

      // Compute signature
      sig.computeSignature(xml, {
        location: { reference: "//*[local-name(.)='Issuer']", action: 'after' },
      });

      return sig.getSignedXml();
    } catch (error) {
      console.error('[SAML] Failed to sign XML:', error);
      // Return unsigned on error to prevent service disruption
      return xml;
    }
  }

  private async logAuditEvent(
    eventType: string,
    userDid: string,
    spEntityId: string,
    success: boolean,
    details?: Record<string, unknown>,
    errorMessage?: string
  ): Promise<void> {
    try {
      await db.insert(ssoAuditLog).values({
        id: nanoid(),
        eventType,
        userDid,
        providerId: spEntityId,
        success,
        details: details || {},
        errorMessage,
      });
    } catch (error) {
      console.error('[SAML] Failed to log audit event:', error);
    }
  }
}

// Export singleton instance
export const SAMLProviderService = new SAMLProviderServiceImpl();

// Export class for testing
export { SAMLProviderServiceImpl };
