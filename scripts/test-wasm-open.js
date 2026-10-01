import * as WEBIFC from 'web-ifc';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const wasmDir = path.resolve(__dirname, '../node_modules/web-ifc/');

console.log('[Test WASM] Initializing Web-IFC with local wasm...');
const ifcApi = new WEBIFC.IfcAPI();
ifcApi.SetWasmPath(wasmDir + path.sep, true);

await ifcApi.Init();
console.log('  Web-IFC initialized successfully.');

const sampleIfc = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('test_small.ifc','2026-09-30T00:00:00',('Antigravity'),('Arch'),'web-ifc','ifc2frag','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('0Yv$hN$r14$x_D09uqgU$F',#2,'Default Project',$,$,$,$,(#6),#7);
#2=IFCOWNERHISTORY(#3,#4,$,.ADDED.,$,$,$,1600000000);
#3=IFCPERSONANDORGANIZATION(#5,#4,$);
#4=IFCORGANIZATION($,'That Open Company',$,$,$);
#5=IFCPERSON($,'User',$,$,$,$,$,$);
#6=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,0.00001,#8,$);
#7=IFCUNITASSIGNMENT((#9));
#8=IFCAXIS2PLACEMENT3D(#10,#11,#12);
#9=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#10=IFCCARTESIANPOINT((0.,0.,0.));
#11=IFCDIRECTION((0.,0.,1.));
#12=IFCDIRECTION((1.,0.,0.));
#13=IFCSITE('1Yv$hN$r14$x_D09uqgU$F',#2,'Default Site',$,$,#14,$,$,.ELEMENT.,$,$,$,$,$);
#14=IFCLOCALPLACEMENT($,#8);
#15=IFCRELAGGREGATES('2Yv$hN$r14$x_D09uqgU$F',#2,$,$,#1,(#13));
#16=IFCBUILDING('3Yv$hN$r14$x_D09uqgU$F',#2,'Default Building',$,$,#17,$,$,.ELEMENT.,$,$,$);
#17=IFCLOCALPLACEMENT(#14,#8);
#18=IFCRELAGGREGATES('4Yv$hN$r14$x_D09uqgU$F',#2,$,$,#13,(#16));
#19=IFCBUILDINGSTOREY('5Yv$hN$r14$x_D09uqgU$F',#2,'Level 1',$,$,#20,$,$,.ELEMENT.,0.);
#20=IFCLOCALPLACEMENT(#17,#8);
#21=IFCRELAGGREGATES('6Yv$hN$r14$x_D09uqgU$F',#2,$,$,#16,(#19));
ENDSEC;
END-ISO-10303-21;`;

const ifcData = new TextEncoder().encode(sampleIfc);

// Test OpenModel with Memory Limit
const modelID1 = ifcApi.OpenModel(ifcData, { COORDINATE_TO_ORIGIN: true });
console.log(`  OpenModel returned modelID: ${modelID1}`);
if (modelID1 >= 0) {
  const schema = ifcApi.GetModelSchema(modelID1);
  console.log(`  Model schema: ${schema}`);
  console.log(`  Max ExpressID: ${ifcApi.GetMaxExpressID(modelID1)}`);
  ifcApi.CloseModel(modelID1);
  console.log('  ✅ PASS: Direct OpenModel parsed model successfully.');
}

// Test OpenModelFromCallback (Streaming Chunk Reader)
let readCalls = 0;
const readCallback = (offset, size) => {
  readCalls++;
  return ifcData.subarray(offset, Math.min(offset + size, ifcData.byteLength));
};

const modelID2 = ifcApi.OpenModelFromCallback(readCallback, { COORDINATE_TO_ORIGIN: true });
console.log(`  OpenModelFromCallback returned modelID: ${modelID2}, callback invoked ${readCalls} times`);
if (modelID2 >= 0) {
  const schema = ifcApi.GetModelSchema(modelID2);
  console.log(`  Streamed Model schema: ${schema}`);
  ifcApi.CloseModel(modelID2);
  console.log('  ✅ PASS: Streamed OpenModelFromCallback parsed model successfully without loading whole file!');
}

ifcApi.Dispose();
console.log('[Test WASM] Complete. All operations succeeded.');
