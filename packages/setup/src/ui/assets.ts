/**
 * Embedded CSS and JavaScript for the setup wizard
 */

export function getStyles(): string {
  return `
    :root {
      --bg-primary: #0a0a0a;
      --bg-secondary: #141414;
      --bg-tertiary: #1a1a1a;
      --text-primary: #fafafa;
      --text-secondary: #a1a1aa;
      --text-muted: #71717a;
      --border-color: #27272a;
      --accent: #8b5cf6;
      --accent-hover: #7c3aed;
      --success: #22c55e;
      --warning: #f59e0b;
      --error: #ef4444;
      --radius: 8px;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      line-height: 1.6;
    }

    .setup-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
    }

    header {
      text-align: center;
      margin-bottom: 40px;
    }

    .logo {
      font-size: 32px;
      font-weight: 700;
      color: var(--accent);
      margin-bottom: 8px;
    }

    h1 {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .subtitle {
      color: var(--text-secondary);
      font-size: 14px;
    }

    .progress-bar {
      display: flex;
      justify-content: space-between;
      margin: 32px 0;
      position: relative;
    }

    .progress-bar::before {
      content: '';
      position: absolute;
      top: 16px;
      left: 24px;
      right: 24px;
      height: 2px;
      background: var(--border-color);
      z-index: 0;
    }

    .progress-step {
      display: flex;
      flex-direction: column;
      align-items: center;
      z-index: 1;
      flex: 1;
    }

    .step-indicator {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--bg-secondary);
      border: 2px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
      transition: all 0.2s;
    }

    .progress-step.completed .step-indicator {
      background: var(--success);
      border-color: var(--success);
      color: white;
    }

    .progress-step.active .step-indicator {
      background: var(--accent);
      border-color: var(--accent);
      color: white;
    }

    .step-label {
      font-size: 12px;
      color: var(--text-muted);
      text-align: center;
    }

    .progress-step.active .step-label,
    .progress-step.completed .step-label {
      color: var(--text-secondary);
    }

    .card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      padding: 24px;
      margin-bottom: 24px;
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }

    .card-icon {
      width: 40px;
      height: 40px;
      border-radius: var(--radius);
      background: var(--bg-tertiary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
    }

    .card-title {
      font-size: 18px;
      font-weight: 600;
    }

    .card-description {
      color: var(--text-secondary);
      font-size: 14px;
      margin-bottom: 20px;
    }

    .form-group {
      margin-bottom: 16px;
    }

    label {
      display: block;
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 6px;
      color: var(--text-secondary);
    }

    input[type="text"],
    input[type="email"],
    input[type="password"] {
      width: 100%;
      padding: 10px 12px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      color: var(--text-primary);
      font-size: 14px;
      transition: border-color 0.2s;
    }

    input:focus {
      outline: none;
      border-color: var(--accent);
    }

    input::placeholder {
      color: var(--text-muted);
    }

    .checkbox-group {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px;
      background: var(--bg-tertiary);
      border-radius: var(--radius);
      margin-bottom: 8px;
      cursor: pointer;
    }

    .checkbox-group:hover {
      background: var(--bg-primary);
    }

    .checkbox-group input[type="checkbox"] {
      margin-top: 2px;
      width: 16px;
      height: 16px;
      accent-color: var(--accent);
    }

    .checkbox-content {
      flex: 1;
    }

    .checkbox-label {
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 2px;
    }

    .checkbox-description {
      font-size: 12px;
      color: var(--text-muted);
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px 20px;
      font-size: 14px;
      font-weight: 500;
      border-radius: var(--radius);
      border: none;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-primary {
      background: var(--accent);
      color: white;
    }

    .btn-primary:hover {
      background: var(--accent-hover);
    }

    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-secondary {
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
    }

    .btn-secondary:hover {
      background: var(--bg-primary);
    }

    .button-group {
      display: flex;
      justify-content: space-between;
      margin-top: 24px;
    }

    .check-list {
      list-style: none;
    }

    .check-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: var(--bg-tertiary);
      border-radius: var(--radius);
      margin-bottom: 8px;
    }

    .check-status {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
    }

    .check-status.passed {
      background: var(--success);
      color: white;
    }

    .check-status.failed {
      background: var(--error);
      color: white;
    }

    .check-status.warning {
      background: var(--warning);
      color: white;
    }

    .check-status.pending {
      background: var(--bg-secondary);
      border: 2px solid var(--border-color);
    }

    .check-content {
      flex: 1;
    }

    .check-name {
      font-size: 14px;
      font-weight: 500;
    }

    .check-message {
      font-size: 12px;
      color: var(--text-muted);
    }

    .alert {
      padding: 12px 16px;
      border-radius: var(--radius);
      margin-bottom: 16px;
      font-size: 14px;
    }

    .alert-success {
      background: rgba(34, 197, 94, 0.1);
      border: 1px solid var(--success);
      color: var(--success);
    }

    .alert-error {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid var(--error);
      color: var(--error);
    }

    .alert-info {
      background: rgba(139, 92, 246, 0.1);
      border: 1px solid var(--accent);
      color: var(--accent);
    }

    .info-box {
      background: var(--bg-tertiary);
      border-radius: var(--radius);
      padding: 16px;
      margin-bottom: 16px;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid var(--border-color);
    }

    .info-row:last-child {
      border-bottom: none;
    }

    .info-label {
      color: var(--text-muted);
      font-size: 13px;
    }

    .info-value {
      font-size: 13px;
      font-family: monospace;
    }

    .loading {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid var(--border-color);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .success-icon {
      width: 64px;
      height: 64px;
      background: var(--success);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      margin: 0 auto 24px;
    }

    footer {
      text-align: center;
      margin-top: 40px;
      color: var(--text-muted);
      font-size: 12px;
    }

    @media (max-width: 600px) {
      .progress-bar {
        flex-wrap: wrap;
        gap: 16px;
      }

      .progress-bar::before {
        display: none;
      }

      .progress-step {
        flex: 0 0 calc(33.333% - 16px);
      }

      .button-group {
        flex-direction: column;
        gap: 12px;
      }

      .btn {
        width: 100%;
      }
    }
  `;
}

export function getScripts(): string {
  return `
    const API_BASE = '/first-run/api';

    async function fetchApi(endpoint, options = {}) {
      const res = await fetch(API_BASE + endpoint, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
      return res.json();
    }

    function showLoading(btn) {
      btn.disabled = true;
      btn.dataset.originalText = btn.innerHTML;
      btn.innerHTML = '<span class="loading"></span> Processing...';
    }

    function hideLoading(btn) {
      btn.disabled = false;
      btn.innerHTML = btn.dataset.originalText;
    }

    function showAlert(container, type, message) {
      const alert = document.createElement('div');
      alert.className = 'alert alert-' + type;
      alert.textContent = message;
      container.insertBefore(alert, container.firstChild);
      setTimeout(() => alert.remove(), 5000);
    }

    // Step handlers
    async function runPrerequisites() {
      const btn = document.getElementById('btn-prerequisites');
      const container = document.getElementById('step-content');
      showLoading(btn);

      try {
        const result = await fetchApi('/prerequisites', { method: 'POST' });

        if (result.success) {
          window.location.reload();
        } else {
          showAlert(container, 'error', 'Some prerequisites failed. Please fix them and try again.');
        }
      } catch (err) {
        showAlert(container, 'error', 'Failed to check prerequisites: ' + err.message);
      }

      hideLoading(btn);
    }

    async function initCertificates() {
      const btn = document.getElementById('btn-certificates');
      const container = document.getElementById('step-content');
      showLoading(btn);

      try {
        const result = await fetchApi('/certificates', { method: 'POST', body: '{}' });

        if (result.success) {
          window.location.reload();
        } else {
          showAlert(container, 'error', result.error || 'Failed to initialize certificates');
        }
      } catch (err) {
        showAlert(container, 'error', 'Failed to initialize certificates: ' + err.message);
      }

      hideLoading(btn);
    }

    async function createAdmin() {
      const btn = document.getElementById('btn-admin');
      const container = document.getElementById('step-content');

      const handle = document.getElementById('admin-handle').value.trim();
      const email = document.getElementById('admin-email').value.trim();
      const password = document.getElementById('admin-password').value;
      const confirmPassword = document.getElementById('admin-confirm-password').value;

      if (!handle || !password) {
        showAlert(container, 'error', 'Handle and password are required');
        return;
      }

      if (password !== confirmPassword) {
        showAlert(container, 'error', 'Passwords do not match');
        return;
      }

      if (password.length < 8) {
        showAlert(container, 'error', 'Password must be at least 8 characters');
        return;
      }

      showLoading(btn);

      try {
        const result = await fetchApi('/admin', {
          method: 'POST',
          body: JSON.stringify({ handle, email, password }),
        });

        if (result.success) {
          window.location.reload();
        } else {
          showAlert(container, 'error', result.error || 'Failed to create admin user');
        }
      } catch (err) {
        showAlert(container, 'error', 'Failed to create admin user: ' + err.message);
      }

      hideLoading(btn);
    }

    async function saveServices() {
      const btn = document.getElementById('btn-services');
      const container = document.getElementById('step-content');
      showLoading(btn);

      const checkboxes = document.querySelectorAll('input[name="service"]');
      const services = {};
      checkboxes.forEach(cb => {
        services[cb.value] = cb.checked;
      });

      try {
        const result = await fetchApi('/services', {
          method: 'POST',
          body: JSON.stringify(services),
        });

        if (result.success) {
          window.location.reload();
        } else {
          showAlert(container, 'error', result.error || 'Failed to save service configuration');
        }
      } catch (err) {
        showAlert(container, 'error', 'Failed to save services: ' + err.message);
      }

      hideLoading(btn);
    }

    async function finalizeSetup() {
      const btn = document.getElementById('btn-finalize');
      const container = document.getElementById('step-content');
      showLoading(btn);

      try {
        const result = await fetchApi('/finalize', { method: 'POST', body: '{}' });

        if (result.success) {
          window.location.href = result.redirectUrl || '/admin';
        } else {
          showAlert(container, 'error', result.error || 'Failed to finalize setup');
        }
      } catch (err) {
        showAlert(container, 'error', 'Failed to finalize setup: ' + err.message);
      }

      hideLoading(btn);
    }
  `;
}
