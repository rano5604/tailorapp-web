// app/orders/[orderId]/PayButton.client.tsx
'use client';

import React from 'react';

export default function PayButton({ onPay }: { onPay?: () => void }) {
    return (
        <button
            style={{
                padding: '8px 18px',
                background: '#1d4ed8',
                color: '#fff',
                fontWeight: 900,
                fontSize: 16,
                border: 'none',
                borderRadius: 10,
                cursor: 'pointer',
                boxShadow: '0 2px 8px #0001',
                letterSpacing: 1,
            }}
        >
            Pay
        </button>
    );
}
