import { rm } from 'node:fs/promises';
import { proveedorTools } from './src/tools/proveedor.js';

const directory = process.cwd();
const cases = ['co-industrias-delta', 'ec-corp-andina', 'hn-agroexport-sula'];
await rm(`${directory}/out`, { recursive: true, force: true });
for (const caso of cases) {
  const ctx = { directory, sessionId: 'demo' };
  const read = JSON.parse(await proveedorTools.leerSolicitud.execute({ caso }, ctx));
  const mapped = JSON.parse(await proveedorTools.mapearCampos.execute({ caso }, ctx));
  const form = JSON.parse(await proveedorTools.generarFormulario.execute({ caso, mapeo: mapped.data.todos, formato: read.data.formato }, ctx));
  const packet = JSON.parse(await proveedorTools.armarPaquete.execute({ caso, ruta: form.data.ruta }, ctx));
  console.log(`${caso}: campos=${mapped.data.todos.length}, faltantes=${mapped.data.faltantes.length}, listo_para_firma=${packet.data.listo_para_firma}`);
}
