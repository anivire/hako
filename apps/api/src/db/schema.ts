import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'user'] }).notNull().default('user'),
  locale: text('locale', { enum: ['ru', 'en'] }).notNull().default('ru'),
  inviteId: integer('invite_id'),
  createdAt: text('created_at').notNull(),
}, (t) => [uniqueIndex('users_username_idx').on(t.username)])

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => [index('sessions_user_idx').on(t.userId)])

export const invites = sqliteTable('invites', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull(),
  role: text('role', { enum: ['admin', 'user'] }).notNull().default('user'),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  usedBy: integer('used_by').references(() => users.id, { onDelete: 'set null' }),
  usedAt: text('used_at'),
  note: text('note'),
  expiresAt: text('expires_at'),
  multiUse: integer('multi_use', { mode: 'boolean' }).notNull().default(false),
  uses: integer('uses').notNull().default(0),
  serverId: text('server_id').references(() => servers.id, { onDelete: 'cascade' }),
  permissions: text('permissions', { mode: 'json' }).$type<string[]>(),
  createdAt: text('created_at').notNull(),
}, (t) => [uniqueIndex('invites_code_idx').on(t.code), index('invites_server_idx').on(t.serverId)])

export const servers = sqliteTable('servers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  game: text('game').notNull(),
  memory: integer('memory').notNull(),
  icon: text('icon'),
  variables: text('variables', { mode: 'json' }).$type<Record<string, string>>().notNull().default({}),
  ports: text('ports', { mode: 'json' }).$type<Record<string, number>>().notNull().default({}),
  ownerId: integer('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull(),
}, (t) => [index('servers_owner_idx').on(t.ownerId)])

export const serverMembers = sqliteTable('server_members', {
  serverId: text('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  permissions: text('permissions', { mode: 'json' }).$type<string[]>().notNull().default([]),
  createdAt: text('created_at').notNull(),
}, (t) => [primaryKey({ columns: [t.serverId, t.userId] }), index('server_members_user_idx').on(t.userId)])

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})
