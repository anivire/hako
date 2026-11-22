import type { AddonEntry, AddonSearchResult, AddonUpdate, AddonVersion } from '@hako/shared'
import type { ServerRow } from '../runtime/instances'

export interface AddonContext {
  params: Record<string, string>
}

export interface ResolvedAddon {
  projectId: string
  versionId: string
  name: string
  version: string
  url: string
  fileName: string
  dir: string
  sha1?: string
  dependencies: string[]
}

export interface IdentifiedFile {
  projectId: string
  versionId: string
  version: string
  name: string
  icon: string | null
  url: string | null
  loaders: string[]
  gameVersions: string[]
}

export interface AddonSource {
  id: string
  name: string
  available(ctx: AddonContext): boolean
  missing?(ctx: AddonContext): string | null
  kind(ctx: AddonContext): 'mods' | 'plugins' | null
  dir(ctx: AddonContext): string | null
  search(ctx: AddonContext, query: string, offset: number): Promise<AddonSearchResult>
  versions(ctx: AddonContext, projectId: string): Promise<AddonVersion[]>
  resolve(ctx: AddonContext, projectId: string, versionId?: string): Promise<ResolvedAddon>
  identify(hashes: string[]): Promise<Map<string, IdentifiedFile>>
  latest(ctx: AddonContext, hashes: string[]): Promise<Map<string, { versionId: string; version: string }>>
  infer(files: IdentifiedFile[]): Record<string, string> | null
}

export interface ManagedSource {
  id: string
  name: string
  updatable: boolean
  search(ctx: AddonContext, query: string, offset: number): Promise<AddonSearchResult>
  versions(ctx: AddonContext, projectId: string): Promise<AddonVersion[]>
  list(server: ServerRow, ctx: AddonContext): Promise<AddonEntry[]>
  install(server: ServerRow, ctx: AddonContext, projectId: string): Promise<string[]>
  remove(server: ServerRow, ctx: AddonContext, path: string): Promise<void>
  setEnabled(server: ServerRow, ctx: AddonContext, path: string, enabled: boolean): Promise<void>
  checkUpdates(server: ServerRow, ctx: AddonContext): Promise<AddonUpdate[]>
  update(server: ServerRow, ctx: AddonContext, paths: string[]): Promise<number>
}
