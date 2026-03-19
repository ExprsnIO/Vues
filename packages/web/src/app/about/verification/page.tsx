import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Verified Identity | Exprsn',
  description:
    'Learn how Exprsn uses cryptographic certificates to verify creator identities.',
};

// ---------------------------------------------------------------------------
// Section heading component
// ---------------------------------------------------------------------------
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-2xl font-bold text-text-primary mb-4">{children}</h2>
  );
}

// ---------------------------------------------------------------------------
// Inline code pill
// ---------------------------------------------------------------------------
function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="px-1.5 py-0.5 bg-surface-elevated rounded text-accent font-mono text-sm">
      {children}
    </code>
  );
}

// ---------------------------------------------------------------------------
// Chain diagram: Root CA → Org/Intermediate CA → Creator certificate
// ---------------------------------------------------------------------------
function CertificateChainDiagram() {
  return (
    <div className="flex flex-col items-center gap-0 w-full max-w-xs mx-auto select-none">
      {/* Root CA */}
      <div className="w-full rounded-xl border border-border bg-surface-elevated px-5 py-3 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-1">
          Root CA
        </p>
        <p className="text-text-primary font-semibold text-sm">
          Exprsn Root Certificate Authority
        </p>
        <p className="text-xs text-text-muted mt-0.5">
          Self-signed · Long-lived · Offline
        </p>
      </div>

      {/* Connector */}
      <div className="flex flex-col items-center">
        <div className="w-px h-6 bg-border" />
        <ChevronDownIcon className="w-4 h-4 text-text-muted -mt-1" />
      </div>

      {/* Org / Intermediate CA */}
      <div className="w-full rounded-xl border border-border bg-surface px-5 py-3 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-1">
          Intermediate CA
        </p>
        <p className="text-text-primary font-semibold text-sm">
          Organisation Certificate Authority
        </p>
        <p className="text-xs text-text-muted mt-0.5">
          Issued by Root · Scoped to an org
        </p>
      </div>

      {/* Connector */}
      <div className="flex flex-col items-center">
        <div className="w-px h-6 bg-border" />
        <ChevronDownIcon className="w-4 h-4 text-text-muted -mt-1" />
      </div>

      {/* Creator leaf */}
      <div className="w-full rounded-xl border border-accent/40 bg-accent/5 px-5 py-3 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent mb-1">
          Creator certificate
        </p>
        <p className="text-text-primary font-semibold text-sm">@creator</p>
        <p className="text-xs text-text-muted mt-0.5">
          Issued by Org CA · Tied to <Code>did:exprsn</Code>
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badge comparison diagram
// ---------------------------------------------------------------------------
function BadgeComparisonDiagram() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* did:exprsn */}
      <div className="rounded-xl border border-accent/30 bg-accent/5 p-5 flex flex-col items-center gap-3 text-center">
        <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
          <ShieldCheckIcon className="w-7 h-7 text-accent" />
        </div>
        <p className="font-semibold text-text-primary">
          <Code>did:exprsn</Code> Shield
        </p>
        <ul className="text-sm text-text-muted space-y-1 text-left list-disc list-inside">
          <li>Certificate-backed identity</li>
          <li>Cryptographically signed posts</li>
          <li>Org membership provable</li>
          <li>Revocable via certificate chain</li>
        </ul>
      </div>

      {/* did:plc */}
      <div className="rounded-xl border border-border bg-surface p-5 flex flex-col items-center gap-3 text-center">
        <div className="w-12 h-12 rounded-full bg-blue-400/10 flex items-center justify-center">
          <GlobeIcon className="w-7 h-7 text-blue-400" />
        </div>
        <p className="font-semibold text-text-primary">
          <Code>did:plc</Code> Globe
        </p>
        <ul className="text-sm text-text-muted space-y-1 text-left list-disc list-inside">
          <li>AT Protocol standard DID</li>
          <li>Platform-managed rotation log</li>
          <li>No certificate chain</li>
          <li>Usable across AT Protocol apps</li>
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signed content flow diagram
// ---------------------------------------------------------------------------
function SignedContentFlowDiagram() {
  const steps = [
    {
      label: 'Creator records video',
      detail: 'Captured and prepared for upload',
      icon: <VideoIcon className="w-5 h-5 text-text-muted" />,
    },
    {
      label: 'Content hash computed',
      detail: 'SHA-256 fingerprint of the media blob',
      icon: <HashIcon className="w-5 h-5 text-text-muted" />,
    },
    {
      label: 'Signed with private key',
      detail: 'Creator signs the hash with their certificate key',
      icon: <KeyIcon className="w-5 h-5 text-accent" />,
    },
    {
      label: 'Post published with signature',
      detail: 'Signature stored alongside the AT Protocol record',
      icon: <CloudUploadIcon className="w-5 h-5 text-text-muted" />,
    },
    {
      label: 'Any viewer can verify',
      detail:
        'Client fetches the certificate chain and confirms the signature matches',
      icon: <ShieldCheckIcon className="w-5 h-5 text-green-500" />,
    },
  ];

  return (
    <div className="flex flex-col gap-0">
      {steps.map((step, i) => (
        <div key={i} className="flex items-start gap-3">
          <div className="flex flex-col items-center">
            <div className="w-9 h-9 rounded-full bg-surface border border-border flex items-center justify-center flex-shrink-0">
              {step.icon}
            </div>
            {i < steps.length - 1 && (
              <div className="w-px flex-1 bg-border min-h-[28px] my-1" />
            )}
          </div>
          <div className="pb-5">
            <p className="text-text-primary font-medium text-sm">{step.label}</p>
            <p className="text-text-muted text-xs">{step.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FAQ accordion item (purely presentational — no JS needed)
// ---------------------------------------------------------------------------
function FaqItem({
  question,
  children,
}: {
  question: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group border-b border-border last:border-b-0">
      <summary className="flex items-center justify-between gap-3 py-4 cursor-pointer list-none select-none text-text-primary font-medium hover:text-accent transition-colors">
        <span>{question}</span>
        <svg
          className="w-4 h-4 flex-shrink-0 transition-transform group-open:rotate-180 text-text-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </summary>
      <div className="pb-4 text-text-muted text-sm leading-relaxed">{children}</div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function VerificationPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="bg-gradient-to-b from-accent/10 to-transparent border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-16 sm:py-20 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/15 mb-6">
            <ShieldCheckIcon className="w-9 h-9 text-accent" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-text-primary tracking-tight mb-4">
            Verified Identity on Exprsn
          </h1>
          <p className="text-lg text-text-muted max-w-xl mx-auto">
            Exprsn uses real cryptographic certificates — not admin checkmarks —
            to prove who created a video and that it has not been altered.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/discover"
              className="px-5 py-2.5 bg-accent text-text-inverse rounded-full text-sm font-semibold hover:bg-accent-hover transition-colors"
            >
              Explore verified creators
            </Link>
            <Link
              href="/settings/identity"
              className="px-5 py-2.5 bg-surface border border-border text-text-primary rounded-full text-sm font-semibold hover:bg-surface-hover transition-colors"
            >
              Get verified
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-12 space-y-16">

        {/* 1. What is did:exprsn? */}
        <section>
          <SectionHeading>What is <Code>did:exprsn</Code>?</SectionHeading>
          <p className="text-text-muted leading-relaxed mb-4">
            A <strong className="text-text-primary">DID</strong> (Decentralised
            Identifier) is a globally unique identity document that does not
            depend on any single company. Exprsn supports two DID methods:
          </p>
          <ul className="space-y-3 text-text-muted text-sm leading-relaxed">
            <li className="flex items-start gap-2">
              <ShieldCheckIcon className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
              <span>
                <Code>did:exprsn</Code> — backed by an X.509 certificate issued
                by the Exprsn Certificate Authority. Every action signed by this
                DID can be verified against a published certificate chain, even
                without trusting Exprsn&apos;s servers.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <GlobeIcon className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
              <span>
                <Code>did:plc</Code> — the standard AT Protocol DID. Widely
                compatible and portable across apps built on the AT Protocol,
                but does not carry a cryptographic certificate.
              </span>
            </li>
          </ul>
        </section>

        {/* 2. Badge comparison */}
        <section>
          <SectionHeading>Badge types at a glance</SectionHeading>
          <BadgeComparisonDiagram />
          <p className="text-xs text-text-muted mt-4 text-center">
            Both badge types represent real accounts. Only the shield badge
            carries an auditable certificate chain.
          </p>
        </section>

        {/* 3. What the shield means */}
        <section>
          <SectionHeading>What does the shield badge mean?</SectionHeading>
          <div className="rounded-xl border border-accent/30 bg-accent/5 p-5 flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
              <ShieldCheckIcon className="w-6 h-6 text-accent" />
            </div>
            <div className="text-sm text-text-muted leading-relaxed">
              <p className="text-text-primary font-semibold mb-1">
                Cryptographically verified identity
              </p>
              <p>
                When you see the shield next to a username, Exprsn has confirmed
                that the account holds a valid certificate issued by the Exprsn
                Root CA. The certificate binds a real public key to the
                account&apos;s <Code>did:exprsn</Code> identifier. Anyone can
                independently confirm this binding at any time by following the
                certificate chain.
              </p>
            </div>
          </div>
          <p className="text-sm text-text-muted leading-relaxed mt-4">
            Unlike a platform checkmark, the shield cannot be granted by a
            single admin action. Issuance requires generating a key pair,
            submitting a Certificate Signing Request, and having it approved
            through the CA workflow. Revocation is equally explicit and auditable.
          </p>
        </section>

        {/* 4. How video posts are signed */}
        <section>
          <SectionHeading>How are video posts signed?</SectionHeading>
          <p className="text-text-muted text-sm leading-relaxed mb-6">
            Every post published by a <Code>did:exprsn</Code> creator goes
            through the following steps. The resulting signature is stored
            inside the AT Protocol record and is openly readable by anyone.
          </p>
          <SignedContentFlowDiagram />
        </section>

        {/* 5. Certificate chain */}
        <section>
          <SectionHeading>The certificate chain</SectionHeading>
          <p className="text-text-muted text-sm leading-relaxed mb-8">
            Exprsn uses a three-tier Public Key Infrastructure (PKI). Trust
            flows strictly downward: the Root CA signs Intermediate
            (Organisation) CAs; those sign individual creator certificates.
          </p>
          <CertificateChainDiagram />
          <div className="mt-8 space-y-3 text-sm text-text-muted leading-relaxed">
            <p>
              <strong className="text-text-primary">Root CA</strong> — kept
              offline in cold storage. Its private key is never used for routine
              operations. Trusted by all Exprsn clients.
            </p>
            <p>
              <strong className="text-text-primary">Intermediate / Org CA</strong> —
              one per organisation. Used to issue certificates to that
              organisation&apos;s creators. Can be independently audited or
              revoked by the Root CA.
            </p>
            <p>
              <strong className="text-text-primary">Creator certificate</strong> —
              bound to a single <Code>did:exprsn</Code>. Contains the creator&apos;s
              public key, validity dates, and the issuing Org CA&apos;s
              signature. Displayed when you click the shield badge on any profile.
            </p>
          </div>
        </section>

        {/* 6. Org membership verification */}
        <section>
          <SectionHeading>Organisation membership verification</SectionHeading>
          <p className="text-text-muted text-sm leading-relaxed mb-4">
            Because each Intermediate CA is scoped to an organisation, any
            observer can prove that a creator belongs to that organisation simply
            by inspecting their certificate:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-sm text-text-muted leading-relaxed">
            <li>
              Fetch the creator&apos;s certificate from the Exprsn CA API.
            </li>
            <li>
              Read the <em>Issuer</em> field — it names the Org CA that signed
              the certificate.
            </li>
            <li>
              Verify the Org CA&apos;s own certificate is signed by the Exprsn
              Root CA.
            </li>
            <li>
              The chain is complete: creator &rarr; Org CA &rarr; Root CA.
            </li>
          </ol>
          <p className="text-text-muted text-sm leading-relaxed mt-4">
            This works without any API call to an Exprsn server. All certificates
            are publicly downloadable and follow standard X.509 encoding.
          </p>
        </section>

        {/* 7. FAQ */}
        <section>
          <SectionHeading>Frequently asked questions</SectionHeading>
          <div className="rounded-xl border border-border bg-surface divide-y divide-border">
            <FaqItem question="How do I get a did:exprsn certificate?">
              Go to{' '}
              <Link href="/settings/identity" className="text-accent hover:underline">
                Settings &rarr; Identity
              </Link>{' '}
              and follow the certificate request flow. If your account belongs to
              an organisation, your administrator may issue it on your behalf.
              Solo creators can request one directly from the Exprsn CA.
            </FaqItem>
            <FaqItem question="Can my certificate be revoked?">
              Yes. The Exprsn CA publishes a Certificate Revocation List (CRL)
              and supports OCSP (Online Certificate Status Protocol). If a
              certificate is revoked — for example because a key was compromised —
              the shield badge will be replaced with a warning indicator within
              minutes of revocation being published.
            </FaqItem>
            <FaqItem question="Does the shield mean a creator is trustworthy?">
              The shield proves identity and content integrity, not character or
              reputation. A <Code>did:exprsn</Code> badge means you can
              cryptographically confirm who made a post and that the content has
              not been altered. Moderation and community trust are separate
              concerns.
            </FaqItem>
            <FaqItem question="What happens if I lose my private key?">
              Contact Exprsn support or your organisation administrator. Your
              current certificate will be revoked and a new CSR can be submitted
              to issue a replacement certificate tied to a new key pair.
            </FaqItem>
            <FaqItem question="Is this open source or auditable?">
              The CA service, the certificate format, and the verification
              library are all open source and published in the Exprsn monorepo.
              Third-party tools that speak standard X.509 can independently
              verify Exprsn certificates without using any Exprsn-provided code.
            </FaqItem>
            <FaqItem question="Do I need a did:exprsn to use Exprsn?">
              No. Any AT Protocol DID (<Code>did:plc</Code> or{' '}
              <Code>did:web</Code>) can be used to create an account. The
              shield certificate is optional and primarily aimed at creators who
              want verifiable attribution and content integrity for their posts.
            </FaqItem>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="rounded-xl border border-border bg-surface p-8 text-center">
          <ShieldCheckIcon className="w-10 h-10 text-accent mx-auto mb-4" />
          <h3 className="text-xl font-bold text-text-primary mb-2">
            Ready to get verified?
          </h3>
          <p className="text-text-muted text-sm mb-6 max-w-sm mx-auto">
            Set up your <Code>did:exprsn</Code> certificate and start publishing
            cryptographically signed content.
          </p>
          <Link
            href="/settings/identity"
            className="inline-block px-6 py-3 bg-accent text-text-inverse rounded-full text-sm font-semibold hover:bg-accent-hover transition-colors"
          >
            Set up verified identity
          </Link>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
function ShieldCheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 1L3 5v6c0 5.25 3.75 10.15 9 11.35C17.25 21.15 21 16.25 21 11V5l-9-4zm-1 13l-3-3 1.41-1.41L11 11.17l4.59-4.58L17 8l-6 6z" />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function HashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5l-3.9 19.5m-2.1-19.5l-3.9 19.5" />
    </svg>
  );
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  );
}

function CloudUploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 5.75 5.75 0 011.548 1.562A4.501 4.501 0 0117.25 19.5H6.75z" />
    </svg>
  );
}
