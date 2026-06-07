import { Router, raw } from 'express'
import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAdmin } from '../auth/middleware.js'
import { toApiProduct, toDbProduct } from '../lib/serialize.js'
import { IMAGE_EXT, MAX_UPLOAD_BYTES, UPLOAD_DIR } from '../lib/uploads.js'

export const productsRouter = Router()

const specItemSchema = z.object({ label: z.string(), value: z.string() })

const productSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  brand: z.string().min(1),
  category: z.string().min(1),
  subCategory: z.string().min(1),
  price: z.number().nonnegative(),
  discount: z.number().min(0).max(100).default(0),
  rating: z.number().min(0).max(5).default(0),
  reviewCount: z.number().int().nonnegative().default(0),
  stock: z.number().int().nonnegative().default(0),
  tagline: z.string().default(''),
  description: z.string().default(''),
  specs: z.array(specItemSchema).default([]),
  cpu: z.string().nullish(),
  gpu: z.string().nullish(),
  ram: z.string().nullish(),
  storage: z.string().nullish(),
  images: z.array(z.string()).default([]),
  accent: z.string().default('#a3f523'),
  badges: z.array(z.string()).default([]),
  featured: z.boolean().default(false),
  bestSeller: z.boolean().default(false),
  newArrival: z.boolean().default(false),
})

// GET /api/products — public, full catalogue
productsRouter.get('/', async (_req, res) => {
  const rows = await prisma.product.findMany({ orderBy: { createdAt: 'asc' } })
  res.json(rows.map(toApiProduct))
})

// GET /api/products/:slug — public
productsRouter.get('/:slug', async (req, res) => {
  const row = await prisma.product.findUnique({ where: { slug: req.params.slug } })
  if (!row) return res.status(404).json({ error: 'Product not found' })
  res.json(toApiProduct(row))
})

// POST /api/products/upload — admin. Accepts the raw image bytes as the request
// body (Content-Type: image/*) and returns the served URL. No multipart / extra
// deps needed; express.raw() buffers the body for us.
productsRouter.post(
  '/upload',
  requireAdmin,
  raw({ type: () => true, limit: MAX_UPLOAD_BYTES }),
  async (req, res) => {
    const mime = (req.headers['content-type'] ?? '').split(';')[0].trim()
    const ext = IMAGE_EXT[mime]
    if (!ext)
      return res.status(415).json({ error: 'Unsupported image type. Use PNG, JPG, WebP, GIF, or AVIF.' })

    const buf = req.body as Buffer
    if (!Buffer.isBuffer(buf) || buf.length === 0)
      return res.status(400).json({ error: 'Empty upload' })

    await mkdir(UPLOAD_DIR, { recursive: true })
    const filename = `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}.${ext}`
    await writeFile(join(UPLOAD_DIR, filename), buf)
    res.status(201).json({ url: `/uploads/${filename}` })
  },
)

// POST /api/products — admin
productsRouter.post('/', requireAdmin, async (req, res) => {
  const parsed = productSchema.safeParse(req.body)
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid product' })

  const dupe = await prisma.product.findUnique({ where: { slug: parsed.data.slug } })
  if (dupe) return res.status(409).json({ error: 'A product with that slug already exists' })

  const row = await prisma.product.create({ data: toDbProduct(parsed.data) })
  res.status(201).json(toApiProduct(row))
})

// PUT /api/products/:id — admin
productsRouter.put('/:id', requireAdmin, async (req, res) => {
  const parsed = productSchema.safeParse(req.body)
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid product' })

  const existing = await prisma.product.findUnique({ where: { id: req.params.id } })
  if (!existing) return res.status(404).json({ error: 'Product not found' })

  // guard against slug collision with a different product
  const slugOwner = await prisma.product.findUnique({ where: { slug: parsed.data.slug } })
  if (slugOwner && slugOwner.id !== req.params.id)
    return res.status(409).json({ error: 'Another product already uses that slug' })

  const row = await prisma.product.update({
    where: { id: req.params.id },
    data: toDbProduct(parsed.data),
  })
  res.json(toApiProduct(row))
})

// DELETE /api/products/:id — admin
productsRouter.delete('/:id', requireAdmin, async (req, res) => {
  const existing = await prisma.product.findUnique({ where: { id: req.params.id } })
  if (!existing) return res.status(404).json({ error: 'Product not found' })
  await prisma.product.delete({ where: { id: req.params.id } })
  res.json({ ok: true })
})
