'use client';

import dynamic from 'next/dynamic';
import type { OrganizationType } from '@exprsn/shared';

// Dynamically import type-specific components
const LabelSettings = dynamic(
  () => import('./type-features/LabelSettings').then(m => ({ default: m.LabelSettings })),
  { loading: () => <div className="animate-pulse h-64 bg-surface rounded-lg" /> }
);

const BrandSettings = dynamic(
  () => import('./type-features/BrandSettings').then(m => ({ default: m.BrandSettings })),
  { loading: () => <div className="animate-pulse h-64 bg-surface rounded-lg" /> }
);

const EnterpriseSettings = dynamic(
  () => import('./type-features/EnterpriseSettings').then(m => ({ default: m.EnterpriseSettings })),
  { loading: () => <div className="animate-pulse h-64 bg-surface rounded-lg" /> }
);

const NetworkSettings = dynamic(
  () => import('./type-features/NetworkSettings').then(m => ({ default: m.NetworkSettings })),
  { loading: () => <div className="animate-pulse h-64 bg-surface rounded-lg" /> }
);

const NonprofitSettings = dynamic(
  () => import('./type-features/NonprofitSettings').then(m => ({ default: m.NonprofitSettings })),
  { loading: () => <div className="animate-pulse h-64 bg-surface rounded-lg" /> }
);

interface TypeFeaturesProps {
  organizationId: string;
  organizationType: OrganizationType;
  enabledFeatures?: string[];
  userPermissions?: string[];
}

export function TypeFeatures({
  organizationId,
  organizationType,
  enabledFeatures = [],
  userPermissions = [],
}: TypeFeaturesProps) {
  // Map organization type to component
  const componentMap: Partial<Record<OrganizationType, React.ComponentType<{
    organizationId: string;
    enabledFeatures: string[];
    userPermissions: string[];
  }>>> = {
    label: LabelSettings,
    brand: BrandSettings,
    enterprise: EnterpriseSettings,
    network: NetworkSettings,
    nonprofit: NonprofitSettings,
  };

  const FeatureComponent = componentMap[organizationType];

  if (!FeatureComponent) {
    // No type-specific features for this organization type
    return null;
  }

  return (
    <FeatureComponent
      organizationId={organizationId}
      enabledFeatures={enabledFeatures}
      userPermissions={userPermissions}
    />
  );
}
