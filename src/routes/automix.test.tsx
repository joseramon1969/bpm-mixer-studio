import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Studio } from './index'
import { detectTempo } from '../lib/tempo'

vi.mock('../lib/tempo', () => ({ detectTempo: vi.fn() }))
const decode = vi.fn()

const audios: FakeAudio[] = []
class FakeAudio {
  src = ''
  paused = true
  ended = false
  duration = 180
  currentTime = 0
  playbackRate = 1
  preservesPitch = false
  removeAttribute = vi.fn(() => { this.src = '' })
  load = vi.fn()
  play = vi.fn(async () => { this.paused = false })
  pause = vi.fn(() => { this.paused = true })
  constructor() { audios.push(this) }
}
const node = () => ({ connect: vi.fn(), gain: { value: 1 }, frequency: { value: 0 }, Q: { value: 1 }, getByteFrequencyData: vi.fn() })
beforeEach(() => {
  vi.useFakeTimers()
  audios.length = 0
  decode.mockReset()
  vi.mocked(detectTempo).mockReset()
  vi.stubGlobal('Audio', FakeAudio)
  vi.stubGlobal('AudioContext', class {
    decodeAudioData = decode
    destination = {}
    resume = vi.fn(async () => {})
    createMediaElementSource = node
    createGain = node
    createAnalyser = node
    createBiquadFilter = node
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  localStorage.setItem('bpm-playlists', JSON.stringify([
    [{ name: 'Tema A', url: 'blob:a', bpm: 120, duration: 180 }],
    [{ name: 'Tema B', url: 'blob:b', bpm: 125, duration: 180 }],
  ]))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear() })
// Re-select local files just as a returning user must; saved lists contain metadata only.
const renderLoadedStudio = async () => {
  const lists = JSON.parse(localStorage.getItem('bpm-playlists')!) as { name: string; url?: string; bpm?: number }[][]
  const urls = new Map(lists.flat().map(track => [`${track.name}.mp3`, track.url]))
  vi.spyOn(URL, 'createObjectURL').mockImplementation(file => urls.get((file as File).name)!)
  render(<Studio />)
  for (const [i, list] of lists.entries()) {
    for (const track of list.filter(track => track.url)) {
      decode.mockResolvedValueOnce({ duration: 180, getChannelData: () => new Float32Array(160) })
      vi.mocked(detectTempo).mockReturnValueOnce(track.bpm)
      await act(async () => {
        fireEvent.change(screen.getAllByLabelText(`Agregar música al deck ${i === 0 ? 'A' : 'B'}`)[0], {
          target: { files: [{ name: `${track.name}.mp3`, arrayBuffer: async () => new ArrayBuffer(8) }] },
        })
      })
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    }
  }
}
const start = async () => {
  if(screen.getByRole('button', { name: /AUTO MIX/ }).getAttribute('aria-pressed')==='true') {
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /AUTO MIX/ })) })
  }
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /AUTO MIX/ })) })
}
const advance = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms) }) }

it('starts both decks and fades from A to B over eight seconds, then pauses A', async () => {
  await renderLoadedStudio()
  await start()
  expect(audios.map(a => a.paused)).toEqual([false, false])
  expect(audios.map(a => a.playbackRate)).toEqual([1, 1])
  await advance(4000)
  expect(screen.getByRole('slider', { name: 'Crossfader' })).toHaveValue('50')
  await advance(4000)
  expect(screen.getByRole('slider', { name: 'Crossfader' })).toHaveValue('100')
  expect(audios.map(a => a.paused)).toEqual([true, false])
  expect(screen.getByText(/Mezcla completada/)).toBeInTheDocument()
})
it('preserves manual tempo changes before and during automatic transitions', async () => {
  await renderLoadedStudio()
  const tempo = screen.getByRole('slider', { name: 'Tempo deck B' })
  expect(tempo).toHaveValue('1')
  fireEvent.change(tempo, { target: { value: '1.1' } })
  await start()
  expect(audios[1].playbackRate).toBeCloseTo(1.1)
  await advance(4000)
  fireEvent.change(tempo, { target: { value: '0.9' } })
  await advance(4000)
  expect(audios[1].playbackRate).toBeCloseTo(0.9)
  expect(tempo).toHaveValue('0.9')
})

it('fades away from the deck actually playing even when the crossfader is centered', async () => {
  await renderLoadedStudio()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reproducir o pausar deck B' })) })
  await start()
  await advance(8000)
  expect(screen.getByRole('slider', { name: 'Crossfader' })).toHaveValue('0')
  expect(audios.find(a => a.src === 'blob:b')?.paused).toBe(true)
  expect(audios.find(a => a.src === 'blob:a')?.paused).toBe(false)
})
it('allows the crossfader to take manual control and cancel the timer', async () => {
  await renderLoadedStudio()
  await start()
  await advance(2000)
  fireEvent.change(screen.getByRole('slider', { name: 'Crossfader' }), { target: { value: '30' } })
  await advance(10000)
  expect(screen.getByRole('slider', { name: 'Crossfader' })).toHaveValue('30')
  expect(screen.getByRole('button', { name: /AUTO MIX/ })).toHaveAttribute('aria-pressed', 'false')
})
it('does not run the fade if incoming playback fails', async () => {
  await renderLoadedStudio()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reproducir o pausar deck B' })) })
  audios[0].play.mockRejectedValueOnce(new Error('Playback blocked'))
  await start()
  await advance(10000)
  expect(screen.getByText(/No se pudo iniciar la mezcla/)).toBeInTheDocument()
  expect(screen.getByRole('slider', { name: 'Crossfader' })).toHaveValue('100')
  expect(screen.getByRole('button', { name: /AUTO MIX/ })).toHaveAttribute('aria-pressed', 'false')
})
it('waits for playback to start before timing the transition', async () => {
  await renderLoadedStudio()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reproducir o pausar deck B' })) })
  let ready!: () => void
  audios[0].play.mockImplementationOnce(() => new Promise<void>(resolve => { ready = resolve }))
  await start()
  await advance(3000)
  expect(screen.getByRole('slider', { name: 'Crossfader' })).toHaveValue('100')
  await act(async () => { ready() })
  await advance(4000)
  expect(screen.getByRole('slider', { name: 'Crossfader' })).toHaveValue('50')
  await advance(4000)
  expect(screen.getByRole('slider', { name: 'Crossfader' })).toHaveValue('0')
})

it('keeps Auto Mix enabled and alternates B to A and back without another click', async () => {
  await renderLoadedStudio()
  await start()
  await advance(8000)
  expect(screen.getByRole('button', { name: /DETENER AUTO MIX/ })).toHaveAttribute('aria-pressed', 'true')
  expect(audios[0].currentTime).toBe(0)
  audios[1].currentTime = 173
  await advance(60)
  await advance(8000)
  expect(screen.getByRole('slider', { name: 'Crossfader' })).toHaveValue('0')
  expect(audios.map(a => a.paused)).toEqual([false, true])
  expect(audios[1].currentTime).toBe(0)
  audios[0].currentTime = 173
  await advance(60)
  await advance(8000)
  expect(screen.getByRole('slider', { name: 'Crossfader' })).toHaveValue('100')
  expect(audios.map(a => a.paused)).toEqual([true, false])
})
it('prepares the next local playlist track on the outgoing deck', async () => {
  localStorage.setItem('bpm-playlists', JSON.stringify([
    [{ name: 'Tema A', url: 'blob:a', bpm: 120, duration: 180 },
     { name: 'Sin archivo', bpm: 120, duration: 180 },
     { name: 'Siguiente A', url: 'blob:a2', bpm: 130, duration: 180 }],
    [{ name: 'Tema B', url: 'blob:b', bpm: 125, duration: 180 }],
  ]))
  await renderLoadedStudio()
  await start()
  await advance(8000)
  expect(audios[0].src).toBe('blob:a2')
  expect(audios[0].paused).toBe(true)
  audios[1].currentTime = 173
  await advance(60)
  await advance(8000)
  expect(audios[0].src).toBe('blob:a2')
  expect(audios[0].paused).toBe(false)
})
it('stops automatic future changes when disabled after a completed fade', async () => {
  await renderLoadedStudio()
  await start()
  await advance(8000)
  fireEvent.click(screen.getByRole('button', { name: /DETENER AUTO MIX/ }))
  audios[1].currentTime = 175
  await advance(10000)
  expect(screen.getByRole('slider', { name: 'Crossfader' })).toHaveValue('100')
  expect(audios.map(a => a.paused)).toEqual([true, false])
  expect(screen.getByRole('button', { name: /AUTO MIX/ })).toHaveAttribute('aria-pressed', 'false')
})

for (const first of ['A', 'B']) {
  it(`automatically fades from ${first} after normal Play, and returns to it`, async () => {
    await renderLoadedStudio()
    expect(screen.getByRole('button', { name: /DETENER AUTO MIX/ })).toHaveAttribute('aria-pressed', 'true')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: `Reproducir o pausar deck ${first}` })) })
    audios[0].currentTime = 173
    await advance(60)
    await advance(8000)
    expect(screen.getByRole('slider', { name: 'Crossfader' })).toHaveValue(first === 'A' ? '100' : '0')
    expect(audios.map(a => a.paused)).toEqual([true, false])
    audios[1].currentTime = 173
    await advance(60)
    await advance(8000)
    expect(screen.getByRole('slider', { name: 'Crossfader' })).toHaveValue(first === 'A' ? '0' : '100')
    expect(audios.map(a => a.paused)).toEqual([false, true])
  })
  it(`starts the other deck when ${first} ends before a timer check`, async () => {
    await renderLoadedStudio()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: `Reproducir o pausar deck ${first}` })) })
    const source=audios[0]
    source.currentTime=180
    source.ended=true
    source.paused=true
    const plays=source.play.mock.calls.length
    await act(async () => { (source as unknown as HTMLAudioElement).onended?.(new Event('ended')) })
    await advance(80)
    expect(source.play).toHaveBeenCalledTimes(plays)
    expect(audios[1].paused).toBe(false)
    expect(screen.getByRole('slider', { name: 'Crossfader' })).toHaveValue(first === 'A' ? '100' : '0')
  })
}

it('keeps automatic handoff armed when a song is selected from either playlist', async () => {
  await renderLoadedStudio()
  fireEvent.click(screen.getByRole('button', { name: /Tema A/ }))
  fireEvent.click(screen.getByRole('button', { name: /Tema B/ }))
  expect(screen.getByRole('button', { name: /DETENER AUTO MIX/ })).toHaveAttribute('aria-pressed', 'true')
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reproducir o pausar deck A' })) })
  audios[0].currentTime=173
  await act(async () => { (audios[0] as unknown as HTMLAudioElement).ontimeupdate?.(new Event('timeupdate')) })
  await advance(8000)
  expect(audios.map(a => a.paused)).toEqual([true, false])
})
it('respects disabling Auto Mix when starting normal playback', async () => {
  await renderLoadedStudio()
  fireEvent.click(screen.getByRole('button', { name: /DETENER AUTO MIX/ }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reproducir o pausar deck A' })) })
  audios[0].currentTime=175
  await advance(10000)
  expect(audios).toHaveLength(1)
  expect(screen.getByRole('button', { name: /AUTO MIX/ })).toHaveAttribute('aria-pressed', 'false')
})
