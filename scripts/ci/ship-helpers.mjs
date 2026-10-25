// Small helpers for the `ship` workflows in .ship.json. Needs `gh` signed in.
//
//   node scripts/ci/ship-helpers.mjs guard               fail unless PRs will target staging
//   node scripts/ci/ship-helpers.mjs wait-smoke staging  wait for the smoke result on HEAD
//   node scripts/ci/ship-helpers.mjs release             run the promote workflow, watch it
//
// `ship feat "..."` opens its PR against the repository's default branch, so
// the default branch has to be `staging` for the flow in docs/deployment.md.
import { execFileSync, spawnSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const gh = (args) =>
  execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const git = (args) =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

const fail = (message) => {
  console.error(`ship-helpers: ${message}`)
  process.exit(1)
}

function guard() {
  const branch = gh(['repo', 'view', '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name'])
  if (branch !== 'staging') {
    fail(
      `the GitHub default branch is "${branch}", so ship would open its PR against it. ` +
        'Set the default branch to "staging" (Settings > Branches), then run ship again.',
    )
  }
}

async function waitSmoke(name) {
  const sha = git(['rev-parse', 'HEAD'])
  const context = `smoke/${name}`
  console.log(`Waiting for ${context} on ${sha.slice(0, 7)} (up to 8 min)...`)
  const deadline = Date.now() + 8 * 60_000
  let last = ''
  while (Date.now() < deadline) {
    const state = gh([
      'api',
      `repos/{owner}/{repo}/commits/${sha}/statuses`,
      '--jq',
      `[.[] | select(.context == "${context}")][0].state // "pending"`,
    ])
    if (state !== last) console.log(`  ${context}: ${state}`)
    last = state
    if (state === 'success') return
    if (state === 'failure' || state === 'error') {
      fail(`${context} failed for ${sha.slice(0, 7)}. Do not promote. See the Smoke (deployed) run.`)
    }
    await sleep(15_000)
  }
  console.warn(`No ${context} result within 8 minutes; check the Actions tab before promoting.`)
}

async function release() {
  const started = Date.now() - 5_000
  console.log('Starting the "Promote staging to production" workflow...')
  gh(['workflow', 'run', 'promote.yml', '-f', 'wait=true'])

  let runId = null
  for (let i = 0; i < 20 && !runId; i++) {
    await sleep(3_000)
    const runs = JSON.parse(
      gh([
        'run',
        'list',
        '--workflow',
        'promote.yml',
        '--event',
        'workflow_dispatch',
        '--limit',
        '5',
        '--json',
        'databaseId,createdAt',
      ]),
    )
    runId = runs.find((r) => Date.parse(r.createdAt) >= started)?.databaseId ?? null
  }
  if (!runId) fail('the promote run did not appear. Check the Actions tab.')
  console.log(`Watching run ${runId}...`)

  const watch = spawnSync('gh', ['run', 'watch', String(runId), '--exit-status', '--interval', '10'], {
    stdio: 'inherit',
  })
  const url = gh(['run', 'view', String(runId), '--json', 'url', '--jq', '.url'])
  if (watch.status !== 0) fail(`promotion failed or was stopped. Details: ${url}`)

  try {
    const res = await fetch('https://scrollflix.app/version.json', { cache: 'no-store' })
    const { sha } = await res.json()
    console.log(`Production is serving ${String(sha).slice(0, 7)}. Run: ${url}`)
  } catch {
    console.log(`Promoted. Run: ${url}`)
  }
}

const [command, arg] = process.argv.slice(2)
if (command === 'guard') guard()
else if (command === 'wait-smoke') await waitSmoke(arg || 'staging')
else if (command === 'release') await release()
else fail('usage: ship-helpers.mjs guard | wait-smoke <staging|production> | release')
