import express from 'express';
import path from 'node:path';
import { appendFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { z } from 'zod';
import { leerSolicitud, mapearCampos, generarFormulario, armarPaquete, simularEnvio } from './tools/proveedor.js';
import type { ToolContext, ToolTrace } from './types.js';
import type { ChatMessage, LlmAdapter, ToolDefinition } from './llm/adapter.js';
import { OpenAiAdapter } from './llm/openai.js';
import { LocalAdapter } from './llm/local.js';

export async function createApp(directory = process.cwd(), storageDirectory = directory) {
const prompt = await readFile(path.join(directory, 'agent', 'prompt.md'), 'utf8');
const app = express(); app.use(express.json({ limit: '1mb' }));
const maxIterations = Number(process.env.MAX_AGENT_ITERATIONS ?? 25);
const adapter: LlmAdapter = process.env.LLM_PROVIDER === 'local' || !process.env.OPENAI_API_KEY ? new LocalAdapter() : new OpenAiAdapter();
const sessionSchema = z.object({ sessionId: z.string().min(1), message: z.string().min(1).max(4000) });
const sessions = new Map<string, { messages: ChatMessage[]; traces: ToolTrace[]; needsConfirmation: boolean; caso?: string; responseId?: string }>();

const tools = {
  'proveedor.leerSolicitud': leerSolicitud, 'proveedor.mapearCampos': mapearCampos, 'proveedor.generarFormulario': generarFormulario, 'proveedor.armarPaquete': armarPaquete, 'proveedor.simularEnvio': simularEnvio
} as const;
async function listCases() {
  const casesDirectory = path.join(directory, 'fixtures', 'reto-01', 'casos');
  const entries = await readdir(casesDirectory, { withFileTypes: true });
  const cases = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    const solicitud = JSON.parse(await readFile(path.join(casesDirectory, entry.name, 'solicitud.json'), 'utf8')) as { cliente: string; formato: 'xlsx' | 'pdf' | 'portal' };
    return { caso: entry.name, cliente: solicitud.cliente, formato: solicitud.formato };
  }));
  return cases.sort((left, right) => left.caso.localeCompare(right.caso));
}
const definitions: ToolDefinition[] = [
  { name: 'proveedor.leerSolicitud', description: leerSolicitud.description, parameters: { type: 'object', properties: { caso: { type: 'string', description: 'Nombre de la carpeta del caso.' } }, required: ['caso'], additionalProperties: false } },
  { name: 'proveedor.mapearCampos', description: mapearCampos.description, parameters: { type: 'object', properties: { caso: { type: 'string' }, campos: { type: 'array', items: { type: 'string' } } }, required: ['caso'], additionalProperties: false } },
  { name: 'proveedor.generarFormulario', description: generarFormulario.description, parameters: { type: 'object', properties: { caso: { type: 'string' }, mapeo: { type: 'array', items: {} }, formato: { type: 'string', enum: ['xlsx', 'pdf', 'portal'] } }, required: ['caso', 'mapeo', 'formato'], additionalProperties: false } },
  { name: 'proveedor.armarPaquete', description: armarPaquete.description, parameters: { type: 'object', properties: { caso: { type: 'string' }, ruta: { type: 'string' } }, required: ['caso'], additionalProperties: false } },
  { name: 'proveedor.simularEnvio', description: simularEnvio.description, parameters: { type: 'object', properties: { caso: { type: 'string' }, confirmado: { type: 'boolean' } }, required: ['caso', 'confirmado'], additionalProperties: false } }
];

function getSession(sessionId: string) { if (!sessions.has(sessionId)) sessions.set(sessionId, { messages: [{ role: 'system', content: prompt }], traces: [], needsConfirmation: false }); return sessions.get(sessionId)!; }
function isConfirmation(message: string) { return /^(si|sí|confirmo|confirmar|envia|enviar|proceder|adelante)\b/i.test(message.trim()); }
async function executeTool(name: keyof typeof tools, args: Record<string, unknown>, ctx: ToolContext) { return tools[name].execute(args, ctx); }
function toolContext(sessionId: string): ToolContext { return { directory, storageDirectory, sessionId }; }
async function logChat(sessionId: string, event: Record<string, unknown>) { const target = path.join(storageDirectory, 'out', '_sessions', `${sessionId}.jsonl`); await mkdir(path.dirname(target), { recursive: true }); await appendFile(target, JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n'); }
app.get('/api/health', (_request, response) => response.json({ ok: true, provider: adapter.name, model: adapter.model }));
app.get('/api/cases', async (_request, response) => {
  try { response.json(await listCases()); } catch (error) { response.status(500).json({ error: error instanceof Error ? error.message : 'No fue posible listar los casos.' }); }
});
app.get('/api/sessions/:id', (request, response) => { const session = getSession(request.params.id); response.json({ messages: session.messages.filter((message) => message.role !== 'system'), toolCalls: session.traces, needsConfirmation: session.needsConfirmation }); });
app.post('/api/chat', async (request, response) => {
  const parsed = sessionSchema.safeParse(request.body); if (!parsed.success) return response.status(400).json({ error: 'sessionId y message son obligatorios.' });
  const { sessionId, message } = parsed.data; const session = getSession(sessionId); session.messages.push({ role: 'user', content: message }); await logChat(sessionId, { role: 'user', message });
  try {
    if (session.needsConfirmation && isConfirmation(message) && session.caso) {
      const output = await simularEnvio.execute({ caso: session.caso, confirmado: true }, toolContext(sessionId)); session.traces.push({ nombre: 'proveedor.simularEnvio', argumentos: { caso: session.caso, confirmado: true }, resultado: output }); session.messages.push({ role: 'tool', name: 'proveedor.simularEnvio', content: output }); session.needsConfirmation = false; const reply = 'Envio simulado creado. No se realizo ningun envio externo.'; session.messages.push({ role: 'assistant', content: reply }); return response.json({ reply, toolCalls: session.traces, needsConfirmation: false });
    }
    session.traces = []; let reply = ''; let iterations = 0;
    while (iterations++ < maxIterations) {
      const modelReply = await adapter.respond(session.messages, definitions, session.responseId); session.responseId = modelReply.responseId;
      if (!modelReply.toolCalls.length) { reply = modelReply.text || 'No pude completar la solicitud.'; break; }
      for (const call of modelReply.toolCalls) {
        if (!(call.name in tools)) continue; const output = await executeTool(call.name as keyof typeof tools, call.arguments, toolContext(sessionId)); const args = call.arguments as { caso?: string }; if (args.caso) session.caso = args.caso;
        session.traces.push({ nombre: call.name, argumentos: call.arguments, resultado: output }); session.messages.push({ role: 'tool', name: call.name, toolCallId: call.id, content: output }); await logChat(sessionId, { role: 'tool', name: call.name, arguments: call.arguments, result: output });
      }
    }
    if (!reply) reply = 'Alcance el limite de iteraciones. Revisa las llamadas completadas.';
    session.needsConfirmation = /confirmas.*simular el envio/i.test(reply); session.messages.push({ role: 'assistant', content: reply }); await logChat(sessionId, { role: 'assistant', message: reply }); response.json({ reply, toolCalls: session.traces, needsConfirmation: session.needsConfirmation });
  } catch (error) { const reply = error instanceof Error ? error.message : 'Ocurrio un error al procesar la solicitud.'; session.messages.push({ role: 'assistant', content: reply }); response.status(502).json({ reply, toolCalls: session.traces, needsConfirmation: false }); }
});

return app;
}
