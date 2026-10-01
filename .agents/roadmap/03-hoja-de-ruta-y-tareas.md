# 03. Hoja de Ruta y Lista de Tareas para Control de Avance

Este documento contiene la lista detallada de tareas agrupadas por fases para dar seguimiento y control al desarrollo de la **Opción B: Microservicio Local**.

---

## Estado Global del Proyecto

- [x] **Fase 0: Diagnóstico, Estabilización de Código y Diseño de Solución** (Completada)
- [x] **Fase 1: Infraestructura y Microservicio Base en Node.js** (Completada)
- [x] **Fase 2: Motor de Ingesta Masiva y Orquestador de Conversión** (Completada)
- [x] **Fase 3: Integración del Frontend y Experiencia de Usuario (HUD)** (Completada)
- [ ] **Fase 4: Pruebas de Estrés y Validación Final** (En Progreso / Lista para Ejecución)

---

## 📋 Lista Detallada de Tareas

### Fase 1: Infraestructura y Microservicio Base
- [x] **T1.1** Crear el directorio `server/` en la raíz del proyecto.
- [x] **T1.2** Instalar dependencias del servidor en `devDependencies`: `express`, `cors`, `busboy`, `tsx`, `@types/express`, `@types/busboy`, `@types/cors`, `concurrently`.
- [x] **T1.3** Configurar script de ejecución TypeScript en `package.json`: `"server": "tsx --max-old-space-size=16384 server/index.ts"`.
- [x] **T1.4** Crear script combinado `"dev:all": "concurrently \"npm run server\" \"vite\""` para levantar backend y frontend con un solo comando.
- [x] **T1.5** Configurar el proxy inverso en `vite.config.ts` redirigiendo `/api` hacia `http://localhost:3001`.
- [x] **T1.6** Implementar endpoint de salud `GET /api/health` con reporte de puerto, versión y memoria disponible del sistema.

### Fase 2: Motor de Ingesta Masiva y Orquestador de Conversión
- [x] **T2.1** Configurar middleware de streaming con `busboy` en `POST /api/convert` que escriba en `temp/<jobId>/source.ifc` sin cargar el buffer en el heap de Node.js.
- [x] **T2.2** Implementar la cola de tareas secuencial (`server/queue.ts`) asegurando que solo se procese 1 conversión masiva a la vez para proteger la RAM.
- [x] **T2.3** Modularizar el conversor en `server/converter.ts` (reutilizando la lógica de escaneo BitSet de `scripts/convert-ifc.js`) emitiendo eventos de progreso tipados.
- [x] **T2.4** Implementar el canal de comunicación SSE en `GET /api/jobs/:id/progress` con latidos (*heartbeats*) cada 5 segundos para prevenir caídas por inactividad.
- [x] **T2.5** Implementar endpoint `GET /api/jobs/:id/download/:part` para servir cada fragmento `.frag` mediante streaming (`fs.createReadStream`) sin eliminar las partes restantes prematuramente.
- [x] **T2.6** Diseñar rutina de limpieza en dos etapas:
  - Eliminación inmediata de `source.ifc` y particiones intermedias `.ifc` al concluir la conversión a `.frag`.
  - Endpoint `DELETE /api/jobs/:id` y recolector por TTL (30 min) para eliminar los `.frag` una vez completada la descarga por el cliente.

### Fase 3: Integración del Frontend (ViewerCo.vue)
- [x] **T3.1** Crear cliente HTTP/SSE `src/services/backend-client.ts` para interactuar con `/api/health`, `/api/convert` y suscribirse a eventos de progreso.
- [x] **T3.2** Añadir comprobación en segundo plano de disponibilidad del backend en `ViewerCo.vue` (indicador de estado en el HUD y pill en viewport).
- [x] **T3.3** Modificar la lógica de carga de IFC: si el archivo supera 1.85 GB y el backend está en línea, delegar automáticamente la conversión al microservicio.
- [x] **T3.4** Conectar el HUD existente de carga (`Motor BIM • Carga de Alto Rendimiento`) a los eventos SSE recibidos del backend en tiempo real.
- [x] **T3.5** Descargar e inyectar secuencialmente todas las partes `.frag` recibidas en `fragmentManager.core.load(...)` y llamar a `fitCameraToModels()` para encuadrar la escena.
- [x] **T3.6** Notificar al backend la finalización de la carga invocando `DELETE /api/jobs/:id` para liberar el almacenamiento temporal.

### Fase 4: Pruebas de Estrés y Validación Final
- [ ] **T4.1** Ejecutar la prueba de extremo a extremo arrastrando el archivo naval de 3.53 GB (`IFC_Entire_Ship_wo_ref_2026-07-16.ifc`) al visor web.
- [ ] **T4.2** Monitorear con el Administrador de Tareas de Windows que el consumo de RAM no exceda el límite establecido (máx. 14–16 GB) y no genere *thrashing*.
- [ ] **T4.3** Validar renderizado integral en Three.js / ThatOpen: geometría completa sin elementos faltantes, propiedades BIM accesibles y tasa de cuadros estable ($\ge$ 60 FPS).
- [ ] **T4.4** Probar escenarios de resiliencia: desconexión de red a mitad de carga, cancelación manual y verificación de que no queden carpetas residuales en `temp/`.

---

## 🎯 Criterios de Aceptación

1. **Autonomía:** El usuario puede arrastrar directamente archivos IFC masivos (> 1.85 GB) al navegador sin necesidad de recurrir manualmente a la consola de comandos.
2. **Interactividad:** El visor refleja el avance porcentual y la etapa exacta del proceso sin congelar la interfaz ni agotar la memoria de la pestaña.
3. **Fidelidad Gráfica:** El modelo completo se ensambla de forma transparente en la escena 3D manteniendo el sistema de coordenadas unificado.
4. **Higiene de Almacenamiento:** El sistema no acumula archivos temporales huérfanos en disco al finalizar o cancelar la sesión.
