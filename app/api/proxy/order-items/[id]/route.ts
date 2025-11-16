// app/api/proxy/order-items/[id]/route.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ORIGIN =
    process.env.API_BASE ||
    process.env.NEXT_PUBLIC_TAILORAPP_API ||
    process.env.NEXT_PUBLIC_API_ORIGIN ||
    'http://localhost:8083';

function tryDecode(v?: string | null) {
    if (!v) return v ?? null;
    try { return decodeURIComponent(v); } catch { return v; }
}
function normalizeBearer(raw?: string | null) {
    if (!raw) return null;
    const val = (tryDecode(raw) || raw).trim().replace(/^"+|"+$/g, '');
    return /^Bearer\s/i.test(val) ? val : `Bearer ${val}`;
}

async function forward(req: NextRequest, id: string, method: 'PATCH' | 'PUT') {
    // Auth
    const headerAuth = req.headers.get('authorization');
    const cookieAuth =
        req.cookies.get('Authorization')?.value ||
        req.cookies.get('access_token')?.value ||
        null;
    const bearer = normalizeBearer(headerAuth || cookieAuth);

    // Pass ALL cookies straight through
    const incomingCookie = req.headers.get('cookie') || '';

    // CSRF (cookie or pass-through header)
    const csrfCookie =
        req.cookies.get('XSRF-TOKEN')?.value ||
        req.cookies.get('xsrf-token')?.value ||
        req.cookies.get('csrf-token')?.value ||
        null;

    const headers = new Headers({
        Accept: 'application/json',
        'Content-Type': 'application/json',
    });
    if (incomingCookie) headers.set('Cookie', incomingCookie);
    if (bearer) headers.set('Authorization', bearer);

    if (csrfCookie && !req.headers.get('x-xsrf-token') && !req.headers.get('x-csrf-token')) {
        headers.set('X-XSRF-TOKEN', csrfCookie);
    } else {
        ['x-xsrf-token', 'x-csrf-token', 'x-xcsrf-token'].forEach((h) => {
            const v = req.headers.get(h);
            if (v) headers.set(h, v);
        });
    }

    const body = await req.json().catch(() => ({}));

    const upstream = await fetch(`${ORIGIN.replace(/\/+$/, '')}/api/order-items/${encodeURIComponent(id)}`, {
        method,
        headers,
        body: JSON.stringify(body),
        cache: 'no-store',
    });

    const text = await upstream.text().catch(() => '');
    return new NextResponse(text, {
        status: upstream.status,
        headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
    });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
    return forward(req, params.id, 'PATCH');
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
    return forward(req, params.id, 'PUT');
}
