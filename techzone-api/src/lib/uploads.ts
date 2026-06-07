import { join } from 'node:path'

/**
 * Directory where uploaded product images are written and served from.
 * Resolved against the API package root — npm scripts (dev/start) run from
 * techzone-api, so process.cwd() is stable across `tsx` dev and the built dist.
 */
export const UPLOAD_DIR = join(process.cwd(), 'uploads')

/** Accepted image MIME types → file extension. */
export const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024 // 8 MB
