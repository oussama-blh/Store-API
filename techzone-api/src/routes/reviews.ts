import { Router } from 'express'
import { prisma } from '../db.js'

export const reviewsRouter = Router()

// GET /api/reviews?productId=... — public. Returns the frontend Review shape.
reviewsRouter.get('/', async (req, res) => {
  const productId = typeof req.query.productId === 'string' ? req.query.productId : undefined
  const rows = await prisma.review.findMany({
    where: productId ? { productId } : undefined,
    orderBy: { createdAt: 'desc' },
  })
  res.json(
    rows.map((r) => ({
      id: r.id,
      author: r.author,
      role: r.role,
      rating: r.rating,
      title: r.title,
      body: r.body,
      product: r.productLabel ?? undefined,
    })),
  )
})
