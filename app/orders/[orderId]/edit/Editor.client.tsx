'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type VmMeasurement = {
    id?: number | string;
    nsId?: string | number | null;
    name: string;
    unit?: string | null;
    type: 'NUMERIC' | 'BOOLEAN' | 'TEXT' | string;
    value?: number | string | null;
    booleanValue?: boolean | null;
    textValue?: string | null;
};

type VmGroup = {
    // routing / identity
    orderCode: string;               // code in URL
    orderDbId: number | string;      // numeric db id for PUT
    groupId: number | string;        // measurementGroup id (for photos step)
    itemId?: number | string | null; // CATALOG item id

    // UI context
    title: string;

    // editable fields (this step)
    makingCharge?: number;           // item-level
    deliveryDate: string;            // group date
    specialInstruction?: string | null;
    measurements: VmMeasurement[];

    // order-level (if present from SSR)
    shopId?: number | string;
    customerName?: string;
    customerPhone?: string;
    customerGender?: string;
    customerPhoto?: string | null;
    paidAmount?: number;
    trialDate?: string;
    orderDeliveryDate?: string;
};

type Props = {
    initial: VmGroup;
    suggestions?: Record<string, number[]>;
};

const draftKey = (o: string | number, g: string | number) => `tb:draft:${o}:${g}`;
const isNil = (v: unknown) => v === null || v === undefined;
const isBlank = (v: unknown) => typeof v === 'string' && v.trim() === '';
const isPresent = (v: unknown) => !isNil(v) && !isBlank(v as any);

const safeDecode = (v?: string | null) => { if (!v) return ''; try { return decodeURIComponent(v); } catch { return v; } };
const normalizeBearer = (t?: string | null) => { if (!t) return null; const d = safeDecode(String(t).trim().replace(/^"+|"+$/g, '')); return /^Bearer\s/i.test(d) ? d : `Bearer ${d}`; };
const titleCase = (s: string) => { const a = (s || '').trim(); return a ? a.slice(0, 1).toUpperCase() + a.slice(1) : ''; };

const getBearer = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return null;
    const cookieAuth = document.cookie.match(/(?:^|; )Authorization=([^;]+)/)?.[1] || '';
    return (
        normalizeBearer(localStorage.getItem('accessToken')) ||
        normalizeBearer(localStorage.getItem('auth.accessToken')) ||
        normalizeBearer(sessionStorage.getItem('accessToken')) ||
        normalizeBearer(cookieAuth) ||
        null
    );
};
const getCsrf = () => {
    if (typeof document === 'undefined') return null;
    const m =
        document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]+)/) ||
        document.cookie.match(/(?:^|; )xsrf-token=([^;]+)/) ||
        document.cookie.match(/(?:^|; )csrf-token=([^;]+)/);
    return m ? safeDecode(m[1]) : null;
};

export default function Editor({ initial, suggestions = {} }: Props) {
    const router = useRouter();

    const [vm, setVm] = useState<VmGroup>({
        ...initial,
        makingCharge: Number.isFinite(Number(initial.makingCharge)) ? Number(initial.makingCharge) : 0,
    });
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const bearer = useMemo(() => getBearer(), []);
    const csrf = useMemo(() => getCsrf(), []);
    const initialRef = useRef<VmGroup>({
        ...initial,
        makingCharge: Number.isFinite(Number(initial.makingCharge)) ? Number(initial.makingCharge) : 0,
    });

    // Reset when navigating to another order/group
    useEffect(() => {
        const norm = Number.isFinite(Number(initial.makingCharge)) ? Number(initial.makingCharge) : 0;
        setVm({ ...initial, makingCharge: norm });
        initialRef.current = { ...initial, makingCharge: norm };
        setErr(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initial.orderDbId, initial.groupId, initial.itemId]);

    // Load draft (non-destructive)
    useEffect(() => {
        try {
            const raw = localStorage.getItem(draftKey(initial.orderCode, initial.groupId));
            if (!raw) return;
            const draft = JSON.parse(raw) as VmGroup;
            setVm(prev => ({
                ...prev,
                makingCharge: isPresent(draft.makingCharge) ? Number(draft.makingCharge) : (prev.makingCharge ?? 0),
                specialInstruction: isPresent(draft.specialInstruction) ? draft.specialInstruction : (prev.specialInstruction ?? null),
                deliveryDate: isPresent(draft.deliveryDate) ? String(draft.deliveryDate) : prev.deliveryDate,
                measurements: prev.measurements.map((m, i) => {
                    const dm = draft.measurements?.[i];
                    if (!dm) return m;
                    const t = String(m.type).toUpperCase();
                    return {
                        ...m,
                        value: t === 'NUMERIC' && isPresent(dm.value) ? Number(dm.value) : m.value,
                        booleanValue: t === 'BOOLEAN' && typeof dm.booleanValue === 'boolean' ? dm.booleanValue : m.booleanValue,
                        textValue: t === 'TEXT' && isPresent(dm.textValue) ? String(dm.textValue) : m.textValue,
                    };
                }),
            }));
        } catch {}
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function persist(next: VmGroup) {
        try { localStorage.setItem(draftKey(next.orderCode, next.groupId), JSON.stringify(next)); } catch {}
    }

    function setMeasurement(i: number, next: Partial<VmMeasurement>) {
        const updated: VmGroup = {
            ...vm,
            measurements: vm.measurements.map((m, idx) => (idx === i ? { ...m, ...next } : m)),
        };
        setVm(updated);
        persist(updated);
    }

    function bump(i: number, delta: number) {
        const cur = Number(vm.measurements[i].value || 0);
        const v = Number((cur + delta).toFixed(2));
        setMeasurement(i, { value: v });
    }

    // Map the UI measurement to backend order DTO (value as string)
    function toOrderMeasurement(m: VmMeasurement) {
        const t = String(m.type || '').toUpperCase();
        let value: string | undefined;
        if (t === 'NUMERIC') {
            const n = m.value === '' || m.value == null ? undefined : Number(m.value);
            value = n !== undefined && Number.isFinite(n) ? String(n) : undefined;
        } else if (t === 'BOOLEAN') {
            value = typeof m.booleanValue === 'boolean' ? String(m.booleanValue) : undefined;
        } else {
            value = m.textValue && m.textValue.trim() ? String(m.textValue) : undefined;
        }
        return {
            nameEn: m.name ?? 'Measurement',
            nameBn: undefined,
            unit: m.unit ?? null,
            type: t,
            nsId: m.nsId != null ? String(m.nsId) : (m.id != null ? String(m.id) : undefined),
            value,
        };
    }

    // Build full order payload; makingCharge goes on items[0]
    function buildOrderPayload() {
        const was = initialRef.current;

        const pick = <T,>(...vals: (T | undefined)[]) => vals.find(v => v !== undefined) as T | undefined;
        const nonEmpty = (s?: string | null) => (s && s.trim() ? s : undefined);

        const measurements = (vm.measurements || []).map(toOrderMeasurement).filter(x => x.value !== undefined);

        const groupBlock: Record<string, any> = {
            // makingCharge was moved OUT of group to item-level
            specialInstruction: nonEmpty(vm.specialInstruction || was.specialInstruction || undefined),
            deliveryDate: nonEmpty(vm.deliveryDate || was.deliveryDate || undefined),
            measurements,
        };

        const order: Record<string, any> = {
            shopId: pick(vm.shopId, was.shopId),
            customerName: nonEmpty(pick(vm.customerName, was.customerName)),
            customerPhone: nonEmpty(pick(vm.customerPhone, was.customerPhone)),
            customerGender: nonEmpty(pick(vm.customerGender, was.customerGender)),
            customerPhoto: nonEmpty(pick(vm.customerPhoto || undefined, was.customerPhoto || undefined)),
            paidAmount: pick(vm.paidAmount, was.paidAmount),
            trialDate: nonEmpty(pick(vm.trialDate, was.trialDate)),
            deliveryDate: nonEmpty(pick(vm.orderDeliveryDate, was.orderDeliveryDate, vm.deliveryDate, was.deliveryDate)),
            items: [
                {
                    itemId: pick(vm.itemId ?? undefined, was.itemId ?? undefined), // catalog id
                    makingCharge: Number.isFinite(Number(vm.makingCharge)) ? Number(vm.makingCharge) : undefined, // HERE
                    measurementGroups: [groupBlock],
                },
            ],
        };

        // prune empties
        const clean = (o: any): any => {
            if (Array.isArray(o)) return o.map(clean).filter(x => x != null && (typeof x !== 'object' || Object.keys(x).length));
            if (o && typeof o === 'object') {
                const out: any = {};
                for (const [k, v] of Object.entries(o)) {
                    const cv = clean(v);
                    if (cv == null) continue;
                    if (typeof cv === 'string' && cv.trim() === '') continue;
                    if (typeof cv === 'object' && !Array.isArray(cv) && Object.keys(cv).length === 0) continue;
                    if (Array.isArray(cv) && cv.length === 0) continue;
                    out[k] = cv;
                }
                return Object.keys(out).length ? out : null;
            }
            return o;
        };

        return clean(order) || {};
    }

    async function saveOrder(): Promise<boolean> {
        const payload = buildOrderPayload();

        if (!payload?.items?.[0]?.itemId) {
            throw new Error('Item is missing; cannot update order.');
        }

        const headers: HeadersInit = {
            'Content-Type': 'application/json; charset=utf-8',
            Accept: 'application/json',
            ...(bearer ? { Authorization: bearer } : {}),
            ...(csrf ? { 'X-XSRF-TOKEN': csrf } : {}),
        };

        const res = await fetch(`/api/proxy/orders/${encodeURIComponent(String(vm.orderDbId))}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(payload),
            credentials: 'include',
            cache: 'no-store',
        });

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            if (res.status === 401 || res.status === 403) {
                const redirectTo = `/orders/${encodeURIComponent(String(vm.orderCode))}/edit?groupId=${encodeURIComponent(String(vm.groupId))}`;
                router.replace(`/login?redirect=${encodeURIComponent(redirectTo)}`);
                return false;
            }
            throw new Error(text || `Order update failed (${res.status})`);
        }
        return true;
    }

    async function onNext() {
        try {
            setErr(null);
            setSaving(true);
            const ok = await saveOrder();
            if (!ok) return;
            try { localStorage.removeItem(draftKey(vm.orderCode, vm.groupId)); } catch {}
            router.push(`/orders/${encodeURIComponent(String(vm.orderCode))}/edit/photos?groupId=${encodeURIComponent(String(vm.groupId))}`);
        } catch (e: any) {
            setErr(e?.message || 'Failed to save changes');
        } finally {
            setSaving(false);
        }
    }

    function onBack() { router.push(`/orders/${encodeURIComponent(String(vm.orderCode))}`); }

    return (
        <>
            <style>{`
        .wrap { max-width: 960px; margin: 0 auto; padding: 16px; }
        @media (max-width: 640px) {
          .wrap { max-width: 100vw; padding: 8px; }
          .card { padding: 10px !important; }
          .btn { width: 100% !important; margin-bottom: 8px; }
          .input, .textarea { width: 100% !important; }
          .hdr { flex-direction: column !important; align-items: flex-start !important; gap: 6px !important; }
        }
      `}</style>

            <div className="wrap">
                <header className="hdr" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '6px 0 14px' }}>
                    <button type="button" onClick={onBack} aria-label="Back" style={iconBtn}>←</button>
                    <h1 style={brand}>
                        MEASURING PARAMETER — {titleCase(String(vm.title))} <span style={{ color: '#6b7280', fontWeight: 700 }}>2/4 STEPS</span>
                    </h1>
                    <div style={{ width: 36 }} />
                </header>

                {err ? <div style={errorBox}>{err}</div> : null}

                {/* Charge & Delivery */}
                <section className="card" style={card}>
                    <div style={cardTitle}>Charge & Delivery</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <label style={label}>
                            <span>Making Charge</span>
                            <input
                                type="number"
                                step="0.01"
                                value={Number.isFinite(Number(vm.makingCharge)) ? Number(vm.makingCharge) : 0}
                                onChange={(e) => {
                                    const next = { ...vm, makingCharge: e.target.value === '' ? 0 : Number(e.target.value) };
                                    setVm(next); persist(next);
                                }}
                                className="input"
                                style={input}
                                placeholder="Amount"
                            />
                        </label>
                        <label style={label}>
                            <span>Delivery Date</span>
                            <input
                                type="date"
                                value={vm.deliveryDate || ''}
                                onChange={(e) => { const next = { ...vm, deliveryDate: e.target.value }; setVm(next); persist(next); }}
                                className="input"
                                style={input}
                            />
                        </label>
                    </div>
                </section>

                {/* Measurements */}
                <section className="card" style={card}>
                    <div style={cardTitle}>Measuring Parameter</div>
                    {vm.measurements.length === 0 ? (
                        <div style={{ color: '#6b7280' }}>No measurements for this group.</div>
                    ) : (
                        vm.measurements.map((m, i) => {
                            const unit = m.unit || 'inch';
                            const t = String(m.type).toUpperCase();

                            if (t === 'BOOLEAN') {
                                return (
                                    <div key={m.id ?? i} style={{ marginBottom: 14 }}>
                                        <div style={fieldLabel}>{titleCase(m.name)}</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <input
                                                type="checkbox"
                                                checked={Boolean(m.booleanValue)}
                                                onChange={(e) => setMeasurement(i, { booleanValue: e.target.checked })}
                                            />
                                        </div>
                                    </div>
                                );
                            }

                            if (t === 'TEXT') {
                                return (
                                    <div key={m.id ?? i} style={{ marginBottom: 14 }}>
                                        <div style={fieldLabel}>{titleCase(m.name)}</div>
                                        <textarea
                                            placeholder="Enter text"
                                            value={m.textValue ?? ''}
                                            onChange={(e) => setMeasurement(i, { textValue: e.target.value })}
                                            className="textarea"
                                            style={textarea}
                                            rows={2}
                                        />
                                    </div>
                                );
                            }

                            const nameKey = String(m.name || '').toLowerCase();
                            const chips = suggestions[nameKey] || [];

                            return (
                                <div key={m.id ?? i} style={{ marginBottom: 18 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={fieldLabel}>{titleCase(m.name)}</div>
                                        <div style={{ color: '#6b7280', fontWeight: 700 }}>{unit}</div>
                                    </div>

                                    <div style={{ display: 'flex', gap: 0, marginTop: 6 }}>
                                        <input
                                            type="number"
                                            step="0.25"
                                            placeholder={`Enter (${unit})`}
                                            value={m.value ?? ''}
                                            onChange={(e) => setMeasurement(i, { value: e.target.value === '' ? '' : Number(e.target.value) })}
                                            className="input"
                                            style={inputWithButtons}
                                        />
                                        <button type="button" style={incBtn} onClick={() => bump(i, 0.25)}>+1/4</button>
                                        <button type="button" style={incBtn} onClick={() => bump(i, 0.5)}>+1/2</button>
                                        <button type="button" style={incBtnRight} onClick={() => bump(i, 0.75)}>+3/4</button>
                                    </div>

                                    {chips.length ? (
                                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                                            {chips.map((n) => {
                                                const active = Number(m.value) === n;
                                                return (
                                                    <button
                                                        type="button"
                                                        key={`${nameKey}-${n}`}
                                                        style={active ? chipActive : chip}
                                                        onClick={() => setMeasurement(i, { value: n })}
                                                    >
                                                        {n}”
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })
                    )}
                </section>

                {/* Special Request */}
                <section className="card" style={card}>
                    <div style={cardTitle}>Special Request</div>
                    <textarea
                        placeholder="Enter Request here"
                        value={vm.specialInstruction ?? ''}
                        onChange={(e) => { const next = { ...vm, specialInstruction: e.target.value }; setVm(next); persist(next); }}
                        className="textarea"
                        style={textarea}
                        rows={4}
                    />
                </section>

                <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button type="button" onClick={onBack} className="btn" style={btnGhost}>‹ Back</button>
                    <button type="button" onClick={onNext} disabled={saving} className="btn" style={btnPrimary}>
                        {saving ? 'Saving…' : 'Next ›'}
                    </button>
                </div>
            </div>
        </>
    );
}

/* Styles */
const brand: React.CSSProperties = { fontSize: 24, fontWeight: 700, margin: 0 };
const iconBtn: React.CSSProperties = {
    height: 36, width: 36, borderRadius: 10, border: '1px solid #e5e7eb',
    background: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, cursor: 'pointer',
};
const card: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 16, padding: 18, background: '#fff', marginTop: 16 };
const cardTitle: React.CSSProperties = { color: '#1d4ed8', fontWeight: 700, marginBottom: 8, fontSize: 18 };
const fieldLabel: React.CSSProperties = { fontWeight: 700, color: '#0f172a', fontSize: 18 };
const label: React.CSSProperties = { display: 'grid', gap: 6, fontWeight: 700, color: '#0f172a' };
const input: React.CSSProperties = { height: 40, padding: '0 10px', border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff' };
const inputWithButtons: React.CSSProperties = {
    flex: 1, height: 40, padding: '0 10px', border: '1px solid #e5e7eb', borderRight: 'none',
    borderTopLeftRadius: 10, borderBottomLeftRadius: 10, background: '#fff',
};
const incBtnBase: React.CSSProperties = { height: 40, padding: '0 12px', border: '1px solid #e5e7eb', background: '#fff', fontWeight: 700, cursor: 'pointer', color: '#2563eb' };
const incBtn: React.CSSProperties = { ...incBtnBase };
const incBtnRight: React.CSSProperties = { ...incBtnBase, borderTopRightRadius: 10, borderBottomRightRadius: 10 };
const chip: React.CSSProperties = { height: 34, padding: '0 12px', borderRadius: 20, border: '1px solid #e5e7eb', background: '#c5c9d1', fontWeight: 700, cursor: 'pointer', color: '#6b7280' };
const chipActive: React.CSSProperties = { ...chip, background: '#1d4ed8', borderColor: '#1d4ed8', color: '#fff' };
const textarea: React.CSSProperties = { width: '100%', padding: 10, borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff' };
const btnGhost: React.CSSProperties = { height: 44, padding: '0 18px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontWeight: 800, cursor: 'pointer' };
const btnPrimary: React.CSSProperties = { height: 44, padding: '0 18px', borderRadius: 10, border: '1px solid #1d4ed8', background: '#2563eb', color: '#fff', fontWeight: 800, cursor: 'pointer' };
const errorBox: React.CSSProperties = { border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 12, padding: 12, color: '#991B1B', fontWeight: 700 };
