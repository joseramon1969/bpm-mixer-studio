import { useEffect, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './ui/dialog'

type InstallPrompt = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallApp() {
  const prompt = useRef<InstallPrompt | null>(null)
  const [installed, setInstalled] = useState(false)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const display = window.matchMedia?.('(display-mode: standalone)')
    const update = () => setInstalled(display?.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone)
    const ready = (event: Event) => {
      event.preventDefault()
      prompt.current = event as InstallPrompt
    }
    const done = () => { prompt.current = null; setInstalled(true); setOpen(false) }
    update()
    display?.addEventListener('change', update)
    window.addEventListener('beforeinstallprompt', ready)
    window.addEventListener('appinstalled', done)
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        // The manual installation instructions remain available.
      })
    }
    return () => {
      display?.removeEventListener('change', update)
      window.removeEventListener('beforeinstallprompt', ready)
      window.removeEventListener('appinstalled', done)
    }
  }, [])

  async function install() {
    if (!prompt.current) { setOpen(true); return }
    const pending = prompt.current
    prompt.current = null
    setBusy(true)
    try {
      await pending.prompt()
      const choice = await pending.userChoice
      if (choice.outcome === 'accepted') setInstalled(true)
    } catch { setOpen(true) }
    finally { setBusy(false) }
  }

  if (installed) return null
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>
      <button className="help install-app" disabled={busy} onClick={event => { event.preventDefault(); void install() }}>
        <Download size={16} aria-hidden="true" />{busy ? 'Instalando…' : 'Instalar app'}
      </button>
    </DialogTrigger>
    <DialogContent className="install-dialog" showCloseButton={false}>
      <DialogTitle>Tu cabina en el escritorio</DialogTitle>
      <DialogDescription>Instala BPM Mixer Studio para abrirlo desde su propio icono y ventana.</DialogDescription>
      <ul>
        <li><strong>Chrome o Edge:</strong> abre el menú del navegador y busca «Instalar BPM Mixer Studio» o «Instalar esta página como aplicación».</li>
        <li><strong>Safari en Mac:</strong> elige Archivo → Añadir al Dock.</li>
        <li><strong>iPhone o iPad:</strong> en Safari, pulsa Compartir → Añadir a pantalla de inicio.</li>
        <li><strong>Android:</strong> abre el menú de Chrome → Instalar aplicación o Añadir a pantalla de inicio.</li>
      </ul>
      <p>Si la opción no aparece, usa una versión reciente de Chrome o Edge. Necesitas internet para abrir la app. Los archivos de audio siguen en tu dispositivo y debes volver a agregarlos al iniciar otra sesión.</p>
      <DialogClose className="help">Entendido</DialogClose>
    </DialogContent>
  </Dialog>
}
