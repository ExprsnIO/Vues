'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatCount } from '@/lib/utils';
import { api } from '@/lib/api';

// Tab types
type AdminTab = 'certificates' | 'tokens' | 'auth';
type CertStatus = 'all' | 'active' | 'revoked' | 'expired';
type CertType = 'all' | 'client' | 'server' | 'code_signing' | 'intermediate' | 'root';
type TokenType = 'all' | 'api_key' | 'access_token' | 'refresh_token' | 'service_token';

interface Certificate {
  id: string;
  commonName: string;
  serialNumber: string;
  fingerprint: string;
  certType: 'client' | 'server' | 'code_signing' | 'intermediate' | 'root';
  status: 'active' | 'revoked' | 'expired';
  subjectDid?: string | null;
  serviceId?: string | null;
  notBefore: string;
  notAfter: string;
  createdAt: string;
  keyUsage?: string[];
  extendedKeyUsage?: string[];
}

interface RootCertificate {
  id: string;
  commonName: string;
  serialNumber: string;
  fingerprint: string;
  status: 'active' | 'revoked';
  notBefore: string;
  notAfter: string;
  issuedCount: number;
  certType: 'root' | 'intermediate';
}

interface Token {
  id: string;
  name: string;
  type: 'api_key' | 'access_token' | 'refresh_token' | 'service_token';
  status: 'active' | 'revoked' | 'expired';
  prefix: string;
  scopes: string[];
  // Time-based constraints
  expiresAt?: string;
  // Use-based constraints
  maxUses?: number;
  usesRemaining?: number;
  // Metadata
  lastUsedAt?: string;
  createdAt: string;
  createdBy: string;
  description?: string;
}

interface AuthConfig {
  jwt: {
    algorithm: 'HS256' | 'HS384' | 'HS512' | 'RS256' | 'RS384' | 'RS512' | 'ES256' | 'ES384' | 'ES512';
    accessTokenExpiry: number; // seconds
    refreshTokenExpiry: number; // seconds
    issuer: string;
    audience: string;
  };
  apiKeys: {
    enabled: boolean;
    prefix: string;
    hashAlgorithm: 'sha256' | 'sha384' | 'sha512';
    defaultExpiry: number; // days, 0 = never
  };
  rateLimiting: {
    enabled: boolean;
    requestsPerMinute: number;
    requestsPerHour: number;
  };
  mtls: {
    enabled: boolean;
    requireClientCert: boolean;
    allowedCAs: string[];
  };
}

export default function CertificatesAdmin() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<AdminTab>('certificates');
  const [statusFilter, setStatusFilter] = useState<CertStatus>('all');
  const [typeFilter, setTypeFilter] = useState<CertType>('all');
  const [tokenTypeFilter, setTokenTypeFilter] = useState<TokenType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCert, setSelectedCert] = useState<Certificate | null>(null);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [showCreateCertModal, setShowCreateCertModal] = useState(false);
  const [showCreateTokenModal, setShowCreateTokenModal] = useState(false);
  const [showCreateCAModal, setShowCreateCAModal] = useState(false);
  const [selectedCertIds, setSelectedCertIds] = useState<string[]>([]);
  const [showBatchRevokeModal, setShowBatchRevokeModal] = useState(false);
  const [showBatchDownloadModal, setShowBatchDownloadModal] = useState(false);
  const [showBatchCreateModal, setShowBatchCreateModal] = useState(false);

  // Fetch CA stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin', 'certificates', 'stats'],
    queryFn: async () => {
      try {
        const result = await api.caAdminGetStats();
        return {
          ...result,
          // Token enrollment feature not yet implemented
          totalTokens: 0,
          activeTokens: 0,
          singleUseTokens: 0,
        };
      } catch {
        // Fallback to empty stats if API not available
        return {
          totalCertificates: 0,
          activeCertificates: 0,
          revokedCertificates: 0,
          expiredCertificates: 0,
          rootCertificates: 0,
          intermediateCAs: 0,
          expiringIn30Days: 0,
          totalTokens: 0,
          activeTokens: 0,
          singleUseTokens: 0,
        };
      }
    },
  });

  // Fetch available issuers (CAs that can issue certificates)
  const { data: issuers } = useQuery({
    queryKey: ['admin', 'certificates', 'issuers'],
    queryFn: async () => {
      try {
        const result = await api.caGetAvailableIssuers();
        return result.issuers;
      } catch {
        return [];
      }
    },
  });

  // Fetch root and intermediate certificates
  const { data: caCerts } = useQuery({
    queryKey: ['admin', 'certificates', 'cas'],
    queryFn: async () => {
      try {
        const result = await api.caAdminListCAs();
        return result.cas.map(ca => ({
          ...ca,
          status: ca.status as 'active' | 'revoked',
        }));
      } catch {
        // Fallback to mock data
        const mockCAs: RootCertificate[] = [
          {
            id: 'root_001',
            commonName: 'Exprsn Root CA',
            serialNumber: '01:AB:CD:EF',
            fingerprint: 'SHA256:abc123...',
            status: 'active',
            notBefore: '2024-01-01T00:00:00Z',
            notAfter: '2034-01-01T00:00:00Z',
            issuedCount: 145,
            certType: 'root',
          },
          {
            id: 'int_001',
            commonName: 'Exprsn Intermediate CA',
            serialNumber: '02:AB:CD:EF',
            fingerprint: 'SHA256:def456...',
            status: 'active',
            notBefore: '2024-01-01T00:00:00Z',
            notAfter: '2029-01-01T00:00:00Z',
            issuedCount: 89,
            certType: 'intermediate',
          },
        ];
        return mockCAs;
      }
    },
  });

  // Fetch entity certificates
  const { data: certificates, refetch: refetchCerts } = useQuery({
    queryKey: ['admin', 'certificates', 'entities', statusFilter, typeFilter, searchQuery],
    queryFn: async () => {
      try {
        const result = await api.caAdminListAllCertificates({
          status: statusFilter !== 'all' ? statusFilter : undefined,
          type: typeFilter !== 'all' ? typeFilter : undefined,
          q: searchQuery || undefined,
          limit: 100,
        });
        return result.certificates.map(cert => ({
          ...cert,
          certType: cert.certType as Certificate['certType'],
          status: cert.status as Certificate['status'],
        }));
      } catch {
        // Fallback to mock data
        const mockCerts: Certificate[] = [
          {
            id: 'cert_001',
            commonName: 'api.exprsn.io',
            serialNumber: '10:AB:CD:EF',
            fingerprint: 'SHA256:srv123...',
            certType: 'server',
            status: 'active',
            serviceId: 'api-service',
            notBefore: '2024-06-01T00:00:00Z',
            notAfter: '2025-06-01T00:00:00Z',
            createdAt: '2024-06-01T00:00:00Z',
            keyUsage: ['digitalSignature', 'keyEncipherment'],
            extendedKeyUsage: ['serverAuth'],
          },
        ];
        return mockCerts;
      }
    },
  });

  // Fetch tokens
  const { data: tokens } = useQuery({
    queryKey: ['admin', 'tokens', tokenTypeFilter],
    queryFn: async () => {
      const mockTokens: Token[] = [
        {
          id: 'tok_001',
          name: 'Production API Key',
          type: 'api_key',
          status: 'active',
          prefix: 'exp_live_',
          scopes: ['read', 'write', 'admin'],
          createdAt: '2024-06-01T00:00:00Z',
          createdBy: 'system',
          description: 'Main production API access',
        },
        {
          id: 'tok_002',
          name: 'CI/CD Pipeline Token',
          type: 'service_token',
          status: 'active',
          prefix: 'exp_svc_',
          scopes: ['deploy', 'build'],
          expiresAt: '2025-12-31T23:59:59Z',
          createdAt: '2024-08-15T00:00:00Z',
          createdBy: 'admin@exprsn.io',
          lastUsedAt: '2024-10-20T14:32:00Z',
          description: 'GitHub Actions deployment',
        },
        {
          id: 'tok_003',
          name: 'One-time Setup Token',
          type: 'access_token',
          status: 'active',
          prefix: 'exp_tmp_',
          scopes: ['setup'],
          maxUses: 1,
          usesRemaining: 1,
          createdAt: '2024-10-01T00:00:00Z',
          createdBy: 'admin@exprsn.io',
          description: 'Single-use onboarding token',
        },
        {
          id: 'tok_004',
          name: 'Batch Import Token',
          type: 'access_token',
          status: 'active',
          prefix: 'exp_tmp_',
          scopes: ['import'],
          maxUses: 100,
          usesRemaining: 47,
          expiresAt: '2024-11-30T23:59:59Z',
          createdAt: '2024-10-15T00:00:00Z',
          createdBy: 'admin@exprsn.io',
          description: 'Limited use token for data migration',
        },
        {
          id: 'tok_005',
          name: 'Expired Dev Token',
          type: 'api_key',
          status: 'expired',
          prefix: 'exp_test_',
          scopes: ['read'],
          expiresAt: '2024-09-01T00:00:00Z',
          createdAt: '2024-06-01T00:00:00Z',
          createdBy: 'dev@exprsn.io',
        },
      ];
      return mockTokens;
    },
  });

  // Fetch auth config
  const { data: authConfig } = useQuery({
    queryKey: ['admin', 'auth', 'config'],
    queryFn: async () => {
      const config: AuthConfig = {
        jwt: {
          algorithm: 'RS256',
          accessTokenExpiry: 3600, // 1 hour
          refreshTokenExpiry: 2592000, // 30 days
          issuer: 'https://auth.exprsn.io',
          audience: 'https://api.exprsn.io',
        },
        apiKeys: {
          enabled: true,
          prefix: 'exp_',
          hashAlgorithm: 'sha256',
          defaultExpiry: 365,
        },
        rateLimiting: {
          enabled: true,
          requestsPerMinute: 60,
          requestsPerHour: 1000,
        },
        mtls: {
          enabled: true,
          requireClientCert: false,
          allowedCAs: ['root_001', 'int_001'],
        },
      };
      return config;
    },
  });

  // Mutations
  const revokeCertMutation = useMutation({
    mutationFn: async (certId: string) => {
      await api.caAdminRevokeCertificate(certId, 'unspecified');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'certificates'] });
      setSelectedCert(null);
    },
  });

  // Batch revoke mutation
  const batchRevokeMutation = useMutation({
    mutationFn: async ({ ids, reason }: { ids: string[]; reason: string }) => {
      return await api.caAdminBatchRevoke(ids, reason);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'certificates'] });
      setSelectedCertIds([]);
      setShowBatchRevokeModal(false);
    },
  });

  // Batch download mutation
  const batchDownloadMutation = useMutation({
    mutationFn: async ({
      ids,
      format,
      includePrivateKey,
      password,
    }: {
      ids: string[];
      format: 'pem' | 'der' | 'pkcs12';
      includePrivateKey: boolean;
      password?: string;
    }) => {
      return await api.caAdminBatchDownload(ids, format, includePrivateKey, password);
    },
    onSuccess: (data) => {
      // Trigger download of certificates
      data.certificates.forEach((cert) => {
        const blob = new Blob([cert.data], { type: 'application/x-pem-file' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${cert.commonName.replace(/[^a-z0-9]/gi, '_')}.${cert.format === 'der' ? 'der' : 'pem'}`;
        a.click();
        URL.revokeObjectURL(url);
      });
      setShowBatchDownloadModal(false);
    },
  });

  // Batch issue mutation
  const batchIssueMutation = useMutation({
    mutationFn: async ({
      certificates,
      issuerId,
      certType,
      validityDays,
    }: {
      certificates: Array<{ commonName: string; subjectDid?: string; email?: string }>;
      issuerId?: string;
      certType?: 'client' | 'server' | 'code_signing';
      validityDays?: number;
    }) => {
      return await api.caAdminBatchIssue(certificates, issuerId, certType, validityDays);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'certificates'] });
      setShowBatchCreateModal(false);
    },
  });

  const revokeTokenMutation = useMutation({
    mutationFn: async (tokenId: string) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'tokens'] });
      setSelectedToken(null);
    },
  });

  const createCertMutation = useMutation({
    mutationFn: async (data: CreateCertData) => {
      const result = await api.caIssueCertificate({
        type: data.certType,
        issuerId: data.issuerId,
        subject: {
          commonName: data.commonName,
          organization: data.organization,
          organizationalUnit: data.organizationalUnit,
          country: data.country,
          state: data.state,
          locality: data.locality,
        },
        subjectAltNames: data.subjectAltNames,
        validityDays: data.validity,
        keySize: data.keySize,
        algorithm: data.algorithm,
        keyUsage: data.keyUsage,
        extKeyUsage: data.extendedKeyUsage,
      });
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'certificates'] });
      setShowCreateCertModal(false);

      // Download the certificate automatically
      if (result.certificate) {
        const blob = new Blob([result.certificate], { type: 'application/x-pem-file' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `certificate-${result.id}.pem`;
        a.click();
        URL.revokeObjectURL(url);
      }
    },
  });

  const createTokenMutation = useMutation({
    mutationFn: async (data: CreateTokenData) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return { id: 'new_token', token: 'exp_live_xxxxxxxxxxxx', ...data };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'tokens'] });
      setShowCreateTokenModal(false);
    },
  });

  const createCAMutation = useMutation({
    mutationFn: async (data: CreateCAData) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return { id: 'new_ca', ...data };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'certificates'] });
      setShowCreateCAModal(false);
    },
  });

  const updateAuthConfigMutation = useMutation({
    mutationFn: async (config: Partial<AuthConfig>) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'auth'] });
    },
  });

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-green-500/10 text-green-500',
      revoked: 'bg-red-500/10 text-red-500',
      expired: 'bg-gray-500/10 text-gray-500',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.active}`}>
        {status}
      </span>
    );
  };

  const getTypeBadge = (type: string) => {
    const styles: Record<string, string> = {
      root: 'bg-purple-500/10 text-purple-500',
      intermediate: 'bg-violet-500/10 text-violet-500',
      server: 'bg-blue-500/10 text-blue-500',
      client: 'bg-cyan-500/10 text-cyan-500',
      code_signing: 'bg-orange-500/10 text-orange-500',
      api_key: 'bg-emerald-500/10 text-emerald-500',
      access_token: 'bg-sky-500/10 text-sky-500',
      refresh_token: 'bg-indigo-500/10 text-indigo-500',
      service_token: 'bg-amber-500/10 text-amber-500',
    };
    const labels: Record<string, string> = {
      code_signing: 'code signing',
      api_key: 'API key',
      access_token: 'access',
      refresh_token: 'refresh',
      service_token: 'service',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[type] || styles.client}`}>
        {labels[type] || type}
      </span>
    );
  };

  const daysUntilExpiry = (notAfter: string) => {
    const expiry = new Date(notAfter);
    const now = new Date();
    const diff = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  if (statsLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-48 bg-surface rounded" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-surface rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Security & Authentication</h1>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 bg-surface border border-border rounded-lg w-fit">
        {(['certificates', 'tokens', 'auth'] as AdminTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab
                ? 'bg-accent text-text-inverse'
                : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
            }`}
          >
            {tab === 'certificates' && 'Certificates'}
            {tab === 'tokens' && 'Tokens'}
            {tab === 'auth' && 'Auth Settings'}
          </button>
        ))}
      </div>

      {/* Certificates Tab */}
      {activeTab === 'certificates' && (
        <CertificatesTab
          stats={stats}
          caCerts={caCerts}
          certificates={certificates}
          issuers={issuers}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          selectedCert={selectedCert}
          setSelectedCert={setSelectedCert}
          showCreateCertModal={showCreateCertModal}
          setShowCreateCertModal={setShowCreateCertModal}
          showCreateCAModal={showCreateCAModal}
          setShowCreateCAModal={setShowCreateCAModal}
          revokeMutation={revokeCertMutation}
          createCertMutation={createCertMutation}
          createCAMutation={createCAMutation}
          getStatusBadge={getStatusBadge}
          getTypeBadge={getTypeBadge}
          daysUntilExpiry={daysUntilExpiry}
          selectedCertIds={selectedCertIds}
          setSelectedCertIds={setSelectedCertIds}
          showBatchRevokeModal={showBatchRevokeModal}
          setShowBatchRevokeModal={setShowBatchRevokeModal}
          showBatchDownloadModal={showBatchDownloadModal}
          setShowBatchDownloadModal={setShowBatchDownloadModal}
          showBatchCreateModal={showBatchCreateModal}
          setShowBatchCreateModal={setShowBatchCreateModal}
          batchRevokeMutation={batchRevokeMutation}
          batchDownloadMutation={batchDownloadMutation}
          batchIssueMutation={batchIssueMutation}
        />
      )}

      {/* Tokens Tab */}
      {activeTab === 'tokens' && (
        <TokensTab
          stats={stats}
          tokens={tokens}
          tokenTypeFilter={tokenTypeFilter}
          setTokenTypeFilter={setTokenTypeFilter}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          selectedToken={selectedToken}
          setSelectedToken={setSelectedToken}
          showCreateTokenModal={showCreateTokenModal}
          setShowCreateTokenModal={setShowCreateTokenModal}
          revokeMutation={revokeTokenMutation}
          createTokenMutation={createTokenMutation}
          getStatusBadge={getStatusBadge}
          getTypeBadge={getTypeBadge}
          daysUntilExpiry={daysUntilExpiry}
        />
      )}

      {/* Auth Settings Tab */}
      {activeTab === 'auth' && (
        <AuthSettingsTab
          authConfig={authConfig}
          caCerts={caCerts}
          updateMutation={updateAuthConfigMutation}
        />
      )}
    </div>
  );
}

// ============================================================================
// Certificates Tab Component
// ============================================================================

interface CertificatesTabProps {
  stats: any;
  caCerts?: RootCertificate[];
  certificates?: Certificate[];
  issuers?: Array<{ id: string; subject: string; type: 'root' | 'intermediate' }>;
  statusFilter: CertStatus;
  setStatusFilter: (s: CertStatus) => void;
  typeFilter: CertType;
  setTypeFilter: (t: CertType) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedCert: Certificate | null;
  setSelectedCert: (c: Certificate | null) => void;
  showCreateCertModal: boolean;
  setShowCreateCertModal: (v: boolean) => void;
  showCreateCAModal: boolean;
  setShowCreateCAModal: (v: boolean) => void;
  revokeMutation: any;
  createCertMutation: any;
  createCAMutation: any;
  getStatusBadge: (s: string) => JSX.Element;
  getTypeBadge: (t: string) => JSX.Element;
  daysUntilExpiry: (d: string) => number;
  // Batch operations
  selectedCertIds: string[];
  setSelectedCertIds: (ids: string[]) => void;
  showBatchRevokeModal: boolean;
  setShowBatchRevokeModal: (v: boolean) => void;
  showBatchDownloadModal: boolean;
  setShowBatchDownloadModal: (v: boolean) => void;
  showBatchCreateModal: boolean;
  setShowBatchCreateModal: (v: boolean) => void;
  batchRevokeMutation: any;
  batchDownloadMutation: any;
  batchIssueMutation: any;
}

function CertificatesTab({
  stats,
  caCerts,
  certificates,
  issuers,
  statusFilter,
  setStatusFilter,
  typeFilter,
  setTypeFilter,
  searchQuery,
  setSearchQuery,
  selectedCert,
  setSelectedCert,
  showCreateCertModal,
  setShowCreateCertModal,
  showCreateCAModal,
  setShowCreateCAModal,
  revokeMutation,
  createCertMutation,
  createCAMutation,
  getStatusBadge,
  getTypeBadge,
  daysUntilExpiry,
  selectedCertIds,
  setSelectedCertIds,
  showBatchRevokeModal,
  setShowBatchRevokeModal,
  showBatchDownloadModal,
  setShowBatchDownloadModal,
  showBatchCreateModal,
  setShowBatchCreateModal,
  batchRevokeMutation,
  batchDownloadMutation,
  batchIssueMutation,
}: CertificatesTabProps) {
  const toggleCertSelection = (id: string) => {
    setSelectedCertIds(
      selectedCertIds.includes(id)
        ? selectedCertIds.filter((i) => i !== id)
        : [...selectedCertIds, id]
    );
  };

  const toggleAllCerts = () => {
    if (certificates && selectedCertIds.length === certificates.length) {
      setSelectedCertIds([]);
    } else if (certificates) {
      setSelectedCertIds(certificates.map((c) => c.id));
    }
  };
  return (
    <>
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard
          label="Total Certificates"
          value={formatCount(stats?.totalCertificates || 0)}
          icon={CertIcon}
        />
        <StatCard
          label="Active"
          value={formatCount(stats?.activeCertificates || 0)}
          icon={CheckIcon}
          color="green"
        />
        <StatCard
          label="Revoked"
          value={formatCount(stats?.revokedCertificates || 0)}
          icon={RevokedIcon}
          color="red"
        />
        <StatCard
          label="Expiring Soon"
          value={(stats?.expiringIn30Days || 0).toString()}
          icon={WarningIcon}
          highlight
        />
      </div>

      {/* Certificate Authorities */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-primary">Certificate Authorities</h2>
          <button
            onClick={() => setShowCreateCAModal(true)}
            className="px-3 py-1.5 bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 rounded-lg text-sm font-medium transition-colors"
          >
            Create Intermediate CA
          </button>
        </div>
        <div className="space-y-3">
          {caCerts?.map((ca) => (
            <div key={ca.id} className="flex items-center justify-between p-4 bg-surface-hover rounded-lg">
              <div className="flex items-center gap-4">
                <div className={`p-2 rounded-lg ${ca.certType === 'root' ? 'bg-purple-500/10' : 'bg-violet-500/10'}`}>
                  {ca.certType === 'root' ? (
                    <RootCertIcon className="w-6 h-6 text-purple-500" />
                  ) : (
                    <IntermediateIcon className="w-6 h-6 text-violet-500" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-text-primary">{ca.commonName}</p>
                    {getTypeBadge(ca.certType)}
                  </div>
                  <p className="text-xs text-text-muted font-mono">{ca.fingerprint}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm text-text-primary">{ca.issuedCount} issued</p>
                  <p className="text-xs text-text-muted">
                    Expires: {new Date(ca.notAfter).toLocaleDateString()}
                  </p>
                </div>
                {getStatusBadge(ca.status)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-4">
          <input
            type="text"
            placeholder="Search certificates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as CertStatus)}
            className="px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="revoked">Revoked</option>
            <option value="expired">Expired</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as CertType)}
            className="px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
          >
            <option value="all">All Types</option>
            <option value="client">Client</option>
            <option value="server">Server</option>
            <option value="code_signing">Code Signing</option>
            <option value="intermediate">Intermediate CA</option>
          </select>
        </div>
        <div className="flex gap-2">
          {selectedCertIds.length > 0 && (
            <>
              <button
                onClick={() => setShowBatchDownloadModal(true)}
                className="px-3 py-2 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 rounded-lg text-sm font-medium transition-colors"
              >
                Download ({selectedCertIds.length})
              </button>
              <button
                onClick={() => setShowBatchRevokeModal(true)}
                className="px-3 py-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg text-sm font-medium transition-colors"
              >
                Revoke ({selectedCertIds.length})
              </button>
            </>
          )}
          <button
            onClick={() => setShowBatchCreateModal(true)}
            className="px-3 py-2 bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 rounded-lg text-sm font-medium transition-colors"
          >
            Batch Issue
          </button>
          <button
            onClick={() => setShowCreateCertModal(true)}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
          >
            Issue Certificate
          </button>
        </div>
      </div>

      {/* Certificates Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Entity Certificates</h2>
          {selectedCertIds.length > 0 && (
            <span className="text-sm text-text-muted">{selectedCertIds.length} selected</span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface-hover">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={certificates ? selectedCertIds.length === certificates.length && certificates.length > 0 : false}
                    onChange={toggleAllCerts}
                    className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Common Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Serial</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Expires</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {certificates?.map((cert) => {
                const days = daysUntilExpiry(cert.notAfter);
                return (
                  <tr key={cert.id} className={`hover:bg-surface-hover ${selectedCertIds.includes(cert.id) ? 'bg-accent/5' : ''}`}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedCertIds.includes(cert.id)}
                        onChange={() => toggleCertSelection(cert.id)}
                        className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-text-primary">{cert.commonName}</p>
                      <p className="text-xs text-text-muted font-mono">{cert.fingerprint}</p>
                    </td>
                    <td className="px-4 py-3">{getTypeBadge(cert.certType)}</td>
                    <td className="px-4 py-3 text-sm font-mono text-text-muted">{cert.serialNumber}</td>
                    <td className="px-4 py-3">{getStatusBadge(cert.status)}</td>
                    <td className="px-4 py-3">
                      <p className={`text-sm ${days < 7 ? 'text-red-500' : days < 30 ? 'text-yellow-500' : 'text-text-muted'}`}>
                        {days > 0 ? `${days} days` : 'Expired'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSelectedCert(cert)}
                          className="text-accent hover:underline text-sm"
                        >
                          View
                        </button>
                        {cert.status === 'active' && (
                          <button
                            onClick={() => setSelectedCert(cert)}
                            className="text-red-500 hover:underline text-sm"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Certificate Detail Modal */}
      {selectedCert && (
        <CertificateDetailModal
          cert={selectedCert}
          onClose={() => setSelectedCert(null)}
          onRevoke={() => revokeMutation.mutate(selectedCert.id)}
          isPending={revokeMutation.isPending}
          getTypeBadge={getTypeBadge}
          getStatusBadge={getStatusBadge}
        />
      )}

      {/* Create Certificate Modal */}
      {showCreateCertModal && (
        <CreateCertificateModal
          onClose={() => setShowCreateCertModal(false)}
          onSubmit={(data) => createCertMutation.mutate(data)}
          isPending={createCertMutation.isPending}
          issuers={issuers}
        />
      )}

      {/* Create CA Modal */}
      {showCreateCAModal && (
        <CreateCAModal
          onClose={() => setShowCreateCAModal(false)}
          onSubmit={(data) => createCAMutation.mutate(data)}
          isPending={createCAMutation.isPending}
          rootCAs={caCerts?.filter((c) => c.certType === 'root')}
        />
      )}

      {/* Batch Revoke Modal */}
      {showBatchRevokeModal && (
        <BatchRevokeModal
          count={selectedCertIds.length}
          onClose={() => setShowBatchRevokeModal(false)}
          onSubmit={(reason) => batchRevokeMutation.mutate({ ids: selectedCertIds, reason })}
          isPending={batchRevokeMutation.isPending}
        />
      )}

      {/* Batch Download Modal */}
      {showBatchDownloadModal && (
        <BatchDownloadModal
          count={selectedCertIds.length}
          onClose={() => setShowBatchDownloadModal(false)}
          onSubmit={(format, includePrivateKey, password) =>
            batchDownloadMutation.mutate({ ids: selectedCertIds, format, includePrivateKey, password })
          }
          isPending={batchDownloadMutation.isPending}
        />
      )}

      {/* Batch Create Modal */}
      {showBatchCreateModal && (
        <BatchCreateModal
          onClose={() => setShowBatchCreateModal(false)}
          onSubmit={(certificates, issuerId, certType, validityDays) =>
            batchIssueMutation.mutate({ certificates, issuerId, certType, validityDays })
          }
          isPending={batchIssueMutation.isPending}
          caCerts={caCerts}
        />
      )}
    </>
  );
}

// ============================================================================
// Tokens Tab Component
// ============================================================================

interface TokensTabProps {
  stats: any;
  tokens?: Token[];
  tokenTypeFilter: TokenType;
  setTokenTypeFilter: (t: TokenType) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedToken: Token | null;
  setSelectedToken: (t: Token | null) => void;
  showCreateTokenModal: boolean;
  setShowCreateTokenModal: (v: boolean) => void;
  revokeMutation: any;
  createTokenMutation: any;
  getStatusBadge: (s: string) => JSX.Element;
  getTypeBadge: (t: string) => JSX.Element;
  daysUntilExpiry: (d: string) => number;
}

function TokensTab({
  stats,
  tokens,
  tokenTypeFilter,
  setTokenTypeFilter,
  searchQuery,
  setSearchQuery,
  selectedToken,
  setSelectedToken,
  showCreateTokenModal,
  setShowCreateTokenModal,
  revokeMutation,
  createTokenMutation,
  getStatusBadge,
  getTypeBadge,
  daysUntilExpiry,
}: TokensTabProps) {
  return (
    <>
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard
          label="Total Tokens"
          value={formatCount(stats?.totalTokens || 0)}
          icon={KeyIcon}
        />
        <StatCard
          label="Active Tokens"
          value={formatCount(stats?.activeTokens || 0)}
          icon={CheckIcon}
          color="green"
        />
        <StatCard
          label="Single-Use"
          value={formatCount(stats?.singleUseTokens || 0)}
          icon={OneTimeIcon}
        />
        <StatCard
          label="Time-Limited"
          value="23"
          icon={ClockIcon}
        />
      </div>

      {/* Tokenization Info */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Token Constraints</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-4 bg-surface-hover rounded-lg">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <ClockIcon className="w-5 h-5 text-blue-500" />
              </div>
              <h3 className="font-medium text-text-primary">Time-Based Expiry</h3>
            </div>
            <p className="text-sm text-text-muted mb-3">
              Tokens automatically expire after a set duration. Configure per-token or use defaults.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="px-2 py-1 bg-surface rounded text-xs text-text-muted">1 hour</span>
              <span className="px-2 py-1 bg-surface rounded text-xs text-text-muted">24 hours</span>
              <span className="px-2 py-1 bg-surface rounded text-xs text-text-muted">7 days</span>
              <span className="px-2 py-1 bg-surface rounded text-xs text-text-muted">30 days</span>
              <span className="px-2 py-1 bg-surface rounded text-xs text-text-muted">1 year</span>
              <span className="px-2 py-1 bg-surface rounded text-xs text-text-muted">Never</span>
            </div>
          </div>
          <div className="p-4 bg-surface-hover rounded-lg">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <CounterIcon className="w-5 h-5 text-orange-500" />
              </div>
              <h3 className="font-medium text-text-primary">Use-Based Limits</h3>
            </div>
            <p className="text-sm text-text-muted mb-3">
              Tokens can be limited by number of uses. Perfect for one-time actions or batched operations.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="px-2 py-1 bg-surface rounded text-xs text-text-muted">Single-use</span>
              <span className="px-2 py-1 bg-surface rounded text-xs text-text-muted">10 uses</span>
              <span className="px-2 py-1 bg-surface rounded text-xs text-text-muted">100 uses</span>
              <span className="px-2 py-1 bg-surface rounded text-xs text-text-muted">1000 uses</span>
              <span className="px-2 py-1 bg-surface rounded text-xs text-text-muted">Unlimited</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-4">
          <input
            type="text"
            placeholder="Search tokens..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
          <select
            value={tokenTypeFilter}
            onChange={(e) => setTokenTypeFilter(e.target.value as TokenType)}
            className="px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
          >
            <option value="all">All Types</option>
            <option value="api_key">API Key</option>
            <option value="access_token">Access Token</option>
            <option value="refresh_token">Refresh Token</option>
            <option value="service_token">Service Token</option>
          </select>
        </div>
        <button
          onClick={() => setShowCreateTokenModal(true)}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
        >
          Create Token
        </button>
      </div>

      {/* Tokens Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Tokens</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface-hover">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Scopes</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Constraints</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tokens?.map((token) => (
                <tr key={token.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-text-primary">{token.name}</p>
                    <p className="text-xs text-text-muted font-mono">{token.prefix}...</p>
                  </td>
                  <td className="px-4 py-3">{getTypeBadge(token.type)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {token.scopes.slice(0, 3).map((scope) => (
                        <span key={scope} className="px-1.5 py-0.5 bg-surface-hover rounded text-xs text-text-muted">
                          {scope}
                        </span>
                      ))}
                      {token.scopes.length > 3 && (
                        <span className="px-1.5 py-0.5 bg-surface-hover rounded text-xs text-text-muted">
                          +{token.scopes.length - 3}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {token.expiresAt && (
                        <span className={`text-xs ${daysUntilExpiry(token.expiresAt) < 7 ? 'text-yellow-500' : 'text-text-muted'}`}>
                          Expires: {new Date(token.expiresAt).toLocaleDateString()}
                        </span>
                      )}
                      {token.maxUses && (
                        <span className={`text-xs ${token.usesRemaining === 0 ? 'text-red-500' : 'text-text-muted'}`}>
                          {token.usesRemaining}/{token.maxUses} uses left
                        </span>
                      )}
                      {!token.expiresAt && !token.maxUses && (
                        <span className="text-xs text-text-muted">No limits</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">{getStatusBadge(token.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedToken(token)}
                        className="text-accent hover:underline text-sm"
                      >
                        View
                      </button>
                      {token.status === 'active' && (
                        <button
                          onClick={() => revokeMutation.mutate(token.id)}
                          className="text-red-500 hover:underline text-sm"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Token Detail Modal */}
      {selectedToken && (
        <TokenDetailModal
          token={selectedToken}
          onClose={() => setSelectedToken(null)}
          onRevoke={() => revokeMutation.mutate(selectedToken.id)}
          isPending={revokeMutation.isPending}
          getTypeBadge={getTypeBadge}
          getStatusBadge={getStatusBadge}
        />
      )}

      {/* Create Token Modal */}
      {showCreateTokenModal && (
        <CreateTokenModal
          onClose={() => setShowCreateTokenModal(false)}
          onSubmit={(data) => createTokenMutation.mutate(data)}
          isPending={createTokenMutation.isPending}
        />
      )}
    </>
  );
}

// ============================================================================
// Auth Settings Tab Component
// ============================================================================

interface AuthSettingsTabProps {
  authConfig?: AuthConfig;
  caCerts?: RootCertificate[];
  updateMutation: any;
}

function AuthSettingsTab({ authConfig, caCerts, updateMutation }: AuthSettingsTabProps) {
  const [jwtAlgorithm, setJwtAlgorithm] = useState(authConfig?.jwt.algorithm || 'RS256');
  const [accessExpiry, setAccessExpiry] = useState(authConfig?.jwt.accessTokenExpiry || 3600);
  const [refreshExpiry, setRefreshExpiry] = useState(authConfig?.jwt.refreshTokenExpiry || 2592000);
  const [apiKeysEnabled, setApiKeysEnabled] = useState(authConfig?.apiKeys.enabled ?? true);
  const [apiKeyPrefix, setApiKeyPrefix] = useState(authConfig?.apiKeys.prefix || 'exp_');
  const [apiKeyDefaultExpiry, setApiKeyDefaultExpiry] = useState(authConfig?.apiKeys.defaultExpiry || 365);
  const [rateLimitEnabled, setRateLimitEnabled] = useState(authConfig?.rateLimiting.enabled ?? true);
  const [rpmLimit, setRpmLimit] = useState(authConfig?.rateLimiting.requestsPerMinute || 60);
  const [rphLimit, setRphLimit] = useState(authConfig?.rateLimiting.requestsPerHour || 1000);
  const [mtlsEnabled, setMtlsEnabled] = useState(authConfig?.mtls.enabled ?? false);
  const [requireClientCert, setRequireClientCert] = useState(authConfig?.mtls.requireClientCert ?? false);

  const handleSave = () => {
    updateMutation.mutate({
      jwt: {
        algorithm: jwtAlgorithm,
        accessTokenExpiry: accessExpiry,
        refreshTokenExpiry: refreshExpiry,
        issuer: authConfig?.jwt.issuer || '',
        audience: authConfig?.jwt.audience || '',
      },
      apiKeys: {
        enabled: apiKeysEnabled,
        prefix: apiKeyPrefix,
        hashAlgorithm: authConfig?.apiKeys.hashAlgorithm || 'sha256',
        defaultExpiry: apiKeyDefaultExpiry,
      },
      rateLimiting: {
        enabled: rateLimitEnabled,
        requestsPerMinute: rpmLimit,
        requestsPerHour: rphLimit,
      },
      mtls: {
        enabled: mtlsEnabled,
        requireClientCert,
        allowedCAs: authConfig?.mtls.allowedCAs || [],
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* JWT Configuration */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">JWT Configuration</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-text-muted mb-2">Signing Algorithm</label>
            <select
              value={jwtAlgorithm}
              onChange={(e) => setJwtAlgorithm(e.target.value as AuthConfig['jwt']['algorithm'])}
              className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
            >
              <optgroup label="HMAC">
                <option value="HS256">HS256 (HMAC-SHA256)</option>
                <option value="HS384">HS384 (HMAC-SHA384)</option>
                <option value="HS512">HS512 (HMAC-SHA512)</option>
              </optgroup>
              <optgroup label="RSA">
                <option value="RS256">RS256 (RSA-SHA256)</option>
                <option value="RS384">RS384 (RSA-SHA384)</option>
                <option value="RS512">RS512 (RSA-SHA512)</option>
              </optgroup>
              <optgroup label="ECDSA">
                <option value="ES256">ES256 (ECDSA-P256)</option>
                <option value="ES384">ES384 (ECDSA-P384)</option>
                <option value="ES512">ES512 (ECDSA-P521)</option>
              </optgroup>
            </select>
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-2">Issuer</label>
            <input
              type="text"
              value={authConfig?.jwt.issuer || ''}
              disabled
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-muted"
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-2">Access Token Expiry</label>
            <select
              value={accessExpiry}
              onChange={(e) => setAccessExpiry(Number(e.target.value))}
              className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
            >
              <option value={900}>15 minutes</option>
              <option value={1800}>30 minutes</option>
              <option value={3600}>1 hour</option>
              <option value={7200}>2 hours</option>
              <option value={86400}>24 hours</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-2">Refresh Token Expiry</label>
            <select
              value={refreshExpiry}
              onChange={(e) => setRefreshExpiry(Number(e.target.value))}
              className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
            >
              <option value={604800}>7 days</option>
              <option value={1209600}>14 days</option>
              <option value={2592000}>30 days</option>
              <option value={7776000}>90 days</option>
              <option value={31536000}>1 year</option>
            </select>
          </div>
        </div>
      </div>

      {/* API Key Configuration */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-primary">API Key Configuration</h2>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={apiKeysEnabled}
              onChange={(e) => setApiKeysEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
            />
            <span className="text-sm text-text-muted">Enable API Keys</span>
          </label>
        </div>
        {apiKeysEnabled && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm text-text-muted mb-2">Key Prefix</label>
              <input
                type="text"
                value={apiKeyPrefix}
                onChange={(e) => setApiKeyPrefix(e.target.value)}
                className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm text-text-muted mb-2">Hash Algorithm</label>
              <select
                value={authConfig?.apiKeys.hashAlgorithm || 'sha256'}
                disabled
                className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-muted"
              >
                <option value="sha256">SHA-256</option>
                <option value="sha384">SHA-384</option>
                <option value="sha512">SHA-512</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-text-muted mb-2">Default Expiry (days)</label>
              <select
                value={apiKeyDefaultExpiry}
                onChange={(e) => setApiKeyDefaultExpiry(Number(e.target.value))}
                className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
              >
                <option value={0}>Never expires</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={180}>180 days</option>
                <option value={365}>1 year</option>
                <option value={730}>2 years</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Rate Limiting */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-primary">Rate Limiting</h2>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={rateLimitEnabled}
              onChange={(e) => setRateLimitEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
            />
            <span className="text-sm text-text-muted">Enable Rate Limiting</span>
          </label>
        </div>
        {rateLimitEnabled && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm text-text-muted mb-2">Requests per Minute</label>
              <input
                type="number"
                value={rpmLimit}
                onChange={(e) => setRpmLimit(Number(e.target.value))}
                className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm text-text-muted mb-2">Requests per Hour</label>
              <input
                type="number"
                value={rphLimit}
                onChange={(e) => setRphLimit(Number(e.target.value))}
                className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
          </div>
        )}
      </div>

      {/* mTLS Configuration */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-primary">Mutual TLS (mTLS)</h2>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={mtlsEnabled}
              onChange={(e) => setMtlsEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
            />
            <span className="text-sm text-text-muted">Enable mTLS</span>
          </label>
        </div>
        {mtlsEnabled && (
          <div className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={requireClientCert}
                onChange={(e) => setRequireClientCert(e.target.checked)}
                className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
              />
              <span className="text-sm text-text-primary">Require client certificate for all requests</span>
            </label>
            <div>
              <label className="block text-sm text-text-muted mb-2">Allowed Certificate Authorities</label>
              <div className="space-y-2">
                {caCerts?.map((ca) => (
                  <label key={ca.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      defaultChecked={authConfig?.mtls.allowedCAs.includes(ca.id)}
                      className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                    />
                    <span className="text-sm text-text-primary">{ca.commonName}</span>
                    <span className="text-xs text-text-muted">({ca.certType})</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="px-6 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
        >
          {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Modal Components
// ============================================================================

interface CreateCertData {
  commonName: string;
  certType: 'client' | 'server' | 'code_signing';
  validity: number;
  issuerId: string;
  organization?: string;
  organizationalUnit?: string;
  country?: string;
  state?: string;
  locality?: string;
  subjectAltNames?: string[];
  keySize: 2048 | 4096;
  algorithm: 'RSA' | 'ECDSA';
  keyUsage: string[];
  extendedKeyUsage: string[];
}

function CreateCertificateModal({
  onClose,
  onSubmit,
  isPending,
  issuers,
}: {
  onClose: () => void;
  onSubmit: (data: CreateCertData) => void;
  isPending: boolean;
  issuers?: Array<{ id: string; subject: string; type: 'root' | 'intermediate' }>;
}) {
  const [commonName, setCommonName] = useState('');
  const [certType, setCertType] = useState<'client' | 'server' | 'code_signing'>('client');
  const [validity, setValidity] = useState(365);
  const [issuerId, setIssuerId] = useState(issuers?.[0]?.id || '');
  const [organization, setOrganization] = useState('');
  const [organizationalUnit, setOrganizationalUnit] = useState('');
  const [country, setCountry] = useState('');
  const [state, setState] = useState('');
  const [locality, setLocality] = useState('');
  const [subjectAltNames, setSubjectAltNames] = useState<string[]>([]);
  const [sanInput, setSanInput] = useState('');
  const [keySize, setKeySize] = useState<2048 | 4096>(2048);
  const [algorithm, setAlgorithm] = useState<'RSA' | 'ECDSA'>('RSA');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const getKeyUsageDefaults = (type: string) => {
    switch (type) {
      case 'client':
        return { keyUsage: ['digitalSignature', 'keyAgreement'], extendedKeyUsage: ['clientAuth'] };
      case 'server':
        return { keyUsage: ['digitalSignature', 'keyEncipherment'], extendedKeyUsage: ['serverAuth'] };
      case 'code_signing':
        return { keyUsage: ['digitalSignature'], extendedKeyUsage: ['codeSigning'] };
      default:
        return { keyUsage: [], extendedKeyUsage: [] };
    }
  };

  const addSAN = () => {
    if (sanInput.trim() && !subjectAltNames.includes(sanInput.trim())) {
      setSubjectAltNames([...subjectAltNames, sanInput.trim()]);
      setSanInput('');
    }
  };

  const removeSAN = (san: string) => {
    setSubjectAltNames(subjectAltNames.filter(s => s !== san));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text-primary">Issue New Certificate</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const { keyUsage, extendedKeyUsage } = getKeyUsageDefaults(certType);
            onSubmit({
              commonName,
              certType,
              validity,
              issuerId,
              organization: organization || undefined,
              organizationalUnit: organizationalUnit || undefined,
              country: country || undefined,
              state: state || undefined,
              locality: locality || undefined,
              subjectAltNames: subjectAltNames.length > 0 ? subjectAltNames : undefined,
              keySize,
              algorithm,
              keyUsage,
              extendedKeyUsage,
            });
          }}
          className="space-y-4"
        >
          {/* Certificate Type */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">Certificate Type</label>
            <select
              value={certType}
              onChange={(e) => setCertType(e.target.value as 'client' | 'server' | 'code_signing')}
              className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
            >
              <option value="client">Client Certificate</option>
              <option value="server">Server Certificate</option>
              <option value="code_signing">Code Signing Certificate</option>
            </select>
          </div>

          {/* Subject Information */}
          <div className="space-y-3 border border-border rounded-lg p-4">
            <h4 className="text-sm font-medium text-text-primary">Subject Information</h4>

            <div>
              <label className="block text-sm text-text-muted mb-1">Common Name (CN) *</label>
              <input
                type="text"
                value={commonName}
                onChange={(e) => setCommonName(e.target.value)}
                placeholder={
                  certType === 'client'
                    ? 'e.g., user@example.com or did:web:user.exprsn.io'
                    : certType === 'server'
                    ? 'e.g., api.exprsn.io'
                    : 'e.g., Exprsn Mobile App v2.1'
                }
                className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-text-muted mb-1">Organization (O)</label>
                <input
                  type="text"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  placeholder="e.g., Exprsn Inc"
                  className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-sm text-text-muted mb-1">Organizational Unit (OU)</label>
                <input
                  type="text"
                  value={organizationalUnit}
                  onChange={(e) => setOrganizationalUnit(e.target.value)}
                  placeholder="e.g., Engineering"
                  className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm text-text-muted mb-1">Country (C)</label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="US"
                  maxLength={2}
                  className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-sm text-text-muted mb-1">State/Province (ST)</label>
                <input
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="California"
                  className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-sm text-text-muted mb-1">City/Locality (L)</label>
                <input
                  type="text"
                  value={locality}
                  onChange={(e) => setLocality(e.target.value)}
                  placeholder="San Francisco"
                  className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                />
              </div>
            </div>
          </div>

          {/* Subject Alternative Names */}
          {certType === 'server' && (
            <div className="space-y-2 border border-border rounded-lg p-4">
              <h4 className="text-sm font-medium text-text-primary">Subject Alternative Names (SAN)</h4>
              <p className="text-xs text-text-muted">Additional domains or IPs for this certificate</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={sanInput}
                  onChange={(e) => setSanInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSAN())}
                  placeholder="e.g., DNS:*.exprsn.io or IP:192.168.1.1"
                  className="flex-1 px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={addSAN}
                  className="px-4 py-2 bg-accent/10 text-accent hover:bg-accent/20 rounded-lg transition-colors"
                >
                  Add
                </button>
              </div>
              {subjectAltNames.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {subjectAltNames.map((san) => (
                    <span key={san} className="px-2 py-1 bg-surface-hover rounded text-xs text-text-primary flex items-center gap-1">
                      {san}
                      <button type="button" onClick={() => removeSAN(san)} className="text-red-500 hover:text-red-400">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Certificate Settings */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-text-muted mb-1">Issuing CA</label>
              <select
                value={issuerId}
                onChange={(e) => setIssuerId(e.target.value)}
                className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
                required
              >
                {issuers?.map((issuer) => (
                  <option key={issuer.id} value={issuer.id}>
                    {issuer.subject} ({issuer.type})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-text-muted mb-1">Validity Period</label>
              <select
                value={validity}
                onChange={(e) => setValidity(Number(e.target.value))}
                className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
              >
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={180}>180 days</option>
                <option value={365}>1 year</option>
                <option value={730}>2 years</option>
                {certType === 'code_signing' && <option value={1095}>3 years</option>}
              </select>
            </div>
          </div>

          {/* Advanced Settings */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-sm text-accent hover:underline"
            >
              {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
            </button>
          </div>

          {showAdvanced && (
            <div className="space-y-3 border border-border rounded-lg p-4">
              <h4 className="text-sm font-medium text-text-primary">Cryptographic Settings</h4>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-text-muted mb-1">Algorithm</label>
                  <select
                    value={algorithm}
                    onChange={(e) => setAlgorithm(e.target.value as 'RSA' | 'ECDSA')}
                    className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
                  >
                    <option value="RSA">RSA</option>
                    <option value="ECDSA">ECDSA</option>
                  </select>
                </div>
                {algorithm === 'RSA' && (
                  <div>
                    <label className="block text-sm text-text-muted mb-1">Key Size</label>
                    <select
                      value={keySize}
                      onChange={(e) => setKeySize(Number(e.target.value) as 2048 | 4096)}
                      className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
                    >
                      <option value={2048}>2048 bits</option>
                      <option value={4096}>4096 bits</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div>
                  <p className="text-xs text-text-muted mb-1">Key Usage:</p>
                  <div className="flex flex-wrap gap-1">
                    {getKeyUsageDefaults(certType).keyUsage.map((usage) => (
                      <span key={usage} className="px-2 py-0.5 bg-accent/10 text-accent rounded text-xs">
                        {usage}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-text-muted mb-1">Extended Key Usage:</p>
                  <div className="flex flex-wrap gap-1">
                    {getKeyUsageDefaults(certType).extendedKeyUsage.map((usage) => (
                      <span key={usage} className="px-2 py-0.5 bg-accent/10 text-accent rounded text-xs">
                        {usage}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-surface-hover border border-border text-text-primary rounded-lg transition-colors hover:bg-surface"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !commonName || !issuerId}
              className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? 'Issuing Certificate...' : 'Issue Certificate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface CreateCAData {
  commonName: string;
  parentId: string;
  validity: number;
  pathLength: number;
}

function CreateCAModal({
  onClose,
  onSubmit,
  isPending,
  rootCAs,
}: {
  onClose: () => void;
  onSubmit: (data: CreateCAData) => void;
  isPending: boolean;
  rootCAs?: RootCertificate[];
}) {
  const [commonName, setCommonName] = useState('');
  const [parentId, setParentId] = useState(rootCAs?.[0]?.id || '');
  const [validity, setValidity] = useState(1825); // 5 years
  const [pathLength, setPathLength] = useState(0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text-primary">Create Intermediate CA</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ commonName, parentId, validity, pathLength });
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm text-text-muted mb-1">Common Name</label>
            <input
              type="text"
              value={commonName}
              onChange={(e) => setCommonName(e.target.value)}
              placeholder="e.g., Exprsn Services CA"
              className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Parent CA</label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
            >
              {rootCAs?.map((ca) => (
                <option key={ca.id} value={ca.id}>
                  {ca.commonName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Validity Period</label>
            <select
              value={validity}
              onChange={(e) => setValidity(Number(e.target.value))}
              className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
            >
              <option value={1095}>3 years</option>
              <option value={1825}>5 years</option>
              <option value={3650}>10 years</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Path Length Constraint</label>
            <select
              value={pathLength}
              onChange={(e) => setPathLength(Number(e.target.value))}
              className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
            >
              <option value={0}>0 (can only issue end-entity certs)</option>
              <option value={1}>1 (can issue one level of sub-CAs)</option>
              <option value={2}>2 (can issue two levels of sub-CAs)</option>
            </select>
            <p className="text-xs text-text-muted mt-1">
              Limits how many additional CA certificates can be chained below this one.
            </p>
          </div>
          <button
            type="submit"
            disabled={isPending || !commonName}
            className="w-full px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {isPending ? 'Creating...' : 'Create Intermediate CA'}
          </button>
        </form>
      </div>
    </div>
  );
}

type TimeUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';

interface CreateTokenData {
  name: string;
  type: 'api_key' | 'access_token' | 'service_token';
  scopes: string[];
  expiryType: 'never' | 'time' | 'uses' | 'both';
  expiryValue?: number;
  expiryUnit?: TimeUnit;
  maxUses?: number;
  description?: string;
}

function CreateTokenModal({
  onClose,
  onSubmit,
  isPending,
}: {
  onClose: () => void;
  onSubmit: (data: CreateTokenData) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState('');
  const [tokenType, setTokenType] = useState<'api_key' | 'access_token' | 'service_token'>('api_key');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['read']);
  const [expiryType, setExpiryType] = useState<'never' | 'time' | 'uses' | 'both'>('never');
  const [description, setDescription] = useState('');

  // Custom time-based expiry
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [customTimeValue, setCustomTimeValue] = useState(30);
  const [customTimeUnit, setCustomTimeUnit] = useState<TimeUnit>('days');
  const [presetTimeValue, setPresetTimeValue] = useState(30);

  // Custom use-based expiry
  const [useCustomUses, setUseCustomUses] = useState(false);
  const [customUsesValue, setCustomUsesValue] = useState(100);
  const [presetUsesValue, setPresetUsesValue] = useState(100);

  const availableScopes = ['read', 'write', 'admin', 'deploy', 'build', 'import', 'export', 'setup'];

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data: CreateTokenData = {
      name,
      type: tokenType,
      scopes: selectedScopes,
      expiryType,
      description: description || undefined,
    };

    if (expiryType === 'time' || expiryType === 'both') {
      if (useCustomTime) {
        data.expiryValue = customTimeValue;
        data.expiryUnit = customTimeUnit;
      } else {
        data.expiryValue = presetTimeValue;
        data.expiryUnit = 'days';
      }
    }

    if (expiryType === 'uses' || expiryType === 'both') {
      data.maxUses = useCustomUses ? customUsesValue : presetUsesValue;
    }

    onSubmit(data);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text-primary">Create Token</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">Token Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Production API Key"
              className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Token Type</label>
            <select
              value={tokenType}
              onChange={(e) => setTokenType(e.target.value as 'api_key' | 'access_token' | 'service_token')}
              className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
            >
              <option value="api_key">API Key</option>
              <option value="access_token">Access Token</option>
              <option value="service_token">Service Token</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-2">Scopes</label>
            <div className="flex flex-wrap gap-2">
              {availableScopes.map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => toggleScope(scope)}
                  className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                    selectedScopes.includes(scope)
                      ? 'bg-accent text-text-inverse'
                      : 'bg-surface-hover text-text-muted hover:text-text-primary'
                  }`}
                >
                  {scope}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Expiry Type</label>
            <select
              value={expiryType}
              onChange={(e) => setExpiryType(e.target.value as 'never' | 'time' | 'uses' | 'both')}
              className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
            >
              <option value="never">Never expires</option>
              <option value="time">Time-based expiry</option>
              <option value="uses">Use-based limit</option>
              <option value="both">Time + Use limits</option>
            </select>
          </div>

          {/* Time-Based Options */}
          {(expiryType === 'time' || expiryType === 'both') && (
            <div className="space-y-3 p-4 bg-surface-hover/50 rounded-lg border border-border">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-text-primary">Expiration Time</label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={useCustomTime}
                    onChange={(e) => setUseCustomTime(e.target.checked)}
                    className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                  />
                  <span className="text-text-muted">Custom</span>
                </label>
              </div>

              {!useCustomTime ? (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 1, label: '1 day' },
                    { value: 7, label: '7 days' },
                    { value: 30, label: '30 days' },
                    { value: 90, label: '90 days' },
                    { value: 180, label: '6 months' },
                    { value: 365, label: '1 year' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPresetTimeValue(opt.value)}
                      className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                        presetTimeValue === opt.value
                          ? 'bg-accent text-text-inverse'
                          : 'bg-surface text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    value={customTimeValue}
                    onChange={(e) => setCustomTimeValue(Number(e.target.value))}
                    className="flex-1 px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
                  />
                  <select
                    value={customTimeUnit}
                    onChange={(e) => setCustomTimeUnit(e.target.value as TimeUnit)}
                    className="px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
                  >
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                    <option value="months">Months</option>
                    <option value="years">Years</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Use-Based Options */}
          {(expiryType === 'uses' || expiryType === 'both') && (
            <div className="space-y-3 p-4 bg-surface-hover/50 rounded-lg border border-border">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-text-primary">Maximum Uses</label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={useCustomUses}
                    onChange={(e) => setUseCustomUses(e.target.checked)}
                    className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                  />
                  <span className="text-text-muted">Custom</span>
                </label>
              </div>

              {!useCustomUses ? (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 1, label: 'Single use' },
                    { value: 10, label: '10 uses' },
                    { value: 100, label: '100 uses' },
                    { value: 1000, label: '1K uses' },
                    { value: 10000, label: '10K uses' },
                    { value: 100000, label: '100K uses' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPresetUsesValue(opt.value)}
                      className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                        presetUsesValue === opt.value
                          ? 'bg-accent text-text-inverse'
                          : 'bg-surface text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  type="number"
                  min={1}
                  value={customUsesValue}
                  onChange={(e) => setCustomUsesValue(Number(e.target.value))}
                  placeholder="Enter number of uses"
                  className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
                />
              )}
            </div>
          )}

          <div>
            <label className="block text-sm text-text-muted mb-1">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this token used for?"
              className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
          </div>
          <button
            type="submit"
            disabled={isPending || !name || selectedScopes.length === 0}
            className="w-full px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
          >
            {isPending ? 'Creating...' : 'Create Token'}
          </button>
        </form>
      </div>
    </div>
  );
}

function CertificateDetailModal({
  cert,
  onClose,
  onRevoke,
  isPending,
  getTypeBadge,
  getStatusBadge,
}: {
  cert: Certificate;
  onClose: () => void;
  onRevoke: () => void;
  isPending: boolean;
  getTypeBadge: (t: string) => JSX.Element;
  getStatusBadge: (s: string) => JSX.Element;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text-primary">Certificate Details</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <p className="text-xs text-text-muted">Common Name</p>
            <p className="text-sm font-medium text-text-primary">{cert.commonName}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-text-muted">Type</p>
              {getTypeBadge(cert.certType)}
            </div>
            <div>
              <p className="text-xs text-text-muted">Status</p>
              {getStatusBadge(cert.status)}
            </div>
          </div>
          <div>
            <p className="text-xs text-text-muted">Serial Number</p>
            <p className="text-sm font-mono text-text-primary">{cert.serialNumber}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Fingerprint</p>
            <p className="text-sm font-mono text-text-primary break-all">{cert.fingerprint}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-text-muted">Valid From</p>
              <p className="text-sm text-text-primary">{new Date(cert.notBefore).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Valid Until</p>
              <p className="text-sm text-text-primary">{new Date(cert.notAfter).toLocaleDateString()}</p>
            </div>
          </div>
          {cert.keyUsage && cert.keyUsage.length > 0 && (
            <div>
              <p className="text-xs text-text-muted mb-1">Key Usage</p>
              <div className="flex flex-wrap gap-1">
                {cert.keyUsage.map((usage) => (
                  <span key={usage} className="px-2 py-0.5 bg-surface-hover rounded text-xs text-text-muted">
                    {usage}
                  </span>
                ))}
              </div>
            </div>
          )}
          {cert.extendedKeyUsage && cert.extendedKeyUsage.length > 0 && (
            <div>
              <p className="text-xs text-text-muted mb-1">Extended Key Usage</p>
              <div className="flex flex-wrap gap-1">
                {cert.extendedKeyUsage.map((usage) => (
                  <span key={usage} className="px-2 py-0.5 bg-surface-hover rounded text-xs text-text-muted">
                    {usage}
                  </span>
                ))}
              </div>
            </div>
          )}
          {cert.subjectDid && (
            <div>
              <p className="text-xs text-text-muted">Subject DID</p>
              <p className="text-sm text-text-primary truncate">{cert.subjectDid}</p>
            </div>
          )}
          {cert.serviceId && (
            <div>
              <p className="text-xs text-text-muted">Service ID</p>
              <p className="text-sm text-text-primary">{cert.serviceId}</p>
            </div>
          )}
          {cert.status === 'active' && (
            <button
              onClick={onRevoke}
              disabled={isPending}
              className="w-full px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {isPending ? 'Revoking...' : 'Revoke Certificate'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TokenDetailModal({
  token,
  onClose,
  onRevoke,
  isPending,
  getTypeBadge,
  getStatusBadge,
}: {
  token: Token;
  onClose: () => void;
  onRevoke: () => void;
  isPending: boolean;
  getTypeBadge: (t: string) => JSX.Element;
  getStatusBadge: (s: string) => JSX.Element;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text-primary">Token Details</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <p className="text-xs text-text-muted">Name</p>
            <p className="text-sm font-medium text-text-primary">{token.name}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-text-muted">Type</p>
              {getTypeBadge(token.type)}
            </div>
            <div>
              <p className="text-xs text-text-muted">Status</p>
              {getStatusBadge(token.status)}
            </div>
          </div>
          <div>
            <p className="text-xs text-text-muted">Prefix</p>
            <p className="text-sm font-mono text-text-primary">{token.prefix}...</p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">Scopes</p>
            <div className="flex flex-wrap gap-1">
              {token.scopes.map((scope) => (
                <span key={scope} className="px-2 py-0.5 bg-surface-hover rounded text-xs text-text-muted">
                  {scope}
                </span>
              ))}
            </div>
          </div>
          {token.expiresAt && (
            <div>
              <p className="text-xs text-text-muted">Expires</p>
              <p className="text-sm text-text-primary">{new Date(token.expiresAt).toLocaleString()}</p>
            </div>
          )}
          {token.maxUses && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-text-muted">Max Uses</p>
                <p className="text-sm text-text-primary">{token.maxUses}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Uses Remaining</p>
                <p className={`text-sm ${token.usesRemaining === 0 ? 'text-red-500' : 'text-text-primary'}`}>
                  {token.usesRemaining}
                </p>
              </div>
            </div>
          )}
          {token.lastUsedAt && (
            <div>
              <p className="text-xs text-text-muted">Last Used</p>
              <p className="text-sm text-text-primary">{new Date(token.lastUsedAt).toLocaleString()}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-text-muted">Created</p>
              <p className="text-sm text-text-primary">{new Date(token.createdAt).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Created By</p>
              <p className="text-sm text-text-primary truncate">{token.createdBy}</p>
            </div>
          </div>
          {token.description && (
            <div>
              <p className="text-xs text-text-muted">Description</p>
              <p className="text-sm text-text-primary">{token.description}</p>
            </div>
          )}
          {token.status === 'active' && (
            <button
              onClick={onRevoke}
              disabled={isPending}
              className="w-full px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {isPending ? 'Revoking...' : 'Revoke Token'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

interface StatCardProps {
  label: string;
  value: string;
  icon: React.FC<{ className?: string }>;
  color?: 'green' | 'red' | 'yellow';
  highlight?: boolean;
}

function StatCard({ label, value, icon: Icon, color, highlight }: StatCardProps) {
  const colorStyles = {
    green: 'text-green-500',
    red: 'text-red-500',
    yellow: 'text-yellow-500',
  };

  return (
    <div className={`bg-surface border rounded-xl p-6 ${highlight ? 'border-yellow-500' : 'border-border'}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-text-muted mb-1">{label}</p>
          <p className={`text-2xl font-bold ${color ? colorStyles[color] : 'text-text-primary'}`}>{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${highlight ? 'bg-yellow-500/10' : 'bg-surface-hover'}`}>
          <Icon className={`w-6 h-6 ${highlight ? 'text-yellow-500' : color ? colorStyles[color] : 'text-text-muted'}`} />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Batch Modal Components
// ============================================================================

function BatchRevokeModal({
  count,
  onClose,
  onSubmit,
  isPending,
}: {
  count: number;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  isPending: boolean;
}) {
  const [reason, setReason] = useState('unspecified');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text-primary">Revoke Certificates</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            You are about to revoke <span className="font-bold text-text-primary">{count}</span> certificate(s).
            This action cannot be undone.
          </p>
          <div>
            <label className="block text-sm text-text-muted mb-1">Revocation Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
            >
              <option value="unspecified">Unspecified</option>
              <option value="keyCompromise">Key Compromise</option>
              <option value="cACompromise">CA Compromise</option>
              <option value="affiliationChanged">Affiliation Changed</option>
              <option value="superseded">Superseded</option>
              <option value="cessationOfOperation">Cessation of Operation</option>
              <option value="certificateHold">Certificate Hold</option>
              <option value="privilegeWithdrawn">Privilege Withdrawn</option>
            </select>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-surface-hover hover:bg-surface text-text-primary rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onSubmit(reason)}
              disabled={isPending}
              className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {isPending ? 'Revoking...' : `Revoke ${count} Certificate(s)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BatchDownloadModal({
  count,
  onClose,
  onSubmit,
  isPending,
}: {
  count: number;
  onClose: () => void;
  onSubmit: (format: 'pem' | 'der' | 'pkcs12', includePrivateKey: boolean, password?: string) => void;
  isPending: boolean;
}) {
  const [format, setFormat] = useState<'pem' | 'der' | 'pkcs12'>('pem');
  const [includePrivateKey, setIncludePrivateKey] = useState(false);
  const [password, setPassword] = useState('');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text-primary">Download Certificates</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Download <span className="font-bold text-text-primary">{count}</span> certificate(s).
          </p>
          <div>
            <label className="block text-sm text-text-muted mb-1">Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as 'pem' | 'der' | 'pkcs12')}
              className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
            >
              <option value="pem">PEM (Base64)</option>
              <option value="der">DER (Binary)</option>
              <option value="pkcs12">PKCS#12 (.p12)</option>
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includePrivateKey}
              onChange={(e) => setIncludePrivateKey(e.target.checked)}
              className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
            />
            <span className="text-sm text-text-primary">Include private key</span>
          </label>
          {includePrivateKey && format === 'pkcs12' && (
            <div>
              <label className="block text-sm text-text-muted mb-1">Password (required for PKCS#12)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              />
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-surface-hover hover:bg-surface text-text-primary rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onSubmit(format, includePrivateKey, password || undefined)}
              disabled={isPending || (includePrivateKey && format === 'pkcs12' && !password)}
              className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {isPending ? 'Downloading...' : `Download ${count} Certificate(s)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BatchCreateModal({
  onClose,
  onSubmit,
  isPending,
  caCerts,
}: {
  onClose: () => void;
  onSubmit: (
    certificates: Array<{ commonName: string; subjectDid?: string; email?: string }>,
    issuerId?: string,
    certType?: 'client' | 'server' | 'code_signing',
    validityDays?: number
  ) => void;
  isPending: boolean;
  caCerts?: RootCertificate[];
}) {
  const [certType, setCertType] = useState<'client' | 'server' | 'code_signing'>('client');
  const [validityDays, setValidityDays] = useState(365);
  const [issuerId, setIssuerId] = useState(caCerts?.[0]?.id || '');
  const [bulkText, setBulkText] = useState('');

  const parseEntries = () => {
    return bulkText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const parts = line.split(',').map((p) => p.trim());
        return {
          commonName: parts[0] || '',
          email: parts[1] || undefined,
          subjectDid: parts[2] || undefined,
        };
      })
      .filter((entry) => entry.commonName.length > 0);
  };

  const entries = parseEntries();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text-primary">Batch Issue Certificates</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">Certificate Type</label>
            <select
              value={certType}
              onChange={(e) => setCertType(e.target.value as 'client' | 'server' | 'code_signing')}
              className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
            >
              <option value="client">Client Certificate</option>
              <option value="server">Server Certificate</option>
              <option value="code_signing">Code Signing Certificate</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Issuing CA</label>
            <select
              value={issuerId}
              onChange={(e) => setIssuerId(e.target.value)}
              className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
            >
              {caCerts?.map((ca) => (
                <option key={ca.id} value={ca.id}>
                  {ca.commonName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Validity Period</label>
            <select
              value={validityDays}
              onChange={(e) => setValidityDays(Number(e.target.value))}
              className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
            >
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
              <option value={365}>1 year</option>
              <option value={730}>2 years</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">
              Certificate Entries (one per line: commonName, email, subjectDid)
            </label>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder="api.example.com&#10;user@example.com, user@example.com&#10;did:web:user.example.com, , did:web:user.example.com"
              rows={6}
              className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent font-mono text-sm"
            />
            <p className="text-xs text-text-muted mt-1">
              {entries.length} certificate(s) will be issued
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-surface-hover hover:bg-surface text-text-primary rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onSubmit(entries, issuerId, certType, validityDays)}
              disabled={isPending || entries.length === 0}
              className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
            >
              {isPending ? 'Issuing...' : `Issue ${entries.length} Certificate(s)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Icons
// ============================================================================

function CertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function RevokedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

function RootCertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function IntermediateIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function OneTimeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5l-3.9 19.5m-2.1-19.5l-3.9 19.5" />
    </svg>
  );
}

function CounterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
