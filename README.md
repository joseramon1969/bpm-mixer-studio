# BPM Mixer Studio

Mezclador de DJ en español para el navegador, con dos decks, análisis local de BPM, forma de onda, ecualización de tres bandas, Kill, filtro, cues, loops, crossfader de potencia constante y fundido automático de ocho segundos. AUTO MIX permanece activo después del primer fundido y alterna entre A y B cuando quedan ocho segundos de reproducción. Prepara la siguiente canción local de la lista del deck saliente y vuelve al inicio de la lista al agotarla; las entradas sin archivo se omiten. Los loops aplazan el siguiente cambio. Para desactivarlo, pulsa DETENER AUTO MIX o mueve el crossfader. Incluye seis efectos sintetizados y sonidos personalizados por sesión.

Utiliza React, TypeScript, TanStack Start, Vite, Lucide y Web Audio API. No envía archivos a un servidor. Las listas guardan nombres y metadatos en localStorage; por privacidad, es necesario volver a seleccionar los archivos después de recargar. La detección de BPM es aproximada y la sincronización requiere ajuste auditivo según la canción. Los efectos personalizados duran durante la sesión actual.

## Desarrollo local

Instala las dependencias con `pnpm install` y ejecuta `netlify dev --port 8889`. Abre la dirección local indicada por el CLI. Se requiere un navegador moderno con Web Audio API. Agrega archivos MP3, WAV u OGG compatibles con tu navegador en cada deck.
