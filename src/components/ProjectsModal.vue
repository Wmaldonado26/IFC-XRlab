<template>
  <div v-if="modelValue" class="modal-backdrop" @click.self="$emit('update:modelValue', false)">
    <div class="modal-card">
      <div class="modal-header">
        <div class="header-left">
          <span class="header-icon">🗂️</span>
          <div>
            <h3 class="modal-title">Catálogo de Proyectos & Caché</h3>
            <p class="modal-subtitle">Acceso instantáneo a modelos procesados sin re-conversión</p>
          </div>
        </div>
        <button type="button" class="close-btn" @click="$emit('update:modelValue', false)">✕</button>
      </div>

      <div class="tab-bar">
        <button
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === 'cache' }"
          @click="activeTab = 'cache'"
        >
          💾 Caché Local del Navegador ({{ cachedList.length }})
        </button>
        <button
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === 'backend' }"
          @click="activeTab = 'backend'"
        >
          🚀 Microservicio 64-bit ({{ backendList.length }})
        </button>
      </div>

      <div class="modal-body">
        <!-- Tab 1: IndexedDB Cache -->
        <div v-if="activeTab === 'cache'" class="tab-content">
          <div class="tab-toolbar">
            <span class="info-tag">Almacenamiento Zero-Latency en IndexedDB</span>
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
            <span class="empty-hint">Al cargar o procesar archivos IFC/Frag, se guardarán aquí automáticamente.</span>
          </div>

          <div v-else class="project-grid">
            <div v-for="item in cachedList" :key="item.id" class="project-item">
              <div class="project-info">
                <span class="project-icon">🚢</span>
                <div class="project-details">
                  <h4 class="project-name" :title="item.name">{{ item.name }}</h4>
                  <div class="project-meta">
                    <span>{{ (item.totalBytes / (1024 * 1024)).toFixed(1) }} MB</span>
                    <span>•</span>
                    <span>{{ formatDate(item.timestamp) }}</span>
                  </div>
                </div>
              </div>
              <div class="project-actions">
                <button
                  type="button"
                  class="action-btn load-btn"
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

        <!-- Tab 2: Backend Converted Projects -->
        <div v-if="activeTab === 'backend'" class="tab-content">
          <div class="tab-toolbar">
            <span class="info-tag">Modelos procesados por el motor 64-bit (RAM 16GB)</span>
            <button type="button" class="refresh-btn-sm" @click="refreshBackend">
              🔄 Actualizar
            </button>
          </div>

          <div v-if="backendList.length === 0" class="empty-state">
            <span class="empty-icon">📂</span>
            <p>No hay proyectos activos en el microservicio local.</p>
            <span class="empty-hint">Asegúrate de que <code>npm run dev:all</code> esté en ejecución.</span>
          </div>

          <div v-else class="project-grid">
            <div v-for="proj in backendList" :key="proj.id" class="project-item">
              <div class="project-info">
                <span class="project-icon">⚙️</span>
                <div class="project-details">
                  <h4 class="project-name" :title="proj.fileName">{{ proj.fileName }}</h4>
                  <div class="project-meta">
                    <span>{{ proj.parts.length }} partes ({{ proj.totalPartsSizeMB }} MB)</span>
                    <span>•</span>
                    <span>Original: {{(proj.fileSize / (1024 * 1024)).toFixed(1)}} MB</span>
                  </div>
                </div>
              </div>
              <div class="project-actions">
                <button
                  type="button"
                  class="action-btn load-btn"
                  @click="onLoadBackend(proj)"
                >
                  📥 Cargar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import {
  listCachedProjects,
  deleteCachedProject,
  clearAllCachedProjects,
} from '../services/frag-cache';
import {
  fetchBackendProjects,
  type BackendProject,
} from '../services/backend-client';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'loadCached', id: string): void;
  (e: 'loadBackend', project: BackendProject): void;
}>();

const activeTab = ref<'cache' | 'backend'>('cache');
const cachedList = ref<Array<{ id: string; name: string; totalBytes: number; timestamp: number }>>([]);
const backendList = ref<BackendProject[]>([]);

const refreshData = async () => {
  try {
    cachedList.value = await listCachedProjects();
    backendList.value = await fetchBackendProjects();
  } catch (err) {
    console.warn('Error refreshing project list:', err);
  }
};

const refreshBackend = async () => {
  backendList.value = await fetchBackendProjects();
};

watch(
  () => props.modelValue,
  (val) => {
    if (val) refreshData();
  }
);

onMounted(() => {
  refreshData();
});

const onLoadCached = (id: string) => {
  emit('loadCached', id);
  emit('update:modelValue', false);
};

const onLoadBackend = (proj: BackendProject) => {
  emit('loadBackend', proj);
  emit('update:modelValue', false);
};

const onDeleteCached = async (id: string) => {
  await deleteCachedProject(id);
  cachedList.value = await listCachedProjects();
};

const onClearCache = async () => {
  if (confirm('¿Deseas vaciar toda la caché local de modelos?')) {
    await clearAllCachedProjects();
    cachedList.value = [];
  }
};

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
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100000;
  padding: 20px;
}

.modal-card {
  width: 100%;
  max-width: 680px;
  max-height: 85vh;
  background: #0f172a;
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 16px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.75);
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
  padding: 18px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
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
  margin: 3px 0 0;
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
  background: rgba(30, 41, 59, 0.6);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  padding: 0 16px;
}

.tab-btn {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: #94a3b8;
  padding: 12px 16px;
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

.modal-body {
  padding: 18px 24px;
  overflow-y: auto;
  flex: 1;
}

.tab-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.info-tag {
  font-size: 0.78rem;
  color: #64748b;
}

.danger-btn-sm {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #fca5a5;
  font-size: 0.75rem;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.danger-btn-sm:hover {
  background: rgba(239, 68, 68, 0.3);
  color: #ffffff;
}

.refresh-btn-sm {
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.35);
  color: #38bdf8;
  font-size: 0.75rem;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
}

.refresh-btn-sm:hover {
  background: rgba(56, 189, 248, 0.25);
  color: #ffffff;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #94a3b8;
}

.empty-icon {
  font-size: 2.5rem;
  display: block;
  margin-bottom: 10px;
  opacity: 0.6;
}

.empty-hint {
  font-size: 0.78rem;
  color: #64748b;
  display: block;
  margin-top: 6px;
}

.project-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.project-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 12px 16px;
  transition: all 0.2s ease;
}

.project-item:hover {
  background: rgba(30, 41, 59, 0.85);
  border-color: rgba(56, 189, 248, 0.3);
}

.project-info {
  display: flex;
  align-items: center;
  gap: 12px;
  overflow: hidden;
}

.project-icon {
  font-size: 1.4rem;
}

.project-details {
  overflow: hidden;
}

.project-name {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: #f8fafc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  color: #94a3b8;
  margin-top: 3px;
}

.project-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 14px;
}

.action-btn {
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.load-btn {
  background: #0284c7;
  color: #ffffff;
}

.load-btn:hover {
  background: #0369a1;
  box-shadow: 0 2px 8px rgba(2, 132, 199, 0.4);
}

.delete-btn {
  background: rgba(255, 255, 255, 0.06);
  color: #94a3b8;
  padding: 6px 8px;
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
}
</style>
