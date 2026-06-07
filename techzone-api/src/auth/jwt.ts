import jwt from 'jsonwebtoken'

const SECRET = process.env.JWT_SECRET || 'dev-secret-do-not-use-in-prod'
const EXPIRES_IN = '7d'

export interface JwtPayload {
  sub: string // user id
  email: string
  role: string // ADMIN | CUSTOMER
  name: string
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN })
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, SECRET) as JwtPayload
  } catch {
    return null
  }
}

export const COOKIE_NAME = 'tz_token'

/* Cross-site cookies: when the storefront (e.g. *.vercel.app) and the API
   (e.g. *.up.railway.app) live on different domains, the browser only sends the
   JWT cookie if it is SameSite=None and Secure. Enable that by setting
   CROSS_SITE_COOKIES=true on the deployed API. Locally (same-origin via Vite
   proxy) we keep the safer SameSite=Lax default. */
const crossSite = process.env.CROSS_SITE_COOKIES === 'true'

/** Cookie options shared by login/logout. */
export const cookieOptions = {
  httpOnly: true,
  sameSite: crossSite ? ('none' as const) : ('lax' as const),
  // SameSite=None requires Secure; also secure in any production deploy.
  secure: crossSite || process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
}
