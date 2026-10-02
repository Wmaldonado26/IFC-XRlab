<template>
  <div v-if="modelValue" class="modal-backdrop" @click.self="$emit('update:modelValue', false)">
    <div class="modal-card">
      <!-- Modal Header -->
      <div class="modal-header">
        <div class="header-left">
          <span class="header-icon">🗂️</span>
          <div>
            <h3 class="modal-title">Catálogo de Proyectos & Modelos FRAG</h3>
            <p class="modal-subtitle">Almacenamiento persistente SQLite y caché local sin re-conversión</p>
          </div>
        </div>
        <button type="button" class="close-btn" title="Cerrar (Esc)" @click="$emit('update:modelValue', false)">✕</button>
      </div>

      <!-- Navigation Tabs -->
      <div class="tab-bar">
        <button
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === 'projects' }"
          @click="activeTab = 'projects'"
        >
          📁 Proyectos SQLite ({{ projectsList.length }})
        </button>
        <button
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === 'models' }"
          @click="activeTab = 'models'"
        >
          📦 Modelos FRAG ({{ modelsList.length }})
        </button>
        <button
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === 'cache' }"
          @click="activeTab = 'cache'"
        >
          💾 Caché del Navegador ({{ cachedList.length }})
        </button>
      </div>

      <!-- Notification Toast -->
      <div v-if="feedbackMessage" class="feedback-banner" :class="feedbackType">
        <span>{{ feedbackMessage }}</span>
        <button type="button" class="dismiss-btn" @click="feedbackMessage = ''">✕</button>
      </div>

      <!-- Modal Body -->
      <div class="modal-body">
        <!-- ========================================== -->
        <!-- TAB 1: PROYECTOS SQLITE                   -->
        <!-- ========================================== -->
        <div v-if="activeTab === 'projects'" class="tab-content">
          <div class="tab-toolbar">
            <div class="search-box">
              <span class="search-icon">🔍</span>
              <input
                v-model="projectSearch"
                type="text"
                placeholder="Buscar proyectos por nombre o descripción..."
                class="search-input"
                @input="onProjectSearchChange"
              />
              <button
                v-if="projectSearch"
                type="button"
                class="clear-search-btn"
                @click="projectSearch = ''; onProjectSearchChange()"
              >
                ✕
              </button>
            </div>
            <div class="toolbar-actions">
              <button v-if="isAdmin" type="button" class="primary-btn-sm" @click="openCreateProjectModal">
                ➕ Nuevo Proyecto
              </button>
              <button type="button" class="refresh-btn-sm" title="Recargar lista" @click="refreshProjects">
                🔄
              </button>
            </div>
          </div>

          <div v-if="isLoadingProjects" class="loading-state">
            <div class="spinner"></div>
            <p>Cargando proyectos desde SQLite...</p>
          </div>

          <div v-else-if="projectsList.length === 0" class="empty-state">
            <span class="empty-icon">📂</span>
            <p v-if="projectSearch">No se encontraron proyectos que coincidan con "{{ projectSearch }}".</p>
            <p v-else>No hay proyectos registrados en SQLite.</p>
            <span class="empty-hint">Crea un nuevo proyecto o convierte un archivo IFC para comenzar.</span>
            <button v-if="!projectSearch" type="button" class="primary-btn-sm" style="margin-top: 14px;" @click="openCreateProjectModal">
              ➕ Crear Primer Proyecto
            </button>
          </div>

          <div v-else class="project-grid">
            <div v-for="proj in projectsList" :key="proj.id" class="project-card">
              <div class="project-card-header">
                <div class="project-info">
                  <span class="project-icon">🚢</span>
                  <div class="project-text">
                    <h4 class="project-name" :title="proj.name">{{ proj.name }}</h4>
                    <p v-if="proj.description" class="project-description">{{ proj.description }}</p>
                    <div class="project-meta-badges">
                      <span class="badge badge-models">
                        {{ proj.modelsCount }} {{ proj.modelsCount === 1 ? 'modelo' : 'modelos' }}
                      </span>
                      <span class="badge badge-size">
                        {{ proj.totalPartsSizeMB }} MB
                      </span>
                      <span class="badge badge-date">
                        {{ formatDate(proj.createdAt) }}
                      </span>
                    </div>
                  </div>
                </div>

                <div class="project-actions">
                  <button
                    v-if="proj.modelsCount > 0"
                    type="button"
                    class="action-btn load-btn"
                    title="Cargar todas las partes del proyecto en el visor 3D"
                    @click="onLoadProject(proj)"
                  >
                    ⚡ Cargar
                  </button>
                  <button
                    v-if="isAdmin"
                    type="button"
                    class="action-btn edit-btn"
                    title="Renombrar o editar descripción"
                    @click="openEditProjectModal(proj)"
                  >
                    ✏️
                  </button>
                  <button
                    v-if="isAdmin"
                    type="button"
                    class="action-btn delete-btn"
                    title="Eliminar proyecto y sus modelos"
                    @click="promptDeleteProject(proj)"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              <!-- Collapsible models sub-list -->
              <div v-if="proj.models && proj.models.length > 0" class="project-models-drawer">
                <button
                  type="button"
                  class="drawer-toggle"
                  @click="toggleProjectDrawer(proj.id)"
                >
                  <span>{{ expandedProjects[proj.id] ? '▲ Ocultar' : '▼ Ver' }} fragmentos asociados ({{ proj.models.length }})</span>
                </button>

                <div v-if="expandedProjects[proj.id]" class="models-sublist">
                  <div v-for="m in proj.models" :key="m.id" class="sub-model-item">
                    <div class="sub-model-info">
                      <span class="sub-icon">📦</span>
                      <span class="sub-name" :title="m.name">{{ m.name }}</span>
                      <span class="sub-size">{{ m.sizeFormatted }}</span>
                      <span
                        class="status-pill"
                        :class="m.fileExists ? 'status-ok' : 'status-missing'"
                        :title="m.fileExists ? 'Archivo verificado en disco' : 'Archivo no encontrado en disco'"
                      >
                        {{ m.fileExists ? 'En disco' : 'Falta archivo' }}
                      </span>
                    </div>
                    <div class="sub-actions">
                      <button
                        type="button"
                        class="btn-sub-action btn-open"
                        :disabled="!m.fileExists"
                        :title="m.fileExists ? 'Abrir este modelo en el visor' : 'No disponible en disco'"
                        @click="onLoadSingleModel(m)"
                      >
                        Abrir
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ========================================== -->
        <!-- TAB 2: MODELOS FRAG                      -->
        <!-- ========================================== -->
        <div v-if="activeTab === 'models'" class="tab-content">
          <div class="tab-toolbar">
            <div class="search-box">
              <span class="search-icon">🔍</span>
              <input
                v-model="modelSearch"
                type="text"
                placeholder="Buscar modelo por nombre o proyecto..."
                class="search-input"
                @input="onModelFilterChange"
              />
              <button
                v-if="modelSearch"
                type="button"
                class="clear-search-btn"
                @click="modelSearch = ''; onModelFilterChange()"
              >
                ✕
              </button>
            </div>

            <div class="filter-controls">
              <select v-model="selectedProjectFilter" class="filter-select" @change="onModelFilterChange">
                <option value="all">Todos los proyectos</option>
                <option v-for="p in projectsList" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>

              <select v-model="selectedStatusFilter" class="filter-select" @change="onModelFilterChange">
                <option value="all">Todos los estados</option>
                <option value="ready">Listos</option>
                <option value="missing_file">Falta en disco</option>
              </select>

              <button type="button" class="refresh-btn-sm" title="Recargar modelos" @click="refreshModels">
                🔄
              </button>
            </div>
          </div>

          <div v-if="isLoadingModels" class="loading-state">
            <div class="spinner"></div>
            <p>Cargando modelos desde SQLite...</p>
          </div>

          <div v-else-if="filteredModels.length === 0" class="empty-state">
            <span class="empty-icon">📦</span>
            <p v-if="modelSearch || selectedProjectFilter !== 'all' || selectedStatusFilter !== 'all'">
              No se encontraron modelos con los filtros seleccionados.
            </p>
            <p v-else>No hay modelos FRAG almacenados.</p>
            <span class="empty-hint">Convierte un modelo IFC para generar y persistir archivos .frag.</span>
          </div>

          <div v-else class="models-grid">
            <div v-for="model in filteredModels" :key="model.id" class="model-item">
              <div class="model-item-main">
                <span class="model-icon">🧱</span>
                <div class="model-details">
                  <div class="model-title-row">
                    <h4 class="model-name" :title="model.name">{{ model.name }}</h4>
                    <span
                      class="status-pill"
                      :class="model.fileExists ? 'status-ok' : 'status-missing'"
                      :title="model.fileExists ? 'Archivo físico verificado en disco' : 'Archivo no encontrado en storage/models/'"
                    >
                      {{ model.fileExists ? '● En disco' : '⚠ Falta archivo' }}
                    </span>
                  </div>
                  <div class="model-meta-row">
                    <span class="project-tag" :title="model.projectName">
                      📁 {{ model.projectName || 'Sin proyecto' }}
                    </span>
                    <span>•</span>
                    <span>{{ model.sizeFormatted }}</span>
                    <span>•</span>
                    <span>{{ formatDate(model.createdAt) }}</span>
                  </div>
                </div>
              </div>

              <div class="model-actions">
                <button
                  type="button"
                  class="action-btn load-btn"
                  :disabled="!model.fileExists"
                  :title="model.fileExists ? 'Abrir este modelo en el visor 3D' : 'Archivo no encontrado en disco'"
                  @click="onLoadSingleModel(model)"
                >
                  ⚡ Abrir
                </button>
                <button
                  type="button"
                  class="action-btn details-btn"
                  title="Ver detalles del modelo"
                  @click="openModelDetailsModal(model)"
                >
                  ℹ️
                </button>
                <button
                  v-if="isAdmin"
                  type="button"
                  class="action-btn delete-btn"
                  title="Eliminar este modelo"
                  @click="promptDeleteModel(model)"
                >
                  🗑️
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- ========================================== -->
        <!-- TAB 3: CACHÉ INDEXEDDB                     -->
        <!-- ========================================== -->
        <div v-if="activeTab === 'cache'" class="tab-content">
          <div class="tab-toolbar">
            <span class="info-tag">Almacenamiento Zero-Latency en IndexedDB (Memoria local del navegador)</span>
            <button
              v-if="cachedList.length > 0"
              type="button"
              class="danger-btn-sm"
              @click="onClearCache"
            >
              🧹 Limpiar Toda la Caché
            </button>
          </div>

          <div v-if="cachedList.length === 0" class="empty-state">
            <span class="empty-icon">📭</span>
            <p>No hay modelos guardados en la caché local del navegador.</p>
            <span class="empty-hint">Al abrir proyectos del backend, se guardarán aquí para acceso ultra-rápido sin red.</span>
          </div>

          <div v-else class="project-grid">
            <div v-for="item in cachedList" :key="item.id" class="project-card">
              <div class="project-card-header">
                <div class="project-info">
                  <span class="project-icon">⚡</span>
                  <div class="project-text">
                    <h4 class="project-name" :title="item.name">{{ item.name }}</h4>
                    <div class="project-meta-badges">
                      <span class="badge badge-size">{{ (item.totalBytes / (1024 * 1024)).toFixed(1) }} MB</span>
                      <span class="badge badge-date">{{ formatDate(item.timestamp) }}</span>
                    </div>
                  </div>
                </div>
                <div class="project-actions">
                  <button
                    type="button"
                    class="action-btn load-btn"
                    title="Cargar instantáneamente desde IndexedDB"
                    @click="onLoadCached(item.id)"
                  >
                    ⚡ Cargar
                  </button>
                  <button
                    type="button"
                    class="action-btn delete-btn"
                    title="Eliminar de caché"
                    @click="onDeleteCached(item.id)"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ========================================== -->
    <!-- DIALOG: CREAR NUEVO PROYECTO               -->
    <!-- ========================================== -->
    <div v-if="showCreateProjectModal" class="sub-modal-backdrop" @click.self="showCreateProjectModal = false">
      <div class="sub-modal-card">
        <h4 class="sub-modal-title">➕ Crear Nuevo Proyecto</h4>
        <div class="form-group">
          <label class="form-label">Nombre del proyecto *</label>
          <input
            v-model="newProjectName"
            type="text"
            class="form-input"
            placeholder="Ej. Edificio Oficinas Central"
            maxlength="120"
            @keyup.enter="submitCreateProject"
          />
        </div>
        <div class="form-group">
          <label class="form-label">Descripción (opcional)</label>
          <textarea
            v-model="newProjectDesc"
            class="form-textarea"
            placeholder="Detalles sobre el proyecto, ubicación o versión..."
            rows="3"
            maxlength="300"
          ></textarea>
        </div>
        <div class="sub-modal-actions">
          <button type="button" class="btn-cancel" @click="showCreateProjectModal = false">Cancelar</button>
          <button
            type="button"
            class="btn-confirm"
            :disabled="!newProjectName.trim()"
            @click="submitCreateProject"
          >
            Guardar Proyecto
          </button>
        </div>
      </div>
    </div>

    <!-- ========================================== -->
    <!-- DIALOG: EDITAR / RENOMBRAR PROYECTO       -->
    <!-- ========================================== -->
    <div v-if="showEditProjectModal" class="sub-modal-backdrop" @click.self="showEditProjectModal = false">
      <div class="sub-modal-card">
        <h4 class="sub-modal-title">✏️ Renombrar / Editar Proyecto</h4>
        <div class="form-group">
          <label class="form-label">Nombre del proyecto *</label>
          <input
            v-model="editProjectName"
            type="text"
            class="form-input"
            maxlength="120"
            @keyup.enter="submitEditProject"
          />
        </div>
        <div class="form-group">
          <label class="form-label">Descripción</label>
          <textarea
            v-model="editProjectDesc"
            class="form-textarea"
            rows="3"
            maxlength="300"
          ></textarea>
        </div>
        <div class="sub-modal-actions">
          <button type="button" class="btn-cancel" @click="showEditProjectModal = false">Cancelar</button>
          <button
            type="button"
            class="btn-confirm"
            :disabled="!editProjectName.trim()"
            @click="submitEditProject"
          >
            Guardar Cambios
          </button>
        </div>
      </div>
    </div>

    <!-- ========================================== -->
    <!-- DIALOG: CONFIRMAR ELIMINACIÓN DE PROYECTO -->
    <!-- ========================================== -->
    <div v-if="showDeleteProjectModal && projectToDelete" class="sub-modal-backdrop" @click.self="showDeleteProjectModal = false">
      <div class="sub-modal-card">
        <h4 class="sub-modal-title text-danger">⚠️ Eliminar Proyecto</h4>
        <p class="delete-warning-text">
          ¿Estás seguro de que deseas eliminar permanentemente el proyecto:
          <strong class="highlight-text">{{ projectToDelete.name }}</strong>?
        </p>
        <div class="alert-box-danger">
          <span>Esta acción es irreversible y eliminará:</span>
          <ul>
            <li>El registro del proyecto en SQLite.</li>
            <li><strong>{{ projectToDelete.modelsCount }}</strong> archivo(s) .frag asociados de <code>storage/models/</code>.</li>
          </ul>
        </div>
        <div class="sub-modal-actions">
          <button type="button" class="btn-cancel" @click="showDeleteProjectModal = false">Cancelar</button>
          <button type="button" class="btn-danger-confirm" @click="confirmDeleteProject">
            Sí, Eliminar Proyecto
          </button>
        </div>
      </div>
    </div>

    <!-- ========================================== -->
    <!-- DIALOG: CONFIRMAR ELIMINACIÓN DE MODELO   -->
    <!-- ========================================== -->
    <div v-if="showDeleteModelModal && modelToDelete" class="sub-modal-backdrop" @click.self="showDeleteModelModal = false">
      <div class="sub-modal-card">
        <h4 class="sub-modal-title text-danger">⚠️ Eliminar Modelo FRAG</h4>
        <p class="delete-warning-text">
          ¿Estás seguro de que deseas eliminar permanentemente el archivo fragmento:
          <strong class="highlight-text">{{ modelToDelete.name }}</strong>?
        </p>
        <div class="alert-box-danger">
          <span>El archivo binario .frag en disco será eliminado permanentemente de <code>storage/models/</code> y su registro se removerá de SQLite.</span>
        </div>
        <div class="sub-modal-actions">
          <button type="button" class="btn-cancel" @click="showDeleteModelModal = false">Cancelar</button>
          <button type="button" class="btn-danger-confirm" @click="confirmDeleteModel">
            Sí, Eliminar Modelo
          </button>
        </div>
      </div>
    </div>

    <!-- ========================================== -->
    <!-- DIALOG: DETALLES DEL MODELO                -->
    <!-- ========================================== -->
    <div v-if="showModelDetailsModal && selectedModelDetail" class="sub-modal-backdrop" @click.self="showModelDetailsModal = false">
      <div class="sub-modal-card details-card">
        <h4 class="sub-modal-title">ℹ️ Detalles del Modelo FRAG</h4>
        <div class="details-list">
          <div class="detail-row">
            <span class="detail-label">Nombre de archivo:</span>
            <span class="detail-value select-all">{{ selectedModelDetail.name }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Proyecto:</span>
            <span class="detail-value">{{ selectedModelDetail.projectName || 'Sin proyecto' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">ID del modelo:</span>
            <span class="detail-value code-font">{{ selectedModelDetail.id }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Ruta de almacenamiento:</span>
            <span class="detail-value code-font">{{ selectedModelDetail.storagePath }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Tamaño en disco:</span>
            <span class="detail-value">{{ selectedModelDetail.sizeFormatted }} ({{ selectedModelDetail.sizeBytes.toLocaleString() }} bytes)</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Estado en SQLite:</span>
            <span class="detail-value">{{ selectedModelDetail.status }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Disponibilidad en disco:</span>
            <span class="detail-value" :class="selectedModelDetail.fileExists ? 'text-success' : 'text-danger'">
              {{ selectedModelDetail.fileExists ? '✓ Archivo verificado en disco' : '✗ Archivo faltante' }}
            </span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Fecha de creación:</span>
            <span class="detail-value">{{ formatDate(selectedModelDetail.createdAt) }}</span>
          </div>
        </div>
        <div class="sub-modal-actions">
          <button type="button" class="btn-cancel" @click="showModelDetailsModal = false">Cerrar</button>
          <button
            v-if="selectedModelDetail.fileExists"
            type="button"
            class="btn-confirm"
            @click="onLoadSingleModel(selectedModelDetail); showModelDetailsModal = false"
          >
            ⚡ Abrir en Visor
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import {
  listCachedProjects,
  deleteCachedProject,
  clearAllCachedProjects,
} from '../services/frag-cache';
import {
  fetchBackendProjects,
  createBackendProject,
  updateBackendProject,
  deleteBackendProject,
  fetchBackendModels,
  deleteBackendModel,
  type BackendProject,
  type BackendModelItem,
} from '../services/backend-client';
import { isAdmin } from '../services/auth-service';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'loadCached', id: string): void;
  (e: 'loadBackend', project: BackendProject): void;
  (e: 'loadModel', model: BackendModelItem): void;
}>();

// Tabs
const activeTab = ref<'projects' | 'models' | 'cache'>('projects');

// Feedback
const feedbackMessage = ref('');
const feedbackType = ref<'success' | 'error' | 'info'>('info');

const setFeedback = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
  feedbackMessage.value = msg;
  feedbackType.value = type;
  setTimeout(() => {
    if (feedbackMessage.value === msg) {
      feedbackMessage.value = '';
    }
  }, 4500);
};

// Projects State
const projectsList = ref<BackendProject[]>([]);
const projectSearch = ref('');
const isLoadingProjects = ref(false);
const expandedProjects = ref<Record<string, boolean>>({});

// Models State
const modelsList = ref<BackendModelItem[]>([]);
const modelSearch = ref('');
const selectedProjectFilter = ref('all');
const selectedStatusFilter = ref('all');
const isLoadingModels = ref(false);

// Cache State
const cachedList = ref<Array<{ id: string; name: string; totalBytes: number; timestamp: number }>>([]);

// Sub-modals state
const showCreateProjectModal = ref(false);
const newProjectName = ref('');
const newProjectDesc = ref('');

const showEditProjectModal = ref(false);
const editProjectId = ref('');
const editProjectName = ref('');
const editProjectDesc = ref('');

const showDeleteProjectModal = ref(false);
const projectToDelete = ref<BackendProject | null>(null);

const showDeleteModelModal = ref(false);
const modelToDelete = ref<BackendModelItem | null>(null);

const showModelDetailsModal = ref(false);
const selectedModelDetail = ref<BackendModelItem | null>(null);

// Refresh functions
const refreshProjects = async () => {
  isLoadingProjects.value = true;
  try {
    projectsList.value = await fetchBackendProjects(projectSearch.value);
  } catch (err: any) {
    setFeedback(`Error cargando proyectos: ${err.message}`, 'error');
  } finally {
    isLoadingProjects.value = false;
  }
};

const refreshModels = async () => {
  isLoadingModels.value = true;
  try {
    modelsList.value = await fetchBackendModels({
      query: modelSearch.value,
      projectId: selectedProjectFilter.value !== 'all' ? selectedProjectFilter.value : undefined,
      status: selectedStatusFilter.value !== 'all' ? selectedStatusFilter.value : undefined,
    });
  } catch (err: any) {
    setFeedback(`Error cargando modelos: ${err.message}`, 'error');
  } finally {
    isLoadingModels.value = false;
  }
};

const refreshCache = async () => {
  try {
    cachedList.value = await listCachedProjects();
  } catch (err: any) {
    console.warn('Error leyendo caché IndexedDB:', err);
  }
};

const refreshAll = async () => {
  await Promise.all([refreshProjects(), refreshModels(), refreshCache()]);
};

// Debounced Search Handlers
let searchDebounceTimer: any = null;
const onProjectSearchChange = () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    refreshProjects();
  }, 250);
};

const onModelFilterChange = () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    refreshModels();
  }, 250);
};

const filteredModels = computed(() => modelsList.value);

// Accordion toggle for project models
const toggleProjectDrawer = (projectId: string) => {
  expandedProjects.value[projectId] = !expandedProjects.value[projectId];
};

// Actions on Projects
const openCreateProjectModal = () => {
  newProjectName.value = '';
  newProjectDesc.value = '';
  showCreateProjectModal.value = true;
};

const submitCreateProject = async () => {
  if (!newProjectName.value.trim()) return;
  try {
    await createBackendProject(newProjectName.value, newProjectDesc.value);
    showCreateProjectModal.value = false;
    setFeedback('Proyecto creado exitosamente.', 'success');
    await refreshProjects();
  } catch (err: any) {
    setFeedback(`Error creando proyecto: ${err.message}`, 'error');
  }
};

const openEditProjectModal = (proj: BackendProject) => {
  editProjectId.value = proj.id;
  editProjectName.value = proj.name;
  editProjectDesc.value = proj.description || '';
  showEditProjectModal.value = true;
};

const submitEditProject = async () => {
  if (!editProjectName.value.trim()) return;
  try {
    await updateBackendProject(editProjectId.value, {
      name: editProjectName.value,
      description: editProjectDesc.value,
    });
    showEditProjectModal.value = false;
    setFeedback('Proyecto actualizado correctamente.', 'success');
    await refreshProjects();
    await refreshModels();
  } catch (err: any) {
    setFeedback(`Error actualizando proyecto: ${err.message}`, 'error');
  }
};

const promptDeleteProject = (proj: BackendProject) => {
  projectToDelete.value = proj;
  showDeleteProjectModal.value = true;
};

const confirmDeleteProject = async () => {
  if (!projectToDelete.value) return;
  try {
    const res = await deleteBackendProject(projectToDelete.value.id);
    showDeleteProjectModal.value = false;
    setFeedback(`Proyecto eliminado con éxito (${res.deletedModelsCount} modelos borrados).`, 'success');
    projectToDelete.value = null;
    await refreshProjects();
    await refreshModels();
  } catch (err: any) {
    setFeedback(`Error al eliminar proyecto: ${err.message}`, 'error');
  }
};

// Actions on Models
const promptDeleteModel = (model: BackendModelItem) => {
  modelToDelete.value = model;
  showDeleteModelModal.value = true;
};

const confirmDeleteModel = async () => {
  if (!modelToDelete.value) return;
  try {
    await deleteBackendModel(modelToDelete.value.id);
    showDeleteModelModal.value = false;
    setFeedback(`Modelo "${modelToDelete.value.name}" eliminado correctamente.`, 'success');
    modelToDelete.value = null;
    await refreshModels();
    await refreshProjects();
  } catch (err: any) {
    setFeedback(`Error al eliminar modelo: ${err.message}`, 'error');
  }
};

const openModelDetailsModal = (model: BackendModelItem) => {
  selectedModelDetail.value = model;
  showModelDetailsModal.value = true;
};

// Load Actions
const onLoadProject = (proj: BackendProject) => {
  emit('loadBackend', proj);
  emit('update:modelValue', false);
};

const onLoadSingleModel = (model: BackendModelItem) => {
  emit('loadModel', model);
  emit('update:modelValue', false);
};

const onLoadCached = (id: string) => {
  emit('loadCached', id);
  emit('update:modelValue', false);
};

const onDeleteCached = async (id: string) => {
  await deleteCachedProject(id);
  await refreshCache();
  setFeedback('Elemento eliminado de la caché local.', 'info');
};

const onClearCache = async () => {
  if (confirm('¿Deseas vaciar toda la caché local de modelos del navegador?')) {
    await clearAllCachedProjects();
    cachedList.value = [];
    setFeedback('Caché local vaciada completamente.', 'info');
  }
};

// Lifecycle
watch(
  () => props.modelValue,
  (val) => {
    if (val) refreshAll();
  }
);

onMounted(() => {
  refreshAll();
});

const formatDate = (ms: number) => {
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
};
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100000;
  padding: 16px;
}

.modal-card {
  width: 100%;
  max-width: 820px;
  height: 88vh;
  max-height: 850px;
  background: #0f172a;
  border: 1px solid rgba(56, 189, 248, 0.28);
  border-radius: 16px;
  box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.85);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #f1f5f9;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(15, 23, 42, 0.8);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon {
  font-size: 1.6rem;
}

.modal-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: #ffffff;
}

.modal-subtitle {
  margin: 2px 0 0;
  font-size: 0.8rem;
  color: #94a3b8;
}

.close-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.tab-bar {
  display: flex;
  background: rgba(30, 41, 59, 0.65);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  padding: 0 16px;
  gap: 8px;
}

.tab-btn {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: #94a3b8;
  padding: 12px 14px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-btn:hover {
  color: #e2e8f0;
}

.tab-btn.active {
  color: #38bdf8;
  border-bottom-color: #38bdf8;
}

.feedback-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  font-size: 0.82rem;
  font-weight: 500;
}

.feedback-banner.success {
  background: rgba(16, 185, 129, 0.2);
  color: #6ee7b7;
  border-bottom: 1px solid rgba(16, 185, 129, 0.3);
}

.feedback-banner.error {
  background: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
  border-bottom: 1px solid rgba(239, 68, 68, 0.3);
}

.feedback-banner.info {
  background: rgba(56, 189, 248, 0.15);
  color: #7dd3fc;
  border-bottom: 1px solid rgba(56, 189, 248, 0.25);
}

.dismiss-btn {
  background: transparent;
  border: none;
  color: currentColor;
  cursor: pointer;
  font-size: 0.8rem;
}

.modal-body {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
}

.tab-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.search-box {
  position: relative;
  flex: 1;
  min-width: 240px;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 10px;
  font-size: 0.85rem;
  opacity: 0.6;
}

.search-input {
  width: 100%;
  background: rgba(30, 41, 59, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 7px 32px 7px 32px;
  color: #ffffff;
  font-size: 0.82rem;
  outline: none;
  transition: all 0.2s;
}

.search-input:focus {
  border-color: #38bdf8;
  background: rgba(30, 41, 59, 0.95);
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
}

.clear-search-btn {
  position: absolute;
  right: 8px;
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 0.75rem;
  padding: 2px 4px;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-select {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 7px 10px;
  color: #e2e8f0;
  font-size: 0.8rem;
  outline: none;
  cursor: pointer;
}

.primary-btn-sm {
  background: #0284c7;
  border: none;
  color: #ffffff;
  font-size: 0.8rem;
  font-weight: 600;
  padding: 7px 14px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.primary-btn-sm:hover {
  background: #0369a1;
  box-shadow: 0 2px 8px rgba(2, 132, 199, 0.4);
}

.refresh-btn-sm {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #e2e8f0;
  font-size: 0.85rem;
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
}

.refresh-btn-sm:hover {
  background: rgba(255, 255, 255, 0.15);
}

.danger-btn-sm {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #fca5a5;
  font-size: 0.75rem;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
}

.danger-btn-sm:hover {
  background: rgba(239, 68, 68, 0.3);
  color: #ffffff;
}

.info-tag {
  font-size: 0.78rem;
  color: #94a3b8;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 48px 20px;
  color: #94a3b8;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(56, 189, 248, 0.2);
  border-top-color: #38bdf8;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 12px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-icon {
  font-size: 2.6rem;
  display: block;
  margin-bottom: 8px;
  opacity: 0.6;
}

.empty-hint {
  font-size: 0.78rem;
  color: #64748b;
  display: block;
  margin-top: 4px;
}

/* Projects Grid & Cards */
.project-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.project-card {
  background: rgba(30, 41, 59, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 14px 16px;
  transition: all 0.2s ease;
}

.project-card:hover {
  background: rgba(30, 41, 59, 0.85);
  border-color: rgba(56, 189, 248, 0.3);
}

.project-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.project-info {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex: 1;
  overflow: hidden;
}

.project-icon {
  font-size: 1.5rem;
  margin-top: 2px;
}

.project-text {
  flex: 1;
  overflow: hidden;
}

.project-name {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-description {
  margin: 4px 0 0;
  font-size: 0.78rem;
  color: #94a3b8;
  line-height: 1.35;
}

.project-meta-badges {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.badge {
  font-size: 0.72rem;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  color: #cbd5e1;
}

.badge-models {
  background: rgba(56, 189, 248, 0.12);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.25);
}

.project-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-btn {
  border: none;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.load-btn {
  background: #0284c7;
  color: #ffffff;
}

.load-btn:hover:not(:disabled) {
  background: #0369a1;
  box-shadow: 0 2px 8px rgba(2, 132, 199, 0.4);
}

.edit-btn,
.details-btn {
  background: rgba(255, 255, 255, 0.08);
  color: #cbd5e1;
  padding: 6px 10px;
}

.edit-btn:hover,
.details-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
}

.delete-btn {
  background: rgba(239, 68, 68, 0.1);
  color: #fca5a5;
  padding: 6px 10px;
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.25);
  color: #ffffff;
}

/* Collapsible Models Sublist */
.project-models-drawer {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.drawer-toggle {
  background: transparent;
  border: none;
  color: #38bdf8;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 0;
}

.drawer-toggle:hover {
  text-decoration: underline;
}

.models-sublist {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-left: 8px;
}

.sub-model-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 0.78rem;
}

.sub-model-info {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
}

.sub-icon {
  font-size: 0.9rem;
}

.sub-name {
  color: #f1f5f9;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sub-size {
  color: #94a3b8;
  font-size: 0.72rem;
}

.status-pill {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 12px;
  white-space: nowrap;
}

.status-ok {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.status-missing {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.btn-sub-action {
  background: #0369a1;
  border: none;
  color: #ffffff;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
}

.btn-sub-action:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* Models Tab Grid */
.models-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.model-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(30, 41, 59, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 12px 16px;
  transition: all 0.2s;
}

.model-item:hover {
  background: rgba(30, 41, 59, 0.85);
  border-color: rgba(56, 189, 248, 0.3);
}

.model-item-main {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  overflow: hidden;
}

.model-icon {
  font-size: 1.4rem;
}

.model-details {
  flex: 1;
  overflow: hidden;
}

.model-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.model-name {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-meta-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  color: #94a3b8;
  margin-top: 3px;
  flex-wrap: wrap;
}

.project-tag {
  color: #38bdf8;
  font-weight: 500;
}

.model-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 12px;
}

/* Sub-Modals (Create, Edit, Delete, Details) */
.sub-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100010;
  padding: 20px;
}

.sub-modal-card {
  width: 100%;
  max-width: 460px;
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.7);
  color: #f1f5f9;
}

.details-card {
  max-width: 560px;
}

.sub-modal-title {
  margin: 0 0 16px;
  font-size: 1.05rem;
  font-weight: 700;
}

.text-danger {
  color: #f87171;
}

.form-group {
  margin-bottom: 14px;
}

.form-label {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  color: #94a3b8;
  margin-bottom: 6px;
}

.form-input,
.form-textarea {
  width: 100%;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 8px 12px;
  color: #ffffff;
  font-size: 0.85rem;
  outline: none;
  font-family: inherit;
  box-sizing: border-box;
}

.form-input:focus,
.form-textarea:focus {
  border-color: #38bdf8;
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
}

.sub-modal-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.btn-cancel {
  background: rgba(255, 255, 255, 0.08);
  border: none;
  color: #cbd5e1;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-cancel:hover {
  background: rgba(255, 255, 255, 0.15);
}

.btn-confirm {
  background: #0284c7;
  border: none;
  color: #ffffff;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-confirm:hover:not(:disabled) {
  background: #0369a1;
}

.btn-confirm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-danger-confirm {
  background: #dc2626;
  border: none;
  color: #ffffff;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-danger-confirm:hover {
  background: #b91c1c;
}

.delete-warning-text {
  font-size: 0.85rem;
  color: #cbd5e1;
  line-height: 1.45;
  margin-bottom: 12px;
}

.highlight-text {
  color: #ffffff;
}

.alert-box-danger {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 0.78rem;
  color: #fca5a5;
  line-height: 1.4;
}

.alert-box-danger ul {
  margin: 6px 0 0;
  padding-left: 18px;
}

/* Details list */
.details-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 0.82rem;
}

.detail-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  padding-bottom: 8px;
}

.detail-label {
  color: #94a3b8;
  font-size: 0.74rem;
  font-weight: 600;
}

.detail-value {
  color: #f1f5f9;
  word-break: break-all;
}

.code-font {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.76rem;
  color: #7dd3fc;
  background: rgba(15, 23, 42, 0.6);
  padding: 3px 6px;
  border-radius: 4px;
}

.text-success {
  color: #34d399;
}
</style>
