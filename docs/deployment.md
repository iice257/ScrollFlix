# Deployment environments

ScrollFlix has four environments. Code moves through them in one direction, and
every step after local development is checked automatically.

| Environment | URL | Git branch | What deploys it | Protection |
| --- | --- | --- | --- | --- |
| Local | http://localhost:3000 (`npm run dev`) | any | you | none. Dev mode exists only here. |
| Preview | a unique `*.vercel.app` URL per PR | the PR branch | Vercel, on every push to a PR | CI (`Lint, unit tests, build`, `End-to-end tests`) |
| Staging | https://staging.scrollflix.app | `staging` | Vercel, on every push to `staging` | PR required, CI required. Smoke checks run after each deploy. |
| Production | https://scrollflix.app | `main` | Vercel, on every push to `main` | PR required, CI and the staging smoke check required. Smoke checks run after each deploy, and every 15 minutes. |

`staging` is also the repository's default branch, so a new PR targets it
without anyone choosing.

## Day to day

```
feature branch --PR--> staging --promote--> main
                          |                  |
                  staging deploy        production deploy
                  smoke check           smoke check + issue on failure
```

1. Branch from `staging`, make the change, open a PR **into `staging`**. CI runs
   and Vercel posts a preview URL on the PR.
2. Merge when CI is green. Vercel deploys https://staging.scrollflix.app and the
   `Smoke (deployed)` workflow checks it.
3. Click through staging if the change deserves it.
4. Promote: run **Actions > Promote staging to production**, or `ship release`
   from a terminal. It checks that the newest `staging` commit has green CI and a
   passing staging smoke check, opens (or reuses) a PR `staging` -> `main`, and
   merges it with a merge commit. It then waits for production and its smoke
   check.
5. Production deploys, the smoke check runs against https://scrollflix.app, and
   any failure opens an issue (see below).

With the owner's `ship` tool: `ship feat "what changed"` does steps 1 to 2
(commit, push, PR into `staging`, merge when green, wait for the deploy and the
staging smoke check), and `ship release` does step 4. Agents open PRs against
`staging` and never push to `main`.

Always merge `staging` into `main` with a **merge commit** (the promote workflow
does). Squash or rebase would give the two branches different histories and the
next promotion would conflict.

## What is checked, and where

| Check | When | Against | Fails how |
| --- | --- | --- | --- |
| CI: `Lint, unit tests, build` and `End-to-end tests` (`ci.yml`) | PRs into `main` or `staging`, pushes to both | the PR code | red check, blocks merge |
| Smoke, on deploy (`smoke-deployed.yml`) | after Vercel finishes a production deploy, or a deploy of the newest `staging` commit | staging.scrollflix.app or scrollflix.app | red run; for production also a `prod-down` issue |
| Uptime (`uptime.yml`) | every 15 minutes, or on demand | scrollflix.app (HTTP checks) | `prod-down` issue |
| Promote (`promote.yml`) | on demand | the `staging` commit, its CI and smoke result | refuses to promote |

The smoke spec is `playwright-tests/smoke.spec.ts`, run through
`playwright.smoke.config.ts` (Chromium only, no dev server, read-only, well
under a minute). It checks:

- the home page returns 200 with the app root and a title;
- the built JS and CSS referenced by the page load as real assets;
- `/version.json` serves the commit that was just deployed (deploy checks only);
- the catalogue manifest lists at least 50,000 films and the first chunk loads;
- one catalogue poster loads from the TMDB image CDN;
- `/api/og?kind=default` returns an image;
- `/api/weather` does not return a 5xx (skipped while the route returns 404, so
  it can ship before or after this; set `SMOKE_REQUIRE_WEATHER=1` to make a 404
  a failure once it exists everywhere);
- in a real browser, the page has no uncaught errors, no failed same-origin
  script or stylesheet, and the globe canvas mounts (or the no-WebGL fallback
  menu renders when the runner has no WebGL2).

Run it yourself:

```
BASE_URL=https://scrollflix.app npm run smoke              # production
BASE_URL=https://staging.scrollflix.app npm run smoke      # staging
npm run build && npm run preview -- --port 4173            # then, in another shell:
BASE_URL=http://localhost:4173 npm run smoke               # a local build
```

Add `SMOKE_CHANNEL=chrome` to use an installed Chrome instead of
`npx playwright install chromium`. `vite preview` has no API routes, so the two
`/api` checks skip themselves on localhost.

### How a deploy is matched to a commit

`vite build` writes `dist/version.json` (`{ "sha": ..., "ref": ..., "env": ... }`)
from `VERCEL_GIT_COMMIT_SHA`. After Vercel reports a deployment, the smoke
workflow polls `<url>/version.json` for up to 3 minutes until it serves the
deployed commit, so it never tests the previous version by mistake. Staging is
recognised as "a deployment of the current head of `staging`", because Vercel
reports the commit sha, not the branch name, as the deployment's ref.

The result is also written to the commit as a status, `smoke/staging` or
`smoke/production`. The promote workflow reads `smoke/staging`.

## Alerts: `prod-down`

When a production smoke check fails (after a deploy or on the 15-minute check),
the workflow opens one issue titled **Production smoke check failed** with the
label `prod-down`. It contains the run link, the names of the failing checks and
the rollback steps. GitHub emails you about it like any other issue (make sure
Watching on the repository includes issues, or add a rule in your notification
settings for the `prod-down` label).

- Only one such issue is open at a time. While it stays open, further failures
  add a comment at most every 3 hours.
- When a later check passes against production, the workflow comments and closes
  the issue by itself.
- The run's summary page also prints the rollback command.
- A failing **staging** check does not open an issue. It turns the run red and
  blocks `Promote`.

Scheduled workflows run only from the default branch and GitHub pauses them after
60 days without repository activity. Re-enable from the Actions tab if that ever
happens.

## Roll back in 30 seconds

Production is broken and you want the last good version back now:

1. https://vercel.com > the `scrollflix` project > **Deployments**.
2. Pick the last good **Production** deployment > the `...` menu > **Promote to
   Production** (this is Instant Rollback; no rebuild).

Or from a terminal: `npx vercel rollback` (rolls back to the previous
production deployment), or `npx vercel promote <deployment-url>` for a specific
one.

After a rollback Vercel stops pointing the domain at new deployments until you
promote one by hand, so fix forward as normal (PR into `staging`, promote), then
promote the fixed production deployment from the same menu. Instant Rollback
does not change git: `main` still has the bad commit. Revert it on `staging`
(`git revert -m 1 <merge commit>`) so the next promotion does not bring it back.

## When `prod-down` fires

1. Open the issue and the linked run. See which check failed.
2. Is the site actually down for users? Open https://scrollflix.app.
3. If it is, or the cause is the last deploy, roll back first (above), debug second.
4. If it is not a deploy (for example the TMDB image CDN or a Vercel incident),
   check https://www.vercel-status.com and the TMDB status page. Nothing to roll
   back; the issue closes itself when it recovers.
5. Fix forward through `staging`. Leave the issue open; it closes on the first
   passing check.
6. To re-check by hand at any time: **Actions > Uptime > Run workflow**.

## Settings that make this work

Repository (the repository owner sets these in GitHub):

- Default branch: `staging`.
- Branch protection on `main`: require a pull request; require status checks
  `Lint, unit tests, build`, `End-to-end tests` and `smoke/staging`; block force
  pushes; allow **merge commits** (the promote workflow uses them).
- Branch protection on `staging`: require a pull request; require status checks
  `Lint, unit tests, build` and `End-to-end tests`; block force pushes.
- Settings > Actions > General > Workflow permissions: allow **Allow GitHub
  Actions to create and approve pull requests** (the promote workflow opens the
  staging -> main PR with `GITHUB_TOKEN`). If you do not want that, the promote
  workflow stops with a link to open the PR by hand.
- Optional: allow auto-merge. Without it the promote workflow merges directly,
  which is fine because it has just verified the checks itself.
- Repository secret `VERCEL_AUTOMATION_BYPASS_SECRET` (optional): only needed if
  Vercel Deployment Protection is on for staging. The smoke checks send it as the
  `x-vercel-protection-bypass` header. The simpler option is to leave staging
  public.

Vercel:

- `staging.scrollflix.app` is attached to the project with Git branch `staging`.
- Production branch is `main`, domain `scrollflix.app`.

- Live rooms for Pass the globe (`/api/party`) keep their state in Upstash
  Redis. Add the **Upstash for Redis** integration to the project in the Vercel
  Marketplace and connect it to Production and Preview: it sets
  `KV_REST_API_URL` and `KV_REST_API_TOKEN` (the `UPSTASH_REDIS_REST_*` names
  also work). Without them the function answers 503 and "Over chat" falls back
  to passing a link after each turn, so nothing breaks. Rooms expire after 24
  hours.

Required status check names, exactly: `Lint, unit tests, build`,
`End-to-end tests`, `smoke/staging` (the last one on `main` only).

Note on checks for the promotion PR: it is opened by `GITHUB_TOKEN`, and GitHub
does not start `pull_request` workflows for PRs opened that way. That is fine:
the required CI checks already ran for the same commit when it was pushed to
`staging` (CI runs on pushes to `staging` for this reason), and GitHub counts
checks by commit.

## Optional later: gated promotion through the Vercel API

Today `main` -> production is automatic as soon as `main` moves, and the smoke
check finds problems afterwards. A stricter setup builds production but does not
serve it until the smoke check passes:

1. Create a Vercel token (Account Settings > Tokens) and add it as the repository
   secret `VERCEL_TOKEN`; add `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` as secrets
   or variables.
2. Set the project's `autoAssignCustomDomains` to `false`
   (`PATCH /v9/projects/{id}` with `{"autoAssignCustomDomains": false}`, or
   Project Settings > Domains > turn off automatic assignment). Production
   deployments then build on every `main` push but are not attached to
   scrollflix.app.
3. In `smoke-deployed.yml`, smoke-test the new production deployment's own URL
   (`github.event.deployment_status.environment_url`), and on success run
   `npx vercel promote <url> --token "$VERCEL_TOKEN"` to move the domain. On
   failure the old version keeps serving, and the issue is opened as before.

This is not implemented; it is a documented option.

## Files

| File | Purpose |
| --- | --- |
| `playwright-tests/smoke.spec.ts`, `playwright.smoke.config.ts` | the smoke checks, `npm run smoke` |
| `.github/actions/smoke/action.yml` | installs and runs the smoke checks (shared) |
| `.github/workflows/ci.yml` | CI on PRs and pushes to `main` and `staging` |
| `.github/workflows/smoke-deployed.yml` | smoke check after each production or staging deploy |
| `.github/workflows/uptime.yml` | 15-minute production check |
| `.github/workflows/promote.yml` | staging -> main promotion |
| `scripts/ci/smoke-alert.mjs` | opens and closes the `prod-down` issue |
| `scripts/ci/ship-helpers.mjs` | helpers for the `ship` workflows |
| `.ship.json` | `ship` workflows: PR into `staging`, and `ship release` |
| `vite.config.ts`, `vercel.json` | write `dist/version.json` and serve it uncached |
