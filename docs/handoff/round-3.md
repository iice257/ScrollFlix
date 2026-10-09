# Round 3 plan and idea ledger

Written 2026-10-08, after round 2 (PR #12) was merged and deployed. This file is the single list of what is decided, what is built and what is still owed. Update the status column as work lands.

## Owner decisions (2026-10-08)

- **Accounts:** not now. Planned for v4/v5. Guest egg progress stays local until then; do not build sign-in, and do not add a sign-up nudge yet.
- **English titles:** no API key, so the browser's on-device translation stays as it is.
- **Sound:** Easter egg sounds are on by default. Add a piece of music for the Easter egg presentation and a couple of small interaction effects. Nothing else makes sound, not even ambience.
- **Mood page:** "How are you feeling?" on Home gets a button beside it into the mood page, worded as a "pick your mood" call to action. The slot on the Filters page in Index is a funnel into the mood page, not the page itself.
- **iOS:** the full screen button is removed there until there is a design that works. Keep pushing immersion: the status bar and tab bar areas should feel like part of the site.
- **Time-of-day sky:** cut by the owner. Everything else from the idea lists is in scope.

## Ledger

Status: done, partial, todo, cut.

### From the first ideas list (the one the owner approved with "except the time of day thing, everything goes")

| # | Idea | Status |
|---|------|--------|
| 1 | Sound: per-path peak chime, landing thud, drone | done (round 2) |
| 1b | Music for the Easter egg presentation, small interaction effects | done (round 3, not heard by ear; a few effects only: shuffle, landing, save, mood) |
| 2 | Slow-motion beat when the card lands | partial: a 380 ms hold and a small push toward the poster before a premium card opens; no true slow motion, needs feel-testing |
| 2 | Chosen poster flies out of the globe into the card | done for ordinary picks and taps; premium cards keep their own flip |
| 2 | Gold "path to gold" reveal the first time it unlocks | todo |
| 3 | Time-of-day sky | cut |
| 3 | Weather: a very fast flick draws rain or snow across the globe | todo |
| 3 | Constellations: Saved films light up and connect into a shape | todo |
| 4 | "Tonight" mode: pick a mood and time budget, the run lands inside it | done: the mood page |
| 5 | Share card as a short clip | done (round 2) |
| 5 | Pass the globe party mode | todo |
| 6 | Cosmetic variants after finding a path N times | todo |
| 6 | Stats page becomes a profile (found paths, saved list, streak history) | todo |
| 6 | Favourites bias where the globe opens | done: the first pick and every shuffle lean towards saved films' genres |
| 7 | Tune the motion blur on a real flick | todo, needs a phone |
| 7 | Test on a real phone for performance and haptics | todo, needs a phone |
| 7 | Smarter preloader rule than waiting up to 25 s for slow posters | todo |
| 7 | Playwright Chromium project | todo |

### Mood page ideas from the round 2 review

| Idea | Status |
|------|--------|
| Full-screen mood worlds, each with its own sky, palette, illustration, one-line promise | done |
| Picking a mood fades the globe into that world and lands on a film from it | done: closes the page, filters, shuffles |
| Mix two moods | done |
| After a mood, ask how long they have and filter by runtime | done |
| Slim nudge after quick shuffles, never near an egg trigger | done: once per visit |

### From the second ideas list

| Idea | Status |
|------|--------|
| Taste profile: Saved movies shift which moods and genres the globe leans toward | done: shuffles lean (up to 3x), a "For you" tag on the mood page, a line in Saved |
| Pass the globe | todo (same as above) |
| Shareable run recap: paths found and streak | todo |
| Rarity events: a one-time golden hour that raises Gold odds, announced by a quiet sky change | todo |
| Constellations | todo (same as above) |
| Weather | todo (same as above) |
| Film-card trailers: a 3 second muted loop behind the poster on premium cards | blocked: the data has no video source and there is no API key |

### Round 2 items that stay open

- Real audio output, a real phone, a physical keyboard, Safari and Firefox clip recording and the Translator API were never verified.
- Accounts, the guest-egg nudge: moved to v4/v5.

## Notes for whoever builds these

- Pass the globe, rarity events and trailers all change the odds or the weight of the page. Keep each one behind its own flag and measure first-load size before and after.
- Trailers need a licensed source; TMDB video links point at YouTube, which cannot be looped muted without its player. Check this before promising it.
- Weather and constellations draw in the same pass as the sky, so reuse the staged compile and cancel logic from `sky-pass.ts`.
