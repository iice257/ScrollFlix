# Plan G: Pass the Globe v2 (local and online)

Spec: `docs/superpowers/specs/2026-10-22-social-round-design.md`. Branch: `feat/pass-the-globe-v2` from `origin/main`.

## Rules (`party/party-logic.ts`, rewritten)

- Remove `weirdnessScore`, `ODD_GENRES`, `weirdnessLabel` and every use of them.
- `PartyMode = 'year' | 'rating' | 'crowd' | 'mixed'`. `modeForRound(mode, round)` rotates year → rating → crowd for `mixed`.
- Scoring, all pure:
  - `scoreYear(guess, actual) = max(0, 100 - 8 * |guess - actual|)`
  - `scoreRating(guess, actual) = max(0, round(100 - 25 * |guess - actual|))`
  - `scoreCrowd(yes, others) = others ? round(100 * yes / others) : 0`
- `isScorable(film, mode)`: year needs a year. Rating needs `ratingValue` and `voteCount >= 50`. Crowd always passes. An unscorable landing gives a `reflick` result: the turn is not used up.
- Turn flow phases: `off | setup | turn | guess | vote | result | final | settle | tonight`.
  - `turn`: waiting for a flick or shuffle.
  - `guess`: a year or rating mode landed and the player enters a guess.
  - `vote`: crowd mode, where the others vote. In local mode this is one screen with a toggle per other player.
  - `result`: the score is revealed.
  - `final`: standings.
  - `settle`: the veto finale.
  - `tonight`: the chosen film.
- Picks: `{ movieId, title, year, mode, guess?, votes?, score }`.
- Settle it:
  - The shortlist is each player's best pick (ties go to the earliest), with duplicate movie ids removed.
  - The veto order runs from the lowest total to the highest. Each player removes one film until two remain, and the winner (the earliest index on a tie) picks between the last two.
  - If the shortlist has a single film, skip straight to `tonight`.
  - `settle` can be switched off in setup (`settle: boolean`, default true).
- The reducer gains these actions: `start {names, rounds, mode, settle, online}`, `land {film}`, `guess {value}`, `vote {yes: boolean[]}`, `next`, `veto {movieId}`, `pick {movieId}`, `again`, `close`, `load {state}`.
- Keep the reducer pure and fully unit tested in `party-logic.test.ts`. Cover:
  - every phase transition
  - the scoring edges
  - the reflick
  - the mixed rotation
  - the veto order with ties
  - a single-film shortlist

## Online codec (`party/party-link.ts`, new, pure, no React)

- `encodeParty(state): string` and `decodeParty(code): PartyState | { error: 'broken' | 'newer' }`.
- The payload is versioned JSON, minified and base64url-encoded with no padding:

  ```
  {v:1, m:mode, r:rounds, s:settle, p:[names], t:[[tmdbId, round, guessOrNull, yesMaskOrNull, score], ...], x:[vetoedTmdbIds], w:tonightTmdbId|null, k:pendingVotes}
  ```

  Titles are not encoded; they're resolved from the catalogue by TMDB id, which keeps links short.
- 6 players × 3 rounds must encode to under 1,500 characters. Assert this in a test.
- Validate everything on decode: the types, the name lengths, the player count (2–6), the rounds (1–3), and the turn count. Never throw.
- `partyUrl(state, base = location.href)` sets `?party=` and clears other params.
- Export `summarizeParty(state): { headline: string; detail: string; lastTmdbId: string | null }`. Plan L's follow-up imports this for previews (for example "Your turn, Maya" and "Sam leads with 182 · Round 2 of 3"). Keep it free of DOM and React.

## Online flow (UI)

- In setup, a two-option segmented control: **Same phone** / **Over chat**.
- Over chat:
  - The host names the players and picks the mode. **Start** creates the state and shows **Pass to <first player>**: `navigator.share({ title, text, url })`, falling back to copying the link and a toast.
  - Opening a `?party=` link loads the state (`load`) and shows a board card: the players, the scores, and whose turn it is.
  - **I'm <name>, play my turn** starts the turn. In crowd mode, that player first votes on the landings they haven't voted on (`k`).
  - After the result, **Pass to <next>**.
  - During the finale, each veto is passed along by link the same way. The last link shows Tonight's film to everyone who opens it.
- Same phone: the existing flow plus guess and vote. Save the state to `sessionStorage` (`wtw:party:v2`) on every change, restore it on load, and clear it on close.

## UI quality bar

- Load `frontend-skill` before any UI work, and read `party.css` and the existing party components first. Extend them rather than replacing them.
- **Mobile first:** thumb-reachable controls, no text inputs for guesses.
  - **Year:** decade chips, then a year stepper or wheel. The default is the decade's middle.
  - **Rating:** a 1–10 slider with 0.5 steps and a big numeric readout.
  - **Votes:** large "Would watch" and "Pass" toggles per player chip.
- **The reveal is the moment.** The score counts up, an exact year shows Bullseye, and the actual value appears beside the guess. Reuse the existing sound effects (landing, save) through the shared sound engine. No new sound files.
- Tonight's film: a full card with the poster, a "Tonight's film" eyebrow, **Open film**, and **Share**, using the existing share sheet (`share/share-sheet.tsx`) where it fits.
- Respect `prefers-reduced-motion`. Every control is keyboard reachable, and Escape closes the overlays as today.

## `test-gallery.tsx`

Keep the edits small: swap the weirdness call at both landing sites for `partyDispatch({ type: 'land', film })`, render the new phase components, and read `?party=` on startup (next to where `?film=` is read). Everything else lives in `party/`. Don't touch the details card. A parallel builder is changing it.

## Done when

- The rules and codec tests pass. `npm run check`, `npm run build` and `npm run test:unit -- --run` are green.
- Browser check at 375×812 and on desktop:
  - a full local game in every mode
  - the finale through to Tonight's film
  - an online game passed through three links, by copying each link into a new tab
  - a broken link
- Report screenshots of: setup, the guess (year), the reveal, the crowd vote, the finale, and Tonight's film.
