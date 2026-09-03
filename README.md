# Agente de registro como proveedor

Agente conversacional para preparar formularios de registro, soportes y borradores de correo sin realizar acciones externas.

## Requisitos

- Node.js 20 o superior.
- Una clave de OpenAI solo para usar el proveedor real. La demo no la necesita.

## Ejecucion local

```bash
npm install
copy .env.example .env
npm run dev
```

Abre `http://localhost:4200`. El proveedor es `openai` cuando existe `OPENAI_API_KEY`; sin ella se usa el adaptador local determinista. Para forzar este ultimo, define `LLM_PROVIDER=local`.

## Despliegue en Netlify

El repositorio incluye `netlify.toml` para publicar Angular y ejecutar la API Express como una Netlify Function. Conecta el repositorio en Netlify y usa la configuracion detectada: `npm run build` como comando y `dist/registro-proveedor-web/browser` como directorio de publicacion.

En las variables de entorno de Netlify, configura `NODE_VERSION=20` y, si se usara el proveedor real, `OPENAI_API_KEY`. Si no agregas la clave, el sitio funcionara con el adaptador local determinista y los fixtures de demostracion. Los archivos generados y las sesiones son temporales en Netlify; para produccion deben migrarse a almacenamiento persistente.

## Demo sin modelo

```bash
npm run demo
```

La demo limpia `out/` y ejecuta todos los casos directamente contra las herramientas.

## API

- `POST /api/chat`: `{ sessionId, message }` devuelve `{ reply, toolCalls, needsConfirmation }`.
- `GET /api/sessions/:id`: devuelve el historial de la sesion.
- `GET /api/health`: informa proveedor y modelo sin exponer claves.

## Casos de prueba

Los fixtures propios estan en `fixtures/reto-01`. Respetan el contrato del PRD para que los fixtures oficiales puedan reemplazarlos sin cambiar el codigo.

El despliegue publico no esta incluido todavia. La aplicacion esta preparada para desplegar frontend y backend como servicios Node separados o mediante un proxy inverso.
