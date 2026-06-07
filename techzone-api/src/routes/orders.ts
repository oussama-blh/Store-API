import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAdmin } from '../auth/middleware.js'

export const ordersRouter = Router()

const ORDER_STATUSES = ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED'] as const

const orderSchema = z.object({
  customer: z.object({
    fullName: z.string().min(1),
    email: z.string().email(),
    address: z.string().min(1),
    city: z.string().min(1),
    zip: z.string().min(1),
  }),
  items: z
    .array(z.object({ productId: z.string().min(1), qty: z.number().int().positive() }))
    .min(1, 'Cart is empty'),
  couponCode: z.string().optional().nullable(),
})

const round = (n: number) => Math.round(n)
const discountedPrice = (price: number, discount: number) =>
  round(price * (1 - (discount || 0) / 100))

// POST /api/orders — public (guest checkout allowed). Decrements stock in a transaction.
ordersRouter.post('/', async (req, res) => {
  const parsed = orderSchema.safeParse(req.body)
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid order' })

  const { customer, items, couponCode } = parsed.data

  try {
    const order = await prisma.$transaction(async (tx) => {
      // Load products + validate stock
      const products = await tx.product.findMany({
        where: { id: { in: items.map((i) => i.productId) } },
      })
      const byId = new Map(products.map((p) => [p.id, p]))

      const lineItems = items.map((i) => {
        const p = byId.get(i.productId)
        if (!p) throw new Error(`Product ${i.productId} not found`)
        if (p.stock < i.qty) throw new Error(`Insufficient stock for ${p.name}`)
        return { product: p, qty: i.qty, unitPrice: discountedPrice(p.price, p.discount) }
      })

      const subtotal = lineItems.reduce((s, li) => s + li.unitPrice * li.qty, 0)
      const shipping = subtotal > 0 && subtotal < 999 ? 25 : 0
      const couponValid = (couponCode ?? '').trim().toUpperCase() === 'RGB10'
      const discount = couponValid ? round(subtotal * 0.1) : 0
      const tax = round((subtotal - discount) * 0.08)
      const total = subtotal + shipping + tax - discount

      // Decrement stock
      for (const li of lineItems) {
        await tx.product.update({
          where: { id: li.product.id },
          data: { stock: { decrement: li.qty } },
        })
      }

      return tx.order.create({
        data: {
          userId: (req.user?.sub as string | undefined) ?? null,
          fullName: customer.fullName,
          email: customer.email,
          address: customer.address,
          city: customer.city,
          zip: customer.zip,
          subtotal,
          shipping,
          tax,
          discount,
          total,
          couponCode: couponValid ? 'RGB10' : null,
          status: 'PAID',
          items: {
            create: lineItems.map((li) => ({
              productId: li.product.id,
              name: li.product.name,
              unitPrice: li.unitPrice,
              qty: li.qty,
            })),
          },
        },
        include: { items: true },
      })
    })

    res.status(201).json({
      id: order.id,
      total: order.total,
      subtotal: order.subtotal,
      shipping: order.shipping,
      tax: order.tax,
      discount: order.discount,
      status: order.status,
      createdAt: order.createdAt,
    })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Order failed' })
  }
})

// GET /api/orders — admin (all orders, newest first)
ordersRouter.get('/', requireAdmin, async (_req, res) => {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    include: { items: true },
  })
  res.json(orders)
})

// PATCH /api/orders/:id/status — admin
ordersRouter.patch('/:id/status', requireAdmin, async (req, res) => {
  const schema = z.object({ status: z.enum(ORDER_STATUSES) })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid status' })

  const existing = await prisma.order.findUnique({ where: { id: req.params.id } })
  if (!existing) return res.status(404).json({ error: 'Order not found' })

  const order = await prisma.order.update({
    where: { id: req.params.id },
    data: { status: parsed.data.status },
    include: { items: true },
  })
  res.json(order)
})
