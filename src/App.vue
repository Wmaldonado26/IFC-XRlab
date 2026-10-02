<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import ProjectGallery from './components/ProjectGallery.vue';
import ViewerCo from './components/ViewerCo.vue';
import LoginModal from './components/LoginModal.vue';
import { checkSession, currentUser } from './services/auth-service';
import { fetchBackendProject, type BackendProject } from './services/backend-client';

const currentView = ref<'gallery' | 'viewer'>('gallery');
const selectedProject = ref<BackendProject | null>(null);
const isLoginModalOpen = ref(false);

async function syncRouteFromHash() {
  const hash = window.location.hash || '';

  if (hash.startsWith('#project=')) {
    const projectId = hash.replace('#project=', '').trim();
    if (projectId) {
      try {
        const proj = await fetchBackendProject(projectId);
        selectedProject.value = proj;
        currentView.value = 'viewer';
        triggerViewerResize();
        return;
      } catch (err: any) {
        console.warn('Acceso denegado o proyecto no encontrado:', err);
        alert(`No es posible abrir el proyecto: ${err.message || 'Acceso no autorizado'}`);
        window.location.hash = '#gallery';
        currentView.value = 'gallery';
        return;
      }
    }
  }

  if (hash === '#viewer' && selectedProject.value) {
    currentView.value = 'viewer';
    triggerViewerResize();
  } else {
    currentView.value = 'gallery';
  }
}

function triggerViewerResize() {
  nextTick(() => {
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 80);
  });
}

function handleOpenProject(project: BackendProject) {
  selectedProject.value = project;
  window.location.hash = `#project=${project.id}`;
  currentView.value = 'viewer';
  triggerViewerResize();
}

function handleReturnGallery() {
  window.location.hash = '#gallery';
  currentView.value = 'gallery';
}

function onLoginSuccess() {
  isLoginModalOpen.value = false;
  syncRouteFromHash();
}

onMounted(async () => {
  await checkSession();
  await syncRouteFromHash();
  window.addEventListener('hashchange', syncRouteFromHash);
});

onUnmounted(() => {
  window.removeEventListener('hashchange', syncRouteFromHash);
});
</script>

<template>
  <main class="app-root">
    <!-- Galería Principal de Proyectos -->
    <ProjectGallery
      v-show="currentView === 'gallery'"
      @open-project="handleOpenProject"
      @request-login="isLoginModalOpen = true"
    />

    <!-- Visor 3D BIM (Mantenido montado para preservar contexto WebGL y fragmentos en memoria) -->
    <ViewerCo
      v-show="currentView === 'viewer'"
      :initial-project="selectedProject"
      @return-gallery="handleReturnGallery"
    />

    <!-- Modal de Inicio de Sesión Global -->
    <LoginModal
      v-model="isLoginModalOpen"
      @login-success="onLoginSuccess"
    />
  </main>
</template>

<style>
html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  background: #090d16;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  overflow: hidden;
}

.app-root {
  width: 100vw;
  height: 100vh;
  margin: 0;
  padding: 0;
  position: relative;
  overflow: hidden;
}
</style>
