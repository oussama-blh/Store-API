import type { Product as PrismaProduct } from '@prisma/client'

/** SpecItem mirrors the frontend type. */
export interface SpecItem {
  label: string
  value: string
}

/**
 * The API `Product` shape — identical to techzone-store/src/lib/types.ts `Product`.
 * (Re-declared here so the backend has no dependency on the frontend package.)
 */
export interface ApiProduct {
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

function safeParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** DB row -> API JSON (parses JSON columns, drops nulls for optional fields). */
export function toApiProduct(row: PrismaProduct): ApiProduct {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    category: row.category,
    subCategory: row.subCategory,
    price: row.price,
    discount: row.discount,
    rating: row.rating,
    reviewCount: row.reviewCount,
    stock: row.stock,
    tagline: row.tagline,
    description: row.description,
    specs: safeParse<SpecItem[]>(row.specs, []),
    cpu: row.cpu ?? undefined,
    gpu: row.gpu ?? undefined,
    ram: row.ram ?? undefined,
    storage: row.storage ?? undefined,
    images: safeParse<string[]>(row.images, []),
    accent: row.accent,
    badges: safeParse<string[]>(row.badges, []),
    featured: row.featured,
    bestSeller: row.bestSeller,
    newArrival: row.newArrival,
  }
}

/** Fields accepted from an admin create/update payload. */
export interface ProductInput {
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
  cpu?: string | null
  gpu?: string | null
  ram?: string | null
  storage?: string | null
  images: string[]
  accent: string
  badges: string[]
  featured?: boolean
  bestSeller?: boolean
  newArrival?: boolean
}

/** API input -> DB write payload (stringifies JSON columns). */
export function toDbProduct(input: ProductInput) {
  return {
    slug: input.slug,
    name: input.name,
    brand: input.brand,
    category: input.category,
    subCategory: input.subCategory,
    price: input.price,
    discount: input.discount,
    rating: input.rating,
    reviewCount: input.reviewCount,
    stock: input.stock,
    tagline: input.tagline,
    description: input.description,
    specs: JSON.stringify(input.specs ?? []),
    cpu: input.cpu ?? null,
    gpu: input.gpu ?? null,
    ram: input.ram ?? null,
    storage: input.storage ?? null,
    images: JSON.stringify(input.images ?? []),
    accent: input.accent,
    badges: JSON.stringify(input.badges ?? []),
    featured: input.featured ?? false,
    bestSeller: input.bestSeller ?? false,
    newArrival: input.newArrival ?? false,
  }
}
