/**
 * Setup step orchestration
 */

export { checkPrerequisites, type PrerequisiteResult } from './prerequisites.js';
export { initializeCertificates, type CertificateResult } from './certificates.js';
export { createAdminUser, type AdminUserResult } from './admin.js';
export { configureServices, type ServicesResult } from './services.js';
export { finalizeSetup, type FinalizeResult } from './finalize.js';
