# PickleRank Frontend Design Standards

Mobile-first, bi-theme (light/dark), Tailwind CSS v4.

## Theming

- `data-theme="light" | "dark"` on `<html>` is the source of truth; set pre-bundle by an inline script in `index.html`, managed by `src/stores/theme.ts` (preference `light | dark | system`, persisted to `localStorage['pr-theme']`).
- Components use **semantic tokens** and are automatically bi-theme:
  - Surfaces: `bg-surface-page`, `bg-surface-1` (cards), `bg-surface-2` (nested/hover), `bg-surface-3`
  - Text: `text-ink`, `text-ink-muted`, `text-ink-faint`
  - Borders: `border-line`, `border-line-strong`
  - Brand: `bg-brand`, `text-brand`, `bg-brand-soft`, `text-brand-contrast` (text on brand), `brand-strong` (hover)
  - Status: `win`, `loss`, `tie`, `warn`, `info`
- The `dark:` variant is reserved for exceptions (e.g., shadow vs border treatments). Never hardcode grays.
- Charts: use `useChartTheme()` from `src/app/core/ui/charts/chart-theme.ts` and remount via `:key="chartTheme.resolved.value"`.
- Shareable images (html2canvas): hex-only scoped CSS, fixed-width brand-dark design — html2canvas cannot parse oklch.

## Layout

- Mobile-first: base styles are the 375px layout; `md:` (768) and `lg:` (1024) are additive for larger screens.
- Content container: `mx-auto w-full max-w-5xl px-4 md:px-6`.
- Safe areas: `pt-safe` / `pb-safe` / `px-safe` utilities (bottom tab bar and sheets need `pb-safe`).

## Interaction

- Touch targets ≥ 44px: interactive primitives use `min-h-11 min-w-11`.
- Text inputs are ≥ 16px (`text-base`) to prevent iOS focus-zoom.
- Bottom sheets (`Sheet`) are the modal primitive on mobile; centered dialog on `md:`+.
- Destructive actions confirm via `useConfirm()`; mutations report via `useToast()`.

## Typography

- Page title: `text-xl md:text-2xl font-semibold`; section: `text-base font-semibold`; body: `text-sm md:text-base`.
- Numeric data (ratings, scores): `font-mono tabular-nums`.
