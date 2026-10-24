# Social round: Pass the Globe v2, link previews, trailers, English titles

Written 2026-10-22 from the owner brainstorm of 2026-10-19 to 2026-10-22.

## Goal

Make ScrollFlix something people share and play together, mobile first:

1. **Pass the Globe v2.** Replace the weirdness score with scoring people can actually play at. End the game with one film to watch tonight. Offer two ways to play: on one phone, and over chat by passing a link.
2. **Dynamic link previews.** Every link shared from ScrollFlix (a film, a party turn, the home page) unfurls in WhatsApp, iMessage, X, Discord, Slack and so on with its own image and text.
3. **Trailers.** A "Play trailer" button in the film card, with fallbacks that never leave the user stuck.
4. **English titles that work everywhere.** The translate button is broken on desktop and missing on mobile. Fix it at the data level first, and keep on-device translation as a fallback.

## Owner decisions

- Movie night (a group lands on one film) is the reason to come back. The party game is how we get there.
- Weirdness scoring is "slop" and goes. Better scoring systems replace it.
- There are both a local mode and an online mode.
- Dynamic previews are wanted everywhere, not only on party links.
- The TMDB token now exists (repo secret `TMDB_API_READ_TOKEN`).
- Bad trailers need safe, robust fallbacks and clear messages to the user.
- Mobile-heavy audience. Hobby project: everything runs at zero cost, with no database this round.

## Findings

- Pass the Globe is `app/cmps/views/test-gallery/party/` (rules in `party-logic.ts`, UI in `party-ui.tsx`), wired into `test-gallery.tsx` with `useReducer(partyReducer)`. A landing becomes a pick where the code says `party.phase === 'turn'` (around lines 2037 and 2236 on main). The entry point is in About.
- Shared film links are `?film=<tmdbId>` (`share/share-link.ts`, `landing.ts`). `index.html` has one static `og.jpg`. The site is a Vite SPA on Vercel with a catch-all rewrite to `index.html`.
- The catalogue is built by `scripts/catalog/` from TMDB `/movie/{id}?append_to_response=external_ids` and published as a release asset by `.github/workflows/catalog.yml`. `title` from TMDB's default language is already the English title when TMDB has one. Text chunks hold `[overview, tagline, imdbId]`.
- Translation (`title-translation.ts`, `use-title-translation.ts`) needs the Translator and LanguageDetector APIs, which only exist in desktop Chrome and Edge. That's why the button never shows on mobile. On desktop it calls `Translator.create()` from an effect rather than from the click, so the first language-pack download fails without user activation, and the button looks like it does nothing.
- TMDB trailers are YouTube keys. Some are wrong, removed, or not embeddable. That can only be known when the player tries.

## Design

Three workstreams, built in parallel by separate builders. Each has its own plan:

| Plan | Workstream | Main files |
|---|---|---|
| `2026-10-22-G-pass-the-globe.md` | Party game v2, local and online | `party/*`, a small hook-up in `test-gallery.tsx` |
| `2026-10-22-L-link-previews.md` | Crawler previews and OG images | `middleware.ts`, `api/og.tsx`, `api/_lib/*`, `vercel.json`, `index.html` |
| `2026-10-22-F-film-card.md` | Catalogue fields, English titles, trailers | `scripts/catalog/*`, `catalog-loader.ts`, `title-translation*`, `trailer/*`, the details card in `test-gallery.tsx` |

G and F both touch `test-gallery.tsx`, in different places (the party wiring and the details card). Both keep their edits there small and put the real code in their own modules. The orchestrator resolves any merge conflict.

After G merges, L gets a short follow-up to add party previews using G's link codec (`party/party-link.ts`).

### Pass the Globe v2 rules (summary; the plan has the detail)

- **Modes**, chosen in setup:
  - **When was it?** (the default): after landing, you guess the release year. Score `max(0, 100 - 8 × |off|)`; an exact guess is a "Bullseye".
  - **Rate it:** you guess the TMDB rating, 1.0–10.0 in 0.5 steps. Score `max(0, round(100 - 25 × |off|))`.
  - **Crowd pleaser:** the other players vote "Would watch" or "Pass" on your landing. Score `round(100 × yes / others)`.
  - **Mixed:** the mode rotates each round.
- **Fair landings:** if a film can't be scored in the current mode (no year, or no rating, or under 50 votes for Rate it), the turn says so and gives a free re-flick.
- **"Settle it" finale** (on by default, can be switched off in setup):
  - The shortlist is each player's best-scoring landing, with duplicates removed.
  - Players veto one film each, starting with the last-placed player.
  - The winner gets the final choice between the last two.
  - The surviving film is "Tonight's film": its card opens, with Share.
- **Same phone:** like today. The state is kept in `sessionStorage` so a reload doesn't lose the game.
- **Over chat:**
  - The whole game state lives in the URL as `?party=<code>`, a compact, versioned base64url payload.
  - Whoever opens the link sees the board, confirms who they are, flicks, and guesses. Then **Pass to <next player>** opens the native share sheet with the new link.
  - In Crowd pleaser, votes happen on your own turn: before you flick, you vote on the landings you haven't voted on yet.
  - The veto finale is passed the same way.
- **Weirdness** is removed completely, along with its labels.

### Link previews (summary)

- Vercel Routing Middleware sees link-preview crawlers on `/` and returns a tiny HTML page with Open Graph and Twitter tags for that URL. Everyone else gets the SPA as before.
- `/api/og` renders 1200×630 images with `@vercel/og`, in the app's visual language: dark, poster-led, with the brand mark.
- **Film links:** the title, year and rating come from the TMDB API (`TMDB_API_READ_TOKEN` as a Vercel environment variable). The edge caches the result. If the call fails, the generic card is used.
- **Default:** a branded card that replaces the static `og.jpg`.

### Film card (summary)

- **Catalogue:** append `videos` to the details call, and store `originalTitle` (only when it differs from the title), `originalLanguage`, and up to three ranked YouTube trailer keys, all in the text chunks. The decoder accepts old chunks without them. A **seed** run fills them for every film (the orchestrator triggers it after merging).
- **Titles:** the English title is primary. When the original differs, a quiet "Original title" line shows it. This works on every phone with no API. On-device translation stays only for titles TMDB has no English for, runs inside the click, shows its download or progress state, and says plainly when it can't translate.
- **Trailers:** the button appears only when there are trailer keys.
  - **Loading:** the YouTube IFrame API loads on the first tap and never before.
  - **Layout:** a full-height sheet on phones, a centred player on desktop.
  - **Errors:** on a player error (codes 2, 5, 100, 101, 150) or a 10-second timeout, it tries the next key.
  - **All keys fail:** it shows "This trailer can't play here" with "Watch on YouTube" (a search for title, year and "trailer"), and remembers the dead keys so next time the button goes straight to YouTube.
  - **While it plays:** app sounds are muted.

## Error handling

- Party links that fail to decode, come from a newer version, or have been tampered with open a friendly "This game link is broken" card with "Start a new game", never a crash.
- Preview generation always falls back to the generic card. The middleware never blocks real users: any error falls through to the SPA.
- Trailer and translation failures are always told to the user in one plain line, with a way forward.

## Testing

- Unit tests (Vitest) for:
  - the scoring, finale and turn rules
  - the party link codec: round trips, the version, garbage input, and URL length with 6 players × 3 rounds
  - crawler detection and meta building
  - trailer key ranking
  - row and text codec back-compat
  - the translation trigger
- `npm run check`, `npm run build` and `npm run test:unit -- --run` pass on every branch.
- Browser checks on a phone-sized viewport (375×812) and on desktop for every UI change.
- Previews: `curl -A "facebookexternalhit/1.1"` against the Vercel preview deployment returns film-specific tags, and `/api/og` returns a PNG.

## Out of scope this round

Accounts, live real-time play, Daily Spin, globe lenses, the personal layer, accessibility work, the remaining performance levers, fly-to search, recaps. The other session's open PRs (#29, #30, #32, #33) aren't touched.

## Needs from the owner

Nothing to start. The orchestrator handles the Vercel environment variable (`TMDB_API_READ_TOKEN` for the preview function) and the catalogue seed run. If the Vercel variable can't be set from here, the owner pastes the token into Vercel once.
