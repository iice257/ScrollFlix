// 16-bit stereo WAV from rendered audio, so a sequence rendered offline can be
// saved and opened in any editor.

export const encodeWav = (
  channels: Float32Array[],
  sampleRate: number,
): ArrayBuffer => {
  const frames = channels[0]?.length ?? 0
  const count = channels.length
  const bytes = frames * count * 2
  const out = new ArrayBuffer(44 + bytes)
  const view = new DataView(out)
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i))
    }
  }
  text(0, 'RIFF')
  view.setUint32(4, 36 + bytes, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, count, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * count * 2, true)
  view.setUint16(32, count * 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, bytes, true)
  let offset = 44
  for (let i = 0; i < frames; i += 1) {
    for (let c = 0; c < count; c += 1) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]))
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true,
      )
      offset += 2
    }
  }
  return out
}
