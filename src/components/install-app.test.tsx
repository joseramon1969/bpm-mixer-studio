import { act, fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { InstallApp } from './install-app'

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('shows Spanish installation guidance when the browser offers no native prompt', async () => {
  render(<InstallApp />)
  fireEvent.click(screen.getByRole('button', { name: 'Instalar app' }))
  expect(await screen.findByRole('dialog')).toHaveTextContent('Tu cabina en el escritorio')
  expect(screen.getByRole('dialog')).toHaveTextContent('Necesitas internet')
  fireEvent.click(screen.getByRole('button', { name: 'Entendido' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

it('uses the browser prompt and allows another attempt after dismissal', async () => {
  render(<InstallApp />)
  const prompt = vi.fn().mockResolvedValue(undefined)
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt, userChoice: Promise.resolve({ outcome: 'dismissed' }),
  })
  act(() => { window.dispatchEvent(event) })
  expect(event.defaultPrevented).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Instalar app' }))
  await waitFor(() => expect(prompt).toHaveBeenCalledOnce())
  await waitFor(() => expect(screen.getByRole('button', { name: 'Instalar app' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Instalar app' }))
  expect(await screen.findByRole('dialog')).toBeInTheDocument()
})

it('hides the installation control after the browser confirms installation', () => {
  render(<InstallApp />)
  act(() => { window.dispatchEvent(new Event('appinstalled')) })
  expect(screen.queryByRole('button', { name: 'Instalar app' })).not.toBeInTheDocument()
})
