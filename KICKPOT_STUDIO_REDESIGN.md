# KickPot Studio Redesign

## A. Design thesis

KickPot should feel like a private Saturday football competition, not a dashboard. The new visual language is **The Match Programme**: editorial football typography, broadcast score discipline, real club crests, ruled information bands and an understated private-club character. Colour is used as punctuation rather than decoration. Most content sits directly on the page with dividers; cards are reserved for discrete actions, modal moments and intentionally bounded content.

The system deliberately avoids the patterns that made v3 feel generated: no gradient icon bubbles, no purple glass cards, no decorative radial glows, no wall of 24px rectangles, no pill for every state, no equal-weight sections, and no generic `icon + title + chevron` treatment as the default.

## B. Design system

### Colour tokens

- `--kp-bg: #080A0D` — main canvas, neutral black with slight warmth.
- `--kp-surface: #0E1116` — rare raised surface.
- `--kp-surface-2: #141820` — pressed/selected surface.
- `--kp-text: #F3F1EB` — primary warm white.
- `--kp-text-soft: #C9C8C3` — secondary copy.
- `--kp-muted: #858A94` — tertiary metadata.
- `--kp-faint: #5B616C` — low-emphasis metadata.
- `--kp-line: rgba(243,241,235,.12)` — default divider.
- `--kp-line-strong: rgba(243,241,235,.22)` — structural divider.
- `--kp-accent: #6C63FF` — KickPot violet-blue, used sparingly.
- `--kp-accent-2: #88A7FF` — secondary cool accent.
- `--kp-live: #5BE6A5` — live / confirmed positive state.
- `--kp-warn: #F2B84B` — pending state.
- `--kp-danger: #FF6B6B` — destructive / error state.

No decorative gradients in product chrome. Team crests supply most incidental colour.

### Typography

Primary stack: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif`.

- Display 44/42, 800, tracking `-0.045em` — page titles and history winner.
- H1 34/34, 800, tracking `-0.035em`.
- H2 24/27, 750, tracking `-0.025em`.
- Section 17/22, 700.
- Body 15/21, 500.
- Metadata 12/16, 600.
- Micro 11/14, 700, used only where truly needed.
- Score 30–42px, 800, `font-variant-numeric: tabular-nums`.
- Standings points 18px, 800, tabular numerals.

Uppercase is used only for short broadcast labels such as `LIVE`, `FULL-TIME`, `EXACT`, `CURRENT POT` and day separators.

### Spacing / grid

- iPhone content inset: 18px.
- Full-bleed structured rows: `margin-inline: -18px; padding-inline: 18px`.
- Core spacing scale: 4, 8, 12, 16, 20, 28, 36, 48.
- Section rhythm is intentionally non-uniform: 28px between ordinary sections, 40–48px before major narrative sections.
- Minimum touch target: 44px.

### Radius

- `4px` — small score/result markers only.
- `8px` — inputs, score controls, compact action surfaces.
- `12px` — rare cards/modals.
- `999px` — avatar circles only. Pills are not a default container shape.

### Dividers / shadows

- 1px ruled dividers are the primary grouping device.
- Shadows are used only for bottom navigation and modal elevation.
- No glow shadows.

### Icons

Simple 1.8–2px outline icons, monochrome. Icons support comprehension; they do not headline every section.

### Motion

- Tab/content continuity: 180ms `cubic-bezier(.2,.8,.2,1)`.
- Micro state change: 160ms.
- Modal: 220ms.
- Rank/score change: 220ms, transform + opacity only.
- Reduced-motion mode disables non-essential transitions.

## C. Information architecture

### Authentication
Brand mark, short promise, one email field, one primary sign-in action. No dashboard chrome before sign-in.

### Onboarding
One page headed `Start a group`. Two editorial sections: create first, join second. Forms sit directly on the canvas with ruled grouping rather than independent cards.

### Matchday
1. Compact Matchday title / mode / next lock.
2. Payment gate only when relevant.
3. `Your picks` fixture ledger grouped by day.
4. Per-fixture state directly under each match.
5. One final save/lock action after editable fixtures.

### Live
1. `Live Matchday` masthead and live count.
2. Live table as a standings ledger.
3. Fixtures in progress / finished, score-dominant.
4. Revealed group picks below started fixtures only.
5. One commentary strip (`Goal swing` or `What you need`) when useful.

### History
1. Honours-board masthead.
2. Latest result / draw treatment.
3. Personal season totals as large type separated by rules.
4. Recent Matchdays.
5. Records / awards.

### Group
1. Group identity and role context.
2. Current pot as a strong single statement.
3. Roster/payment/rules/settings/admin destinations as an editorial index.
4. Treasurer tools remain one level deeper.

## D. Screen-by-screen design

1. **Sign in** — centred wordmark near top; `Predict. Score. Win the pot.` as large editorial display; email field with bottom rule; `Continue` full-width rectangular button; help copy beneath.
2. **Create / join** — `Start a group`; create fields first, separated by rules; `Create group`; then a thin `or join with a code` divider and join code field.
3. **Matchday / open** — `Matchday 3`, `For fun`, next lock time. Day labels sit on the left edge; each fixture is one ruled row. Crests flank team names, prediction score controls sit between teams. No giant fixture cards.
4. **Matchday / mixed lock state** — locked fixtures show static score typography and a lock glyph in metadata; later fixtures keep tactile ± controls.
5. **Completed fixture** — actual score is primary, `Your pick 0–2` secondary, `+3 EXACT` appears as a compact text marker with a short accent rule.
6. **Live / active** — no hero card; live count and time appear on one metadata line. The first content block is the table.
7. **Live table** — full-width rows, rank in narrow gutter, name, optional subtle movement marker, points aligned right. Current user row is identified by a 2px accent rule rather than a floating card.
8. **Revealed picks** — a small two-column prediction ledger under the started fixture; names left, predicted score right. `YOU` is quiet text, not a chip.
9. **Goal Swing / What You Need** — one editorial commentary band with a 3px accent rule and one decisive sentence. No illustration or glow.
10. **History overview** — large `History`; latest winner/draw rendered like an honours-board plaque without a rounded container; season totals below.
11. **Historical Matchdays** — simple chronological list with Matchday left and winner/draw right.
12. **Season records** — record rows with award name, holder and stat; one restrained icon at most.
13. **Group overview** — group name, private label, stake/members/Treasurer line; `Current pot £30` as large type; destinations below as ruled rows.
14. **Members** — roster list with avatar initial, name and payment state aligned right.
15. **Payments** — bank details shown as a factual detail sheet; one copy action; one payment-state action; roster below.
16. **Rules** — four short statements on separate ruled rows. Scoring numerals align right.
17. **Group settings** — labelled fields and destructive actions separated from ordinary actions by extra space and danger styling.
18. **Admin overview** — `Admin` masthead, three status figures across one ruled band, then four destinations.
19. **Admin payment control** — member list with current payment state; tap opens confirmation.
20. **Admin scoring adjustments** — explicit input, reason, existing audit history below. Danger/warning copy is plain and unambiguous.
21. **Admin member management** — transfer Treasurer and remove-member actions never share the same casual visual treatment as ordinary navigation.
22. **Admin group/invite** — group details, stake, invite code and bank details grouped by labelled rules.

### System states

- Loading: keep existing cached structure visible; use one inline progress line only if first-ever data is absent.
- Empty: one sentence and one next action, no illustration.
- Error: inline error copy adjacent to the failed action.
- Confirmation modal: compact sheet with clear verb and destructive action colour only where applicable.
- Toast: single-line bottom feedback above nav.
- Multiple groups: native-feeling selector with plain surface and chevron, not a pill.

## E. Component specification

### Fixture row
Full-width ruled block. 16px vertical padding. Team line first, prediction/score second, metadata third. Crests 34–40px. Team names max 2 lines. No outer radius.

### Prediction control
Three-part control per side: 44px minus, 44px numeric centre, 44px plus. Radius 8px on outside corners only. Static locked prediction becomes plain score numerals.

### Live score
Actual score is 30–36px tabular bold, centred. Live minute uses green text with no glow. Completed state uses warm white.

### Leaderboard row
56px minimum height, rank gutter 28px, name flexible, points 40px right-aligned. Movement occupies a fixed 20px lane so columns never jump.

### Revealed prediction treatment
No horizontal chip scroller. Compact ruled list / 2-column grid. `No pick` uses muted text.

### Player row
Initial/avatar 32px, name, contextual sublabel only when useful, right-aligned state.

### Payment state
`Paid` green, `Needs approval` amber, `Unpaid` muted/red depending severity. Plain text + optional 6px status dot.

### Award / record
One row per record, larger holder name, quiet record label, stat at right. No award tiles.

### Bottom navigation
Fixed to safe area, 64px visual height + bottom inset. Near-black opaque background, 1px top divider, no floating capsule. Active tab uses brighter label/icon plus a 2px top indicator spanning only the icon width.

### Header
52–56px compact height. Flat mark, wordmark, activity and account controls. No gradient orb, no large circular button borders.

### Modal
Max width 360px, 12px radius, dark neutral surface, strong title, 2 actions in a ruled footer.

### Admin controls
Ordinary admin navigation resembles the rest of the group index. Irreversible actions use a separated danger section and explicit confirmation copy.

## F. Responsive / iPhone behaviour

- Design target 390–430px.
- Safe areas are respected top and bottom.
- 18px side insets; structured match rows can bleed to the viewport edges while preserving 18px internal padding.
- 44px minimum interactive height.
- No horizontal scrolling for core fixture, table, member or payment content.
- Team-name wrapping is allowed before shrinking score readability.
- Bottom nav never overlays the final content row; screen bottom padding includes nav + `env(safe-area-inset-bottom)`.

## G. Motion spec

- Tab switch: content remains mounted/cached where current runtime supports it; no loading flash. Existing screen is never blanked to show an avoidable placeholder.
- Same-tab tap: smooth return to top only.
- Score buttons: 160ms press state; no bounce.
- Live score change: 220ms fade/translate of the number only.
- Rank movement: 220ms translate up/down 4px + opacity; row geometry stays fixed.
- Toast: 180ms up/fade, 160ms out.
- Modal: 220ms opacity + 6px scale/translate.

## H. Accessibility

- Text contrast targets WCAG AA; primary text exceeds 7:1 on canvas.
- Status is never colour-only: labels remain visible (`Paid`, `Live`, `Exact`, etc.).
- Touch targets at least 44px.
- Focus-visible ring uses `2px solid var(--kp-accent-2)` with 2px offset.
- Score inputs retain accessible labels.
- Motion obeys `prefers-reduced-motion`.
- Tables preserve semantic markup where already present.
- Modals use legible action labels and clear destructive wording.

## Architecture audit / feature parity checklist

Base branch: `chatgpt/global-render-stability`, which already contains the latest render-stability and service-worker fixes and is ahead of the earlier transition-stability branch.

Observed frontend architecture before redesign:

- `app.js` owns Supabase session, group/gameweek state, payment gating, predictions, lock timing, live refresh, leaderboard/history and base render functions.
- `ui-v3.js` then observes rendered DOM and rearranges it into the current visual product, including score steppers and Group/History/Live subviews.
- Separate scripts extend live status, revealed picks, settlement/draws, rollover, admin, settings and auth.
- Multiple CSS layers (`styles.css`, `premium-ui.css`, `product-v3.css`, `product-v3-tune.css`, feature CSS) compete for presentation and are a major source of the current generated/template feel.

Redesign strategy:

- Do not touch Supabase schema, RLS or server business rules.
- Keep existing feature scripts and their bindings intact.
- Remove the v3 decorative/premium CSS layers from the document and replace them with one authored Studio stylesheet loaded after the small feature-specific functional styles.
- Preserve existing semantic/class hooks used by the scripts so prediction/payment/admin logic does not break.
- Keep render-stability/runtime scripts that prevent visible reload/jump behaviour.

Feature parity to verify before merge:

- [ ] Supabase sign in / password / passkey flows
- [ ] create group / join group / switch groups
- [ ] ordinary member vs Treasurer permissions
- [ ] unpaid / claimed / confirmed payment states
- [ ] payment gating before prediction submission
- [ ] per-fixture kick-off locking
- [ ] editable and locked prediction controls
- [ ] exact / correct result / zero-point outcomes
- [ ] live fixture status never starts before kick-off
- [ ] live table / rank movement
- [ ] group picks private before kick-off, revealed after kick-off
- [ ] history settlement, winner and draw support
- [ ] season stats / records
- [ ] members / payments / rules / settings views
- [ ] admin payment / scoring / member / group controls
- [ ] destructive confirmations
- [ ] PWA manifest / service worker / iOS safe areas
- [ ] rapid tab switching / same-tab top behaviour / scroll restoration
- [ ] cached content remains visible during background refresh
