import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Studio } from './index'

const filters: ReturnType<typeof node>[] = []
const node = () => ({
  connect: vi.fn(), frequency: { value: 0 }, Q: { value: 1 },
  gain: { value: 0, cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() },
  getByteFrequencyData: vi.fn(),
})
beforeEach(() => {
  filters.length = 0
  localStorage.clear()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  vi.stubGlobal('Audio', class {
    src = ''; paused = true; currentTime = 0
    play = vi.fn(async () => { this.paused = false })
    pause = vi.fn(() => { this.paused = true })
  })
  vi.stubGlobal('AudioContext', class {
    destination = {}; currentTime = 0
    resume = vi.fn(async () => {})
    createMediaElementSource = node
    createGain = node
    createAnalyser = node
    createBiquadFilter = () => { const filter = node(); filters.push(filter); return filter }
  })
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear() })

it('applies presets independently, supports KILL restore, and resets all six bands', () => {
  render(<Studio />)
  const a = within(screen.getByRole('group', { name: 'Presets de ecualización del deck A' }))
  const sliders = screen.getAllByRole('slider').filter(s => s.getAttribute('aria-orientation') === 'vertical')
  expect(sliders).toHaveLength(12)
  fireEvent.click(a.getByRole('button', { name: 'Graves' }))
  expect(sliders.slice(0, 6).map(s => (s as HTMLInputElement).value)).toEqual(['6', '4', '-2', '-1', '0', '0'])
  expect(sliders.slice(6).map(s => (s as HTMLInputElement).value)).toEqual(['0', '0', '0', '0', '0', '0'])
  const kill = screen.getByRole('button', { name: 'Atenuar Subgraves del deck A' })
  fireEvent.click(kill)
  expect(sliders[0]).toHaveValue('-40')
  fireEvent.click(kill)
  expect(sliders[0]).toHaveValue('6')
  fireEvent.click(a.getByRole('button', { name: 'Plano' }))
  expect(sliders.slice(0, 6).map(s => (s as HTMLInputElement).value)).toEqual(['0', '0', '0', '0', '0', '0'])
})

it('initializes and connects six audio filters with preselected gains and updates live audio', async () => {
  localStorage.setItem('bpm-playlists', JSON.stringify([[{ name: 'Prueba', url: 'blob:prueba' }], []]))
  render(<Studio />)
  const a = within(screen.getByRole('group', { name: 'Presets de ecualización del deck A' }))
  fireEvent.click(a.getByRole('button', { name: 'Voz' }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reproducir o pausar deck A' })) })
  expect(filters.slice(0, 6).map(f => f.frequency.value)).toEqual([60, 250, 1000, 2500, 6000, 12000])
  expect(filters.slice(0, 6).map(f => f.gain.value)).toEqual([-4, -2, 3, 4, 1, -2])
  filters.slice(0, 6).forEach((filter, j) => expect(filter.connect).toHaveBeenCalledWith(filters[j + 1]))
  fireEvent.change(screen.getByRole('slider', { name: 'Aire, 12000 Hz, deck A' }), { target: { value: '7' } })
  expect(filters[5].gain.setTargetAtTime).toHaveBeenLastCalledWith(7, 0, .02)
  expect(a.getByRole('button', { name: 'Voz' })).toHaveAttribute('aria-pressed', 'false')
  fireEvent.click(a.getByRole('button', { name: 'Plano' }))
  filters.slice(0, 6).forEach(filter => expect(filter.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, .02))
})
