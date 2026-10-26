import { describe, expect, it } from 'vitest'
import { detectTempo } from './tempo'

function rhythm(
  bpm: number,
  options: {
    sampleRate?: number
    seconds?: number
    intro?: number
    rightOnly?: boolean
    offbeats?: boolean
  } = {},
) {
  const sampleRate = options.sampleRate ?? 8000
  const length = Math.round(sampleRate * (options.seconds ?? 24))
  const pulse = new Float32Array(length)
  const interval = 60 / bpm
  for (
    let time = options.intro ?? 0.25, beat = 0;
    time < length / sampleRate;
    time += interval, beat++
  ) {
    const start = Math.round(time * sampleRate)
    for (let n = 0; n < sampleRate * 0.045 && start + n < length; n++) {
      pulse[start + n] +=
        Math.sin((2 * Math.PI * 80 * n) / sampleRate) *
        Math.exp(-n / (sampleRate * 0.01)) *
        (beat % 4 === 0 ? 1 : 0.8)
    }
    if (options.offbeats) {
      const offbeat = Math.round((time + interval / 2) * sampleRate)
      for (let n = 0; n < sampleRate * 0.01 && offbeat + n < length; n++) {
        pulse[offbeat + n] +=
          0.15 * Math.sin(n * 2.3) * Math.exp(-n / (sampleRate * 0.002))
      }
    }
  }
  const silent = new Float32Array(length)
  return {
    sampleRate,
    length,
    numberOfChannels: 2,
    getChannelData: (i: number) =>
      options.rightOnly && i === 0 ? silent : pulse,
  }
}

describe('automatic local tempo', () => {
  it.each([65, 90, 100, 123.4, 128, 155, 180, 195])(
    'detects %s BPM without integer-lag rounding or half-speed errors',
    (bpm) => {
      expect(detectTempo(rhythm(bpm))).toBeCloseTo(bpm, 0)
    },
  )
  it('finds rhythm after a long silent introduction', () => {
    expect(detectTempo(rhythm(128, { seconds: 120, intro: 92 }))).toBeCloseTo(
      128,
      0,
    )
  })
  it('uses the right channel when the left is silent', () => {
    expect(detectTempo(rhythm(110, { rightOnly: true }))).toBeCloseTo(110, 0)
  })
  it('does not double the kick tempo for quieter offbeat percussion', () => {
    expect(detectTempo(rhythm(92, { offbeats: true }))).toBeCloseTo(92, 0)
  })
  it('rejects irregular noise instead of assigning a confident tempo', () => {
    const audio = rhythm(120)
    let seed = 123
    const noise = Float32Array.from({ length: audio.length }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0
      return seed / 2147483648
    })
    audio.getChannelData = () => noise
    expect(detectTempo(audio)).toBeUndefined()
  })
  it('handles actual audio sample rates', () => {
    expect(detectTempo(rhythm(127.5, { sampleRate: 44100 }))).toBeCloseTo(
      127.5,
      0,
    )
  })
  it('does not invent a tempo for silence, a constant tone, or very short audio', () => {
    const silent = rhythm(120)
    silent.getChannelData = () => new Float32Array(silent.length)
    expect(detectTempo(silent)).toBeUndefined()
    expect(detectTempo(rhythm(120, { seconds: 2 }))).toBeUndefined()
    const tone = Float32Array.from(
      { length: silent.length },
      (_, i) => Math.sin((2 * Math.PI * 200 * i) / silent.sampleRate) * 0.5,
    )
    silent.getChannelData = () => tone
    expect(detectTempo(silent)).toBeUndefined()
  })
})
