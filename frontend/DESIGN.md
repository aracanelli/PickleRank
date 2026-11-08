# PickleRank frontend design standards ("Court Card")

The full system, its components and copy rules live in `src/app/core/ui/README.md`. In short:

- Mobile-first, light and dark. Semantic tokens in `src/styles/tokens.css` (contrast-tested by
  `tokens.spec.ts`); `data-theme` on `<html>` is set by `src/stores/theme.ts` (Light, Dark, Match phone).
- Every matchup is drawn as a court seen from above (`CourtTile`): court number in the blue gutter,
  team one, dashed net, team two. Optic yellow is a fill only: current round, winner marker, save flash.
- Atkinson Hyperlegible Next for text, Barlow Condensed (`.num`) for scores, ratings and counts. Self-hosted.
- Primary controls are at least 44x44 CSS px; inputs at least 16px; focused fields clear sticky bars.
- Each screen has one obvious next action (`ActionBar`, thumb zone) or says why it is read-only.
- Destructive or result-changing actions confirm via `confirm()`; outcomes are announced (`toast`, `announce`).
- Share images (html2canvas) use fixed hex colors and a light palette.
