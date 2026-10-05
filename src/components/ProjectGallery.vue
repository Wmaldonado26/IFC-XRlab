<template>
  <div class="gallery-container">
    <!-- Header -->
    <header class="gallery-header">
      <div class="header-brand">
        <div class="brand-logo-wrap">
          <img src="../assets/bastto-logo.svg" alt="IFC-XRlab Logo" class="brand-logo" />
        </div>
        <div class="brand-text">
          <div class="brand-title-row">
            <h1 class="brand-title">IFC-XRlab</h1>
            <span class="brand-version">BIM Engine</span>
          </div>
          <p class="brand-subtitle">Galería Principal de Proyectos & Modelos 3D</p>
        </div>
      </div>

      <!-- User Session Actions -->
      <div class="header-user">
        <template v-if="currentUser">
          <div class="user-pill" :title="`Sesión iniciada: ${currentUser.email}`">
            <div class="user-avatar" :class="currentUser.role">
              {{ (currentUser.name || currentUser.email).charAt(0).toUpperCase() }}
            </div>
            <div class="user-info">
              <span class="user-name">{{ currentUser.name }}</span>
              <span class="user-role-badge" :class="currentUser.role">
                {{ currentUser.role === 'admin' ? 'Administrador' : 'Usuario' }}
              </span>
            </div>
          </div>

          <button
            v-if="isAdmin"
            type="button"
            class="header-btn admin-btn"
            title="Administración de Usuarios y Permisos"
            @click="isAdminModalOpen = true"
          >
            🛡️ Panel de Usuarios
          </button>

          <button
            type="button"
            class="header-btn logout-btn"
            title="Cerrar Sesión"
            @click="handleLogout"
          >
            Cerrar Sesión
          </button>
        </template>

        <template v-else>
          <button
            type="button"
            class="header-btn login-btn"
            @click="$emit('request-login')"
          >
            🔐 Iniciar Sesión
          </button>
        </template>
      </div>
    </header>

    <!-- Main Content -->
    <main class="gallery-main">
      <!-- Welcome Hero Section -->
      <section class="gallery-hero">
        <div class="hero-content">
          <div class="hero-text-block">
            <h2 class="hero-title">
              Proyectos Disponibles
              <span v-if="currentUser" class="hero-user-greet">· {{ currentUser.name }}</span>
            </h2>
            <p class="hero-desc">
              Selecciona un proyecto para abrir sus modelos BIM optimizados (.frag) en el visor 3D de alta velocidad.
            </p>
          </div>

          <!-- Quick Metrics Bar -->
          <div class="hero-metrics">
            <div class="metric-card">
              <span class="metric-value">{{ projectsList.length }}</span>
              <span class="metric-label">Proyectos</span>
            </div>
            <div class="metric-card">
              <span class="metric-value">{{ totalModelsCount }}</span>
              <span class="metric-label">Modelos FRAG</span>
            </div>
            <div class="metric-card">
              <span class="metric-value">{{ totalStorageMB }} MB</span>
              <span class="metric-label">Tamaño Total</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Feedback Banner -->
      <div v-if="feedbackMessage" class="feedback-banner" :class="feedbackType">
        <span class="feedback-icon">{{ feedbackType === 'error' ? '⚠️' : '✓' }}</span>
        <span class="feedback-text">{{ feedbackMessage }}</span>
        <button type="button" class="dismiss-feedback-btn" @click="feedbackMessage = ''">✕</button>
      </div>

      <!-- Toolbar / Filters -->
      <section class="gallery-toolbar">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Buscar por nombre o descripción de proyecto..."
            class="search-input"
            @input="onSearchInput"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="clear-search-btn"
            title="Limpiar búsqueda"
            @click="searchQuery = ''; filterProjects()"
          >
            ✕
          </button>
        </div>

        <div class="filter-group">
          <!-- Filter by Model Availability -->
          <select v-model="filterStatus" class="toolbar-select" @change="filterProjects">
            <option value="all">Todos los proyectos</option>
            <option value="with_models">Con modelos listos</option>
            <option value="empty">Sin modelos aún</option>
          </select>

          <!-- Sorting -->
          <select v-model="sortBy" class="toolbar-select" @change="filterProjects">
            <option value="recent">Más recientes primero</option>
            <option value="name_asc">Nombre (A → Z)</option>
            <option value="name_desc">Nombre (Z → A)</option>
            <option value="size_desc">Mayor tamaño</option>
            <option value="models_desc">Más modelos</option>
          </select>

          <!-- Refresh -->
          <button
            type="button"
            class="toolbar-icon-btn"
            title="Recargar catálogo desde SQLite"
            :disabled="isLoading"
            @click="loadProjects"
          >
            <span :class="{ 'spin-anim': isLoading }">🔄</span>
          </button>

          <!-- Admin: Create Project -->
          <button
            v-if="isAdmin"
            type="button"
            class="primary-btn-accent"
            @click="openCreateModal"
          >
            ➕ Nuevo Proyecto
          </button>
        </div>
      </section>

      <!-- Grid or Empty/Loading States -->
      <div v-if="isLoading" class="gallery-loading">
        <div class="spinner-large"></div>
        <p class="loading-label">Consultando catálogo persistente en SQLite...</p>
      </div>

      <div v-else-if="filteredProjects.length === 0" class="gallery-empty">
        <template v-if="searchQuery || filterStatus !== 'all'">
          <div class="empty-icon-wrap">🔍</div>
          <h3 class="empty-title">Sin resultados de búsqueda</h3>
          <p class="empty-desc">
            No se encontraron proyectos que coincidan con "{{ searchQuery }}".
          </p>
          <button type="button" class="empty-action-btn" @click="resetFilters">
            Restablecer Filtros
          </button>
        </template>

        <template v-else-if="!isAdmin">
          <div class="empty-icon-wrap lock-icon">🔒</div>
          <h3 class="empty-title">Sin proyectos asignados</h3>
          <p class="empty-desc">
            Tu cuenta de usuario no tiene proyectos asignados actualmente en el sistema.
            Por favor, solicita a un administrador que te conceda acceso a los proyectos que correspondan a tu labor.
          </p>
        </template>

        <template v-else>
          <div class="empty-icon-wrap">📂</div>
          <h3 class="empty-title">No hay proyectos registrados</h3>
          <p class="empty-desc">
            Comienza creando un proyecto o convirtiendo un archivo IFC masivo mediante el motor de streaming.
          </p>
          <button type="button" class="primary-btn-accent" style="margin-top: 16px;" @click="openCreateModal">
            ➕ Crear Primer Proyecto
          </button>
        </template>
      </div>

      <!-- Project Cards Grid -->
      <div v-else class="project-grid">
        <article
          v-for="project in filteredProjects"
          :key="project.id"
          class="project-card"
        >
          <!-- Blueprint Card Header / Thumbnail Banner -->
          <div class="card-media">
            <div class="blueprint-bg">
              <svg class="blueprint-svg" viewBox="0 0 200 120" preserveAspectRatio="none">
                <defs>
                  <pattern id="cardGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(56, 189, 248, 0.12)" stroke-width="0.8" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#cardGrid)" />
                <!-- Stylized vessel / structural isometric lines -->
                <path d="M 30,85 L 100,30 L 170,85 L 100,105 Z" fill="none" stroke="rgba(56, 189, 248, 0.45)" stroke-width="1.2" />
                <path d="M 100,30 L 100,105" fill="none" stroke="rgba(56, 189, 248, 0.35)" stroke-width="1" />
                <path d="M 65,58 L 135,58" fill="none" stroke="rgba(56, 189, 248, 0.25)" stroke-width="1" stroke-dasharray="3,3" />
              </svg>
            </div>

            <!-- Status Badge -->
            <div class="card-status-chip" :class="project.modelsCount > 0 ? 'status-ready' : 'status-empty'">
              <span class="status-indicator-dot"></span>
              <span>{{ project.modelsCount > 0 ? `${project.modelsCount} ${project.modelsCount === 1 ? 'modelo listo' : 'modelos listos'}` : 'Sin modelos aún' }}</span>
            </div>

            <!-- Size Badge -->
            <div v-if="project.modelsCount > 0" class="card-size-chip">
              {{ project.totalPartsSizeMB }} MB
            </div>
          </div>

          <!-- Card Body -->
          <div class="card-body">
            <h3 class="project-title" :title="project.name">{{ project.name }}</h3>

            <p class="project-desc" :class="{ 'desc-empty': !project.description }">
              {{ project.description || 'Sin descripción registrada' }}
            </p>

            <div class="project-meta-row">
              <span class="meta-item" title="Fecha de registro">
                📅 {{ formatDate(project.createdAt) }}
              </span>
              <span class="meta-item" title="Partes fragmentadas">
                🧩 {{ project.parts.length || project.modelsCount }} partes
              </span>
            </div>
          </div>

          <!-- Card Footer / Actions -->
          <div class="card-footer">
            <button
              v-if="project.modelsCount === 0 && isAdmin"
              type="button"
              class="add-model-quick-btn"
              title="Añadir el primer modelo a este proyecto"
              @click="openAddModelModal(project)"
            >
              <span class="btn-icon">➕</span>
              <span>Añadir Modelo</span>
            </button>
            <button
              v-else
              type="button"
              class="open-project-btn"
              :class="{ 'btn-disabled': project.modelsCount === 0 }"
              :disabled="project.modelsCount === 0"
              :title="project.modelsCount > 0 ? 'Abrir este proyecto en el visor 3D' : 'Este proyecto aún no contiene modelos FRAG listos para visualización'"
              @click="handleOpenProject(project)"
            >
              <span class="btn-icon">⚡</span>
              <span>{{ project.modelsCount > 0 ? 'Abrir Proyecto' : 'Sin Modelos' }}</span>
            </button>

            <!-- Admin Options (Add Model / Edit / Delete) -->
            <div v-if="isAdmin" class="admin-card-actions">
              <button
                type="button"
                class="card-action-icon-btn add-model"
                title="Añadir modelo al proyecto (Convertir IFC o Subir FRAG)"
                @click="openAddModelModal(project)"
              >
                ➕
              </button>
              <button
                type="button"
                class="card-action-icon-btn edit"
                title="Editar nombre o descripción"
                @click="openEditModal(project)"
              >
                ✏️
              </button>
              <button
                type="button"
                class="card-action-icon-btn delete"
                title="Eliminar proyecto permanentemente"
                @click="promptDeleteProject(project)"
              >
                🗑️
              </button>
            </div>
          </div>
        </article>
      </div>
    </main>

    <!-- Modal Aux: Crear Proyecto (Admin) -->
    <div v-if="showCreateModal" class="modal-backdrop" @click.self="showCreateModal = false">
      <div class="dialog-card">
        <div class="dialog-header">
          <h3>➕ Nuevo Proyecto BIM</h3>
          <button type="button" class="dialog-close-btn" @click="showCreateModal = false">✕</button>
        </div>
        <form @submit.prevent="submitCreateProject">
          <div class="form-group">
            <label class="form-label" for="proj-name">Nombre del Proyecto *</label>
            <input
              id="proj-name"
              v-model="createForm.name"
              type="text"
              required
              placeholder="Ej. Buque_Oceanografico_2026.ifc"
              class="form-input"
            />
          </div>
          <div class="form-group">
            <label class="form-label" for="proj-desc">Descripción (Opcional)</label>
            <textarea
              id="proj-desc"
              v-model="createForm.description"
              rows="3"
              placeholder="Detalles sobre el buque, sistema de tuberías, estructuras o arquitectura..."
              class="form-textarea"
            ></textarea>
          </div>
          <div class="dialog-actions">
            <button type="button" class="btn-cancel" @click="showCreateModal = false">Cancelar</button>
            <button type="submit" class="btn-confirm" :disabled="isSubmitting">
              <span v-if="isSubmitting" class="spinner-sm"></span>
              <span v-else>Guardar Proyecto</span>
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal Aux: Editar Proyecto (Admin) -->
    <div v-if="showEditModal && editingProject" class="modal-backdrop" @click.self="showEditModal = false">
      <div class="dialog-card">
        <div class="dialog-header">
          <h3>✏️ Editar Proyecto</h3>
          <button type="button" class="dialog-close-btn" @click="showEditModal = false">✕</button>
        </div>
        <form @submit.prevent="submitUpdateProject">
          <div class="form-group">
            <label class="form-label" for="edit-proj-name">Nombre del Proyecto *</label>
            <input
              id="edit-proj-name"
              v-model="editForm.name"
              type="text"
              required
              class="form-input"
            />
          </div>
          <div class="form-group">
            <label class="form-label" for="edit-proj-desc">Descripción</label>
            <textarea
              id="edit-proj-desc"
              v-model="editForm.description"
              rows="3"
              class="form-textarea"
            ></textarea>
          </div>
          <div class="dialog-actions">
            <button type="button" class="btn-cancel" @click="showEditModal = false">Cancelar</button>
            <button type="submit" class="btn-confirm" :disabled="isSubmitting">
              <span v-if="isSubmitting" class="spinner-sm"></span>
              <span v-else>Guardar Cambios</span>
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal Aux: Confirmar Eliminación (Admin) -->
    <div v-if="showDeleteModal && projectToDelete" class="modal-backdrop" @click.self="showDeleteModal = false">
      <div class="dialog-card danger-card">
        <div class="dialog-header">
          <h3 class="danger-title">⚠️ Eliminar Proyecto</h3>
          <button type="button" class="dialog-close-btn" @click="showDeleteModal = false">✕</button>
        </div>
        <p class="dialog-warning-text">
          ¿Estás seguro de que deseas eliminar permanentemente el proyecto:
          <strong>{{ projectToDelete.name }}</strong>?
        </p>
        <p class="dialog-sub-text">
          Se eliminarán sus registros en SQLite y {{ projectToDelete.modelsCount }} archivo(s) .frag asociados de disco.
        </p>
        <div class="dialog-actions">
          <button type="button" class="btn-cancel" @click="showDeleteModal = false">Cancelar</button>
          <button
            type="button"
            class="btn-danger-confirm"
            :disabled="isSubmitting"
            @click="submitDeleteProject"
          >
            <span v-if="isSubmitting" class="spinner-sm"></span>
            <span v-else>Sí, Eliminar Proyecto</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: Añadir Modelo al Proyecto (Admin) -->
    <div
      v-if="showAddModelModal && activeProjectForModel"
      class="modal-backdrop"
      @click.self="!isConvertingIfc && !isUploadingFrag ? (showAddModelModal = false) : null"
    >
      <div class="dialog-card add-model-dialog">
        <div class="dialog-header">
          <div class="dialog-header-title">
            <span class="header-icon">📦</span>
            <div>
              <h3>Añadir Modelo BIM</h3>
              <p class="dialog-header-subtitle">
                Proyecto: <strong>{{ activeProjectForModel.name }}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            class="dialog-close-btn"
            :disabled="isConvertingIfc || isUploadingFrag"
            @click="showAddModelModal = false"
          >
            ✕
          </button>
        </div>

        <!-- Method Switcher Cards / Tabs -->
        <div class="model-method-tabs">
          <button
            type="button"
            class="method-tab-btn"
            :class="{ active: activeModelTab === 'ifc' }"
            :disabled="isConvertingIfc || isUploadingFrag"
            @click="activeModelTab = 'ifc'"
          >
            <span class="tab-icon">⚙️</span>
            <div class="tab-text">
              <span class="tab-title">Opción A: Convertir IFC a FRAG</span>
              <span class="tab-desc">Subir .ifc → procesar en backend 64-bit → registrar FRAG</span>
            </div>
          </button>

          <button
            type="button"
            class="method-tab-btn"
            :class="{ active: activeModelTab === 'frag' }"
            :disabled="isConvertingIfc || isUploadingFrag"
            @click="activeModelTab = 'frag'"
          >
            <span class="tab-icon">📤</span>
            <div class="tab-text">
              <span class="tab-title">Opción B: Subir FRAG existente</span>
              <span class="tab-desc">Subir .frag → validar y registrar sin re-conversión</span>
            </div>
          </button>
        </div>

        <div class="modal-tab-content">
          <!-- OPCIÓN A: CONVERTIR IFC -->
          <div v-if="activeModelTab === 'ifc'" class="method-panel">
            <div class="panel-intro">
              <p>
                Selecciona un modelo BIM en formato <strong>.ifc</strong>. El microservicio local procesará las entidades en streaming y persistirá los fragmentos generados directamente en este proyecto.
              </p>
            </div>

            <!-- IFC File Selector Area -->
            <div
              class="drop-zone"
              :class="{ 'has-file': Boolean(ifcFile), disabled: isConvertingIfc }"
              @click="!isConvertingIfc ? ifcInputRef?.click() : null"
            >
              <input
                ref="ifcInputRef"
                type="file"
                accept=".ifc"
                style="display: none"
                :disabled="isConvertingIfc"
                @change="onIfcFileSelected"
              />
              <div v-if="!ifcFile" class="drop-zone-placeholder">
                <span class="dz-icon">🚢</span>
                <span class="dz-prompt">Haz clic para seleccionar un archivo .ifc</span>
                <span class="dz-subtext">Formatos IFC2x3 e IFC4 compatibles</span>
              </div>
              <div v-else class="dz-selected-file">
                <span class="dz-file-icon">📄</span>
                <div class="dz-file-meta">
                  <span class="dz-file-name" :title="ifcFile.name">{{ ifcFile.name }}</span>
                  <span class="dz-file-size">{{ (ifcFile.size / (1024 * 1024)).toFixed(2) }} MB</span>
                </div>
                <button
                  v-if="!isConvertingIfc"
                  type="button"
                  class="dz-change-btn"
                  @click.stop="ifcInputRef?.click()"
                >
                  Cambiar
                </button>
              </div>
            </div>

            <!-- Error alert -->
            <div v-if="ifcError" class="method-alert alert-error">
              <span class="alert-icon">⚠️</span>
              <span class="alert-text">{{ ifcError }}</span>
            </div>

            <!-- In-progress HUD -->
            <div v-if="isConvertingIfc" class="conversion-progress-box">
              <div class="c-progress-header">
                <span class="c-stage">{{ ifcProgressStage || 'Procesando conversión IFC...' }}</span>
                <span class="c-percent">{{ ifcProgressPercent }}%</span>
              </div>
              <div class="c-track">
                <div class="c-fill" :style="{ width: `${Math.max(ifcProgressPercent, 3)}%` }"></div>
              </div>
              <div v-if="ifcProgressElapsed" class="c-time">
                ⏱️ Tiempo transcurrido: {{ ifcProgressElapsed }}
              </div>
            </div>

            <!-- Success State -->
            <div v-if="ifcConversionSuccess" class="method-alert alert-success">
              <span class="alert-icon">✓</span>
              <div class="alert-content">
                <strong>¡Conversión e incorporación exitosa!</strong>
                <p>
                  El modelo se procesó y guardó en almacenamiento persistente ({{ ifcSuccessInfo?.partsCount }} partes, {{ ifcSuccessInfo?.sizeMB }} MB en {{ ifcSuccessInfo?.duration }}s).
                </p>
              </div>
            </div>

            <div class="dialog-actions">
              <button
                type="button"
                class="btn-cancel"
                :disabled="isConvertingIfc"
                @click="showAddModelModal = false"
              >
                {{ ifcConversionSuccess ? 'Cerrar' : 'Cancelar' }}
              </button>

              <button
                v-if="ifcConversionSuccess"
                type="button"
                class="btn-confirm btn-viewer-launch"
                @click="openActiveProjectInViewer"
              >
                ⚡ Abrir Proyecto en Visor 3D
              </button>

              <button
                v-else
                type="button"
                class="btn-confirm"
                :disabled="!ifcFile || isConvertingIfc"
                @click="startIfcConversion"
              >
                <span v-if="isConvertingIfc" class="spinner-sm"></span>
                <span v-else>🚀 Convertir y Añadir Modelo</span>
              </button>
            </div>
          </div>

          <!-- OPCIÓN B: SUBIR FRAG EXISTENTE -->
          <div v-if="activeModelTab === 'frag'" class="method-panel">
            <div class="panel-intro">
              <p>
                Sube un archivo <strong>.frag</strong> preconvertido. Se validará su tamaño y cabecera binaria, guardándolo directamente en el catálogo sin conversiones innecesarias.
              </p>
            </div>

            <!-- FRAG File Selector Area -->
            <div
              class="drop-zone"
              :class="{ 'has-file': Boolean(fragFile), disabled: isUploadingFrag }"
              @click="!isUploadingFrag ? fragInputRef?.click() : null"
            >
              <input
                ref="fragInputRef"
                type="file"
                accept=".frag"
                style="display: none"
                :disabled="isUploadingFrag"
                @change="onFragFileSelected"
              />
              <div v-if="!fragFile" class="drop-zone-placeholder">
                <span class="dz-icon">📦</span>
                <span class="dz-prompt">Haz clic para seleccionar un archivo .frag</span>
                <span class="dz-subtext">Archivos binarios Fragments That Open Engine</span>
              </div>
              <div v-else class="dz-selected-file">
                <span class="dz-file-icon">🧩</span>
                <div class="dz-file-meta">
                  <span class="dz-file-name" :title="fragFile.name">{{ fragFile.name }}</span>
                  <span class="dz-file-size">{{ (fragFile.size / (1024 * 1024)).toFixed(2) }} MB</span>
                </div>
                <button
                  v-if="!isUploadingFrag"
                  type="button"
                  class="dz-change-btn"
                  @click.stop="fragInputRef?.click()"
                >
                  Cambiar
                </button>
              </div>
            </div>

            <!-- Error alert -->
            <div v-if="fragError" class="method-alert alert-error">
              <span class="alert-icon">⚠️</span>
              <span class="alert-text">{{ fragError }}</span>
            </div>

            <!-- In-progress HUD -->
            <div v-if="isUploadingFrag" class="conversion-progress-box">
              <div class="c-progress-header">
                <span class="c-stage">Subiendo fragmento al almacenamiento local...</span>
                <span class="c-percent">{{ fragUploadPercent }}%</span>
              </div>
              <div class="c-track">
                <div class="c-fill" :style="{ width: `${Math.max(fragUploadPercent, 3)}%` }"></div>
              </div>
            </div>

            <!-- Success State -->
            <div v-if="fragUploadSuccess" class="method-alert alert-success">
              <span class="alert-icon">✓</span>
              <div class="alert-content">
                <strong>¡Archivo .frag incorporado correctamente!</strong>
                <p>
                  El modelo <strong>{{ fragSuccessModel?.name }}</strong> ({{ fragSuccessModel?.sizeFormatted }}) ha sido validado y registrado en SQLite.
                </p>
              </div>
            </div>

            <div class="dialog-actions">
              <button
                type="button"
                class="btn-cancel"
                :disabled="isUploadingFrag"
                @click="showAddModelModal = false"
              >
                {{ fragUploadSuccess ? 'Cerrar' : 'Cancelar' }}
              </button>

              <button
                v-if="fragUploadSuccess"
                type="button"
                class="btn-confirm btn-viewer-launch"
                @click="openActiveProjectInViewer"
              >
                ⚡ Abrir Proyecto en Visor 3D
              </button>

              <button
                v-else
                type="button"
                class="btn-confirm"
                :disabled="!fragFile || isUploadingFrag"
                @click="startFragUpload"
              >
                <span v-if="isUploadingFrag" class="spinner-sm"></span>
                <span v-else>📤 Subir FRAG</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Panel de Administración de Usuarios Modal -->
    <AdminPanelModal
      v-if="isAdmin"
      v-model="isAdminModalOpen"
      @update:model-value="onAdminModalClose"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  fetchBackendProjects,
  createBackendProject,
  updateBackendProject,
  deleteBackendProject,
  uploadDirectFrag,
  convertIfcViaBackend,
  type BackendProject,
  type BackendModelItem,
} from '../services/backend-client';
import {
  currentUser,
  isAdmin,
  logout,
} from '../services/auth-service';
import AdminPanelModal from './AdminPanelModal.vue';

const emit = defineEmits<{
  (e: 'open-project', project: BackendProject): void;
  (e: 'request-login'): void;
}>();

const projectsList = ref<BackendProject[]>([]);
const isLoading = ref(true);
const isSubmitting = ref(false);

// Filter & Search states
const searchQuery = ref('');
const filterStatus = ref<'all' | 'with_models' | 'empty'>('all');
const sortBy = ref<'recent' | 'name_asc' | 'name_desc' | 'size_desc' | 'models_desc'>('recent');

// Feedback Banner
const feedbackMessage = ref('');
const feedbackType = ref<'success' | 'error'>('success');

function setFeedback(msg: string, type: 'success' | 'error' = 'success') {
  feedbackMessage.value = msg;
  feedbackType.value = type;
}

// Admin Modal
const isAdminModalOpen = ref(false);

// Modals state: Create Project
const showCreateModal = ref(false);
const createForm = ref({ name: '', description: '' });

// Modals state: Edit Project
const showEditModal = ref(false);
const editingProject = ref<BackendProject | null>(null);
const editForm = ref({ name: '', description: '' });

// Modals state: Delete Project
const showDeleteModal = ref(false);
const projectToDelete = ref<BackendProject | null>(null);

// Computed Metrics
const totalModelsCount = computed(() => {
  return projectsList.value.reduce((acc, p) => acc + (p.modelsCount || 0), 0);
});

const totalStorageMB = computed(() => {
  const totalBytes = projectsList.value.reduce((acc, p) => acc + (p.fileSize || 0), 0);
  return (totalBytes / (1024 * 1024)).toFixed(1);
});

// Filtered & Sorted Projects
const filteredProjects = computed(() => {
  let list = [...projectsList.value];

  // 1. Search filter
  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    list = list.filter((p) => {
      const name = (p.name || p.fileName || '').toLowerCase();
      const desc = (p.description || '').toLowerCase();
      return name.includes(q) || desc.includes(q);
    });
  }

  // 2. Status filter
  if (filterStatus.value === 'with_models') {
    list = list.filter((p) => (p.modelsCount || 0) > 0);
  } else if (filterStatus.value === 'empty') {
    list = list.filter((p) => (p.modelsCount || 0) === 0);
  }

  // 3. Sorting
  list.sort((a, b) => {
    switch (sortBy.value) {
      case 'name_asc':
        return (a.name || '').localeCompare(b.name || '');
      case 'name_desc':
        return (b.name || '').localeCompare(a.name || '');
      case 'size_desc':
        return (b.fileSize || 0) - (a.fileSize || 0);
      case 'models_desc':
        return (b.modelsCount || 0) - (a.modelsCount || 0);
      case 'recent':
      default:
        return (b.createdAt || 0) - (a.createdAt || 0);
    }
  });

  return list;
});

async function loadProjects() {
  isLoading.value = true;
  try {
    projectsList.value = await fetchBackendProjects();
  } catch (err: any) {
    setFeedback(err.message || 'Error al consultar proyectos en SQLite.', 'error');
  } finally {
    isLoading.value = false;
  }
}

function onSearchInput() {
  // Realtime search is reactive via computed
}

function filterProjects() {
  // Handled by computed
}

function resetFilters() {
  searchQuery.value = '';
  filterStatus.value = 'all';
  sortBy.value = 'recent';
}

function formatDate(ts: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function handleOpenProject(project: BackendProject) {
  if (!project.modelsCount || project.modelsCount === 0) {
    setFeedback(`El proyecto "${project.name}" aún no contiene modelos FRAG listos.`, 'error');
    return;
  }
  emit('open-project', project);
}

async function handleLogout() {
  await logout();
  projectsList.value = [];
  emit('request-login');
}

// Admin Project CRUD
function openCreateModal() {
  createForm.value = { name: '', description: '' };
  showCreateModal.value = true;
}

async function submitCreateProject() {
  if (!createForm.value.name.trim()) return;
  isSubmitting.value = true;
  try {
    const created = await createBackendProject(
      createForm.value.name.trim(),
      createForm.value.description.trim() || undefined
    );
    setFeedback(`Proyecto "${created.name}" creado con éxito. Ahora puedes añadir modelos mediante conversión IFC o subida directa de FRAG.`);
    showCreateModal.value = false;
    await loadProjects();
    // Prompt administrator to add models immediately to newly created project
    openAddModelModal(created);
  } catch (err: any) {
    setFeedback(err.message || 'Error al crear proyecto.', 'error');
  } finally {
    isSubmitting.value = false;
  }
}

function openEditModal(project: BackendProject) {
  editingProject.value = project;
  editForm.value = {
    name: project.name,
    description: project.description || '',
  };
  showEditModal.value = true;
}

async function submitUpdateProject() {
  if (!editingProject.value || !editForm.value.name.trim()) return;
  isSubmitting.value = true;
  try {
    await updateBackendProject(editingProject.value.id, {
      name: editForm.value.name.trim(),
      description: editForm.value.description.trim() || undefined,
    });
    setFeedback(`Proyecto "${editForm.value.name}" actualizado.`);
    showEditModal.value = false;
    await loadProjects();
  } catch (err: any) {
    setFeedback(err.message || 'Error actualizando proyecto.', 'error');
  } finally {
    isSubmitting.value = false;
  }
}

function promptDeleteProject(project: BackendProject) {
  projectToDelete.value = project;
  showDeleteModal.value = true;
}

async function submitDeleteProject() {
  if (!projectToDelete.value) return;
  isSubmitting.value = true;
  try {
    await deleteBackendProject(projectToDelete.value.id);
    setFeedback(`Proyecto "${projectToDelete.value.name}" eliminado.`);
    showDeleteModal.value = false;
    await loadProjects();
  } catch (err: any) {
    setFeedback(err.message || 'Error al eliminar proyecto.', 'error');
  } finally {
    isSubmitting.value = false;
  }
}

function onAdminModalClose() {
  // Reload projects in case assignments or roles changed
  loadProjects();
}

// ===================================================================
// ADD MODEL WORKFLOW (Method 1: IFC Conversion | Method 2: Direct FRAG)
// ===================================================================
const showAddModelModal = ref(false);
const activeProjectForModel = ref<BackendProject | null>(null);
const activeModelTab = ref<'ifc' | 'frag'>('ifc');

// Option A: Convert IFC state
const ifcFile = ref<File | null>(null);
const ifcInputRef = ref<HTMLInputElement | null>(null);
const isConvertingIfc = ref(false);
const ifcProgressPercent = ref(0);
const ifcProgressStage = ref('');
const ifcProgressElapsed = ref('');
const ifcConversionSuccess = ref(false);
const ifcSuccessInfo = ref<{ partsCount: number; duration: string; sizeMB: string } | null>(null);
const ifcError = ref('');

// Option B: Upload direct FRAG state
const fragFile = ref<File | null>(null);
const fragInputRef = ref<HTMLInputElement | null>(null);
const isUploadingFrag = ref(false);
const fragUploadPercent = ref(0);
const fragUploadSuccess = ref(false);
const fragSuccessModel = ref<BackendModelItem | null>(null);
const fragError = ref('');

function openAddModelModal(project: BackendProject) {
  activeProjectForModel.value = project;
  activeModelTab.value = 'ifc';

  ifcFile.value = null;
  ifcError.value = '';
  ifcConversionSuccess.value = false;
  isConvertingIfc.value = false;
  ifcProgressPercent.value = 0;
  ifcProgressStage.value = '';
  ifcProgressElapsed.value = '';
  ifcSuccessInfo.value = null;

  fragFile.value = null;
  fragError.value = '';
  fragUploadSuccess.value = false;
  isUploadingFrag.value = false;
  fragUploadPercent.value = 0;
  fragSuccessModel.value = null;

  showAddModelModal.value = true;
}

function onIfcFileSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    const file = input.files[0];
    if (!file.name.toLowerCase().endsWith('.ifc')) {
      ifcError.value = 'El archivo seleccionado debe tener extensión .ifc';
      ifcFile.value = null;
      return;
    }
    if (file.size === 0) {
      ifcError.value = 'El archivo seleccionado está vacío (0 bytes).';
      ifcFile.value = null;
      return;
    }
    ifcFile.value = file;
    ifcError.value = '';
    ifcConversionSuccess.value = false;
  }
}

async function startIfcConversion() {
  if (!ifcFile.value || !activeProjectForModel.value || isConvertingIfc.value) return;

  isConvertingIfc.value = true;
  ifcProgressPercent.value = 0;
  ifcProgressStage.value = 'Iniciando subida y conexión con la cola de conversión...';
  ifcProgressElapsed.value = '';
  ifcError.value = '';
  ifcConversionSuccess.value = false;

  try {
    const result = await convertIfcViaBackend(
      ifcFile.value,
      (progress) => {
        ifcProgressPercent.value = progress.percent;
        ifcProgressStage.value = progress.stage;
        if (progress.elapsed) {
          ifcProgressElapsed.value = progress.elapsed;
        }
      },
      activeProjectForModel.value.id
    );

    ifcConversionSuccess.value = true;
    ifcSuccessInfo.value = {
      partsCount: result.parts.length,
      duration: result.durationSec,
      sizeMB: result.totalSizeMB,
    };
    setFeedback(`Conversión completada. ${result.parts.length} fragmento(s) incorporados a "${activeProjectForModel.value.name}".`);
    await loadProjects();
  } catch (err: any) {
    console.error('Error durante la conversión IFC:', err);
    ifcError.value = err.message || 'Error inesperado durante la conversión IFC en el backend.';
  } finally {
    isConvertingIfc.value = false;
  }
}

function onFragFileSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    const file = input.files[0];
    if (!file.name.toLowerCase().endsWith('.frag')) {
      fragError.value = 'El archivo seleccionado debe tener extensión .frag';
      fragFile.value = null;
      return;
    }
    if (file.size === 0) {
      fragError.value = 'El archivo seleccionado está vacío (0 bytes).';
      fragFile.value = null;
      return;
    }
    fragFile.value = file;
    fragError.value = '';
    fragUploadSuccess.value = false;
  }
}

async function startFragUpload() {
  if (!fragFile.value || !activeProjectForModel.value || isUploadingFrag.value) return;

  isUploadingFrag.value = true;
  fragUploadPercent.value = 0;
  fragError.value = '';
  fragUploadSuccess.value = false;

  try {
    const model = await uploadDirectFrag(
      activeProjectForModel.value.id,
      fragFile.value,
      (percent) => {
        fragUploadPercent.value = percent;
      }
    );

    fragUploadSuccess.value = true;
    fragSuccessModel.value = model;
    setFeedback(`Modelo "${model.name}" incorporado exitosamente al proyecto "${activeProjectForModel.value.name}".`);
    await loadProjects();
  } catch (err: any) {
    console.error('Error subiendo archivo .frag:', err);
    fragError.value = err.message || 'Error al subir el archivo .frag al servidor.';
  } finally {
    isUploadingFrag.value = false;
  }
}

function openActiveProjectInViewer() {
  if (!activeProjectForModel.value) return;
  const current = projectsList.value.find((p) => p.id === activeProjectForModel.value!.id) || activeProjectForModel.value;
  showAddModelModal.value = false;
  handleOpenProject(current);
}

onMounted(() => {
  loadProjects();
});
</script>

<style scoped>
.gallery-container {
  min-height: 100vh;
  background: #090d16;
  color: #f1f5f9;
  display: flex;
  flex-direction: column;
  font-family: inherit;
  overflow-x: hidden;
}

/* Header */
.gallery-header {
  height: 68px;
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 28px;
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 14px;
}

.brand-logo-wrap {
  width: 38px;
  height: 38px;
  border-radius: 9px;
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 5px;
}

.brand-logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.brand-text {
  display: flex;
  flex-direction: column;
}

.brand-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.brand-title {
  font-size: 1.15rem;
  font-weight: 800;
  color: #ffffff;
  letter-spacing: -0.02em;
  margin: 0;
}

.brand-version {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  padding: 1px 6px;
  border-radius: 4px;
}

.brand-subtitle {
  font-size: 0.72rem;
  color: #94a3b8;
  margin: 1px 0 0;
}

.header-user {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-pill {
  display: flex;
  align-items: center;
  gap: 9px;
  background: rgba(30, 41, 59, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 5px 12px 5px 6px;
  border-radius: 24px;
}

.user-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.8rem;
  color: #ffffff;
}

.user-avatar.admin {
  background: linear-gradient(135deg, #f59e0b, #d97706);
}

.user-avatar.user {
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
}

.user-info {
  display: flex;
  flex-direction: column;
}

.user-name {
  font-size: 0.78rem;
  font-weight: 600;
  color: #f8fafc;
  max-width: 140px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-role-badge {
  font-size: 0.64rem;
  font-weight: 700;
  text-transform: uppercase;
}

.user-role-badge.admin {
  color: #fbbf24;
}

.user-role-badge.user {
  color: #93c5fd;
}

.header-btn {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #cbd5e1;
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.header-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}

.header-btn.admin-btn {
  background: rgba(245, 158, 11, 0.12);
  border-color: rgba(245, 158, 11, 0.35);
  color: #fbbf24;
}

.header-btn.admin-btn:hover {
  background: rgba(245, 158, 11, 0.25);
}

.header-btn.logout-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.35);
  color: #fca5a5;
}

.header-btn.login-btn {
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  border-color: rgba(59, 130, 246, 0.5);
  color: #ffffff;
}

/* Main Layout */
.gallery-main {
  flex: 1;
  max-width: 1360px;
  width: 100%;
  margin: 0 auto;
  padding: 32px 28px 60px;
}

/* Hero Section */
.gallery-hero {
  margin-bottom: 28px;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.8), rgba(30, 41, 59, 0.5));
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 28px 32px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
}

.hero-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
}

.hero-text-block {
  max-width: 680px;
}

.hero-title {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0 0 8px;
  color: #ffffff;
}

.hero-user-greet {
  color: #38bdf8;
  font-weight: 500;
  font-size: 1.25rem;
}

.hero-desc {
  font-size: 0.9rem;
  color: #94a3b8;
  margin: 0;
  line-height: 1.5;
}

.hero-metrics {
  display: flex;
  gap: 14px;
}

.metric-card {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(56, 189, 248, 0.2);
  border-radius: 12px;
  padding: 12px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 100px;
}

.metric-value {
  font-size: 1.45rem;
  font-weight: 800;
  color: #38bdf8;
  font-family: ui-monospace, SFMono-Regular, monospace;
}

.metric-label {
  font-size: 0.72rem;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 2px;
}

/* Feedback Banner */
.feedback-banner {
  margin-bottom: 22px;
  padding: 12px 18px;
  border-radius: 10px;
  font-size: 0.86rem;
  display: flex;
  align-items: center;
  gap: 12px;
}

.feedback-banner.success {
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.35);
  color: #6ee7b7;
}

.feedback-banner.error {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #fca5a5;
}

.feedback-text {
  flex: 1;
}

.dismiss-feedback-btn {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  opacity: 0.7;
}

.dismiss-feedback-btn:hover {
  opacity: 1;
}

/* Toolbar */
.gallery-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 28px;
  flex-wrap: wrap;
}

.search-box {
  position: relative;
  flex: 1;
  min-width: 280px;
  max-width: 520px;
}

.search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 14px;
  opacity: 0.5;
}

.search-input {
  width: 100%;
  background: #111827;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 11px 40px 11px 40px;
  font-size: 0.88rem;
  color: #f8fafc;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.search-input:focus {
  border-color: #38bdf8;
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.15);
}

.clear-search-btn {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.toolbar-select {
  background: #111827;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 0.84rem;
  color: #e2e8f0;
  outline: none;
  cursor: pointer;
}

.toolbar-select:focus {
  border-color: #38bdf8;
}

.toolbar-icon-btn {
  background: #111827;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
  padding: 9px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.toolbar-icon-btn:hover:not(:disabled) {
  background: #1e293b;
  border-color: #38bdf8;
}

.primary-btn-accent {
  background: linear-gradient(135deg, #0284c7, #0369a1);
  border: 1px solid rgba(56, 189, 248, 0.4);
  color: #ffffff;
  padding: 10px 18px;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 14px rgba(2, 132, 199, 0.3);
}

.primary-btn-accent:hover {
  background: linear-gradient(135deg, #38bdf8, #0284c7);
  transform: translateY(-1px);
}

/* Projects Grid */
.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 24px;
}

.project-card {
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.project-card:hover {
  transform: translateY(-3px);
  border-color: rgba(56, 189, 248, 0.35);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.5);
}

/* Card Media / Thumbnail */
.card-media {
  position: relative;
  height: 140px;
  background: #0b1120;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.blueprint-bg {
  position: absolute;
  inset: 0;
  opacity: 0.85;
}

.blueprint-svg {
  width: 100%;
  height: 100%;
}

.card-status-chip {
  position: absolute;
  top: 12px;
  left: 12px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.72rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  backdrop-filter: blur(6px);
}

.card-status-chip.status-ready {
  background: rgba(16, 185, 129, 0.2);
  border: 1px solid rgba(16, 185, 129, 0.4);
  color: #6ee7b7;
}

.card-status-chip.status-empty {
  background: rgba(100, 116, 139, 0.25);
  border: 1px solid rgba(100, 116, 139, 0.35);
  color: #94a3b8;
}

.status-indicator-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.card-size-chip {
  position: absolute;
  top: 12px;
  right: 12px;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(56, 189, 248, 0.3);
  color: #7dd3fc;
  font-family: ui-monospace, monospace;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 6px;
}

/* Card Body */
.card-body {
  padding: 18px 20px;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.project-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: #f8fafc;
  margin: 0 0 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-desc {
  font-size: 0.82rem;
  color: #94a3b8;
  margin: 0 0 16px;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex: 1;
}

.project-desc.desc-empty {
  font-style: italic;
  color: #64748b;
}

.project-meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.74rem;
  color: #64748b;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  padding-top: 10px;
}

/* Card Footer */
.card-footer {
  padding: 14px 20px;
  background: rgba(15, 23, 42, 0.5);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  gap: 10px;
}

.open-project-btn {
  flex: 1;
  background: linear-gradient(135deg, #0284c7, #0369a1);
  border: 1px solid rgba(56, 189, 248, 0.35);
  color: #ffffff;
  padding: 10px 14px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.84rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s;
}

.open-project-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #38bdf8, #0284c7);
  box-shadow: 0 4px 12px rgba(56, 189, 248, 0.35);
}

.open-project-btn.btn-disabled {
  opacity: 0.45;
  cursor: not-allowed;
  background: #1e293b;
  border-color: rgba(255, 255, 255, 0.08);
}

.admin-card-actions {
  display: flex;
  gap: 6px;
}

.card-action-icon-btn {
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.2s;
}

.card-action-icon-btn:hover {
  background: #334155;
}

.card-action-icon-btn.delete:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: #ef4444;
}

/* Empty & Loading States */
.gallery-loading {
  text-align: center;
  padding: 80px 20px;
}

.spinner-large {
  width: 44px;
  height: 44px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: #38bdf8;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 16px;
}

.loading-label {
  font-size: 0.9rem;
  color: #94a3b8;
}

.gallery-empty {
  text-align: center;
  padding: 80px 20px;
  background: rgba(15, 23, 42, 0.4);
  border: 1px dashed rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  max-width: 600px;
  margin: 20px auto;
}

.empty-icon-wrap {
  font-size: 44px;
  margin-bottom: 14px;
}

.empty-icon-wrap.lock-icon {
  color: #f59e0b;
}

.empty-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #f8fafc;
  margin: 0 0 8px;
}

.empty-desc {
  font-size: 0.88rem;
  color: #94a3b8;
  line-height: 1.55;
  margin: 0 0 16px;
}

.empty-action-btn {
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #38bdf8;
  padding: 8px 16px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.82rem;
  cursor: pointer;
}

.empty-action-btn:hover {
  background: #334155;
}

/* Modals */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(8px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.dialog-card {
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  width: 100%;
  max-width: 480px;
  padding: 24px;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dialog-card.danger-card {
  border-color: rgba(239, 68, 68, 0.35);
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dialog-header h3 {
  font-size: 1.15rem;
  font-weight: 700;
  margin: 0;
  color: #f8fafc;
}

.danger-title {
  color: #f87171 !important;
}

.dialog-close-btn {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 1.1rem;
  cursor: pointer;
}

.dialog-warning-text {
  font-size: 0.9rem;
  color: #e2e8f0;
  margin: 0;
  line-height: 1.5;
}

.dialog-sub-text {
  font-size: 0.8rem;
  color: #94a3b8;
  margin: 0;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}

.form-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #cbd5e1;
}

.form-input,
.form-textarea {
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.88rem;
  color: #f8fafc;
  outline: none;
  font-family: inherit;
}

.form-input:focus,
.form-textarea:focus {
  border-color: #38bdf8;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 14px;
}

.btn-confirm {
  background: #0284c7;
  border: 1px solid rgba(56, 189, 248, 0.35);
  color: #ffffff;
  padding: 9px 16px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.84rem;
  cursor: pointer;
}

.btn-danger-confirm {
  background: #dc2626;
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #ffffff;
  padding: 9px 16px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.84rem;
  cursor: pointer;
}

.btn-cancel {
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
  padding: 9px 16px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.84rem;
  cursor: pointer;
}

.spinner-sm {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}

.spin-anim {
  display: inline-block;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Add Model Quick & Icon Buttons */
.add-model-quick-btn {
  flex: 1;
  background: linear-gradient(135deg, #059669, #047857);
  border: 1px solid rgba(52, 211, 153, 0.35);
  color: #ffffff;
  padding: 10px 14px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.84rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s;
}

.add-model-quick-btn:hover {
  background: linear-gradient(135deg, #10b981, #059669);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);
}

.card-action-icon-btn.add-model:hover {
  background: rgba(16, 185, 129, 0.2);
  border-color: #10b981;
}

/* Add Model Dialog */
.add-model-dialog {
  max-width: 640px !important;
  width: 95% !important;
}

.dialog-header-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.dialog-header-title .header-icon {
  font-size: 1.6rem;
}

.dialog-header-subtitle {
  font-size: 0.78rem;
  color: #94a3b8;
  margin: 2px 0 0 0;
}

.dialog-header-subtitle strong {
  color: #38bdf8;
}

/* Method Tabs */
.model-method-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 20px;
}

.method-tab-btn {
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 12px 14px;
  text-align: left;
  cursor: pointer;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  transition: all 0.2s;
}

.method-tab-btn:hover:not(:disabled) {
  border-color: rgba(56, 189, 248, 0.3);
  background: #172033;
}

.method-tab-btn.active {
  border-color: #38bdf8;
  background: rgba(14, 165, 233, 0.12);
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.15);
}

.method-tab-btn .tab-icon {
  font-size: 1.4rem;
  line-height: 1;
}

.method-tab-btn .tab-text {
  display: flex;
  flex-direction: column;
}

.method-tab-btn .tab-title {
  font-size: 0.86rem;
  font-weight: 600;
  color: #f1f5f9;
  margin-bottom: 3px;
}

.method-tab-btn .tab-desc {
  font-size: 0.72rem;
  color: #94a3b8;
  line-height: 1.3;
}

/* Method Panel */
.method-panel .panel-intro {
  font-size: 0.82rem;
  color: #94a3b8;
  line-height: 1.5;
  margin-bottom: 16px;
}

.method-panel .panel-intro strong {
  color: #e2e8f0;
}

/* Drop Zone */
.drop-zone {
  border: 2px dashed rgba(56, 189, 248, 0.3);
  border-radius: 12px;
  padding: 24px 20px;
  text-align: center;
  background: rgba(15, 23, 42, 0.6);
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 16px;
}

.drop-zone:hover:not(.disabled) {
  border-color: #38bdf8;
  background: rgba(14, 165, 233, 0.08);
}

.drop-zone.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.drop-zone.has-file {
  border-style: solid;
  border-color: rgba(16, 185, 129, 0.5);
  background: rgba(16, 185, 129, 0.06);
}

.drop-zone-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.drop-zone-placeholder .dz-icon {
  font-size: 2.2rem;
  margin-bottom: 4px;
}

.drop-zone-placeholder .dz-prompt {
  font-weight: 600;
  font-size: 0.88rem;
  color: #f8fafc;
}

.drop-zone-placeholder .dz-subtext {
  font-size: 0.74rem;
  color: #64748b;
}

.dz-selected-file {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dz-selected-file .dz-file-icon {
  font-size: 1.8rem;
}

.dz-selected-file .dz-file-meta {
  flex: 1;
  text-align: left;
  display: flex;
  flex-direction: column;
}

.dz-selected-file .dz-file-name {
  font-size: 0.88rem;
  font-weight: 600;
  color: #f1f5f9;
  word-break: break-all;
}

.dz-selected-file .dz-file-size {
  font-size: 0.76rem;
  color: #38bdf8;
  margin-top: 2px;
}

.dz-change-btn {
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.76rem;
  cursor: pointer;
}

.dz-change-btn:hover {
  background: #334155;
}

/* Method Alert */
.method-alert {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px 14px;
  border-radius: 8px;
  font-size: 0.82rem;
  margin-bottom: 16px;
}

.method-alert.alert-error {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #fca5a5;
}

.method-alert.alert-success {
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.35);
  color: #6ee7b7;
}

.method-alert .alert-icon {
  font-size: 1.1rem;
  line-height: 1.2;
}

.method-alert .alert-content p {
  margin: 3px 0 0 0;
  color: #a7f3d0;
  font-size: 0.78rem;
}

/* Conversion Progress Box */
.conversion-progress-box {
  background: #0f172a;
  border: 1px solid rgba(56, 189, 248, 0.25);
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 16px;
}

.c-progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 0.82rem;
}

.c-progress-header .c-stage {
  color: #94a3b8;
  font-weight: 500;
}

.c-progress-header .c-percent {
  color: #38bdf8;
  font-weight: 700;
  font-family: monospace;
}

.c-track {
  height: 8px;
  background: #1e293b;
  border-radius: 999px;
  overflow: hidden;
}

.c-fill {
  height: 100%;
  background: linear-gradient(90deg, #0284c7, #38bdf8);
  border-radius: 999px;
  transition: width 0.3s ease;
}

.c-time {
  font-size: 0.74rem;
  color: #64748b;
  margin-top: 8px;
}

.btn-viewer-launch {
  background: linear-gradient(135deg, #10b981, #059669) !important;
  border-color: rgba(52, 211, 153, 0.4) !important;
}

.btn-viewer-launch:hover {
  background: linear-gradient(135deg, #34d399, #10b981) !important;
  box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4) !important;
}

/* Tablet & Mobile Responsiveness */
@media (max-width: 768px) {
  .gallery-header {
    padding: 0 16px;
  }
  .gallery-main {
    padding: 20px 16px;
  }
  .hero-content {
    flex-direction: column;
    align-items: flex-start;
  }
  .hero-metrics {
    width: 100%;
    justify-content: space-between;
  }
  .metric-card {
    min-width: 0;
    flex: 1;
    padding: 10px 8px;
  }
  .gallery-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .search-box {
    max-width: 100%;
  }
  .filter-group {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
