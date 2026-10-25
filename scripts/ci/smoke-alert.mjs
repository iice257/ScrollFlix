// Turns a smoke-check result into a GitHub issue: opens (or updates) one
// "Production smoke check failed" issue labelled `prod-down` when production is
// failing, and closes it with a comment once production is healthy again.
// Only one such issue is open at a time. Needs `gh` and GH_TOKEN with
// `issues: write`; nothing secret is ever printed or put in the issue.
//
//   node scripts/ci/smoke-alert.mjs
//
// Environment:
//   SMOKE_OUTCOME   success | failure (the result of the smoke step)
//   SMOKE_TARGET    URL that was tested
//   SMOKE_SOURCE    short label for where the check came from, e.g. "deploy of abc1234"
//   RUN_URL         link to the workflow run
//   SMOKE_RESULTS   path to the Playwright JSON report (default smoke-report/results.json)
//   GITHUB_REPOSITORY, GH_TOKEN  (set by GitHub Actions)
//   DRY_RUN=1       print what would happen, change nothing
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const LABEL = 'prod-down'
export const TITLE = 'Production smoke check failed'
// While an issue is open, repeat failures only add a comment this often.
export const COMMENT_EVERY_MS = 3 * 60 * 60 * 1000

/** Titles of the tests that failed in a Playwright JSON report. */
export function failingTests(report) {
  const failed = []
  const walk = (suite, trail) => {
    const here = suite.title ? [...trail, suite.title] : trail
    for (const spec of suite.specs ?? []) {
      if (spec.ok === false) failed.push([...here, spec.title].join(' > '))
    }
    for (const child of suite.suites ?? []) walk(child, here)
  }
  for (const suite of report?.suites ?? []) walk(suite, [])
  return failed
}

export function rollbackSteps() {
  return [
    '1. Open https://vercel.com, then the `scrollflix` project, then Deployments.',
    '2. Find the last deployment that was good (Production, before the bad one), open its menu and choose **Promote to Production** (instant rollback).',
    '   Or from a terminal: `npx vercel rollback` (rolls back to the previous production deployment).',
    '3. Check https://scrollflix.app/version.json and re-run the `Uptime` workflow to confirm.',
    '4. Fix forward on a branch and PR into `staging`. Note: after a rollback Vercel stops auto-assigning new deployments to the domain, so promote the fixed deployment from the same menu (or run `npx vercel promote <url>`).',
    '5. Or undo the change in git: revert the bad merge on `staging`, then run the "Promote staging to production" workflow.',
  ].join('\n')
}

export function issueBody({ target, source, runUrl, failed, when }) {
  const list = failed.length
    ? failed.map((t) => `- ${t}`).join('\n')
    : '- (no individual test result; the check could not run or timed out, see the run log)'
  return [
    `The smoke checks against ${target} failed (${source}).`,
    '',
    `Run: ${runUrl}`,
    `Time: ${when}`,
    '',
    'Failing checks:',
    list,
    '',
    '## Roll back',
    rollbackSteps(),
    '',
    'This issue closes itself when a later smoke check passes against production.',
  ].join('\n')
}

function gh(args, input) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

function openIssues() {
  const out = gh([
    'issue',
    'list',
    '--label',
    LABEL,
    '--state',
    'open',
    '--json',
    'number,createdAt,comments',
    '--limit',
    '20',
  ])
  return JSON.parse(out)
}

function lastActivity(issue) {
  const times = [issue.createdAt, ...issue.comments.map((c) => c.createdAt)]
  return Math.max(...times.map((t) => Date.parse(t)))
}

function main() {
  const outcome = process.env.SMOKE_OUTCOME
  const target = process.env.SMOKE_TARGET || 'https://scrollflix.app'
  const source = process.env.SMOKE_SOURCE || 'scheduled check'
  const runUrl = process.env.RUN_URL || '(no run link)'
  const dry = process.env.DRY_RUN === '1'
  const resultsPath = process.env.SMOKE_RESULTS || 'smoke-report/results.json'
  const run = (args, input) => {
    if (dry) console.log(`[dry-run] gh ${args.join(' ')}`)
    else return gh(args, input)
  }

  if (outcome !== 'success' && outcome !== 'failure') {
    console.log(`Outcome is "${outcome}", nothing to report`)
    return
  }

  const open = openIssues()

  if (outcome === 'success') {
    for (const issue of open) {
      run(
        [
          'issue',
          'close',
          String(issue.number),
          '--comment',
          `Smoke checks passed against ${target} (${source}). Run: ${runUrl}`,
        ],
        undefined,
      )
      console.log(`Closed #${issue.number}`)
    }
    if (open.length === 0) console.log('Production healthy, no open issue')
    return
  }

  let failed = []
  if (existsSync(resultsPath)) {
    try {
      failed = failingTests(JSON.parse(readFileSync(resultsPath, 'utf8')))
    } catch {
      // Keep going: an unreadable report still deserves an alert.
    }
  }
  const body = issueBody({
    target,
    source,
    runUrl,
    failed,
    when: new Date().toISOString(),
  })

  if (open.length === 0) {
    run([
      'label',
      'create',
      LABEL,
      '--color',
      'B60205',
      '--description',
      'Production is failing its smoke checks',
      '--force',
    ])
    run(['issue', 'create', '--title', TITLE, '--label', LABEL, '--body-file', '-'], body)
    console.log('Opened a new issue')
    return
  }

  const [issue] = open
  if (Date.now() - lastActivity(issue) < COMMENT_EVERY_MS) {
    console.log(`#${issue.number} is already open and recent, not commenting again`)
    return
  }
  run(['issue', 'comment', String(issue.number), '--body-file', '-'], `Still failing.\n\n${body}`)
  console.log(`Commented on #${issue.number}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
