#!/usr/bin/env tsx
/**
 * Test battery for Authentication, User Management, and Project Permissions in IFC-XRlab.
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

async function runAuthTests() {
  console.log('===================================================================');
  console.log(' 🛡️  INICIANDO BATERÍA DE PRUEBAS DE AUTENTICACIÓN Y PERMISOS');
  console.log('===================================================================\n');

  const adminJar: TestCookieJar = {};
  const userJar: TestCookieJar = {};

  // 1. Rechazo de solicitudes no autenticadas a rutas privadas
  console.log('▶ Test 1: Rechazo de solicitudes no autenticadas (401)...');
  const unauthUsers = await request('/api/users');
  if (unauthUsers.status !== 401) {
    throw new Error(`Fallo: GET /api/users respondió ${unauthUsers.status}, se esperaba 401.`);
  }
  const unauthProjects = await request('/api/projects');
  if (unauthProjects.status !== 401) {
    throw new Error(`Fallo: GET /api/projects respondió ${unauthProjects.status}, se esperaba 401.`);
  }
  console.log('  ✓ Rutas privadas devuelven 401 Unauthorized para peticiones anónimas.');

  // 2. Rechazo de credenciales incorrectas
  console.log('\n▶ Test 2: Rechazo de credenciales incorrectas (401)...');
  const badLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@ifcxrlab.local', password: 'PasswordTotalmenteErronea!' }),
  });
  if (badLogin.status !== 401) {
    throw new Error(`Fallo: Login con clave errónea respondió ${badLogin.status}, se esperaba 401.`);
  }
  const badData = await badLogin.json();
  if (badData.error && badData.error.toLowerCase().includes('password')) {
    throw new Error('Fallo de seguridad: Mensaje de error revela si el usuario existe o no.');
  }
  console.log('  ✓ Credenciales incorrectas rechazadas de forma genérica y segura.');

  // 3. Inicio de sesión como Administrador
  console.log('\n▶ Test 3: Inicio de sesión de Administrador e HttpOnly cookie...');
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
    throw new Error(`Fallo al autenticar admin: ${adminLogin.status} ${await adminLogin.text()}`);
  }
  if (!adminJar.cookie || !adminJar.cookie.includes('ifc_session=')) {
    throw new Error('Fallo: No se recibió la cookie de sesión ifc_session.');
  }
  const adminMe = await request('/api/auth/me', {}, adminJar);
  const adminMeData = await adminMe.json();
  if (!adminMeData.authenticated || adminMeData.user?.role !== 'admin') {
    throw new Error('Fallo: /api/auth/me no devolvió sesión de administrador válida.');
  }
  console.log(`  ✓ Administrador autenticado correctamente: ${adminMeData.user.email} (Rol: ${adminMeData.user.role})`);

  // 4. Acceso administrativo a la gestión de usuarios
  console.log('\n▶ Test 4: Gestión de usuarios por el administrador...');
  const usersListRes = await request('/api/users', {}, adminJar);
  if (usersListRes.status !== 200) {
    throw new Error(`Fallo admin GET /api/users: ${usersListRes.status}`);
  }
  const usersListData = await usersListRes.json();
  console.log(`  ✓ Administrador consultó lista de usuarios: ${usersListData.users.length} usuario(s) encontrado(s).`);

  // 5. Creación de un usuario normal
  console.log('\n▶ Test 5: Administrador crea un nuevo usuario con rol "user"...');
  const testEmail = `usuario.test.${Date.now()}@ifcxrlab.local`;
  const createUserRes = await request(
    '/api/users',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Operador de Pruebas',
        email: testEmail,
        password: 'UserPass1234!',
        role: 'user',
        isActive: true,
      }),
    },
    adminJar
  );
  if (createUserRes.status !== 201) {
    throw new Error(`Fallo al crear usuario: ${createUserRes.status} ${await createUserRes.text()}`);
  }
  const newUserData = await createUserRes.json();
  const testUserId = newUserData.user.id;
  console.log(`  ✓ Usuario normal creado con ID: ${testUserId} (${newUserData.user.email})`);

  // 6. Inicio de sesión del usuario normal
  console.log('\n▶ Test 6: Inicio de sesión del nuevo usuario normal...');
  const userLogin = await request(
    '/api/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'UserPass1234!' }),
    },
    userJar
  );
  if (userLogin.status !== 200) {
    throw new Error(`Fallo al iniciar sesión usuario normal: ${userLogin.status}`);
  }
  const userMe = await request('/api/auth/me', {}, userJar);
  const userMeData = await userMe.json();
  if (userMeData.user?.role !== 'user') {
    throw new Error(`Fallo: Se esperaba rol "user" pero se obtuvo "${userMeData.user?.role}"`);
  }
  console.log(`  ✓ Sesión iniciada con éxito para usuario normal: ${userMeData.user.name}`);

  // 7. Bloqueo de funciones administrativas para usuario normal
  console.log('\n▶ Test 7: Bloqueo de operaciones de administración para el usuario normal (403)...');
  const userTryUsers = await request('/api/users', {}, userJar);
  if (userTryUsers.status !== 403) {
    throw new Error(`Fallo: Usuario normal obtuvo código ${userTryUsers.status} en /api/users, se esperaba 403.`);
  }

  const userTryCreateProj = await request(
    '/api/projects',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Proyecto Ilegal' }),
    },
    userJar
  );
  if (userTryCreateProj.status !== 403) {
    throw new Error(`Fallo: Usuario normal obtuvo código ${userTryCreateProj.status} en POST /api/projects, se esperaba 403.`);
  }

  const userTryConvert = await request(
    '/api/convert',
    {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data' },
    },
    userJar
  );
  if (userTryConvert.status !== 403) {
    throw new Error(`Fallo: Usuario normal obtuvo código ${userTryConvert.status} en POST /api/convert, se esperaba 403.`);
  }
  console.log('  ✓ Todas las rutas administrativas (/api/users, POST /api/projects, POST /api/convert) bloquearon al usuario con 403 Forbidden.');

  // 8. Crear dos proyectos y asignar solo uno al usuario
  console.log('\n▶ Test 8: Aislamiento y permisos por proyecto...');
  const projARes = await request(
    '/api/projects',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `Proyecto Autorizado ${Date.now()}`, description: 'Proyecto asignado' }),
    },
    adminJar
  );
  const projA = (await projARes.json()).project;

  const projBRes = await request(
    '/api/projects',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `Proyecto Confidencial ${Date.now()}`, description: 'Proyecto NO asignado' }),
    },
    adminJar
  );
  const projB = (await projBRes.json()).project;

  // Asignar únicamente Proyecto A al usuario
  const assignRes = await request(
    `/api/users/${testUserId}/projects`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectIds: [projA.id] }),
    },
    adminJar
  );
  if (assignRes.status !== 200) {
    throw new Error(`Fallo al asignar proyecto: ${assignRes.status}`);
  }
  console.log(`  ✓ Proyecto "${projA.name}" asignado exclusivamente a ${testEmail}.`);

  // 9. Acceso de usuario normal a proyecto asignado y denegación a proyecto no asignado
  console.log('\n▶ Test 9: Comprobación de catálogo filtrado por permisos...');
  const userProjectsRes = await request('/api/projects', {}, userJar);
  const userProjectsData = await userProjectsRes.json();
  const visibleIds = userProjectsData.projects.map((p: any) => p.id);

  if (!visibleIds.includes(projA.id)) {
    throw new Error(`Fallo: El proyecto asignado ${projA.id} no aparece en la lista del usuario.`);
  }
  if (visibleIds.includes(projB.id)) {
    throw new Error(`Fallo de seguridad: El proyecto confidencial ${projB.id} NO asignado aparece en la lista del usuario.`);
  }
  console.log(`  ✓ El usuario normal solo ve su proyecto asignado (${projA.id}). El proyecto confidencial permanece oculto.`);

  // 10. Intento de acceso directo por ID a proyecto ajeno
  console.log('\n▶ Test 10: Intento de consulta directa por ID a proyecto no asignado...');
  const directDenied = await request(`/api/projects/${projB.id}`, {}, userJar);
  if (directDenied.status !== 403) {
    throw new Error(`Fallo: Acceso directo a proyecto ajeno devolvió ${directDenied.status}, se esperaba 403.`);
  }
  console.log(`  ✓ GET /api/projects/${projB.id} denegado con 403 Forbidden.`);

  // 11. Salvaguarda: El administrador no puede eliminarse a sí mismo ni desactivar el último admin
  console.log('\n▶ Test 11: Salvaguarda del último administrador activo...');
  const selfDelete = await request(`/api/users/${adminMeData.user.id}`, { method: 'DELETE' }, adminJar);
  if (selfDelete.status !== 400) {
    throw new Error(`Fallo: Auto-eliminación respondió ${selfDelete.status}, se esperaba 400.`);
  }

  const selfDemote = await request(
    `/api/users/${adminMeData.user.id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'user' }),
    },
    adminJar
  );
  if (selfDemote.status !== 400) {
    throw new Error(`Fallo: Auto-degradación del único admin respondió ${selfDemote.status}, se esperaba 400.`);
  }
  console.log('  ✓ El sistema impidió la auto-eliminación y degradación del único administrador activo.');

  // 12. Cierre de sesión e invalidación de token
  console.log('\n▶ Test 12: Cierre de sesión y verificación de invalidación...');
  const logoutRes = await request('/api/auth/logout', { method: 'POST' }, userJar);
  if (logoutRes.status !== 200) {
    throw new Error(`Fallo en logout: ${logoutRes.status}`);
  }
  const afterLogout = await request('/api/auth/me', {}, userJar);
  const afterLogoutData = await afterLogout.json();
  if (afterLogoutData.authenticated !== false) {
    throw new Error('Fallo: La sesión continuó activa tras el cierre de sesión.');
  }
  console.log('  ✓ Sesión cerrada e invalidada en base de datos correctamente.');

  // 13. Limpieza de datos temporales de prueba
  console.log('\n▶ Test 13: Limpieza controlada de registros de prueba...');
  await request(`/api/projects/${projA.id}`, { method: 'DELETE' }, adminJar);
  await request(`/api/projects/${projB.id}`, { method: 'DELETE' }, adminJar);
  await request(`/api/users/${testUserId}`, { method: 'DELETE' }, adminJar);
  console.log('  ✓ Proyectos y usuario de prueba eliminados correctamente.');

  console.log('\n===================================================================');
  console.log(' 🎉 TODAS LAS PRUEBAS DE AUTENTICACIÓN Y PERMISOS PASARON AL 100%');
  console.log('===================================================================');
}

runAuthTests().catch((err) => {
  console.error('\n❌ Error durante las pruebas:', err);
  process.exit(1);
});
