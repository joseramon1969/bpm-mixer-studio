# Arquitectura

Aplicación TanStack Start con React y TypeScript. `src/routes/index.tsx` contiene la consola y el motor de audio; `src/routes/__root.tsx` define metadatos y documento en español; `src/styles.css` contiene el diseño adaptable. Componentes base adicionales están en `src/components/ui`.

El audio usa un AudioContext compartido y un elemento HTMLAudioElement por deck. Cada canal pasa por tres filtros de EQ, un filtro de paso, ganancia y analizador. El crossfader emplea una curva de potencia constante. Los efectos se sintetizan localmente; los archivos personalizados usan URLs de objetos locales.

Mantener todo el audio en el cliente: no subir archivos ni usar almacenamiento remoto. localStorage conserva únicamente nombres, BPM y duración de las listas; los usuarios vuelven a seleccionar los archivos al regresar. La detección de BPM usa autocorrelación de cambios de energía y es aproximada. Los hot cues y loops son por canción y sesión. La interfaz y los mensajes son en español. Mantener etiquetas accesibles en los controles y estilos por deck con variables CSS.

No ejecutar builds o servidores para validar en la sesión de automatización: la plataforma realiza la validación tras los cambios.
