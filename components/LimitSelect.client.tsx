'use client';

import { useRouter } from 'next/navigation';
import React from 'react';

export default function LimitSelect({
                                        limit,
                                        shopId,
                                        pathname,
                                        style,
                                        options = [5, 10, 20],
                                    }: {
    limit: number;
    shopId: number | string;
    pathname: string;      // e.g., '/orders/delivery-overdue'
    style?: React.CSSProperties;
    options?: number[];
}) {
    const router = useRouter();

    function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
        const nextLimit = Number(e.target.value) || 10;
        const search = new URLSearchParams(window.location.search);
        search.set('shopId', String(shopId));
        search.set('page', '0');              // reset page when limit changes
        search.set('limit', String(nextLimit));
        router.push(`${pathname}?${search.toString()}`);
    }

    return (
        <select defaultValue={String(limit)} onChange={onChange} style={style}>
            {options.map((n) => (
                <option key={n} value={n}>
                    {n}/page
                </option>
            ))}
        </select>
    );
}
