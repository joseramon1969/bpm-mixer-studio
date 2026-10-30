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

it('allows selecting a local file again after retiring unavailable saved entries', async () => {
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
  async saved => {
    localStorage.setItem('bpm-playlists', saved)
    render(<Studio />)
    expect(screen.getByRole('heading', { name: 'DECK A' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'DECK B' })).toBeInTheDocument()
    await waitFor(() => expect(localStorage.getItem('bpm-playlists')).toBeNull())
  },
)

it('removes saved songs without local audio and never trusts saved URLs', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(Response.json([[{
    name: 'Guardada', url: 'https://example.com/audio.mp3', bpm: 120, duration: 180,
  }], []]))
  render(<Studio />)
  await screen.findByText(/1 canción\(es\) eliminadas de la lista/)
  expect(screen.queryByRole('heading', { name: 'Guardada' })).not.toBeInTheDocument()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reproducir o pausar deck A' })) })
  expect(play).not.toHaveBeenCalled()
  await waitFor(() => expect(fetch).toHaveBeenCalledWith('/.netlify/functions/playlists', expect.objectContaining({
    method: 'PUT', body: '[[],[]]',
  })))
})

it('saves playlist metadata without uploading audio or object URLs', async () => {
  render(<Studio />)
  fireEvent.change(picker(), { target: { files: [file('Tema.mp3')] } })
  await screen.findByText('1 canción(es) listas.')
  await screen.findByText('Listas guardadas')
  const writes = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'PUT')
  expect(JSON.parse(writes.at(-1)![1]!.body as string)).toEqual([[{ name: 'Tema', bpm: 120, duration: 180 }], []])
})

it('removes an unsupported audio file but keeps songs when browser playback is blocked', async () => {
  render(<Studio />)
  fireEvent.change(picker(), { target: { files: [file('Tema.mp3')] } })
  await screen.findByText('1 canción(es) listas.')
  play.mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reproducir o pausar deck A' })) })
  expect(screen.getByRole('heading', { name: 'Tema' })).toBeInTheDocument()
  play.mockRejectedValueOnce(new DOMException('missing', 'NotSupportedError'))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reproducir o pausar deck A' })) })
  expect(screen.queryByRole('heading', { name: 'Tema' })).not.toBeInTheDocument()
  expect(screen.getByText(/el archivo no está disponible o no se puede reproducir/)).toBeInTheDocument()
})

it('reports a failed save and retries the latest playlist', async () => {
  vi.mocked(fetch).mockImplementation(async (_url, init) => {
    if (init?.method === 'PUT') return new Response(null, { status: 503 })
    return Response.json([[], []])
  })
  render(<Studio />)
  await screen.findByText('No se pudieron guardar las listas.')
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }))
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar guardado' }))
  await screen.findByText('Listas guardadas')
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

it('removes the loaded song on a media error after changing the selection', async () => {
  render(<Studio />)
  fireEvent.change(picker(), { target: { files: [file('Primera.mp3'), file('Segunda.mp3')] } })
  await screen.findByText('2 canción(es) listas.')
  fireEvent.click(screen.getByRole('button', { name: /Segunda/ }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reproducir o pausar deck A' })) })
  const audio = play.mock.instances[0] as unknown as HTMLAudioElement
  await act(async () => {
    Object.defineProperty(audio, 'error', { value: { code: 4 } })
    audio.onerror?.call(audio, new Event('error'))
  })
  expect(screen.queryByText('Segunda')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Primera' })).toBeInTheDocument()
})
