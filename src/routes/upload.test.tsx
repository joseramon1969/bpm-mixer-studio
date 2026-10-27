import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { detectTempo } from '../lib/tempo'
import { Studio } from './index'

vi.mock('../lib/tempo', () => ({ detectTempo: vi.fn() }))
const decode = vi.fn()
const play = vi.fn(async () => {})
const node = () => ({ connect: vi.fn(), gain: { value: 1 }, frequency: { value: 0 }, Q: { value: 1 }, getByteFrequencyData: vi.fn() })
const buffer = { duration: 180, getChannelData: () => new Float32Array(160) }
const file = (name: string) => ({ name, arrayBuffer: async () => new ArrayBuffer(8) })
const picker = () => screen.getAllByLabelText('Agregar música al deck A')[0]

beforeEach(() => {
  localStorage.clear()
  vi.mocked(detectTempo).mockReset().mockReturnValue(120)
  decode.mockReset().mockResolvedValue(buffer)
  vi.stubGlobal('AudioContext', class {
    destination = {}
    resume = async () => {}
    decodeAudioData = decode
    createMediaElementSource = node
    createGain = node
    createAnalyser = node
    createBiquadFilter = node
  })
  vi.stubGlobal('Audio', class {
    src = ''
    paused = true
    play = play
    pause = vi.fn()
    currentTime = 0
    playbackRate = 1
    removeAttribute = vi.fn(() => { this.src = '' })
    load = vi.fn()
  })
  vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => `blob:${(blob as File).name}`)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); play.mockClear() })

it('keeps an imported song playable if BPM analysis fails', async () => {
  vi.mocked(detectTempo).mockImplementation(() => { throw new Error('analysis failed') })
  render(<Studio />)
  fireEvent.change(picker(), { target: { files: [file('Canción.mp3')] } })
  await screen.findByText(/sin BPM detectado; puedes reproducirlas/)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reproducir o pausar deck A' })) })
  expect(play).toHaveBeenCalledOnce()
  expect(screen.getAllByText('Canción').length).toBeGreaterThan(0)
})

it('shows completed songs while another file is still decoding and reports partial failures', async () => {
  let rejectNext!: (error: Error) => void
  decode.mockResolvedValueOnce(buffer).mockImplementationOnce(() => new Promise((_, reject) => { rejectNext = reject }))
  render(<Studio />)
  fireEvent.change(picker(), { target: { files: [file('Primera.mp3'), file('Dañada.mp3')] } })
  await waitFor(() => expect(decode).toHaveBeenCalledTimes(2))
  expect(screen.getAllByText('Primera').length).toBeGreaterThan(0)
  await act(async () => { rejectNext(new Error('unsupported')) })
  await screen.findByText(/1 canción\(es\) listas.*No se pudo leer: Dañada.mp3/)
})

it('restores a file in its original playlist position and allows selecting it again', async () => {
  localStorage.setItem('bpm-playlists', JSON.stringify([[{ name: 'Primera', duration: 180 }, { name: 'Segunda', duration: 180 }], []]))
  render(<Studio />)
  const input = picker() as HTMLInputElement
  fireEvent.change(input, { target: { files: [file('Primera.mp3')] } })
  await screen.findByText('1 canción(es) listas.')
  expect(input.value).toBe('')
  expect(screen.getByRole('heading', { name: 'Primera' })).toBeInTheDocument()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reproducir o pausar deck A' })) })
  expect(play).toHaveBeenCalledOnce()
  fireEvent.change(input, { target: { files: [file('Primera.mp3')] } })
  await waitFor(() => expect(decode).toHaveBeenCalledTimes(2))
})


it.each(['null', '{}', '[[]]', '[[null], []]', 'invalid json'])(
  'ignores malformed saved playlists: %s',
  saved => {
    localStorage.setItem('bpm-playlists', saved)
    render(<Studio />)
    expect(screen.getByRole('heading', { name: 'DECK A' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'DECK B' })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('bpm-playlists')!)).toEqual([[], []])
  },
)

it('restores only valid local metadata and requires selecting the audio again', async () => {
  localStorage.setItem('bpm-playlists', JSON.stringify([[{
    name: 'Guardada', url: 'https://example.com/audio.mp3', bpm: -120, duration: 'invalid',
  }], []]))
  render(<Studio />)
  expect(screen.getByRole('heading', { name: 'Guardada' })).toBeInTheDocument()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reproducir o pausar deck A' })) })
  expect(play).not.toHaveBeenCalled()
  expect(JSON.parse(localStorage.getItem('bpm-playlists')!)).toEqual([[{ name: 'Guardada' }], []])
})

it('resets cues, loops and tempo when removing the selected song', async () => {
  render(<Studio />)
  fireEvent.change(picker(), { target: { files: [file('Primera.mp3'), file('Segunda.mp3')] } })
  await screen.findByText('2 canción(es) listas.')
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reproducir o pausar deck A' })) })
  const deck = screen.getByRole('heading', { name: 'DECK A' }).closest('section')!
  const buttons = Array.from(deck.querySelectorAll('button'))
  const cue = buttons.find(b => b.textContent === '1')!
  const loop = buttons.find(b => b.textContent === '4')!
  fireEvent.click(cue)
  fireEvent.click(loop)
  fireEvent.change(screen.getByRole('slider', { name: 'Tempo deck A' }), { target: { value: '1.2' } })
  expect(cue).toHaveClass('saved')
  expect(loop).toHaveClass('saved')
  fireEvent.click(screen.getAllByTitle('Quitar canción')[0])
  expect(cue).not.toHaveClass('saved')
  expect(loop).not.toHaveClass('saved')
  expect(screen.getByRole('slider', { name: 'Tempo deck A' })).toHaveValue('1')
  expect(screen.getByRole('heading', { name: 'Segunda' })).toBeInTheDocument()
})

it('stops the previous audio when replacing the loaded file', async () => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValueOnce('blob:original').mockReturnValueOnce('blob:replacement')
  render(<Studio />)
  fireEvent.change(picker(), { target: { files: [file('Tema.mp3')] } })
  await screen.findByText('1 canción(es) listas.')
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reproducir o pausar deck A' })) })
  const audio = play.mock.instances[0] as unknown as HTMLAudioElement
  expect(audio.src).toBe('blob:original')
  fireEvent.change(picker(), { target: { files: [file('Tema.mp3')] } })
  await waitFor(() => expect(audio.pause).toHaveBeenCalled())
  expect(audio.src).toBe('')
  await screen.findByText('1 canción(es) listas.')
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reproducir o pausar deck A' })) })
  expect(audio.src).toBe('blob:replacement')
})
