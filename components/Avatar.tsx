'use client'

import Image from 'next/image'
import { useMemo, useState } from 'react'

const PUBLIC_BASE =
    (process.env.NEXT_PUBLIC_TAILORAPP_API || 'http://109.123.239.27:8083').replace(/\/$/, '')

type Props = {
    name: string
    photoUrl?: string | null
    size?: number
    rounding?: number
    className?: string
}

function normalizePhoto(photo?: string | null): string | null {
    if (!photo || typeof photo !== 'string') return null
    // Absolute URL → use as is; else prefix your public API base (not localhost)
    return /^https?:\/\//i.test(photo) ? photo : `${PUBLIC_BASE}${photo.startsWith('/') ? '' : '/'}${photo}`
}

function dicebear(name: string, size: number) {
    const seed = encodeURIComponent(name || 'User')
    return `https://api.dicebear.com/9.x/adventurer-neutral/png?seed=${seed}&size=${size * 2}&backgroundType=gradientLinear`
}

export default function Avatar({
                                   name,
                                   photoUrl,
                                   size = 64,
                                   rounding = 12,
                                   className,
                               }: Props) {
    const normalized = useMemo(() => normalizePhoto(photoUrl), [photoUrl])
    // Route through the proxy only for real photos
    const proxied = normalized ? `/api/proxy/image?src=${encodeURIComponent(normalized)}` : null
    const fallback = useMemo(() => dicebear(name, size), [name, size])

    const [src, setSrc] = useState<string>(proxied ?? fallback)

    return (
        <Image
            src={src}
            alt={`${name} avatar`}
            width={size}
            height={size}
            className={className}
            style={{ objectFit: 'cover', borderRadius: rounding }}
            // Skip optimizer in dev; works fine with our proxy route
            unoptimized={process.env.NODE_ENV !== 'production'}
            onError={() => {
                if (src !== fallback) setSrc(fallback)
            }}
        />
    )
}