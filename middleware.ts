// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const COOKIE_NAMES = ['tb_auth', 'JSESSIONID', 'access_token'] // adjust to your backend

export default function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl
    const isDashboard = pathname.startsWith('/dashboard')
    const isLogin = pathname === '/login'
    const loggedIn = COOKIE_NAMES.some((n) => req.cookies.get(n))

    if (isDashboard && !loggedIn) {
        const url = new URL('/login', req.url)
        url.searchParams.set('redirect', pathname)
        return NextResponse.redirect(url)
    }

    if (isLogin && loggedIn) {
        return NextResponse.redirect(new URL('/dashboard', req.url))
    }

    return NextResponse.next()
}

export const config = {
    matcher: ['/login', '/dashboard/:path*'],
}