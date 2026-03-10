/**
 * DomainSSOService - Per-Domain SSO Configuration
 *
 * Handles:
 * - Domain-scoped SSO configuration
 * - SSO enforcement policies
 * - JIT user provisioning settings
 * - Email domain verification
 * - IdP priority and selection
 */

import { nanoid } from 'nanoid';
import { promises as dns } from 'dns';
import { db } from '../../db/index.js';
import {
  domainSsoConfig,
  externalIdentityProviders,
  domains,
  organizations,
  users,
  ssoAuditLog,
} from '../../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';

// Types
export type SSOMode = 'disabled' | 'optional' | 'required';

export interface DomainSSOConfig {
  id: string;
  domainId: string;
  ssoMode: SSOMode;
  primaryIdpId?: string;
  allowedIdpIds: string[];
  jitProvisioning: boolean;
  defaultOrganizationId?: string;
  defaultRole: string;
  emailDomainVerification: boolean;
  allowedEmailDomains: string[];
  verificationRecords: Record<string, string>;
  forceReauthAfterHours: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DomainSSOStatus {
  domainId: string;
  domainName: string;
  ssoMode: SSOMode;
  availableProviders: Array<{
    id: string;
    providerKey: string;
    displayName: string;
    isPrimary: boolean;
  }>;
  requiresSSO: boolean;
  jitProvisioning: boolean;
  allowedEmailDomains: string[];
}

class DomainSSOServiceImpl {
  // ==========================================
  // Configuration Management
  // ==========================================

  /**
   * Get SSO configuration for a domain
   */
  async getConfig(domainId: string): Promise<DomainSSOConfig | null> {
    const [config] = await db
      .select()
      .from(domainSsoConfig)
      .where(eq(domainSsoConfig.domainId, domainId));

    return config ? this.toConfig(config) : null;
  }

  /**
   * Create or update SSO configuration for a domain
   */
  async upsertConfig(
    domainId: string,
    config: Partial<DomainSSOConfig>
  ): Promise<DomainSSOConfig> {
    const existing = await this.getConfig(domainId);

    if (existing) {
      const [updated] = await db
        .update(domainSsoConfig)
        .set({
          ssoMode: config.ssoMode,
          primaryIdpId: config.primaryIdpId,
          allowedIdpIds: config.allowedIdpIds,
          jitProvisioning: config.jitProvisioning,
          defaultOrganizationId: config.defaultOrganizationId,
          defaultRole: config.defaultRole,
          emailDomainVerification: config.emailDomainVerification,
          allowedEmailDomains: config.allowedEmailDomains,
          forceReauthAfterHours: config.forceReauthAfterHours,
          updatedAt: new Date(),
        })
        .where(eq(domainSsoConfig.domainId, domainId))
        .returning();

      await this.logAuditEvent('domain_sso_update', undefined, domainId, true, config);
      return this.toConfig(updated!);
    }

    const [inserted] = await db
      .insert(domainSsoConfig)
      .values({
        id: nanoid(),
        domainId,
        ssoMode: config.ssoMode || 'optional',
        primaryIdpId: config.primaryIdpId,
        allowedIdpIds: config.allowedIdpIds || [],
        jitProvisioning: config.jitProvisioning ?? true,
        defaultOrganizationId: config.defaultOrganizationId,
        defaultRole: config.defaultRole || 'member',
        emailDomainVerification: config.emailDomainVerification ?? true,
        allowedEmailDomains: config.allowedEmailDomains || [],
        forceReauthAfterHours: config.forceReauthAfterHours || 24,
      })
      .returning();

    await this.logAuditEvent('domain_sso_create', undefined, domainId, true, config);
    return this.toConfig(inserted!);
  }

  /**
   * Delete SSO configuration for a domain
   */
  async deleteConfig(domainId: string): Promise<boolean> {
    const result = await db
      .delete(domainSsoConfig)
      .where(eq(domainSsoConfig.domainId, domainId))
      .returning();

    if (result.length > 0) {
      await this.logAuditEvent('domain_sso_delete', undefined, domainId, true);
    }

    return result.length > 0;
  }

  // ==========================================
  // SSO Status and Discovery
  // ==========================================

  /**
   * Get SSO status for a domain (used for login page discovery)
   */
  async getSSOStatus(domainId: string): Promise<DomainSSOStatus | null> {
    // Get domain info
    const [domain] = await db.select().from(domains).where(eq(domains.id, domainId));
    if (!domain) {
      return null;
    }

    // Get SSO config
    const config = await this.getConfig(domainId);

    // Get available providers
    let providers: Array<typeof externalIdentityProviders.$inferSelect> = [];
    if (config && config.allowedIdpIds.length > 0) {
      providers = await db
        .select()
        .from(externalIdentityProviders)
        .where(
          and(
            inArray(externalIdentityProviders.id, config.allowedIdpIds),
            eq(externalIdentityProviders.status, 'active')
          )
        );
    } else {
      // Get domain-scoped providers
      providers = await db
        .select()
        .from(externalIdentityProviders)
        .where(
          and(
            eq(externalIdentityProviders.domainId, domainId),
            eq(externalIdentityProviders.status, 'active')
          )
        );
    }

    return {
      domainId,
      domainName: domain.name,
      ssoMode: config?.ssoMode || 'disabled',
      availableProviders: providers.map((p) => ({
        id: p.id,
        providerKey: p.providerKey,
        displayName: p.displayName,
        isPrimary: p.id === config?.primaryIdpId,
      })),
      requiresSSO: config?.ssoMode === 'required',
      jitProvisioning: config?.jitProvisioning ?? true,
      allowedEmailDomains: config?.allowedEmailDomains || [],
    };
  }

  /**
   * Check if SSO is required for a user based on email domain
   */
  async isSSORequired(email: string, domainId?: string): Promise<{
    required: boolean;
    provider?: {
      id: string;
      providerKey: string;
      displayName: string;
    };
  }> {
    const emailDomain = email.split('@')[1];
    if (!emailDomain) {
      return { required: false };
    }

    // If domain is specified, check its config
    if (domainId) {
      const config = await this.getConfig(domainId);
      if (config?.ssoMode === 'required') {
        // Check if email domain is allowed
        if (
          config.emailDomainVerification &&
          config.allowedEmailDomains.length > 0 &&
          !config.allowedEmailDomains.includes(emailDomain)
        ) {
          return { required: false };
        }

        // Get primary provider
        if (config.primaryIdpId) {
          const [provider] = await db
            .select()
            .from(externalIdentityProviders)
            .where(eq(externalIdentityProviders.id, config.primaryIdpId));

          if (provider) {
            return {
              required: true,
              provider: {
                id: provider.id,
                providerKey: provider.providerKey,
                displayName: provider.displayName,
              },
            };
          }
        }

        return { required: true };
      }
    }

    // Check if any provider requires this email domain
    const [provider] = await db
      .select()
      .from(externalIdentityProviders)
      .where(
        and(
          eq(externalIdentityProviders.requiredEmailDomain, emailDomain),
          eq(externalIdentityProviders.status, 'active')
        )
      );

    if (provider) {
      return {
        required: true,
        provider: {
          id: provider.id,
          providerKey: provider.providerKey,
          displayName: provider.displayName,
        },
      };
    }

    return { required: false };
  }

  // ==========================================
  // Provider Assignment
  // ==========================================

  /**
   * Add an identity provider to a domain
   */
  async addProviderToDomain(domainId: string, providerId: string): Promise<boolean> {
    const config = await this.getConfig(domainId);
    if (!config) {
      // Create config with this provider
      await this.upsertConfig(domainId, {
        allowedIdpIds: [providerId],
      });
      return true;
    }

    if (!config.allowedIdpIds.includes(providerId)) {
      config.allowedIdpIds.push(providerId);
      await this.upsertConfig(domainId, {
        allowedIdpIds: config.allowedIdpIds,
      });
    }

    return true;
  }

  /**
   * Remove an identity provider from a domain
   */
  async removeProviderFromDomain(domainId: string, providerId: string): Promise<boolean> {
    const config = await this.getConfig(domainId);
    if (!config) {
      return false;
    }

    const newAllowed = config.allowedIdpIds.filter((id) => id !== providerId);
    const updates: Partial<DomainSSOConfig> = {
      allowedIdpIds: newAllowed,
    };

    // If removing primary provider, clear it
    if (config.primaryIdpId === providerId) {
      updates.primaryIdpId = newAllowed[0] || undefined;
    }

    await this.upsertConfig(domainId, updates);
    return true;
  }

  /**
   * Set primary identity provider for a domain
   */
  async setPrimaryProvider(domainId: string, providerId: string): Promise<boolean> {
    const config = await this.getConfig(domainId);
    if (!config) {
      await this.upsertConfig(domainId, {
        primaryIdpId: providerId,
        allowedIdpIds: [providerId],
      });
      return true;
    }

    // Ensure provider is in allowed list
    if (!config.allowedIdpIds.includes(providerId)) {
      config.allowedIdpIds.push(providerId);
    }

    await this.upsertConfig(domainId, {
      primaryIdpId: providerId,
      allowedIdpIds: config.allowedIdpIds,
    });

    return true;
  }

  // ==========================================
  // JIT Provisioning
  // ==========================================

  /**
   * Check if user should be auto-provisioned
   */
  async shouldAutoProvision(domainId: string, email: string): Promise<{
    autoProvision: boolean;
    organizationId?: string;
    role?: string;
  }> {
    const config = await this.getConfig(domainId);
    if (!config) {
      return { autoProvision: false };
    }

    if (!config.jitProvisioning) {
      return { autoProvision: false };
    }

    // Check email domain
    const emailDomain = email.split('@')[1];
    if (
      config.emailDomainVerification &&
      config.allowedEmailDomains.length > 0 &&
      !config.allowedEmailDomains.includes(emailDomain || '')
    ) {
      return { autoProvision: false };
    }

    return {
      autoProvision: true,
      organizationId: config.defaultOrganizationId,
      role: config.defaultRole,
    };
  }

  // ==========================================
  // Email Domain Management
  // ==========================================

  /**
   * Add allowed email domain
   */
  async addAllowedEmailDomain(domainId: string, emailDomain: string): Promise<boolean> {
    const config = await this.getConfig(domainId);
    const allowedDomains = config?.allowedEmailDomains || [];

    if (!allowedDomains.includes(emailDomain)) {
      allowedDomains.push(emailDomain);
      await this.upsertConfig(domainId, {
        allowedEmailDomains: allowedDomains,
      });
    }

    return true;
  }

  /**
   * Remove allowed email domain
   */
  async removeAllowedEmailDomain(domainId: string, emailDomain: string): Promise<boolean> {
    const config = await this.getConfig(domainId);
    if (!config) {
      return false;
    }

    const newDomains = config.allowedEmailDomains.filter((d) => d !== emailDomain);
    await this.upsertConfig(domainId, {
      allowedEmailDomains: newDomains,
    });

    return true;
  }

  /**
   * Verify email domain ownership via DNS TXT record
   */
  async verifyEmailDomain(domainId: string, emailDomain: string): Promise<{
    verified: boolean;
    verificationRecord?: string;
    error?: string;
  }> {
    // Get existing verification record or generate new one
    const config = await this.getConfig(domainId);
    const existingRecords = (config?.verificationRecords || {}) as Record<string, string>;
    let verificationRecord = existingRecords[emailDomain];

    if (!verificationRecord) {
      // Generate new verification record
      verificationRecord = `exprsn-verify=${nanoid(32)}`;

      // Store the verification record for future checks
      await this.upsertConfig(domainId, {
        verificationRecords: {
          ...existingRecords,
          [emailDomain]: verificationRecord,
        },
      });
    }

    try {
      // Resolve DNS TXT records for the domain
      const txtRecords = await dns.resolveTxt(emailDomain);

      // Flatten the nested arrays (TXT records can be chunked)
      const flatRecords = txtRecords.map((record) => record.join(''));

      // Check if any TXT record matches our verification record
      const isVerified = flatRecords.some((record) =>
        record.includes(verificationRecord!)
      );

      if (isVerified) {
        // Mark domain as verified by adding to allowed list
        await this.addAllowedEmailDomain(domainId, emailDomain);

        // Log successful verification
        await this.logAuditEvent(
          'email_domain_verified',
          undefined,
          domainId,
          true,
          { emailDomain }
        );

        return {
          verified: true,
          verificationRecord,
        };
      }

      return {
        verified: false,
        verificationRecord,
        error: `TXT record not found. Add "${verificationRecord}" as a TXT record to ${emailDomain}`,
      };
    } catch (error) {
      // DNS lookup failed
      const errorMessage = error instanceof Error ? error.message : 'DNS lookup failed';

      await this.logAuditEvent(
        'email_domain_verification_failed',
        undefined,
        domainId,
        false,
        { emailDomain },
        errorMessage
      );

      return {
        verified: false,
        verificationRecord,
        error: `DNS verification failed: ${errorMessage}. Ensure TXT record "${verificationRecord}" exists on ${emailDomain}`,
      };
    }
  }

  // ==========================================
  // Session Management
  // ==========================================

  /**
   * Check if user needs to re-authenticate
   */
  async needsReauth(userDid: string, domainId: string, lastAuthAt: Date): Promise<boolean> {
    const config = await this.getConfig(domainId);
    if (!config || config.forceReauthAfterHours <= 0) {
      return false;
    }

    const reauthThreshold = config.forceReauthAfterHours * 60 * 60 * 1000;
    const timeSinceAuth = Date.now() - lastAuthAt.getTime();

    return timeSinceAuth > reauthThreshold;
  }

  // ==========================================
  // Private Helpers
  // ==========================================

  private toConfig(c: typeof domainSsoConfig.$inferSelect): DomainSSOConfig {
    return {
      id: c.id,
      domainId: c.domainId,
      ssoMode: (c.ssoMode as SSOMode) || 'optional',
      primaryIdpId: c.primaryIdpId || undefined,
      allowedIdpIds: (c.allowedIdpIds as string[]) || [],
      jitProvisioning: c.jitProvisioning ?? true,
      defaultOrganizationId: c.defaultOrganizationId || undefined,
      defaultRole: c.defaultRole || 'member',
      emailDomainVerification: c.emailDomainVerification ?? true,
      allowedEmailDomains: (c.allowedEmailDomains as string[]) || [],
      verificationRecords: (c.verificationRecords as Record<string, string>) || {},
      forceReauthAfterHours: c.forceReauthAfterHours || 24,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  private async logAuditEvent(
    eventType: string,
    userDid: string | undefined,
    domainId: string,
    success: boolean,
    details?: Record<string, unknown>,
    errorMessage?: string
  ): Promise<void> {
    try {
      await db.insert(ssoAuditLog).values({
        id: nanoid(),
        eventType,
        userDid,
        domainId,
        success,
        details: details || {},
        errorMessage,
      });
    } catch (error) {
      console.error('[DomainSSO] Failed to log audit event:', error);
    }
  }
}

// Export singleton instance
export const DomainSSOService = new DomainSSOServiceImpl();

// Export class for testing
export { DomainSSOServiceImpl };
