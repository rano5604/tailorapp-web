// middleware.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const PUBLIC_PREFIXES = [
    '/login',
    '/_next',
    '/favicon.ico',
    '/robots.txt',
    '/sitemap.xml',
    '/manifest.json',
    '/sw.js',
    '/assets',
    '/images',
    '/fonts',
    '/static',
    '/api', // Next.js API routes (not your backend on 8083)
];

// Helper: is this path public or a static asset?
function isPublic(pathname: string) {
    return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

// Helper: do we have any acceptable auth signal?
function hasAuth(req: NextRequest) {
    const cookieKeys = [
        'access_token',
        'Authorization',      // some apps store Bearer here
        'JSESSIONID',
        'tb_auth',
        'token',
        'auth_token',
        'tb_access_token',
    ];
    const hasCookie = cookieKeys.some((k) => {
        const v = req.cookies.get(k)?.value;
        return typeof v === 'string' && v.length > 0;
    });

    // Optional: honor Bearer header if present (SSR, proxies, etc.)
    const bearer = req.headers.get('authorization') || req.headers.get('Authorization');
    const hasBearer = !!bearer && bearer.trim().toLowerCase().startsWith('bearer ');

    return hasCookie || hasBearer;
}

export function middleware(req: NextRequest) {
    const { pathname, search } = req.nextUrl;

    // Always allow public routes and assets
    if (isPublic(pathname)) return NextResponse.next();

    // Allow HEAD/OPTIONS without auth checks
    if (req.method === 'HEAD' || req.method === 'OPTIONS') return NextResponse.next();

    // If unauthenticated, send to login and preserve return URL
    if (!hasAuth(req)) {
        const url = req.nextUrl.clone();
        url.pathname = '/login';
        url.searchParams.set('redirect', pathname + (search || ''));
        return NextResponse.redirect(url);
    }

    // Authenticated -> allow through (do NOT redirect to dashboard here)
    return NextResponse.next();
}

// Run middleware for all pages except static assets
export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|assets|images|fonts|manifest.json|sw.js).*)',
    ],
};
