# Arquitectura

Aplicación TanStack Start con React y TypeScript. `src/routes/index.tsx` contiene la consola y el motor de audio; `src/routes/__root.tsx` define metadatos y documento en español; `src/styles.css` contiene el diseño adaptable. Componentes base adicionales están en `src/components/ui`.

El audio usa un AudioContext compartido y un elemento HTMLAudioElement por deck. Cada canal pasa por tres filtros de EQ, un filtro de paso, ganancia y analizador. El crossfader emplea una curva de potencia constante. Los efectos se sintetizan localmente; los archivos personalizados usan URLs de objetos locales.

Mantener todo el audio en el cliente: no subir archivos de audio. Netlify Database conserva únicamente nombres, BPM y duración de las listas por navegador mediante una cookie HttpOnly. Al regresar se eliminan las entradas sin archivo local disponible, según la preferencia del usuario; los archivos se vuelven a agregar para reproducirse. No restaurar URLs guardadas. Los errores de archivo no disponible o formato incompatible eliminan la pista; un bloqueo de autoplay no debe eliminarla. La detección de BPM usa autocorrelación de cambios de energía y es aproximada. Los hot cues y loops son por canción y sesión. La interfaz y los mensajes son en español. Mantener etiquetas accesibles en los controles y estilos por deck con variables CSS.

No ejecutar builds o servidores para validar en la sesión de automatización: la plataforma realiza la validación tras los cambios.
