# Solucion

## 1. Problema

La administracion necesita convertir solicitudes de registro de proveedor en formularios y paquetes documentales trazables, sin repetir transcripcion manual ni permitir que la IA invente datos.

## 2. Arquitectura

```text
Angular 21 -> POST /api/chat -> ciclo del agente Node 20 -> adaptador LLM
                                  |                         |- OpenAI Responses API
                                  |                         `- local deterministic demo
                                  v
                         herramientas Zod -> fixtures (lectura) / out (escritura)
```

El prompt vive en `agent/prompt.md`, el conocimiento y datos en `fixtures/reto-01`, y la ejecucion de reglas en `src/tools/proveedor.ts`. El servidor no contiene reglas de mapeo ni valores de negocio.

## 3. Ciclo del agente

El backend conserva una sesion en memoria y ejecuta como maximo 25 rondas por mensaje. El modelo decide llamadas de herramientas, el backend valida los argumentos con Zod y agrega cada resultado al historial. Toda llamada se muestra en Angular y deja un JSONL en `out`. El envio se intercepta: solo ocurre como archivo simulado cuando el mensaje inmediatamente posterior confirma la accion.

## 4. Modelo

El adaptador recomendado es OpenAI con `gpt-5.6-terra`, por el equilibrio entre razonamiento, costo y uso de herramientas. Se usa la Responses API. La estimacion de costo depende de los tokens de prompt, historial y respuestas; se limita con iteraciones y un presupuesto de sesion configurable. El adaptador `LocalAdapter` permite demo y pruebas sin clave. Cambiar de proveedor no modifica el ciclo del agente: solo se implementa `LlmAdapter`.

## 5. Portales web

En produccion se usaria un navegador controlado o extension RPA para presentar valores ya mapeados. CAPTCHA, MFA y cambios de layout son limites esperados. Las credenciales vivirian en un gestor de secretos, nunca en repositorio, prompt o logs; el humano las ingresa y tambien hace clic en Enviar. Este reto produce `valores-portal.md` y no automatiza el portal.

## 6. Decisiones y trade-offs

- Herramientas deterministas en vez de permitir que el LLM lea archivos libremente: reduce alucinaciones, a cambio de implementar parsers concretos.
- Sesiones en memoria y archivos `out` en vez de base de datos: simplifica el reto, pero no sirve para varios usuarios ni reinicios.
- PDF generado por texto en vez de AcroForm: cumple el orden y etiquetas, pero no conserva el diseno original.
- Adaptador local de respaldo: permite la demo sin costo, pero no interpreta lenguaje natural con la flexibilidad de un LLM real.

## 7. Supuestos

- Mientras no existan archivos del cliente, los casos y las plantillas JSON son datos ficticios de demostracion. Los formularios reales deben reemplazarlos antes de produccion.
- El repositorio maestro ficticio es la fuente de verdad.
- Las fechas de vigencia se comparan con la fecha de ejecucion.

## 8. Cobertura

| Historia | Estado | Nota |
| --- | --- | --- |
| Leer solicitud | Hecho | XLSX, PDF y portal. |
| Mapear campos | Hecho | Estados, sinonimos y regla tributaria. |
| Generar formulario | Hecho | XLSX, PDF y Markdown para portal. |
| Armar paquete | Hecho | Checklist, copias, correo y bloqueo por soportes. |
| Errores | Parcial | Contrato `ok/error`; faltan pruebas automatizadas extensas. |

Para produccion faltan autenticacion, almacenamiento seguro, auditoria centralizada, conectores de correo/documentos y una bateria de evaluaciones con plantillas reales.

## 9. Uso de IA

Se uso ChatGPT/Codex como apoyo para estructurar el proyecto, revisar el alcance y generar borradores de implementacion. Se revisaron y ajustaron las decisiones para respetar el contrato de herramientas, confirmacion humana y separacion de responsabilidades. No se aceptaron propuestas que introdujeran credenciales en codigo ni acciones externas automaticas.

## 10. Riesgos

- Un modelo podria intentar completar datos plausibles: se mitiga limitando los valores a resultados de herramientas y con el prompt.
- Un maestro desactualizado produce formularios incorrectos: se requiere responsable de datos y vigencias.
- Un portal puede cambiar o requerir MFA: el humano conserva credenciales, revision y envio.
- Los soportes contienen informacion sensible: en produccion se requieren control de acceso, cifrado y retencion definida.
