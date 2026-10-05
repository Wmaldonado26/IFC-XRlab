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
        <!-- Barra superior derecha con Estado de Usuario y Microservicio -->
        <div class="top-status-bar">
            <!-- Botón para volver a la Galería Principal de Proyectos -->
            <button
                type="button"
                class="auth-action-btn gallery-nav-btn"
                title="Volver a la Galería Principal de Proyectos"
                @click="$emit('return-gallery')"
            >
                📁 Galería
            </button>

            <!-- Pill de Autenticación y Rol -->
            <div class="user-auth-pill">
                <template v-if="currentUser">
                    <div class="user-badge" :title="`Sesión activa: ${currentUser.email}`">
                        <span class="user-role-dot" :class="currentUser.role"></span>
                        <span class="user-name-text">{{ currentUser.name }}</span>
                        <span class="user-role-tag" :class="currentUser.role">{{ currentUser.role === 'admin' ? 'Admin' : 'Usuario' }}</span>
                    </div>
                    <button
                        v-if="isAdmin"
                        type="button"
                        class="auth-action-btn admin-btn"
                        title="Abrir Panel de Administración"
                        @click="isAdminModalOpen = true"
                    >
                        🛡️ Admin
                    </button>
                    <button
                        type="button"
                        class="auth-action-btn logout-btn"
                        title="Cerrar sesión"
                        @click="handleLogout"
                    >
                        Salir
                    </button>
                </template>
                <template v-else>
                    <button
                        type="button"
                        class="auth-action-btn login-btn"
                        title="Iniciar sesión en IFC-XRlab"
                        @click="isLoginModalOpen = true"
                    >
                        🔐 Iniciar Sesión
                    </button>
                </template>
            </div>

            <!-- Pill de estado del microservicio 64-bit -->
            <div
                class="backend-status-pill"
                :class="{ 'is-online': backendStatus.online }"
                :title="backendStatus.online ? `Microservicio 64-bit conectado (RAM libre: ${backendStatus.freeMemoryGB} GB)` : 'Microservicio desconectado (ejecuta npm run dev:all o npm run server)'"
            >
                <span class="status-dot"></span>
                <span class="status-text">{{ backendStatus.online ? 'Backend 64-bit Activo' : 'Backend Offline' }}</span>
            </div>
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

        <!-- Barra flotante de control de planos de sección 3D -->
        <SectionPlaneBar
            v-if="isSectionActive"
            :axis="clipAxis"
            :offset="clipOffset"
            :inverted="clipInverted"
            :min="clipBounds.min"
            :max="clipBounds.max"
            @update:axis="onUpdateClipAxis"
            @update:offset="onUpdateClipOffset"
            @update:inverted="onUpdateClipInverted"
            @close="isSectionActive = false"
        />

        <!-- Botón Plegable Flotante para el Menú Lateral (class parent) -->
        <button
            class="panel-toggle-tab"
            :class="{ 'is-collapsed': isPanelCollapsed }"
            :title="isPanelCollapsed ? 'Mostrar menú lateral (Árbol y Propiedades) [P]' : 'Ocultar menú lateral [P]'"
            type="button"
            @click="togglePanel"
        >
            <span class="toggle-icon">{{ isPanelCollapsed ? '▶' : '◀' }}</span>
            <span v-if="isPanelCollapsed" class="toggle-label">Menú BIM</span>
        </button>

        <!-- Dock Flotante de Herramientas del Visor -->
        <ViewerToolbar
            :is-section-active="isSectionActive"
            @open-ifc="openIfcLoadDialog"
            @open-frag="openFragDialog"
            @toggle-section="isSectionActive = !isSectionActive"
            @set-camera-view="setCameraPreset"
            @open-projects="isProjectsModalOpen = true"
            @clear-scene="clearScene"
        />
    </div>

    <!-- Modal de Catálogo de Proyectos y Caché Local -->
    <ProjectsModal
        v-model="isProjectsModalOpen"
        @load-cached="loadCachedModel"
        @load-backend="loadBackendProject"
        @load-model="loadBackendModel"
    />

    <!-- Modal de Consola y Logs de Errores -->
    <ErrorLogModal v-model="isLogModalOpen" />

    <!-- Modal de Inicio de Sesión -->
    <LoginModal
        v-model="isLoginModalOpen"
        @login-success="onLoginSuccess"
    />

    <!-- Modal de Administración de Usuarios -->
    <AdminPanelModal
        v-if="isAdmin"
        v-model="isAdminModalOpen"
    />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch, nextTick } from "vue";
import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";
import * as BUIC from "@thatopen/ui-obc";
import * as OBCF from "@thatopen/components-front";
import { downloadFragmentFile, processIfcFile, MassiveIfcFileError, MAX_SAFE_BROWSER_IFC_SIZE } from "../services/ifc-processor";
import {
    checkBackendHealth,
    convertIfcViaBackend,
    downloadBackendFragments,
    downloadModelFragment,
    uploadDirectFrag,
    type BackendHealth,
    type BackendProject,
    type BackendModelItem,
} from "../services/backend-client";
import { saveProjectFragments, getProjectFragments, appendProjectFragments, deleteCachedProject } from "../services/frag-cache";
import ErrorLogModal from "./ErrorLogModal.vue";
import SectionPlaneBar from "./SectionPlaneBar.vue";
import ViewerToolbar from "./ViewerToolbar.vue";
import ProjectsModal from "./ProjectsModal.vue";
import LoginModal from "./LoginModal.vue";
import AdminPanelModal from "./AdminPanelModal.vue";
import {
    currentUser,
    isAdmin,
    checkSession,
    logout,
} from "../services/auth-service";
import { appLogger } from "../services/logger";

const props = defineProps<{
    initialProject?: BackendProject | null;
}>();

const emit = defineEmits<{
    (e: 'return-gallery'): void;
    (e: 'project-changed', project: BackendProject): void;
}>();

// Estado de UI de Herramientas y Modales
const isSectionActive = ref(false);
const isProjectsModalOpen = ref(false);
const isLoginModalOpen = ref(false);
const isAdminModalOpen = ref(false);
const isPanelCollapsed = ref(false);
const clipAxis = ref<'x' | 'y' | 'z'>('y');
const clipOffset = ref(0);
const clipInverted = ref(false);

const modelBounds = ref<{
    min: [number, number, number];
    max: [number, number, number];
    center: [number, number, number];
    size: [number, number, number];
}>({
    min: [-100, -20, -100],
    max: [100, 50, 100],
    center: [0, 15, 0],
    size: [200, 70, 200],
});

const clipBounds = computed(() => {
    const idx = clipAxis.value === 'x' ? 0 : clipAxis.value === 'y' ? 1 : 2;
    return {
        min: modelBounds.value.min[idx],
        max: modelBounds.value.max[idx],
    };
});

// --- Sistema de Navegación Espacial en Primera Persona (WASD + Q/E) ---
const activeKeys = new Set<string>();
let wasdFrameId: number | null = null;
let lastWasdTime = performance.now();
const isWasdActive = ref(false);

const handleKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
    }
    const key = e.key.toLowerCase();
    if (key === 'p') {
        togglePanel();
        return;
    }
    if (['w', 'a', 's', 'd', 'q', 'e', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        activeKeys.add(key);
        isWasdActive.value = true;
    }
};

const handleKeyUp = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    activeKeys.delete(key);
    if (activeKeys.size === 0) {
        isWasdActive.value = false;
    }
};

const handleWindowBlur = () => {
    activeKeys.clear();
    isWasdActive.value = false;
};

const startWasdLoop = () => {
    lastWasdTime = performance.now();

    const loop = () => {
        const now = performance.now();
        const delta = Math.min((now - lastWasdTime) / 1000, 0.1);
        lastWasdTime = now;

        if (activeKeys.size > 0 && world?.camera?.controls) {
            const controls = world.camera.controls as any;

            // Escala de velocidad inteligente basada en las dimensiones reales del modelo
            const modelDim = Math.max(modelBounds.value?.size?.[0] || 50, modelBounds.value?.size?.[1] || 20, 20);
            const baseSpeed = Math.max(8, modelDim * 0.15);
            const speedMultiplier = activeKeys.has('shift') ? 2.8 : 1.0;
            const dist = baseSpeed * speedMultiplier * delta;

            // W / Flecha Arriba: Avanzar hacia adelante en la dirección de la cámara
            if (activeKeys.has('w') || activeKeys.has('arrowup')) {
                if (typeof controls.forward === 'function') {
                    controls.forward(dist, false);
                } else if (typeof controls.dolly === 'function') {
                    controls.dolly(dist, false);
                }
            }

            // S / Flecha Abajo: Retroceder
            if (activeKeys.has('s') || activeKeys.has('arrowdown')) {
                if (typeof controls.forward === 'function') {
                    controls.forward(-dist, false);
                } else if (typeof controls.dolly === 'function') {
                    controls.dolly(-dist, false);
                }
            }

            // A / Flecha Izquierda: Desplazamiento lateral (Strafe Left)
            if (activeKeys.has('a') || activeKeys.has('arrowleft')) {
                if (typeof controls.truck === 'function') {
                    controls.truck(-dist, 0, false);
                }
            }

            // D / Flecha Derecha: Desplazamiento lateral (Strafe Right)
            if (activeKeys.has('d') || activeKeys.has('arrowright')) {
                if (typeof controls.truck === 'function') {
                    controls.truck(dist, 0, false);
                }
            }

            // E: Subir de nivel / ascender cubierta
            if (activeKeys.has('e')) {
                if (typeof controls.elevate === 'function') {
                    controls.elevate(dist, false);
                } else if (typeof controls.truck === 'function') {
                    controls.truck(0, dist, false);
                }
            }

            // Q: Bajar de nivel / descender cubierta
            if (activeKeys.has('q')) {
                if (typeof controls.elevate === 'function') {
                    controls.elevate(-dist, false);
                } else if (typeof controls.truck === 'function') {
                    controls.truck(0, -dist, false);
                }
            }
        }

        wasdFrameId = requestAnimationFrame(loop);
    };

    wasdFrameId = requestAnimationFrame(loop);
};

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

let highlighter: OBCF.Highlighter | null = null;
let updatePropertiesTable: ((state?: any) => void) | null = null;
let updateSpatialTree: ((state?: any) => void) | null = null;
let updateModelsList: ((state?: any) => void) | null = null;

const activeProjectId = ref<string | null>(null);
let activeLoadGeneration = 0;
let isViewerReady = false;

onMounted(async () => {
    if (!containerRef.value) return;

    // Verificar sesión activa
    await checkSession();

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

    const [modelsListEl, updateModelsFn] = BUIC.tables.modelsList({
        components,
        metaDataTags: ["schema"],
        actions: { download: true },
    });
    updateModelsList = updateModelsFn;

    const [spatialTreeEl, updateSpatialFn] = BUIC.tables.spatialTree({
        components,
        models: [],
    });
    updateSpatialTree = updateSpatialFn;

    const [propertiesTableEl, updatePropertiesFn] = BUIC.tables.itemsData({
        components,
        modelIdMap: {},
    });
    updatePropertiesTable = updatePropertiesFn;

    highlighter = components.get(OBCF.Highlighter);
    highlighter.setup({ world });

    highlighter.events.select.onHighlight.add((modelIdMap) => {
        updatePropertiesTable?.({ modelIdMap });
    });

    highlighter.events.select.onClear.add(() =>
        updatePropertiesTable?.({ modelIdMap: {} })
    );

    propertiesTableEl.preserveStructureOnFilter = true;
    propertiesTableEl.indentationInText = false;

    // Panel UI
    panel = BUI.Component.create(() => {
        const [loadFragBtn] = BUIC.buttons.loadFrag({ components, world });

        const onSearchSpatialTree = (e: Event) => {
            const input = e.target as BUI.TextInput;
            spatialTreeEl.queryString = input.value;
        };

        const onTextInput = (e: Event) => {
            const input = e.target as BUI.TextInput;
            propertiesTableEl.queryString = input.value !== "" ? input.value : null;
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
                    ${spatialTreeEl}
                </bim-panel-section>
                <bim-panel-section icon="mage:box-3d-fill" label="Modelos Cargados">
                    ${modelsListEl}
                </bim-panel-section>
                <bim-panel-section label="Propiedades">
                    <bim-text-input @input=${onTextInput} placeholder="Buscar propiedad..." debounce="200"></bim-text-input>
                    ${propertiesTableEl}
                </bim-panel-section>
            </bim-panel>
        `;
    });

    const app = document.getElementById("appGrid") as any;
    app.layouts = {
        main: {
            template: `
            "panel viewport"
            / 23rem 1fr
            `,
            elements: { panel, viewport },
        },
        collapsed: {
            template: `
            "viewport"
            / 1fr
            `,
            elements: { viewport },
        },
    };

    app.layout = isPanelCollapsed.value ? "collapsed" : "main";

    // Iniciar controladores de navegación por teclado WASD
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    startWasdLoop();

    // Marcar el visor como completamente listo
    isViewerReady = true;

    if (props.initialProject) {
        loadBackendProject(props.initialProject);
    }
});

watch(
    () => props.initialProject,
    async (proj) => {
        if (!isViewerReady || !fragmentManager) return;
        if (proj) {
            await loadBackendProject(proj);
        } else {
            await clearScene();
        }
    }
);

const togglePanel = () => {
    isPanelCollapsed.value = !isPanelCollapsed.value;
    const app = document.getElementById("appGrid") as any;
    if (app) {
        app.layout = isPanelCollapsed.value ? "collapsed" : "main";
    }
    setTimeout(() => {
        world?.renderer?.resize?.();
        window.dispatchEvent(new Event('resize'));
    }, 60);
};

onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    window.removeEventListener('blur', handleWindowBlur);
    if (wasdFrameId !== null) {
        cancelAnimationFrame(wasdFrameId);
    }
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

    modelBounds.value = {
        min: [combinedBox.min.x, combinedBox.min.y, combinedBox.min.z],
        max: [combinedBox.max.x, combinedBox.max.y, combinedBox.max.z],
        center: [center.x, center.y, center.z],
        size: [size.x, size.y, size.z],
    };
    clipOffset.value = center.y;

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

const updateClippingPlane = () => {
    if (!world?.renderer?.three) return;
    const renderer = world.renderer.three as any;
    renderer.localClippingEnabled = true;

    if (!isSectionActive.value) {
        renderer.clippingPlanes = [];
        return;
    }

    const sign = clipInverted.value ? -1 : 1;
    let normal = new THREE.Vector3(0, -1 * sign, 0);
    if (clipAxis.value === 'x') normal = new THREE.Vector3(-1 * sign, 0, 0);
    if (clipAxis.value === 'z') normal = new THREE.Vector3(0, 0, -1 * sign);

    const plane = new THREE.Plane(normal, clipOffset.value * sign);
    renderer.clippingPlanes = [plane];
};

const onUpdateClipAxis = (newAxis: 'x' | 'y' | 'z') => {
    clipAxis.value = newAxis;
    const idx = newAxis === 'x' ? 0 : newAxis === 'y' ? 1 : 2;
    clipOffset.value = modelBounds.value.center[idx];
    updateClippingPlane();
};

const onUpdateClipOffset = (newOffset: number) => {
    clipOffset.value = newOffset;
    updateClippingPlane();
};

const onUpdateClipInverted = (newInverted: boolean) => {
    clipInverted.value = newInverted;
    updateClippingPlane();
};

watch(isSectionActive, (active) => {
    if (active) {
        const idx = clipAxis.value === 'x' ? 0 : clipAxis.value === 'y' ? 1 : 2;
        clipOffset.value = modelBounds.value.center[idx];
    }
    updateClippingPlane();
});

const setCameraPreset = (preset: 'top' | 'front' | 'side' | 'iso') => {
    if (!world?.camera?.controls) return;
    const controls = world.camera.controls;
    const { center, size } = modelBounds.value;
    const maxDim = Math.max(size[0], size[1], size[2], 30);
    const dist = maxDim * 1.5;

    const [cx, cy, cz] = center;

    switch (preset) {
        case 'top':
            controls.setLookAt(cx, cy + dist, cz + 0.0001, cx, cy, cz, true);
            break;
        case 'front':
            controls.setLookAt(cx, cy, cz + dist, cx, cy, cz, true);
            break;
        case 'side':
            controls.setLookAt(cx + dist, cy, cz, cx, cy, cz, true);
            break;
        case 'iso':
        default:
            controls.setLookAt(cx + dist * 0.7, cy + dist * 0.6, cz + dist * 0.7, cx, cy, cz, true);
            break;
    }
};

const clearScene = async () => {
    // Incrementar generación para invalidar cargas asíncronas pendientes
    activeLoadGeneration++;
    activeProjectId.value = null;

    // 1. Limpiar highlighter y selecciones activas (con timeout de seguridad para evitar bloqueos)
    if (highlighter) {
        try {
            const hasSelection = Object.values((highlighter as any).selection || {}).some(
                (map: any) => map && Object.keys(map).length > 0
            );
            if (hasSelection) {
                await Promise.race([
                    highlighter.clear(),
                    new Promise((resolve) => setTimeout(resolve, 300)),
                ]);
            }
        } catch (e) {
            console.warn('Error al limpiar highlighter:', e);
        }
    }

    // 2. Limpiar tabla de propiedades del elemento seleccionado
    if (updatePropertiesTable) {
        try {
            updatePropertiesTable({ modelIdMap: {} });
        } catch (e) {
            console.warn('Error al limpiar propertiesTable:', e);
        }
    }

    // 3. Limpiar modelos del FragmentManager y de la escena Three.js
    if (fragmentManager) {
        try {
            const models = Array.from(fragmentManager.list.values());
            for (const m of models as any[]) {
                if (m?.object && world?.scene?.three) {
                    world.scene.three.remove(m.object);
                    m.object.traverse?.((child: any) => {
                        if (child.geometry) {
                            child.geometry.dispose?.();
                        }
                        if (child.material) {
                            if (Array.isArray(child.material)) {
                                child.material.forEach((mat: any) => mat?.dispose?.());
                            } else {
                                child.material.dispose?.();
                            }
                        }
                    });
                }

                if (m?.modelId && typeof fragmentManager.core?.disposeModel === 'function') {
                    try {
                        await Promise.race([
                            fragmentManager.core.disposeModel(m.modelId),
                            new Promise((resolve) => setTimeout(resolve, 500)),
                        ]);
                    } catch (errDispose) {
                        console.warn(`Error al disponer modelo ${m.modelId}:`, errDispose);
                    }
                } else if (typeof m?.dispose === 'function') {
                    try {
                        await m.dispose();
                    } catch (errDispose) {
                        console.warn(`Error al disponer modelo ${m?.modelId}:`, errDispose);
                    }
                }
            }

            fragmentManager.list.clear();
            if (models.length > 0) {
                await Promise.race([
                    fragmentManager.core?.update?.(true),
                    new Promise((resolve) => setTimeout(resolve, 500)),
                ]);
            }
        } catch (e) {
            console.warn('Error al limpiar fragments:', e);
        }
    }

    // 4. Actualizar tablas de UI (lista de modelos y árbol espacial)
    if (updateModelsList) {
        try {
            updateModelsList();
        } catch (e) {
            console.warn('Error al actualizar modelsList:', e);
        }
    }
    if (updateSpatialTree) {
        try {
            updateSpatialTree({ models: [] });
        } catch (e) {
            console.warn('Error al actualizar spatialTree:', e);
        }
    }

    // 5. Limpiar planos de corte y estado de sección
    if (world?.renderer?.three) {
        world.renderer.three.clippingPlanes = [];
    }
    isSectionActive.value = false;

    // 6. Resetear bounds del modelo
    modelBounds.value = {
        min: [-100, -20, -100],
        max: [100, 50, 100],
        center: [0, 15, 0],
        size: [200, 70, 200],
    };
};

const loadCachedModel = async (id: string) => {
    const cached = await getProjectFragments(id);
    if (!cached || !cached.parts.length) {
        alert('No se encontraron fragmentos en la caché local.');
        return;
    }

    await clearScene();
    const currentGen = ++activeLoadGeneration;
    activeProjectId.value = id;

    isLoading.value = true;
    loadingProgress.value = 15;
    loadingFileName.value = cached.name;
    const totalBytes = cached.parts.reduce((a, b) => a + b.byteLength, 0);
    loadingFileSize.value = `${(totalBytes / (1024 * 1024)).toFixed(1)} MB (Caché Local)`;
    loadingMessage.value = 'Cargando desde Caché Local IndexedDB...';
    loadingSubtitle.value = 'Carga instantánea sin consumo de red';
    loadingStage.value = 'Inyectando fragmentos en Three.js...';

    try {
        for (let i = 0; i < cached.parts.length; i++) {
            if (currentGen !== activeLoadGeneration) return;
            const buf = cached.parts[i];
            const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
            const partName = (cached.partNames && cached.partNames[i]) || `${cached.name || id}_part_${i + 1}`;
            const cleanModelId = partName.replace(/\.frag$/i, '');
            let loadedModel: any = null;
            try {
                loadedModel = await fragmentManager.core.load(bytes, { modelId: cleanModelId, raw: false });
            } catch (errNormal) {
                console.warn(`[FRAG-CACHE] Carga raw=false falló (${errNormal}), reintentando raw=true para ${cleanModelId}`);
                try {
                    loadedModel = await fragmentManager.core.load(bytes, { modelId: cleanModelId, raw: true });
                } catch (errRaw) {
                    console.error(`[FRAG-CACHE] Fallo al cargar parte "${cleanModelId}":`, errRaw);
                }
            }
            if (loadedModel) {
                const modelKey = cleanModelId;
                if (!fragmentManager.list.has(modelKey)) {
                    fragmentManager.list.set(modelKey, loadedModel);
                }
                if (world?.camera?.three) {
                    try { loadedModel.useCamera(world.camera.three); } catch {}
                }
                if (loadedModel.object && world?.scene?.three && !world.scene.three.children.includes(loadedModel.object)) {
                    world.scene.three.add(loadedModel.object);
                }
            }
            loadingProgress.value = Math.round(((i + 1) / cached.parts.length) * 90);
        }

        if (currentGen !== activeLoadGeneration) return;

        try {
            await fragmentManager.core.update(true);
        } catch {}

        if (updateModelsList) {
            updateModelsList();
        }
        if (updateSpatialTree && fragmentManager) {
            updateSpatialTree({ models: Array.from(fragmentManager.list.values()) });
        }

        loadingProgress.value = 100;
        loadingStage.value = 'Encuadrando vista de cámara...';
        nextTick(() => {
            world?.renderer?.resize?.();
            window.dispatchEvent(new Event('resize'));
        });
        setTimeout(async () => {
            if (currentGen === activeLoadGeneration) {
                await fitCameraToModels();
            }
        }, 150);
    } catch (err: any) {
        if (currentGen === activeLoadGeneration) {
            console.error('Error cargando desde caché:', err);
            alert(`Error al cargar modelo desde caché: ${err.message}`);
        }
    } finally {
        if (currentGen === activeLoadGeneration) {
            isLoading.value = false;
        }
    }
};

const loadBackendProject = async (proj: BackendProject) => {
    if (!proj || !proj.id) return;

    // Si ya estamos exactamente en este proyecto y ya tiene todos sus fragmentos cargados
    if (activeProjectId.value === proj.id) {
        let allPartsAlreadyLoaded = Boolean(proj.parts && proj.parts.length > 0);
        if (allPartsAlreadyLoaded && proj.parts) {
            for (const part of proj.parts) {
                const cleanPartId = part.replace(/\.frag$/i, '');
                if (!fragmentManager || !fragmentManager.list.has(cleanPartId)) {
                    allPartsAlreadyLoaded = false;
                    break;
                }
            }
        }

        if (allPartsAlreadyLoaded) {
            appLogger.info(`El proyecto "${proj.name || proj.fileName}" ya se encuentra activo en la escena.`);
            setTimeout(async () => {
                await fitCameraToModels();
            }, 100);
            return;
        }
    }

    // Limpiar modelos del proyecto anterior antes de cargar el nuevo para garantizar aislamiento estricto
    await clearScene();

    // Establecer nueva generación y registrar projectId activo
    const currentGen = ++activeLoadGeneration;
    activeProjectId.value = proj.id;

    if (!proj.parts || proj.parts.length === 0) {
        appLogger.warn(`El proyecto "${proj.name || proj.fileName}" no contiene modelos FRAG listos.`);
        return;
    }

    isLoading.value = true;
    isBackendProcessing.value = true;
    loadingFileName.value = proj.name || proj.fileName;
    loadingFileSize.value = `${proj.totalPartsSizeMB || '0'} MB`;
    loadingMessage.value = 'Descargando fragmentos del almacenamiento local...';
    loadingSubtitle.value = `Descarga directa de ${proj.parts.length} partes`;
    loadingProgress.value = 10;
    loadingStage.value = 'Conectando con el backend...';

    try {
        let buffers: ArrayBuffer[] = [];
        let usedCache = false;

        const cached = await getProjectFragments(proj.id);
        const hasValidCache = Boolean(
            cached &&
            Array.isArray(cached.parts) &&
            cached.parts.length >= (proj.parts?.length || 1) &&
            cached.parts.every((p) => p && p.byteLength > 1024)
        );

        if (hasValidCache && cached) {
            appLogger.info(`[Viewer] Cargando fragmentos desde caché local (${cached.parts.length} partes).`);
            buffers = cached.parts;
            usedCache = true;
        } else {
            buffers = await downloadBackendFragments(proj.id, proj.parts, (loaded, total) => {
                if (currentGen === activeLoadGeneration) {
                    loadingProgress.value = Math.round((loaded / total) * 70);
                    loadingStage.value = `Descargando fragmento ${loaded} de ${total}...`;
                }
            });

            // Verificar si la generación cambió durante la descarga asíncrona
            if (currentGen !== activeLoadGeneration) {
                appLogger.info(`Carga cancelada: el proyecto activo cambió durante la descarga.`);
                return;
            }

            // Guardar automáticamente en IndexedDB para futuras visitas instantáneas
            if (buffers.length > 0) {
                saveProjectFragments(proj.id, proj.name || proj.fileName, buffers, proj.parts).catch(console.warn);
            }
        }

        const injectFragments = async (buffersToInject: ArrayBuffer[]) => {
            loadingStage.value = 'Inyectando fragmentos en la escena 3D...';
            lastFragmentBuffers = [];

            for (let i = 0; i < buffersToInject.length; i++) {
                if (currentGen !== activeLoadGeneration) return;

                const buf = buffersToInject[i];
                const partName = (proj.parts && proj.parts[i]) || `${proj.name || 'model'}_part_${i + 1}.frag`;
                const cleanModelId = partName.replace(/\.frag$/i, '');

                if (fragmentManager && fragmentManager.list.has(cleanModelId)) {
                    continue;
                }

                const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
                lastFragmentBytes = bytes;
                lastFragmentBuffers.push(bytes);

                let loadedModel: any = null;
                try {
                    loadedModel = await fragmentManager.core.load(bytes, { modelId: cleanModelId, raw: false });
                } catch (errNormal) {
                    console.warn(`[FRAG] Carga raw=false falló (${errNormal}), reintentando raw=true para ${cleanModelId}`);
                    try {
                        loadedModel = await fragmentManager.core.load(bytes, { modelId: cleanModelId, raw: true });
                    } catch (errRaw) {
                        console.error(`[FRAG] Fallo definitivo al cargar parte "${cleanModelId}":`, errRaw);
                    }
                }

                if (loadedModel) {
                    const modelKey = cleanModelId;
                    if (!fragmentManager.list.has(modelKey)) {
                        fragmentManager.list.set(modelKey, loadedModel);
                    }
                    if (world?.camera?.three) {
                        try { loadedModel.useCamera(world.camera.three); } catch {}
                    }
                    if (loadedModel.object && world?.scene?.three && !world.scene.three.children.includes(loadedModel.object)) {
                        world.scene.three.add(loadedModel.object);
                    }
                    console.log(`[FRAG] Modelo ${cleanModelId} inyectado en escena 3D (${i + 1}/${buffersToInject.length})`);
                }
            }
        };

        try {
            await injectFragments(buffers);
        } catch (injectionErr) {
            if (usedCache) {
                console.warn('[Viewer] Inyección desde caché falló, purgando caché e intentando descarga directa:', injectionErr);
                await deleteCachedProject(proj.id);
                buffers = await downloadBackendFragments(proj.id, proj.parts);
                await injectFragments(buffers);
                if (buffers.length > 0) {
                    saveProjectFragments(proj.id, proj.name || proj.fileName, buffers, proj.parts).catch(console.warn);
                }
            } else {
                throw injectionErr;
            }
        }

        // Verificar si la generación cambió tras inyectar todos los fragmentos
        if (currentGen !== activeLoadGeneration) {
            return;
        }

        try {
            await fragmentManager.core.update(true);
        } catch {}

        // Actualizar listas y árboles en la interfaz
        if (updateModelsList) {
            updateModelsList();
        }
        if (updateSpatialTree && fragmentManager) {
            updateSpatialTree({ models: Array.from(fragmentManager.list.values()) });
        }

        loadingProgress.value = 100;
        loadingStage.value = 'Encuadrando vista de cámara...';

        nextTick(() => {
            world?.renderer?.resize?.();
            window.dispatchEvent(new Event('resize'));
        });

        setTimeout(async () => {
            if (currentGen === activeLoadGeneration) {
                world?.renderer?.resize?.();
                await fitCameraToModels();
            }
        }, 150);
        appLogger.info(`Proyecto cargado exitosamente: ${proj.name || proj.fileName}`);
    } catch (err: any) {
        if (currentGen === activeLoadGeneration) {
            console.error('Error cargando proyecto del backend:', err);
            alert(`Error al descargar proyecto: ${err.message}`);
        }
    } finally {
        if (currentGen === activeLoadGeneration) {
            isLoading.value = false;
            isBackendProcessing.value = false;
        }
    }
};

const loadBackendModel = async (model: BackendModelItem) => {
    const cleanModelId = model.name.replace(/\.frag$/i, '');

    await clearScene();
    const currentGen = ++activeLoadGeneration;
    activeProjectId.value = model.projectId || model.id;

    isLoading.value = true;
    isBackendProcessing.value = true;
    loadingFileName.value = model.name;
    loadingFileSize.value = model.sizeFormatted;
    loadingMessage.value = 'Descargando modelo persistente de almacenamiento local...';
    loadingSubtitle.value = `Proyecto: ${model.projectName || 'Catálogo local'}`;
    loadingProgress.value = 20;
    loadingStage.value = 'Conectando con el almacenamiento local...';

    try {
        const buffer = await downloadModelFragment(model.id);
        if (currentGen !== activeLoadGeneration) return;

        loadingProgress.value = 75;
        loadingStage.value = 'Inyectando fragmento en GPU y escena 3D...';

        const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        let loadedModel: any = null;
        try {
            loadedModel = await fragmentManager.core.load(bytes, { modelId: cleanModelId, raw: false });
        } catch {
            loadedModel = await fragmentManager.core.load(bytes, { modelId: cleanModelId, raw: true });
        }

        if (loadedModel) {
            const modelKey = cleanModelId || loadedModel.modelId || loadedModel.id;
            if (!fragmentManager.list.has(modelKey)) {
                fragmentManager.list.set(modelKey, loadedModel);
            }
            if (world?.camera?.three) {
                try { loadedModel.useCamera(world.camera.three); } catch {}
            }
            if (loadedModel.object && world?.scene?.three && !world.scene.three.children.includes(loadedModel.object)) {
                world.scene.three.add(loadedModel.object);
            }
        }

        if (currentGen !== activeLoadGeneration) return;

        if (updateModelsList) {
            updateModelsList();
        }
        if (updateSpatialTree && fragmentManager) {
            updateSpatialTree({ models: Array.from(fragmentManager.list.values()) });
        }

        loadingProgress.value = 100;
        loadingStage.value = 'Encuadrando vista de cámara...';
        setTimeout(async () => {
            if (currentGen === activeLoadGeneration) {
                await fitCameraToModels();
            }
        }, 150);
        appLogger.info(`Modelo persistente cargado con éxito: ${model.name}`);
    } catch (err: any) {
        if (currentGen === activeLoadGeneration) {
            console.error('Error cargando modelo del backend:', err);
            alert(`Error al descargar o inyectar modelo: ${err.message}`);
        }
    } finally {
        if (currentGen === activeLoadGeneration) {
            isLoading.value = false;
            isBackendProcessing.value = false;
        }
    }
};

const openIfcLoadDialog = () => {
    if (!currentUser.value) {
        isLoginModalOpen.value = true;
        alert('Debe iniciar sesión para cargar o convertir archivos IFC.');
        return;
    }
    if (!isAdmin.value) {
        alert('Acceso restringido: Solo los administradores pueden cargar archivos IFC al catálogo.');
        return;
    }
    ifcLoadInput.value?.click();
};

const openIfcConvertDialog = () => {
    if (!currentUser.value) {
        isLoginModalOpen.value = true;
        alert('Debe iniciar sesión para cargar o convertir archivos IFC.');
        return;
    }
    if (!isAdmin.value) {
        alert('Acceso restringido: Solo los administradores pueden convertir archivos IFC.');
        return;
    }
    ifcConvertInput.value?.click();
};

const openIfcDialog = openIfcLoadDialog;
const openFragDialog = () => fragInput.value?.click();

const onLoginSuccess = () => {
    appLogger.info(`Sesión iniciada correctamente: ${currentUser.value?.email}`);
};

const handleLogout = async () => {
    await logout();
    appLogger.info('Sesión cerrada.');
};

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
        if (!currentUser.value) {
            isLoginModalOpen.value = true;
            alert('Debe iniciar sesión para procesar archivos IFC.');
            return;
        }
        if (!isAdmin.value) {
            alert('Acceso restringido: Solo los administradores pueden procesar o convertir archivos IFC.');
            return;
        }
        await processMultipleIfcFiles(ifcFiles, false);
    }
};

const loadMultipleFragFiles = async (files: File[]) => {
    isLoading.value = true;
    loadingProgress.value = 0;

    try {
        const cachedBuffers: ArrayBuffer[] = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const prefix = files.length > 1 ? `[${i + 1}/${files.length}] ` : '';
            loadingMessage.value = `${prefix}Cargando .FRAG`;
            loadingFileName.value = file.name;
            loadingFileSize.value = `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
            loadingStage.value = 'Leyendo buffer de archivo .frag...';
            loadingProgress.value = Math.round((i / files.length) * 100);

            const buffer = await file.arrayBuffer();
            cachedBuffers.push(buffer);
            const bytes = new Uint8Array(buffer);
            lastFragmentBytes = bytes;

            loadingStage.value = 'Inicializando geometría en GPU...';
            const cleanModelId = file.name.replace(/\.frag$/i, '');
            let loadedModel: any = null;
            try {
                // Probar primero carga con descompresión estándar
                loadedModel = await fragmentManager.core.load(bytes, { modelId: cleanModelId, raw: false });
            } catch {
                // Si el archivo fue guardado sin compresión (raw flatbuffer), cargar con raw=true
                loadedModel = await fragmentManager.core.load(bytes, { modelId: cleanModelId, raw: true });
            }

            if (loadedModel) {
                const modelKey = cleanModelId || loadedModel.modelId || loadedModel.id;
                if (!fragmentManager.list.has(modelKey)) {
                    fragmentManager.list.set(modelKey, loadedModel);
                }
                if (world?.camera?.three) {
                    try { loadedModel.useCamera(world.camera.three); } catch {}
                }
                if (loadedModel.object && world?.scene?.three && !world.scene.three.children.includes(loadedModel.object)) {
                    world.scene.three.add(loadedModel.object);
                }
            }
            console.log(`[FRAG] Modelo cargado (${i + 1}/${files.length}): ${file.name}`);
        }

        // Auto-guardar en IndexedDB local
        if (cachedBuffers.length > 0) {
            if (activeProjectId.value) {
                await appendProjectFragments(activeProjectId.value, loadingFileName.value || 'Proyecto', cachedBuffers);
            } else {
                const cacheKey = files.map((f) => f.name).join('_');
                await saveProjectFragments(cacheKey, files[0].name, cachedBuffers);
            }
        }

        // Si hay un proyecto activo en el backend, persistir automáticamente en SQLite y almacenamiento
        if (activeProjectId.value) {
            for (const file of files) {
                try {
                    await uploadDirectFrag(activeProjectId.value, file);
                    console.log(`[FRAG] Archivo ${file.name} guardado y persistido para proyecto ${activeProjectId.value}`);
                    appLogger.info(`Modelo ${file.name} guardado en el proyecto.`);
                } catch (persistErr) {
                    console.warn(`[FRAG] No se pudo persistir automáticamente en backend:`, persistErr);
                }
            }
        }

        if (updateModelsList) {
            updateModelsList();
        }
        if (updateSpatialTree && fragmentManager) {
            updateSpatialTree({ models: Array.from(fragmentManager.list.values()) });
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

                        // Auto-guardar en IndexedDB local
                        saveProjectFragments(
                            result.jobId,
                            file.name,
                            result.fragmentBuffers.map((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
                        ).catch(console.warn);

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

/* Top status bar holding user auth pill and backend status */
.top-status-bar {
  position: absolute;
  top: 14px;
  right: 18px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-auth-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 4px 10px;
  border-radius: 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  pointer-events: all;
  user-select: none;
}

.user-badge {
  display: flex;
  align-items: center;
  gap: 6px;
}

.user-role-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.user-role-dot.admin {
  background: #f59e0b;
  box-shadow: 0 0 6px #f59e0b;
}

.user-role-dot.user {
  background: #3b82f6;
  box-shadow: 0 0 6px #3b82f6;
}

.user-name-text {
  font-size: 0.76rem;
  font-weight: 600;
  color: #f1f5f9;
  max-width: 130px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-role-tag {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.user-role-tag.admin {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.user-role-tag.user {
  background: rgba(59, 130, 246, 0.2);
  color: #93c5fd;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.auth-action-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #cbd5e1;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 4px;
}

.auth-action-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
}

.auth-action-btn.login-btn {
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.6), rgba(29, 78, 216, 0.6));
  border-color: rgba(59, 130, 246, 0.5);
  color: #ffffff;
}

.auth-action-btn.login-btn:hover {
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.9), rgba(29, 78, 216, 0.9));
}

.auth-action-btn.admin-btn {
  background: rgba(245, 158, 11, 0.15);
  border-color: rgba(245, 158, 11, 0.4);
  color: #fbbf24;
}

.auth-action-btn.admin-btn:hover {
  background: rgba(245, 158, 11, 0.3);
}

.auth-action-btn.logout-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.4);
  color: #fca5a5;
}

.auth-action-btn.gallery-nav-btn {
  background: rgba(56, 189, 248, 0.16);
  border-color: rgba(56, 189, 248, 0.45);
  color: #38bdf8;
  font-weight: 700;
  padding: 4px 11px;
}

.auth-action-btn.gallery-nav-btn:hover {
  background: rgba(56, 189, 248, 0.35);
  color: #ffffff;
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.4);
}

.backend-status-pill {
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

/* Botón Plegable Flotante para el Menú Lateral (class parent) */
.panel-toggle-tab {
  position: absolute;
  top: 18px;
  left: calc(23rem + 12px);
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(15, 23, 42, 0.88);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(56, 189, 248, 0.35);
  color: #38bdf8;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
  transition: left 0.28s cubic-bezier(0.4, 0, 0.2, 1), background 0.2s, border-color 0.2s, color 0.2s;
  pointer-events: all;
  user-select: none;
}

.panel-toggle-tab:hover {
  background: rgba(2, 132, 199, 0.35);
  border-color: #38bdf8;
  color: #ffffff;
  transform: translateY(-1px);
}

.panel-toggle-tab.is-collapsed {
  left: 16px;
  background: rgba(15, 23, 42, 0.92);
  border-color: rgba(56, 189, 248, 0.5);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.65);
}

.toggle-icon {
  font-size: 0.75rem;
}

.toggle-label {
  font-size: 0.75rem;
  letter-spacing: 0.02em;
}
</style>
