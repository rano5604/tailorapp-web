// app/api/proxy/order-items/[id]/route.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ORIGIN = (
    process.env.API_BASE ||
    process.env.NEXT_PUBLIC_TAILORAPP_API ||
    process.env.NEXT_PUBLIC_API_ORIGIN ||
    'http://localhost:8083'
).replace(/\/+$/, '');

function tryDecode(v?: string | null) { if (!v) return v ?? null; try { return decodeURIComponent(v); } catch { return v; } }
function normalizeBearer(raw?: string | null) {
    if (!raw) return null;
    const val = (tryDecode(raw) || raw).trim().replace(/^"+|"+$/g, '');
    return /^Bearer\s/i.test(val) ? val : `Bearer ${val}`;
}

function buildHeaders(req: NextRequest) {
    const h = new Headers({ Accept: 'application/json', 'Content-Type': 'application/json; charset=utf-8' });

    const incomingCookie = req.headers.get('cookie');
    if (incomingCookie) h.set('Cookie', incomingCookie);

    const headerAuth = req.headers.get('authorization');
    const cookieAuth = req.cookies.get('Authorization')?.value || req.cookies.get('access_token')?.value || null;
    const bearer = normalizeBearer(headerAuth || cookieAuth);
    if (bearer) h.set('Authorization', bearer);

    const csrfCookie =
        req.cookies.get('XSRF-TOKEN')?.value ||
        req.cookies.get('xsrf-token')?.value ||
        req.cookies.get('csrf-token')?.value ||
        null;

    if (csrfCookie && !req.headers.get('x-xsrf-token') && !req.headers.get('x-csrf-token')) {
        h.set('X-XSRF-TOKEN', csrfCookie);
    } else {
        ['x-xsrf-token', 'x-csrf-token', 'x-xcsrf-token'].forEach((k) => {
            const v = req.headers.get(k);
            if (v) h.set(k, v);
        });
    }
    return h;
}

async function forward(req: NextRequest, id: string, method: 'PATCH' | 'PUT') {
    const headers = buildHeaders(req);
    const bodyText = await req.text().catch(() => '');
    const upstream = await fetch(`${ORIGIN}/api/order-items/${encodeURIComponent(id)}`, {
        method, headers, body: bodyText || '{}', cache: 'no-store'
    });
    const text = await upstream.text().catch(() => '');
    return new NextResponse(text, {
        status: upstream.status,
        headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
    });
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await context.params;
    return forward(req, id, 'PATCH');
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await context.params;
    return forward(req, id, 'PUT');
}
