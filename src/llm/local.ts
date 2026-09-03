import type { ChatMessage, LlmAdapter, LlmReply, ToolDefinition } from './adapter.js';

const caseFrom = (messages: ChatMessage[]) => messages.map((message) => message.content).join(' ').match(/caso\s+([a-z0-9-]+)/i)?.[1];
const toolNames = (messages: ChatMessage[]) => messages.filter((message) => message.role === 'tool').map((message) => message.name);
const lastTool = (messages: ChatMessage[]) => messages.filter((message) => message.role === 'tool').at(-1)?.content ?? '{}';

export class LocalAdapter implements LlmAdapter {
  name = 'local'; model = 'deterministic-demo';
  async respond(messages: ChatMessage[], _tools: ToolDefinition[]): Promise<LlmReply> {
    const caso = caseFrom(messages); if (!caso) return { text: 'Indica el caso que deseas procesar, por ejemplo: Procesa el caso ec-corp-andina.', toolCalls: [] };
    const names = toolNames(messages); const id = crypto.randomUUID();
    if (!names.includes('proveedor.leerSolicitud')) return { text: '', toolCalls: [{ id, name: 'proveedor.leerSolicitud', arguments: { caso } }] };
    if (!names.includes('proveedor.mapearCampos')) return { text: '', toolCalls: [{ id, name: 'proveedor.mapearCampos', arguments: { caso } }] };
    if (!names.includes('proveedor.generarFormulario')) {
      const mapping = JSON.parse(lastTool(messages)).data?.todos ?? []; const read = messages.find((message) => message.name === 'proveedor.leerSolicitud')?.content ?? '{}'; const formato = JSON.parse(read).data?.formato ?? 'portal';
      return { text: '', toolCalls: [{ id, name: 'proveedor.generarFormulario', arguments: { caso, mapeo: mapping, formato } }] };
    }
    if (!names.includes('proveedor.armarPaquete')) { const generated = JSON.parse(lastTool(messages)).data?.ruta; return { text: '', toolCalls: [{ id, name: 'proveedor.armarPaquete', arguments: { caso, ruta: generated } }] }; }
    const paquete = JSON.parse(lastTool(messages)).data; return { text: `Caso ${caso} procesado. El paquete ${paquete?.listo_para_firma ? 'esta listo para firma' : 'no esta listo para firma'}; revisa el checklist y los campos que requieren confirmacion. No enviare nada. ¿Confirmas que deseas simular el envio?`, toolCalls: [] };
  }
}
