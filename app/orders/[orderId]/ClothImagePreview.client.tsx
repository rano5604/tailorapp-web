'use client';

import { useEffect, useState, type CSSProperties, type ReactElement } from 'react';

type ClothImagePreviewProps = {
    src?: string | null;
    alt?: string;
    width?: number;
    height?: number;
};

export default function ClothImagePreview({
                                              src,
                                              alt = 'Cloth image',
                                              width = 86,
                                              height = 64,
                                          }: ClothImagePreviewProps): ReactElement | null {
    const [open, setOpen] = useState(false);

    // Close on Escape
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    if (!src) return null;

    const thumbStyle: CSSProperties = {
        width,
        height,
        objectFit: 'cover',
        border: '1px solid #e5e7eb',
        borderRadius: 10,
        background: '#fff',
        cursor: 'pointer',
        transition: 'box-shadow 0.2s',
        boxShadow: open ? '0 4px 24px #0003' : undefined,
    };

    return (
        <>
            <img
                src={src}
                alt={alt}
                width={width}
                height={height}
                style={thumbStyle}
                onClick={() => setOpen(true)}
                tabIndex={0}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen(true)}
                aria-label="View larger cloth image"
            />
            {open && (
                <div
                    role="dialog"
                    aria-modal="true"
                    onClick={() => setOpen(false)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 9999,
                        cursor: 'zoom-out',
                    }}
                >
                    <img
                        src={src}
                        alt={alt}
                        style={{
                            maxWidth: '90vw',
                            maxHeight: '80vh',
                            borderRadius: 16,
                            boxShadow: '0 8px 32px #0006',
                            background: '#fff',
                        }}
                    />
                </div>
            )}
        </>
    );
}
