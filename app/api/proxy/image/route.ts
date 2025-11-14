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

function normalizeBearer(maybe?: string | null) {
    if (!maybe) return null;
    let t = maybe.trim().replace(/^"+|"+$/g, '');
    if (!t) return null;
    if (!/^Bearer\s+/i.test(t)) t = `Bearer ${t}`;
    return t;
}

export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const src = url.searchParams.get('src');
        const bearerParam = url.searchParams.get('b') || url.searchParams.get('bearer'); // optional token via query
        if (!src) return new NextResponse('Missing src', { status: 400 });

        // Absolute or relative to API origin
        let target: URL;
        try {
            target = /^https?:\/\//i.test(src)
                ? new URL(src)
                : new URL(src.startsWith('/') ? src : `/${src}`, API_ORIGIN);
        } catch {
            return new NextResponse('Invalid src', { status: 400 });
        }

        // Allow-list the upstream origin to avoid open proxy
        const allowedOrigin = new URL(API_ORIGIN).origin;
        if (target.origin !== allowedOrigin) {
            return new NextResponse('Forbidden origin', { status: 403 });
        }

        // Auth from cookies
        const tokenCookie =
            req.cookies.get('access_token')?.value ||
            req.cookies.get('Authorization')?.value ||
            req.cookies.get('tb_access_token')?.value ||
            req.cookies.get('auth_token')?.value ||
            req.cookies.get('token')?.value ||
            null;

        const jsid = req.cookies.get('JSESSIONID')?.value;
        const tbAuth = req.cookies.get('tb_auth')?.value;

        // Also accept Authorization header or query param as fallback
        const hdrBearer = normalizeBearer(req.headers.get('authorization') || req.headers.get('Authorization'));
        const qpBearer = normalizeBearer(bearerParam);

        const bearer = normalizeBearer(tokenCookie) || hdrBearer || qpBearer;

        const fwdHeaders = new Headers();
        fwdHeaders.set('Accept', 'image/*');
        if (bearer) fwdHeaders.set('Authorization', bearer);

        const cookieParts: string[] = [];
        if (jsid) cookieParts.push(`JSESSIONID=${jsid}`);
        if (tbAuth) cookieParts.push(`tb_auth=${tbAuth}`);
        if (cookieParts.length) fwdHeaders.set('Cookie', cookieParts.join('; '));

        const upstream = await fetch(target.toString(), {
            headers: fwdHeaders,
            cache: 'no-store',
            redirect: 'follow',
        });

        if (!upstream.ok) {
            const text = await upstream.text().catch(() => 'Upstream error');
            return new NextResponse(text, { status: upstream.status });
        }

        const ct = upstream.headers.get('content-type') ?? 'image/jpeg';
        const cl = upstream.headers.get('content-length') ?? undefined;
        const etag = upstream.headers.get('etag') ?? undefined;
        const lm = upstream.headers.get('last-modified') ?? undefined;

        return new NextResponse(upstream.body, {
            status: upstream.status,
            headers: {
                'Content-Type': ct,
                ...(cl ? { 'Content-Length': cl } : {}),
                ...(etag ? { ETag: etag } : {}),
                ...(lm ? { 'Last-Modified': lm } : {}),
                'Cache-Control': 'public, max-age=300',
                'Cross-Origin-Resource-Policy': 'cross-origin',
                Vary: 'Authorization, Cookie',
                'Content-Disposition': 'inline',
            },
        });
    } catch {
        return new NextResponse('Failed to fetch image', { status: 502 });
    }
}
