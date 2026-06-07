import type { Request, Response, NextFunction } from 'express'
import { COOKIE_NAME, verifyToken, type JwtPayload } from './jwt.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

/** Populates req.user if a valid token cookie is present (never rejects). */
export function attachUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE_NAME]
  if (token) {
    const payload = verifyToken(token)
    if (payload) req.user = payload
  }
  next()
}

/** Rejects unauthenticated requests. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' })
  next()
}

/** Rejects non-admin requests. */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' })
  if (req.user.role !== 'ADMIN')
    return res.status(403).json({ error: 'Admin access required' })
  next()
}
