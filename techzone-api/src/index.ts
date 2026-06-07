import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { attachUser } from './auth/middleware.js'
import { authRouter } from './routes/auth.js'
import { productsRouter } from './routes/products.js'
import { reviewsRouter } from './routes/reviews.js'
import { ordersRouter } from './routes/orders.js'
import { adminRouter } from './routes/admin.js'
import { UPLOAD_DIR } from './lib/uploads.js'

const app = express()
const PORT = Number(process.env.PORT) || 4000
// One or more allowed origins (comma-separated), e.g.
//   CLIENT_ORIGIN=https://techzone.vercel.app,https://techzone-git-main-you.vercel.app
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173'
const allowedOrigins = CLIENT_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)

// Behind Railway/Render's HTTPS proxy: trust it so Secure cookies are allowed.
app.set('trust proxy', 1)

app.use(
  cors({
    origin(origin, callback) {
      // allow non-browser clients (curl, health checks) that send no Origin
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
      return callback(new Error(`Origin ${origin} not allowed by CORS`))
    },
    credentials: true,
  }),
)
app.use(express.json())
app.use(cookieParser())
app.use(attachUser)

// Serve uploaded product images (written by POST /api/products/upload).
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }))

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'techzone-api' }))

app.use('/api/auth', authRouter)
app.use('/api/products', productsRouter)
app.use('/api/reviews', reviewsRouter)
app.use('/api/orders', ordersRouter)
app.use('/api/admin', adminRouter)

// 404 for unknown API routes
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }))

// Central error handler
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: express.NextFunction,
  ) => {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  },
)

app.listen(PORT, () => {
  console.log(`🚀 TechZone API listening on http://localhost:${PORT}`)
})
