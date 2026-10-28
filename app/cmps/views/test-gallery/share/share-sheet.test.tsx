import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ShareSheet from './share-sheet'

const warmFilmCard = vi.hoisted(() => vi.fn())

vi.mock('./share-output', () => ({
  clipExtension: () => 'webm',
  clipSupported: () => false,
  copyText: vi.fn(async () => true),
  deliverShare: vi.fn(),
  downloadBlob: vi.fn(),
  preparePathArt: vi.fn(() => new Promise(() => {})),
  prepareRecapArt: vi.fn(() => new Promise(() => {})),
  prepareShareArt: vi.fn(() => new Promise(() => {})),
  recordShareClip: vi.fn(),
  renderShareImage: vi.fn(),
  shareFileName: () => 'file.png',
  warmFilmCard,
}))

vi.mock('../../../ui/use-overlay-scrollbar', () => ({
  useOverlayScrollbar: () => ({ current: null }),
}))

const input = {
  title: 'Heat',
  posterUrl: 'https://img.test/heat.jpg',
} as never

beforeEach(() => warmFilmCard.mockClear())

describe('ShareSheet', () => {
  it('leads with Copy link as the primary action', () => {
    render(
      <ShareSheet
        input={input}
        movieId='c603'
        link='https://x.test/?film=603'
        onClose={() => {}}
      />,
    )
    const copy = screen.getByRole('button', { name: /copy link/i })
    expect(copy.className).toContain('warp-share-primary')
    const shareImage = screen.getByRole('button', { name: /share image/i })
    for (const button of [
      shareImage,
      screen.getByRole('button', { name: /^save$/i }),
    ]) {
      expect(button.className).toContain('warp-share-secondary')
      expect(button.className).not.toContain('warp-share-primary')
    }
    expect(
      copy.compareDocumentPosition(shareImage) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('warms the film card once when the sheet opens', () => {
    const sheet = (
      <ShareSheet
        input={input}
        movieId='c603'
        link='https://x.test/?film=603'
        onClose={() => {}}
      />
    )
    const { rerender } = render(sheet)
    rerender(sheet)
    expect(warmFilmCard).toHaveBeenCalledTimes(1)
    expect(warmFilmCard).toHaveBeenCalledWith('c603')
  })

  it('does not warm a film card for a path share', () => {
    render(
      <ShareSheet
        path={{ stops: [] } as never}
        link='https://x.test'
        onClose={() => {}}
      />,
    )
    expect(warmFilmCard).not.toHaveBeenCalled()
  })
})
