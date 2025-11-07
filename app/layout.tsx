// app/layout.tsx
import './globals.css'
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
    title: 'TailorBook',
    description: 'TailorBook web',
}

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    themeColor: '#5B21B6',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
        <body className="app-root">{children}</body>
        </html>
    )
}