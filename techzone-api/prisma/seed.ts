import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const __dirname = dirname(fileURLToPath(import.meta.url))

interface SpecItem {
  label: string
  value: string
}
interface SeedProduct {
  id: string
  slug: string
  name: string
  brand: string
  category: string
  subCategory: string
  price: number
  discount: number
  rating: number
  reviewCount: number
  stock: number
  tagline: string
  description: string
  specs: SpecItem[]
  cpu?: string
  gpu?: string
  ram?: string
  storage?: string
  images: string[]
  accent: string
  badges: string[]
  featured?: boolean
  bestSeller?: boolean
  newArrival?: boolean
}
interface SeedReview {
  id: string
  author: string
  role: string
  rating: number
  title: string
  body: string
  product?: string
}

const data = JSON.parse(
  readFileSync(join(__dirname, 'seed-data.json'), 'utf8'),
) as { products: SeedProduct[]; reviews: SeedReview[] }

async function main() {
  console.log('🌱 Seeding TechZone database…')

  // Clean slate (respect FK order)
  await prisma.orderItem.deleteMany()
  await prisma.order.deleteMany()
  await prisma.review.deleteMany()
  await prisma.product.deleteMany()
  await prisma.user.deleteMany()

  // ── Users ──────────────────────────────────────────────
  const [adminHash, customerHash] = await Promise.all([
    bcrypt.hash('admin123', 10),
    bcrypt.hash('customer123', 10),
  ])
  await prisma.user.createMany({
    data: [
      {
        email: 'admin@techzone.dev',
        passwordHash: adminHash,
        name: 'TechZone Admin',
        role: 'ADMIN',
      },
      {
        email: 'customer@techzone.dev',
        passwordHash: customerHash,
        name: 'Sam Customer',
        role: 'CUSTOMER',
      },
    ],
  })
  console.log('  ✓ 2 users (admin@techzone.dev / customer@techzone.dev)')

  // ── Products ───────────────────────────────────────────
  // Preserve the original ids so reviews can map by product name.
  for (const p of data.products) {
    await prisma.product.create({
      data: {
        id: p.id,
        slug: p.slug,
        name: p.name,
        brand: p.brand,
        category: p.category,
        subCategory: p.subCategory,
        price: p.price,
        discount: p.discount,
        rating: p.rating,
        reviewCount: p.reviewCount,
        stock: p.stock,
        tagline: p.tagline,
        description: p.description,
        specs: JSON.stringify(p.specs ?? []),
        cpu: p.cpu ?? null,
        gpu: p.gpu ?? null,
        ram: p.ram ?? null,
        storage: p.storage ?? null,
        images: JSON.stringify(p.images ?? []),
        accent: p.accent,
        badges: JSON.stringify(p.badges ?? []),
        featured: p.featured ?? false,
        bestSeller: p.bestSeller ?? false,
        newArrival: p.newArrival ?? false,
      },
    })
  }
  console.log(`  ✓ ${data.products.length} products`)

  // ── Reviews ────────────────────────────────────────────
  // Try to link a review to a product via its `product` label (substring match).
  for (const r of data.reviews) {
    const match = r.product
      ? data.products.find(
          (p) =>
            p.name.toLowerCase().includes(r.product!.toLowerCase()) ||
            r.product!.toLowerCase().includes(p.name.toLowerCase().split('—')[0].trim()),
        )
      : undefined
    await prisma.review.create({
      data: {
        author: r.author,
        role: r.role,
        rating: r.rating,
        title: r.title,
        body: r.body,
        productLabel: r.product ?? null,
        productId: match?.id ?? null,
      },
    })
  }
  console.log(`  ✓ ${data.reviews.length} reviews`)

  // ── A couple of demo orders so the admin dashboard isn't empty ──
  const flagship = data.products.find((p) => p.id === 'dk-01')!
  const mouse = data.products.find((p) => p.id === 'ac-01')!
  const priceOf = (p: SeedProduct) =>
    Math.round(p.price * (1 - p.discount / 100))

  const customer = await prisma.user.findUnique({
    where: { email: 'customer@techzone.dev' },
  })

  const demoSubtotal = priceOf(flagship) + priceOf(mouse) * 2
  const demoTax = Math.round(demoSubtotal * 0.08)
  await prisma.order.create({
    data: {
      userId: customer?.id ?? null,
      fullName: 'Sam Customer',
      email: 'customer@techzone.dev',
      address: '14 Frame Rate Ave',
      city: 'Austin',
      zip: '73301',
      subtotal: demoSubtotal,
      shipping: 0,
      tax: demoTax,
      discount: 0,
      total: demoSubtotal + demoTax,
      status: 'PAID',
      items: {
        create: [
          {
            productId: flagship.id,
            name: flagship.name,
            unitPrice: priceOf(flagship),
            qty: 1,
          },
          {
            productId: mouse.id,
            name: mouse.name,
            unitPrice: priceOf(mouse),
            qty: 2,
          },
        ],
      },
    },
  })
  console.log('  ✓ 1 demo order')

  console.log('✅ Seed complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
