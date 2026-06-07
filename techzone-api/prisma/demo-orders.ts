/**
 * Non-destructive demo-order generator.
 *
 * Populates the admin dashboard with a realistic 30-day order history so the
 * charts have shape. Everything it creates is tagged with the `@demo.techzone.dev`
 * email domain, so re-running first removes only its own previous output — your
 * real products, users, and orders are never touched.
 *
 *   npm run db:demo            # add demo orders (idempotent)
 */
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DEMO_DOMAIN = 'demo.techzone.dev'
const DAYS = 30
const TARGET_ORDERS = 92
const DAY_MS = 24 * 60 * 60 * 1000

const DEMO_CUSTOMERS = [
  { name: 'Ava Bennett', city: 'Seattle', zip: '98101' },
  { name: 'Marcus Holt', city: 'Austin', zip: '73301' },
  { name: 'Lena Park', city: 'San Jose', zip: '95110' },
  { name: 'Diego Ramos', city: 'Miami', zip: '33101' },
  { name: 'Priya Nair', city: 'Denver', zip: '80202' },
  { name: 'Tom Avila', city: 'Portland', zip: '97201' },
  { name: 'Yara Said', city: 'Chicago', zip: '60601' },
  { name: 'Noah Frost', city: 'Boston', zip: '02108' },
  { name: 'Mina Cho', city: 'Atlanta', zip: '30303' },
  { name: 'Ravi Patel', city: 'Phoenix', zip: '85003' },
  { name: 'Elise Moreau', city: 'Brooklyn', zip: '11201' },
  { name: 'Karl Vogt', city: 'Dallas', zip: '75201' },
  { name: 'Sofia Ricci', city: 'San Diego', zip: '92101' },
  { name: 'Owen Clarke', city: 'Nashville', zip: '37203' },
]

const GUEST_FIRST = ['Alex', 'Jordan', 'Casey', 'Riley', 'Sam', 'Quinn', 'Drew', 'Morgan', 'Reese', 'Skyler']
const GUEST_LAST = ['Nguyen', 'Khan', 'Silva', 'Walsh', 'Okafor', 'Brennan', 'Ito', 'Costa', 'Hale', 'Romero']
const STREETS = ['Frame Rate Ave', 'Render Rd', 'Pixel Loop', 'Cache Ln', 'Polygon St', 'Latency Blvd', 'Vertex Way']

const rand = (n: number) => Math.floor(Math.random() * n)
const pick = <T>(arr: T[]): T => arr[rand(arr.length)]
const chance = (p: number) => Math.random() < p
const round = (n: number) => Math.round(n)
const discounted = (price: number, discount: number) => round(price * (1 - (discount || 0) / 100))

const slugifyEmail = (name: string) =>
  `${name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/(^\.|\.$)/g, '')}@${DEMO_DOMAIN}`

/** Status weighted by how old the order is (older → more likely fulfilled). */
function rollStatus(dayOffset: number): string {
  const table: [string, number][] =
    dayOffset >= 12
      ? [['DELIVERED', 0.7], ['SHIPPED', 0.12], ['CANCELLED', 0.12], ['PAID', 0.06]]
      : dayOffset >= 5
        ? [['SHIPPED', 0.44], ['DELIVERED', 0.26], ['PAID', 0.22], ['CANCELLED', 0.08]]
        : [['PAID', 0.55], ['PENDING', 0.3], ['SHIPPED', 0.1], ['CANCELLED', 0.05]]
  let r = Math.random()
  for (const [status, weight] of table) {
    if (r < weight) return status
    r -= weight
  }
  return 'PAID'
}

async function main() {
  console.log('🧪 Generating demo orders (non-destructive)…')

  // 1) Remove only previously-generated demo data (idempotent).
  await prisma.orderItem.deleteMany({ where: { order: { email: { endsWith: `@${DEMO_DOMAIN}` } } } })
  const removed = await prisma.order.deleteMany({ where: { email: { endsWith: `@${DEMO_DOMAIN}` } } })
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${DEMO_DOMAIN}` } } })
  if (removed.count) console.log(`  ↺ cleared ${removed.count} prior demo orders`)

  const products = await prisma.product.findMany()
  if (!products.length) {
    console.error('  ✗ No products found — run `npm run db:seed` first.')
    process.exit(1)
  }

  // 2) Demo customers (registered). They predate their orders.
  const hash = await bcrypt.hash('customer123', 10)
  const now = Date.now()
  const users = await Promise.all(
    DEMO_CUSTOMERS.map((c) =>
      prisma.user.create({
        data: {
          email: slugifyEmail(c.name),
          passwordHash: hash,
          name: c.name,
          role: 'CUSTOMER',
          createdAt: new Date(now - (DAYS + 10 + rand(40)) * DAY_MS),
        },
      }).then((u) => ({ ...u, city: c.city, zip: c.zip })),
    ),
  )
  console.log(`  ✓ ${users.length} demo customers`)

  // 3) Weighted product pool — featured / best-sellers sell more often.
  const pool: typeof products = []
  for (const p of products) {
    pool.push(p)
    if (p.featured) pool.push(p, p)
    if (p.bestSeller) pool.push(p, p)
    if (p.newArrival) pool.push(p)
  }

  // 4) Orders across the last 30 days, with a mild recency bias.
  let created = 0
  for (let i = 0; i < TARGET_ORDERS; i++) {
    const dayOffset = Math.floor(Math.pow(Math.random(), 1.3) * DAYS) // skews recent
    const ts = now - dayOffset * DAY_MS - rand(DAY_MS) // random time within the day
    const createdAt = new Date(ts)

    const registered = chance(0.7)
    const u = registered ? pick(users) : null
    const guestName = `${pick(GUEST_FIRST)} ${pick(GUEST_LAST)}`
    const fullName = u?.name ?? guestName
    const email = u?.email ?? slugifyEmail(`${guestName} ${i}`)
    const city = u?.city ?? pick(DEMO_CUSTOMERS).city
    const zip = u?.zip ?? pick(DEMO_CUSTOMERS).zip

    // 1–3 distinct products
    const lineCount = chance(0.18) ? 3 : chance(0.5) ? 2 : 1
    const chosen = new Map<string, (typeof products)[number]>()
    while (chosen.size < lineCount) {
      const p = pick(pool)
      chosen.set(p.id, p)
    }
    const lineItems = [...chosen.values()].map((p) => ({
      product: p,
      qty: chance(0.12) ? 3 : chance(0.32) ? 2 : 1,
      unitPrice: discounted(p.price, p.discount),
    }))

    const subtotal = lineItems.reduce((s, li) => s + li.unitPrice * li.qty, 0)
    const shipping = subtotal > 0 && subtotal < 999 ? 25 : 0
    const couponValid = chance(0.12)
    const discount = couponValid ? round(subtotal * 0.1) : 0
    const tax = round((subtotal - discount) * 0.08)
    const total = subtotal + shipping + tax - discount
    const status = rollStatus(dayOffset)

    await prisma.order.create({
      data: {
        userId: u?.id ?? null,
        fullName,
        email,
        address: `${rand(90) + 10} ${pick(STREETS)}`,
        city,
        zip,
        subtotal,
        shipping,
        tax,
        discount,
        total,
        couponCode: couponValid ? 'RGB10' : null,
        status,
        createdAt,
        items: {
          create: lineItems.map((li) => ({
            productId: li.product.id,
            name: li.product.name,
            unitPrice: li.unitPrice,
            qty: li.qty,
          })),
        },
      },
    })
    created++
  }

  console.log(`  ✓ ${created} demo orders across the last ${DAYS} days`)
  console.log('✅ Demo data ready.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
