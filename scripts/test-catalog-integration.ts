import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  initDatabase,
  verifyStorageIntegrity,
  resolveStoragePath,
  createProject,
  updateProject,
  getProject,
  deleteProject,
  listProjectsWithModels,
  getAllModelsWithDetails,
  getModelDetail,
  deleteModel,
  persistJobArtifacts,
  findModelByProjectAndPart,
  closeDatabase,
} from '../server/db.js';

async function testCatalog() {
  console.log('===================================================================');
  console.log(' 🧪 INICIANDO PRUEBAS DE INTEGRACIÓN DEL CATÁLOGO DE PROYECTOS Y MODELOS');
  console.log('===================================================================\n');

  initDatabase();

  // Test 1: Crear proyecto con nombre y descripción
  console.log('▶ Test 1: Crear proyecto con nombre y descripción en SQLite...');
  const proj1 = createProject('Hospital Universitario', 'Pabellón de urgencias y cirugía');
  if (!proj1.id || proj1.name !== 'Hospital Universitario' || proj1.description !== 'Pabellón de urgencias y cirugía') {
    throw new Error('Fallo al crear proyecto con descripción.');
  }
  console.log(`  ✓ Proyecto creado: [ID: ${proj1.id}] "${proj1.name}" - ${proj1.description}`);

  // Test 2: Renombrar y actualizar descripción sin cambiar ID interno
  console.log('\n▶ Test 2: Renombrar y actualizar proyecto preservando su ID...');
  const updatedProj = updateProject(proj1.id, {
    name: 'Hospital Universitario - Fase 1',
    description: 'Pabellón de urgencias, cirugía y helipuerto',
  });
  if (!updatedProj || updatedProj.id !== proj1.id || updatedProj.name !== 'Hospital Universitario - Fase 1') {
    throw new Error('Fallo al actualizar proyecto.');
  }
  console.log(`  ✓ Proyecto actualizado: "${updatedProj.name}" - ${updatedProj.description}`);

  // Test 3: Asociar modelos FRAG persistentes al proyecto
  console.log('\n▶ Test 3: Persistir modelos FRAG asociados al proyecto...');
  const tempDir = path.resolve(process.cwd(), 'temp', `cat-test-${proj1.id}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const fragName1 = 'Estructura.frag';
  const fragName2 = 'Instalaciones.frag';
  fs.writeFileSync(path.join(tempDir, fragName1), Buffer.from('MODEL_DATA_STRUCTURE_BYTES_1234567890'));
  fs.writeFileSync(path.join(tempDir, fragName2), Buffer.from('MODEL_DATA_MEP_BYTES_0987654321'));

  const persisted = persistJobArtifacts(
    proj1.id,
    proj1.name,
    tempDir,
    [fragName1, fragName2],
    crypto.randomUUID
  );

  console.log(`  ✓ ${persisted.length} modelos persistidos para el proyecto`);
  for (const m of persisted) {
    const absPath = resolveStoragePath(m.storage_path);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Fallo: Archivo físico no existe en ${absPath}`);
    }
    console.log(`    - Modelo: ${m.name} | Tamaño: ${m.size_bytes}B | Ruta: ${m.storage_path}`);
  }

  // Test 4: Listar proyectos y verificar conteo de modelos y búsqueda
  console.log('\n▶ Test 4: Consulta de catálogo con búsqueda y conteo...');
  const allProjects = listProjectsWithModels();
  const foundProj = allProjects.find((p) => p.id === proj1.id);
  if (!foundProj || foundProj.modelsCount !== 2) {
    throw new Error(`Fallo en listado: se esperaban 2 modelos, encontrados: ${foundProj?.modelsCount}`);
  }
  console.log(`  ✓ Proyecto encontrado con ${foundProj.modelsCount} modelos asociados y tamaño ${foundProj.totalPartsSizeMB} MB`);

  // Búsqueda por término
  const searchResults = listProjectsWithModels('helipuerto');
  if (searchResults.length === 0 || searchResults[0].id !== proj1.id) {
    throw new Error('Fallo en búsqueda de proyectos por descripción ("helipuerto")');
  }
  console.log(`  ✓ Búsqueda por "helipuerto" retornó el proyecto correcto: "${searchResults[0].name}"`);

  // Test 5: Catálogo detallado de modelos con filtros
  console.log('\n▶ Test 5: Catálogo de modelos con filtros por proyecto y estado...');
  const projectModels = getAllModelsWithDetails(undefined, proj1.id);
  if (projectModels.length !== 2) {
    throw new Error(`Fallo filtrando por proyecto: esperados 2, obtenidos ${projectModels.length}`);
  }
  for (const pm of projectModels) {
    if (!pm.fileExists) throw new Error(`Fallo: fileExists debería ser true para ${pm.name}`);
    console.log(`    - Modelo: ${pm.name} | Proyecto: ${pm.projectName} | En disco: ${pm.fileExists} | ${pm.sizeFormatted}`);
  }

  // Búsqueda de modelo por nombre
  const searchModelRes = getAllModelsWithDetails('Estructura');
  if (!searchModelRes.some((m) => m.name === 'Estructura.frag')) {
    throw new Error('Fallo en búsqueda de modelos por nombre ("Estructura")');
  }
  console.log('  ✓ Búsqueda de modelo por nombre "Estructura" exitosa');

  // Test 6: Consulta de detalles de un modelo individual
  console.log('\n▶ Test 6: Consulta de detalles completos de un modelo...');
  const detail = getModelDetail(persisted[0].id);
  if (!detail || detail.name !== 'Estructura.frag' || !detail.fileExists) {
    throw new Error('Fallo en getModelDetail');
  }
  console.log(`  ✓ Detalles del modelo obtenidos:`, {
    id: detail.id,
    name: detail.name,
    project: detail.projectName,
    size: detail.sizeFormatted,
    fileExists: detail.fileExists,
  });

  // Test 7: Apertura / Búsqueda para descarga
  console.log('\n▶ Test 7: Búsqueda para apertura en visor sin reconversión...');
  const modelToOpen = findModelByProjectAndPart(proj1.id, 'Estructura.frag');
  if (!modelToOpen) throw new Error('Fallo al buscar modelo para apertura');
  const physPath = resolveStoragePath(modelToOpen.storage_path);
  if (!fs.existsSync(physPath)) throw new Error('Fallo: Archivo físico para apertura no existe');
  console.log(`  ✓ Archivo listo para streaming al visor: ${physPath} (${fs.statSync(physPath).size} bytes)`);

  // Test 8: Eliminación controlada de un modelo individual
  console.log('\n▶ Test 8: Eliminación controlada de un modelo...');
  const modelToDelete = persisted[1]; // Instalaciones.frag
  const delModelRes = deleteModel(modelToDelete.id);
  if (!delModelRes.success) throw new Error('Fallo en deleteModel');

  const checkDeletedPhys = resolveStoragePath(modelToDelete.storage_path);
  if (fs.existsSync(checkDeletedPhys)) {
    throw new Error('Fallo: El archivo físico del modelo eliminado aún existe en disco');
  }
  const checkDeletedDb = getModelDetail(modelToDelete.id);
  if (checkDeletedDb !== null) {
    throw new Error('Fallo: El registro del modelo eliminado aún existe en SQLite');
  }
  console.log(`  ✓ Modelo "${modelToDelete.name}" eliminado de disco y SQLite; el resto del proyecto permanece intacto.`);

  // Verificar que el proyecto ahora tiene 1 modelo
  const projAfterModelDel = listProjectsWithModels().find((p) => p.id === proj1.id);
  if (!projAfterModelDel || projAfterModelDel.modelsCount !== 1) {
    throw new Error(`Se esperaba 1 modelo tras la eliminación, encontrados: ${projAfterModelDel?.modelsCount}`);
  }
  console.log(`  ✓ Conteo actualizado de modelos en el proyecto: ${projAfterModelDel.modelsCount} modelo`);

  // Test 9: Eliminación completa y segura del proyecto
  console.log('\n▶ Test 9: Eliminación completa del proyecto...');
  const delProjRes = deleteProject(proj1.id);
  if (!delProjRes.success || delProjRes.deletedModelsCount !== 1) {
    throw new Error(`Fallo en deleteProject: ${JSON.stringify(delProjRes)}`);
  }
  const checkProjAfter = getProject(proj1.id);
  if (checkProjAfter !== null) {
    throw new Error('Fallo: El proyecto eliminado aún existe en SQLite');
  }
  const projDir = path.resolve(process.cwd(), 'storage', 'models', proj1.id);
  if (fs.existsSync(projDir)) {
    throw new Error('Fallo: El directorio de almacenamiento del proyecto aún existe en disco');
  }
  console.log(`  ✓ Proyecto y sus archivos físicos eliminados limpiamente`);

  // Cleanup temp dir
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}

  // Test 10: Integridad general de almacenamiento y reinicio
  console.log('\n▶ Test 10: Verificación de integridad tras operaciones...');
  closeDatabase();
  initDatabase();
  const integrity = verifyStorageIntegrity();
  console.log(`  ✓ Integridad SQLite tras reinicio: ${integrity.readyCount} listos de ${integrity.totalModels} registrados`);

  console.log('\n===================================================================');
  console.log(' 🎉 TODAS LAS PRUEBAS DE INTEGRACIÓN DEL CATÁLOGO PASARON CON ÉXITO');
  console.log('===================================================================\n');

  closeDatabase();
}

testCatalog().catch((err) => {
  console.error('\n❌ ERROR EN TEST DE CATÁLOGO:', err);
  process.exit(1);
});
