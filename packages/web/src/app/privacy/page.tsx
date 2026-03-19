import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy - Exprsn',
  description: 'Privacy Policy for the Exprsn platform. Learn how we collect, use, and protect your information.',
};

export default function PrivacyPolicyPage() {
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
        <h1 className="text-4xl font-bold text-text-primary mb-2">Privacy Policy</h1>
        <p className="text-text-muted mb-10">Last updated: March 16, 2026</p>

        <div className="prose-custom space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">1. Information We Collect</h2>
            <p className="text-text-secondary leading-relaxed mb-3">
              We collect information you provide directly to us when you create an account, including your handle, email address, and password. When you use the Service, we may also collect:
            </p>
            <ul className="list-disc list-inside text-text-secondary space-y-2 ml-2">
              <li><strong className="text-text-primary">Account information:</strong> Your handle, display name, email, profile picture, and bio</li>
              <li><strong className="text-text-primary">Content:</strong> Videos, comments, messages, and other content you post</li>
              <li><strong className="text-text-primary">Usage data:</strong> Information about how you interact with the Service, including viewing patterns, search queries, and engagement metrics</li>
              <li><strong className="text-text-primary">Device information:</strong> Browser type, operating system, device identifiers, and IP address</li>
              <li><strong className="text-text-primary">AT Protocol data:</strong> Your decentralized identifier (DID), signing keys, and repository data necessary for AT Protocol federation</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">2. How We Use Information</h2>
            <p className="text-text-secondary leading-relaxed mb-3">
              We use the information we collect to:
            </p>
            <ul className="list-disc list-inside text-text-secondary space-y-2 ml-2">
              <li>Provide, maintain, and improve the Service</li>
              <li>Personalize your experience, including the content feed algorithm</li>
              <li>Send you technical notices, updates, security alerts, and support messages</li>
              <li>Respond to your comments, questions, and provide customer service</li>
              <li>Monitor and analyze trends, usage, and activities in connection with the Service</li>
              <li>Detect, investigate, and prevent fraudulent transactions and other illegal activities</li>
              <li>Facilitate AT Protocol federation and interoperability with other services</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">3. Information Sharing</h2>
            <p className="text-text-secondary leading-relaxed mb-3">
              Exprsn is built on the AT Protocol, which is a decentralized and federated protocol. This means:
            </p>
            <ul className="list-disc list-inside text-text-secondary space-y-2 ml-2">
              <li><strong className="text-text-primary">Public content:</strong> Content you post publicly (videos, profile information) is available to other AT Protocol services through federation</li>
              <li><strong className="text-text-primary">Federation:</strong> Your DID, handle, and public repository data are shared across the AT Protocol network</li>
              <li><strong className="text-text-primary">Service providers:</strong> We may share information with third-party service providers who assist in operating the Service (hosting, CDN, analytics)</li>
              <li><strong className="text-text-primary">Legal requirements:</strong> We may disclose information if required to do so by law or in response to valid legal process</li>
            </ul>
            <p className="text-text-secondary leading-relaxed mt-3">
              We do not sell your personal information to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">4. Data Retention</h2>
            <p className="text-text-secondary leading-relaxed">
              We retain your information for as long as your account is active or as needed to provide the Service. If you request account deletion, we will delete or anonymize your personal information within 30 days, except where we are required to retain it for legal or legitimate business purposes. Due to the nature of the AT Protocol, content that has been federated to other services may persist on those services after deletion from Exprsn.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">5. Security</h2>
            <p className="text-text-secondary leading-relaxed">
              We take reasonable measures to help protect your personal information from loss, theft, misuse, unauthorized access, disclosure, alteration, and destruction. These measures include encryption of data in transit and at rest, secure session management with hashed tokens, and regular security audits. However, no method of transmission over the Internet or electronic storage is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">6. Your Rights</h2>
            <p className="text-text-secondary leading-relaxed mb-3">
              Depending on your location, you may have the following rights regarding your personal information:
            </p>
            <ul className="list-disc list-inside text-text-secondary space-y-2 ml-2">
              <li><strong className="text-text-primary">Access:</strong> Request a copy of the personal information we hold about you</li>
              <li><strong className="text-text-primary">Correction:</strong> Request correction of inaccurate personal information</li>
              <li><strong className="text-text-primary">Deletion:</strong> Request deletion of your personal information</li>
              <li><strong className="text-text-primary">Portability:</strong> Exprsn is built on the AT Protocol, which inherently supports data portability. You can export your data and move to another AT Protocol service at any time</li>
              <li><strong className="text-text-primary">Opt-out:</strong> Opt out of certain data processing activities, including personalized recommendations</li>
            </ul>
            <p className="text-text-secondary leading-relaxed mt-3">
              To exercise these rights, please contact us at{' '}
              <a href="mailto:privacy@exprsn.io" className="text-accent hover:underline">privacy@exprsn.io</a> or use the settings in your account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">7. Children&apos;s Privacy</h2>
            <p className="text-text-secondary leading-relaxed">
              The Service is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13. If we learn that we have collected personal information from a child under 13, we will take steps to delete such information as soon as possible. If you believe a child under 13 has provided us with personal information, please contact us at{' '}
              <a href="mailto:privacy@exprsn.io" className="text-accent hover:underline">privacy@exprsn.io</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">8. Cookies and Tracking</h2>
            <p className="text-text-secondary leading-relaxed">
              We use session cookies and local storage to maintain your login state and preferences. We do not use third-party tracking cookies for advertising purposes. Analytics data is collected in aggregate to improve the Service and is not used to build individual advertising profiles.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">9. Changes to This Policy</h2>
            <p className="text-text-secondary leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the &quot;Last updated&quot; date. If changes are significant, we will provide additional notice (such as an in-app notification or email). Your continued use of the Service after changes are posted constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-text-primary mb-3">10. Contact</h2>
            <p className="text-text-secondary leading-relaxed">
              If you have any questions about this Privacy Policy or our data practices, please contact us at{' '}
              <a href="mailto:privacy@exprsn.io" className="text-accent hover:underline">privacy@exprsn.io</a>.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-text-muted">
          <p>Exprsn, Inc.</p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="text-text-primary font-medium">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-text-primary transition-colors">
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
