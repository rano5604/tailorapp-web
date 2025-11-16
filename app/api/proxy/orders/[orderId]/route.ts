// app/api/proxy/orders/[orderId]/route.ts
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

const DEBUG = (process.env.DEBUG_PROXY ?? '').toLowerCase() === '1';

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

async function forwardWithFallback(req: NextRequest, orderId: string, preferred: 'PUT' | 'PATCH' | 'POST') {
    const bodyText = await req.text().catch(() => '');
    const headers = buildHeaders(req);
    const url = `${ORIGIN}/api/orders/${encodeURIComponent(orderId)}`;

    const methods = Array.from(new Set([preferred, 'PATCH', 'POST'])) as ('PUT' | 'PATCH' | 'POST')[];

    for (const method of methods) {
        const upstream = await fetch(url, {
            method,
            headers,
            body: bodyText || '{}',
            cache: 'no-store',
            redirect: 'manual',
        });
        const text = await upstream.text().catch(() => '');
        if (DEBUG) console.log('[proxy:orders]', method, orderId, upstream.status, upstream.statusText, text.slice(0, 400));

        // Return immediately unless it's a method/route mismatch (405/404) and we still have fallbacks
        if (upstream.ok || (upstream.status !== 405 && upstream.status !== 404) || method === methods.at(-1)) {
            return new NextResponse(text, {
                status: upstream.status,
                headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
            });
        }
    }

    // Should not reach here; just in case
    return new NextResponse('Upstream error', { status: 502 });
}

export async function PUT(req: NextRequest, context: { params: Promise<{ orderId: string }> }) {
    const { orderId } = await context.params;
    return forwardWithFallback(req, orderId, 'PUT');
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ orderId: string }> }) {
    const { orderId } = await context.params;
    return forwardWithFallback(req, orderId, 'PATCH');
}

export async function POST(req: NextRequest, context: { params: Promise<{ orderId: string }> }) {
    const { orderId } = await context.params;
    return forwardWithFallback(req, orderId, 'POST');
}
