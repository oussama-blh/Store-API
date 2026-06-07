import { Router } from 'express'
import { prisma } from '../db.js'
import { requireAdmin } from '../auth/middleware.js'

export const adminRouter = Router()

const STATUS_ORDER = ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED'] as const
const TREND_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
const dayKey = (d: Date) => d.toISOString().slice(0, 10)
const isRevenue = (status: string) => status !== 'CANCELLED'

// GET /api/admin/stats — KPIs, 30-day trend, status / category / top-product
// breakdowns, low-stock, and recent orders for the admin dashboard.
adminRouter.get('/stats', requireAdmin, async (_req, res) => {
  const [orders, productCount, userCount, lowStock, recentOrders, items] = await Promise.all([
    prisma.order.findMany({ select: { total: true, status: true, createdAt: true } }),
    prisma.product.count(),
    prisma.user.count(),
    prisma.product.findMany({
      where: { stock: { lte: 10 } },
      orderBy: { stock: 'asc' },
      select: { id: true, name: true, slug: true, stock: true, accent: true },
      take: 8,
    }),
    prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 6,
      include: { items: true },
    }),
    prisma.orderItem.findMany({
      select: {
        qty: true,
        unitPrice: true,
        productId: true,
        name: true,
        order: { select: { status: true } },
        product: { select: { name: true, category: true, accent: true } },
      },
    }),
  ])

  const paidOrders = orders.filter((o) => isRevenue(o.status))
  const revenue = paidOrders.reduce((s, o) => s + o.total, 0)

  // ── 30-day revenue & order trend (gap-filled, oldest → newest) ──
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const windowStart = new Date(today.getTime() - (TREND_DAYS - 1) * DAY_MS)
  const buckets = new Map<string, { revenue: number; orders: number }>()
  for (let i = 0; i < TREND_DAYS; i++) {
    buckets.set(dayKey(new Date(windowStart.getTime() + i * DAY_MS)), { revenue: 0, orders: 0 })
  }
  for (const o of paidOrders) {
    const b = buckets.get(dayKey(new Date(o.createdAt)))
    if (b) {
      b.revenue += o.total
      b.orders += 1
    }
  }
  const revenueSeries = [...buckets.entries()].map(([date, v]) => ({
    date,
    revenue: v.revenue,
    orders: v.orders,
  }))

  // ── Deltas: this 30-day window vs the previous 30-day window ──
  const prevStart = new Date(windowStart.getTime() - TREND_DAYS * DAY_MS)
  const inRange = (o: { createdAt: Date }, from: Date, to: Date) =>
    o.createdAt >= from && o.createdAt < to
  const cur = paidOrders.filter((o) => o.createdAt >= windowStart)
  const prev = paidOrders.filter((o) => inRange(o, prevStart, windowStart))
  const sum = (arr: typeof paidOrders) => arr.reduce((s, o) => s + o.total, 0)
  const pct = (now: number, before: number) =>
    before === 0 ? (now > 0 ? 100 : 0) : Math.round(((now - before) / before) * 100)
  const revenueDelta = pct(sum(cur), sum(prev))
  const ordersDelta = pct(cur.length, prev.length)

  // ── Order-status distribution ──
  const statusCounts = new Map<string, number>(STATUS_ORDER.map((s) => [s, 0]))
  for (const o of orders) statusCounts.set(o.status, (statusCounts.get(o.status) ?? 0) + 1)
  const statusBreakdown = STATUS_ORDER.map((status) => ({
    status,
    count: statusCounts.get(status) ?? 0,
  })).filter((s) => s.count > 0)

  // ── Revenue by category + top products (revenue-generating items only) ──
  const catMap = new Map<string, { revenue: number; units: number }>()
  const prodMap = new Map<string, { name: string; accent: string; revenue: number; units: number }>()
  for (const it of items) {
    if (!it.order || !isRevenue(it.order.status)) continue
    const line = it.unitPrice * it.qty
    const category = it.product?.category ?? 'other'
    const cat = catMap.get(category) ?? { revenue: 0, units: 0 }
    cat.revenue += line
    cat.units += it.qty
    catMap.set(category, cat)

    const key = it.productId ?? it.name
    const prod = prodMap.get(key) ?? {
      name: it.product?.name ?? it.name,
      accent: it.product?.accent ?? '#a3f523',
      revenue: 0,
      units: 0,
    }
    prod.revenue += line
    prod.units += it.qty
    prodMap.set(key, prod)
  }
  const categoryRevenue = [...catMap.entries()]
    .map(([category, v]) => ({ category, revenue: v.revenue, units: v.units }))
    .sort((a, b) => b.revenue - a.revenue)
  const topProducts = [...prodMap.entries()]
    .map(([id, v]) => ({ id, name: v.name, accent: v.accent, revenue: v.revenue, units: v.units }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6)

  res.json({
    revenue,
    orderCount: orders.length,
    productCount,
    userCount,
    lowStockCount: lowStock.length,
    avgOrderValue: paidOrders.length ? Math.round(revenue / paidOrders.length) : 0,
    revenueDelta,
    ordersDelta,
    revenueSeries,
    statusBreakdown,
    categoryRevenue,
    topProducts,
    lowStock,
    recentOrders,
  })
})

// GET /api/admin/users — list users (no password hashes)
adminRouter.get('/users', requireAdmin, async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      _count: { select: { orders: true } },
    },
  })
  res.json(
    users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      createdAt: u.createdAt,
      orderCount: u._count.orders,
    })),
  )
})
