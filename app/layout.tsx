// app/layout.tsx
import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
    title: 'TailorBook',
    description: 'TailorBook web',
};

export const viewport: Viewport = {
    // Next.js App Router viewport API (prevents duplicate meta viewport) [[2]] [[5]] [[6]] [[10]]
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    themeColor: '#5B21B6',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    // Keep this as a Server Component (no "use client") so metadata/viewport apply correctly [[9]]
    return (
        <html lang="en" suppressHydrationWarning>
        <body className="app-root">{children}</body>
        </html>
    );
}
