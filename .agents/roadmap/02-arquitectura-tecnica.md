# 02. Especificación de Arquitectura Técnica

## 1. Diagrama de Componentes y Flujo de Datos

```
+-------------------------------------------------------------+
|                NAVEGADOR WEB (Frontend :5173)               |
|                                                             |
|  [ViewerCo.vue]                                             |
|        |                                                    |
|        | 1. Upload Stream (multipart / busboy)              |
|        v                                                    |
|  [Vite Dev Server Proxy (/api/* -> :3001)]                  |
+--------|----------------------------------------------------+
         | (Localhost HTTP / Streaming)
+--------v----------------------------------------------------+
|             MICROSERVICIO LOCAL (Node.js x64 :3001)         |
|             Comando: tsx --max-old-space-size=16384         |
|                                                             |
|  [HTTP Router: /api/convert, /api/jobs, /api/health]        |
|        |                                                    |
|        v                                                    |
|  [Job Queue (Concurrencia secuencial: 1)]                   |
|        |                                                    |
|        | 2. Orquestador de Conversión BitSet                |
|        v                                                    |
|  [server/converter.ts]                                      |
|        |                                                    |
|        +---> Pass 1/2: Escaneo de referencias BitSet        |
|        +---> Pass 2/2: Escritura de Particiones IFC         |
|        +---> Subproceso Hijo 1 (WASM Aislado: Part 1)       |
|        +---> Subproceso Hijo 2 (WASM Aislado: Part 2)       |
|        |                                                    |
|        | 3. Emisión SSE de Progreso (0% -> 100%)            |
|        v                                                    |
|  [SSE Event Stream: /api/jobs/:id/progress] ----------------+
|        |                                                    |
|        | 4. Archivos .frag listos (Particiones IFC borradas)|
|        v                                                    |
|  [Descarga Directa: /api/jobs/:id/download/:part]           |
+--------|----------------------------------------------------+
         |
         v
+-------------------------------------------------------------+
|                NAVEGADOR WEB (Renderizado GPU)              |
|                                                             |
|  [fragmentManager.core.load(bytes, { raw: true })]          |
|  [fitCameraToModels()] -> Visualización 3D Instantánea      |
+-------------------------------------------------------------+
```

---

## 2. Definición de Endpoints de la API REST

### 1. `GET /api/health`
- **Propósito:** Permite al frontend verificar si el microservicio local está activo y consultar la memoria disponible del sistema.
- **Respuesta (200 OK):**
  ```json
  {
    "status": "ok",
    "version": "1.0.0",
    "port": 3001,
    "freeMemoryGB": 18.4,
    "totalMemoryGB": 32.0,
    "activeJobs": 0
  }
  ```

### 2. `POST /api/convert`
- **Cabeceras:** `Content-Type: multipart/form-data`
- **Mecanismo:** Flujo de entrada procesado mediante `busboy` con escritura en streaming directo a archivo temporal en disco (`temp/<jobId>/source.ifc`), evitando cargar el buffer en el heap de Node.js.
- **Respuesta inmediata (202 Accepted):**
  ```json
  {
    "jobId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "fileName": "IFC_Entire_Ship_wo_ref_2026-07-16.ifc",
    "fileSize": 3790975108,
    "progressUrl": "/api/jobs/f47ac10b-58cc-4372-a567-0e02b2c3d479/progress"
  }
  ```

### 3. `GET /api/jobs/:id/progress`
- **Cabeceras:** `Content-Type: text/event-stream`, `Cache-Control: no-cache`
- **Ciclo de eventos SSE transmitidos:**
  ```text
  event: progress
  data: {"percent": 15, "stage": "Pass 1/2: Escaneo de referencias cruzadas BitSet", "elapsed": "12.4s"}

  event: progress
  data: {"percent": 35, "stage": "Pass 2/2: Generación física de particiones intermedias", "elapsed": "28.1s"}

  event: progress
  data: {"percent": 65, "stage": "Conversión Parte 1/2 en WebAssembly aislado", "elapsed": "52.3s"}

  event: progress
  data: {"percent": 90, "stage": "Conversión Parte 2/2 en WebAssembly aislado", "elapsed": "81.6s"}

  event: complete
  data: {"parts": ["Part1.frag", "Part2.frag"], "downloadUrls": ["/api/jobs/f47ac10b.../download/1", "/api/jobs/f47ac10b.../download/2"]}
  ```
  *(Nota: Para modelos $\le$ 1.85 GB procesados en modo individual, `parts` contendrá un único archivo y la conversión se completará en un único paso).*

### 4. `GET /api/jobs/:id/download/:part`
- **Propósito:** Descarga en streaming (`fs.createReadStream`) el buffer binario `.frag` correspondiente a la parte solicitada (`:part` = índice 1-based o nombre de archivo).
- **Control de concurrencia de partes:** La descarga de una parte **no** elimina las restantes. Todas las partes generadas permanecen disponibles hasta que el cliente finalice o venza el tiempo de expiración.

### 5. `DELETE /api/jobs/:id`
- **Propósito:** Liberación forzada de recursos y eliminación de la carpeta temporal `temp/<jobId>` al concluir la carga en el visor o por cancelación del usuario. Un recolector con TTL (30 minutos) garantiza la limpieza si el frontend se cierra inesperadamente.

---

## 3. Integración con Vite Proxy (A implementar en Fase 1 - T1.5)

Para evitar problemas de CORS y puertos cruzados, en `vite.config.ts` se configurará el proxy inverso:

```typescript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3001',
      changeOrigin: true,
      ws: true,
    }
  }
}
```

De este modo, el frontend siempre realiza las peticiones a `http://localhost:5173/api/...` y el servidor de desarrollo de Vite las reenvía transparentemente al microservicio en `:3001`.
