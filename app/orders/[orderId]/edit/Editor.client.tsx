'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type VmMeasurement = {
    id?: number | string;
    name: string;
    unit?: string | null;
    type: 'NUMERIC' | 'BOOLEAN' | 'TEXT' | string;
    value?: number | string | null;
    booleanValue?: boolean | null;
    textValue?: string | null;
};

type VmGroup = {
    orderId: string;
    groupId: number | string;
    itemId?: number | string | null;
    title: string;
    makingCharge: number;
    deliveryDate: string; // YYYY-MM-DD
    specialInstruction?: string | null;
    measurements: VmMeasurement[];
};

const draftKey = (o: string | number, g: string | number) => `tb:draft:${o}:${g}`;

function titleCase(s: string) {
    const a = (s || '').trim();
    return a ? a.slice(0, 1).toUpperCase() + a.slice(1) : '';
}
function fmtDateInput(d?: string | null) {
    if (!d) return '';
    try {
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
        const dt = new Date(d);
        return Number.isNaN(+dt) ? '' : new Intl.DateTimeFormat('en-CA').format(dt);
    } catch { return ''; }
}
function normalizeBearer(t?: string | null) {
    if (!t) return null;
    const s = t.trim().replace(/^"+|"+$/g, '');
    return /^Bearer\s+/i.test(s) ? s : `Bearer ${s}`;
}
function getBearer() {
    return (
        normalizeBearer(localStorage.getItem('accessToken')) ||
        normalizeBearer(localStorage.getItem('auth.accessToken')) ||
        normalizeBearer(sessionStorage.getItem('accessToken')) ||
        normalizeBearer(document.cookie.match(/(?:^|; )Authorization=([^;]+)/)?.[1] || '') ||
        null
    );
}

// Presence helpers: only override when a draft value is actually present
const isPresent = (v: unknown) =>
    !(v === null || v === undefined || (typeof v === 'string' && v.trim() === ''));
const pick = <T,>(draftVal: T | undefined, baseVal: T): T =>
    (isPresent(draftVal) ? (draftVal as T) : baseVal);

const chipSets: Record<string, number[]> = {
    chest: [32, 34, 36, 38, 40, 42, 44],
    length: [38, 40, 42, 44],
};

export default function Editor({ initial }: { initial: VmGroup }) {
    const router = useRouter();
    const [vm, setVm] = useState<VmGroup>(initial);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const bearer = useMemo(() => getBearer(), []);

    // Merge any draft WITHOUT clobbering server values with empty strings
    useEffect(() => {
        try {
            const raw = localStorage.getItem(draftKey(initial.orderId, initial.groupId));
            if (!raw) return;

            const draft = JSON.parse(raw) as VmGroup;
            setVm((prev) => ({
                ...prev,
                specialInstruction: pick(draft.specialInstruction ?? undefined, prev.specialInstruction ?? null),
                makingCharge: Number(pick(draft.makingCharge as any, prev.makingCharge)),
                deliveryDate: pick(draft.deliveryDate ?? undefined, prev.deliveryDate),
                measurements: prev.measurements.map((m, i) => {
                    const dm = draft.measurements?.[i];
                    if (!dm) return m;
                    const t = String(m.type).toUpperCase();
                    return {
                        ...m,
                        value:
                            t === 'NUMERIC'
                                ? (isPresent(dm.value) ? Number(dm.value) : m.value)
                                : m.value,
                        booleanValue:
                            t === 'BOOLEAN'
                                ? (typeof dm.booleanValue === 'boolean' ? dm.booleanValue : m.booleanValue)
                                : m.booleanValue,
                        textValue:
                            t === 'TEXT'
                                ? (isPresent(dm.textValue) ? String(dm.textValue) : m.textValue)
                                : m.textValue,
                    };
                }),
            }));
        } catch {
            // ignore malformed draft
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function persist(next: VmGroup) {
        try { localStorage.setItem(draftKey(next.orderId, next.groupId), JSON.stringify(next)); } catch {}
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

    async function savePatch() {
        const payload = {
            makingCharge: vm.makingCharge,
            deliveryDate: vm.deliveryDate || null,
            specialInstruction: vm.specialInstruction ?? null,
            measurements: vm.measurements.map((m) => ({
                id: m.id,
                type: m.type,
                value: String(m.type).toUpperCase() === 'NUMERIC'
                    ? (m.value !== '' && m.value != null ? Number(m.value) : null)
                    : null,
                booleanValue: String(m.type).toUpperCase() === 'BOOLEAN' ? Boolean(m.booleanValue) : null,
                textValue: String(m.type).toUpperCase() === 'TEXT' ? (m.textValue ?? null) : null,
            })),
        };

        const headers: HeadersInit = { 'Content-Type': 'application/json', Accept: 'application/json' };
        if (bearer) headers['Authorization'] = bearer;

        const res = await fetch(`/api/proxy/order-items/${encodeURIComponent(String(vm.groupId))}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(payload),
        });
        const text = await res.text();
        if (!res.ok) throw new Error(text || `Update failed (${res.status})`);
    }

    async function onNext() {
        try {
            setErr(null);
            setSaving(true);
            await savePatch(); // auto-save before continuing
            try { localStorage.removeItem(draftKey(vm.orderId, vm.groupId)); } catch {}
            router.push(`/orders/${encodeURIComponent(String(vm.orderId))}/edit/photos?groupId=${encodeURIComponent(String(vm.groupId))}`);
        } catch (e: any) {
            setErr(e?.message || 'Failed to save changes');
        } finally {
            setSaving(false);
        }
    }

    function onBack() {
        router.push(`/orders/${encodeURIComponent(String(vm.orderId))}`);
    }

    return (
        <>
            <header style={appBar}>
                <button type="button" onClick={() => router.back()} aria-label="Back" style={iconBtn}>←</button>
                <h1 style={brand}>MEASURING PARAMETER — {titleCase(String(vm.title))} <span style={{ color: '#6b7280', fontWeight: 700 }}>2/4 STEPS</span></h1>
                <div style={{ width: 36 }} />
            </header>

            {err ? <div style={errorBox}>{err}</div> : null}

            {/* Measurements */}
            <section style={card}>
                <div style={cardTitle}>MEASURING PARAMETER</div>

                {vm.measurements.map((m, i) => {
                    const name = String(m.name || '').toLowerCase();
                    const chips = chipSets[name] || [];
                    const unit = m.unit || 'inch';
                    const t = String(m.type).toUpperCase();

                    if (t === 'BOOLEAN') {
                        return (
                            <div key={m.id ?? i} style={{ marginBottom: 14 }}>
                                <div style={fieldLabel}>{titleCase(name)}</div>
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
                                <div style={fieldLabel}>{titleCase(name)}</div>
                                <textarea
                                    placeholder="Enter text"
                                    value={m.textValue ?? ''}
                                    onChange={(e) => setMeasurement(i, { textValue: e.target.value })}
                                    style={textarea}
                                    rows={2}
                                />
                            </div>
                        );
                    }

                    // Numeric with quick increments and chips
                    return (
                        <div key={m.id ?? i} style={{ marginBottom: 18 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={fieldLabel}>{titleCase(name)}</div>
                                <div style={{ color: '#6b7280', fontWeight: 700 }}>{unit}</div>
                            </div>

                            <div style={{ display: 'flex', gap: 0, marginTop: 6 }}>
                                <input
                                    type="number"
                                    step="0.25"
                                    placeholder="Enter (inch)"
                                    value={m.value ?? ''}   // PRE-FILLED from server or draft
                                    onChange={(e) => setMeasurement(i, { value: e.target.value === '' ? '' : Number(e.target.value) })}
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
                                                key={`${name}-${n}`}
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
                })}
            </section>

            {/* Special Request */}
            <section style={card}>
                <div style={cardTitle}>Special Request</div>
                <textarea
                    placeholder="Enter Request here"
                    value={vm.specialInstruction ?? ''}
                    onChange={(e) => { const next = { ...vm, specialInstruction: e.target.value }; setVm(next); persist(next); }}
                    style={textarea}
                    rows={4}
                />
            </section>

            <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
                <button type="button" onClick={onBack} style={btnGhost}>‹ Back</button>
                <button type="button" onClick={onNext} disabled={saving} style={btnPrimary}>
                    {saving ? 'Saving…' : 'Next ›'}
                </button>
            </div>
        </>
    );
}

/* Styles */
const appBar: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '6px 0 14px' };
const iconBtn: React.CSSProperties = { height: 36, width: 36, borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, cursor: 'pointer' };
const brand: React.CSSProperties = { fontSize: 18, fontWeight: 900, margin: 0 };
const card: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, background: '#fff', marginTop: 14 };
const cardTitle: React.CSSProperties = { color: '#1d4ed8', fontWeight: 800, marginBottom: 8, fontSize: 14 };
const fieldLabel: React.CSSProperties = { fontWeight: 800, color: '#0f172a' };
const inputWithButtons: React.CSSProperties = {
    flex: 1, height: 40, padding: '0 10px', border: '1px solid #e5e7eb', borderRight: 'none',
    borderTopLeftRadius: 10, borderBottomLeftRadius: 10, background: '#fff',
};
const incBtnBase: React.CSSProperties = {
    height: 40, padding: '0 12px', border: '1px solid #e5e7eb', background: '#fff', fontWeight: 800, cursor: 'pointer',
};
const incBtn: React.CSSProperties = { ...incBtnBase };
const incBtnRight: React.CSSProperties = { ...incBtnBase, borderTopRightRadius: 10, borderBottomRightRadius: 10 };
const chip: React.CSSProperties = {
    height: 34, padding: '0 12px', borderRadius: 20, border: '1px solid #e5e7eb', background: '#fff', fontWeight: 800, cursor: 'pointer',
};
const chipActive: React.CSSProperties = { ...chip, background: '#1d4ed8', borderColor: '#1d4ed8', color: '#fff' };
const textarea: React.CSSProperties = { width: '100%', padding: 10, borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff' };
const btnGhost: React.CSSProperties = { height: 44, padding: '0 18px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontWeight: 800, cursor: 'pointer' };
const btnPrimary: React.CSSProperties = { height: 44, padding: '0 18px', borderRadius: 10, border: '1px solid #1d4ed8', background: '#2563eb', color: '#fff', fontWeight: 800, cursor: 'pointer' };
const errorBox: React.CSSProperties = { border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 12, padding: 12, color: '#991B1B', fontWeight: 700 };
