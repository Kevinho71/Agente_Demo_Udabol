# Agente Demo

Agente conversacional que consulta y crea productos en el catálogo de una API REST externa. Responde en lenguaje natural, arma tablas dinámicas según la consulta y pide confirmación antes de cualquier escritura.

> Guía simple: [guia.md](guia.md) · Guía técnica: [guia-tecnica.md](guia-tecnica.md).

- **Backend:** Node.js 22 + Express 5 + TypeScript + Google GenAI (Gemini function calling) + SSE.
- **Frontend:** Vite + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui.
- **Datos:** `https://appproyectoproducto.onrender.com/api/v1/products` (FastAPI + Supabase). Swagger: `/docs`.
- **Persistencia:** ninguna. El historial de conversación vive en memoria del backend.
- **Alcance:** consultar y crear. No edita ni borra productos.

## Arquitectura

```
Navegador
  │  POST /api/chat  (SSE: meta, tool, result, confirm, token, done, error)
  ▼
Frontend (Vite/React) ──► Backend (Express) ──► Gemini (function calling)
                                │
                                │  GET/POST /api/v1/products
                                ▼
                        API externa (FastAPI/Render)
```

1. El usuario escribe una pregunta.
2. El backend convierte `backend/src/agent/endpoints.json` en `functionDeclarations` de Gemini.
3. Gemini elige la acción y los parámetros de shaping (`sort_by`, `order`, `limit`, filtros).
4. El executor valida la acción, los argumentos y el origen, y consulta la API.
5. El backend aplica el shaping **localmente** sobre la lista completa (la API externa no tiene filtros) y devuelve a la interfaz exactamente el subconjunto que ve el modelo.
6. La respuesta se transmite por SSE y el frontend muestra el rastro, la tabla dinámica y, si corresponde, la tarjeta de confirmación.

### Tabla dinámica

El modelo no elige filas por ID: elige parámetros y el backend los aplica de forma determinista. La tabla y el texto del agente salen del mismo subconjunto.

| Pregunta | Parámetros | Tabla |
| --- | --- | --- |
| “¿Cuál es el más caro?” | `sort_by=price, order=desc, limit=1` | Detalle o empates (“Precio máximo · 4 productos”) |
| “Top 10 más baratos” | `sort_by=price, order=asc, limit=10` | Ranking con columna `#` |
| “Stock menor a 5” | `max_stock=4` | Filtro ordenado por stock, columnas Producto/Stock/Precio |
| “Buscá mouse” | `name_contains=mouse` | Coincidencias |
| “Entre 100 y 500” | `min_price=100, max_price=500` | Filtro por precio |
| “¿Cuántos hay?” / “¿Cuánto vale?” | `show_table=false` | Sin tabla |
| “¿Qué productos hay?” | sin shaping | Catálogo completo con preview |

Reglas:

- **Empates:** con `limit=1` se muestran todos los productos empatados en el primer valor y el título lo dice. En el catálogo actual hay 4 productos con precio 10.000.
- **Orden:** precio/stock/nombre, ascendente o descendente, con desempate por `id`.
- **Filtros por stock o precio:** si el modelo no indica orden, el backend ordena por el campo filtrado.
- **Totales:** `show_table=false`; el modelo sigue recibiendo los datos y el resumen completo para calcular.
- **Catálogo vacío o sin coincidencias:** la tabla conserva su encabezado y muestra una frase.

## Capacidades

- Consultar el catálogo con lenguaje natural.
- Rankings, filtros y extremos con tabla dinámica.
- Totales y valores agregados sin tabla.
- Buscar por nombre, rango de precio y rango de stock.
- Crear uno o varios productos en lote (hasta 10) con **una sola confirmación**.
- Crear no reintenta escrituras para evitar duplicados.
- Reporte de fallos parciales: si un producto del lote falla, los demás se crean igual.
- Rate limit separado: 10 consultas/min y 5 escrituras/min.

## Requisitos

- Node.js 22 o superior
- Una API key de Gemini ([Google AI Studio](https://aistudio.google.com/apikey))

## Inicio rápido

```bash
npm install
npm run install:all

# Backend
copy backend\.env.example backend\.env
# Editar backend\.env y completar GEMINI_API_KEY

# Frontend
copy frontend\.env.example frontend\.env

npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001
- Health check: http://localhost:3001/health

Sin API key se puede levantar todo en modo de prueba (`MOCK_LLM=true`): el agente ejecuta la consulta real y devuelve una respuesta fija, sin gastar cuota.

## Variables de entorno

### `backend/.env`

| Variable | Default | Descripción |
| --- | --- | --- |
| `PORT` | `3001` | Puerto del backend |
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `LOG_LEVEL` | `info` | Nivel de pino |
| `EXTERNAL_API_BASE_URL` | `https://appproyectoproducto.onrender.com` | Origen de la API externa |
| `EXTERNAL_API_TIMEOUT_MS` | `60000` | Timeout de la API (Render free puede tardar en despertar) |
| `EXTERNAL_API_WARMUP` | `true` | Ping de precalentamiento al arrancar |
| `GEMINI_API_KEY` | — | **Obligatoria** salvo `MOCK_LLM=true` |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Modelo configurable |
| `CORS_ORIGINS` | `http://localhost:5173` | Orígenes permitidos, separados por coma |
| `SESSION_TTL_MS` | `1800000` | TTL del historial en memoria |
| `MAX_AGENT_STEPS` | `4` | Rondas máximas de tool calling |
| `RATE_LIMIT_MAX` | `10` | Consultas por minuto por IP |
| `WRITE_RATE_LIMIT_MAX` | `5` | Confirmaciones de escritura por minuto por IP |
| `MOCK_LLM` | `false` | `true` no llama a Gemini |

### `frontend/.env`

| Variable | Default | Descripción |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:3001` | URL del backend. En dev se puede dejar vacía para usar el proxy de Vite |

## El mapa de endpoints

`backend/src/agent/endpoints.json` es la única fuente de acciones que el agente puede ejecutar. Se valida con Zod al arrancar: si el JSON es inválido, el backend no levanta.

### `list_products` (GET)

Admite parámetros locales:

`sort_by` (`price|stock|name`), `order` (`asc|desc`), `limit` (1–50), `name_contains`, `min_price`, `max_price`, `min_stock`, `max_stock`, `show_table`.

La API externa no los recibe: el backend baja el catálogo completo y los aplica en memoria. Si en el futuro un endpoint admite filtros propios, el parámetro se declara `in: "query"` y el executor lo reenvía.

### `create_product` (POST)

```json
{
  "id": "create_product",
  "method": "POST",
  "path": "/api/v1/products",
  "effects": "write",
  "confirm": true,
  "params": [
    { "name": "name", "in": "body", "required": true, "type": "string" },
    { "name": "price", "in": "body", "required": true, "type": "number" },
    { "name": "stock", "in": "body", "required": true, "type": "integer" },
    { "name": "image_url", "in": "body", "required": false, "type": "string", "nullable": true }
  ]
}
```

Reglas del mapa:

- Métodos `GET` y `POST`.
- La URL se construye contra `EXTERNAL_API_BASE_URL`; no se aceptan URLs libres ni cambios de origen.
- Los argumentos se validan contra `params`; los desconocidos se rechazan.
- Un GET no puede declarar body; una escritura debe usar POST.
- Las acciones con `effects: "write"` pasan por la tarjeta de confirmación.
- Si el usuario pide varios productos en un mensaje, el modelo llama a `create_product` una vez por producto en el mismo turno; el backend agrupa todas las llamadas en una sola confirmación (máx. 10).
- Para agregar otra acción: sumar un objeto al array, reiniciar el backend y listo.

## Flujo de creación

1. El agente reúne `name`, `price` y `stock` de uno o varios productos.
2. Llama a `create_product` una vez por producto, en el mismo turno.
3. El backend **no ejecuta**: agrupa las llamadas, guarda una acción pendiente en memoria (5 min, atada a la sesión) y emite el evento SSE `confirm` con `items` y `count`.
4. La UI muestra una sola tarjeta con todos los productos, sus precios y su stock.
5. **Crear los N** ejecuta los `POST /api/v1/products` en secuencia; **Cancelar** descarta todo.
6. Si uno falla, los demás se crean igual: la tarjeta de resultado muestra los creados y un aviso con los fallidos.
7. Al crear, se invalida el caché de `/api/catalog`, se refresca el rail y se muestra el lote con sus `id`.

## API del backend

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/health` | Estado del servicio, modelo y cantidad de endpoints |
| `GET` | `/api/health/deps` | Ping a la API externa + configuración de Gemini |
| `GET` | `/api/endpoints` | Mapa público de acciones (para la barra lateral) |
| `GET` | `/api/catalog` | Precarga del catálogo con caché de 30 s |
| `POST` | `/api/chat` | Consulta en lenguaje natural. Responde `text/event-stream` |
| `POST` | `/api/actions/:id/confirm` | Confirma y ejecuta una escritura pendiente |
| `POST` | `/api/actions/:id/cancel` | Cancela una acción pendiente |

Eventos SSE de `POST /api/chat`:

| Evento | Payload |
| --- | --- |
| `meta` | `{ sessionId, messageId, model }` |
| `token` | `{ text }` |
| `tool` | `{ callId, endpointId, method, path, status, httpStatus?, durationMs?, itemCount?, error? }` |
| `result` | `{ endpointId, kind, items, view }` |
| `confirm` | `{ actionId, endpointId, method, path, items, count }` |
| `done` | `{ sessionId, messageId, model, pendingConfirmation? }` |
| `error` | `{ code, message }` |

`view` contiene `mode` (`single|ranking|filter|all|none`), `title`, `columns`, `returned`, `totalMatched`, `totalCatalog`, `showTable`, `limit`, `sortBy`, `order` y `created`.

La confirmación devuelve `{ ok, message, created, failed, view, httpStatus, durationMs }`. Si no se creó ninguno, responde `502` con `error.code = WRITE_FAILED`. Si fue parcial, `httpStatus` es `207` y `failed` trae los nombres y errores.

Ejemplo:

```bash
curl -N -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"¿Qué productos tienen stock menor a 5?"}'
```

## Tests

```bash
npm test          # Vitest + Supertest (backend)
npm run build     # typecheck + build de ambos proyectos
npm run lint      # oxlint (frontend)
```

40 tests: validación del mapa, shaping (filtros, orden, empates, límites), títulos/columnas, guards del executor, SSE, validación del body de creación, no-reintento de escrituras, batch (éxito, fallo parcial, fallo total, cancelación) y el guard de intención de ganador único.

## Deploy en Render

Render **no sube carpetas locales**: necesita un repositorio Git (GitHub/GitLab/Bitbucket) o una imagen Docker. El proyecto ya incluye `render.yaml` para crear los dos servicios como Blueprint.

1. Crear el repositorio y subir el proyecto.
2. En Render: **New → Blueprint** → elegir el repo. Se crean:
   - `agente-demo-api` (Web Service, Node, rootDir `backend`, health check `/health`).
   - `agente-demo-web` (Static Site, rootDir `frontend`, rewrite `/* → /index.html`).
3. Cargar `GEMINI_API_KEY` en el servicio del backend (está marcada `sync: false`, no se versiona).
4. Verificar las URLs reales. Si Render les asigna otro nombre, ajustar:
   - `CORS_ORIGINS` del backend con la URL del frontend.
   - `VITE_API_BASE_URL` del frontend con la URL del backend, y redeployar (Vite la fija en build time).
5. Abrir `/health` del backend y probar una consulta en el frontend.

Notas de Render:

- El plan free duerme el servicio tras un periodo de inactividad: la primera consulta puede tardar ~50 s.
- La API externa también corre en Render free, así que puede haber un segundo cold start. Por eso el timeout es de 60 s.
- El build del backend compila TypeScript y copia `endpoints.json` a `dist/`.

## Estructura

```
backend/
  src/
    agent/        endpoints.json, registry, tools, executor, summarize, prompt,
                  loop, gemini, sessions, pending-actions, catalog-cache, intent
    routes/       health, endpoints, catalog, chat (SSE), actions (confirmar/cancelar)
    lib/          config, http, logger, errors
  tests/
frontend/
  src/
    features/     chat, catalog, endpoints, shell
    components/ui shadcn
    lib/          api (SSE parser), format, types
render.yaml
```

## Decisiones y límites conocidos

- **Escritura con confirmación:** el agente puede crear uno o varios productos, pero solo después de que la persona confirme en la tarjeta. No puede editar ni borrar.
- **Batch:** máximo 10 productos por confirmación. Los POST se ejecutan en secuencia; un fallo no revierte los productos ya creados.
- **Sin moneda:** la API no declara moneda. La UI y el prompt prohíben agregar símbolos.
- **Imágenes:** muchas `image_url` son páginas de imgbb o el literal `"string"`, no imágenes directas. La UI usa una inicial neutra cuando la URL no es una imagen directa.
- **Historial:** memoria en RAM con TTL de 30 minutos y máximo 50 sesiones. Al reiniciar el backend se pierde.
- **Nombres duplicados:** el catálogo real tiene varios `mouse` y varios `string`. La tabla muestra el `#id`.
- **Rate limit:** 10 consultas/min y 5 escrituras/min por IP.
- **Acciones pendientes:** viven en memoria, expiran a los 5 minutos y se consumen una sola vez.
- **Prompt injection:** los datos de la API se tratan como datos, no como instrucciones.

## Diseño

La interfaz sigue la dirección **framed-sheet** con una paleta más profunda: masthead teal, marco gris-azulado, hoja menta pálida, acento teal y ámbar para las escrituras. Tipografía IBM Plex Sans + IBM Plex Mono. El rastro de cada consulta se muestra como una línea de recibo; los resultados, como una tabla o tarjeta según la vista.

## Datos de la prueba real

Durante las pruebas quedaron en el catálogo:

- **Prueba Agente Demo** (`#22`, precio 1, stock 1), de la prueba inicial de escritura.
- **mouse pad** (`#24` y `#25`, precio 200, stock 10). El `#24` ya existía y el `#25` se creó después: hay un duplicado.
- **ventilador** (`#26`, precio 500, stock 30).
- **tarjeta grafica** (`#27`, precio 3.000, stock 5).

La API externa no tiene `DELETE`; los productos de prueba se pueden borrar directamente desde Supabase.
