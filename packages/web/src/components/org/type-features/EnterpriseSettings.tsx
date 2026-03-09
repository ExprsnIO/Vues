'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { EnterpriseDepartment, ComplianceSetting } from '@exprsn/shared';

interface EnterpriseSettingsProps {
  organizationId: string;
  enabledFeatures: string[];
  userPermissions: string[];
}

export function EnterpriseSettings({
  organizationId,
  enabledFeatures,
  userPermissions,
}: EnterpriseSettingsProps) {
  const [activeTab, setActiveTab] = useState<'departments' | 'compliance' | 'audit'>('departments');
  const [departments, setDepartments] = useState<EnterpriseDepartment[]>([]);
  const [compliance, setCompliance] = useState<ComplianceSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canManageDepartments = userPermissions.includes('org.department.manage');
  const canViewDepartments = userPermissions.includes('org.department.view') || canManageDepartments;
  const canManageCompliance = userPermissions.includes('org.compliance.manage');
  const canViewCompliance = userPermissions.includes('org.compliance.view') || canManageCompliance;

  useEffect(() => {
    loadData();
  }, [organizationId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [deptRes, complianceRes] = await Promise.all([
        canViewDepartments
          ? api.get<{ hierarchy: EnterpriseDepartment[] }>(`/xrpc/io.exprsn.org.enterprise.departments.hierarchy?organizationId=${organizationId}`)
          : Promise.resolve({ hierarchy: [] as EnterpriseDepartment[] }),
        canViewCompliance
          ? api.get<{ settings: ComplianceSetting[] }>(`/xrpc/io.exprsn.org.enterprise.compliance.list?organizationId=${organizationId}`)
          : Promise.resolve({ settings: [] as ComplianceSetting[] }),
      ]);

      setDepartments(deptRes.hierarchy || []);
      setCompliance(complianceRes.settings || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse h-10 bg-surface rounded w-48" />
        <div className="animate-pulse h-64 bg-surface rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-surface rounded-lg w-fit">
        {(['departments', 'compliance', 'audit'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab
                ? 'bg-accent text-white'
                : 'text-text-muted hover:text-text hover:bg-surface-hover'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'departments' && (
        <DepartmentHierarchy
          departments={departments}
          canManage={canManageDepartments}
          onUpdate={loadData}
        />
      )}

      {activeTab === 'compliance' && (
        <ComplianceManagement
          organizationId={organizationId}
          settings={compliance}
          canManage={canManageCompliance}
          onUpdate={loadData}
        />
      )}

      {activeTab === 'audit' && <AuditLog organizationId={organizationId} />}
    </div>
  );
}

function DepartmentHierarchy({
  departments,
  canManage,
  onUpdate,
}: {
  departments: EnterpriseDepartment[];
  canManage: boolean;
  onUpdate: () => void;
}) {
  const renderDepartment = (dept: EnterpriseDepartment & { children?: EnterpriseDepartment[] }, level = 0) => (
    <div key={dept.id} style={{ marginLeft: level * 24 }} className="py-2">
      <div className="p-3 bg-surface rounded-lg border border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-accent/20 flex items-center justify-center text-accent">
            {dept.name.charAt(0)}
          </div>
          <div>
            <p className="font-medium">{dept.name}</p>
            {dept.head && (
              <p className="text-sm text-text-muted">Head: {dept.head.displayName || dept.head.handle}</p>
            )}
          </div>
        </div>
        <div className="text-sm text-text-muted">{dept.memberCount} members</div>
      </div>
      {dept.children?.map((child) => renderDepartment(child as EnterpriseDepartment & { children?: EnterpriseDepartment[] }, level + 1))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Department Hierarchy</h3>
        {canManage && (
          <button className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors">
            Add Department
          </button>
        )}
      </div>

      <div className="space-y-1">
        {departments.map((dept) => renderDepartment(dept as EnterpriseDepartment & { children?: EnterpriseDepartment[] }))}
      </div>

      {departments.length === 0 && (
        <div className="text-center py-12 text-text-muted">
          No departments yet. {canManage && 'Create your first department to get started.'}
        </div>
      )}
    </div>
  );
}

function ComplianceManagement({
  organizationId,
  settings,
  canManage,
  onUpdate,
}: {
  organizationId: string;
  settings: ComplianceSetting[];
  canManage: boolean;
  onUpdate: () => void;
}) {
  const enforcementColors = {
    advisory: 'bg-blue-500/20 text-blue-400',
    warning: 'bg-yellow-500/20 text-yellow-400',
    blocking: 'bg-red-500/20 text-red-400',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Compliance Settings ({settings.length})</h3>
        {canManage && (
          <button className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors">
            Add Setting
          </button>
        )}
      </div>

      <div className="space-y-3">
        {settings.map((setting) => (
          <div
            key={setting.id}
            className="p-4 bg-surface rounded-lg border border-border"
          >
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-medium">{setting.name}</h4>
                {setting.description && (
                  <p className="text-sm text-text-muted mt-1">{setting.description}</p>
                )}
                <div className="mt-2 flex gap-2">
                  <span className="px-2 py-0.5 text-xs bg-surface-hover rounded">
                    {setting.category}
                  </span>
                  <span className="px-2 py-0.5 text-xs bg-surface-hover rounded capitalize">
                    {setting.type}
                  </span>
                </div>
              </div>
              <span className={`px-2 py-1 rounded text-xs ${enforcementColors[setting.enforcementLevel]}`}>
                {setting.enforcementLevel}
              </span>
            </div>
          </div>
        ))}
      </div>

      {settings.length === 0 && (
        <div className="text-center py-12 text-text-muted">
          No compliance settings yet.{' '}
          {canManage && 'Add compliance policies to ensure organizational standards.'}
        </div>
      )}
    </div>
  );
}

function AuditLog({ organizationId }: { organizationId: string }) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Audit Log</h3>
      <div className="p-8 bg-surface rounded-lg border border-border text-center text-text-muted">
        Audit log feature coming soon.
      </div>
    </div>
  );
}
