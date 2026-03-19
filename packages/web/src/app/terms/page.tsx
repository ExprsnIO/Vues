import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service - Exprsn',
  description: 'Terms of Service for the Exprsn platform. Read about our policies for using the service.',
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-accent to-accent-hover rounded-lg flex items-center justify-center">
              <span className="text-text-inverse font-bold text-lg">E</span>
            </div>
            <span className="text-xl font-bold text-text-primary">exprsn</span>
          </Link>
          <Link
            href="/login"
            className="text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            Log in
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold text-text-primary mb-2">Terms of Service</h1>
        <p className="text-text-muted mb-10">Last updated: March 16, 2026</p>

        <div className="prose-custom space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">1. Acceptance of Terms</h2>
            <p className="text-text-secondary leading-relaxed">
              By accessing or using the Exprsn platform (&quot;Service&quot;), you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, you may not access or use the Service. These Terms apply to all visitors, users, and others who access or use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">2. Account Terms</h2>
            <p className="text-text-secondary leading-relaxed mb-3">
              You must be at least 13 years of age to use this Service. By agreeing to these Terms, you represent and warrant that you are at least 13 years old.
            </p>
            <p className="text-text-secondary leading-relaxed mb-3">
              You are responsible for maintaining the security of your account and password. Exprsn cannot and will not be liable for any loss or damage from your failure to comply with this security obligation.
            </p>
            <p className="text-text-secondary leading-relaxed">
              You are responsible for all content posted and activity that occurs under your account. You may not use the Service for any illegal or unauthorized purpose.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">3. User Content</h2>
            <p className="text-text-secondary leading-relaxed mb-3">
              You retain ownership of all content that you submit, post, or display on or through the Service (&quot;User Content&quot;). By posting User Content, you grant Exprsn a worldwide, non-exclusive, royalty-free license to use, reproduce, modify, adapt, publish, translate, distribute, and display such content in connection with providing and promoting the Service.
            </p>
            <p className="text-text-secondary leading-relaxed">
              Exprsn is built on the AT Protocol, which means your content and identity are portable. You maintain control of your data and can migrate to other AT Protocol-compatible services at any time.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">4. Prohibited Uses</h2>
            <p className="text-text-secondary leading-relaxed mb-3">
              You agree not to use the Service to:
            </p>
            <ul className="list-disc list-inside text-text-secondary space-y-2 ml-2">
              <li>Upload, post, or transmit content that is unlawful, harmful, threatening, abusive, harassing, defamatory, or otherwise objectionable</li>
              <li>Impersonate any person or entity, or falsely state or misrepresent your affiliation with a person or entity</li>
              <li>Engage in any activity that interferes with or disrupts the Service</li>
              <li>Use automated means to access the Service in a manner that exceeds reasonable usage</li>
              <li>Attempt to gain unauthorized access to the Service, other accounts, or computer systems</li>
              <li>Upload or distribute viruses, malware, or any other malicious code</li>
              <li>Collect or harvest user information without consent</li>
              <li>Use the Service to distribute spam or unsolicited messages</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">5. Intellectual Property</h2>
            <p className="text-text-secondary leading-relaxed">
              The Service and its original content (excluding User Content), features, and functionality are and will remain the exclusive property of Exprsn and its licensors. The Service is protected by copyright, trademark, and other laws. Our trademarks and trade dress may not be used in connection with any product or service without the prior written consent of Exprsn. The underlying AT Protocol technology is open source and governed by its own licensing terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">6. Disclaimers</h2>
            <p className="text-text-secondary leading-relaxed">
              The Service is provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis. Exprsn makes no warranties, expressed or implied, regarding the Service, including but not limited to implied warranties of merchantability, fitness for a particular purpose, and non-infringement. Exprsn does not warrant that the Service will be uninterrupted, timely, secure, or error-free.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">7. Limitation of Liability</h2>
            <p className="text-text-secondary leading-relaxed">
              In no event shall Exprsn, its directors, employees, partners, agents, suppliers, or affiliates be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of or inability to access or use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">8. Content Moderation</h2>
            <p className="text-text-secondary leading-relaxed">
              Exprsn reserves the right, but is not obligated, to monitor and moderate User Content. We may remove or disable access to any User Content that we determine, in our sole discretion, violates these Terms or is otherwise harmful. We may also suspend or terminate accounts that violate these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">9. Governing Law</h2>
            <p className="text-text-secondary leading-relaxed">
              These Terms shall be governed and construed in accordance with the laws of the United States, without regard to its conflict of law provisions. Our failure to enforce any right or provision of these Terms will not be considered a waiver of those rights.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">10. Changes to Terms</h2>
            <p className="text-text-secondary leading-relaxed">
              We reserve the right to modify or replace these Terms at any time. If a revision is material, we will provide at least 30 days&apos; notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion. By continuing to access or use our Service after those revisions become effective, you agree to be bound by the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">11. Contact</h2>
            <p className="text-text-secondary leading-relaxed">
              If you have any questions about these Terms, please contact us at{' '}
              <a href="mailto:legal@exprsn.io" className="text-accent hover:underline">legal@exprsn.io</a>.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-text-muted">
          <p>Exprsn, Inc.</p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-text-primary transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-text-primary font-medium">
              Terms of Service
            </Link>
            <Link href="/" className="hover:text-text-primary transition-colors">
              Home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
