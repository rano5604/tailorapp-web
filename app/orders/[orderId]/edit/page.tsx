// app/orders/[orderId]/edit/page.tsx
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Editor from './Editor.client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AnyObj = Record<string, any>;

const ORIGIN =
    (process.env.API_BASE ||
        process.env.NEXT_PUBLIC_TAILORAPP_API ||
        process.env.NEXT_PUBLIC_API_ORIGIN ||
        'http://localhost:8083').replace(/\/+$/, '');

function firstOf<T>(v?: T | T[]) {
    return Array.isArray(v) ? v.find(Boolean) : v;
}
function isValidSlug(x?: string | null) {
    if (!x) return false;
    const s = String(x).trim().toLowerCase();
    return !!s && s !== 'undefined' && s !== 'null';
}
function toDateInput(v?: string | null) {
    if (!v) return '';
    try {
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
        const dt = new Date(v);
        return Number.isNaN(+dt) ? '' : new Intl.DateTimeFormat('en-CA').format(dt);
    } catch {
        return '';
    }
}
function pickGroupId(sp: Record<string, string | string[] | undefined>) {
    return (firstOf(sp.groupId) || firstOf(sp.gid) || '') as string;
}

function findGroup(d: AnyObj, groupId?: string | number) {
    const items: AnyObj[] = Array.isArray(d.items) ? d.items : [];
    let parentItem: AnyObj | null = null;
    let group: AnyObj | null = null;

    if (groupId != null && String(groupId) !== '') {
        for (const it of items) {
            const gs: AnyObj[] = Array.isArray(it.measurementGroups) ? it.measurementGroups : [];
            const found = gs.find((g) => String(g.id) === String(groupId)) ?? null;
            if (found) {
                parentItem = it;
                group = found;
                break;
            }
        }
    }
    if (!group) {
        for (const it of items) {
            const gs: AnyObj[] = Array.isArray(it.measurementGroups) ? it.measurementGroups : [];
            if (gs.length) {
                parentItem = it;
                group = gs[0];
                break;
            }
        }
    }
    return { parentItem, group };
}

function buildVm(d: AnyObj, groupId?: string | number) {
    const { parentItem, group } = findGroup(d, groupId);
    if (!group) return null;

    // Normalize measurements for the client Editor
    const measurements = Array.isArray(group.measurements)
        ? group.measurements.map((m: AnyObj) => {
            const rawVal = m.value;
            const numeric =
                typeof rawVal === 'number'
                    ? rawVal
                    : rawVal != null && rawVal !== '' && !Number.isNaN(Number(rawVal))
                        ? Number(rawVal)
                        : '';
            return {
                id: m.id,
                nsId: m.nsId ?? m.id, // backend identifier (preferred nsId, fallback id)
                name: m.nameEn ?? m.name ?? 'Measurement',
                unit: m.unit ?? null,
                type: String(m.type || 'NUMERIC').toUpperCase(),
                value:
                    String(m.type || 'NUMERIC').toUpperCase() === 'NUMERIC'
                        ? numeric
                        : '',
                booleanValue:
                    String(m.type || '').toUpperCase() === 'BOOLEAN'
                        ? (typeof m.booleanValue === 'boolean'
                            ? m.booleanValue
                            : typeof rawVal === 'boolean'
                                ? rawVal
                                : null)
                        : null,
                textValue:
                    String(m.type || '').toUpperCase() === 'TEXT'
                        ? (m.textValue ??
                            (typeof rawVal === 'string' && Number.isNaN(Number(rawVal)) ? rawVal : ''))
                        : '',
            };
        })
        : [];

    return {
        // routing identity
        orderCode: d.orderId ?? d.code ?? '', // human/code slug used in URLs
        orderDbId: d.id, // numeric db id for PUT /api/orders/{id}
        groupId: group.id,

        // IMPORTANT: catalog item id (not the order-item row id)
        itemId: parentItem?.itemId ?? null,

        // optional: if you still need the row id elsewhere
        // orderItemId: parentItem?.id ?? null,

        // UI context
        title: parentItem?.itemName ?? parentItem?.title ?? 'Item',

        // editable group fields for this step
        deliveryDate: toDateInput(group.deliveryDate || d.deliveryDate || ''),
        specialInstruction: group.specialInstruction ?? null,
        measurements,

        // order-level fields needed by PUT (pass-through from API if present)
        shopId: d.shopId ?? undefined,
        customerName: d.customerName ?? '',
        customerPhone: d.customerPhone ?? '',
        customerGender: d.customerGender ?? '',
        customerPhoto: d.customerPhoto ?? null,
        paidAmount: d.paidAmount ?? undefined,
        trialDate: toDateInput(d.trialDate || ''),
        orderDeliveryDate: toDateInput(d.deliveryDate || ''),
    };
}

export default async function EditOrderItemPage({
                                                    params,
                                                    searchParams,
                                                }: {
    params: Promise<{ orderId: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { orderId } = await params;
    const sp = await searchParams;

    // groupId can be passed as ?groupId= or ?gid=
    const requestedGroupId = pickGroupId(sp);

    // order "slug" in the URL is the order code (e.g., "1-20251113-0007")
    let slug = orderId;
    if (!isValidSlug(slug)) {
        const fallback =
            (firstOf(sp.orderId) as string) ||
            (firstOf(sp.code) as string) ||
            (firstOf(sp.id) as string) ||
            '';
        if (isValidSlug(fallback)) slug = String(fallback);
    }
    if (!isValidSlug(slug)) notFound();

    // auth from incoming cookies (for SSR fetch)
    const c = await cookies();
    const accessTokenRaw = c.get('access_token')?.value || c.get('Authorization')?.value || null;
    const jSessionId = c.get('JSESSIONID')?.value;
    const tbAuth = c.get('tb_auth')?.value;

    if (!accessTokenRaw && !jSessionId && !tbAuth) {
        const redirectTo = requestedGroupId
            ? `/orders/${encodeURIComponent(slug)}/edit?groupId=${encodeURIComponent(String(requestedGroupId))}`
            : `/orders/${encodeURIComponent(slug)}/edit`;
        redirect(`/login?redirect=${encodeURIComponent(redirectTo)}`);
    }

    const bearer =
        accessTokenRaw && accessTokenRaw.startsWith('Bearer ')
            ? accessTokenRaw
            : accessTokenRaw
                ? `Bearer ${accessTokenRaw}`
                : null;

    const apiHeaders = new Headers({ Accept: 'application/json' });
    if (bearer) apiHeaders.set('Authorization', bearer);
    const cookieHeader = [
        jSessionId ? `JSESSIONID=${jSessionId}` : undefined,
        tbAuth ? `tb_auth=${tbAuth}` : undefined,
    ]
        .filter(Boolean)
        .join('; ');
    if (cookieHeader) apiHeaders.set('Cookie', cookieHeader);

    // Fetch order by code/slug (server supports GET /api/orders/{code})
    const url = `${ORIGIN}/api/orders/${encodeURIComponent(String(slug))}`;
    const res = await fetch(url, { headers: apiHeaders, cache: 'no-store' });

    if (res.status === 401 || res.status === 403) {
        const redirectTo = requestedGroupId
            ? `/orders/${encodeURIComponent(slug)}/edit?groupId=${encodeURIComponent(String(requestedGroupId))}`
            : `/orders/${encodeURIComponent(slug)}/edit`;
        redirect(`/login?redirect=${encodeURIComponent(redirectTo)}`);
    }
    if (!res.ok) notFound();

    const json = (await res.json().catch(() => null)) as AnyObj | null;
    const data = json?.data ?? json;
    if (!data) notFound();

    // OPTIONAL: gate by order status if your flow requires it
    // if (String(data.status || '').toUpperCase() !== 'MEASUREMENT_DONE') {
    //   redirect(`/orders/${encodeURIComponent(slug)}?edit=blocked`);
    // }

    const vm = buildVm(data, requestedGroupId || undefined);
    if (!vm) notFound();

    return (
        <main style={{ maxWidth: 960, margin: '0 auto', padding: 16 }}>
            {/* Editor will PUT the whole order via /api/proxy/orders/{orderDbId} on Next */}
            <Editor initial={vm} />
        </main>
    );
}
