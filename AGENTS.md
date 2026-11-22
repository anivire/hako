# AGENTS.md

Guide for coding agents working on hako, a self-hosted panel for game servers. Every server runs in its own Docker container, and every game is described by a template, so a new game is a JSON file and not new code. `README.md` covers what the app does and how to deploy it; this file covers how to change the code. `DESIGN.md` is the design system. Read it before changing anything visual. `docs/games.md` is the game template reference.

## Layout

Nx workspace with npm workspaces, Node.js 22.12+.

| Path | What lives there |
|---|---|
| `apps/api` | Hono server, Drizzle ORM on SQLite (`better-sqlite3`), Docker through `dockerode`. `src/routes` (HTTP and WebSocket handlers), `src/games` (template registry and built-in templates), `src/runtime` (containers, console, stats), `src/addons` (mod and plugin sources), `src/options` (option sources for template variables: Minecraft versions, Modrinth and CurseForge modpacks), `src/services` (files), `src/lib` (auth, http, validation), `src/db/schema.ts`, migrations in `drizzle/` |
| `apps/web` | React 19 SPA: React Router, TanStack Query, Tailwind CSS v4, i18next. `src/pages` (one file per route, wired in `src/router.tsx`, loaded lazily with `page()` unless the page is the first screen), `src/components` (`server/` holds the server page tabs), `src/lib` (API client, queries, i18n, helpers), `src/locales` |
| `packages/ui` | Shared primitives (`@hako/ui`): buttons, overlays (Radix), Segmented, StepSlider, theme, `styles.css` with design tokens and utilities |
| `packages/shared` | Types, zod schemas and constants shared by API and web (`@hako/shared`), including `gameTemplateSchema` |

The web dev server proxies `/api` (including WebSockets) to the API on port `3000`. Production is one Docker image where the API also serves the built web app.

## Commands

```bash
npm install
npm run dev          # web on :5173 and API on :3000 in watch mode
npm run typecheck    # tsc across all packages
npm run build        # production build
npm run db:generate  # new Drizzle migration after editing apps/api/src/db/schema.ts
npm test -w api      # template, variable and properties tests
npm test -w web      # log highlighter tests
```

Before finishing a change, run the typecheck for every package you touched, `npm test -w api` for API changes and `npx vite build` in `apps/web` for frontend changes. Migrations run automatically when the API starts. Local development needs a running Docker daemon to start servers; everything else works without it.

## Code style

- TypeScript in strict mode with `noUnusedLocals` and `noUnusedParameters`.
- Single quotes, no semicolons, 2-space indent, long single-line JSX attributes are normal. There is no formatter config: do not run Prettier over files.
- Do not add code comments. Explain decisions in the conversation or the commit message.
- Tailwind utility classes inline, `cn()` from `@hako/ui` for conditional classes, small components in the same file as their only user.
- Effects are only for syncing with things outside React (WebSockets, DOM, timers, storage). Derive values during render, handle actions in event handlers, fetch through TanStack Query.
- Prefer the primitives in `packages/ui` over new ones.

## Games are data

The core rule: **never branch on a game id in code.** Anything game-specific belongs in its template.

- A template (`GameTemplate` in `packages/shared`) declares the Docker image, environment, command, data path inside the container, ports, memory limits, user variables, the console line that means "ready", how to stop the server and which addon sources apply. `docs/games.md` documents every field.
- Built-in templates live in `apps/api/src/games/builtin/*.json` and are registered in `games/registry.ts`. Admins add more by dropping JSON files into `GAMES_DIR` (default `DATA_DIR/games`); they are validated with the same schema at startup and a broken file is skipped with a log line.
- `{{KEY}}` in `image`, `env`, `command` and addon `params` is replaced with a variable value. Built-in keys: `SERVER_ID`, `SERVER_NAME`, `SERVER_MEMORY` (MB), `SERVER_PORT` (first port) and `SERVER_PORT_<NAME>`.
- Variables are validated by `resolveVariables()`: `select` values must be one of the options, `boolean` is `true`/`false`, `pattern` is a regex, `required` booleans must be `true` (used for EULAs), `editable: false` locks a value after creation. Validation errors are `VARIABLE_INVALID:<KEY>`. A variable that ends up in `image` must be a `select` or have a strict `pattern`.
- Variables can load their options from a `source` (`/api/games/:game/options/:key`, registry in `options/index.ts`, cached for 10 minutes), appear only `when` other variables have certain values, and belong to a wizard `step` (`setup` or `settings`). `variableVisible()` in `packages/shared` is the single rule for visibility on both sides.
- Templates can carry an `icon` (`GameIcon` in `components/game-icon.tsx` draws SVG data URIs as a mask in the current colour) and `configs`: files such as `server.properties` edited on the Configuration tab (`components/server/config.tsx`, parser and writer in `packages/shared/src/properties.ts`). Game settings that belong to a config file stay out of template variables.
- New servers are created on a separate page, `/servers/new` (`pages/new-server.tsx`): game, version (`setup` variables, skipped when a template has none), settings, review. The form is generated from the template (`VariablesForm` in `components/variables-form.tsx`), and the server settings tab uses the same component. Template texts are either a string or `{ ru, en }`; show them with `useText()` from `lib/i18n.ts`.

## Runtime

- `runtime/instances.ts` keeps one `Instance` per server: status (`offline`, `starting`, `running`, `stopping`), the console history, the attached stdin and the stats stream (CPU, memory, network totals). `GET /api/system` reports whether Docker answers.
- Containers are attached with a raw `http.request` upgrade (`attachSocket`) and `Content-Length: 0`. Do not go back to `container.attach()` from dockerode: it sends a request body, and Docker hands everything after the headers to the game's stdin, so the first command arrives with junk in front of it.
- Environment variables whose template value is a single `{{KEY}}` that ends up empty (hidden or unset variables) are not passed to the container at all (`containerEnv` in `games/registry.ts`), so images fall back to their own defaults; a literal empty value such as `MEMORY=""` is still passed.
- New servers get ports that are free in the hako database, in published ports of running Docker containers and on the host (`allocatePorts` in `routes/servers.ts`).
- Servers have an optional `icon` (https URL or a PNG/JPEG/WebP/GIF data URL, checked by `serverIconSchema`). The wizard takes the name and icon of the option picked in a search source (a modpack); the settings tab uploads one scaled to 128 px.
- When the API starts, `recoverInstances()` reloads the console history of every hako container from `docker logs` and re-attaches to the running ones, so the console survives panel restarts.
- The server page opens one console WebSocket for all tabs (`useServerSocket` in `lib/server-socket.ts`). It keeps the raw log in a ref, the last 120 stats samples in state, and invalidates the file, config and addon queries when the status changes, so files created on the first start show up without a reload.
- The server page header shows the avatar, a summary from the template (the chosen option with an icon plus the first visible `source` variable, e.g. "Fabric 1.21.4"), the address and the uptime from `startedAt`. Stat cards (`StatCard` in `components/server/metric-chart.tsx`) show CPU, memory, disk (`GET /api/servers/:id/usage`, folder size cached for 30 s) and network.
- The console log can be filtered by level (`filterLog` in `lib/log-highlight.ts`): lines without a level, such as stack traces, belong to the last level seen.
- The console is xterm.js (`components/server/terminal.tsx`) with fit, search and web-links addons; raw ANSI from the game is written as is, and `lib/log-highlight.ts` colours `[time] [thread/LEVEL]` lines that come without colours of their own. Charts are `MetricChart`.
- Every start recreates the container (`hako-<id>`, labels `hako.server` and `hako.game`) from the current template and settings, so changed settings apply on the next start. Files live in a bind mount `SERVERS_DIR/<id>` mounted at the template's `dataPath`. In Docker the panel must see `SERVERS_DIR` at the same path as the host, because the Docker daemon resolves bind mounts on the host.
- Containers run with a TTY and open stdin; the console WebSocket (`/api/servers/:id/ws`) streams `history`, `log`, `status` and `stats` messages (`ConsoleMessage`) and accepts `{ type: 'command', command }`. Stats are only read while someone watches.
- Power actions for one server run one after another. Stop sends `stop.command` to stdin when the template has one, then falls back to `docker stop` with `stop.timeout`.
- When the API restarts, `recoverInstances()` re-attaches to running containers, so game servers keep running across panel updates.

## Addons

- An addon source implements `AddonSource` (`addons/types.ts`): `available`, `search`, `versions`, `resolve`. It gets only the template's interpolated `params`, never the game id. Register new sources in `SOURCES` in `addons/manager.ts`.
- `manager.ts` downloads the file into the server folder, checks the hash when the source gives one, records it in the `addons` table and installs required dependencies. Disabling renames the file to `<name>.disabled`.
- `modrinth.ts` maps the Minecraft server type to Modrinth loaders and picks `mods/` or `plugins/`.

## Backend conventions

- Routes validate input with `parseBody()` and zod schemas from `packages/shared`, and return JSON.
- Every file path from a client goes through `resolveInside()` in `services/files.ts`, which rejects anything outside the server folder, symlinks included.
- Users see their own servers, admins see all. `loadServer` in `routes/servers.ts` enforces this for every `/:id` route.
- Errors the user can see are short upper-case codes (`badRequest('PORT_TAKEN')`), translated in `errorMessage()` in `apps/web/src/lib/queries.ts`.
- Schema changes: edit `src/db/schema.ts`, run `npm run db:generate`, give the migration a descriptive name and commit it with the `drizzle/meta` snapshot.

## Frontend conventions

- **Appearance** (colour scheme, theme preset, page width) lives in `src/lib/appearance.tsx`, persisted to `localStorage` under `hako:appearance` and applied before first paint by the script in `index.html`. The default theme is `hako` (mint, hue 172) and the default page width is 100%. Pickers are in `components/theme-picker.tsx` and `components/appearance-panel.tsx` (rail popover); the full page is `/settings`.
- Pages fill the free space: `Page` is a flex column, grids use `grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))]`, and anything that should take the remaining height (the console) is a `relative flex-1` box with an `absolute inset-0` scroller inside, so its content never stretches the page.
- Layout follows yoru: a left rail on desktop (`AppShell` in `components/app-shell.tsx`, navigation in `NAV`, language and account menus at the bottom) and a top bar with a menu on phones. Every page is wrapped in `Page` and starts with `PageHeader`.

- Every user-facing string goes through i18next, in both `src/locales/ru.ts` and `src/locales/en.ts`; `en` is typed against `ru`.
- API calls live in `src/lib/api.ts`, query keys in `src/lib/queries.ts`.
- Server page tabs are in `components/server/`; the active tab and the file manager path live in the URL search params.
