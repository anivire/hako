import { HTTPException } from 'hono/http-exception'
import { env } from '../env'

export function notFound(code = 'NOT_FOUND'): never {
  throw new HTTPException(404, { message: code })
}

export function badRequest(code: string): never {
  throw new HTTPException(400, { message: code })
}

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': env.userAgent, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new HTTPException(502, { message: 'UPSTREAM_FAILED' })
  return (await res.json()) as T
}
