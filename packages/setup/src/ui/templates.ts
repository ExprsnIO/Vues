/**
 * HTML templates for the setup wizard
 */

import { getStyles, getScripts } from './assets.js';
import type { StepConfig } from '../state.js';
import { SETUP_STEPS } from '../state.js';

export interface SetupPageData {
  currentStep: number;
  stepConfig: StepConfig;
  completedSteps: string[];
  status: string;
}

export function renderSetupPage(data: SetupPageData): string {
  const { currentStep, completedSteps, status } = data;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Exprsn Setup</title>
  <style>${getStyles()}</style>
</head>
<body>
  <div class="setup-container">
    <header>
      <div class="logo">Exprsn</div>
      <h1>Setup Wizard</h1>
      <p class="subtitle">Configure your Exprsn installation</p>
    </header>

    ${renderProgressBar(currentStep, completedSteps)}

    <main id="step-content">
      ${status === 'completed' ? renderCompleteStep() : renderStepContent(currentStep, completedSteps)}
    </main>

    <footer>
      <p>Exprsn Setup v1.0.0</p>
    </footer>
  </div>
  <script>${getScripts()}</script>
</body>
</html>`;
}

function renderProgressBar(currentStep: number, completedSteps: string[]): string {
  return `
    <div class="progress-bar">
      ${SETUP_STEPS.map((step, index) => {
        const isCompleted = completedSteps.includes(step.id);
        const isActive = index === currentStep && !isCompleted;
        const statusClass = isCompleted ? 'completed' : isActive ? 'active' : '';

        return `
          <div class="progress-step ${statusClass}">
            <div class="step-indicator">
              ${isCompleted ? '&#10003;' : index + 1}
            </div>
            <span class="step-label">${step.title}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderStepContent(currentStep: number, completedSteps: string[]): string {
  const step = SETUP_STEPS[currentStep];
  if (!step) return renderPrerequisitesStep();

  switch (step.id) {
    case 'prerequisites':
      return renderPrerequisitesStep();
    case 'certificates':
      return renderCertificatesStep();
    case 'admin':
      return renderAdminStep();
    case 'services':
      return renderServicesStep();
    case 'finalize':
      return renderFinalizeStep(completedSteps);
    default:
      return renderPrerequisitesStep();
  }
}

function renderPrerequisitesStep(): string {
  return `
    <div class="card">
      <div class="card-header">
        <div class="card-icon">&#9989;</div>
        <h2 class="card-title">Prerequisites Check</h2>
      </div>
      <p class="card-description">
        Let's verify your system meets the requirements for running Exprsn.
        We'll check database connectivity, Node.js version, and required environment variables.
      </p>

      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Platform</span>
          <span class="info-value">${process.platform}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Node.js</span>
          <span class="info-value">${process.version}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Architecture</span>
          <span class="info-value">${process.arch}</span>
        </div>
      </div>

      <div class="button-group">
        <div></div>
        <button id="btn-prerequisites" class="btn btn-primary" onclick="runPrerequisites()">
          Run Checks &rarr;
        </button>
      </div>
    </div>
  `;
}

function renderCertificatesStep(): string {
  return `
    <div class="card">
      <div class="card-header">
        <div class="card-icon">&#128274;</div>
        <h2 class="card-title">Certificate Authority</h2>
      </div>
      <p class="card-description">
        Initialize the root Certificate Authority (CA) for your Exprsn instance.
        This CA will be used to sign certificates for federation, admin authentication, and secure communications.
      </p>

      <div class="alert alert-info">
        <strong>Note:</strong> The root CA private key will be encrypted and stored securely.
        Make sure you have set the CA_ENCRYPTION_KEY environment variable for production use.
      </div>

      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Root CA Name</span>
          <span class="info-value">Exprsn Root CA</span>
        </div>
        <div class="info-row">
          <span class="info-label">Key Size</span>
          <span class="info-value">4096-bit RSA</span>
        </div>
        <div class="info-row">
          <span class="info-label">Validity</span>
          <span class="info-value">20 years</span>
        </div>
      </div>

      <div class="button-group">
        <div></div>
        <button id="btn-certificates" class="btn btn-primary" onclick="initCertificates()">
          Initialize CA &rarr;
        </button>
      </div>
    </div>
  `;
}

function renderAdminStep(): string {
  return `
    <div class="card">
      <div class="card-header">
        <div class="card-icon">&#128100;</div>
        <h2 class="card-title">Create Admin User</h2>
      </div>
      <p class="card-description">
        Create the first administrator account. This user will have full super_admin privileges
        to manage the platform.
      </p>

      <form onsubmit="event.preventDefault(); createAdmin();">
        <div class="form-group">
          <label for="admin-handle">Handle *</label>
          <input type="text" id="admin-handle" placeholder="admin" required minlength="3" />
        </div>

        <div class="form-group">
          <label for="admin-email">Email (optional)</label>
          <input type="email" id="admin-email" placeholder="admin@example.com" />
        </div>

        <div class="form-group">
          <label for="admin-password">Password *</label>
          <input type="password" id="admin-password" placeholder="Min 8 characters" required minlength="8" />
        </div>

        <div class="form-group">
          <label for="admin-confirm-password">Confirm Password *</label>
          <input type="password" id="admin-confirm-password" placeholder="Confirm password" required />
        </div>

        <div class="button-group">
          <div></div>
          <button id="btn-admin" type="submit" class="btn btn-primary">
            Create Admin &rarr;
          </button>
        </div>
      </form>
    </div>
  `;
}

function renderServicesStep(): string {
  const services = [
    { id: 'federation', name: 'AT Protocol Federation', desc: 'Enable federation with other ATProto services', default: true },
    { id: 'studio', name: 'Video Studio', desc: 'Video editing and creation tools', default: true },
    { id: 'render_pipeline', name: 'Render Pipeline', desc: 'Server-side video rendering (requires render worker)', default: false },
    { id: 'spark_messaging', name: 'Spark Messaging', desc: 'Real-time direct messaging', default: true },
    { id: 'ai_moderation', name: 'AI Moderation', desc: 'Automated content moderation using AI', default: false },
    { id: 'email_notifications', name: 'Email Notifications', desc: 'Send email notifications to users', default: false },
    { id: 'live_streaming', name: 'Live Streaming', desc: 'Real-time video streaming (requires IVS)', default: false },
    { id: 'analytics', name: 'Analytics', desc: 'User and content analytics tracking', default: true },
  ];

  return `
    <div class="card">
      <div class="card-header">
        <div class="card-icon">&#9881;</div>
        <h2 class="card-title">Configure Services</h2>
      </div>
      <p class="card-description">
        Enable or disable platform features. You can change these settings later in the admin panel.
      </p>

      <div>
        ${services.map(s => `
          <label class="checkbox-group">
            <input type="checkbox" name="service" value="${s.id}" ${s.default ? 'checked' : ''} />
            <div class="checkbox-content">
              <div class="checkbox-label">${s.name}</div>
              <div class="checkbox-description">${s.desc}</div>
            </div>
          </label>
        `).join('')}
      </div>

      <div class="button-group">
        <div></div>
        <button id="btn-services" class="btn btn-primary" onclick="saveServices()">
          Save Configuration &rarr;
        </button>
      </div>
    </div>
  `;
}

function renderFinalizeStep(completedSteps: string[]): string {
  const allComplete = ['prerequisites', 'certificates', 'admin', 'services'].every(
    step => completedSteps.includes(step)
  );

  return `
    <div class="card">
      <div class="card-header">
        <div class="card-icon">&#128640;</div>
        <h2 class="card-title">Finalize Setup</h2>
      </div>
      <p class="card-description">
        Review your configuration and complete the setup process.
      </p>

      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Prerequisites</span>
          <span class="info-value">${completedSteps.includes('prerequisites') ? '&#10003; Complete' : '&#10007; Pending'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Certificate Authority</span>
          <span class="info-value">${completedSteps.includes('certificates') ? '&#10003; Complete' : '&#10007; Pending'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Admin User</span>
          <span class="info-value">${completedSteps.includes('admin') ? '&#10003; Complete' : '&#10007; Pending'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Services</span>
          <span class="info-value">${completedSteps.includes('services') ? '&#10003; Complete' : '&#10007; Pending'}</span>
        </div>
      </div>

      ${allComplete ? `
        <div class="alert alert-success">
          All steps completed. Click "Launch Exprsn" to finish setup and access the admin panel.
        </div>
      ` : `
        <div class="alert alert-error">
          Some steps are not complete. Please go back and complete all required steps.
        </div>
      `}

      <div class="button-group">
        <div></div>
        <button id="btn-finalize" class="btn btn-primary" onclick="finalizeSetup()" ${allComplete ? '' : 'disabled'}>
          Launch Exprsn &rarr;
        </button>
      </div>
    </div>
  `;
}

function renderCompleteStep(): string {
  return `
    <div class="card" style="text-align: center;">
      <div class="success-icon">&#10003;</div>
      <h2 class="card-title">Setup Complete!</h2>
      <p class="card-description">
        Your Exprsn instance is now configured and ready to use.
      </p>

      <div class="button-group" style="justify-content: center;">
        <a href="/admin" class="btn btn-primary">
          Go to Admin Panel &rarr;
        </a>
      </div>
    </div>
  `;
}
