import type { PrmpApi } from '@shared/api'

declare global {
  interface Window {
    readonly api: PrmpApi
  }
}
