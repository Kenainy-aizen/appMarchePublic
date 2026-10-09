import { randomUUID } from 'node:crypto'
import type { Clock, IdGenerator } from '@domain/shared/ports'

export class UuidGenerator implements IdGenerator {
  newId(): string {
    return randomUUID()
  }
}

export class SystemClock implements Clock {
  today(): string {
    const now = new Date()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${now.getFullYear()}-${month}-${day}`
  }

  nowMs(): number {
    return Date.now()
  }
}
