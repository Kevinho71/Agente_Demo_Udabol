import type { Product } from './types'

const numberFormatter = new Intl.NumberFormat('es-BO', {
  maximumFractionDigits: 2,
})

export function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

export function formatPrice(value: number): string {
  return formatNumber(value)
}

export function productLabel(product: Product): string {
  return product.name.trim() || 'Sin nombre'
}

export function productInitial(product: Product): string {
  const name = productLabel(product)
  return name.charAt(0).toUpperCase()
}

const DIRECT_IMAGE = /^https?:\/\/[^\s]+\.(png|jpe?g|webp|gif|avif)(\?[^\s]*)?$/i

export function hasUsableImage(product: Product): boolean {
  const url = product.image_url?.trim()
  if (!url || url === 'string') return false
  return DIRECT_IMAGE.test(url)
}

export const LOW_STOCK = 5

export interface CatalogStats {
  count: number
  totalStock: number
  lowStock: number
  outOfStock: number
  inventoryValue: number
}

export function computeCatalogStats(products: Product[]): CatalogStats {
  return products.reduce<CatalogStats>(
    (stats, product) => {
      const stock = Number.isFinite(product.stock) ? product.stock : 0
      const price = Number.isFinite(product.price) ? product.price : 0
      return {
        count: stats.count + 1,
        totalStock: stats.totalStock + stock,
        lowStock: stats.lowStock + (stock < LOW_STOCK ? 1 : 0),
        outOfStock: stats.outOfStock + (stock === 0 ? 1 : 0),
        inventoryValue: stats.inventoryValue + price * stock,
      }
    },
    { count: 0, totalStock: 0, lowStock: 0, outOfStock: 0, inventoryValue: 0 },
  )
}

export function relativeTime(date: Date): string {
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000))
  if (seconds < 10) return 'recién'
  if (seconds < 60) return `hace ${seconds} s`
  const minutes = Math.round(seconds / 60)
  return `hace ${minutes} min`
}

const EMOJI_PATTERN =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu
const EMOJI_JOINERS = /\uFE0F|\u200D/g

/**
 * El modelo a veces agrega emojis aunque el prompt los prohiba.
 * Se limpian en el render para no romper la regla de la interfaz.
 */
export function stripEmoji(value: string): string {
  return value.replace(EMOJI_PATTERN, '').replace(EMOJI_JOINERS, '')
}
