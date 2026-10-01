<template>
  <div class="section-bar-wrap">
    <div class="section-bar-card">
      <div class="bar-header">
        <span class="bar-icon">📐</span>
        <span class="bar-title">Plano de Sección 3D</span>
      </div>

      <div class="axis-buttons">
        <button
          type="button"
          class="axis-btn"
          :class="{ active: axis === 'x' }"
          @click="$emit('update:axis', 'x')"
        >
          X (Transversal)
        </button>
        <button
          type="button"
          class="axis-btn"
          :class="{ active: axis === 'y' }"
          @click="$emit('update:axis', 'y')"
        >
          Y (Cubierta / Deck)
        </button>
        <button
          type="button"
          class="axis-btn"
          :class="{ active: axis === 'z' }"
          @click="$emit('update:axis', 'z')"
        >
          Z (Longitudinal)
        </button>
      </div>

      <div class="slider-row">
        <input
          type="range"
          class="section-slider"
          :min="min"
          :max="max"
          :step="step"
          :value="offset"
          @input="$emit('update:offset', Number(($event.target as HTMLInputElement).value))"
        />
        <span class="offset-display">{{ offset.toFixed(1) }}m</span>
      </div>

      <div class="action-buttons">
        <button
          type="button"
          class="icon-action-btn"
          :class="{ 'is-inverted': inverted }"
          title="Invertir dirección del corte"
          @click="$emit('update:inverted', !inverted)"
        >
          🔄 Invertir
        </button>
        <button
          type="button"
          class="icon-action-btn close-btn"
          title="Desactivar plano de corte"
          @click="$emit('close')"
        >
          ✕ Cerrar
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    axis: 'x' | 'y' | 'z';
    offset: number;
    inverted: boolean;
    min?: number;
    max?: number;
  }>(),
  {
    min: -50,
    max: 50,
  }
);

defineEmits<{
  (e: 'update:axis', value: 'x' | 'y' | 'z'): void;
  (e: 'update:offset', value: number): void;
  (e: 'update:inverted', value: boolean): void;
  (e: 'close'): void;
}>();

const step = computed(() => {
  const span = Math.abs(props.max - props.min);
  return span > 100 ? 0.5 : 0.1;
});
</script>

<style scoped>
.section-bar-wrap {
  position: absolute;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  pointer-events: all;
  user-select: none;
}

.section-bar-card {
  display: flex;
  align-items: center;
  gap: 14px;
  background: rgba(15, 23, 42, 0.88);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(56, 189, 248, 0.35);
  border-radius: 12px;
  padding: 8px 18px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  color: #f8fafc;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 0.85rem;
}

.bar-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: #38bdf8;
  white-space: nowrap;
}

.axis-buttons {
  display: flex;
  gap: 4px;
  background: rgba(30, 41, 59, 0.7);
  padding: 3px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.axis-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.axis-btn:hover {
  color: #ffffff;
}

.axis-btn.active {
  background: #0284c7;
  color: #ffffff;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(2, 132, 199, 0.4);
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.section-slider {
  width: 140px;
  accent-color: #38bdf8;
  cursor: pointer;
}

.offset-display {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 0.8rem;
  color: #38bdf8;
  min-width: 48px;
  text-align: right;
}

.action-buttons {
  display: flex;
  gap: 6px;
}

.icon-action-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #e2e8f0;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 0.78rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.icon-action-btn:hover {
  background: rgba(255, 255, 255, 0.18);
  color: #ffffff;
}

.icon-action-btn.is-inverted {
  background: rgba(245, 158, 11, 0.2);
  border-color: #f59e0b;
  color: #fbbf24;
}

.close-btn {
  color: #fca5a5;
  border-color: rgba(239, 68, 68, 0.3);
}

.close-btn:hover {
  background: rgba(239, 68, 68, 0.25);
  color: #ffffff;
}
</style>
