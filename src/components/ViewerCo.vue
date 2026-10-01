<template>
    <!-- Technical BIM Loading HUD (Optimized for Heavy IFC / Fragments) -->
    <div v-if="isLoading" class="loading-overlay">
        <div class="bim-hud-card">
            <div class="hud-header">
                <div class="hud-title-wrap">
                    <span class="hud-icon">{{ isBackendProcessing ? '🚀' : '⚡' }}</span>
                    <div>
                        <h3 class="hud-title">{{ isBackendProcessing ? 'Microservicio Local • 64-bit BitSet' : 'Motor BIM • Carga de Alto Rendimiento' }}</h3>
                        <p class="hud-subtitle">{{ loadingSubtitle }}</p>
                    </div>
                </div>
                <div class="hud-badge" :class="{ 'backend-badge': isBackendProcessing }">
                    <span class="hud-pulse" :class="{ 'backend-pulse': isBackendProcessing }"></span>
                    <span>{{ isBackendProcessing ? 'NODE 64-BIT' : 'WASM 4GB' }}</span>
                </div>
            </div>

            <div class="hud-file-info">
                <div class="file-info-row">
                    <span class="file-name" :title="loadingFileName">{{ loadingFileName || 'Modelo BIM' }}</span>
                    <span v-if="loadingFileSize" class="file-size">{{ loadingFileSize }}</span>
                </div>
            </div>

            <div class="hud-progress-block">
                <div class="progress-labels">
                    <span class="stage-text">{{ loadingStage || loadingMessage }}</span>
                    <span class="percentage-text">{{ loadingProgress }}%</span>
                </div>
                <div class="progress-track">
                    <div
                        class="progress-fill"
                        :style="{ width: `${Math.min(Math.max(loadingProgress, 3), 100)}%` }"
                    ></div>
                </div>
            </div>

            <div class="hud-footer">
                <span class="hud-tech-note">Stream directo a memoria GPU • Sin duplicación en Heap JS</span>
            </div>
        </div>
    </div>

    <!-- Modal Informativo para Modelos IFC Masivos (> 1.85 GB) -->
    <div v-if="massiveModalVisible" class="loading-overlay" style="z-index: 100000;">
        <div class="bim-hud-card massive-modal-card">
            <div class="hud-header">
                <div class="hud-title-wrap">
                    <span class="hud-icon massive-icon">🚢</span>
                    <div>
                        <h3 class="hud-title">Modelo IFC Masivo Detectado</h3>
                        <p class="hud-subtitle">Límite físico de direccionamiento WebAssembly 32-bit</p>
                    </div>
                </div>
                <div class="hud-badge massive-badge">
                    <span>{{ massiveModelInfo.sizeGB }} GB</span>
                </div>
            </div>

            <div class="massive-modal-body">
                <p class="massive-text">
                    El archivo <strong>{{ massiveModelInfo.name }}</strong> ({{ massiveModelInfo.sizeGB }} GB) supera el límite de memoria direccionable de <strong>32 bits de WebAssembly</strong> (~1.85 GB) en navegadores web.
                </p>
                <p class="massive-text">
                    Para procesar este modelo naval gigantesco de forma 100% transparente en el visor, puedes iniciar el <strong>microservicio local de 64 bits</strong> (recomendado), o convertirlo manualmente:
                </p>

                <div class="terminal-command-box">
                    <div class="command-header">
                        <span>Opción A: Microservicio Local (Carga Automática en Web)</span>
                        <button class="copy-cmd-btn" type="button" @click="copyDevAllCommand">
                            {{ copiedDevAll ? '✓ Copiado' : 'Copiar comando' }}
                        </button>
                    </div>
                    <code class="command-code">npm run dev:all</code>
                </div>

                <div class="terminal-command-box" style="margin-top: 10px;">
                    <div class="command-header">
                        <span>Opción B: Conversor CLI Autónomo</span>
                        <button class="copy-cmd-btn" type="button" @click="copyCommand">
                            {{ copiedCommand ? '✓ Copiado' : 'Copiar comando' }}
                        </button>
                    </div>
                    <code class="command-code">{{ massiveModelInfo.command }}</code>
                </div>

                <div class="massive-hint-box">
                    <span>💡</span>
                    <p class="massive-hint">
                        <strong>Una vez iniciado <code>npm run dev:all</code>:</strong><br />
                        Vuelve a arrastrar el archivo IFC masivo. El microservicio lo procesará en streaming y lo inyectará directamente en la escena 3D sin crasheos de memoria.
                    </p>
                </div>
            </div>

            <div class="massive-modal-footer">
                <button class="retry-btn" type="button" @click="checkBackendAndRetry">
                    Comprobar microservicio
                </button>
                <button class="close-modal-btn" type="button" @click="massiveModalVisible = false">
                    Entendido
                </button>
            </div>
        </div>
    </div>

    <div
        ref="containerRef"
        class="full-screen"
        @dragover.prevent
        @drop.prevent="handleDrop"
    >
        <!-- Botón Flotante para Ver Registros de Errores y Diagnóstico -->
        <button
            class="log-trigger-btn"
            :class="{ 'has-errors': errorLogCount > 0 }"
            title="Abrir consola de errores y diagnósticos"
            type="button"
            @click="isLogModalOpen = true"
        >
            <span class="log-btn-icon">📋</span>
            <span class="log-btn-text">Ver Logs</span>
            <span v-if="errorLogCount > 0" class="log-btn-badge">{{ errorLogCount }}</span>
        </button>

        <!-- Pill de estado del microservicio 64-bit -->
        <div
            class="backend-status-pill"
            :class="{ 'is-online': backendStatus.online }"
            :title="backendStatus.online ? `Microservicio 64-bit conectado (RAM libre: ${backendStatus.freeMemoryGB} GB)` : 'Microservicio desconectado (ejecuta npm run dev:all o npm run server)'"
        >
            <span class="status-dot"></span>
            <span class="status-text">{{ backendStatus.online ? 'Backend 64-bit Activo' : 'Backend Offline' }}</span>
        </div>

        <bim-grid id="appGrid"></bim-grid>
        <input
            ref="ifcLoadInput"
            type="file"
            accept=".ifc"
            multiple
            style="display: none"
            @change="onIfcLoadSelected"
        />
        <input
            ref="ifcConvertInput"
            type="file"
            accept=".ifc"
            multiple
            style="display: none"
            @change="onIfcConvertSelected"
        />
        <input
            ref="fragInput"
            type="file"
            accept=".frag"
            multiple
            style="display: none"
            @change="onFragFileSelected"
        />
    </div>

    <!-- Modal de Consola y Logs de Errores -->
    <ErrorLogModal v-model="isLogModalOpen" />
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";
import * as BUIC from "@thatopen/ui-obc";
import * as OBCF from "@thatopen/components-front";
import { downloadFragmentFile, processIfcFile, MassiveIfcFileError, MAX_SAFE_BROWSER_IFC_SIZE } from "../services/ifc-processor";
import { checkBackendHealth, convertIfcViaBackend, type BackendHealth } from "../services/backend-client";
import ErrorLogModal from "./ErrorLogModal.vue";
import { appLogger } from "../services/logger";

const containerRef = ref<HTMLDivElement | null>(null);
const ifcLoadInput = ref<HTMLInputElement | null>(null);
const ifcConvertInput = ref<HTMLInputElement | null>(null);
const ifcInput = ifcLoadInput;
const fragInput = ref<HTMLInputElement | null>(null);

const isLogModalOpen = ref(false);
const errorLogCount = ref(0);

const openLogModal = () => {
    isLogModalOpen.value = true;
};

const updateErrorCount = () => {
    errorLogCount.value = appLogger.getErrorCount();
};

const isLoading = ref(false);
const loadingProgress = ref(0);
const loadingFileName = ref('');
const loadingFileSize = ref('');
const loadingStage = ref('Preparando procesador streaming...');
const loadingMessage = ref('Cargando');
const loadingSubtitle = ref('Procesamiento Zero-Copy vía Web Worker');
const panelVisible = ref(true);

const backendStatus = ref<BackendHealth>({ online: false });
const isBackendProcessing = ref(false);

const massiveModalVisible = ref(false);
const massiveModelInfo = ref({ name: '', sizeGB: '', command: '' });
const copiedCommand = ref(false);
const copiedDevAll = ref(false);

const copyCommand = async () => {
    try {
        await navigator.clipboard.writeText(massiveModelInfo.value.command);
        copiedCommand.value = true;
        setTimeout(() => {
            copiedCommand.value = false;
        }, 2500);
    } catch {
        copiedCommand.value = true;
        setTimeout(() => {
            copiedCommand.value = false;
        }, 2500);
    }
};

const copyDevAllCommand = async () => {
    try {
        await navigator.clipboard.writeText('npm run dev:all');
        copiedDevAll.value = true;
        setTimeout(() => {
            copiedDevAll.value = false;
        }, 2500);
    } catch {
        copiedDevAll.value = true;
        setTimeout(() => {
            copiedDevAll.value = false;
        }, 2500);
    }
};

const checkBackendAndRetry = async () => {
    const health = await checkBackendHealth();
    backendStatus.value = health;
    if (health.online) {
        massiveModalVisible.value = false;
        alert(`¡Microservicio detectado en línea! (Puerto ${health.port}, RAM libre: ${health.freeMemoryGB} GB). Ya puedes arrastrar o seleccionar tu modelo IFC masivo.`);
    } else {
        alert('Microservicio no detectado en http://localhost:3001. Recuerda ejecutar "npm run dev:all" o "npm run server" en tu terminal.');
    }
};

let panel: any;
let world: any;
let fragmentManager: OBC.FragmentsManager;
let lastFragmentBytes: Uint8Array | null = null;
let lastFragmentBuffers: Uint8Array[] = [];

onMounted(async () => {
    if (!containerRef.value) return;

    // Verificar disponibilidad del microservicio local y sondear periódicamente
    backendStatus.value = await checkBackendHealth();
    setInterval(async () => {
        backendStatus.value = await checkBackendHealth();
    }, 8000);

    // Inicializar contador de errores y suscribirse a nuevos eventos
    updateErrorCount();
    appLogger.subscribe(updateErrorCount);

    BUI.Manager.init();

    const components = new OBC.Components();
    const worlds = components.get(OBC.Worlds);
    world = worlds.create<
        OBC.SimpleScene,
        OBC.SimpleCamera,
        OBC.SimpleRenderer
    >();

    world.scene = new OBC.SimpleScene(components);
    world.scene.three.background = null;

    const viewport = document.createElement("bim-viewport");
    world.renderer = new OBC.SimpleRenderer(components, viewport);
    world.camera = new OBC.OrthoPerspectiveCamera(components);

    components.init();
    world.camera.controls.maxDistance = 10000000;
    world.camera.controls.minDistance = 0.01;
    world.camera.controls.setLookAt(-60, 30, -20, 0, 0, -20);
    world.scene.setup();

    const grids = components.get(OBC.Grids);
    grids.create(world);

    fragmentManager = components.get(OBC.FragmentsManager);
    fragmentManager.init("/worker.mjs");

    world.camera.controls.addEventListener("rest", () =>
        fragmentManager.core.update(true)
    );

    // Al cargar cualquier modelo fragmentado, vincular a la escena y enfocar la cámara
    fragmentManager.list.onItemSet.add(async ({ value: model }) => {
        model.useCamera(world.camera.three);
        world.scene.three.add(model.object);
        await fragmentManager.core.update(true);

        setTimeout(async () => {
            await fitCameraToModels(model);
        }, 150);
    });

    const [modelsList] = BUIC.tables.modelsList({
        components,
        metaDataTags: ["schema"],
        actions: { download: true },
    });

    const [spatialTree] = BUIC.tables.spatialTree({
        components,
        models: [],
    });

    const [propertiesTable, updatePropertiesTable] = BUIC.tables.itemsData({
        components,
        modelIdMap: {},
    });

    const highlighter = components.get(OBCF.Highlighter);
    highlighter.setup({ world });

    highlighter.events.select.onHighlight.add((modelIdMap) => {
        updatePropertiesTable({ modelIdMap });
    });

    highlighter.events.select.onClear.add(() =>
        updatePropertiesTable({ modelIdMap: {} })
    );

    propertiesTable.preserveStructureOnFilter = true;
    propertiesTable.indentationInText = false;

    // Panel UI
    panel = BUI.Component.create(() => {
        const [loadFragBtn] = BUIC.buttons.loadFrag({ components, world });

        const onSearchSpatialTree = (e: Event) => {
            const input = e.target as BUI.TextInput;
            spatialTree.queryString = input.value;
        };

        const onTextInput = (e: Event) => {
            const input = e.target as BUI.TextInput;
            propertiesTable.queryString = input.value !== "" ? input.value : null;
        };

        return BUI.html`
            <bim-panel label="IFC / FRAG Engine">
                <bim-panel-section label="Gestión de Archivos">
                    <bim-button label="Cargar Archivo(s) IFC" icon="material-symbols:file-open" @click=${openIfcLoadDialog}></bim-button>
                    <bim-button label="Cargar Archivo(s) .FRAG" icon="mage:box-3d-fill" @click=${openFragDialog}></bim-button>
                    <bim-button label="Convertir IFC a .FRAG" icon="material-symbols:transform" @click=${openIfcConvertDialog}></bim-button>
                    <bim-button label="Guardar .FRAG Actual" icon="flowbite:download-solid" @click=${downloadCurrentFrag}></bim-button>
                    <bim-button label="Enfocar Barco (Zoom Todo)" icon="material-symbols:fit-screen" @click=${() => fitCameraToModels()}></bim-button>
                    <bim-button label="Ver Consola / Logs de Errores" icon="material-symbols:terminal" @click=${openLogModal}></bim-button>
                    <bim-text-input @input=${onSearchSpatialTree} placeholder="Buscar en Árbol..." debounce="200"></bim-text-input>
                    ${spatialTree}
                </bim-panel-section>
                <bim-panel-section icon="mage:box-3d-fill" label="Modelos Cargados">
                    ${modelsList}
                </bim-panel-section>
                <bim-panel-section label="Propiedades">
                    <bim-text-input @input=${onTextInput} placeholder="Buscar propiedad..." debounce="200"></bim-text-input>
                    ${propertiesTable}
                </bim-panel-section>
            </bim-panel>
        `;
    });

    const app = document.getElementById("appGrid") as BUI.Grid<["main"]>;
    app.layouts = {
        main: {
            template: `
            "panel viewport"
            / 23rem 1fr
            `,
            elements: { panel, viewport },
        },
    };

    app.layout = "main";
});

const fitCameraToModels = async (targetModel?: any) => {
    if (!world?.camera?.controls) return;

    const controls = world.camera.controls;
    controls.maxDistance = 10000000;
    controls.minDistance = 0.01;

    try {
        await fragmentManager.core.update(true);
    } catch {}

    const combinedBox = new THREE.Box3();
    const models = targetModel ? [targetModel] : Array.from(fragmentManager.list.values());
    if (models.length === 0) return;

    for (const m of models as any[]) {
        if (!m?.object) continue;
        m.object.updateMatrixWorld(true);

        let box: THREE.Box3 | null = null;
        try {
            if (m.box && !m.box.isEmpty()) {
                box = m.box;
            }
        } catch {}

        if (!box || box.isEmpty()) {
            try {
                const computed = new THREE.Box3().setFromObject(m.object);
                if (!computed.isEmpty()) {
                    box = computed;
                }
            } catch {}
        }

        if (!box || box.isEmpty()) {
            try {
                const boxes = await m.getBoxes();
                if (boxes && boxes.length > 0) {
                    box = new THREE.Box3();
                    for (const b of boxes) {
                        box.union(b);
                    }
                }
            } catch {}
        }

        if (box && !box.isEmpty()) {
            combinedBox.union(box);
        }
    }

    if (combinedBox.isEmpty()) {
        console.warn("[Viewer] No se pudo determinar el bounding box del modelo para encuadrar.");
        return;
    }

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    combinedBox.getCenter(center);
    combinedBox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);

    console.log(
        `[Viewer] Bounding Box detectado: centro=(${center.x.toFixed(1)}, ${center.y.toFixed(1)}, ${center.z.toFixed(1)}), dimensiones=(${size.x.toFixed(1)}, ${size.y.toFixed(1)}, ${size.z.toFixed(1)}), maxDim=${maxDim.toFixed(1)}`
    );

    const farDistance = Math.max(500000, maxDim * 25);
    const nearDistance = Math.max(0.01, Math.min(1, maxDim / 10000));

    if (world.camera.threePersp) {
        world.camera.threePersp.far = farDistance;
        world.camera.threePersp.near = nearDistance;
        world.camera.threePersp.updateProjectionMatrix();
    }
    if (world.camera.threeOrtho) {
        world.camera.threeOrtho.far = farDistance;
        world.camera.threeOrtho.near = -farDistance;
        world.camera.threeOrtho.updateProjectionMatrix();
    }

    controls.truckSpeed = Math.max(2, maxDim / 100);

    try {
        await controls.fitToBox(combinedBox, true, {
            paddingLeft: 0.1,
            paddingRight: 0.1,
            paddingTop: 0.1,
            paddingBottom: 0.1,
        });
    } catch {
        const fitDistance = maxDim * 1.5;
        await controls.setLookAt(
            center.x - fitDistance * 0.7,
            center.y + fitDistance * 0.5,
            center.z - fitDistance * 0.7,
            center.x,
            center.y,
            center.z,
            true
        );
    }

    try {
        await fragmentManager.core.update(true);
    } catch {}
};

const openIfcLoadDialog = () => ifcLoadInput.value?.click();
const openIfcConvertDialog = () => ifcConvertInput.value?.click();
const openIfcDialog = openIfcLoadDialog;
const openFragDialog = () => fragInput.value?.click();

const onIfcLoadSelected = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    if (files.length === 0) return;
    await processMultipleIfcFiles(files, false);
    input.value = '';
};

const onIfcConvertSelected = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    if (files.length === 0) return;
    await processMultipleIfcFiles(files, true);
    input.value = '';
};

const onIfcFileSelected = onIfcLoadSelected;

const onFragFileSelected = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    if (files.length === 0) return;
    await loadMultipleFragFiles(files);
    input.value = '';
};

const handleDrop = async (e: DragEvent) => {
    const fileList = e.dataTransfer?.files;
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    const fragFiles = files.filter((f) => f.name.toLowerCase().endsWith('.frag'));
    const ifcFiles = files.filter((f) => f.name.toLowerCase().endsWith('.ifc'));

    if (fragFiles.length === 0 && ifcFiles.length === 0) {
        alert('Por favor arrastra uno o varios archivos .ifc o .frag válidos.');
        return;
    }

    if (fragFiles.length > 0) {
        await loadMultipleFragFiles(fragFiles);
    }

    if (ifcFiles.length > 0) {
        await processMultipleIfcFiles(ifcFiles, false);
    }
};

const loadMultipleFragFiles = async (files: File[]) => {
    isLoading.value = true;
    loadingProgress.value = 0;

    try {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const prefix = files.length > 1 ? `[${i + 1}/${files.length}] ` : '';
            loadingMessage.value = `${prefix}Cargando .FRAG`;
            loadingFileName.value = file.name;
            loadingFileSize.value = `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
            loadingStage.value = 'Leyendo buffer de archivo .frag...';
            loadingProgress.value = Math.round((i / files.length) * 100);

            const buffer = await file.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            lastFragmentBytes = bytes;

            loadingStage.value = 'Inicializando geometría en GPU...';
            const cleanModelId = file.name.replace(/\.frag$/i, '');
            try {
                // Probar primero carga con descompresión estándar
                await fragmentManager.core.load(bytes, { modelId: cleanModelId, raw: false });
            } catch {
                // Si el archivo fue guardado sin compresión (raw flatbuffer), cargar con raw=true
                await fragmentManager.core.load(bytes, { modelId: cleanModelId, raw: true });
            }
            console.log(`[FRAG] Modelo cargado (${i + 1}/${files.length}): ${file.name}`);
        }

        loadingProgress.value = 100;
        loadingStage.value = 'Encuadrando vista de cámara...';
        setTimeout(async () => {
            await fitCameraToModels();
        }, 150);
    } catch (err) {
        console.error("[FRAG] Error al cargar:", err);
        alert(`Error al cargar el archivo .frag: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
        isLoading.value = false;
    }
};

const loadFragFile = async (file: File) => {
    await loadMultipleFragFiles([file]);
};

const processMultipleIfcFiles = async (files: File[], autoDownloadFrag: boolean = false) => {
    isLoading.value = true;
    loadingProgress.value = 0;

    try {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            // Detección proactiva de modelos masivos que exceden el límite de WebAssembly en el navegador
            if (file.size > MAX_SAFE_BROWSER_IFC_SIZE) {
                // Verificar si el microservicio de 64 bits está en línea
                const health = await checkBackendHealth();
                backendStatus.value = health;

                if (health.online) {
                    isBackendProcessing.value = true;
                    loadingFileName.value = file.name;
                    loadingFileSize.value = `${(file.size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
                    loadingMessage.value = 'Microservicio Local • 64-bit BitSet';
                    loadingSubtitle.value = `Node.js 64-bit (RAM libre: ${health.freeMemoryGB || 16} GB)`;
                    loadingProgress.value = 0;
                    loadingStage.value = 'Iniciando subida en streaming al microservicio local...';

                    try {
                        const result = await convertIfcViaBackend(file, (progress) => {
                            loadingProgress.value = progress.percent;
                            loadingStage.value = progress.stage;
                            if (progress.elapsed) {
                                loadingMessage.value = `Microservicio Local (${progress.elapsed})`;
                            }
                        });

                        lastFragmentBuffers = result.fragmentBuffers;
                        lastFragmentBytes = result.fragmentBuffers[0] || null;

                        for (let partIdx = 0; partIdx < result.fragmentBuffers.length; partIdx++) {
                            const partBuffer = result.fragmentBuffers[partIdx];
                            const partName = result.parts[partIdx] || `Part${partIdx + 1}.frag`;
                            loadingStage.value = `Inyectando en GPU: ${partName} (${partIdx + 1}/${result.fragmentBuffers.length})...`;

                            const cleanModelId = partName.replace(/\.frag$/i, '');
                            try {
                                await fragmentManager.core.load(partBuffer, { modelId: cleanModelId, raw: false });
                            } catch {
                                await fragmentManager.core.load(partBuffer, { modelId: cleanModelId, raw: true });
                            }
                            console.log(`[Backend] Modelo fragmentado inyectado en escena 3D: ${partName}`);

                            if (autoDownloadFrag) {
                                downloadFragmentFile(partBuffer, partName);
                            }
                        }

                        loadingProgress.value = 100;
                        loadingStage.value = 'Encuadrando vista de cámara...';
                        setTimeout(async () => {
                            await fitCameraToModels();
                        }, 200);

                        continue; // Archivo masivo procesado exitosamente
                    } catch (backendErr: any) {
                        console.error("Error en microservicio backend:", backendErr);
                        alert(`Error en conversión vía microservicio local: ${backendErr.message}`);
                    } finally {
                        isBackendProcessing.value = false;
                        loadingSubtitle.value = 'Procesamiento Zero-Copy vía Web Worker';
                    }
                } else {
                    isLoading.value = false;
                    massiveModelInfo.value = {
                        name: file.name,
                        sizeGB: (file.size / (1024 * 1024 * 1024)).toFixed(2),
                        command: `npm run convert -- "${file.name}"`,
                    };
                    massiveModalVisible.value = true;
                    return;
                }
            }

            const prefix = files.length > 1 ? `[${i + 1}/${files.length}] ` : '';
            loadingMessage.value = `${prefix}Procesando IFC`;
            loadingFileName.value = file.name;
            loadingFileSize.value = `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
            loadingStage.value = 'Iniciando Web Worker streaming (FileReaderSync Zero-Copy)...';
            loadingProgress.value = 0;

            const generated = await processIfcFile(file, {
                wasmPath: "/",
                raw: true,
                onProgress: (progress: number, detail?: any) => {
                    loadingProgress.value = progress;
                    if (detail?.stage) {
                        loadingMessage.value = `[Fase ${detail.stage}/${detail.totalStages || 2}] Procesando IFC`;
                    }
                    if (detail?.process === 'geometries') {
                        loadingStage.value = detail.class
                            ? `Geometría: ${detail.class} (${detail.entitiesProcessed || 0} elem.)`
                            : 'Extrayendo mallas y geometrías 3D...';
                    } else if (detail?.process === 'attributes') {
                        loadingStage.value = detail.class
                            ? `Propiedades BIM: ${detail.class}`
                            : 'Indexando propiedades y tipos...';
                    } else if (detail?.process === 'relations') {
                        loadingStage.value = 'Mapeando relaciones espaciales...';
                    } else if (progress >= 90) {
                        loadingStage.value = 'Construyendo buffer FlatBuffer optimizado...';
                    }
                },
            });

            const fragmentArray = Array.isArray(generated) ? generated : [generated];
            lastFragmentBuffers = fragmentArray;
            lastFragmentBytes = fragmentArray[0];

            for (let partIdx = 0; partIdx < fragmentArray.length; partIdx++) {
                const fragmentBytes = fragmentArray[partIdx];
                const partSuffix = fragmentArray.length > 1 ? `_part${partIdx + 1}` : '';
                const fragFileName = file.name.replace(/\.ifc$/i, '') + partSuffix + '.frag';

                // Si autoDownloadFrag es true, descargar automáticamente el archivo .frag
                if (autoDownloadFrag) {
                    downloadFragmentFile(fragmentBytes, fragFileName);
                    console.log(`[IFC] Archivo .frag descargado automáticamente: ${fragFileName}`);
                }

                // Carga directa en el visor para visualización inmediata en 3D (Zero-Copy)
                const partLabel = fragmentArray.length > 1 ? ` (${partIdx + 1}/${fragmentArray.length})` : '';
                loadingStage.value = `Cargando Fragments en GPU${partLabel}...`;
                const cleanModelId = fragFileName.replace(/\.frag$/i, '');
                await fragmentManager.core.load(fragmentBytes, { modelId: cleanModelId, raw: true });
                console.log(`[IFC] Modelo renderizado en escena: ${fragFileName}`);
            }
        }

        loadingProgress.value = 100;
        loadingStage.value = 'Encuadrando vista de cámara...';
        setTimeout(async () => {
            await fitCameraToModels();
        }, 200);
    } catch (err) {
        console.error("IFC conversion failed:", err);
        if (err instanceof MassiveIfcFileError || (err instanceof Error && err.name === 'MassiveIfcFileError')) {
            massiveModelInfo.value = {
                name: (err as any).fileName || loadingFileName.value || 'Modelo IFC',
                sizeGB: (err as any).fileSizeGB || loadingFileSize.value || '',
                command: `npm run convert -- "${(err as any).fileName || loadingFileName.value || 'modelo.ifc'}"`,
            };
            massiveModalVisible.value = true;
        } else {
            alert(`Fallo en el procesamiento del IFC: ${err instanceof Error ? err.message : String(err)}`);
        }
    } finally {
        isLoading.value = false;
    }
};

const processAndConvertIfc = async (file: File) => {
    await processMultipleIfcFiles([file], true);
};

const downloadCurrentFrag = async () => {
    if (lastFragmentBuffers.length > 0) {
        for (let i = 0; i < lastFragmentBuffers.length; i++) {
            const buf = lastFragmentBuffers[i];
            const partSuffix = lastFragmentBuffers.length > 1 ? `_part${i + 1}` : '';
            const baseName = (loadingFileName.value || 'modelo').replace(/\.ifc$/i, '').replace(/\.frag$/i, '');
            downloadFragmentFile(buf, `${baseName}${partSuffix}.frag`);
        }
        return;
    }

    if (lastFragmentBytes) {
        const baseName = (loadingFileName.value || 'modelo').replace(/\.ifc$/i, '').replace(/\.frag$/i, '');
        downloadFragmentFile(lastFragmentBytes, `${baseName}.frag`);
        return;
    }

    // Si hay algún modelo actualmente cargado en el administrador
    for (const [id, model] of fragmentManager.list) {
        try {
            const buffer = await model.getBuffer(false);
            const cleanId = id.replace(/\.ifc$/i, '').replace(/\.frag$/i, '');
            downloadFragmentFile(new Uint8Array(buffer), `${cleanId}.frag`);
            return;
        } catch (e) {
            console.error("Error al exportar buffer del modelo:", e);
        }
    }

    alert("No hay ningún modelo fragment cargado actualmente para guardar.");
};

function togglePanel() {
    panelVisible.value = !panelVisible.value;
    panel.hidden = panelVisible.value;
}
</script>

<style scoped>
.loading-overlay {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  background: radial-gradient(circle at 50% 40%, rgba(15, 23, 42, 0.88), rgba(2, 6, 23, 0.96));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: all;
  padding: 16px;
  box-sizing: border-box;
}

.bim-hud-card {
  width: min(92vw, 440px);
  background: #0f172a;
  border: 1px solid rgba(56, 189, 248, 0.25);
  border-radius: 14px;
  padding: 24px 28px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 35px rgba(2, 132, 199, 0.12);
  color: #f8fafc;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  box-sizing: border-box;
}

.hud-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding-bottom: 14px;
}

.hud-title-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}

.hud-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.3);
  font-size: 16px;
}

.hud-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: #f8fafc;
  margin: 0;
  line-height: 1.25;
}

.hud-subtitle {
  font-size: 0.75rem;
  color: #94a3b8;
  margin: 2px 0 0 0;
}

.hud-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.25);
  border-radius: 20px;
  font-size: 0.7rem;
  font-weight: 600;
  color: #38bdf8;
  letter-spacing: 0.03em;
}

.hud-pulse {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #38bdf8;
  box-shadow: 0 0 8px #38bdf8;
  animation: hud-blink 1.4s ease-in-out infinite alternate;
}

@keyframes hud-blink {
  from { opacity: 0.4; }
  to { opacity: 1; }
}

.hud-file-info {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 18px;
}

.file-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.file-name {
  font-size: 0.85rem;
  font-weight: 500;
  color: #e2e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 280px;
}

.file-size {
  font-size: 0.75rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  background: rgba(56, 189, 248, 0.12);
  color: #7dd3fc;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.hud-progress-block {
  margin-bottom: 16px;
}

.progress-labels {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
  gap: 8px;
}

.stage-text {
  font-size: 0.8rem;
  color: #94a3b8;
  font-weight: 400;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 320px;
}

.percentage-text {
  font-size: 1.15rem;
  font-weight: 700;
  color: #38bdf8;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.progress-track {
  height: 6px;
  width: 100%;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  overflow: hidden;
  position: relative;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #0284c7 0%, #38bdf8 100%);
  border-radius: 999px;
  transition: width 0.18s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.6);
}

.hud-footer {
  text-align: center;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding-top: 12px;
}

.hud-tech-note {
  font-size: 0.7rem;
  color: #64748b;
  letter-spacing: 0.02em;
}

.corner-logo {
  position: fixed;
  bottom: 32px;
  right: 32px;
  border-radius: 5px;
  height: 64px;
  width: 64px;
  z-index: 1001;
  opacity: 1;
}

.corner-logo img {
  height: 100%;
  border-radius: 5px;
  transition: all 0.3s ease;
  position: absolute;
  width: auto;
}

.app-logo {
  opacity: 1;
}

.toggle-panel-button {
  position: fixed;
  top: 32px;
  left: 32px;
  border: none;
  border-radius: 8px;
  box-shadow: 0 0 8px rgba(0, 0, 0, 0.15);
  z-index: 2000;
  display: none;
}

@media (max-width: 768px) {
  .toggle-panel-button {
    display: block;
  }
}

/* Modal Masivo IFC */
.massive-modal-card {
  width: min(94vw, 560px);
  border-color: rgba(56, 189, 248, 0.4);
}

.massive-icon {
  background: rgba(14, 165, 233, 0.15) !important;
  border-color: rgba(56, 189, 248, 0.4) !important;
}

.massive-badge {
  background: rgba(239, 68, 68, 0.15) !important;
  border-color: rgba(239, 68, 68, 0.4) !important;
  color: #fca5a5 !important;
}

.massive-modal-body {
  margin: 16px 0 20px 0;
}

.massive-text {
  font-size: 0.88rem;
  line-height: 1.55;
  color: #cbd5e1;
  margin: 0 0 12px 0;
}

.massive-text strong {
  color: #f8fafc;
}

.terminal-command-box {
  background: #020617;
  border: 1px solid rgba(56, 189, 248, 0.25);
  border-radius: 8px;
  padding: 10px 14px;
  margin: 14px 0;
}

.command-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 0.72rem;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}

.copy-cmd-btn {
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.35);
  color: #38bdf8;
  border-radius: 4px;
  padding: 3px 10px;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.copy-cmd-btn:hover {
  background: rgba(56, 189, 248, 0.25);
  border-color: #38bdf8;
  color: #ffffff;
}

.command-code {
  display: block;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.82rem;
  color: #38bdf8;
  word-break: break-all;
  user-select: all;
}

.massive-hint-box {
  display: flex;
  gap: 10px;
  background: rgba(56, 189, 248, 0.06);
  border: 1px solid rgba(56, 189, 248, 0.15);
  border-radius: 8px;
  padding: 10px 12px;
  margin-top: 14px;
}

.massive-hint-box span {
  font-size: 1.1rem;
}

.massive-hint {
  font-size: 0.78rem;
  line-height: 1.45;
  color: #94a3b8;
  margin: 0;
}

.massive-hint code {
  color: #38bdf8;
  background: rgba(2, 132, 199, 0.15);
  padding: 1px 4px;
  border-radius: 3px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.massive-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 16px;
}

.retry-btn {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #e2e8f0;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.retry-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.3);
  color: #ffffff;
}

.close-modal-btn {
  background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
  border: 1px solid rgba(56, 189, 248, 0.4);
  color: #f8fafc;
  padding: 8px 22px;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3);
}

.close-modal-btn:hover {
  background: linear-gradient(135deg, #0369a1 0%, #0284c7 100%);
  border-color: #38bdf8;
}

.backend-badge {
  background: rgba(34, 197, 94, 0.12) !important;
  border-color: rgba(34, 197, 94, 0.35) !important;
  color: #4ade80 !important;
}

.backend-pulse {
  background: #22c55e !important;
  box-shadow: 0 0 8px #22c55e !important;
}

.backend-status-pill {
  position: absolute;
  top: 14px;
  right: 18px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 7px;
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(239, 68, 68, 0.3);
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 0.72rem;
  font-weight: 600;
  color: #fca5a5;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  transition: all 0.3s ease;
  pointer-events: all;
  user-select: none;
}

.backend-status-pill.is-online {
  border-color: rgba(34, 197, 94, 0.4);
  color: #86efac;
  background: rgba(15, 23, 42, 0.85);
}

.backend-status-pill .status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ef4444;
  box-shadow: 0 0 6px #ef4444;
  transition: all 0.3s ease;
}

.backend-status-pill.is-online .status-dot {
  background: #22c55e;
  box-shadow: 0 0 8px #22c55e;
  animation: hud-blink 1.5s ease-in-out infinite alternate;
}

.log-trigger-btn {
  position: absolute;
  top: 14px;
  right: 215px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 7px;
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(56, 189, 248, 0.35);
  padding: 5px 14px;
  border-radius: 20px;
  font-size: 0.74rem;
  font-weight: 600;
  color: #38bdf8;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
  transition: all 0.25s ease;
  pointer-events: all;
  user-select: none;
}

.log-trigger-btn:hover {
  background: rgba(2, 132, 199, 0.25);
  border-color: #38bdf8;
  color: #ffffff;
  transform: translateY(-1px);
}

.log-trigger-btn.has-errors {
  border-color: rgba(239, 68, 68, 0.55);
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.15);
}

.log-trigger-btn.has-errors:hover {
  background: rgba(239, 68, 68, 0.25);
  border-color: #f87171;
}

.log-btn-icon {
  font-size: 0.85rem;
}

.log-btn-text {
  letter-spacing: 0.02em;
}

.log-btn-badge {
  background: #dc2626;
  color: #ffffff;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 10px;
  box-shadow: 0 0 8px rgba(220, 38, 38, 0.8);
}
</style>
