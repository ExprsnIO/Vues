'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';

interface CertificateData {
  pem: string;
  privateKey: string;
  fingerprint: string;
  validUntil: string;
}

interface CertificateDownloadModalProps {
  isOpen: boolean;
  onContinue: () => void;
  certificate: CertificateData;
  did: string;
  handle: string;
  requireDownload?: boolean;
}

export function CertificateDownloadModal({
  isOpen,
  onContinue,
  certificate,
  did,
  handle,
  requireDownload = true,
}: CertificateDownloadModalProps) {
  const [hasDownloaded, setHasDownloaded] = useState(false);
  const [acknowledgedWarning, setAcknowledgedWarning] = useState(false);

  const downloadCertificateBundle = () => {
    // Create a combined PEM bundle with certificate and private key
    const bundle = `# Exprsn Certificate Bundle for ${handle}
# DID: ${did}
# Fingerprint: ${certificate.fingerprint}
# Valid Until: ${new Date(certificate.validUntil).toLocaleDateString()}
#
# IMPORTANT: Keep this file secure! It contains your private key.
# Do not share this file or store it in an insecure location.

# ============ CERTIFICATE ============
${certificate.pem}

# ============ PRIVATE KEY ============
${certificate.privateKey}
`;

    const blob = new Blob([bundle], { type: 'application/x-pem-file' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `exprsn-${handle.replace('@', '').replace(/\./g, '-')}-certificate.pem`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setHasDownloaded(true);
    toast.success('Certificate downloaded!');
  };

  const downloadPKCS12 = () => {
    // For now, just download the PEM. PKCS#12 requires additional processing
    // that would be better done server-side
    toast.error('PKCS#12 format not yet available. Using PEM format.');
    downloadCertificateBundle();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const canContinue = !requireDownload || (hasDownloaded && acknowledgedWarning);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-gray-900 rounded-2xl w-full max-w-lg mx-4 overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-800 bg-gradient-to-r from-emerald-600 to-teal-600">
          <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Your Certificate is Ready</h2>
            <p className="text-sm text-white/80">Save it securely before continuing</p>
          </div>
        </div>

        {/* Certificate Info */}
        <div className="p-4 space-y-4">
          <div className="bg-gray-800/50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-sm">DID</span>
              <span className="text-white text-sm font-mono truncate max-w-[200px]" title={did}>
                {did.slice(0, 20)}...{did.slice(-8)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-sm">Handle</span>
              <span className="text-white text-sm">@{handle}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-sm">Fingerprint</span>
              <span className="text-white text-sm font-mono truncate max-w-[200px]" title={certificate.fingerprint}>
                {certificate.fingerprint.slice(0, 20)}...
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-sm">Valid Until</span>
              <span className="text-white text-sm">{formatDate(certificate.validUntil)}</span>
            </div>
          </div>

          {/* Warning */}
          <div className="bg-amber-900/30 border border-amber-700/50 rounded-xl p-4">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="space-y-2">
                <p className="text-amber-200 text-sm font-medium">Important: Store this certificate securely</p>
                <ul className="text-amber-300/80 text-xs space-y-1 list-disc pl-4">
                  <li>This certificate is your cryptographic identity</li>
                  <li>The private key is shown only once and not stored by us</li>
                  <li>Store it in a secure location (password manager, encrypted drive)</li>
                  <li>You'll need it to sign in on new devices or recover your account</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Download Buttons */}
          <div className="space-y-3">
            <button
              onClick={downloadCertificateBundle}
              className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Certificate Bundle (PEM)
            </button>

            {hasDownloaded && (
              <div className="flex items-center gap-2 text-emerald-500 text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Certificate downloaded
              </div>
            )}
          </div>

          {/* Acknowledgment */}
          {requireDownload && hasDownloaded && (
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acknowledgedWarning}
                onChange={(e) => setAcknowledgedWarning(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-gray-900"
              />
              <span className="text-gray-300 text-sm">
                I have saved my certificate in a secure location and understand that I cannot recover my account without it.
              </span>
            </label>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800">
          <button
            onClick={onContinue}
            disabled={!canContinue}
            className="w-full py-3 bg-primary-500 text-white font-semibold rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {canContinue ? 'Continue to Exprsn' : 'Download certificate to continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CertificateDownloadModal;
