#!/usr/bin/env tsx
/**
 * Test to verify the exact user failure case:
 * /api/jobs/2b8801d1-1e5b-4558-bd48-1b2e6500dd0b/download/1
 */
const BASE_URL = 'http://localhost:3001';

async function testUserDownload() {
  console.log('===================================================================');
  console.log(' 🔍 PROBANDO DESCARGA EXACTA DEL CASO REPORTADO:');
  console.log('    /api/jobs/2b8801d1-1e5b-4558-bd48-1b2e6500dd0b/download/1');
  console.log('===================================================================\n');

  // 1. Login as Admin
  console.log('▶ 1. Autenticación de Administrador...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@ifcxrlab.local', password: 'Admin1234!' }),
  });
  if (loginRes.status !== 200) {
    throw new Error(`Login admin falló: ${loginRes.status}`);
  }
  const setCookie = loginRes.headers.get('set-cookie');
  const cookie = setCookie ? setCookie.split(';')[0] : '';
  console.log('  ✓ Administrador autenticado.');

  // 2. Request the exact URL that was previously failing
  console.log('\n▶ 2. Descargando fragmento 1 por ID de trabajo (/api/jobs/2b8801d1-1e5b-4558-bd48-1b2e6500dd0b/download/1)...');
  const dlRes = await fetch(`${BASE_URL}/api/jobs/2b8801d1-1e5b-4558-bd48-1b2e6500dd0b/download/1`, {
    headers: { Cookie: cookie },
  });

  console.log(`  ✓ Código HTTP recibido: ${dlRes.status} ${dlRes.statusText}`);
  if (dlRes.status !== 200) {
    const errText = await dlRes.text();
    throw new Error(`Fallo en la descarga: HTTP ${dlRes.status} - ${errText}`);
  }

  const contentType = dlRes.headers.get('content-type');
  const contentDisp = dlRes.headers.get('content-disposition');
  const contentLength = dlRes.headers.get('content-length');
  console.log(`  ✓ Content-Type: ${contentType}`);
  console.log(`  ✓ Content-Disposition: ${contentDisp}`);
  console.log(`  ✓ Content-Length: ${contentLength} bytes (~${(Number(contentLength) / (1024 * 1024)).toFixed(2)} MB)`);

  const buffer = await dlRes.arrayBuffer();
  console.log(`  ✓ Tamaño real recibido en memoria: ${buffer.byteLength} bytes`);
  if (buffer.byteLength !== 39396582) {
    throw new Error(`Fallo: Se esperaban 39396582 bytes, recibidos: ${buffer.byteLength}`);
  }

  // 3. Request by part name
  console.log('\n▶ 3. Descargando por nombre de fragmento (IFC_Zone_5_Hangar_2026-07-06_v2.frag)...');
  const dlNameRes = await fetch(`${BASE_URL}/api/jobs/2b8801d1-1e5b-4558-bd48-1b2e6500dd0b/download/IFC_Zone_5_Hangar_2026-07-06_v2.frag`, {
    headers: { Cookie: cookie },
  });
  if (dlNameRes.status !== 200) {
    throw new Error(`Fallo descargando por nombre: HTTP ${dlNameRes.status}`);
  }
  console.log(`  ✓ Descarga por nombre exitosa (${dlNameRes.status} OK).`);

  // 4. Request non-existent part (e.g. part 99)
  console.log('\n▶ 4. Verificación de error claro para parte inexistente (parte 99)...');
  const notFoundRes = await fetch(`${BASE_URL}/api/jobs/2b8801d1-1e5b-4558-bd48-1b2e6500dd0b/download/99`, {
    headers: { Cookie: cookie },
  });
  if (notFoundRes.status !== 404) {
    throw new Error(`Fallo: Se esperaba 404, recibido ${notFoundRes.status}`);
  }
  const notFoundJson = await notFoundRes.json();
  console.log(`  ✓ Parte inexistente rechazada con 404 y mensaje claro: "${notFoundJson.error}"`);

  // 5. Unauthenticated request
  console.log('\n▶ 5. Verificación de rechazo a petición no autenticada...');
  const unauthRes = await fetch(`${BASE_URL}/api/jobs/2b8801d1-1e5b-4558-bd48-1b2e6500dd0b/download/1`);
  if (unauthRes.status !== 401) {
    throw new Error(`Fallo: Se esperaba 401 para petición sin cookie, recibido ${unauthRes.status}`);
  }
  console.log('  ✓ Petición no autenticada rechazada con 401 Unauthorized.');

  console.log('\n===================================================================');
  console.log(' 🎉 CASO REPORTADO TOTALMENTE CORREGIDO Y VALIDADO');
  console.log('===================================================================\n');
}

testUserDownload().catch((err) => {
  console.error('\n❌ ERROR:', err);
  process.exit(1);
});
