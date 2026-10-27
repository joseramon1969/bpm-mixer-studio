import { HeadContent, Scripts, createRootRoute, redirect } from '@tanstack/react-router'

import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { NotFoundPage } from '@/components/error-pages'

import '../styles.css'

const siteName = 'BPM Mixer Studio'
const siteTitle = 'BPM Mixer Studio | Consola DJ Online'
const siteUrl = 'https://bpm-mixer-studio.netlify.app/'
const siteDescription = 'Mezcla música como un DJ profesional con BPM Mixer Studio. Disfruta de dos decks, sincronización BPM, ecualizador, efectos de sonido, biblioteca musical y automix.'
const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: siteName,
  url: siteUrl,
  description: 'Consola DJ online para mezclar música con decks, sincronización BPM, ecualizador y efectos de sonido.',
  applicationCategory: 'MultimediaApplication',
  operatingSystem: 'Any',
  browserRequirements: 'Requires JavaScript and a modern web browser',
  inLanguage: 'es',
}

export const Route = createRootRoute({
  beforeLoad: ({ location }) => {
    const url = new URL(location.href, siteUrl)
    if (url.searchParams.has('utm_source')) {
      url.searchParams.delete('utm_source')
      throw redirect({
        href: `${url.pathname}${url.search}${url.hash}`,
        replace: true,
      })
    }
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { title: siteTitle },
      { name: 'description', content: siteDescription },
      { name: 'robots', content: 'index, follow' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: '#111318' },
      { name: 'language', content: 'Spanish' },
      { name: 'application-name', content: siteName },
      { property: 'og:type', content: 'website' },
      { property: 'og:locale', content: 'es_ES' },
      { property: 'og:site_name', content: siteName },
      { property: 'og:title', content: 'BPM Mixer Studio | Mezclador DJ Online' },
      { property: 'og:description', content: 'Tu estudio DJ en línea: mezcla canciones, sincroniza BPM, utiliza efectos y disfruta del automix.' },
      { property: 'og:url', content: siteUrl },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: siteTitle },
      { name: 'twitter:description', content: 'Mezcla canciones, sincroniza BPM y utiliza herramientas DJ desde tu navegador.' },
    ],
    links: [{ rel: 'canonical', href: siteUrl }],
    scripts: [
      { type: 'application/ld+json', children: JSON.stringify(structuredData) },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFoundPage,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <HeadContent />
      </head>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
        <Scripts />
      </body>
    </html>
  )
}
