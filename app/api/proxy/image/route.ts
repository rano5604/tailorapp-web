// app/api/proxy/image/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEV_DEFAULT = 'http://localhost:8083';
const PROD_DEFAULT = 'http://109.123.239.27:8083';
const isDev = process.env.NODE_ENV !== 'production';

function sanitizeOrigin(v?: string) {
    const s = String(v || '').trim().replace(/\/+$/, '');
    return s.replace(/\/api$/, '');
}

const rawOrigin =
    process.env.API_BASE ||
    process.env.NEXT_PUBLIC_TAILORAPP_API ||
    (isDev ? DEV_DEFAULT : PROD_DEFAULT);

const API_ORIGIN = sanitizeOrigin(rawOrigin);

function tryDecode(v?: string | null) {
    if (!v) return v ?? null;
    try { return decodeURIComponent(v); } catch { return v; }
}
function normalizeBearer(maybe?: string | null) {
    if (!maybe) return null;
    let t = (tryDecode(maybe) || maybe).trim().replace(/^"+|"+$/g, '');
    if (!t) return null;
    if (!/^Bearer\s+/i.test(t)) t = `Bearer ${t}`;
    return t;
}

function buildTarget(src: string): URL | null {
    try {
        if (/^https?:\/\//i.test(src)) return new URL(src);
        const path = src.startsWith('/') ? src : `/${src}`;
        return new URL(path, API_ORIGIN);
    } catch {
        return null;
    }
}

function isAllowed(target: URL): boolean {
    try {
        const allowed = new URL(API_ORIGIN).origin;
        return target.origin === allowed;
    } catch {
        return false;
    }
}

function buildForwardHeaders(req: NextRequest, explicitBearer?: string | null) {
    // Prefer explicit bearer (query/header), then cookie/header on request
    const cookieAuth =
        req.cookies.get('Authorization')?.value ||
        req.cookies.get('access_token')?.value ||
        req.cookies.get('tb_access_token')?.value ||
        req.cookies.get('auth_token')?.value ||
        req.cookies.get('token')?.value ||
        null;

    const headerBearer = normalizeBearer(
        req.headers.get('authorization') || req.headers.get('Authorization')
    );
    const bearer = normalizeBearer(explicitBearer) || headerBearer || normalizeBearer(cookieAuth);

    const h = new Headers();

    // Pass ALL cookies through (prevents dropping upstream-required cookies)
    const incomingCookieHeader = req.headers.get('cookie');
    if (incomingCookieHeader) h.set('Cookie', incomingCookieHeader);

    // Authorization (optional)
    if (bearer) h.set('Authorization', bearer);

    // Accept headers (use generic to avoid 406s)
    h.set('Accept', req.headers.get('accept') || 'image/*,*/*;q=0.8');

    // Forward caching and range validators
    const pass = ['if-none-match', 'if-modified-since', 'range', 'accept-language'];
    pass.forEach((k) => {
        const v = req.headers.get(k);
        if (v) h.set(k, v);
    });

    // Optional: forward UA (some CDNs vary on UA)
    const ua = req.headers.get('user-agent');
    if (ua) h.set('User-Agent', ua);

    return h;
}

async function proxyImage(req: NextRequest, method: 'GET' | 'HEAD') {
    const url = new URL(req.url);
    const src = url.searchParams.get('src');
    const bearerParam = url.searchParams.get('b') || url.searchParams.get('bearer'); // optional

    if (!src) return new NextResponse('Missing src', { status: 400 });

    const target = buildTarget(src);
    if (!target) return new NextResponse('Invalid src', { status: 400 });

    if (!isAllowed(target)) {
        return new NextResponse('Forbidden origin', { status: 403 });
    }

    const fwdHeaders = buildForwardHeaders(req, bearerParam);

    const upstream = await fetch(target.toString(), {
        method,
        headers: fwdHeaders,
        // stream and follow redirects (common for signed URLs/CDNs)
        redirect: 'follow',
        cache: 'no-store',
    });

    // For non-OK, relay the upstream status and body to help debugging
    if (!upstream.ok && upstream.status !== 304) {
        const text = await upstream.text().catch(() => 'Upstream error');
        return new NextResponse(text, { status: upstream.status });
    }

    // Preserve important headers
    const ct = upstream.headers.get('content-type') ?? 'image/jpeg';
    const cl = upstream.headers.get('content-length') ?? undefined;
    const etag = upstream.headers.get('etag') ?? undefined;
    const lm = upstream.headers.get('last-modified') ?? undefined;
    const cr = upstream.headers.get('content-range') ?? undefined;
    const disp = upstream.headers.get('content-disposition') ?? 'inline';

    // Cache for a short time; include Vary to keep per-auth/cookie variants distinct
    const baseHeaders: Record<string, string> = {
        'Content-Type': ct,
        ...(cl ? { 'Content-Length': cl } : {}),
        ...(etag ? { ETag: etag } : {}),
        ...(lm ? { 'Last-Modified': lm } : {}),
        ...(cr ? { 'Content-Range': cr } : {}),
        'Cache-Control': 'public, max-age=300',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        Vary: 'Authorization, Cookie, Range, Accept, Accept-Language',
        'Content-Disposition': disp,
    };

    // HEAD responses should not include a body
    if (method === 'HEAD') {
        return new NextResponse(null, { status: upstream.status, headers: baseHeaders });
    }

    // Stream body for GET
    return new NextResponse(upstream.body, {
        status: upstream.status,
        headers: baseHeaders,
    });
}

export async function GET(req: NextRequest) {
    try {
        return await proxyImage(req, 'GET');
    } catch {
        return new NextResponse('Failed to fetch image', { status: 502 });
    }
}

export async function HEAD(req: NextRequest) {
    try {
        return await proxyImage(req, 'HEAD');
    } catch {
        return new NextResponse('Failed to fetch image', { status: 502 });
    }
}
