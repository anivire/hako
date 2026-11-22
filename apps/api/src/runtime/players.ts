const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g

export class PlayerTracker {
  private names = new Map<string, string>()
  private rest = ''
  private join: RegExp
  private leave: RegExp

  constructor(spec: { join: string; leave: string }) {
    this.join = new RegExp(spec.join)
    this.leave = new RegExp(spec.leave)
  }

  get list(): string[] {
    return [...this.names.values()].sort((a, b) => a.localeCompare(b))
  }

  reset() {
    this.names.clear()
    this.rest = ''
  }

  feed(chunk: string): boolean {
    const lines = (this.rest + chunk).split(/\r?\n/)
    this.rest = (lines.pop() ?? '').slice(-2048)
    let changed = false
    for (const raw of lines) {
      const line = raw.replace(ANSI, '').replace(/\r/g, '').trim()
      if (!line) continue
      const joined = this.join.exec(line)?.[1]?.trim()
      if (joined) {
        if (!this.names.has(joined.toLowerCase())) changed = true
        this.names.set(joined.toLowerCase(), joined)
        continue
      }
      const left = this.leave.exec(line)?.[1]?.trim()
      if (left && this.names.delete(left.toLowerCase())) changed = true
    }
    return changed
  }
}
