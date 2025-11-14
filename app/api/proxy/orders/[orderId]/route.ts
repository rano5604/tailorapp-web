// app/api/proxy/orders/[orderId]/route.ts
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

const API_ORIGIN = sanitizeOrigin(
    process.env.API_BASE || process.env.NEXT_PUBLIC_TAILORAPP_API || (isDev ? DEV_DEFAULT : PROD_DEFAULT)
);

function normalizeBearer(maybe?: string | null) {
    if (!maybe) return null;
    let t = maybe.trim().replace(/^"+|"+$/g, '');
    if (!t) return null;
    if (!/^Bearer\s+/i.test(t)) t = `Bearer ${t}`;
    return t;
}

function buildAuthHeaders(req: NextRequest) {
    // Priority: Authorization header > b/bearer query > cookies
    const url = new URL(req.url);
    const qpBearer = normalizeBearer(url.searchParams.get('b') || url.searchParams.get('bearer'));
    const hdrBearer = normalizeBearer(req.headers.get('authorization') || req.headers.get('Authorization'));
    const cookieBearer = normalizeBearer(
        req.cookies.get('access_token')?.value ||
        req.cookies.get('Authorization')?.value ||
        req.cookies.get('tb_access_token')?.value ||
        req.cookies.get('auth_token')?.value ||
        req.cookies.get('token')?.value ||
        null
    );

    const bearer = hdrBearer || qpBearer || cookieBearer;

    const h = new Headers();
    h.set('Accept', 'application/json');
    if (bearer) h.set('Authorization', bearer);

    // Many backends also accept session cookies
    const jsid = req.cookies.get('JSESSIONID')?.value;
    const tbAuth = req.cookies.get('tb_auth')?.value;
    const cookieParts: string[] = [];
    if (jsid) cookieParts.push(`JSESSIONID=${jsid}`);
    if (tbAuth) cookieParts.push(`tb_auth=${tbAuth}`);
    if (cookieParts.length) h.set('Cookie', cookieParts.join('; '));

    return h;
}

export async function GET(req: NextRequest, ctx: { params: { orderId?: string } }) {
    const orderId = ctx.params.orderId;
    if (!orderId) {
        return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
    }

    const headers = buildAuthHeaders(req);

    const upstream = await fetch(`${API_ORIGIN}/api/orders/${encodeURIComponent(orderId)}`, {
        headers,
        cache: 'no-store',
    });

    const body = await upstream.text().catch(() => '');
    return new NextResponse(body, {
        status: upstream.status,
        headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
    });
}
