# 01. Limitaciones del Sistema y Matriz de Riesgos

## 1. Restricciones Físicas y de Hardware

Para procesar archivos IFC de gran escala (como barcos completos o complejos industriales de 3.53 GB y más de 50 millones de entidades), el microservicio local depende de los recursos de la máquina del usuario:

| Recurso | Requisito Mínimo | Requisito Recomendado | Justificación y Desglose |
| :--- | :--- | :--- | :--- |
| **Memoria RAM** | 16 GB | 24 GB – 32 GB | Con menos de 16 GB, el sistema operativo activará intensivamente el archivo de paginación (*swap* en disco), ralentizando el proceso drásticamente o provocando `Process killed (Out of Memory)`. |
| **Espacio Libre en Disco** | 12 GB | 20 GB | **Desglose del pico de consumo:**<br>• Archivo temporal IFC subido: **~3.53 GB**<br>• Particiones intermedias de cálculo (Part 1 + Part 2 con entidades compartidas): **~3.8 – 4.0 GB**<br>• Fragmentos finales `.frag`: **~0.4 GB**<br>• Margen de seguridad para memoria virtual (*swap* del SO): **~4.0 GB**<br>*(Total acumulado pico: ~11.9 GB)*. |
| **CPU** | 4 Núcleos (x64) | 8+ Núcleos (x64) | La fase de análisis léxico, cruce de referencias BitSet y parseo de entidades STEP es intensiva en cómputo monohilo y multihilo. |

---

## 2. Limitaciones de WebAssembly y Motores de Parseo

1. **Límite nativo de WebAssembly (`wasm32`):**
   - Aunque Node.js se ejecute en un sistema operativo de 64 bits con 32 GB de RAM, la librería `web-ifc.wasm` está compilada en arquitectura `wasm32`.
   - Una única instancia de WebAssembly no puede direccionar más de 4,294,967,296 bytes (4 GB), y en la práctica el motor sufre inestabilidad al superar ~2 GB en operaciones de indexación masiva.
   - **Mitigación:** El backend orquesta la conversión ejecutando procesos hijos independientes (`child_process.spawn`) con memoria aislada para cada bloque del modelo, asegurando que ninguna instancia supere los 2 GB de heap WASM.

2. **Integridad del Grafo Relacional STEP (ISO-10303-21):**
   - No es posible dividir un archivo IFC cortando cadenas de texto o bloques de bytes arbitrarios (`Blob.slice`), ya que esto genera el error `stoll: no conversion` y el colapso del proceso al perderse las referencias a geometrías y coordenadas previas.
   - **Mitigación:** La partición en el backend se realiza mediante escaneo previo de referencias cruzadas con BitSet (como en `scripts/convert-ifc.js`), preservando intactas todas las relaciones de colocación (`IfcLocalPlacement`) y mallas.

---

## 3. Matriz de Errores Potenciales y Prevención

| Código / Mensaje de Error | Causa Raíz | Prevención Arquitectónica |
| :--- | :--- | :--- |
| **`ERR_CONNECTION_RESET` / Timeout HTTP** | Una petición `fetch` convencional se vence tras 60–120 segundos mientras el servidor procesa el modelo. | Desacoplar la petición: el cliente sube el archivo mediante streaming y recibe un `jobId` inmediato (202 Accepted). El progreso continuo se transmite por Server-Sent Events (SSE) con latidos (*heartbeats*) cada 5 s. |
| **`PayloadTooLargeError` / 413** | Los servidores web por defecto (ej. body-parser de Express) rechazan cargas mayores a 100 MB. | Desactivar parsers en memoria para la ruta de carga y utilizar streaming directo a disco mediante `busboy`. |
| **`EADDRINUSE: 3001`** | El puerto asignado al microservicio ya está ocupado por otra instancia o aplicación. | Configurar variable de entorno `PORT` (por defecto `3001`). En caso de conflicto, el servidor reporta un error claro y detiene el proceso anterior huérfano. No se conmuta a puertos aleatorios sin sincronización previa con el proxy de Vite para evitar fallos de conexión en el frontend. |
| **`CORS Error`** | El frontend en `:5173` intenta comunicarse directamente con `:3001` y el navegador bloquea las cabeceras. | Configurar el proxy inverso en `vite.config.ts` (`/api` redirigido a `http://localhost:3001`) para operar bajo el mismo origen. |
| **`ENOSPC: no space left on device`** | El disco del sistema se llena con archivos temporales residuales. | **Ciclo de limpieza en 2 etapas:**<br>1. Los archivos `source.ifc` y particiones `.ifc` se eliminan inmediatamente tras finalizar la conversión a `.frag`.<br>2. Los archivos `.frag` se eliminan tras confirmar la descarga de todas sus partes, mediante endpoint `DELETE /api/jobs/:id`, o por TTL automático tras 30 minutos. |
| **Sobrecarga por concurrencia** | El usuario sube múltiples archivos gigantescos en paralelo. | Cola de trabajos secuencial (*FIFO Job Queue*) con concurrencia máxima = 1. Si entra un nuevo trabajo mientras hay uno activo, se encola notificando posición y tiempo estimado. |
