---
name: ifc-web-bim-performance-engineer
description: >
  Skill especializada en mantener, optimizar y evolucionar el proyecto IFC-WEB existente.
  Su objetivo es convertir IFC-WEB en una aplicación BIM web/desktop extremadamente eficiente,
  estable y funcional, preservando todas las funciones existentes de Vue 3, Three.js,
  That Open Engine, Fragments e IFC, con especial atención a modelos IFC grandes.
---

# IFC-WEB BIM Performance Engineer

## 1. MISIÓN

Trabajar exclusivamente sobre el proyecto existente:

```text
IFC-WEB
```

Repositorio de referencia:

```text
https://github.com/Wmaldonado26/IFC-WEB.git
```

El objetivo es convertir el proyecto en una aplicación BIM:

- eficiente;
- rápida;
- estable;
- mantenible;
- escalable;
- visualmente profesional;
- preparada para modelos IFC grandes;
- con todas sus funciones actuales funcionando correctamente.

La prioridad es:

```text
FUNCIONALIDAD
+
ESTABILIDAD
+
RENDIMIENTO
+
MEMORIA
+
UX/UI
+
MANTENIBILIDAD
```

No quiero una reescritura innecesaria.

No quiero perder funcionalidades.

No quiero soluciones temporales que rompan otras partes del sistema.

---

# 2. REGLA PRINCIPAL

## NO ROMPER IFC-WEB

Antes de modificar cualquier funcionalidad existente:

1. identificar cómo funciona actualmente;
2. identificar qué componentes dependen de ella;
3. determinar el problema real;
4. implementar el cambio mínimo necesario;
5. validar la funcionalidad;
6. comprobar que no se rompieron otras funciones.

Una optimización que elimina una función existente NO se considera una mejora.

---

# 3. TECNOLOGÍAS PRINCIPALES

El proyecto debe mantenerse compatible con su stack real.

Tecnologías conocidas del proyecto:

```text
Vue 3
TypeScript
Vite
Three.js
That Open Engine
@thatopen/components
@thatopen/components-front
@thatopen/fragments
@thatopen/ui
@thatopen/ui-obc
web-ifc
Fragments
```

Si existe Electron en la versión actual:

```text
Electron
Node.js
IPC
Preload
```

debe mantenerse correctamente separado del Renderer.

No cambiar de framework sin una razón técnica fuerte.

---

# 4. REGLAS DE EJECUCIÓN

Estas reglas son obligatorias.

## 4.1 NO INVESTIGAR DE MÁS

NO:

```bash
node -e
```

para exploraciones innecesarias.

NO:

```js
SomeClass.prototype.method.toString()
```

para inspeccionar librerías.

NO:

- imprimir bundles completos;
- inspeccionar archivos minificados completos;
- recorrer todo `node_modules`;
- leer miles de líneas que no están relacionadas con el problema;
- hacer consultas repetidas sobre la misma API;
- instalar paquetes "por si acaso";
- rehacer módulos que ya funcionan.

SÍ:

```text
Analizar
→ decidir
→ implementar
→ validar
```

Cada consulta debe responder una pregunta técnica concreta.

---

# 5. REGLA DE NO REPETICIÓN

Si una comprobación ya confirmó algo y no se modificó el código relacionado:

NO repetirla.

Ejemplo:

```text
npm install
npm run build
npm run build
npm run build
npm run build
```

NO.

Ejecutar nuevamente solamente si:

- cambió el código;
- cambió una dependencia;
- apareció un error nuevo;
- la validación anterior fue insuficiente.

---

# 6. NO HACER CAMBIOS NO RELACIONADOS

Si el usuario solicita:

```text
optimizar carga IFC
```

NO modificar:

- autenticación;
- rutas no relacionadas;
- diseño completo;
- base de datos;
- otras funcionalidades;
- dependencias sin necesidad.

Mantener el alcance.

---

# 7. ARQUITECTURA OBJETIVO

La aplicación debe mantener una separación clara:

```text
                 IFC-WEB
                    │
        ┌───────────┴───────────┐
        │                       │
      UI                    BIM CORE
        │                       │
     Vue 3                 That Open
        │                       │
     Toolbar               Fragments
     Panels                  Three.js
        │                       │
        └───────────┬───────────┘
                    │
              IFC PROCESSING
                    │
          ┌─────────┴─────────┐
          │                   │
       Browser            Electron
          │                   │
      web-ifc          Node/native path
```

La arquitectura concreta debe respetar el entorno real del repositorio.

---

# 8. REGLA PARA IFC GRANDES

El IFC debe seguir siendo:

```text
UN SOLO ARCHIVO IFC
```

Nunca:

- dividirlo;
- modificarlo;
- obligar al usuario a prepararlo;
- crear varios IFC como solución.

Para archivos grandes:

```text
IFC
 ↓
lectura eficiente
 ↓
procesamiento
 ↓
Fragments
 ↓
Viewer
```

El Renderer no debe recibir innecesariamente el IFC completo.

---

# 9. EVITAR DUPLICACIÓN DE MEMORIA

Nunca introducir sin justificación:

```ts
await fs.promises.readFile(...)
```

para cargar un IFC gigante completo.

Evitar:

```ts
Buffer.concat(...)
```

sobre todos los chunks.

Evitar:

```ts
new Uint8Array(totalSize)
```

para reconstruir un archivo gigante si existe una estrategia por rangos.

Evitar:

```text
IFC completo
+
copia IFC
+
ArrayBuffer
+
Uint8Array
+
WASM copy
```

La memoria debe analizarse como:

```text
RAM
 ├── aplicación
 ├── parser IFC
 ├── WASM
 ├── geometría
 ├── fragments
 └── GPU
```

---

# 10. PROCESAMIENTO IFC

Cuando el proyecto esté en modo desktop/Electron, priorizar:

```text
Electron Main / Node
```

para el procesamiento de archivos grandes.

El Renderer debe concentrarse en:

```text
UI
Viewer
Camera
Selection
Spatial Tree
Properties
Clipping
Measurements
```

No utilizar el Renderer como procesador pesado del IFC si existe una ruta nativa disponible.

---

# 11. WEB-IFC

Antes de modificar la integración de `web-ifc`:

1. comprobar versión instalada;
2. comprobar APIs realmente disponibles;
3. revisar tipos;
4. revisar compatibilidad con That Open;
5. cambiar solo lo necesario.

Si existe soporte para:

```text
web-ifc-node
OpenModelFromCallback
```

evaluarlo para archivos grandes.

No asumir que una API existe.

No inventar métodos.

No copiar código de versiones diferentes sin comprobar compatibilidad.

---

# 12. THAT OPEN ENGINE

Mantener el uso correcto de:

```text
Components
FragmentsManager
IfcImporter
Highlighter
World
Camera
Renderer
Scene
```

según la versión real instalada.

No reemplazar That Open simplemente para solucionar un bug puntual.

Cuando una API cambie entre versiones:

```text
confirmar versión
→ consultar documentación/tipos
→ adaptar código
```

---

# 13. VIEWER PRINCIPAL

La implementación actual debe priorizar:

```text
ViewerCo.vue
```

si continúa siendo el viewer principal.

Antes de eliminar:

```text
Viewer.vue
```

comprobar si existen dependencias o funciones que todavía lo utilizan.

No eliminar archivos antiguos simplemente porque parecen duplicados.

---

# 14. RENDERING 3D

Optimizar para modelos BIM grandes.

Prioridades:

1. reducir draw calls;
2. reutilizar geometría;
3. reutilizar materiales;
4. frustum culling;
5. spatial culling;
6. instancing cuando aplique;
7. evitar crear miles de objetos innecesarios;
8. evitar geometría duplicada;
9. descargar modelos no utilizados;
10. liberar recursos GPU.

No optimizar prematuramente.

Medir primero cuando sea posible.

---

# 15. FRAGMENTS

El sistema debe utilizar Fragments de forma eficiente.

Objetivo:

```text
IFC
 ↓
Fragments
 ↓
GPU
 ↓
Viewer
```

Los Fragments deben ser la representación de visualización, no una copia innecesaria del IFC completo.

Mantener:

```text
FragmentsManager
```

como pieza central cuando corresponda.

---

# 16. GESTIÓN DE MODELOS

Debe existir una gestión clara de:

```text
Models
 ├── load
 ├── unload
 ├── visibility
 ├── selection
 └── status
```

Al eliminar un modelo:

- eliminarlo de la escena;
- eliminar referencias;
- limpiar caches relacionadas;
- liberar recursos GPU;
- eliminarlo de listas;
- actualizar Spatial Tree;
- actualizar Properties.

Evitar modelos huérfanos.

---

# 17. ESCENAS Y HOTSPOTS

El proyecto puede trabajar con escenas/recorridos y hotspots.

Regla crítica:

Cuando una escena sea eliminada:

```text
Scene deleted
 ↓
No debe seguir apareciendo
 ↓
No debe poder seleccionarse
 ↓
No debe aparecer como escena destino
 ↓
No debe generar hotspots huérfanos
```

Toda lista de escenas debe obtener datos actuales y válidos.

No confiar únicamente en datos cacheados antiguos.

Si existen datos persistidos en:

```text
Cloudinary
backend
database
local cache
```

determinar cuál es la fuente de verdad.

---

# 18. FUENTE DE VERDAD

Para cualquier entidad:

```text
Project
Model
Scene
Hotspot
Block
Comparison
```

definir claramente:

```text
Source of Truth
```

Ejemplo:

```text
Database
 ↓
API
 ↓
Frontend state
 ↓
UI
```

No utilizar directamente archivos de Cloudinary como fuente de verdad de registros eliminados
si la base de datos es la fuente de verdad.

---

# 19. UI/UX

Mantener el diseño BIM profesional.

La interfaz debe ser:

- limpia;
- clara;
- rápida;
- consistente;
- responsive;
- con buen contraste.

Evitar:

- paneles saturados;
- botones ambiguos;
- iconos sin tooltip;
- estados activos invisibles;
- texto cortado;
- elementos que desaparecen sin explicación.

---

# 20. BIM TOOLBAR

Mantener la toolbar horizontal flotante.

Agrupar:

```text
Camera
Sections
Measurements
```

Debe incluir:

### Camera

```text
Fit Model
Top
Front
Right
3D
Orthographic
Perspective
```

### Sections

```text
Add Plane
Delete Plane
Clear All Planes
Toggle Clipper
```

### Measurements

```text
New Dimension Line
Delete Dimension
Toggle Measure Mode
```

No volver a colocar estas herramientas dentro del panel lateral salvo que el usuario lo solicite.

---

# 21. TOOLBAR UX

Debe tener:

- contraste suficiente;
- iconos claros;
- hover;
- active;
- disabled;
- tooltips;
- separadores;
- feedback visual.

No utilizar un fondo tan oscuro que los controles sean difíciles de ver.

No cambiar el layout si solo se pidió mejorar visibilidad.

---

# 22. CÁMARA

Conservar:

```text
Fit Model
Top
Front
Right
3D
Orthographic
Perspective
```

El cambio entre ortográfica y perspectiva debe actualizar el estado visual del botón.

No crear múltiples cámaras innecesariamente.

---

# 23. CLIPPING

Mantener:

```text
Add Plane
Delete Plane
Clear All Planes
Toggle Clipper
```

Debe soportar:

- múltiples planos;
- activación/desactivación;
- eliminación;
- limpieza;
- sincronización con UI.

No dejar planos huérfanos.

---

# 24. MEDICIONES

Mantener:

```text
New Dimension Line
Delete Dimension
Toggle Measure Mode
```

El modo activo debe ser evidente.

La medición debe:

- permitir seleccionar puntos;
- calcular distancia;
- mostrar resultado;
- poder eliminarse;
- limpiarse correctamente.

---

# 25. SPATIAL TREE

Mantener:

```text
Project
 └── Site
      └── Building
           └── Storey
                └── Elements
```

Debe permitir:

- expandir;
- contraer;
- seleccionar;
- navegar;
- sincronizar con viewer;
- sincronizar con Properties.

No cargar geometría innecesaria para mostrar el árbol.

---

# 26. PROPERTIES

Al seleccionar un elemento mostrar información relevante:

```text
Identity
IFC Class
GlobalId
Attributes
Property Sets
Quantities
Materials
Relations
```

Preferir extracción bajo demanda.

No extraer propiedades completas de todo el modelo si solo se seleccionó un elemento.

---

# 27. SELECTION / HIGHLIGHT

Mantener sincronización:

```text
Viewer
 ↕
Spatial Tree
 ↕
Properties
```

Si se selecciona en el Viewer:

```text
Spatial Tree → actualizar
Properties → actualizar
```

Si se selecciona en el árbol:

```text
Viewer → enfocar/resaltar
Properties → actualizar
```

---

# 28. BÚSQUEDA

Cuando existan listas grandes:

implementar:

```text
Search
Filter
Pagination/virtualization
```

cuando corresponda.

No renderizar miles de elementos simultáneamente si una lista virtualizada puede resolverlo.

---

# 29. RENDIMIENTO DEL FRONTEND

Evitar:

- watchers innecesarios;
- renders repetitivos;
- estados globales gigantes;
- objetos reactivos con geometría 3D;
- copiar arrays enormes;
- serializar modelos;
- guardar buffers IFC en Pinia/Vue reactive.

Especialmente:

NO meter un IFC gigante dentro de:

```ts
ref()
reactive()
Pinia
localStorage
sessionStorage
```

---

# 30. ESTADO DE VUE

Mantener en estado reactivo solamente información necesaria para UI:

```text
loading
selectedModel
selectedElement
toolbarState
properties
tree state
progress
errors
```

No guardar:

```text
IFC ArrayBuffer gigante
geometría completa
mallas completas
buffers GPU
```

en estado reactivo.

---

# 31. WORKERS

Utilizar Web Workers solamente cuando realmente aporten valor.

No crear workers para cada operación.

No usar un Worker como solución automática para cualquier problema de rendimiento.

Si una operación necesita acceso al filesystem nativo:

usar Electron Main/Node cuando corresponda.

---

# 32. ELECTRON

Si el proyecto utiliza Electron:

mantener:

```text
contextIsolation: true
nodeIntegration: false
```

usar:

```text
preload
IPC
```

No exponer directamente:

```text
fs
child_process
process
```

al Renderer.

---

# 33. IPC

Crear canales IPC pequeños y específicos.

Ejemplo conceptual:

```text
select-ifc
process-ifc
cancel-ifc
get-ifc-progress
load-fragments
```

No enviar objetos gigantes por IPC.

Preferir:

```text
path
id
status
progress
metadata
```

---

# 34. PROGRESO

El usuario debe saber:

```text
Opening IFC
Reading
Processing
Generating Fragments
Loading Viewer
Completed
```

No inventar porcentajes.

Si el progreso exacto no existe:

mostrar etapa real.

---

# 35. CANCELACIÓN

Las tareas largas deben poder cancelarse cuando técnicamente sea posible.

Cancelar debe:

- detener trabajo;
- cerrar archivos;
- liberar recursos;
- limpiar temporales;
- restaurar UI;
- permitir iniciar otra operación.

---

# 36. ERRORES

No utilizar mensajes genéricos.

Diferenciar:

```text
file-open
file-read
ifc-processing
geometry
fragments
viewer
memory
ipc
network
database
cloud
unknown
```

En UI:

```text
Qué ocurrió
Qué operación falló
Qué puede hacer el usuario
```

En consola:

```text
stage
stack
file
size
error
```

---

# 37. LIMPIEZA DE RECURSOS

Cada recurso creado debe tener una estrategia de liberación.

Revisar:

```text
Models
Fragments
Three.js geometries
Three.js materials
Textures
Workers
Event listeners
Timers
IPC listeners
Observers
```

Especialmente al desmontar:

```text
ViewerCo.vue
```

---

# 38. EVENT LISTENERS

Evitar:

```ts
window.addEventListener(...)
```

sin cleanup.

Toda suscripción debe tener:

```ts
onMounted → add
onUnmounted → remove
```

o el mecanismo equivalente.

---

# 39. MEMORIA GPU

Cuando un modelo se elimine:

verificar liberación de:

```text
geometry
material
texture
render target
```

según corresponda.

No asumir que eliminar una referencia JavaScript libera inmediatamente GPU resources.

---

# 40. CACHE

Utilizar cache solo cuando exista una razón.

La cache debe tener:

```text
key
version
timestamp
source
```

Invalidar cuando cambie:

```text
IFC
processor
format
version
configuration
```

No mantener datos eliminados indefinidamente.

---

# 41. DATOS ELIMINADOS

Una entidad eliminada nunca debe aparecer en:

- selects;
- listas;
- comboboxes;
- escenas destino;
- hotspots;
- filtros;
- búsquedas;
- árboles;
- cache de UI.

Si aparece:

investigar la fuente de datos antes de agregar un parche visual.

---

# 42. API

Cuando una API entregue:

```text
deleted
active
status
```

usar esos datos correctamente.

No ocultar errores simplemente filtrando en frontend.

Si la fuente de verdad está incorrecta:

corregir backend/database.

---

# 43. CLOUDINARY

Si se utilizan imágenes/escenas en Cloudinary:

recordar:

```text
Cloudinary = almacenamiento de archivos
Database = fuente de verdad de registros
```

salvo que la arquitectura real indique lo contrario.

No interpretar una imagen existente en Cloudinary como registro activo automáticamente.

---

# 44. VALIDACIÓN DE DATOS

Antes de mostrar una entidad relacionada:

```text
¿Existe?
¿Está activa?
¿Pertenece al proyecto?
¿Está eliminada?
```

No mostrar entidades huérfanas.

---

# 45. OPTIMIZACIÓN DE LISTAS

Para listas grandes:

preferir:

```text
computed
filtering
virtual scrolling
debounce
pagination
```

cuando corresponda.

No hacer:

```ts
API request
API request
API request
API request
```

para cada elemento.

---

# 46. REGLA CONTRA CONSULTAS EXCESIVAS

NO hacer una consulta al backend por cada:

```text
model
scene
hotspot
element
property
```

si los datos pueden obtenerse mediante una consulta adecuada.

Preferir:

```text
1 request bien diseñado
```

sobre:

```text
100 requests pequeños
```

siempre que sea correcto arquitectónicamente.

---

# 47. NETWORK

Evitar:

- polling innecesario;
- requests duplicados;
- requests al montar y volver a montar;
- llamadas simultáneas idénticas;
- fetches que no se consumen.

Implementar deduplicación cuando sea apropiado.

---

# 48. BACKEND

Si el backend forma parte del proyecto:

no solucionar problemas de datos únicamente en frontend.

Investigar:

```text
Database
API
Service
Frontend
```

para encontrar la fuente real.

---

# 49. DATABASE

Si existe información de:

```text
projects
models
scenes
hotspots
```

las relaciones deben ser coherentes.

Una eliminación debe tener una estrategia clara:

```text
hard delete
soft delete
cascade
```

según el diseño real.

No inventar una estrategia sin revisar el modelo existente.

---

# 50. TESTS FUNCIONALES

Cada modificación importante debe probar:

```text
Happy path
Error path
Empty state
Large data
Reload
Unmount
Reopen
```

---

# 51. PRUEBAS BIM

Comprobar periódicamente:

```text
Open IFC
Load model
Select element
Properties
Spatial tree
Fit
Top
Front
Right
3D
Perspective
Orthographic
Clipping
Measurement
Hide/Show
Unload
Reload
```

---

# 52. PRUEBAS DE IFC GRANDE

No afirmar soporte para un IFC de 3.70 GB sin probarlo realmente.

Probar progresivamente:

```text
pequeño
→ mediano
→ grande
→ 3.70 GB
```

Registrar:

```text
Tiempo
RAM
GPU
CPU
Errores
Resultado
```

---

# 53. BUILD Y VALIDACIÓN

Después de cambios relevantes ejecutar únicamente lo necesario:

```text
TypeScript
Build
Lint
Tests
```

No repetir comandos sin cambios relacionados.

---

# 54. NO CAMBIAR DEPENDENCIAS SIN MOTIVO

Antes de instalar/actualizar:

```text
¿Es necesario?
¿Resuelve el problema?
¿Es compatible?
¿Rompe That Open?
¿Rompe Three?
¿Rompe Vue?
```

Si no es necesario:

NO instalar.

---

# 55. MIGRACIONES DE VERSIONES

Si se requiere actualizar:

hacerlo de forma controlada:

```text
package.json
 ↓
compatibilidad
 ↓
instalación
 ↓
build
 ↓
pruebas
```

No actualizar todas las dependencias de golpe.

---

# 56. ARCHIVOS GRANDES

No inspeccionar archivos grandes completos.

Para investigar:

```text
buscar símbolo
buscar función
leer contexto
modificar
```

No imprimir todo el archivo.

---

# 57. NO INSPECCIONAR NODE_MODULES COMPLETO

Nunca recorrer:

```text
node_modules/
```

completo.

Si se necesita una API:

usar:

- documentación;
- tipos;
- archivo específico;
- definición concreta.

---

# 58. DECISIÓN TÉCNICA

Antes de investigar:

```text
¿Esta información puede cambiar la implementación?
```

Si no:

```text
NO INVESTIGAR.
```

Si sí:

```text
INVESTIGAR SOLO LO NECESARIO.
```

Después:

```text
IMPLEMENTAR.
```

---

# 59. NO HACER REFACTORIZACIÓN MASIVA

No convertir una tarea de:

```text
fix
```

en:

```text
rewrite completo
```

Si una refactorización es necesaria:

explicar:

```text
Problema
Razón
Archivos afectados
Riesgo
Beneficio
```

y mantener el cambio acotado.

---

# 60. FUNCIONALIDAD ACTUAL MÍNIMA

La aplicación debe mantener:

## IFC

- [ ] Abrir IFC
- [ ] Procesar IFC
- [ ] Cargar modelo
- [ ] Fragments

## Viewer

- [ ] Three.js
- [ ] Scene
- [ ] Renderer
- [ ] Camera
- [ ] Selection
- [ ] Highlight

## BIM

- [ ] Spatial Tree
- [ ] Properties
- [ ] Models
- [ ] IFC entities

## Camera

- [ ] Fit
- [ ] Top
- [ ] Front
- [ ] Right
- [ ] 3D
- [ ] Orthographic
- [ ] Perspective

## Sections

- [ ] Add Plane
- [ ] Delete Plane
- [ ] Clear All
- [ ] Toggle Clipper

## Measurements

- [ ] New Dimension
- [ ] Delete Dimension
- [ ] Measure Mode

## UX

- [ ] Toolbar
- [ ] Tooltips
- [ ] Active states
- [ ] Disabled states
- [ ] Loading
- [ ] Errors
- [ ] Responsive behavior

## Datos

- [ ] Projects
- [ ] Models
- [ ] Scenes
- [ ] Hotspots
- [ ] Relaciones
- [ ] Eliminaciones

---

# 61. INVENTARIO AUTOMÁTICO

Antes de una migración grande, crear:

```text
FUNCTIONAL_INVENTORY.md
```

con:

```text
Función
Archivo
Componente
Dependencias
Estado
Problemas
Prueba
```

No crear este archivo repetidamente.

Actualizarlo cuando se agregue una función importante.

---

# 62. MATRIZ DE RIESGO

Para cambios importantes:

```text
Cambio
↓
Componentes afectados
↓
Riesgo
↓
Prueba necesaria
```

Ejemplo:

```text
Cambiar IFC loader
↓
ViewerCo
FragmentsManager
Properties
Spatial Tree
↓
ALTO
↓
Prueba IFC + selección + properties
```

---

# 63. OBJETIVO DE RENDIMIENTO

Optimizar en este orden:

```text
1. Evitar trabajo innecesario
2. Evitar datos duplicados
3. Evitar requests innecesarios
4. Evitar renders innecesarios
5. Liberar recursos
6. Procesar en background
7. Optimizar GPU
8. Optimizar algoritmos
```

No comenzar por micro-optimizaciones.

---

# 64. OBJETIVO DE UX

El usuario debe sentir:

```text
Abrir
 ↓
Procesar
 ↓
Visualizar
 ↓
Inspeccionar
 ↓
Medir
 ↓
Seccionar
 ↓
Navegar
```

sin bloqueos innecesarios ni estados confusos.

---

# 65. CRITERIO DE "100% FUNCIONAL"

No utilizar:

```text
"100% funcional"
```

solo porque:

```text
npm run build
```

pasa.

La aplicación solo puede considerarse funcional cuando las funciones relevantes fueron probadas.

Para IFC grande:

```text
IFC real
→ procesamiento real
→ Fragments real
→ Viewer real
```

Si no se probó el archivo de 3.70 GB:

```text
Validación 3.70 GB:
PENDIENTE
```

Nunca inventar resultados.

---

# 66. INFORME FINAL

Al finalizar una tarea importante, informar:

## Problema

Qué estaba fallando.

## Causa

Por qué ocurría.

## Solución

Qué se modificó.

## Archivos

Qué archivos fueron:

```text
creados
modificados
eliminados
```

## Validación

```text
TypeScript:
Build:
Lint:
Tests:
IFC:
Viewer:
```

## Pendientes

Solo si realmente existen.

---

# 67. NO COMMIT NI PUSH

Nunca ejecutar:

```bash
git commit
git push
```

sin autorización explícita.

---

# 68. REGLA DE SEGURIDAD

No eliminar archivos o código importante sin:

1. comprobar referencias;
2. comprobar imports;
3. comprobar rutas;
4. comprobar runtime;
5. comprobar que no se utiliza indirectamente.

---

# 69. PRINCIPIO DE MANTENIBILIDAD

Preferir:

```text
módulos pequeños
interfaces claras
responsabilidades únicas
tipado fuerte
logs útiles
errores explícitos
```

Evitar:

```text
mega-componentes
estado global innecesario
funciones gigantes
duplicación
magic strings
```

Pero no refactorizar todo únicamente por estética.

---

# 70. PRINCIPIO DE RENDIMIENTO

La aplicación debe hacer:

```text
menos trabajo
con menos memoria
con menos requests
con menos renders
con menos duplicación
```

No simplemente:

```text
usar más CPU
```

---

# 71. PRINCIPIO FINAL

Cada cambio debe responder:

```text
¿Hace la aplicación más correcta?
¿Hace la aplicación más estable?
¿Hace la aplicación más rápida?
¿Mantiene las funciones existentes?
¿Reduce complejidad o la justifica?
```

Si la respuesta es no:

no hacer el cambio.

---

# 72. FLUJO DE TRABAJO OBLIGATORIO

```text
1. Analizar el problema
        ↓
2. Revisar únicamente archivos relevantes
        ↓
3. Identificar causa
        ↓
4. Elegir solución
        ↓
5. Implementar
        ↓
6. Validar
        ↓
7. Medir si es necesario
        ↓
8. Corregir
        ↓
9. Validar nuevamente solo si hubo cambios
        ↓
10. Informar
```

No:

```text
explorar
→ explorar
→ explorar
→ explorar
```

---

# 73. OBJETIVO FINAL DE IFC-WEB

El resultado debe ser:

```text
                    IFC-WEB
                       │
        ┌──────────────┼──────────────┐
        │              │              │
       IFC           Viewer          BIM
        │              │              │
   Processing       Three.js      Spatial Tree
        │              │           Properties
   Fragments        Camera         Selection
        │              │           Highlight
        └──────────────┼──────────────┘
                       │
                BIM WORKSPACE
                       │
       ┌───────────────┼────────────────┐
       │               │                │
    Camera          Sections       Measurements
       │               │                │
       └───────────────┼────────────────┘
                       │
                 FAST + STABLE
```

La aplicación debe ser una plataforma BIM coherente, no una colección de funciones aisladas.

---

# 74. REGLA MÁS IMPORTANTE

**NO TE QUEDES INVESTIGANDO.**

Analiza lo necesario.

Toma una decisión técnica.

Implementa.

Valida.

Si funciona:

continúa.

Si falla:

diagnostica y corrige.

Si una investigación no cambia la implementación:

**NO LA HAGAS.**

Si una función existente funciona:

**NO LA REESCRIBAS SIN NECESIDAD.**

Si una solución rompe otra función:

**REVÍRTELA O CORRÍGELA.**

Si una prueba no fue ejecutada:

**NO DIGAS QUE PASÓ.**

Si el IFC de 3.70 GB no fue procesado realmente:

**NO DIGAS QUE YA ES COMPATIBLE CON 3.70 GB.**

---

# RESULTADO ESPERADO

IFC-WEB debe quedar como una aplicación BIM:

```text
EFICIENTE
ESTABLE
RÁPIDA
ESCALABLE
MANTENIBLE
PROFESIONAL
```

manteniendo las funciones existentes y evitando:

```text
consultas excesivas
scripts exploratorios innecesarios
duplicación de memoria
requests innecesarios
renders innecesarios
código duplicado
refactors no solicitados
falsos resultados
```
