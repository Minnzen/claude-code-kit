import { Event } from './event'

export class ResizeEvent extends Event {
  readonly columns: number
  readonly rows: number

  constructor(columns: number, rows: number) {
    super()
    this.columns = columns
    this.rows = rows
  }
}
