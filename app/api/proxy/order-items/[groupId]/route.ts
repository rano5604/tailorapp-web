// app/api/proxy/order-items/[groupId]/route.ts
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

    const h = new Headers({
        Accept: 'application/json',
        'Content-Type': 'application/json',
    });
    if (bearer) h.set('Authorization', bearer);

    const jsid = req.cookies.get('JSESSIONID')?.value;
    const tbAuth = req.cookies.get('tb_auth')?.value;
    const cookieParts: string[] = [];
    if (jsid) cookieParts.push(`JSESSIONID=${jsid}`);
    if (tbAuth) cookieParts.push(`tb_auth=${tbAuth}`);
    if (cookieParts.length) h.set('Cookie', cookieParts.join('; '));

    return h;
}

export async function PATCH(req: NextRequest, ctx: { params: { groupId?: string } }) {
    const groupId = ctx.params.groupId;
    if (!groupId) {
        return NextResponse.json({ error: 'Missing groupId' }, { status: 400 });
    }

    const headers = buildAuthHeaders(req);
    const body = await req.text();

    const upstream = await fetch(`${API_ORIGIN}/api/order-items/${encodeURIComponent(groupId)}`, {
        method: 'PATCH',
        headers,
        body,
    });

    const text = await upstream.text().catch(() => '');
    return new NextResponse(text, {
        status: upstream.status,
        headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
    });
}
