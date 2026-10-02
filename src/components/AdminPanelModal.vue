<template>
  <div v-if="modelValue" class="modal-backdrop" @click.self="$emit('update:modelValue', false)">
    <div class="admin-card">
      <!-- Header -->
      <div class="modal-header">
        <div class="header-left">
          <span class="header-icon">🛡️</span>
          <div>
            <h3 class="modal-title">Panel de Administración de Usuarios</h3>
            <p class="modal-subtitle">Gestión de identidades, roles y asignación de permisos por proyecto</p>
          </div>
        </div>
        <button
          type="button"
          class="close-btn"
          title="Cerrar (Esc)"
          @click="$emit('update:modelValue', false)"
        >
          ✕
        </button>
      </div>

      <!-- Navigation Tabs -->
      <div class="tab-bar">
        <button
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === 'users' }"
          @click="activeTab = 'users'; clearFeedback()"
        >
          👥 Usuarios ({{ usersList.length }})
        </button>
        <button
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === 'create' }"
          @click="activeTab = 'create'; resetCreateForm(); clearFeedback()"
        >
          ➕ Crear Usuario
        </button>
      </div>

      <!-- Toast Feedback Banner -->
      <div v-if="feedbackMessage" class="feedback-banner" :class="feedbackType">
        <span>{{ feedbackMessage }}</span>
        <button type="button" class="dismiss-btn" @click="feedbackMessage = ''">✕</button>
      </div>

      <!-- Modal Body -->
      <div class="modal-body">
        <!-- ========================================== -->
        <!-- TAB 1: LISTADO DE USUARIOS                 -->
        <!-- ========================================== -->
        <div v-if="activeTab === 'users'" class="tab-content">
          <div class="tab-toolbar">
            <div class="search-box">
              <span class="search-icon">🔍</span>
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Buscar por nombre o correo..."
                class="search-input"
                @input="onSearchInput"
              />
              <button
                v-if="searchQuery"
                type="button"
                class="clear-search-btn"
                @click="searchQuery = ''; loadUsers()"
              >
                ✕
              </button>
            </div>
            <div class="toolbar-actions">
              <button type="button" class="refresh-btn-sm" title="Recargar usuarios" @click="loadUsers">
                🔄
              </button>
            </div>
          </div>

          <div v-if="isLoadingUsers" class="loading-state">
            <div class="spinner"></div>
            <p>Cargando usuarios desde SQLite...</p>
          </div>

          <div v-else-if="usersList.length === 0" class="empty-state">
            <span class="empty-icon">👤</span>
            <p v-if="searchQuery">No se encontraron usuarios coincidentes con "{{ searchQuery }}".</p>
            <p v-else>No hay usuarios registrados en el sistema.</p>
          </div>

          <div v-else class="users-table-wrapper">
            <table class="users-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Proyectos Asignados</th>
                  <th>Fecha Alta</th>
                  <th class="actions-col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="user in usersList" :key="user.id" :class="{ 'row-self': user.id === currentUser?.id }">
                  <td>
                    <div class="user-cell">
                      <div class="user-avatar" :class="user.role">
                        {{ user.name.charAt(0).toUpperCase() }}
                      </div>
                      <div class="user-details">
                        <span class="user-name">
                          {{ user.name }}
                          <span v-if="user.id === currentUser?.id" class="self-tag">(Tú)</span>
                        </span>
                        <span class="user-email">{{ user.email }}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span class="role-badge" :class="user.role">
                      {{ user.role === 'admin' ? '⭐ Administrador' : '👤 Usuario Normal' }}
                    </span>
                  </td>
                  <td>
                    <span class="status-badge" :class="user.isActive ? 'active' : 'inactive'">
                      {{ user.isActive ? '● Activo' : '○ Inactivo' }}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      class="projects-badge-btn"
                      title="Gestionar proyectos asignados"
                      @click="openProjectsAssignment(user)"
                    >
                      <span class="projects-count">{{ user.assignedProjectsCount }}</span>
                      <span>proyectos</span>
                      <span class="edit-icon">✏️</span>
                    </button>
                  </td>
                  <td class="date-cell">
                    {{ formatDate(user.createdAt) }}
                  </td>
                  <td class="actions-col">
                    <div class="action-buttons">
                      <button
                        type="button"
                        class="action-btn edit"
                        title="Editar datos de usuario"
                        @click="openEditUserModal(user)"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        class="action-btn toggle"
                        :title="user.isActive ? 'Desactivar cuenta' : 'Activar cuenta'"
                        :disabled="user.id === currentUser?.id"
                        @click="toggleUserActive(user)"
                      >
                        {{ user.isActive ? '⏸️' : '▶️' }}
                      </button>
                      <button
                        type="button"
                        class="action-btn delete"
                        title="Eliminar usuario"
                        :disabled="user.id === currentUser?.id"
                        @click="confirmDeleteUser(user)"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- ========================================== -->
        <!-- TAB 2: CREAR USUARIO                       -->
        <!-- ========================================== -->
        <div v-if="activeTab === 'create'" class="tab-content">
          <form class="admin-form" @submit.prevent="handleCreateUser">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="create-name">Nombre Completo *</label>
                <input
                  id="create-name"
                  v-model="createForm.name"
                  type="text"
                  required
                  placeholder="Ej. Juan Pérez"
                  class="form-input"
                />
              </div>
              <div class="form-group">
                <label class="form-label" for="create-email">Correo Electrónico *</label>
                <input
                  id="create-email"
                  v-model="createForm.email"
                  type="email"
                  required
                  placeholder="juan.perez@empresa.com"
                  class="form-input"
                />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="create-password">Contraseña Inicial *</label>
                <input
                  id="create-password"
                  v-model="createForm.password"
                  type="password"
                  required
                  minlength="8"
                  placeholder="Mínimo 8 caracteres"
                  class="form-input"
                />
              </div>
              <div class="form-group">
                <label class="form-label" for="create-role">Rol en el Sistema *</label>
                <select id="create-role" v-model="createForm.role" class="form-select">
                  <option value="user">Usuario Normal (Solo proyectos asignados)</option>
                  <option value="admin">Administrador (Control total)</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-checkbox-label">
                <input v-model="createForm.isActive" type="checkbox" />
                <span>Cuenta activa inmediatamente</span>
              </label>
            </div>

            <!-- Proyectos asignables -->
            <div class="form-group project-select-section">
              <label class="form-label">Asignar Proyectos Iniciales</label>
              <div v-if="availableProjects.length === 0" class="empty-hint-sm">
                No hay proyectos registrados en SQLite aún.
              </div>
              <div v-else class="project-checkbox-list">
                <label
                  v-for="project in availableProjects"
                  :key="project.id"
                  class="project-checkbox-item"
                >
                  <input
                    v-model="createForm.assignedProjectIds"
                    type="checkbox"
                    :value="project.id"
                  />
                  <div class="project-check-meta">
                    <span class="project-check-name">{{ project.name }}</span>
                    <span class="project-check-sub">{{ project.modelsCount }} modelo(s) | {{ project.totalPartsSizeMB }} MB</span>
                  </div>
                </label>
              </div>
            </div>

            <div class="form-actions">
              <button
                type="button"
                class="secondary-btn"
                @click="activeTab = 'users'"
              >
                Cancelar
              </button>
              <button
                type="submit"
                class="primary-btn"
                :disabled="isSubmitting"
              >
                <span v-if="isSubmitting" class="spinner-sm"></span>
                <span v-else>💾 Guardar Nuevo Usuario</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- ========================================== -->
      <!-- MODAL AUX: ASIGNAR PROYECTOS               -->
      <!-- ========================================== -->
      <div v-if="showAssignmentModal && selectedUserForAssignment" class="sub-modal-backdrop" @click.self="showAssignmentModal = false">
        <div class="sub-modal-card">
          <div class="sub-modal-header">
            <h4>Asignar Proyectos a {{ selectedUserForAssignment.name }}</h4>
            <button type="button" class="close-btn-sm" @click="showAssignmentModal = false">✕</button>
          </div>
          <p class="sub-modal-desc">
            Los usuarios con rol <strong>Usuario Normal</strong> únicamente podrán visualizar y abrir los proyectos marcados a continuación:
          </p>

          <div class="assignment-project-list">
            <div v-if="availableProjects.length === 0" class="empty-state-sm">
              No hay proyectos creados en el sistema.
            </div>
            <label
              v-for="project in availableProjects"
              :key="project.id"
              class="assignment-item"
            >
              <input
                v-model="tempAssignedProjectIds"
                type="checkbox"
                :value="project.id"
              />
              <div class="assignment-info">
                <span class="assignment-name">{{ project.name }}</span>
                <span class="assignment-desc">{{ project.description || 'Sin descripción' }}</span>
              </div>
              <span class="models-badge">{{ project.modelsCount }} modelos</span>
            </label>
          </div>

          <div class="sub-modal-actions">
            <button type="button" class="secondary-btn-sm" @click="showAssignmentModal = false">
              Cancelar
            </button>
            <button
              type="button"
              class="primary-btn-sm"
              :disabled="isSubmitting"
              @click="saveProjectAssignments"
            >
              <span v-if="isSubmitting" class="spinner-sm"></span>
              <span v-else>Guardar Asignaciones</span>
            </button>
          </div>
        </div>
      </div>

      <!-- ========================================== -->
      <!-- MODAL AUX: EDITAR USUARIO                  -->
      <!-- ========================================== -->
      <div v-if="showEditModal && editingUser" class="sub-modal-backdrop" @click.self="showEditModal = false">
        <div class="sub-modal-card">
          <div class="sub-modal-header">
            <h4>Editar Usuario: {{ editingUser.name }}</h4>
            <button type="button" class="close-btn-sm" @click="showEditModal = false">✕</button>
          </div>

          <form @submit.prevent="handleUpdateUser">
            <div class="form-group">
              <label class="form-label" for="edit-name">Nombre</label>
              <input
                id="edit-name"
                v-model="editForm.name"
                type="text"
                required
                class="form-input"
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="edit-email">Correo Electrónico</label>
              <input
                id="edit-email"
                v-model="editForm.email"
                type="email"
                required
                class="form-input"
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="edit-password">Nueva Contraseña (Opcional)</label>
              <input
                id="edit-password"
                v-model="editForm.password"
                type="password"
                minlength="8"
                placeholder="Dejar en blanco para conservar la actual"
                class="form-input"
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="edit-role">Rol</label>
              <select id="edit-role" v-model="editForm.role" class="form-select">
                <option value="user">Usuario Normal</option>
                <option value="admin">Administrador</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-checkbox-label">
                <input v-model="editForm.isActive" type="checkbox" />
                <span>Cuenta activa</span>
              </label>
            </div>

            <div class="sub-modal-actions">
              <button type="button" class="secondary-btn-sm" @click="showEditModal = false">
                Cancelar
              </button>
              <button type="submit" class="primary-btn-sm" :disabled="isSubmitting">
                <span v-if="isSubmitting" class="spinner-sm"></span>
                <span v-else>Guardar Cambios</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import {
  adminFetchUsers,
  adminCreateUser,
  adminUpdateUser,
  adminDeleteUser,
  adminUpdateUserProjects,
  currentUser,
  type AdminUserItem,
} from '../services/auth-service';
import { fetchBackendProjects, type BackendProject } from '../services/backend-client';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const activeTab = ref<'users' | 'create'>('users');
const usersList = ref<AdminUserItem[]>([]);
const availableProjects = ref<BackendProject[]>([]);
const isLoadingUsers = ref(false);
const isSubmitting = ref(false);
const searchQuery = ref('');

// Feedback banner
const feedbackMessage = ref('');
const feedbackType = ref<'success' | 'error'>('success');

function setFeedback(msg: string, type: 'success' | 'error' = 'success') {
  feedbackMessage.value = msg;
  feedbackType.value = type;
}

function clearFeedback() {
  feedbackMessage.value = '';
}

// Form state: Create User
const createForm = ref({
  name: '',
  email: '',
  password: '',
  role: 'user' as 'admin' | 'user',
  isActive: true,
  assignedProjectIds: [] as string[],
});

function resetCreateForm() {
  createForm.value = {
    name: '',
    email: '',
    password: '',
    role: 'user',
    isActive: true,
    assignedProjectIds: [],
  };
}

// Form state: Edit User
const showEditModal = ref(false);
const editingUser = ref<AdminUserItem | null>(null);
const editForm = ref({
  name: '',
  email: '',
  password: '',
  role: 'user' as 'admin' | 'user',
  isActive: true,
});

// Modal state: Assign Projects
const showAssignmentModal = ref(false);
const selectedUserForAssignment = ref<AdminUserItem | null>(null);
const tempAssignedProjectIds = ref<string[]>([]);

async function loadUsers() {
  isLoadingUsers.value = true;
  try {
    usersList.value = await adminFetchUsers(searchQuery.value);
  } catch (err: any) {
    setFeedback(err.message || 'Error cargando usuarios.', 'error');
  } finally {
    isLoadingUsers.value = false;
  }
}

async function loadProjects() {
  try {
    availableProjects.value = await fetchBackendProjects();
  } catch (err) {
    console.warn('Error loading available projects for admin:', err);
  }
}

let searchDebounce: any = null;
function onSearchInput() {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    loadUsers();
  }, 250);
}

function formatDate(ts: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

async function handleCreateUser() {
  if (!createForm.value.name || !createForm.value.email || !createForm.value.password) {
    setFeedback('Por favor complete los campos requeridos.', 'error');
    return;
  }

  isSubmitting.value = true;
  try {
    const newUser = await adminCreateUser({
      name: createForm.value.name,
      email: createForm.value.email,
      password: createForm.value.password,
      role: createForm.value.role,
      isActive: createForm.value.isActive,
      assignedProjectIds: createForm.value.assignedProjectIds,
    });

    setFeedback(`Usuario "${newUser.name}" creado con éxito.`);
    resetCreateForm();
    activeTab.value = 'users';
    await loadUsers();
  } catch (err: any) {
    setFeedback(err.message || 'Error al crear el usuario.', 'error');
  } finally {
    isSubmitting.value = false;
  }
}

function openEditUserModal(user: AdminUserItem) {
  editingUser.value = user;
  editForm.value = {
    name: user.name,
    email: user.email,
    password: '',
    role: user.role,
    isActive: user.isActive,
  };
  showEditModal.value = true;
}

async function handleUpdateUser() {
  if (!editingUser.value) return;

  isSubmitting.value = true;
  try {
    const payload: any = {
      name: editForm.value.name,
      email: editForm.value.email,
      role: editForm.value.role,
      isActive: editForm.value.isActive,
    };
    if (editForm.value.password) {
      payload.password = editForm.value.password;
    }

    await adminUpdateUser(editingUser.value.id, payload);
    setFeedback(`Usuario "${editForm.value.name}" actualizado.`);
    showEditModal.value = false;
    await loadUsers();
  } catch (err: any) {
    setFeedback(err.message || 'Error al actualizar usuario.', 'error');
  } finally {
    isSubmitting.value = false;
  }
}

async function toggleUserActive(user: AdminUserItem) {
  try {
    await adminUpdateUser(user.id, {
      isActive: !user.isActive,
    });
    setFeedback(`Cuenta ${user.isActive ? 'desactivada' : 'activada'} correctamente.`);
    await loadUsers();
  } catch (err: any) {
    setFeedback(err.message || 'Error al cambiar estado del usuario.', 'error');
  }
}

async function confirmDeleteUser(user: AdminUserItem) {
  if (user.id === currentUser.value?.id) {
    setFeedback('No puede eliminar su propia cuenta de usuario en sesión.', 'error');
    return;
  }

  const ok = confirm(`¿Está seguro de que desea eliminar permanentemente al usuario "${user.name}" (${user.email})?`);
  if (!ok) return;

  try {
    await adminDeleteUser(user.id);
    setFeedback(`Usuario "${user.name}" eliminado.`);
    await loadUsers();
  } catch (err: any) {
    setFeedback(err.message || 'Error al eliminar usuario.', 'error');
  }
}

function openProjectsAssignment(user: AdminUserItem) {
  selectedUserForAssignment.value = user;
  tempAssignedProjectIds.value = [...(user.assignedProjectIds || [])];
  showAssignmentModal.value = true;
}

async function saveProjectAssignments() {
  if (!selectedUserForAssignment.value) return;

  isSubmitting.value = true;
  try {
    const updated = await adminUpdateUserProjects(
      selectedUserForAssignment.value.id,
      tempAssignedProjectIds.value
    );
    selectedUserForAssignment.value.assignedProjectIds = updated;
    selectedUserForAssignment.value.assignedProjectsCount = updated.length;
    setFeedback(`Permisos de proyecto actualizados para "${selectedUserForAssignment.value.name}".`);
    showAssignmentModal.value = false;
    await loadUsers();
  } catch (err: any) {
    setFeedback(err.message || 'Error asignando proyectos.', 'error');
  } finally {
    isSubmitting.value = false;
  }
}

watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      loadUsers();
      loadProjects();
    }
  }
);

onMounted(() => {
  if (props.modelValue) {
    loadUsers();
    loadProjects();
  }
});
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(8px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  animation: fadeIn 0.2s ease-out;
}

.admin-card {
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  width: 100%;
  max-width: 900px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
  color: #f1f5f9;
  overflow: hidden;
  animation: slideUp 0.25s ease-out;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.header-icon {
  font-size: 26px;
}

.modal-title {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0;
  color: #ffffff;
}

.modal-subtitle {
  font-size: 0.82rem;
  color: #94a3b8;
  margin: 2px 0 0;
}

.close-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #94a3b8;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.tab-bar {
  display: flex;
  gap: 8px;
  padding: 12px 24px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(15, 23, 42, 0.6);
}

.tab-btn {
  background: none;
  border: none;
  color: #94a3b8;
  padding: 10px 16px;
  font-size: 0.88rem;
  font-weight: 600;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn:hover {
  color: #f1f5f9;
}

.tab-btn.active {
  color: #3b82f6;
  border-bottom-color: #3b82f6;
}

.feedback-banner {
  margin: 12px 24px 0;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 0.84rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
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

.dismiss-btn {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 14px;
  opacity: 0.7;
}

.dismiss-btn:hover {
  opacity: 1;
}

.modal-body {
  padding: 20px 24px;
  overflow-y: auto;
  flex: 1;
}

.tab-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  gap: 12px;
}

.search-box {
  position: relative;
  flex: 1;
  max-width: 400px;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 14px;
  opacity: 0.5;
}

.search-input {
  width: 100%;
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 8px 36px 8px 36px;
  font-size: 0.85rem;
  color: #f8fafc;
  outline: none;
}

.search-input:focus {
  border-color: #3b82f6;
}

.clear-search-btn {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
}

.refresh-btn-sm {
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.refresh-btn-sm:hover {
  background: #334155;
}

.users-table-wrapper {
  overflow-x: auto;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
}

.users-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.86rem;
}

.users-table th {
  background: #1e293b;
  color: #94a3b8;
  font-weight: 600;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.users-table td {
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  vertical-align: middle;
}

.users-table tr:hover {
  background: rgba(255, 255, 255, 0.02);
}

.row-self {
  background: rgba(59, 130, 246, 0.05);
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.85rem;
}

.user-avatar.admin {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #fff;
}

.user-avatar.user {
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  color: #fff;
}

.user-details {
  display: flex;
  flex-direction: column;
}

.user-name {
  font-weight: 600;
  color: #f8fafc;
}

.self-tag {
  font-size: 0.72rem;
  color: #60a5fa;
  margin-left: 4px;
}

.user-email {
  font-size: 0.76rem;
  color: #94a3b8;
}

.role-badge {
  font-size: 0.75rem;
  padding: 4px 8px;
  border-radius: 6px;
  font-weight: 600;
  display: inline-block;
}

.role-badge.admin {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.role-badge.user {
  background: rgba(59, 130, 246, 0.15);
  color: #93c5fd;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.status-badge {
  font-size: 0.75rem;
  padding: 3px 8px;
  border-radius: 6px;
  font-weight: 600;
  display: inline-block;
}

.status-badge.active {
  background: rgba(16, 185, 129, 0.15);
  color: #6ee7b7;
}

.status-badge.inactive {
  background: rgba(100, 116, 139, 0.2);
  color: #94a3b8;
}

.projects-badge-btn {
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
  transition: all 0.2s;
}

.projects-badge-btn:hover {
  background: #334155;
  border-color: #3b82f6;
}

.projects-count {
  font-weight: 700;
  color: #3b82f6;
}

.edit-icon {
  font-size: 0.75rem;
  opacity: 0.6;
}

.date-cell {
  font-size: 0.78rem;
  color: #94a3b8;
}

.actions-col {
  text-align: right;
}

.action-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.action-btn {
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 6px 8px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.2s;
}

.action-btn:hover:not(:disabled) {
  background: #334155;
}

.action-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.action-btn.delete:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.25);
  border-color: #ef4444;
}

/* Forms */
.admin-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #cbd5e1;
}

.form-input,
.form-select {
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.88rem;
  color: #f8fafc;
  outline: none;
}

.form-input:focus,
.form-select:focus {
  border-color: #3b82f6;
}

.form-checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.84rem;
  color: #e2e8f0;
  cursor: pointer;
}

.project-select-section {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 14px;
}

.project-checkbox-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px;
  max-height: 180px;
  overflow-y: auto;
  padding: 4px;
}

.project-checkbox-item {
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.project-checkbox-item:hover {
  border-color: #3b82f6;
}

.project-check-meta {
  display: flex;
  flex-direction: column;
}

.project-check-name {
  font-size: 0.82rem;
  font-weight: 600;
  color: #f1f5f9;
}

.project-check-sub {
  font-size: 0.72rem;
  color: #94a3b8;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 16px;
}

.primary-btn {
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #ffffff;
  padding: 10px 18px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.88rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}

.primary-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
}

.secondary-btn {
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
  padding: 10px 18px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.88rem;
  cursor: pointer;
}

.secondary-btn:hover {
  background: #334155;
}

/* Sub-modals */
.sub-modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.8);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 10;
}

.sub-modal-card {
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 14px;
  width: 100%;
  max-width: 520px;
  padding: 24px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.sub-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sub-modal-header h4 {
  margin: 0;
  font-size: 1.1rem;
  color: #ffffff;
}

.close-btn-sm {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 1rem;
}

.sub-modal-desc {
  font-size: 0.82rem;
  color: #94a3b8;
  margin: 0;
  line-height: 1.4;
}

.assignment-project-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 250px;
  overflow-y: auto;
  padding: 4px;
}

.assignment-item {
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.assignment-item:hover {
  border-color: #3b82f6;
}

.assignment-info {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.assignment-name {
  font-size: 0.86rem;
  font-weight: 600;
  color: #f8fafc;
}

.assignment-desc {
  font-size: 0.74rem;
  color: #94a3b8;
}

.models-badge {
  font-size: 0.72rem;
  background: rgba(59, 130, 246, 0.15);
  color: #93c5fd;
  padding: 2px 8px;
  border-radius: 6px;
}

.sub-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 12px;
}

.primary-btn-sm {
  background: #2563eb;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #fff;
  padding: 8px 14px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.82rem;
  cursor: pointer;
}

.secondary-btn-sm {
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
  padding: 8px 14px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.82rem;
  cursor: pointer;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #94a3b8;
}

.empty-icon {
  font-size: 40px;
  display: block;
  margin-bottom: 10px;
}

.empty-hint-sm {
  font-size: 0.8rem;
  color: #64748b;
  font-style: italic;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 20px auto 10px;
}

.spinner-sm {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
