import fs from 'node:fs';
import path from 'node:path';
import { createProject, persistDirectFragModel, getProject, getModelsForProject, listProjectsWithModels, deleteProject } from '../server/db.ts';

const tempFrag = path.join(process.cwd(), 'storage', 'temp-test.frag');
fs.writeFileSync(tempFrag, Buffer.from([0x46, 0x52, 0x41, 0x47, 0x01, 0x02, 0x03, 0x04]));

console.log('1. Creating project...');
const proj = createProject('Diagnose Project', 'Testing FRAG persistence');
console.log('Created project:', proj);

console.log('2. Persisting direct FRAG model...');
const model = persistDirectFragModel(proj.id, 'prueba_modelo.frag', tempFrag);
console.log('Persisted model:', model);

console.log('3. getProject:', getProject(proj.id));
console.log('4. getModelsForProject:', getModelsForProject(proj.id));

console.log('5. listProjectsWithModels (admin=true):');
const allProjects = listProjectsWithModels(undefined, undefined, true);
const found = allProjects.find(p => p.id === proj.id);
console.log('Found project in list:', found);

// Clean up
console.log('Cleaning up test project...');
deleteProject(proj.id);
if (fs.existsSync(tempFrag)) fs.unlinkSync(tempFrag);
console.log('Done!');
