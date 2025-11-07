/** @type {import('next').NextConfig} */
const base = (process.env.NEXT_PUBLIC_TAILORAPP_API || 'http://109.123.239.27:8083').trim()

if (!/^https?:\/\//.test(base)) {
    throw new Error('NEXT_PUBLIC_TAILORAPP_API must include http:// or https://')
}

// Sanitize base and parse
const sanitized = base.replace(/\/+$/, '').replace(/\/api$/, '')
const u = new URL(sanitized)
const dev = process.env.NODE_ENV !== 'production'

// Build a remotePatterns entry from your API base
const apiRemotePattern = {
    protocol: u.protocol.replace(':', ''), // 'http' | 'https'
    hostname: u.hostname,                  // e.g. '109.123.239.27'
    pathname: '/**',
    ...(u.port ? { port: u.port } : {}),
}

const nextConfig = {
    images: {
        // Bypass optimizer in dev or when explicitly requested, so localhost images don't error
        unoptimized: dev || process.env.NEXT_IMAGE_UNOPTIMIZED === 'true',

        remotePatterns: [
            apiRemotePattern,
            // local dev backends (optional but handy)
            { protocol: 'http', hostname: 'localhost',  port: '8083', pathname: '/**' },
            { protocol: 'http', hostname: '127.0.0.1',  port: '8083', pathname: '/**' },
            // DiceBear fallback avatars
            { protocol: 'https', hostname: 'api.dicebear.com', pathname: '/**' },
        ],
    },

    async rewrites() {
        return [
            {
                source: '/api/:path*',
                destination: `${sanitized}/api/:path*`,
            },
        ]
    },
}

module.exports = nextConfig