# Casos de demostracion

Este directorio contiene datos ficticios creados para probar el flujo mientras el cliente no entregue solicitudes, formularios ni soportes reales. No deben usarse para registro real de proveedores.

| Caso | Recorrido que representa | Resultado esperado |
| --- | --- | --- |
| `co-industrias-delta` | Cliente colombiano que solicita un formulario de Excel. | Llena datos corporativos y bancarios; la Camara de Comercio vencida bloquea la firma. |
| `ec-corp-andina` | Cliente ecuatoriano que solicita un formulario PDF. | El identificador tributario requiere confirmacion por ser extranjero; el codigo de proveedor queda faltante. |
| `hn-agroexport-sula` | Cliente hondureno que registra datos en un portal. | Genera una lista de valores para captura manual; la Camara de Comercio vencida bloquea la firma. |

Cada caso incluye:

- `solicitud.json`: la solicitud simulada del cliente y el formato requerido.
- `soportes-exigidos.json`: documentos que se deben verificar antes de firma.
- `plantilla-celdas.json` o `plantilla-campos.json`: representacion JSON temporal del formulario para Excel o PDF.

Cuando el cliente entregue sus archivos reales, se deben reemplazar estos casos por sus solicitudes y adaptar la carga para conservar el archivo `.xlsx` o `.pdf` original.
