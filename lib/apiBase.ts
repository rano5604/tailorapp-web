const DEV_DEFAULT = 'http://localhost:8083';
const PROD_DEFAULT = 'http://109.123.239.27:8083';
const dev = process.env.NODE_ENV !== 'production';

const raw =
    process.env.NEXT_PUBLIC_TAILORAPP_API ||
    process.env.NEXT_PUBLIC_API_BASE ||
    process.env.API_BASE ||
    (dev ? DEV_DEFAULT : PROD_DEFAULT);

function sanitizeOrigin(v: string) {
    let s = (v || '').trim();
    s = s.replace(/\/+$/, '');
    s = s.replace(/\/api$/, '');
    return s;
}

export const API_ORIGIN = sanitizeOrigin(raw);
export const api = (path: string) =>
    API_ORIGIN + (path.startsWith('/') ? path : `/${path}`);