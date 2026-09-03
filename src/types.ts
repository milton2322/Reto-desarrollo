export type ToolResult<T> = { ok: true; data: T } | { ok: false; error: string };
export type FieldStatus = 'lleno' | 'faltante' | 'requiere_confirmacion';
export interface MappedField { etiqueta: string; estado: FieldStatus; valor?: string; ruta?: string; nota?: string; confianza?: number; }
export interface ToolTrace { nombre: string; argumentos: unknown; resultado: string; }
export interface ToolContext { directory: string; sessionId: string; }
