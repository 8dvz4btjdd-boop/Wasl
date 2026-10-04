# Wasl design foundation

Source of truth for brand, tokens, type, direction and motion. Implemented in `app/globals.css`, `lib/motion.ts`, `components/{logo,surface,motion-provider}.tsx`.

## Brand

Colors sampled from the logo (`public/brand/wasl-logo.svg`). These replace the earlier accent values (navy #0B1033, teal #2BD4B0, violet #7C5CFF).

| Token | Hex | Use |
|---|---|---|
| `brand-violet` | `#6150EA` | Back bubble. Workspace primary. |
| `brand-teal` | `#2EF2C4` | Front bubble outline. Asker primary, focus ring and teal text on dark. **Never as text on light surfaces** (1.44:1 on white). |
| `brand-gradient-from` → `brand-gradient-to` | `#3EE8C6` → `#5A7FE6` | The bubbles' overlap. Decorative only (`bg-brand-gradient`). |
| `brand-navy` | `#0E153F` | Asker background, text on light surfaces. |
| `brand-teal-strong` (derived) | `#077359` | Teal for text, focus rings and teal fills on light surfaces. |

**Derived teal.** Same hue as `#2EF2C4` (166°) with lightness lowered. `#087F63` is the first step that passes AA (4.97:1 on white, 4.68:1 on `#F7F8FC`). `#077359` is one step darker, for margin: 5.82:1 on white, 5.49:1 on `#F7F8FC`, and 5.82:1 with white text on it.

### Logo

- `<Logo size={32} wordmark />`: `size` is the mark's height in px. `wordmark` adds the localized name (`Brand.name`: وصل / Wasl), which sits after the mark in reading direction.
- Without a wordmark the SVG is `role="img"` with the localized name as its label. With one, the SVG is hidden from assistive tech and the text carries the name.
- Favicon: `app/icon.svg` (the mark with a heavier outline for small sizes). There is no `favicon.ico`.

## Surfaces

Two surfaces, each with light and dark. Wrap content in `<Surface kind="asker|workspace" theme?>`. It sets `data-surface` and `data-theme`, and the tokens in `globals.css` follow them.

| Surface | Default | Character |
|---|---|---|
| asker | dark | Conversation-first, large type, minimal text, radius 1rem. Teal primary. |
| workspace | light | Dense, calm data, three-column inbox, radius 0.625rem. Violet primary. |

Semantic tokens (shadcn names plus two of ours), used as Tailwind utilities (`bg-primary`, `text-teal-fg`, ...):

| Token | Asker dark | Asker light | Workspace light | Workspace dark |
|---|---|---|---|---|
| background | `#0E153F` | `#F7F8FC` | `#F7F8FC` | `#0A0F2E` |
| card | `#161F55` | `#FFFFFF` | `#FFFFFF` | `#11183F` |
| foreground | `#F4F5FB` | `#0E153F` | `#0E153F` | `#EEF0FA` |
| muted-foreground | `#A9AFD0` | `#4F5778` | `#4F5778` | `#A3A9C9` |
| primary / on primary | `#2EF2C4` / `#0E153F` | `#077359` / `#FFFFFF` | `#6150EA` / `#FFFFFF` | `#6150EA` / `#FFFFFF` |
| accent / on accent | `#262F6E` / `#F4F5FB` | `#EFEDFD` / `#3D2FC4` | `#EFEDFD` / `#3D2FC4` | `#232B63` / `#EEF0FA` |
| teal-fg (teal text) | `#2EF2C4` | `#077359` | `#077359` | `#2EF2C4` |
| violet-fg (violet text) | `#A69CF6` | `#5443DD` | `#5443DD` | `#A69CF6` |
| ring (focus) | `#2EF2C4` | `#077359` | `#077359` | `#2EF2C4` |
| input (border) | `#6A73A6` | `#7F87A6` | `#7F87A6` | `#646C99` |
| destructive | `#FF7A88` | `#C42B3F` | `#C42B3F` | `#FF7A88` |

Use `text-teal-fg` / `text-violet-fg`, never `text-brand-teal` / `text-brand-violet`, so text stays readable on both themes. Brand violet on navy is only 3.21:1, which is why dark surfaces use `#A69CF6` for violet text.

### Contrast (WCAG 2.2 AA)

Checked for all four token sets: 68 pairs, all pass. Text needs 4.5:1. Focus rings and input borders need 3:1.

| Pair | Lowest ratio across the four sets |
|---|---|
| foreground on background / card | 14.18 |
| muted-foreground on background / card / muted | 6.22 |
| on-primary on primary | 5.46 (white on violet) |
| on-accent on accent | 7.58 |
| teal-fg on background / card | 5.49 |
| violet-fg on background / card | 6.14 |
| destructive on background / card | 5.26 |
| ring on background / card | 5.49 |
| input border on background / card | 3.34 |

Borders (`--border`) are decorative separators and don't carry meaning, so the 3:1 rule doesn't apply to them. Re-check any new pair before adding it.

## Typography

- `ar`: IBM Plex Sans Arabic (400–700). `en`, `fr`, `es`: Inter. Picked per locale in `app/[locale]/layout.tsx` and exposed as `--font-sans`.
- Asker surfaces use large type and show one question at a time.

## Direction (RTL)

- `dir` comes from the locale (`ar` is rtl).
- **Logical properties only**: `ms-/me-`, `ps-/pe-`, `start-/end-`, `border-s/e`, `rounded-s/e`, `text-start/end`. Never `ml/mr/pl/pr/left/right`.
- `npm run lint` runs `scripts/check-logical.mjs`, which fails on physical left/right utilities or CSS properties in `app/`, `components/` and `lib/`.
- shadcn is set to `"rtl": true`, so components it adds use logical classes.
- Icons that imply direction (arrows, chevrons) flip with `rtl:-scale-x-100`.

## Motion

Library: `motion` (`motion/react`). Use it for state changes only, every animation under 300 ms, ease-out `cubic-bezier(0.22, 1, 0.36, 1)`.

| Preset | `lib/motion.ts` | CSS utility | Duration | Use |
|---|---|---|---|---|
| fade-up | `fadeUp` | `animate-fade-up` | 220 ms (exit 160) | Content and messages appearing |
| sheet-in | `sheetIn` | `animate-sheet-in` | 280 ms (exit 220) | The card's bottom sheet |
| pulse | `pulse` | `animate-pulse-once` | 280 ms, once | Guide orb on a state change |
| stagger | `staggerChildren(0.06)` | (none) | 60 ms per child | Card fields animating in one by one |

The CSS pulse is called `animate-pulse-once` because Tailwind's `animate-pulse` is the endless skeleton shimmer.

Reduced motion: `<MotionProvider>` (`MotionConfig reducedMotion="user"`) drops transform animations and keeps opacity. In CSS, `prefers-reduced-motion: reduce` cuts every animation and transition to about 0 ms.
