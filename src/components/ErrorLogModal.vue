<template>
  <div v-if="modelValue" class="log-modal-overlay" @click.self="close">
    <div class="log-modal-card">
      <!-- Header -->
      <div class="log-modal-header">
        <div class="header-left">
          <span class="terminal-icon">📟</span>
          <div>
            <h3 class="modal-title">Consola de Diagnóstico y Errores</h3>
            <p class="modal-subtitle">Eventos del Frontend, Web Workers y Microservicio Node.js de 64 bits</p>
          </div>
        </div>

        <div class="header-right">
          <span v-if="errorCount > 0" class="badge-error-count">
            {{ errorCount }} {{ errorCount === 1 ? 'error detectado' : 'errores detectados' }}
          </span>
          <span v-else class="badge-no-errors">
            ✓ Sin errores críticos
          </span>
          <button class="btn-icon-close" title="Cerrar" @click="close">✕</button>
        </div>
      </div>

      <!-- Controls & Filter Toolbar -->
      <div class="log-toolbar">
        <div class="filter-pills">
          <button
            class="pill-btn"
            :class="{ active: currentFilter === 'all' }"
            @click="currentFilter = 'all'"
          >
            Todos ({{ allLogs.length }})
          </button>
          <button
            class="pill-btn pill-error"
            :class="{ active: currentFilter === 'error' }"
            @click="currentFilter = 'error'"
          >
            Errores ({{ errorCount }})
          </button>
          <button
            class="pill-btn pill-warn"
            :class="{ active: currentFilter === 'warn' }"
            @click="currentFilter = 'warn'"
          >
            Advertencias ({{ warnCount }})
          </button>
          <button
            class="pill-btn pill-backend"
            :class="{ active: currentFilter === 'backend' }"
            @click="currentFilter = 'backend'"
          >
            Backend ({{ backendCount }})
          </button>
          <button
            class="pill-btn pill-frontend"
            :class="{ active: currentFilter === 'frontend' }"
            @click="currentFilter = 'frontend'"
          >
            Frontend ({{ frontendCount }})
          </button>
        </div>

        <div class="toolbar-actions">
          <div class="search-box">
            <span class="search-icon">🔍</span>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Buscar en logs..."
              class="search-input"
            />
          </div>

          <button class="action-btn" title="Actualizar logs del backend" @click="refreshLogs">
            🔄 Actualizar
          </button>
          <button class="action-btn" :class="{ copied: isCopied }" title="Copiar logs al portapapeles" @click="copyLogs">
            {{ isCopied ? '✓ Copiado' : '📋 Copiar' }}
          </button>
          <button class="action-btn btn-danger" title="Limpiar lista de logs" @click="clearLogs">
            🗑️ Limpiar
          </button>
        </div>
      </div>

      <!-- Terminal Output Container -->
      <div ref="terminalBodyRef" class="terminal-body">
        <div v-if="filteredLogs.length === 0" class="empty-state">
          <span class="empty-icon">✨</span>
          <p class="empty-text">No hay registros que coincidan con el filtro actual.</p>
        </div>

        <div
          v-for="log in filteredLogs"
          :key="log.id"
          class="log-row"
          :class="`level-${log.level}`"
        >
          <span class="log-time">{{ log.timestamp }}</span>
          <span class="log-origin" :class="`origin-${log.origin}`">
            [{{ log.origin.toUpperCase() }}]
          </span>
          <span class="log-level" :class="`badge-${log.level}`">
            {{ log.level.toUpperCase() }}
          </span>
          <span v-if="log.source" class="log-source">({{ log.source }})</span>
          <pre class="log-message">{{ log.message }}</pre>
        </div>
      </div>

      <!-- Footer -->
      <div class="log-modal-footer">
        <span class="footer-stats">
          Mostrando {{ filteredLogs.length }} de {{ allLogs.length }} entradas registradas
        </span>
        <button class="btn-footer-close" @click="close">
          Cerrar Consola
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { appLogger, type AppLogEntry } from '../services/logger';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const allLogs = ref<AppLogEntry[]>([]);
const currentFilter = ref<'all' | 'error' | 'warn' | 'backend' | 'frontend'>('all');
const searchQuery = ref('');
const isCopied = ref(false);
const terminalBodyRef = ref<HTMLDivElement | null>(null);

let unsubscribe: (() => void) | null = null;
let pollTimer: any = null;

const syncLogs = () => {
  allLogs.value = appLogger.getLogs();
};

const refreshLogs = async () => {
  await appLogger.fetchBackendLogs();
  syncLogs();
};

const clearLogs = async () => {
  appLogger.clear();
  try {
    await fetch('/api/logs', { method: 'DELETE' });
  } catch {}
  syncLogs();
};

const copyLogs = async () => {
  const text = filteredLogs.value
    .map((l) => `[${l.timestamp}] [${l.origin.toUpperCase()}] [${l.level.toUpperCase()}]${l.source ? ` (${l.source})` : ''}: ${l.message}`)
    .join('\n');

  try {
    await navigator.clipboard.writeText(text || 'No hay logs disponibles.');
    isCopied.value = true;
    setTimeout(() => {
      isCopied.value = false;
    }, 2500);
  } catch {
    isCopied.value = true;
    setTimeout(() => {
      isCopied.value = false;
    }, 2500);
  }
};

const close = () => {
  emit('update:modelValue', false);
};

const errorCount = computed(() => allLogs.value.filter((l) => l.level === 'error').length);
const warnCount = computed(() => allLogs.value.filter((l) => l.level === 'warn').length);
const backendCount = computed(() => allLogs.value.filter((l) => l.origin === 'backend').length);
const frontendCount = computed(() => allLogs.value.filter((l) => l.origin === 'frontend').length);

const filteredLogs = computed(() => {
  let list = allLogs.value;

  if (currentFilter.value === 'error') {
    list = list.filter((l) => l.level === 'error');
  } else if (currentFilter.value === 'warn') {
    list = list.filter((l) => l.level === 'warn');
  } else if (currentFilter.value === 'backend') {
    list = list.filter((l) => l.origin === 'backend');
  } else if (currentFilter.value === 'frontend') {
    list = list.filter((l) => l.origin === 'frontend');
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter((l) => l.message.toLowerCase().includes(q) || (l.source && l.source.toLowerCase().includes(q)));
  }

  return list;
});

watch(
  () => props.modelValue,
  async (isOpen) => {
    if (isOpen) {
      await refreshLogs();
      nextTick(() => {
        if (terminalBodyRef.value) {
          terminalBodyRef.value.scrollTop = terminalBodyRef.value.scrollHeight;
        }
      });
    }
  }
);

onMounted(() => {
  syncLogs();
  unsubscribe = appLogger.subscribe(() => {
    syncLogs();
  });

  pollTimer = setInterval(() => {
    if (props.modelValue) {
      appLogger.fetchBackendLogs();
    }
  }, 4000);
});

onUnmounted(() => {
  if (unsubscribe) unsubscribe();
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<style scoped>
.log-modal-overlay {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  background: rgba(2, 6, 23, 0.85);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  z-index: 100000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  box-sizing: border-box;
}

.log-modal-card {
  width: min(96vw, 980px);
  height: min(88vh, 720px);
  background: #0f172a;
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.9), 0 0 40px rgba(56, 189, 248, 0.15);
  color: #f8fafc;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

/* Header */
.log-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 22px;
  background: #0a0f1d;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  gap: 16px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.terminal-icon {
  font-size: 1.5rem;
}

.modal-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  color: #f8fafc;
  line-height: 1.3;
}

.modal-subtitle {
  margin: 2px 0 0 0;
  font-size: 0.76rem;
  color: #94a3b8;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.badge-error-count {
  background: rgba(239, 68, 68, 0.18);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #fca5a5;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 20px;
  animation: pulse-red 2s infinite alternate;
}

@keyframes pulse-red {
  from { opacity: 0.7; }
  to { opacity: 1; }
}

.badge-no-errors {
  background: rgba(34, 197, 94, 0.12);
  border: 1px solid rgba(34, 197, 94, 0.35);
  color: #86efac;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 20px;
}

.btn-icon-close {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.2s ease;
}

.btn-icon-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

/* Toolbar */
.log-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 22px;
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.filter-pills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.pill-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #94a3b8;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.pill-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #f1f5f9;
}

.pill-btn.active {
  background: #0284c7;
  border-color: #38bdf8;
  color: #ffffff;
  font-weight: 600;
}

.pill-btn.pill-error.active {
  background: #dc2626;
  border-color: #f87171;
}

.pill-btn.pill-warn.active {
  background: #d97706;
  border-color: #fbbf24;
}

.pill-btn.pill-backend.active {
  background: #7c3aed;
  border-color: #a78bfa;
}

.pill-btn.pill-frontend.active {
  background: #0d9488;
  border-color: #2dd4bf;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-box {
  display: flex;
  align-items: center;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  padding: 3px 8px;
  gap: 6px;
}

.search-icon {
  font-size: 0.75rem;
  opacity: 0.6;
}

.search-input {
  background: transparent;
  border: none;
  outline: none;
  color: #f8fafc;
  font-size: 0.76rem;
  width: 140px;
}

.action-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #cbd5e1;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 0.74rem;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.25);
  color: #ffffff;
}

.action-btn.copied {
  background: rgba(34, 197, 94, 0.2);
  border-color: #4ade80;
  color: #86efac;
}

.btn-danger:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: #f87171;
  color: #fca5a5;
}

/* Terminal Body */
.terminal-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 20px;
  background: #090d16;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.78rem;
  line-height: 1.5;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #64748b;
  gap: 8px;
}

.empty-icon {
  font-size: 2rem;
}

.empty-text {
  margin: 0;
  font-size: 0.85rem;
}

.log-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 4px;
  margin-bottom: 2px;
  transition: background 0.15s ease;
  word-break: break-all;
}

.log-row:hover {
  background: rgba(255, 255, 255, 0.04);
}

.log-time {
  color: #64748b;
  flex-shrink: 0;
  user-select: none;
}

.log-origin {
  font-weight: 600;
  font-size: 0.68rem;
  flex-shrink: 0;
}

.origin-backend {
  color: #c084fc;
}

.origin-frontend {
  color: #38bdf8;
}

.log-level {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 0 4px;
  border-radius: 3px;
  flex-shrink: 0;
}

.badge-info {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
}

.badge-warn {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
}

.badge-error {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.log-source {
  color: #94a3b8;
  font-size: 0.72rem;
  flex-shrink: 0;
}

.log-message {
  margin: 0;
  color: #e2e8f0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  flex: 1;
}

.level-error {
  background: rgba(239, 68, 68, 0.06);
}

.level-error .log-message {
  color: #fca5a5;
  font-weight: 500;
}

.level-warn {
  background: rgba(245, 158, 11, 0.04);
}

.level-warn .log-message {
  color: #fde68a;
}

/* Footer */
.log-modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 22px;
  background: #0a0f1d;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.footer-stats {
  font-size: 0.74rem;
  color: #64748b;
}

.btn-footer-close {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #f1f5f9;
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-footer-close:hover {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.3);
}
</style>
