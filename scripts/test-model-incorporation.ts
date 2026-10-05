#!/usr/bin/env tsx
/**
 * Test battery for IFC-XRLab Model Incorporation:
 * - Method 1: Convert IFC to FRAG (via backend queue linked to project)
 * - Method 2: Direct FRAG upload (validated and registered without re-conversion)
 * - Security, authorization, and viewer contract validation.
 */
import fs from 'node:fs';
import path from 'node:path';

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

async function runIncorporationTests() {
  console.log('===================================================================');
  console.log(' 🚢 INICIANDO BATERÍA DE PRUEBAS: INCORPORACIÓN DE MODELOS');
  console.log('    Método 1: Conversión IFC → FRAG');
  console.log('    Método 2: Carga directa de archivo .FRAG');
  console.log('===================================================================\n');

  const adminJar: TestCookieJar = {};
  const userJar: TestCookieJar = {};

  // 1. Backend Health Check
  console.log('▶ Test 1: Verificación de salud y almacenamiento del backend...');
  const healthRes = await request('/api/health');
  if (healthRes.status !== 200) {
    throw new Error(`Fallo: Backend no disponible (${healthRes.status})`);
  }
  const healthData = await healthRes.json();
  console.log(`  ✓ Microservicio activo (Puerto: ${healthData.port}, Memoria Libre: ${healthData.freeMemoryGB} GB)`);

  // 2. Login as Admin
  console.log('\n▶ Test 2: Autenticación de Administrador...');
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
  console.log('  ✓ Administrador autenticado correctamente.');

  // 3. Create regular user for permission tests
  console.log('\n▶ Test 3: Creación de usuario estándar para pruebas de seguridad...');
  const testUserEmail = `user.incorp.${Date.now()}@ifcxrlab.local`;
  const createUserRes = await request(
    '/api/users',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Operador No Administrador',
        email: testUserEmail,
        password: 'UserPass1234!',
        role: 'user',
        isActive: true,
      }),
    },
    adminJar
  );
  if (createUserRes.status !== 201) {
    throw new Error(`Fallo creando usuario: ${createUserRes.status}`);
  }
  const testUserData = await createUserRes.json();
  const testUserId = testUserData.user.id;

  // Login as normal user
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
    throw new Error(`Fallo login usuario: ${userLogin.status}`);
  }
  console.log(`  ✓ Usuario normal autenticado (${testUserEmail}).`);

  // 4. Create new Project as Admin
  console.log('\n▶ Test 4: Creación de proyecto para incorporar modelos...');
  const createProjRes = await request(
    '/api/projects',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Proyecto Prueba Incorporación ${Date.now()}`,
        description: 'Proyecto para validar Método 1 (IFC) y Método 2 (FRAG directo).',
      }),
    },
    adminJar
  );
  if (createProjRes.status !== 201) {
    throw new Error(`Fallo creando proyecto: ${createProjRes.status}`);
  }
  const testProject = (await createProjRes.json()).project;
  console.log(`  ✓ Proyecto creado: "${testProject.name}" (ID: ${testProject.id})`);

  // 5. Test Method 2: Direct FRAG Upload
  console.log('\n▶ Test 5: MÉTODO 2 — Carga directa de archivo .frag existente...');

  // 5a. Validation: Invalid file extension (e.g. .txt)
  console.log('  5a. Validación: Rechazo de archivos sin extensión .frag...');
  const badExtForm = new FormData();
  badExtForm.append('file', new Blob(['contenido_falso'], { type: 'text/plain' }), 'invalido.txt');
  const badExtRes = await request(
    `/api/projects/${testProject.id}/models/upload-frag`,
    {
      method: 'POST',
      body: badExtForm,
    },
    adminJar
  );
  if (badExtRes.status !== 400) {
    throw new Error(`Fallo: Debería haber rechazado extensión inválida con 400, respondió ${badExtRes.status}`);
  }
  console.log('    ✓ Servidor rechazó correctamente archivo no .frag con 400 Bad Request.');

  // 5b. Validation: Empty file (0 bytes)
  console.log('  5b. Validación: Rechazo de archivo .frag vacío (0 bytes)...');
  const emptyFragForm = new FormData();
  emptyFragForm.append('file', new Blob([], { type: 'application/octet-stream' }), 'vacio.frag');
  const emptyFragRes = await request(
    `/api/projects/${testProject.id}/models/upload-frag`,
    {
      method: 'POST',
      body: emptyFragForm,
    },
    adminJar
  );
  if (emptyFragRes.status !== 400) {
    throw new Error(`Fallo: Debería haber rechazado archivo de 0 bytes con 400, respondió ${emptyFragRes.status}`);
  }
  console.log('    ✓ Servidor rechazó correctamente archivo .frag vacío con 400 Bad Request.');

  // 5c. Security: Normal user cannot upload direct FRAG
  console.log('  5c. Seguridad: Intento de subida directa por usuario no administrador...');
  const dummyFragBytes = new Uint8Array([0x46, 0x52, 0x41, 0x47, 0x01, 0x00, 0x00, 0x00, 0x20, 0x21, 0x22]); // magic dummy
  const userFragForm = new FormData();
  userFragForm.append('file', new Blob([dummyFragBytes]), 'modelo_directo.frag');
  const userUploadRes = await request(
    `/api/projects/${testProject.id}/models/upload-frag`,
    {
      method: 'POST',
      body: userFragForm,
    },
    userJar
  );
  if (userUploadRes.status !== 403) {
    throw new Error(`Fallo: Usuario normal no debería poder subir modelos, respondió ${userUploadRes.status}`);
  }
  console.log('    ✓ Acceso denegado a usuario normal con 403 Forbidden.');

  // 5d. Successful Direct FRAG Upload by Admin
  console.log('  5d. Subida válida de archivo .frag por Administrador...');
  const adminFragForm = new FormData();
  const fragFileName = 'casco_principal.frag';
  adminFragForm.append('file', new Blob([dummyFragBytes]), fragFileName);

  const directUploadRes = await request(
    `/api/projects/${testProject.id}/models/upload-frag`,
    {
      method: 'POST',
      body: adminFragForm,
    },
    adminJar
  );
  if (directUploadRes.status !== 201) {
    const errText = await directUploadRes.text();
    throw new Error(`Fallo en subida directa: ${directUploadRes.status} - ${errText}`);
  }
  const uploadData = await directUploadRes.json();
  const directModel = uploadData.model;
  console.log(`    ✓ Modelo persistido sin conversión: "${directModel.name}" (ID: ${directModel.id})`);
  console.log(`    - Ruta de almacenamiento: ${directModel.storage_path}`);
  console.log(`    - Tamaño registrado: ${directModel.size_bytes} bytes`);

  // Verify file exists on disk
  const expectedDiskPath = path.resolve(process.cwd(), 'storage', directModel.storage_path);
  if (!fs.existsSync(expectedDiskPath)) {
    throw new Error(`Fallo: Archivo físico no existe en disco: ${expectedDiskPath}`);
  }
  console.log(`    ✓ Verificación física en disco exitosa: ${expectedDiskPath}`);

  // 6. Test Method 1: IFC Conversion linked to Project
  console.log('\n▶ Test 6: MÉTODO 1 — Conversión IFC asociada a proyecto existente...');

  // 6a. Security check: Normal user cannot convert IFC
  console.log('  6a. Seguridad: Intento de conversión por usuario normal...');
  const sampleIfcPath = path.resolve(process.cwd(), 'temp', 'sample_cube.ifc');
  if (!fs.existsSync(sampleIfcPath)) {
    throw new Error(`Fallo: ${sampleIfcPath} no encontrado`);
  }
  const sampleIfcBuffer = fs.readFileSync(sampleIfcPath);

  const userIfcForm = new FormData();
  userIfcForm.append('file', new Blob([sampleIfcBuffer]), 'cubo.ifc');
  const userConvertRes = await request(
    `/api/convert?projectId=${testProject.id}`,
    {
      method: 'POST',
      body: userIfcForm,
    },
    userJar
  );
  if (userConvertRes.status !== 403) {
    throw new Error(`Fallo: Conversión debería denegarse a usuario normal, respondió ${userConvertRes.status}`);
  }
  console.log('    ✓ Acceso a conversión denegado a usuario normal con 403 Forbidden.');

  // 6b. Admin executes conversion targeting the project
  console.log('  6b. Conversión de archivo IFC en streaming por Administrador...');
  const adminIfcForm = new FormData();
  adminIfcForm.append('file', new Blob([sampleIfcBuffer]), 'cubo_incorporado.ifc');

  const convertRes = await request(
    `/api/convert?projectId=${testProject.id}`,
    {
      method: 'POST',
      body: adminIfcForm,
    },
    adminJar
  );
  if (convertRes.status !== 202) {
    const errText = await convertRes.text();
    throw new Error(`Fallo al enviar IFC a conversión: ${convertRes.status} - ${errText}`);
  }
  const convertData = await convertRes.json();
  const jobId = convertData.jobId;
  console.log(`    ✓ Trabajo encolado exitosamente [Job ID: ${jobId}], Destino: ${convertData.targetProjectId}`);

  // 6c. Wait for conversion to complete
  console.log('  6c. Monitoreo de conversión SSE en backend...');
  const conversionComplete = await new Promise<any>((resolve, reject) => {
    const sseUrl = `${BASE_URL}/api/jobs/${jobId}/progress`;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      reject(new Error('Timeout esperando evento SSE de conversión'));
    }, 45000);

    fetch(sseUrl, {
      headers: { Cookie: adminJar.cookie || '' },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok || !res.body) {
          throw new Error(`Error en flujo SSE (${res.status})`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('data:')) {
              try {
                const data = JSON.parse(line.slice(5).trim());
                if (data.stage) {
                  // progress event
                  process.stdout.write(`\r     ⏳ [${data.percent}%] ${data.stage} `);
                }
                if (data.parts && Array.isArray(data.parts)) {
                  // complete event
                  clearTimeout(timeout);
                  controller.abort();
                  console.log('\n     ✅ Conversión finalizada con éxito.');
                  resolve(data);
                  return;
                }
              } catch {}
            }
          }
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          reject(err);
        }
      });
  });

  console.log(`    ✓ Partes generadas: ${conversionComplete.parts.join(', ')} (${conversionComplete.totalSizeMB} MB)`);

  // 7. Verification: Project has models from both Method 1 and Method 2
  console.log('\n▶ Test 7: Verificación del proyecto actualizado en el catálogo...');
  const projDetailsRes = await request(`/api/projects/${testProject.id}`, {}, adminJar);
  if (projDetailsRes.status !== 200) {
    throw new Error(`Fallo al consultar detalles de proyecto: ${projDetailsRes.status}`);
  }
  const updatedProject = (await projDetailsRes.json()).project;
  console.log(`  ✓ Proyecto consultado: "${updatedProject.name}"`);
  console.log(`    - Total de modelos registrados: ${updatedProject.models.length}`);
  console.log(`    - Partes para el visor: [${updatedProject.parts.join(', ')}]`);

  if (updatedProject.models.length < 2) {
    throw new Error(`Fallo: Se esperaban al menos 2 modelos (1 directo + fragmentos convertidos), encontrados: ${updatedProject.models.length}`);
  }

  // Verify that the direct FRAG is among the models
  const foundDirect = updatedProject.models.find((m: any) => m.name === fragFileName);
  if (!foundDirect) {
    throw new Error(`Fallo: El modelo directo ${fragFileName} no se encuentra en el proyecto`);
  }
  console.log(`  ✓ Modelo subido directamente (${fragFileName}) está debidamente relacionado con el proyecto.`);

  // 8. Viewer Integration: Download verification
  console.log('\n▶ Test 8: Verificación de descarga compatible con ViewerCo.vue...');

  // 8a. Direct model download via /api/models/:id/download
  console.log('  8a. Descarga directa por ID de modelo...');
  const dlModelRes = await request(`/api/models/${directModel.id}/download`, {}, adminJar);
  if (dlModelRes.status !== 200) {
    throw new Error(`Fallo descargando modelo directo: ${dlModelRes.status}`);
  }
  const dlModelBuf = await dlModelRes.arrayBuffer();
  if (dlModelBuf.byteLength !== dummyFragBytes.byteLength) {
    throw new Error(`Fallo: Tamaño descargado (${dlModelBuf.byteLength}) no coincide con subido (${dummyFragBytes.byteLength})`);
  }
  console.log(`    ✓ Descarga por ID de modelo exitosa (${dlModelBuf.byteLength} bytes recibidos).`);

  // 8b. Viewer project parts download via /api/jobs/:projectId/download/:part
  console.log('  8b. Descarga por parte del proyecto (contrato del visor)...');
  const firstPartName = updatedProject.parts[0];
  const dlPartRes = await request(`/api/jobs/${testProject.id}/download/${encodeURIComponent(firstPartName)}`, {}, adminJar);
  if (dlPartRes.status !== 200) {
    throw new Error(`Fallo descargando parte ${firstPartName}: ${dlPartRes.status}`);
  }
  const dlPartBuf = await dlPartRes.arrayBuffer();
  console.log(`    ✓ Descarga de parte "${firstPartName}" exitosa (${dlPartBuf.byteLength} bytes recibidos).`);

  // 9. Unauthorized access verification for unassigned user
  console.log('\n▶ Test 9: Protección de acceso por proyecto a usuarios no asignados...');
  const unassignedProjRes = await request(`/api/projects/${testProject.id}`, {}, userJar);
  if (unassignedProjRes.status !== 403) {
    throw new Error(`Fallo: Usuario no asignado debería recibir 403, recibió ${unassignedProjRes.status}`);
  }
  console.log('  ✓ Usuario no asignado no puede consultar el proyecto (403 Forbidden).');

  const unassignedDlRes = await request(`/api/models/${directModel.id}/download`, {}, userJar);
  if (unassignedDlRes.status !== 403) {
    throw new Error(`Fallo: Descarga de modelo debería ser 403 para usuario no asignado, recibió ${unassignedDlRes.status}`);
  }
  console.log('  ✓ Descarga de modelos denegada a usuarios no asignados (403 Forbidden).');

  // 10. Clean up test project safely
  console.log('\n▶ Test 10: Eliminación limpia del proyecto de prueba y sus archivos asociados...');
  const deleteRes = await request(`/api/projects/${testProject.id}`, { method: 'DELETE' }, adminJar);
  if (deleteRes.status !== 200) {
    throw new Error(`Fallo eliminando proyecto: ${deleteRes.status}`);
  }
  const deleteData = await deleteRes.json();
  console.log(`  ✓ Proyecto eliminado correctamente (${deleteData.deletedModelsCount} modelos eliminados de SQLite y disco).`);

  // Clean up test user
  await request(`/api/users/${testUserId}`, { method: 'DELETE' }, adminJar);
  console.log(`  ✓ Usuario de pruebas temporal eliminado.`);

  console.log('\n===================================================================');
  console.log(' 🎉 TODAS LAS PRUEBAS DE INCORPORACIÓN DE MODELOS PASARON AL 100%');
  console.log('===================================================================\n');
}

runIncorporationTests().catch((err) => {
  console.error('\n❌ ERROR EN LA BATERÍA DE PRUEBAS:', err);
  process.exit(1);
});
