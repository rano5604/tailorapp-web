'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

export default function EditButton({ orderId }: { orderId: string }) {
    const router = useRouter();
    return (
        <button
            type="button"
            onClick={() => router.push(`/orders/${encodeURIComponent(orderId)}/edit`)}
            style={{
                height: 36, padding: '0 14px', borderRadius: 10,
                border: '1px solid #1d4ed8', background: '#2563eb',
                color: '#fff', fontWeight: 800, cursor: 'pointer',
            }}
            aria-label="Update order"
        >
            Update
        </button>
    );
}
