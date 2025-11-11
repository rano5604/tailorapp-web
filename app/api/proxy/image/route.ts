// app/api/proxy/image/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEV_DEFAULT = 'http://localhost:8083';
const PROD_DEFAULT = 'http://109.123.239.27:8083';
const dev = process.env.NODE_ENV !== 'production';

function sanitizeOrigin(v: string) {
    let s = (v || '').trim();
    s = s.replace(/\/+$/, '');
    s = s.replace(/\/api$/, '');
    return s;
}

const rawOrigin =
    process.env.API_BASE ||
    process.env.NEXT_PUBLIC_TAILORAPP_API ||
    (dev ? DEV_DEFAULT : PROD_DEFAULT);

const API_ORIGIN = sanitizeOrigin(rawOrigin);

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const src = searchParams.get('src');
    if (!src) return new NextResponse('Missing src', { status: 400 });

    // Option A: use req.cookies (no await)
    const token =
        req.cookies.get('access_token')?.value ??
        (await cookies()).get('access_token')?.value; // Option B: await cookies()

    // Build absolute target URL
    let target: URL;
    try {
        target = /^https?:\/\//i.test(src)
            ? new URL(src)
            : new URL(src.startsWith('/') ? src : `/${src}`, API_ORIGIN);
    } catch {
        return new NextResponse('Invalid src', { status: 400 });
    }

    // Prevent open-proxy: only allow your API origin
    if (target.origin !== new URL(API_ORIGIN).origin) {
        return new NextResponse('Forbidden origin', { status: 403 });
    }

    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
        const upstream = await fetch(target.toString(), {
            headers,
            cache: 'no-store',
        });

        if (!upstream.ok) {
            const text = await upstream.text().catch(() => 'Upstream error');
            return new NextResponse(text, { status: upstream.status });
        }

        const ct = upstream.headers.get('content-type') ?? 'image/jpeg';
        const cl = upstream.headers.get('content-length') ?? undefined;
        const etag = upstream.headers.get('etag') ?? undefined;
        const lastModified = upstream.headers.get('last-modified') ?? undefined;

        return new NextResponse(upstream.body, {
            status: 200,
            headers: {
                'Content-Type': ct,
                ...(cl ? { 'Content-Length': cl } : {}),
                ...(etag ? { ETag: etag } : {}),
                ...(lastModified ? { 'Last-Modified': lastModified } : {}),
                'Cache-Control': 'public, max-age=300',
                'Cross-Origin-Resource-Policy': 'cross-origin',
            },
        });
    } catch {
        return new NextResponse('Failed to fetch image', { status: 502 });
    }
}