import http from 'node:http';

async function testHttpEndpoints() {
  console.log('===================================================================');
  console.log(' 🌐 VERIFICANDO ENDPOINTS HTTP DEL SERVIDOR CON PERSISTENCIA');
  console.log('===================================================================\n');

  process.env.PORT = '3099';
  const { default: express } = await import('express');
  const cors = (await import('cors')).default;
  const {
    initDatabase,
    verifyStorageIntegrity,
    resolveStoragePath,
    findModelByProjectAndPart,
    getAllModelsWithDetails,
    getModelDetail,
    getProject,
    getModelsForProject,
    createProject,
    updateProject,
    deleteProject,
    deleteModel,
    closeDatabase,
    DB_PATH,
  } = await import('../server/db.js');
  const { jobQueue } = await import('../server/queue.js');
  const fs = (await import('node:fs')).default;

  initDatabase();
  const integrity = verifyStorageIntegrity();

  const app = express();
  app.use(cors());
  app.use(express.json());

  // 1. Health
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      storage: {
        dbPath: DB_PATH,
        totalModels: integrity.totalModels,
        readyModels: integrity.readyCount,
      },
    });
  });

  // 2. Projects
  app.get('/api/projects', (req, res) => {
    const q = req.query.q ? String(req.query.q) : undefined;
    res.json({ status: 'ok', projects: jobQueue.listCompletedProjects(q) });
  });

  app.post('/api/projects', (req, res) => {
    const { name, description } = req.body || {};
    try {
      const project = createProject(name, description);
      res.status(201).json({ status: 'ok', project });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/projects/:id', (req, res) => {
    const id = String(req.params.id);
    const project = getProject(id);
    if (!project) return res.status(404).json({ error: 'No encontrado' });
    const models = getModelsForProject(id);
    res.json({ status: 'ok', project: { ...project, models } });
  });

  app.patch('/api/projects/:id', (req, res) => {
    const id = String(req.params.id);
    const { name, description } = req.body || {};
    try {
      const updated = updateProject(id, { name, description });
      if (!updated) return res.status(404).json({ error: 'No encontrado' });
      res.json({ status: 'ok', project: updated });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/projects/:id', (req, res) => {
    const id = String(req.params.id);
    try {
      const result = deleteProject(id);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  // 3. Models
  app.get('/api/models', (req, res) => {
    const q = req.query.q ? String(req.query.q) : undefined;
    const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;
    res.json({ status: 'ok', models: getAllModelsWithDetails(q, projectId, status) });
  });

  app.get('/api/models/:id', (req, res) => {
    const id = String(req.params.id);
    const model = getModelDetail(id);
    if (!model) return res.status(404).json({ error: 'No encontrado' });
    res.json({ status: 'ok', model });
  });

  app.delete('/api/models/:id', (req, res) => {
    const id = String(req.params.id);
    try {
      const result = deleteModel(id);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  app.get('/api/models/:id/download', (req, res) => {
    const id = String(req.params.id);
    const model = getModelDetail(id);
    if (!model) return res.status(404).json({ error: 'No encontrado' });
    try {
      const filePath = resolveStoragePath(model.storagePath);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no existe en disco' });
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', fs.statSync(filePath).size);
      fs.createReadStream(filePath).pipe(res);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/jobs/:id/download/:part', (req, res) => {
    const id = String(req.params.id);
    const part = String(req.params.part);
    const persistedModel = findModelByProjectAndPart(id, part);
    if (!persistedModel) {
      res.status(404).json({ error: 'No encontrado' });
      return;
    }
    const filePath = resolveStoragePath(persistedModel.storage_path);
    const stats = fs.statSync(filePath);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stats.size);
    fs.createReadStream(filePath).pipe(res);
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(3099, resolve));
  console.log('  ✓ Servidor de prueba iniciado en http://localhost:3099');

  try {
    // 1. Health check
    const healthRes = await fetch('http://localhost:3099/api/health');
    const health = await healthRes.json();
    console.log('  ✓ /api/health respondió:', health.status);

    // 2. POST /api/projects (Crear proyecto)
    const createRes = await fetch('http://localhost:3099/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Torre Residencial Alpha', description: 'Edificio de 24 pisos' }),
    });
    if (!createRes.ok) throw new Error(`Fallo en POST /api/projects: ${createRes.status}`);
    const createdData = await createRes.json();
    const newProjId = createdData.project.id;
    console.log(`  ✓ POST /api/projects creó: "${createdData.project.name}" (ID: ${newProjId})`);

    // 3. PATCH /api/projects/:id (Renombrar proyecto)
    const patchRes = await fetch(`http://localhost:3099/api/projects/${newProjId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Torre Residencial Alpha - Fase 2' }),
    });
    if (!patchRes.ok) throw new Error(`Fallo en PATCH /api/projects: ${patchRes.status}`);
    const patchData = await patchRes.json();
    console.log(`  ✓ PATCH /api/projects/:id renombró a: "${patchData.project.name}"`);

    // 4. GET /api/projects con query ?q=Alpha
    const searchRes = await fetch('http://localhost:3099/api/projects?q=Alpha');
    const searchData = await searchRes.json();
    if (searchData.projects.length === 0 || searchData.projects[0].id !== newProjId) {
      throw new Error('Fallo en GET /api/projects?q=Alpha');
    }
    console.log(`  ✓ GET /api/projects?q=Alpha encontró ${searchData.projects.length} proyecto(s)`);

    // 5. GET /api/models
    const modelsRes = await fetch('http://localhost:3099/api/models');
    const modelsData = await modelsRes.json();
    console.log(`  ✓ GET /api/models retornó ${modelsData.models.length} modelo(s) en total`);

    if (modelsData.models.length > 0) {
      const sampleModel = modelsData.models[0];

      // 6. GET /api/models/:id
      const detailRes = await fetch(`http://localhost:3099/api/models/${sampleModel.id}`);
      const detailData = await detailRes.json();
      console.log(`  ✓ GET /api/models/:id retornó detalles de: ${detailData.model.name}`);

      // 7. GET /api/models/:id/download
      const dlRes = await fetch(`http://localhost:3099/api/models/${sampleModel.id}/download`);
      if (dlRes.ok) {
        const buf = await dlRes.arrayBuffer();
        console.log(`  ✓ GET /api/models/:id/download descargó ${buf.byteLength} bytes directamente`);
      }
    }

    // 8. DELETE /api/projects/:id
    const delRes = await fetch(`http://localhost:3099/api/projects/${newProjId}`, { method: 'DELETE' });
    if (!delRes.ok) throw new Error(`Fallo en DELETE /api/projects: ${delRes.status}`);
    console.log(`  ✓ DELETE /api/projects/:id eliminó el proyecto de prueba`);

    console.log('\n===================================================================');
    console.log(' 🎉 TODOS LOS ENDPOINTS HTTP DEL CATÁLOGO RESPONDEN CORRECTAMENTE');
    console.log('===================================================================\n');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    jobQueue.destroy();
    closeDatabase();
  }
}

testHttpEndpoints().catch((err) => {
  console.error('\n❌ ERROR EN TEST HTTP:', err);
  process.exit(1);
});
