# PickleRank UI system ("Court Card")

Mobile-first, one-handed, readable in daylight. Every screen has one obvious next action
or says plainly why it is read-only.

## Tokens (src/styles/tokens.css)
Use semantic variables only, never raw hex: `--bg --surface --surface-sunk --line --line-strong
--ink --ink-2 --court --on-court --court-tint --net --optic --on-optic --ok/--ok-tint
--bad/--bad-tint --wait/--wait-tint --focus`. Space `--s1..--s7` (4pt), radii `--r-control`
(8) `--r-tile` (12) `--r-sheet` (20), tap targets `--tap` (44) `--tap-lg` (52).
Type: `--font-ui` (Atkinson Hyperlegible Next) for everything; add class `num` for scores,
ratings, ranks, counts (Barlow Condensed, tabular). Sizes `--text-xs..--text-xl`, `--num-md`, `--num-lg`.
`--optic` is a fill only, always with `--on-optic` text. Meaning is never color alone: add an icon or word.

## Global classes (src/styles/base.css)
`.page` (screen frame, 16px gutters, max 560px), `.section`, `.section-head`, `.stack-sm`, `.row`,
`.truncate` (long names), `.muted`, `.num`, `.visually-hidden`.

## Components (import from `@/app/core/ui/...` and `@/app/core/layout/...`)
- `PageHeader` title, back link that names its destination (`back-label="Tuesday Ladder"`), `#actions` slot.
- `AccountButton` avatar that opens account sheet (sign out, switch account, all leagues). Put it in top-level league screens' header actions.
- `UiButton` variants `primary | secondary | quiet | danger | optic`, `size="lg"`, `block`, `loading`, `to` (router link).
- `UiField` labelled input/textarea with `hint` and `error` (error is announced).
- `UiStepper` +/- number control.
- `UiState kind="loading|empty|error|denied"` title/body, `@retry`, `action-label` + `action-to`. Use for every non-content state.
- `UiSheet` bottom sheet / dialog (`:open`, `title`, `@close`, `#actions` slot). Use for forms and menus.
- `ActionBar` sticky thumb-zone bar for the screen's primary action; `above-tabs` on league tab screens; `#meta` slot for the count/reason next to the action.
- `CourtTile` matchup as a court (court number, team1, net, team2, scores, state). Reuse anywhere a game is shown.
- `StandingRow` rank, name, record, rating, optional link, `is-me`.
- `SaveStatus` needs / saving / saved / failed / final.
- `feedback.ts`: `confirm({title, body, confirmLabel, danger})` -> Promise<boolean> for anything destructive or that changes completed results;
  `toast(msg, 'ok'|'bad')` (also announced); `announce(msg, assertive?)` screen-reader only.
- `shareImage.ts`: `shareElementAsImage(el, fileName)` for image exports.

## State
- `useLeagueStore()` (`@/stores/league`): `group`, `players`, `isOrganizer`, `me`, `trackPayments`, `load(id, force?)`.
  Pages under `/groups/:groupId` call `league.load(groupId)`; AppShell also does.
- Organizer-only UI: gate with `league.isOrganizer`, and show `UiState kind="denied"` with a way back when a non-organizer deep-links in.
- IDs: rankings and history use the **global player id** (`playerId`); profile routes `/groups/:g/players/:id`
  and roster actions use the **group player id** (`id`). Map with `league.players.find(p => p.playerId === x)?.id`.

## Copy
Sentence case. Plain verbs. A button says what happens ("Save court 3", "Record payment"); the toast echoes it
("Payment recorded"). Errors say what failed and what to do; they do not apologize. No all-caps labels,
no eyebrow text, no middle-dot joined meta strings, no emoji, no "→" in buttons.

## Don'ts
No gradients, glass, decorative shadows, nested cards, pill clutter, filler stats, or entrance animations.
No horizontal overflow at 320px. Inputs are 16px+ (iOS zoom). Every icon-only button has `aria-label`.
