import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Exprsn - Express Yourself',
  description: 'A decentralized short-form video platform built on AT Protocol',
  keywords: ['video', 'social', 'decentralized', 'atproto', 'bluesky'],
  authors: [{ name: 'Exprsn' }],
  openGraph: {
    title: 'Exprsn',
    description: 'Express yourself with short-form videos',
    url: 'https://exprsn.io',
    siteName: 'Exprsn',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Exprsn',
    description: 'Express yourself with short-form videos',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#000000',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} dark`} data-theme="slate" data-color-mode="dark">
      <body className="bg-background text-text-primary antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
