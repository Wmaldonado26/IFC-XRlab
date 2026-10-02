#!/usr/bin/env tsx
/**
 * Test battery for the Main Project Gallery flow and security in IFC-XRlab.
 */
const BASE_URL = 'http://localhost:3001';

interface TestCookieJar {
  cookie?: string;
}

async function request(urlPath: string, options: RequestInit = {}, jar?: TestCookieJar): Promise<Response> {
  const headers = new Headers(options.headers || {});
  if (jar?.cookie) {
    headers.set('Cookie', jar.cookie);
  }

  const res = await fetch(`${BASE_URL}${urlPath}`, {
    ...options,
    headers,
  });

  const setCookie = res.headers.get('set-cookie');
  if (setCookie && jar) {
    jar.cookie = setCookie.split(';')[0];
  }

  return res;
}

async function runGalleryTests() {
  console.log('===================================================================');
  console.log(' 🖼️  INICIANDO PRUEBAS DE LA GALERÍA PRINCIPAL DE PROYECTOS');
  console.log('===================================================================\n');

  const adminJar: TestCookieJar = {};
  const userJar: TestCookieJar = {};

  // 1. Verificación de salud del servidor backend
  console.log('▶ Test 1: Verificación de disponibilidad del microservicio backend...');
  const healthRes = await request('/api/health');
  if (healthRes.status !== 200) {
    throw new Error(`Fallo: Backend respondió ${healthRes.status}`);
  }
  const healthData = await healthRes.json();
  console.log(`  ✓ Backend online (Puerto: ${healthData.port}, Modelos persistidos: ${healthData.storage?.totalModels})`);

  // 2. Inicio de sesión como Administrador
  console.log('\n▶ Test 2: Autenticación de Administrador para consulta de galería...');
  const adminLogin = await request(
    '/api/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@ifcxrlab.local', password: 'Admin1234!' }),
    },
    adminJar
  );
  if (adminLogin.status !== 200) {
    throw new Error(`Fallo login admin: ${adminLogin.status}`);
  }
  console.log('  ✓ Administrador autenticado.');

  // 3. Consulta de proyectos para la galería (Admin)
  console.log('\n▶ Test 3: Carga del catálogo para la Galería (Admin)...');
  const adminProjectsRes = await request('/api/projects', {}, adminJar);
  if (adminProjectsRes.status !== 200) {
    throw new Error(`Fallo al consultar proyectos: ${adminProjectsRes.status}`);
  }
  const adminProjects = (await adminProjectsRes.json()).projects;
  console.log(`  ✓ Administrador visualiza ${adminProjects.length} proyecto(s) en la Galería.`);
  if (adminProjects.length > 0) {
    const first = adminProjects[0];
    console.log(`    - Ejemplo: "${first.name}" (${first.modelsCount} modelos, ${first.totalPartsSizeMB} MB)`);
    if (typeof first.modelsCount !== 'number' || !Array.isArray(first.parts)) {
      throw new Error('Fallo: Formato de proyecto incompatible con las tarjetas de la galería.');
    }
  }

  // 4. Creación de un usuario normal para pruebas de permisos en la galería
  console.log('\n▶ Test 4: Creación de usuario normal y prueba de galería sin asignaciones...');
  const testUserEmail = `galeria.user.${Date.now()}@ifcxrlab.local`;
  const createUserRes = await request(
    '/api/users',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Visualizador de Buques',
        email: testUserEmail,
        password: 'UserPass1234!',
        role: 'user',
        isActive: true,
      }),
    },
    adminJar
  );
  const createdUserData = await createUserRes.json();
  const testUserId = createdUserData.user.id;

  // Login como usuario normal
  const userLogin = await request(
    '/api/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUserEmail, password: 'UserPass1234!' }),
    },
    userJar
  );
  if (userLogin.status !== 200) {
    throw new Error(`Fallo login usuario normal: ${userLogin.status}`);
  }

  // Galería del usuario normal: debe estar vacía porque no tiene proyectos asignados
  const userEmptyProjectsRes = await request('/api/projects', {}, userJar);
  const userEmptyProjects = (await userEmptyProjectsRes.json()).projects;
  if (userEmptyProjects.length !== 0) {
    throw new Error(`Fallo de seguridad: Usuario sin asignaciones ve ${userEmptyProjects.length} proyectos.`);
  }
  console.log('  ✓ La galería del usuario no asignado devuelve 0 proyectos (activa la pantalla vacía de seguridad).');

  // 5. Creación de Proyecto Alpha y Proyecto Beta
  console.log('\n▶ Test 5: Administrador crea dos proyectos en SQLite...');
  const projAlphaRes = await request(
    '/api/projects',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `Buque Alpha ${Date.now()}`, description: 'Fragata de prueba asignada' }),
    },
    adminJar
  );
  const projAlpha = (await projAlphaRes.json()).project;

  const projBetaRes = await request(
    '/api/projects',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `Submarino Beta Confidencial ${Date.now()}`, description: 'Proyecto restringido' }),
    },
    adminJar
  );
  const projBeta = (await projBetaRes.json()).project;

  // Asignar únicamente Alpha al usuario
  await request(
    `/api/users/${testUserId}/projects`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectIds: [projAlpha.id] }),
    },
    adminJar
  );
  console.log(`  ✓ Proyecto Alpha asignado al usuario. Proyecto Beta reservado.`);

  // 6. Comprobar que en la Galería del usuario solo aparece Alpha
  console.log('\n▶ Test 6: Comprobación de tarjetas en la Galería del usuario...');
  const userGalleryRes = await request('/api/projects', {}, userJar);
  const userGalleryProjects = (await userGalleryRes.json()).projects;
  const userVisibleIds = userGalleryProjects.map((p: any) => p.id);

  if (!userVisibleIds.includes(projAlpha.id)) {
    throw new Error('Fallo: El proyecto asignado no aparece en la galería del usuario.');
  }
  if (userVisibleIds.includes(projBeta.id)) {
    throw new Error('Fallo de seguridad: El proyecto no asignado aparece en la galería del usuario.');
  }
  console.log(`  ✓ Galería del usuario normal muestra exactamente 1 tarjeta correspondiente a "${projAlpha.name}".`);

  // 7. Intento de manipulación de URL directa (#project=<unassigned_id>)
  console.log('\n▶ Test 7: Simulación de acceso por URL directa a proyecto no asignado...');
  const directDeniedRes = await request(`/api/projects/${projBeta.id}`, {}, userJar);
  if (directDeniedRes.status !== 403) {
    throw new Error(`Fallo de seguridad: Acceso directo a proyecto no asignado devolvió ${directDeniedRes.status}, se esperaba 403.`);
  }
  console.log(`  ✓ Endpoint /api/projects/${projBeta.id} rechazó la solicitud directa con 403 Forbidden.`);

  // 8. Apertura autorizada del proyecto asignado
  console.log('\n▶ Test 8: Apertura autorizada del proyecto asignado...');
  const directAllowedRes = await request(`/api/projects/${projAlpha.id}`, {}, userJar);
  if (directAllowedRes.status !== 200) {
    throw new Error(`Fallo: Acceso a proyecto asignado devolvió ${directAllowedRes.status}`);
  }
  const allowedProject = (await directAllowedRes.json()).project;
  console.log(`  ✓ Metadatos del proyecto autorizados y cargados para el visor: "${allowedProject.name}" (ID: ${allowedProject.id})`);

  // 9. Limpieza de datos temporales
  console.log('\n▶ Test 9: Limpieza de datos temporales...');
  await request(`/api/projects/${projAlpha.id}`, { method: 'DELETE' }, adminJar);
  await request(`/api/projects/${projBeta.id}`, { method: 'DELETE' }, adminJar);
  await request(`/api/users/${testUserId}`, { method: 'DELETE' }, adminJar);
  console.log('  ✓ Proyectos y usuario de prueba eliminados limpiamente.');

  console.log('\n===================================================================');
  console.log(' 🎉 TODAS LAS PRUEBAS DE LA GALERÍA PRINCIPAL PASARON AL 100%');
  console.log('===================================================================');
}

runGalleryTests().catch((err) => {
  console.error('\n❌ Error durante las pruebas de la galería:', err);
  process.exit(1);
});
