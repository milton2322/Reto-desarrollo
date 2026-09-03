import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import type { MappedField, ToolContext, ToolResult } from '../types.js';

const caseSchema = z.object({ caso: z.string().min(1).describe('Nombre de la carpeta del caso.') });
const mapSchema = z.object({ caso: z.string().min(1).describe('Nombre de la carpeta del caso.'), campos: z.array(z.string()).optional().describe('Campos a mapear; se obtienen de la solicitud si se omiten.') });
const formSchema = z.object({ caso: z.string().min(1).describe('Nombre de la carpeta del caso.'), mapeo: z.array(z.unknown()).describe('Resultado de mapear campos.'), formato: z.enum(['xlsx', 'pdf', 'portal']).describe('Formato solicitado.') });
const packageSchema = z.object({ caso: z.string().min(1).describe('Nombre de la carpeta del caso.'), ruta: z.string().optional().describe('Ruta del formulario generado.') });
const sendSchema = z.object({ caso: z.string().min(1).describe('Nombre de la carpeta del caso.'), confirmado: z.boolean().describe('Confirmacion explicita del usuario.') });

const root = (ctx: ToolContext) => path.join(ctx.directory, 'fixtures', 'reto-01');
const caseDir = (ctx: ToolContext, caso: string) => path.join(root(ctx), 'casos', caso);
const storageRoot = (ctx: ToolContext) => ctx.storageDirectory ?? ctx.directory;
const outDir = (ctx: ToolContext, caso: string) => path.join(storageRoot(ctx), 'out', caso);
const artifactPath = (ctx: ToolContext, relative: string) => path.join(storageRoot(ctx), relative);
const json = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, 'utf8')) as T;
const result = <T>(data: T): string => JSON.stringify({ ok: true, data } satisfies ToolResult<T>);
const fail = (error: unknown): string => JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Error inesperado.' });
const normalize = (value: string) => value.trim().toLowerCase();

async function appendLog(ctx: ToolContext, caso: string, herramienta: string, ok: boolean, resumen: string) {
  const target = path.join(outDir(ctx, caso), 'log.jsonl');
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify({ ts: new Date().toISOString(), herramienta, ok, resumen }) + '\n', { flag: 'a' });
}

async function parseRequest(ctx: ToolContext, caso: string) {
  const solicitud = await json<{ pais: string; cliente: string; formato: 'xlsx' | 'pdf' | 'portal' }>(path.join(caseDir(ctx, caso), 'solicitud.json'));
  const supports = await json<string[]>(path.join(caseDir(ctx, caso), 'soportes-exigidos.json'));
  let fields: string[] = [];
  if (solicitud.formato === 'xlsx') fields = (await json<Array<{ etiqueta: string }>>(path.join(caseDir(ctx, caso), 'plantilla-celdas.json'))).map((item) => item.etiqueta);
  if (solicitud.formato === 'pdf') fields = (await json<Array<{ etiqueta: string }>>(path.join(caseDir(ctx, caso), 'plantilla-campos.json'))).map((item) => item.etiqueta);
  if (solicitud.formato === 'portal') fields = ['Razon social', 'Identificacion tributaria', 'Contacto'];
  return { solicitud, supports, fields };
}

export const leerSolicitud = {
  description: 'Lee la solicitud, plantilla y soportes exigidos de un caso.', args: caseSchema,
  async execute(raw: unknown, ctx: ToolContext) {
    try { const { caso } = caseSchema.parse(raw); const { solicitud, supports, fields } = await parseRequest(ctx, caso); const data = { caso, pais: solicitud.pais, cliente: solicitud.cliente, formato: solicitud.formato, campos: fields, soportes: supports }; await appendLog(ctx, caso, 'proveedor.leerSolicitud', true, `${fields.length} campos leidos`); return result(data); } catch (error) { return fail(error); }
  }
};

export const mapearCampos = {
  description: 'Cruza campos solicitados con el repositorio maestro sin inventar valores.', args: mapSchema,
  async execute(raw: unknown, ctx: ToolContext) {
    try {
      const { caso, campos } = mapSchema.parse(raw); const { solicitud, fields } = await parseRequest(ctx, caso); const requested = campos ?? fields;
      const master = await json<Record<string, string>>(path.join(root(ctx), 'repositorio-maestro.json')); const glossary = await json<Record<string, string>>(path.join(root(ctx), 'glosario-campos.json'));
      const mapped: MappedField[] = requested.map((etiqueta) => {
        const key = glossary[normalize(etiqueta)];
        if (!key || !master[key]) return { etiqueta, estado: 'faltante', nota: 'No existe una fuente en el repositorio maestro.' };
        const foreignId = key === 'nit' && solicitud.pais !== 'CO';
        return { etiqueta, estado: foreignId ? 'requiere_confirmacion' : 'lleno', valor: master[key], ruta: `repositorio-maestro.${key}`, confianza: foreignId ? 0.7 : 1, nota: foreignId ? 'Identificador extranjero: se usa el NIT colombiano y requiere confirmacion.' : undefined };
      });
      const data = { caso, llenos: mapped.filter((x) => x.estado === 'lleno'), faltantes: mapped.filter((x) => x.estado === 'faltante'), requiere_confirmacion: mapped.filter((x) => x.estado === 'requiere_confirmacion'), todos: mapped };
      await appendLog(ctx, caso, 'proveedor.mapearCampos', true, `${mapped.length} campos mapeados`); return result(data);
    } catch (error) { return fail(error); }
  }
};

export const generarFormulario = {
  description: 'Genera el formulario XLSX, PDF o valores para portal usando el mapeo verificado.', args: formSchema,
  async execute(raw: unknown, ctx: ToolContext) {
    try {
      const { caso, mapeo, formato } = formSchema.parse(raw); const output = outDir(ctx, caso); await mkdir(output, { recursive: true });
      const values = mapeo as MappedField[]; let target: string;
      if (formato === 'xlsx') {
        const template = await json<Array<{ hoja: string; celda: string; etiqueta: string }>>(path.join(caseDir(ctx, caso), 'plantilla-celdas.json')); const workbook = XLSX.utils.book_new(); const sheet: XLSX.WorkSheet = {};
        template.forEach((item) => { sheet[item.celda] = { t: 's', v: values.find((field) => field.etiqueta === item.etiqueta)?.valor ?? '' }; }); sheet['!ref'] = 'A1:B20'; XLSX.utils.book_append_sheet(workbook, sheet, template[0]?.hoja ?? 'Registro'); target = path.join(output, 'formulario.xlsx'); XLSX.writeFile(workbook, target);
      } else if (formato === 'pdf') {
        target = path.join(output, 'formulario.pdf'); const doc = new PDFDocument({ margin: 48 }); const stream = (await import('node:fs')).createWriteStream(target); doc.pipe(stream); doc.fontSize(18).text('Formulario de registro de proveedor'); doc.moveDown(); values.forEach((field) => doc.fontSize(11).text(`${field.etiqueta}: ${field.valor ?? '[FALTANTE]'}`)); doc.end(); await new Promise<void>((resolve, reject) => { stream.on('finish', resolve); stream.on('error', reject); });
      } else {
        target = path.join(output, 'valores-portal.md'); await writeFile(target, `# Valores para portal\n\n${values.map((field) => `- ${field.etiqueta}: ${field.valor ?? 'FALTANTE'}`).join('\n')}\n`);
      }
      const relative = path.relative(storageRoot(ctx), target).replaceAll('\\', '/'); await appendLog(ctx, caso, 'proveedor.generarFormulario', true, relative); return result({ caso, ruta: relative, formato });
    } catch (error) { return fail(error); }
  }
};

export const armarPaquete = {
  description: 'Arma el paquete de firma con soportes, checklist y borrador de correo.', args: packageSchema,
  async execute(raw: unknown, ctx: ToolContext) {
    try {
      const { caso, ruta } = packageSchema.parse(raw); const output = path.join(outDir(ctx, caso), 'paquete'); await mkdir(output, { recursive: true }); const required = await json<string[]>(path.join(caseDir(ctx, caso), 'soportes-exigidos.json')); const index = await json<Array<{ tipo: string; archivo: string; vigencia_hasta: string }>>(path.join(root(ctx), 'repositorio-soportes', 'index.json'));
      const today = new Date().toISOString().slice(0, 10); const lines: string[] = []; let blocked = false;
      for (const tipo of required) { const item = index.find((support) => support.tipo === tipo); const state = !item ? 'ausente' : item.vigencia_hasta < today ? 'vencido' : 'presente'; if (state !== 'presente') blocked = true; lines.push(`- [${state === 'presente' ? 'x' : ' '}] ${tipo}: ${state}`); if (item && state === 'presente') await cp(path.join(root(ctx), 'repositorio-soportes', item.archivo), path.join(output, item.archivo)); }
      if (ruta && existsSync(artifactPath(ctx, ruta))) await cp(artifactPath(ctx, ruta), path.join(output, path.basename(ruta)));
      await writeFile(path.join(output, 'checklist.md'), `# Checklist de soportes\n\n${lines.join('\n')}\n`); await writeFile(path.join(output, 'borrador-correo.md'), '# Borrador de correo\n\nAsunto: Documentos para registro como proveedor\n\nHola,\n\nAdjuntamos el formulario y los soportes disponibles para revision y firma.\n');
      const relative = path.relative(storageRoot(ctx), output).replaceAll('\\', '/'); await appendLog(ctx, caso, 'proveedor.armarPaquete', true, `${relative}; listo=${!blocked}`); return result({ caso, ruta: relative, listo_para_firma: !blocked, checklist: lines });
    } catch (error) { return fail(error); }
  }
};

export const simularEnvio = {
  description: 'Simula el envio solo cuando el usuario confirmo explicitamente.', args: sendSchema,
  async execute(raw: unknown, ctx: ToolContext) {
    try { const { caso, confirmado } = sendSchema.parse(raw); if (!confirmado) return JSON.stringify({ ok: false, error: 'El envio requiere confirmacion explicita.' }); const target = path.join(outDir(ctx, caso), 'ENVIO SIMULADO.md'); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, '# ENVIO SIMULADO\n\nEl paquete fue marcado como enviado de forma simulada.\n'); const relative = path.relative(storageRoot(ctx), target).replaceAll('\\', '/'); await appendLog(ctx, caso, 'proveedor.simularEnvio', true, relative); return result({ caso, ruta: relative }); } catch (error) { return fail(error); }
  }
};

export const proveedorTools = { leerSolicitud, mapearCampos, generarFormulario, armarPaquete, simularEnvio };
