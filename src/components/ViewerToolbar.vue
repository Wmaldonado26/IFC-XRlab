<template>
  <div class="viewer-toolbar-wrap">
    <div class="toolbar-dock">
      <!-- Cargar IFC -->
      <button
        type="button"
        class="dock-item"
        title="Cargar modelo IFC"
        @click="$emit('openIfc')"
      >
        <span class="dock-icon">📂</span>
        <span class="dock-label">Cargar IFC</span>
      </button>

      <!-- Cargar Frag -->
      <button
        type="button"
        class="dock-item"
        title="Cargar archivos de fragmentos (.frag)"
        @click="$emit('openFrag')"
      >
        <span class="dock-icon">🧩</span>
        <span class="dock-label">Cargar Frag</span>
      </button>

      <div class="dock-divider"></div>

      <!-- Planos de Sección / Corte 3D -->
      <button
        type="button"
        class="dock-item"
        :class="{ active: isSectionActive }"
        title="Plano de corte 3D interactivo"
        @click="$emit('toggleSection')"
      >
        <span class="dock-icon">📐</span>
        <span class="dock-label">Sección</span>
      </button>

      <!-- Vistas Ortogonales Dropdown/Pills -->
      <div class="views-group">
        <button
          type="button"
          class="dock-item view-btn"
          title="Vista Superior / Planta (Cubierta)"
          @click="$emit('setCameraView', 'top')"
        >
          <span class="dock-icon">⬆️</span>
          <span class="dock-label">Planta</span>
        </button>
        <button
          type="button"
          class="dock-item view-btn"
          title="Vista Frontal / Proa-Popa"
          @click="$emit('setCameraView', 'front')"
        >
          <span class="dock-icon">🚢</span>
          <span class="dock-label">Proa</span>
        </button>
        <button
          type="button"
          class="dock-item view-btn"
          title="Vista Lateral / Babor-Estribor"
          @click="$emit('setCameraView', 'side')"
        >
          <span class="dock-icon">↔️</span>
          <span class="dock-label">Perfil</span>
        </button>
        <button
          type="button"
          class="dock-item view-btn"
          title="Vista Isométrica 3D"
          @click="$emit('setCameraView', 'iso')"
        >
          <span class="dock-icon">🧭</span>
          <span class="dock-label">Iso</span>
        </button>
      </div>

      <div class="dock-divider"></div>

      <!-- Catálogo y Caché -->
      <button
        type="button"
        class="dock-item"
        title="Catálogo de Proyectos y Caché Local"
        @click="$emit('openProjects')"
      >
        <span class="dock-icon">🗂️</span>
        <span class="dock-label">Proyectos</span>
      </button>

      <!-- Limpiar Escena -->
      <button
        type="button"
        class="dock-item clear-btn"
        title="Limpiar modelos y liberar memoria"
        @click="$emit('clearScene')"
      >
        <span class="dock-icon">🧹</span>
        <span class="dock-label">Limpiar</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  isSectionActive: boolean;
}>();

defineEmits<{
  (e: 'openIfc'): void;
  (e: 'openFrag'): void;
  (e: 'toggleSection'): void;
  (e: 'setCameraView', view: 'top' | 'front' | 'side' | 'iso'): void;
  (e: 'openProjects'): void;
  (e: 'clearScene'): void;
}>();
</script>

<style scoped>
.viewer-toolbar-wrap {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  pointer-events: all;
  user-select: none;
}

.toolbar-dock {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(56, 189, 248, 0.25);
  border-radius: 16px;
  padding: 6px 12px;
  box-shadow: 0 12px 35px rgba(0, 0, 0, 0.55);
}

.dock-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 6px 10px;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 52px;
}

.dock-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
  transform: translateY(-2px);
}

.dock-item.active {
  background: rgba(2, 132, 199, 0.25);
  border-color: #38bdf8;
  color: #38bdf8;
}

.dock-icon {
  font-size: 1.15rem;
  line-height: 1;
}

.dock-label {
  font-size: 0.68rem;
  font-weight: 600;
  margin-top: 3px;
  letter-spacing: 0.02em;
}

.dock-divider {
  width: 1px;
  height: 28px;
  background: rgba(255, 255, 255, 0.12);
  margin: 0 4px;
}

.views-group {
  display: flex;
  align-items: center;
  gap: 3px;
  background: rgba(30, 41, 59, 0.5);
  border-radius: 10px;
  padding: 2px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.view-btn {
  padding: 5px 8px;
  min-width: 44px;
}

.clear-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.4);
  color: #fca5a5;
}
</style>
