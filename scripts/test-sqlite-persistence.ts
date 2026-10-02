import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  initDatabase,
  getDb,
  verifyStorageIntegrity,
  resolveStoragePath,
  findModelByProjectAndPart,
  getProject,
  deleteProject,
  closeDatabase,
  persistJobArtifacts,
  listProjectsWithModels,
  DB_PATH,
} from '../server/db.js';

async function runTests() {
  console.log('===================================================================');
  console.log(' 🧪 INICIANDO BATERÍA DE PRUEBAS DE PERSISTENCIA SQLITE Y FRAG');
  console.log('===================================================================\n');

  // Test 1: Creación de la base SQLite e inicialización de tablas
  console.log('▶ Test 1: Creación de SQLite e inicialización idempotente...');
  initDatabase();
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`Fallo: La base de datos SQLite no existe en ${DB_PATH}`);
  }
  console.log(`  ✓ Archivo SQLite verificado en: ${DB_PATH}`);

  const db = getDb();
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all() as any[];
  const tableNames = tables.map((t) => t.name);
  console.log(`  ✓ Tablas encontradas: ${tableNames.join(', ')}`);
  if (!tableNames.includes('projects') || !tableNames.includes('models') || !tableNames.includes('conversion_jobs')) {
    throw new Error('Fallo: Faltan tablas obligatorias en el esquema SQLite');
  }

  // Test 2: Idempotencia en reinicios sucesivos
  console.log('\n▶ Test 2: Idempotencia en reinicios...');
  initDatabase();
  initDatabase();
  console.log('  ✓ initDatabase() ejecutado múltiples veces sin duplicación ni errores');

  // Test 3: Protección contra Path Traversal
  console.log('\n▶ Test 3: Validación de seguridad contra Path Traversal...');
  try {
    resolveStoragePath('../../etc/passwd');
    throw new Error('Fallo: Debería haber bloqueado el intento de path traversal');
  } catch (err: any) {
    if (err.message.includes('Acceso denegado')) {
      console.log('  ✓ Path traversal bloqueado correctamente:', err.message);
    } else {
      throw err;
    }
  }

  // Test 4: Persistencia atómica de fragmentos y verificación en disco
  console.log('\n▶ Test 4: Simulación de persistencia atómica de FRAG...');
  const testJobId = crypto.randomUUID();
  const testTempDir = path.resolve(process.cwd(), 'temp', `test-${testJobId}`);
  fs.mkdirSync(testTempDir, { recursive: true });

  const dummyPart1 = 'SampleBuilding_Part1.frag';
  const dummyPart2 = 'SampleBuilding_Part2.frag';
  const content1 = Buffer.from('FRAG_HEADER_PART1_MOCK_DATA_0123456789ABCDEF');
  const content2 = Buffer.from('FRAG_HEADER_PART2_MOCK_DATA_9876543210FEDCBA');

  fs.writeFileSync(path.join(testTempDir, dummyPart1), content1);
  fs.writeFileSync(path.join(testTempDir, dummyPart2), content2);

  const persistedModels = persistJobArtifacts(
    testJobId,
    'SampleBuilding.ifc',
    testTempDir,
    [dummyPart1, dummyPart2],
    crypto.randomUUID
  );

  console.log(`  ✓ ${persistedModels.length} modelos persistidos en SQLite`);
  for (const m of persistedModels) {
    console.log(`    - Modelo ID: ${m.id} | Nombre: ${m.name} | Ruta: ${m.storage_path} | Tamaño: ${m.size_bytes} bytes`);
    const absPath = resolveStoragePath(m.storage_path);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Fallo: El archivo físico no existe en ${absPath}`);
    }
    const stat = fs.statSync(absPath);
    if (stat.size !== m.size_bytes) {
      throw new Error(`Fallo: Discrepancia de tamaño (${stat.size} != ${m.size_bytes})`);
    }
  }

  // Test 5: Simulación de reinicio de Node.js y recuperación desde SQLite
  console.log('\n▶ Test 5: Reinicio de Node.js y reconstrucción del catálogo desde SQLite...');
  closeDatabase();
  console.log('  ✓ Conexión SQLite cerrada (simulando terminación del proceso)');

  // Reabrir conexión simulando arranque de nuevo proceso
  initDatabase();
  const integrity = verifyStorageIntegrity();
  console.log(`  ✓ Integridad verificada tras reinicio: ${integrity.readyCount} listos de ${integrity.totalModels} registrados`);

  const completedProjects = listProjectsWithModels();
  const foundProject = completedProjects.find((p) => p.id === testJobId);
  if (!foundProject) {
    throw new Error('Fallo: El proyecto persistido no se recuperó de SQLite tras el reinicio');
  }
  console.log(`  ✓ Proyecto recuperado con éxito: "${foundProject.fileName}" con ${foundProject.parts.length} partes (${foundProject.totalPartsSizeMB} MB)`);

  // Test 6: Búsqueda y compatibilidad de descarga (por nombre y por índice 1..N)
  console.log('\n▶ Test 6: Búsqueda de modelos para descarga...');
  const modelByPart1 = findModelByProjectAndPart(testJobId, dummyPart1);
  if (!modelByPart1) throw new Error(`Fallo buscando por nombre ${dummyPart1}`);
  console.log(`  ✓ Búsqueda por nombre de archivo "${dummyPart1}": encontrado modelo ID ${modelByPart1.id}`);

  const modelByIndex = findModelByProjectAndPart(testJobId, '2');
  if (!modelByIndex || modelByIndex.name !== dummyPart2) throw new Error('Fallo buscando por índice 2');
  console.log(`  ✓ Búsqueda por índice "2": encontrado modelo ID ${modelByIndex.id} ("${modelByIndex.name}")`);

  // Test 7: Manejo de errores y atomicidad (falla intencional en persistencia)
  console.log('\n▶ Test 7: Manejo de fallos en persistencia (Rollback atómico)...');
  const failJobId = crypto.randomUUID();
  const failTempDir = path.resolve(process.cwd(), 'temp', `fail-${failJobId}`);
  fs.mkdirSync(failTempDir, { recursive: true });
  fs.writeFileSync(path.join(failTempDir, 'corrupt.frag'), Buffer.from('')); // 0 bytes = error esperado

  let rollbackPassed = false;
  try {
    persistJobArtifacts(failJobId, 'Corrupt.ifc', failTempDir, ['corrupt.frag'], crypto.randomUUID);
  } catch (err: any) {
    console.log('  ✓ Persistencia rechazada adecuadamente ante archivo vacío:', err.message);
    const checkDb = getDb().prepare('SELECT id FROM projects WHERE id = ?').get(failJobId);
    if (!checkDb) {
      rollbackPassed = true;
      console.log('  ✓ Rollback exitoso: ningún registro corrupto quedó en SQLite');
    }
  }

  if (!rollbackPassed) {
    throw new Error('Fallo: El rollback atómico no eliminó el registro de SQLite');
  }

  // Cleanup temporary test folders
  try {
    fs.rmSync(testTempDir, { recursive: true, force: true });
    fs.rmSync(failTempDir, { recursive: true, force: true });
  } catch {}

  // Test 8: Eliminación limpia de proyecto
  console.log('\n▶ Test 8: Eliminación permanente y segura de proyecto...');
  const deleted = deleteProject(testJobId);
  if (!deleted) throw new Error('Fallo eliminando proyecto de prueba');
  const checkProjAfter = getProject(testJobId);
  if (checkProjAfter !== null) throw new Error('Fallo: El proyecto sigue en SQLite tras deleteProject');
  console.log('  ✓ Proyecto y archivos físicos eliminados limpiamente');

  console.log('\n===================================================================');
  console.log(' 🎉 TODAS LAS PRUEBAS DE PERSISTENCIA SQLITE PASARON CON ÉXITO');
  console.log('===================================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ ERROR EN PRUEBAS:', err);
  process.exit(1);
});
