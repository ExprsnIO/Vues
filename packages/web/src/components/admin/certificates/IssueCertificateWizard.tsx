'use client';

import { useState } from 'react';
import { Modal, ModalBody, ModalFooter, FormField, Input, Textarea, Badge } from '@/components/admin/ui';

type CertificateType = 'server' | 'client' | 'code_signing' | 'intermediate';

interface IssueCertificateWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CertificateRequest) => void;
  isSubmitting?: boolean;
  availableIssuers: Array<{
    id: string;
    subject: string;
    type: 'root' | 'intermediate';
  }>;
  domainId?: string;
}

interface CertificateRequest {
  type: CertificateType;
  issuerId: string;
  subject: {
    commonName: string;
    organization?: string;
    organizationalUnit?: string;
    country?: string;
    state?: string;
    locality?: string;
  };
  subjectAltNames?: string[];
  validityDays: number;
  keySize: 2048 | 4096;
  algorithm: 'RSA' | 'ECDSA';
  keyUsage: string[];
  extKeyUsage: string[];
}

const STEPS = ['Type', 'Issuer', 'Subject', 'Options', 'Review'];

export function IssueCertificateWizard({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
  availableIssuers,
}: IssueCertificateWizardProps) {
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState<Partial<CertificateRequest>>({
    type: 'server',
    keySize: 2048,
    algorithm: 'RSA',
    validityDays: 365,
    keyUsage: [],
    extKeyUsage: [],
    subject: { commonName: '' },
    subjectAltNames: [],
  });
  const [sanInput, setSanInput] = useState('');

  const certTypes: Array<{ value: CertificateType; label: string; description: string; icon: React.ReactNode }> = [
    {
      value: 'server',
      label: 'Server Certificate',
      description: 'For TLS/SSL server authentication',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
        </svg>
      ),
    },
    {
      value: 'client',
      label: 'Client Certificate',
      description: 'For client authentication',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
    {
      value: 'code_signing',
      label: 'Code Signing',
      description: 'For signing code and applications',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
      ),
    },
    {
      value: 'intermediate',
      label: 'Intermediate CA',
      description: 'Create a subordinate CA',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
    },
  ];

  const keyUsageOptions = [
    { value: 'digitalSignature', label: 'Digital Signature' },
    { value: 'keyEncipherment', label: 'Key Encipherment' },
    { value: 'dataEncipherment', label: 'Data Encipherment' },
    { value: 'keyAgreement', label: 'Key Agreement' },
    { value: 'keyCertSign', label: 'Certificate Signing' },
    { value: 'cRLSign', label: 'CRL Signing' },
  ];

  const extKeyUsageOptions = [
    { value: 'serverAuth', label: 'Server Authentication' },
    { value: 'clientAuth', label: 'Client Authentication' },
    { value: 'codeSigning', label: 'Code Signing' },
    { value: 'emailProtection', label: 'Email Protection' },
    { value: 'timeStamping', label: 'Time Stamping' },
  ];

  const handleTypeSelect = (type: CertificateType) => {
    const defaults: Partial<CertificateRequest> = { type };

    switch (type) {
      case 'server':
        defaults.keyUsage = ['digitalSignature', 'keyEncipherment'];
        defaults.extKeyUsage = ['serverAuth'];
        defaults.validityDays = 365;
        break;
      case 'client':
        defaults.keyUsage = ['digitalSignature'];
        defaults.extKeyUsage = ['clientAuth'];
        defaults.validityDays = 365;
        break;
      case 'code_signing':
        defaults.keyUsage = ['digitalSignature'];
        defaults.extKeyUsage = ['codeSigning'];
        defaults.validityDays = 730;
        break;
      case 'intermediate':
        defaults.keyUsage = ['keyCertSign', 'cRLSign'];
        defaults.extKeyUsage = [];
        defaults.validityDays = 1825;
        defaults.keySize = 4096;
        break;
    }

    setFormData({ ...formData, ...defaults });
  };

  const addSAN = () => {
    if (sanInput.trim() && !formData.subjectAltNames?.includes(sanInput.trim())) {
      setFormData({
        ...formData,
        subjectAltNames: [...(formData.subjectAltNames || []), sanInput.trim()],
      });
      setSanInput('');
    }
  };

  const removeSAN = (san: string) => {
    setFormData({
      ...formData,
      subjectAltNames: formData.subjectAltNames?.filter((s) => s !== san),
    });
  };

  const toggleKeyUsage = (value: string) => {
    const current = formData.keyUsage || [];
    setFormData({
      ...formData,
      keyUsage: current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    });
  };

  const toggleExtKeyUsage = (value: string) => {
    const current = formData.extKeyUsage || [];
    setFormData({
      ...formData,
      extKeyUsage: current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    });
  };

  const canProceed = () => {
    switch (step) {
      case 0: return !!formData.type;
      case 1: return !!formData.issuerId;
      case 2: return !!formData.subject?.commonName;
      case 3: return formData.validityDays && formData.validityDays > 0;
      default: return true;
    }
  };

  const handleSubmit = () => {
    onSubmit(formData as CertificateRequest);
  };

  const reset = () => {
    setStep(0);
    setFormData({
      type: 'server',
      keySize: 2048,
      algorithm: 'RSA',
      validityDays: 365,
      keyUsage: [],
      extKeyUsage: [],
      subject: { commonName: '' },
      subjectAltNames: [],
    });
    setSanInput('');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { reset(); onClose(); }}
      title="Issue Certificate"
      size="lg"
    >
      {/* Progress Steps */}
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                  i < step
                    ? 'bg-green-500 text-white'
                    : i === step
                    ? 'bg-accent text-text-inverse'
                    : 'bg-surface-hover text-text-muted'
                }`}
              >
                {i < step ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span className={`ml-2 text-sm ${i === step ? 'text-text-primary font-medium' : 'text-text-muted'}`}>
                {label}
              </span>
              {i < STEPS.length - 1 && (
                <div className={`w-12 h-0.5 mx-3 ${i < step ? 'bg-green-500' : 'bg-surface-hover'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      <ModalBody className="min-h-[400px]">
        {/* Step 0: Certificate Type */}
        {step === 0 && (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">Select the type of certificate you want to issue.</p>
            <div className="grid grid-cols-2 gap-4">
              {certTypes.map((type) => (
                <button
                  key={type.value}
                  onClick={() => handleTypeSelect(type.value)}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    formData.type === type.value
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-accent/50'
                  }`}
                >
                  <div className={`mb-3 ${formData.type === type.value ? 'text-accent' : 'text-text-muted'}`}>
                    {type.icon}
                  </div>
                  <h4 className="text-sm font-medium text-text-primary">{type.label}</h4>
                  <p className="text-xs text-text-muted mt-1">{type.description}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: Select Issuer */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">Select the CA that will issue this certificate.</p>
            <div className="space-y-2">
              {availableIssuers.map((issuer) => (
                <button
                  key={issuer.id}
                  onClick={() => setFormData({ ...formData, issuerId: issuer.id })}
                  className={`w-full p-4 rounded-lg border text-left transition-all ${
                    formData.issuerId === issuer.id
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-accent/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      issuer.type === 'root' ? 'bg-purple-500/10 text-purple-500' : 'bg-blue-500/10 text-blue-500'
                    }`}>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-primary">{issuer.subject}</p>
                      <p className="text-xs text-text-muted">{issuer.type === 'root' ? 'Root CA' : 'Intermediate CA'}</p>
                    </div>
                  </div>
                </button>
              ))}
              {availableIssuers.length === 0 && (
                <div className="text-center py-8 text-text-muted">
                  <p>No certificate authorities available.</p>
                  <p className="text-sm mt-1">Create a Root CA first.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Subject Details */}
        {step === 2 && (
          <div className="space-y-4">
            <FormField label="Common Name (CN)" required hint="e.g., example.com or John Doe">
              <Input
                value={formData.subject?.commonName || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  subject: { ...formData.subject!, commonName: e.target.value },
                })}
                placeholder="Enter common name"
              />
            </FormField>

            {(formData.type === 'server' || formData.type === 'client') && (
              <FormField label="Subject Alternative Names (SANs)" hint="DNS names or IP addresses">
                <div className="flex gap-2">
                  <Input
                    value={sanInput}
                    onChange={(e) => setSanInput(e.target.value)}
                    placeholder="e.g., www.example.com"
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSAN())}
                  />
                  <button
                    onClick={addSAN}
                    className="px-4 py-2 bg-surface hover:bg-surface-hover border border-border rounded-lg transition-colors"
                  >
                    Add
                  </button>
                </div>
                {formData.subjectAltNames && formData.subjectAltNames.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.subjectAltNames.map((san) => (
                      <span key={san} className="inline-flex items-center gap-1 px-2 py-1 bg-surface-hover rounded text-sm">
                        {san}
                        <button onClick={() => removeSAN(san)} className="text-text-muted hover:text-text-primary">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </FormField>
            )}

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Organization (O)">
                <Input
                  value={formData.subject?.organization || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    subject: { ...formData.subject!, organization: e.target.value },
                  })}
                  placeholder="Optional"
                />
              </FormField>
              <FormField label="Organizational Unit (OU)">
                <Input
                  value={formData.subject?.organizationalUnit || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    subject: { ...formData.subject!, organizationalUnit: e.target.value },
                  })}
                  placeholder="Optional"
                />
              </FormField>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <FormField label="Country (C)">
                <Input
                  value={formData.subject?.country || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    subject: { ...formData.subject!, country: e.target.value },
                  })}
                  placeholder="US"
                  maxLength={2}
                />
              </FormField>
              <FormField label="State (ST)">
                <Input
                  value={formData.subject?.state || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    subject: { ...formData.subject!, state: e.target.value },
                  })}
                  placeholder="Optional"
                />
              </FormField>
              <FormField label="Locality (L)">
                <Input
                  value={formData.subject?.locality || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    subject: { ...formData.subject!, locality: e.target.value },
                  })}
                  placeholder="Optional"
                />
              </FormField>
            </div>
          </div>
        )}

        {/* Step 3: Certificate Options */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Validity Period (days)">
                <Input
                  type="number"
                  value={formData.validityDays || 365}
                  onChange={(e) => setFormData({ ...formData, validityDays: parseInt(e.target.value) || 365 })}
                  min={1}
                  max={3650}
                />
              </FormField>
              <FormField label="Algorithm">
                <select
                  value={formData.algorithm}
                  onChange={(e) => setFormData({ ...formData, algorithm: e.target.value as 'RSA' | 'ECDSA' })}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="RSA">RSA</option>
                  <option value="ECDSA">ECDSA</option>
                </select>
              </FormField>
              <FormField label="Key Size">
                <select
                  value={formData.keySize}
                  onChange={(e) => setFormData({ ...formData, keySize: parseInt(e.target.value) as 2048 | 4096 })}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value={2048}>2048-bit</option>
                  <option value={4096}>4096-bit</option>
                </select>
              </FormField>
            </div>

            <FormField label="Key Usage">
              <div className="flex flex-wrap gap-2">
                {keyUsageOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => toggleKeyUsage(opt.value)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      formData.keyUsage?.includes(opt.value)
                        ? 'bg-accent text-text-inverse border-accent'
                        : 'bg-surface border-border hover:border-accent/50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </FormField>

            <FormField label="Extended Key Usage">
              <div className="flex flex-wrap gap-2">
                {extKeyUsageOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => toggleExtKeyUsage(opt.value)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      formData.extKeyUsage?.includes(opt.value)
                        ? 'bg-accent text-text-inverse border-accent'
                        : 'bg-surface border-border hover:border-accent/50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </FormField>
          </div>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">Review your certificate request before submitting.</p>

            <div className="p-4 bg-surface-hover rounded-lg space-y-4">
              <div className="flex justify-between">
                <span className="text-sm text-text-muted">Type</span>
                <Badge variant="info">{certTypes.find(t => t.value === formData.type)?.label}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-text-muted">Common Name</span>
                <span className="text-sm text-text-primary font-medium">{formData.subject?.commonName}</span>
              </div>
              {formData.subjectAltNames && formData.subjectAltNames.length > 0 && (
                <div className="flex justify-between items-start">
                  <span className="text-sm text-text-muted">SANs</span>
                  <div className="text-right">
                    {formData.subjectAltNames.map(san => (
                      <span key={san} className="block text-sm text-text-primary">{san}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-sm text-text-muted">Validity</span>
                <span className="text-sm text-text-primary">{formData.validityDays} days</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-text-muted">Algorithm</span>
                <span className="text-sm text-text-primary">{formData.algorithm} {formData.keySize}-bit</span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-sm text-text-muted">Key Usage</span>
                <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
                  {formData.keyUsage?.map(ku => (
                    <Badge key={ku} variant="default" size="sm">{ku}</Badge>
                  ))}
                </div>
              </div>
              {formData.extKeyUsage && formData.extKeyUsage.length > 0 && (
                <div className="flex justify-between items-start">
                  <span className="text-sm text-text-muted">Extended Key Usage</span>
                  <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
                    {formData.extKeyUsage?.map(eku => (
                      <Badge key={eku} variant="info" size="sm">{eku}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <button
          onClick={() => { reset(); onClose(); }}
          className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
        <div className="flex gap-2">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="px-4 py-2 text-sm bg-surface hover:bg-surface-hover border border-border rounded-lg transition-colors"
            >
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Issuing...' : 'Issue Certificate'}
            </button>
          )}
        </div>
      </ModalFooter>
    </Modal>
  );
}

export default IssueCertificateWizard;
