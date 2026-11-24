# DESIGN.md

The hako design system for coding agents. `AGENTS.md` covers how the code is organised; this file covers how the interface should look and feel. When something here disagrees with what is on screen, match the existing screens and flag the difference.

## Principles

- **Calm and dense.** Dark by default, few colours, little chrome. Information sits close together and is separated by spacing and soft background steps, not by lines.
- **One accent per theme.** Every theme is a hue. All colours derive from three variables, so a screen must look right in all twelve themes and in light mode.
- **Status first.** The state of a server (running, starting, offline) is the main signal on every screen. UI around it stays neutral.
- **Quiet feedback.** Buttons show `loading` while a request runs; toasts only on errors or real results.
- **Room for text.** Layouts must fit long labels and both locales. Never truncate a label that a user must read to act.

## Tokens

Tokens come from the UI kit `@anivire/kata-ui` (its `styles.css`, imported by `packages/ui/src/styles.css`, which only adds the `hako` theme colours) and are exposed as Tailwind colours (`bg-surface`, `text-muted-foreground`, …). Never use raw hex or Tailwind palette colours (`bg-zinc-800`, `text-violet-400`) for UI; the only exceptions are listed under *Fixed colours*.

### Themes

- The default theme is `hako`, a warm cardboard accent (hue 62, `--tint: 0.018`, `--accent-c: 0.09`). `--hue`, `--tint` and `--accent-c` drive every colour. The `hako` preset is in `packages/ui/src/theme.ts`; the others come from the kit (`sakura`, `matcha`, `umi`, `ember`, `fuji`, `momiji`, `kohaku`, `wakaba`, `kori`, `ajisai`, `sumi`), applied as `data-theme` on `<html>`.
- Light and dark are the `.light` / `.dark` classes. Dark is the default scheme.
- Colours are `oklch`. To add a theme, add a preset in `theme.ts` and a `[data-theme]` block; never add per-theme overrides for single components.

### Surfaces, from back to front

| Token | Use |
|---|---|
| `background` | Page background |
| `inset` | Recessed areas: empty states, the console output |
| `surface` | Cards, panels, list rows (`Card`, server cards) |
| `muted` | Hover fill on rows and menu items, active tab fill, skeleton base |
| `raised` / `popover` | Menus, popovers, dialogs, toasts |
| `field` / `field-hover` | Inputs, selects, secondary buttons, chips |

Inside overlays, `--field`, `--field-hover` and `--muted` are remapped to their `raised-*` versions automatically (see `panel` in `overlay.tsx`), so the same classes work on any layer.

For a very soft fill inside a card (stat chips, small tiles) use `bg-foreground/[0.04]`–`[0.05]` rather than another token.

### Text

| Token | Use |
|---|---|
| `foreground` | Titles, body, numbers |
| `muted-foreground` | Secondary text, descriptions, inactive tabs, meta lines |
| `subtle-foreground` | Tertiary text: dates, counts in brackets, separators, placeholders |
| `accent` | Links, active states, the brand accent |

### Accent and status

- `accent` / `accent-foreground` for primary actions and selection; `accent-soft` for tinted backgrounds (badges, icon chips, selection).
- `success`, `warning`, `danger`, `info`, each with a `-soft` variant for backgrounds. Text on a soft background uses the solid colour (`bg-danger-soft text-danger`).
- `inverse` / `inverse-foreground` for the strongest neutral button (`Button variant="primary"`).

### Fixed colours

Only these break the token rule:
- Text over images: `text-white`, `bg-black/…`.
- The console is always black (`CONSOLE_BACKGROUND`) with light text and the 16 ANSI colours in `DARK` (`components/server/terminal.tsx`), in every theme and scheme, so game output reads the same everywhere. Only the selection follows the accent.

### Server avatar

`ServerAvatar` (`components/game-icon.tsx`) is the game icon with a round badge of the chosen server type (the first visible option with an `icon`) in the bottom right corner, cut out of the card with a 4px ring in the colour of whatever sits behind it (`--avatar-ring`).

### Server statuses

Use `StatusBadge` from `components/server-bits.tsx`, never your own mapping: running `success`, starting and stopping `warning` with a pulsing dot, offline `neutral`.

## Typography

- Inter Variable for UI (`font-feature-settings: 'cv11', 'ss01'`), JetBrains Mono Variable for the console, paths, addresses and keys.
- The root font size is 108% on phones and 120% from `sm`, so all `rem` sizes scale. Use the scale below rather than new sizes.

| Role | Classes |
|---|---|
| Page title (`PageHeader`) | `text-2xl font-semibold tracking-tight` |
| Section title | `text-xl font-semibold tracking-tight` |
| Card or block title | `text-[0.9375rem] font-semibold tracking-tight` or `text-sm font-semibold` |
| Body | `text-sm`, `text-[0.9375rem]` for prominent body |
| Meta and hints | `text-[0.8125rem] text-muted-foreground` |
| Captions, chips | `text-xs` |
| Micro labels (small badges) | `text-[0.6875rem] font-medium` |

- Numbers: `tabular-nums`. Large counts are shortened with `Intl.NumberFormat(locale, { notation: 'compact' })`. Sizes go through `formatBytes` from `lib/format.ts`.
- Dates: `Intl.DateTimeFormat` with the interface language.
- Separate inline meta with ` · `, never with `|`, `/` or arrows.
- Long names, paths and file names wrap with `break-words` / `break-all` inside a `min-w-0` parent; clamp descriptions with `line-clamp-*`.

## Shape

| Element | Radius |
|---|---|
| Small controls (`sm` buttons, small badges, chips) | `rounded-md` |
| Buttons, inputs, menu items, tiles | `rounded-lg` |
| Cards, rows, empty states | `rounded-xl` |
| Pills, `lg` buttons, badges | `rounded-full` |

## Spacing and layout

- **Pages** are wrapped in `Page` (`page-frame` + `px-4 sm:px-6 pb-8`, top padding from `--page-top`), which leaves room for the left rail. Never set your own `max-w-*` + `mx-auto` on a page; narrow content goes in an inner `max-w-*` block.
- **Page header**: `PageHeader` (`components/app-shell.tsx`) with the title, a meta line and the main actions on the right.
- **Sections** on a page: an `h2` with `text-xl font-semibold tracking-tight` and `gap-3` to its content, `gap-6` between sections.
- **Cards**: padding `p-4 sm:p-5`; list rows inside a card `px-2.5 py-2` in a `p-1.5` card.
- **Grids**: `gap-3` for cards, `gap-2` for compact lists.
- Prefer flex/grid gaps over margins between siblings.

### Breakpoints

- Mobile first. `sm` (40rem) switches type size and padding; `lg` enables side-by-side layouts.

## Dividers and depth

- Avoid `border-t` / `divide-y` lines between blocks; the owner finds them heavy. Separate with spacing, a background step (`surface` on `background`), or a soft fill.
- Rows of a list sit directly in their card, like the file list. Do not wrap them in an extra tinted well inside the card; a card inside a card reads as noise.
- Borders are fine for dashed placeholders (`border-2 border-dashed border-border`) and inputs that need an edge.
- Shadows only on overlays (the `panel` shadow).

## Components

Use what exists before writing something new.

### `@hako/ui` (`packages/ui`)

Generic components come from [kata-ui](https://github.com/anivire/kata-ui) (`@anivire/kata-ui`); see them with code in the showcase at https://anivire.github.io/kata-ui/. `packages/ui` adds only the hako-specific ones (`Logo`, `LogoMark`, `Mascot`, `EmptyState` with the mascot). New generic components and changes to existing ones are made in kata-ui, not here (see `AGENTS.md`).

- `Button`: variants `accent` (main action), `secondary` (default), `ghost` (toolbar and icon buttons), `primary` (inverse), `outline`, `danger`, `link`; sizes `sm`, `md`, `lg`, `icon`, `icon-sm`. Use `loading` instead of hand-made spinners and `asChild` for links.
- `Badge` (`outline`, `neutral`, `accent`, `success`, `warning`, `danger`, `info`, `solid`) and `StatusDot`.
- `Card` with `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.
- `Input`, `Textarea`, `Label`, `Field`, `Select`, `Switch`, `Segmented`, `StepSlider`.
- `Popover`, `HoverCard`, `Dialog` + `DialogContent`, `Lightbox`, `DropdownMenu` (non-modal by default), `Tooltip`.
- `EmptyState` (the box logo by default, or an `icon`), `Skeleton`, `Progress`, `Spinner`, `Kbd`, `Code`, `Logo`, `LogoMark`.
- `useSlidingIndicator` for tab-like groups with a moving highlight.

### App components (`apps/web`)

- Layout: `AppShell` (left rail), `Page`, `PageHeader` (`components/app-shell.tsx`), `LanguageMenu` and `Flag` (`components/language.tsx`).
- Servers: `StatusBadge`, `serverAddress` (`components/server-bits.tsx`), `VariablesForm` (`components/variables-form.tsx`, the form generated from a game template).
- Server page tabs: `ServerConsole`, `ServerFiles`, `ServerAddons`, `ServerSettings` (`components/server/`).

## Patterns

- **Icons**: Remix Icon, the `Fill` style (`RiUser3Fill`), `Line` only where the fill version reads poorly. Default size comes from the parent (`[&_svg]:size-4`); do not set sizes on each icon.
- **Icon-only information** (stat chips, buttons) gets a `Tooltip` and an `aria-label` or `sr-only` label.
- **Destructive actions** use `Button variant="danger"` or a ghost icon button with a confirmation; deleting a server asks for its name.
- **Tabs**: `Segmented` for horizontal tabs, with the active tab in the URL.
- **Loading**: skeletons shaped like the real content, `Button loading` for actions.
- **Empty and error states**: `EmptyState`; it grows to fill the free space of the page.
- **Toasts**: `toast.success` / `toast.error` with `errorMessage(e, t)` for API errors.
- **Motion**: 150–200 ms, `ease-out` or `cubic-bezier(0.16,1,0.3,1)` for moving indicators; `animate-pop` for overlays, `animate-fade` / `animate-zoom` for appearing content. Respect `prefers-reduced-motion`.
- **Console and code**: JetBrains Mono (`font-mono`) for console output, file names, addresses and ports.

## Writing

- Every string goes through i18next, in every locale.
- Sentence case, short, no exclamation marks, no decorative arrows.
- Name things the way users see them in the interface, not by internal terms.
