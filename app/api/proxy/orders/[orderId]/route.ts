import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ORIGIN =
    (process.env.API_BASE ||
        process.env.NEXT_PUBLIC_TAILORAPP_API ||
        process.env.NEXT_PUBLIC_API_ORIGIN ||
        'http://localhost:8083').replace(/\/+$/, '');

const DEBUG = (process.env.DEBUG_PROXY ?? '').toLowerCase() === '1';

function tryDecode(v?: string | null) { if (!v) return v ?? null; try { return decodeURIComponent(v); } catch { return v; } }
function normalizeBearer(raw?: string | null) {
    if (!raw) return null;
    const val = (tryDecode(raw) || raw).trim().replace(/^"+|"+$/g, '');
    return /^Bearer\s/i.test(val) ? val : `Bearer ${val}`;
}
function buildHeaders(req: NextRequest) {
    const incomingCookie = req.headers.get('cookie') || '';
    const headerAuth = req.headers.get('authorization');
    const cookieAuth = req.cookies.get('Authorization')?.value || req.cookies.get('access_token')?.value || null;
    const bearer = normalizeBearer(headerAuth || cookieAuth);

    const csrfCookie =
        req.cookies.get('XSRF-TOKEN')?.value ||
        req.cookies.get('xsrf-token')?.value ||
        req.cookies.get('csrf-token')?.value ||
        null;

    const h = new Headers({ Accept: 'application/json', 'Content-Type': 'application/json; charset=utf-8' });
    if (incomingCookie) h.set('Cookie', incomingCookie);
    if (bearer) h.set('Authorization', bearer);

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
    // Read body once and reuse for retries
    const bodyText = await req.text().catch(() => '');
    const headers = buildHeaders(req);
    const url = `${ORIGIN}/api/orders/${encodeURIComponent(orderId)}`;

    // Try preferred, then PATCH, then POST (unique order)
    const methods = Array.from(new Set([preferred, 'PATCH', 'POST'])) as ('PUT'|'PATCH'|'POST')[];

    let lastStatus = 0;
    let lastText = '';
    let lastMethod: 'PUT' | 'PATCH' | 'POST' = preferred;

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

        // If the backend accepted it or returned something other than 405/404, return immediately
        if (upstream.ok || (upstream.status !== 405 && upstream.status !== 404)) {
            return new NextResponse(text, {
                status: upstream.status,
                headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
            });
        }

        // Keep last failure and try next method
        lastStatus = upstream.status;
        lastText = text;
        lastMethod = method;
    }

    // Exhausted all fallbacks; return the last response body/status
    if (DEBUG) console.warn('[proxy:orders] exhausted fallbacks; last=', lastMethod, lastStatus);
    return new NextResponse(lastText || `Upstream rejected ${lastMethod}`, {
        status: lastStatus || 500,
        headers: { 'Content-Type': 'application/json' },
    });
}

export async function PUT(req: NextRequest, { params }: { params: { orderId: string } }) {
    return forwardWithFallback(req, params.orderId, 'PUT');
}
export async function PATCH(req: NextRequest, { params }: { params: { orderId: string } }) {
    return forwardWithFallback(req, params.orderId, 'PATCH');
}
export async function POST(req: NextRequest, { params }: { params: { orderId: string } }) {
    return forwardWithFallback(req, params.orderId, 'POST');
}
