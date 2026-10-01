# 04. Registro de Control de Cambios (Changelog)

Este documento registra cronológicamente las decisiones técnicas, modificaciones aplicadas y pruebas realizadas durante la implementación de la **Opción B**.

---

## 📌 Historial de Cambios

### [2026-09-30] - Fase 0: Diagnóstico de Error y Estabilización
- **Problema Detectado:**
  Al intentar procesar el archivo `IFC_Entire_Ship_wo_ref_2026-07-16.ifc` (3.53 GB), la consola arrojó el fallo `stoll: no conversion` y `Aborted()` durante la etapa 2 (`Stage 2/3`).
- **Análisis de Causa Raíz:**
  La función `createThreeVirtualPartitions` en `src/services/ifc-processor.ts` realizaba cortes arbitrarios de bytes (`file.slice()`), omitiendo en la Parte 2 más de 24 millones de entidades padre (coordenadas, geometrías y orientaciones) presentes en la Parte 1. Al intentar parsear identificadores inexistentes, el motor C++ de WebAssembly lanzó la excepción de conversión y abortó.
- **Acciones Realizadas:**
  1. Se eliminó la partición ciega por bytes que corrompía los archivos en el navegador.
  2. Se fijó `MAX_SAFE_BROWSER_IFC_SIZE = 1.85 GB` para proteger la memoria de 32 bits de WebAssembly (`wasm32`).
  3. Se corrigió el desplazamiento sin signo `offset >>> 0` en `ifc-processor.worker.ts` para soportar offsets de más de 2 GB.
  4. Se integró una ventana modal en `ViewerCo.vue` para orientar al usuario en la ejecución de la conversión de alta escala.
  5. Se validó la compilación con `vue-tsc --build` y `vite build` (código de salida 0).
- **Estado:** ✅ Completado y estabilizado.

---

### [2026-09-30] - Fase 0: Diseño de Solución y Estructura Documental
- **Acción:**
  Creación y estructuración de la carpeta `.agents/roadmap/` con los documentos de arquitectura técnica, análisis de riesgos, hoja de ruta con lista de control de avance y registro histórico de cambios para la Opción B.
- **Archivos creados y armonizados:**
  - `README.md`: Índice y objetivos principales.
  - `01-limitaciones-y-riesgos.md`: Especificación de límites físicos de hardware, memoria WebAssembly y ciclo de vida de archivos.
  - `02-arquitectura-tecnica.md`: Diagrama de componentes, endpoints REST y flujo de eventos SSE tipados.
  - `03-hoja-de-ruta-y-tareas.md`: Checklist detallado de tareas por fases (Fase 1 a Fase 4) y criterios de aceptación.
  - `04-registro-de-cambios.md`: Historial de control de versiones y decisiones técnicas.
- **Estado:** ✅ Completado.

---

### [2026-10-01] - Fase 1: Infraestructura y Microservicio Base en Node.js
- **Acciones Realizadas:**
  1. Creación del directorio [server/](file:///c:/Users/wmaldonado/Desktop/IFC-XRlab/server).
  2. Instalación de dependencias: `express`, `cors`, `busboy`, `tsx`, `concurrently` y sus tipos `@types/*`.
  3. Configuración de scripts en [package.json](file:///c:/Users/wmaldonado/Desktop/IFC-XRlab/package.json):
     - `"server": "tsx --max-old-space-size=16384 server/index.ts"` (Heap de 16 GB).
     - `"dev:all": "concurrently \"npm run server\" \"vite\""` (Lanzamiento unificado backend + frontend).
  4. Configuración del proxy inverso en [vite.config.ts](file:///c:/Users/wmaldonado/Desktop/IFC-XRlab/vite.config.ts) (`/api` -> `http://localhost:3001`).
  5. Implementación del endpoint [GET /api/health](file:///c:/Users/wmaldonado/Desktop/IFC-XRlab/server/index.ts) con reporte de puerto, versión y memoria RAM libre del sistema (`os.freemem`).
  6. Inclusión de `server/**/*` en [tsconfig.node.json](file:///c:/Users/wmaldonado/Desktop/IFC-XRlab/tsconfig.node.json) para chequeo estricto de tipos.
- **Estado:** ✅ Completado y verificado.

---

### [2026-10-01] - Fase 2: Motor de Ingesta Masiva y Orquestador de Conversión
- **Acciones Realizadas:**
  1. Creación de [server/types.ts](file:///c:/Users/wmaldonado/Desktop/IFC-XRlab/server/types.ts) definiendo tipos para Jobs, estados (`uploading`, `queued`, `processing`, `completed`, `failed`), eventos SSE tipados y suscriptores.
  2. Implementación de streaming continuo con `busboy` en `POST /api/convert`, guardando el archivo directamente en `temp/<jobId>/source.ifc` sin cargar el buffer en la RAM de Node.js y respondiendo `202 Accepted`.
  3. Desarrollo de la cola secuencial en [server/queue.ts](file:///c:/Users/wmaldonado/Desktop/IFC-XRlab/server/queue.ts) con concurrencia fija de 1 tarea pesada simultánea para proteger la memoria física.
  4. Modularización del motor BitSet en [server/converter.ts](file:///c:/Users/wmaldonado/Desktop/IFC-XRlab/server/converter.ts):
     - Detección de límite WASM (1.85 GB).
     - Partición de modelos masivos en dos pasadas streaming de bajo consumo (Pass 1: BitSet de referencias; Pass 2: Generación física de submodelos).
     - Aislamiento de subprocesos WebAssembly con IPC (`fork`) y 16 GB de heap por submodelo.
  5. Canal de eventos SSE en `GET /api/jobs/:id/progress` con latidos cada 5 segundos (*heartbeats*) para evitar desconexiones por inactividad.
  6. Endpoint de streaming `GET /api/jobs/:id/download/:part` para servir cada fragmento `.frag` (`fs.createReadStream`) sin eliminar las partes restantes prematuramente.
  7. Rutina de higiene y limpieza en dos etapas:
     - Eliminación inmediata de archivos `.ifc` intermedios tras completar la generación de `.frag` (liberando ~7 GB de disco).
     - Endpoint `DELETE /api/jobs/:id` y recolector TTL automático (30 min) para eliminar carpetas temporales huérfanas.
- **Estado:** ✅ Completado y validado.

---

### [2026-10-01] - Fase 3: Integración del Frontend y Experiencia de Usuario (HUD)
- **Acciones Realizadas:**
  1. Creación del servicio [src/services/backend-client.ts](file:///c:/Users/wmaldonado/Desktop/IFC-XRlab/src/services/backend-client.ts) con soporte para verificación de salud, subida en streaming multipart, consumo de SSE en tiempo real y descarga de fragmentos generados.
  2. Integración en [ViewerCo.vue](file:///c:/Users/wmaldonado/Desktop/IFC-XRlab/src/components/ViewerCo.vue) de sondeo reactivo del estado del microservicio (`backendStatus`) y creación de un indicador visual flotante (*Status Pill*) en el visor.
  3. Actualización de `processMultipleIfcFiles`: al detectar un archivo IFC > 1.85 GB, verifica si el microservicio está en línea; de estarlo, delega automáticamente la conversión al microservicio de 64 bits sin requerir intervención manual del usuario en la consola.
  4. Conexión del HUD dinámico (`Motor BIM • Carga de Alto Rendimiento`) a los eventos SSE del backend en tiempo real, reflejando porcentaje exacto, etapas y tiempo transcurrido.
  5. Carga e inyección secuencial de los buffers `.frag` descargados en `fragmentManager.core.load(...)` con llamada a `fitCameraToModels()` para encuadrar la escena 3D.
  6. Solicitud automática de limpieza `DELETE /api/jobs/:id` al finalizar la inyección de fragmentos.
  7. Enriquecimiento del modal informativo para modelos masivos con opción de un solo clic para copiar `npm run dev:all` y botón interactivo para comprobar la conexión con el microservicio.
  8. **Consola y Visor Unificado de Logs de Errores (Solicitud de Usuario):**
     - Creación de [server/logger.ts](file:///c:/Users/wmaldonado/Desktop/IFC-XRlab/server/logger.ts) con buffer circular en memoria y captura de `console.log`, `warn` y `error`.
     - Endpoints REST en microservicio: `GET /api/logs` y `DELETE /api/logs`.
     - Creación de [src/services/logger.ts](file:///c:/Users/wmaldonado/Desktop/IFC-XRlab/src/services/logger.ts) para captura de excepciones en ventana, promesas no manejadas y unificación con logs del backend.
     - Creación de [src/components/ErrorLogModal.vue](file:///c:/Users/wmaldonado/Desktop/IFC-XRlab/src/components/ErrorLogModal.vue): modal interactivo con filtros (`Todos`, `Errores`, `Advertencias`, `Backend`, `Frontend`), búsqueda en vivo, copiado al portapapeles y visualización monospace.
     - Botón flotante superior (`📋 Ver Logs`) en [ViewerCo.vue](file:///c:/Users/wmaldonado/Desktop/IFC-XRlab/src/components/ViewerCo.vue) con contador dinámico de errores en tiempo real y botón integrado en el panel BIM.
  9. Validación exitosa de compilación: `vue-tsc --build` y `vite build` (código de salida 0).
- **Estado:** ✅ Completado y listo para pruebas.

---

### [Próximo Registro] - Fase 4: Pruebas de Estrés y Validación Final
- **Objetivo:**
  Ejecutar la validación completa arrastrando el archivo naval masivo de 3.53 GB (`IFC_Entire_Ship_wo_ref_2026-07-16.ifc`), monitoreando el consumo de memoria en el Administrador de Tareas y verificando la navegación fluida a 60 FPS en la escena 3D.
