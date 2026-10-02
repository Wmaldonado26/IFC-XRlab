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

            <!-- Admin Options (Edit / Delete) -->
            <div v-if="isAdmin" class="admin-card-actions">
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
  type BackendProject,
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
    setFeedback(`Proyecto "${created.name}" creado con éxito.`);
    showCreateModal.value = false;
    await loadProjects();
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
