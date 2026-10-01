# Hoja de Ruta: Microservicio Backend Local (Opción B)
## Proyecto: IFC-XRlab (ifc2frag)

Este directorio contiene la documentación técnica, especificación arquitectónica, matriz de riesgos y el registro de control de cambios para la implementación de la **Opción B: Microservicio Backend Local de 64 bits** para la importación y conversión de modelos IFC masivos (> 1.85 GB / ej. Barco completo de 3.53 GB).

---

## 📑 Índice de Documentos

1. [01-limitaciones-y-riesgos.md](./01-limitaciones-y-riesgos.md)
   - Restricciones físicas de memoria RAM y almacenamiento en disco.
   - Limitaciones de la arquitectura WebAssembly (wasm32 vs x64).
   - Modos de fallo potenciales y estrategias preventivas.

2. [02-arquitectura-tecnica.md](./02-arquitectura-tecnica.md)
   - Diagrama de flujo de datos (Frontend ↔ Proxy Vite ↔ Backend ↔ Workers).
   - Especificación de endpoints de la API REST y eventos en tiempo real (SSE).
   - Estrategia de streaming continuo sin saturación de memoria.

3. [03-hoja-de-ruta-y-tareas.md](./03-hoja-de-ruta-y-tareas.md)
   - Fases de desarrollo (Fases 1 a 4).
   - Checklist detallado de tareas con casillas de verificación para control de avance.
   - Criterios de aceptación y pruebas de verificación.

4. [04-registro-de-cambios.md](./04-registro-de-cambios.md)
   - Historial cronológico de cambios aplicados en el proyecto.
   - Decisiones de arquitectura y registro de validaciones técnicas.

---

## 🎯 Objetivo Principal

Permitir que el usuario arrastre o seleccione archivos IFC de gran tamaño (como `IFC_Entire_Ship_wo_ref_2026-07-16.ifc` de 3.53 GB) directamente en el navegador, delegando el procesamiento pesado al microservicio local en Node.js de 64 bits sin crasheos de memoria en el navegador, y renderizando el modelo unificado en la GPU de forma automática.
