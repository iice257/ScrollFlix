import { type BrowserContext, type Page, expect, test } from '@playwright/test'
import { handleParty, memoryStore } from '../api/_lib/party-room'

// Pass the globe over chat: a room made on one phone, joined from another, and
// played live. The /api/party function is the real handler on an in-memory
// store, shared by both phones, so this covers the server's rules too.

const serve = async (context: BrowserContext, store = memoryStore()) => {
  await context.route('**/api/party**', async (route) => {
    const request = route.request()
    const reply = await handleParty(
      new Request(request.url(), {
        method: request.method(),
        body: request.method() === 'POST' ? request.postData() : undefined,
      }),
      store,
    )
    await route.fulfill({
      status: reply.status,
      contentType: 'application/json',
      body: await reply.text(),
    })
  })
}

const open = async (page: Page, path = '/') => {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('wtw:spin-hint-seen', '1')
      window.localStorage.setItem('wtw:theme', 'dark')
    } catch {}
  })
  await page.goto(path)
  await page
    .getByRole('button', { name: 'Skip first time load' })
    .click({ timeout: 3_000 })
    .catch(() => {})
  await expect(page.locator('[data-gallery-ready="true"]')).toBeAttached()
}

const createRoom = async (page: Page) => {
  await page
    .getByRole('button', { name: /Pass the globe, a game for friends/ })
    .click()
  await page.getByLabel('Player 1 name').fill('Ada')
  await page.getByLabel('Player 2 name').fill('Bo')
  await page.getByRole('button', { name: 'Over chat' }).click()
  await page.getByRole('button', { name: 'Create a room' }).click()
}

test.describe('Pass the globe: setup', () => {
  test('is one tap from the top bar, and a player can choose a poster', async ({
    page,
  }) => {
    await open(page)
    await page
      .getByRole('button', { name: /Pass the globe, a game for friends/ })
      .click()
    const setup = page.getByRole('region', { name: 'Pass the globe' })
    await expect(setup).toBeVisible()
    await setup
      .getByRole('button', { name: /Choose a picture for player 1/ })
      .click()
    const offer = page.locator('.ps-offer button')
    await expect(offer).toHaveCount(12)
    const chosen = await offer.nth(3).getAttribute('aria-label')
    await offer.nth(3).click()
    // Back on the setup, the face now wears a poster.
    await expect(
      setup.locator('.ps-players li').first().locator('.party-dot img'),
    ).toBeVisible()
    // The second player is offered other films.
    await setup
      .getByRole('button', { name: /Choose a picture for player 2/ })
      .click()
    await expect(
      page.locator('.ps-offer button').filter({ hasText: chosen ?? '' }),
    ).toHaveCount(0)
  })

  test('falls back to passing links where rooms are not available', async ({
    page,
    context,
  }) => {
    await context.route('**/api/party**', (route) =>
      route.fulfill({ status: 503, json: { error: 'unavailable' } }),
    )
    await open(page)
    await createRoom(page)
    await expect(page.getByLabel('Pass the globe').first()).toBeVisible()
    await expect(page.getByText('Room code')).toHaveCount(0)
    await expect(page.locator('.party-hud')).toBeVisible()
  })
})

test.describe('Pass the globe: a live room', () => {
  test('a friend joins with the link and both phones follow the game @heavy', async ({
    page,
    browser,
    context,
  }) => {
    test.setTimeout(240_000)
    const store = memoryStore()
    await serve(context, store)
    await open(page)
    await createRoom(page)

    const lobby = page.getByRole('region', { name: 'Room lobby' })
    const code = (await lobby.locator('.pr-code').textContent())?.trim() ?? ''
    expect(code).toMatch(/^[A-Z0-9]{4}$/)
    await expect(
      lobby.getByRole('button', { name: /Waiting for a friend/ }),
    ).toBeDisabled()

    // The second phone, in its own browser session.
    const friend = await browser.newContext({ ...test.info().project.use })
    await serve(friend, store)
    const guest = await friend.newPage()
    await open(guest, `/?room=${code}`)
    await expect(
      guest.getByRole('heading', { name: 'Who are you?' }),
    ).toBeVisible()
    await guest.getByRole('button', { name: /Bo/ }).click()
    await expect(guest.getByText('Waiting for Ada to start')).toBeVisible()

    // The host sees the friend arrive and starts the game.
    const start = lobby.getByRole('button', { name: /Start with 2 players/ })
    await expect(start).toBeEnabled({ timeout: 15_000 })
    await start.click()
    await expect(page.locator('.party-hud')).toContainText('Ada', {
      timeout: 15_000,
    })

    // The friend's phone shows whose turn it is, once the films are loaded.
    await expect(
      guest.getByRole('region', { name: 'Waiting for a move' }),
    ).toContainText('Ada is up', { timeout: 120_000 })
    await friend.close()
  })

  test('a code that does not exist says so', async ({ page, context }) => {
    await serve(context)
    await open(page, '/?room=ZZZZ')
    await expect(page.getByRole('alert')).toContainText('no room')
  })
})
