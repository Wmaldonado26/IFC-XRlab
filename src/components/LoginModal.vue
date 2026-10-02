<template>
  <div v-if="modelValue" class="modal-backdrop" @click.self="onBackdropClick">
    <div class="login-card">
      <div class="login-header">
        <div class="brand-badge">
          <span class="brand-icon">🔐</span>
        </div>
        <h3 class="login-title">Iniciar Sesión</h3>
        <p class="login-subtitle">Acceso seguro a proyectos y modelos BIM de IFC-XRlab</p>
        <button
          v-if="allowClose"
          type="button"
          class="close-btn"
          title="Cerrar"
          @click="$emit('update:modelValue', false)"
        >
          ✕
        </button>
      </div>

      <div v-if="errorMessage" class="error-banner">
        <span class="error-icon">⚠️</span>
        <span>{{ errorMessage }}</span>
      </div>

      <form class="login-form" @submit.prevent="handleLogin">
        <div class="form-group">
          <label class="form-label" for="login-email">Correo Electrónico</label>
          <div class="input-wrapper">
            <span class="input-icon">✉️</span>
            <input
              id="login-email"
              v-model="email"
              type="email"
              required
              autocomplete="email"
              placeholder="usuario@ejemplo.com"
              class="form-input"
              :disabled="isLoading"
            />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="login-password">Contraseña</label>
          <div class="input-wrapper">
            <span class="input-icon">🔑</span>
            <input
              id="login-password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              required
              autocomplete="current-password"
              placeholder="••••••••••••"
              class="form-input"
              :disabled="isLoading"
            />
            <button
              type="button"
              class="toggle-pwd-btn"
              :title="showPassword ? 'Ocultar' : 'Mostrar'"
              tabindex="-1"
              @click="showPassword = !showPassword"
            >
              {{ showPassword ? '👁️' : '🙈' }}
            </button>
          </div>
        </div>

        <button
          type="submit"
          class="submit-btn"
          :disabled="isLoading || !email || !password"
        >
          <span v-if="isLoading" class="spinner-sm"></span>
          <span v-else>Entrar a la Plataforma</span>
        </button>
      </form>

      <div class="login-footer">
        <span class="security-note">🛡️ Autenticación con cookies HttpOnly y protección contra fuerza bruta</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { login, currentUser } from '../services/auth-service';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    allowClose?: boolean;
  }>(),
  {
    allowClose: true,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'login-success'): void;
}>();

const email = ref('');
const password = ref('');
const showPassword = ref(false);
const isLoading = ref(false);
const errorMessage = ref('');

function onBackdropClick() {
  if (props.allowClose) {
    emit('update:modelValue', false);
  }
}

async function handleLogin() {
  if (!email.value || !password.value) return;

  isLoading.value = true;
  errorMessage.value = '';

  try {
    await login(email.value.trim(), password.value);
    emit('login-success');
    emit('update:modelValue', false);
    password.value = '';
  } catch (err: any) {
    errorMessage.value = err.message || 'Error al iniciar sesión. Compruebe sus credenciales.';
  } finally {
    isLoading.value = false;
  }
}
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
  padding: 16px;
  animation: fadeIn 0.2s ease-out;
}

.login-card {
  position: relative;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
  padding: 32px 28px;
  color: #f1f5f9;
  animation: slideUp 0.25s ease-out;
}

.login-header {
  position: relative;
  text-align: center;
  margin-bottom: 24px;
}

.brand-badge {
  width: 52px;
  height: 52px;
  margin: 0 auto 12px;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(99, 102, 241, 0.3));
  border: 1px solid rgba(99, 102, 241, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.login-title {
  font-size: 1.35rem;
  font-weight: 700;
  color: #ffffff;
  margin: 0 0 6px;
}

.login-subtitle {
  font-size: 0.85rem;
  color: #94a3b8;
  margin: 0;
  line-height: 1.4;
}

.close-btn {
  position: absolute;
  top: -8px;
  right: -8px;
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

.error-banner {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #fca5a5;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 0.84rem;
  margin-bottom: 18px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.error-icon {
  font-size: 1.1rem;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
}

.form-label {
  font-size: 0.82rem;
  font-weight: 600;
  color: #cbd5e1;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 12px;
  font-size: 14px;
  opacity: 0.6;
}

.form-input {
  width: 100%;
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 11px 40px 11px 36px;
  font-size: 0.9rem;
  color: #f8fafc;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.form-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}

.form-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.toggle-pwd-btn {
  position: absolute;
  right: 10px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  opacity: 0.7;
  padding: 4px;
}

.toggle-pwd-btn:hover {
  opacity: 1;
}

.submit-btn {
  margin-top: 8px;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #ffffff;
  padding: 12px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s;
}

.submit-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);
  transform: translateY(-1px);
}

.submit-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.login-footer {
  margin-top: 22px;
  text-align: center;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 14px;
}

.security-note {
  font-size: 0.74rem;
  color: #64748b;
}

.spinner-sm {
  width: 18px;
  height: 18px;
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
