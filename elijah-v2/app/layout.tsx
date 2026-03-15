import type { Metadata } from 'next';
import { Cormorant_Garamond, Inter } from 'next/font/google';
import './globals.css';
import Nav from '@/components/layout/Nav';

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '600'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Elijah Bryant — Faith + Consistency',
  description:
    'NBA champion. Global professional. Father. Building a life led by faith, grounded in family, and driven by purpose.',
  keywords: [
    'Elijah Bryant',
    'NBA',
    'Milwaukee Bucks',
    'basketball',
    'faith',
    'consistency',
    'Maccabi Tel Aviv',
    'Anadolu Efes',
  ],
  authors: [{ name: 'Elijah Bryant' }],
  openGraph: {
    title: 'Elijah Bryant — Faith + Consistency',
    description:
      'NBA champion. Global professional. Father. Building a life led by faith, grounded in family, and driven by purpose.',
    url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://elijahbryant.com',
    siteName: 'Elijah Bryant',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Elijah Bryant — Faith + Consistency',
    description:
      'NBA champion. Global professional. Father. Building a life led by faith, grounded in family, and driven by purpose.',
    creator: '@Elijah_Bryant3',
  },
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://elijahbryant.com'
  ),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${cormorant.variable} ${inter.variable}`}
      style={{ colorScheme: 'dark' }}
    >
      <head>
        <meta name="theme-color" content="#090909" />
        <meta name="color-scheme" content="dark" />
      </head>
      <body className="bg-bg text-brand-text font-body antialiased">
        <div className="grain-overlay" aria-hidden="true" />
        <Nav />
        <main>{children}</main>
      </body>
    </html>
  );
}
