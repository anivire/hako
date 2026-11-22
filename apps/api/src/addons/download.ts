import { createHash } from 'node:crypto'
import { env } from '../env'
import { badRequest } from '../lib/http'

const MAX_DOWNLOAD = 256 * 1024 * 1024

export async function download(url: string, sha?: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { 'User-Agent': env.userAgent }, signal: AbortSignal.timeout(120_000) })
  if (!res.ok) badRequest('ADDON_DOWNLOAD_FAILED')
  if (Number(res.headers.get('content-length') ?? 0) > MAX_DOWNLOAD) badRequest('ADDON_TOO_LARGE')
  const data = Buffer.from(await res.arrayBuffer())
  if (data.length > MAX_DOWNLOAD) badRequest('ADDON_TOO_LARGE')
  if (sha && createHash('sha1').update(data).digest('hex') !== sha) badRequest('ADDON_DOWNLOAD_FAILED')
  return data
}
