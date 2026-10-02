import fs from 'node:fs';
import path from 'node:path';
import { jobQueue } from '../server/queue.js';
import {
  initDatabase,
  closeDatabase,
  getDb,
  verifyStorageIntegrity,
  resolveStoragePath,
  findModelByProjectAndPart,
  listProjectsWithModels,
} from '../server/db.js';

async function testE2E() {
  console.log('===================================================================');
  console.log(' 🧪 INICIANDO PRUEBA END-TO-END: CONVERSIÓN REAL + PERSISTENCIA');
  console.log('===================================================================\n');

  initDatabase();

  const sampleIfcPath = path.resolve(process.cwd(), 'temp', 'sample_cube.ifc');
  if (!fs.existsSync(sampleIfcPath)) {
    throw new Error('Fallo: temp/sample_cube.ifc no existe.');
  }

  const sampleSize = fs.statSync(sampleIfcPath).size;
  console.log(`▶ 1. Creando trabajo en la cola para sample_cube.ifc (${sampleSize} bytes)...`);
  const job = jobQueue.createJob('sample_cube.ifc', sampleSize);

  // Copy sample IFC to job sourceFile
  fs.copyFileSync(sampleIfcPath, job.sourceFile);

  console.log(`▶ 2. Encolando y procesando conversión [Job ID: ${job.id}]...`);
  const conversionPromise = new Promise<{ parts: string[]; downloadUrls: string[] }>((resolve, reject) => {
    jobQueue.subscribe(job.id, (event, data) => {
      if (event === 'progress') {
        console.log(`     ⏳ [Progreso ${data.percent}%] ${data.stage} (${data.elapsed || '0s'})`);
      } else if (event === 'complete') {
        console.log(`     ✅ [Completado]`, data);
        resolve(data);
      } else if (event === 'error') {
        reject(new Error(data.error));
      }
    });
  });

  jobQueue.enqueueJob(job.id);
  await conversionPromise;

  console.log('\n▶ 3. Verificando persistencia física y en SQLite...');
  const db = getDb();

  const projRow = db.prepare('SELECT * FROM projects WHERE id = ?').get(job.id) as any;
  if (!projRow) throw new Error('Fallo: Proyecto no registrado en tabla projects');
  console.log(`  ✓ Proyecto registrado en SQLite: "${projRow.name}" (ID: ${projRow.id})`);

  const jobRow = db.prepare('SELECT * FROM conversion_jobs WHERE id = ?').get(job.id) as any;
  if (!jobRow || jobRow.status !== 'completed' || jobRow.progress !== 100) {
    throw new Error(`Fallo: conversion_jobs tiene estado incorrecto: ${JSON.stringify(jobRow)}`);
  }
  console.log(`  ✓ Tarea en SQLite: estado=${jobRow.status}, progreso=${jobRow.progress}%`);

  const models = db.prepare('SELECT * FROM models WHERE project_id = ?').all(job.id) as any[];
  if (models.length === 0) throw new Error('Fallo: Ningún modelo registrado en SQLite');
  console.log(`  ✓ ${models.length} modelo(s) registrado(s) en SQLite para este proyecto:`);

  for (const m of models) {
    console.log(`    - ID: ${m.id}`);
    console.log(`    - Nombre: ${m.name}`);
    console.log(`    - Ruta relativa: ${m.storage_path}`);
    console.log(`    - Tamaño: ${m.size_bytes} bytes`);
    console.log(`    - Estado: ${m.status}`);

    const absPath = resolveStoragePath(m.storage_path);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Fallo: Archivo físico persistido no existe en ${absPath}`);
    }
    const stat = fs.statSync(absPath);
    if (stat.size !== m.size_bytes) {
      throw new Error(`Fallo: Tamaño físico ${stat.size} no coincide con ${m.size_bytes}`);
    }
    console.log(`    - Archivo físico verificado en disco: ${absPath}`);
  }

  console.log('\n▶ 4. Simulando REINICIO DE NODE.JS (Cierre completo y re-arranque)...');
  jobQueue.destroy();
  closeDatabase();
  console.log('  ✓ Proceso simulado terminado.');

  // Re-inicialización simulada (nuevo proceso de Node)
  console.log('\n▶ 5. Re-arranque del servidor y reconstrucción del catálogo desde SQLite...');
  initDatabase();
  const integrity = verifyStorageIntegrity();
  console.log(`  ✓ Integridad del almacenamiento verificada: ${integrity.readyCount} listos de ${integrity.totalModels}`);

  const restoredProjects = listProjectsWithModels();
  const found = restoredProjects.find((p) => p.id === job.id);
  if (!found) {
    throw new Error('Fallo: El proyecto no fue recuperado desde SQLite tras el reinicio simulado');
  }
  console.log(`  ✓ Proyecto recuperado con éxito desde SQLite:`);
  console.log(`    - Nombre: ${found.fileName}`);
  console.log(`    - Partes: ${found.parts.join(', ')}`);
  console.log(`    - Tamaño total: ${found.totalPartsSizeMB} MB`);

  console.log('\n▶ 6. Comprobando resolución de descarga para clientes / visor...');
  const modelByPartName = findModelByProjectAndPart(job.id, 'sample_cube.frag');
  if (!modelByPartName) throw new Error('Fallo resolviendo modelo por nombre');
  console.log(`  ✓ Descarga resuelta por nombre "sample_cube.frag": ${modelByPartName.storage_path}`);

  const modelByIndex = findModelByProjectAndPart(job.id, '1');
  if (!modelByIndex) throw new Error('Fallo resolviendo modelo por índice 1');
  console.log(`  ✓ Descarga resuelta por índice "1": ${modelByIndex.storage_path}`);

  console.log('\n▶ 7. Comprobando que la limpieza temporal no elimina los archivos persistentes...');
  jobQueue.deleteJob(job.id);
  const modelStillExists = findModelByProjectAndPart(job.id, '1');
  if (!modelStillExists) throw new Error('Fallo: Registro en SQLite borrado por limpieza temporal');
  const physPath = resolveStoragePath(modelStillExists.storage_path);
  if (!fs.existsSync(physPath)) {
    throw new Error('Fallo: Archivo físico persistente borrado durante limpieza temporal');
  }
  console.log('  ✓ Modelos persistentes y registro en SQLite 100% preservados tras limpieza temporal');

  console.log('\n===================================================================');
  console.log(' 🎉 PRUEBA END-TO-END COMPLETADA CON TOTAL ÉXITO');
  console.log('===================================================================\n');

  closeDatabase();
}

testE2E().catch((err) => {
  console.error('\n❌ ERROR EN PRUEBA E2E:', err);
  process.exit(1);
});
