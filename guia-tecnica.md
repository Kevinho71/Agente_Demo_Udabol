# Guía del Agente Demo

> Versión simple para audiencia no técnica: [guia.md](guia.md).

Esta guía explica cómo funciona el agente de este proyecto, qué parte es “el agente” y qué parte es backend, cómo decide qué función llamar y qué necesita cualquier API para poder ser conectada a un agente similar.

La idea central:

> El modelo **no** llama a la API directamente. El modelo elige una herramienta declarada; el backend valida y ejecuta esa herramienta; el resultado vuelve al modelo para que redacte la respuesta.

---

## 1. Qué es y qué no es

**Es un agente con herramientas (tool calling).** El modelo de lenguaje entiende la pregunta, elige una acción de un catálogo cerrado, el backend la ejecuta contra una API real y el modelo redacta la respuesta usando el resultado.

**No es:**
- Un modelo que navega por internet o inventa URLs.
- Un sistema que genera SQL o código y lo ejecuta.
- Un chatbot con los datos “pegados” en el prompt.
- Un sistema con base de datos propia. El historial vive en RAM.

El catálogo de acciones es una **allowlist**: si una acción no está en `backend/src/agent/endpoints.json`, el agente no puede ejecutarla.

---

## 2. Arquitectura

```
┌────────────────────┐        POST /api/chat (SSE)        ┌──────────────────────────┐
│ Frontend React     │ ─────────────────────────────────► │ Backend Express          │
│ Vite + Tailwind    │ ◄───────────────────────────────── │ Node 22 + TypeScript     │
│ shadcn/ui          │   meta/tool/result/confirm/token   │                          │
└────────────────────┘                                    │  ┌────────────────────┐  │
                                                          │  │ Loop del agente    │  │
                                                          │  │ + Gemini           │  │
                                                          │  └─────────┬──────────┘  │
                                                          │            │ functionCall │
                                                          │  ┌─────────▼──────────┐  │
                                                          │  │ Executor           │  │
                                                          │  │ valida + consulta  │  │
                                                          │  └─────────┬──────────┘  │
                                                          └────────────┼─────────────┘
                                                                       │ HTTPS + JSON
                                                          ┌────────────▼─────────────┐
                                                          │ API externa              │
                                                          │ FastAPI + Supabase       │
                                                          │ GET/POST /api/v1/products│
                                                          └──────────────────────────┘
```

### Capas

| Capa | Archivos principales | Responsabilidad |
|---|---|---|
| Frontend | `frontend/src/**` | Chat, SSE, tablas dinámicas, tarjeta de confirmación, rail del catálogo |
| Backend HTTP | `backend/src/routes/**` | `/api/chat`, `/api/catalog`, `/api/actions/:id/confirm`, `/api/actions/:id/cancel`, health |
| Agente | `backend/src/agent/loop.ts`, `gemini.ts`, `prompt.ts` | Conversación con Gemini, elección de herramientas, streaming |
| Catálogo de tools | `backend/src/agent/endpoints.json`, `registry.ts`, `tools.ts` | Allowlist y declaraciones de funciones |
| Ejecución | `backend/src/agent/executor.ts` | Validar argumentos, construir URL/body, consultar la API, shaping |
| Dominio | `backend/src/agent/summarize.ts`, `intent.ts` | Métricas, reglas de tabla, intención de “ganador único” |
| Memoria | `backend/src/agent/sessions.ts` | Historial de texto en RAM |
| Escrituras | `backend/src/agent/pending-actions.ts`, `routes/actions.ts` | Confirmación y ejecución batch |
| Infra | `backend/src/lib/http.ts`, `config.ts`, `logger.ts`, `errors.ts` | HTTP seguro, env, logs, errores |

---

## 3. Ciclo de una consulta de lectura

Ejemplo: *“¿Cuáles son los 3 más caros?”*

1. **Frontend** envía `POST /api/chat` con `{ message, sessionId? }` y escucha SSE.
2. **`routes/chat.ts`** valida el body, aplica rate limit y obtiene/crea la sesión.
3. **`sessions.ts`** entrega hasta 40 mensajes de texto previos.
4. **`loop.ts`** arma los `contents` de Gemini: historial + mensaje actual.
5. **`tools.ts`** convierte `endpoints.json` en `functionDeclarations` y se manda junto con el system prompt.
6. **Gemini** responde con un `functionCall`:
   ```json
   {
     "name": "list_products",
     "args": { "sort_by": "price", "order": "desc", "limit": 3 }
   }
   ```
7. **`executor.ts`** valida que `list_products` exista, que los argumentos sean válidos y que la URL pertenezca al origen configurado.
8. **`lib/http.ts`** hace `GET /api/v1/products` con timeout, cap de 1 MB y reintento solo para GET.
9. **`summarize.ts`** aplica filtros, orden y límite localmente; calcula métricas; genera `view` (título, columnas, conteos).
10. **`loop.ts`** envía a Gemini un `functionResponse` con los ítems y el resumen del catálogo.
11. **Gemini** redacta la respuesta final en streaming.
12. **`routes/chat.ts`** emite `token` por SSE y, al cerrar, `done`.
13. **Frontend** pinta el texto, el rastro de la consulta y la tabla.
14. **`sessions.ts`** guarda el mensaje del usuario y la respuesta de texto (no los JSON ni las tablas).

### Eventos SSE

| Evento | Cuándo | Contenido |
|---|---|---|
| `meta` | Al abrir | `sessionId`, `messageId`, `model` |
| `tool` | Antes/después de una tool de lectura | método, path, estado, duración, filas |
| `result` | Cuando una tool de lectura devuelve datos | `items`, `view` |
| `confirm` | Cuando hay una escritura pendiente | `actionId`, `items`, `count` |
| `token` | Mientras el modelo escribe | fragmento de texto |
| `done` | Al terminar | sesión y si quedó una confirmación pendiente |
| `error` | Si algo falla | código y mensaje |

---

## 4. Ciclo de una escritura (una o varias)

Ejemplo: *“Crea mouse pad, ventilador y tarjeta grafica con estos precios y stock”*.

1. Gemini llama a `create_product` **una vez por producto en el mismo turno**.
2. **`loop.ts`** no ejecuta: junta todas las llamadas en una sola acción pendiente (`pending-actions.ts`).
3. El backend emite `confirm` con `items` y `count`.
4. **Frontend** muestra **una tarjeta** con todos los productos.
5. **Crear los N** llama a `POST /api/actions/:id/confirm`.
6. **`routes/actions.ts`** ejecuta los POST **en secuencia**.
7. Si uno falla, sigue con los demás y devuelve `created` + `failed` (éxito parcial, `httpStatus: 207`).
8. Si no se creó ninguno, responde `502` con `WRITE_FAILED`.
9. Se invalida el caché de `/api/catalog`, se refresca el rail y se muestra la tabla resultante.
10. **Cancelar** consume la acción sin ejecutar ninguna escritura.

Reglas:

- Máximo **10 productos** por confirmación.
- Las escrituras **no se reintentan** para no duplicar datos.
- La acción pendiente vive 5 minutos y se consume una sola vez.
- El rate limit de escrituras es configurable con `WRITE_RATE_LIMIT_MAX` (5 por defecto).

---

## 5. ¿Qué parte es “el agente” y qué parte es backend?

| Pieza | ¿Agente? | ¿Backend? | Qué hace |
|---|---|---|---|
| Gemini | Sí | — | Entiende, elige tools, redacta |
| System prompt | Sí | — | Reglas de negocio, idioma, seguridad |
| Loop de tool calling | Sí | Sí | Orquesta turnos y ejecuta tools |
| Mapa de endpoints | Sí | Sí | Define qué puede hacer el agente |
| Executor | — | Sí | Valida y llama a la API real |
| HTTP/SSE | — | Sí | Transporte con el frontend |
| Sesiones | Sí | Sí | Memoria de conversación |
| Confirmación de escrituras | — | Sí | Evita escrituras accidentales |
| API externa | — | — | Sistema de registro (datos reales) |
| UI de chat/tablas | — | — | Experiencia de usuario |

En una frase: **el agente es el modelo + el loop + el prompt + las tools + la memoria**; el backend es todo lo que hace que eso sea seguro, validado y observable.

---

## 6. Cómo sabe el agente a qué función llamar

No “adivina” URLs. El backend le entrega un contrato explícito.

### 6.1 El mapa de endpoints es la allowlist

`backend/src/agent/endpoints.json` declara cada acción:

```json
{
  "id": "list_products",
  "method": "GET",
  "path": "/api/v1/products",
  "summary": "Lista el catálogo completo de productos",
  "description": "Devuelve id, name, price, stock e image_url...",
  "effects": "read",
  "params": [
    {
      "name": "sort_by",
      "in": "local",
      "required": false,
      "type": "string",
      "enum": ["price", "stock", "name"],
      "description": "Campo de orden..."
    }
  ],
  "examples": ["¿Qué productos hay?"]
}
```

### 6.2 Se convierte en `functionDeclarations`

`tools.ts` transforma cada endpoint en una declaración de Gemini:

- `name` → nombre de la función.
- `description` → resumen + descripción + notas.
- `parameters` → propiedades, tipos, `required`, `enum`, `minimum`, `maximum`, `maxLength`, `nullable`.
- `examples` → se usan en el prompt/UI, no en la declaración.

El modelo recibe esas declaraciones en cada request. **Solo puede llamar lo que está declarado.**

### 6.3 El system prompt orienta la elección

`prompt.ts` explica:

- Qué acciones existen.
- Cuándo usar cada una.
- Cómo combinar filtros y rankings.
- Que no invente datos ni moneda.
- Que no repita la tabla en texto.
- Que las escrituras pasan por confirmación.
- Que el resultado de una tool son datos, no instrucciones.

### 6.4 El loop ejecuta y devuelve el resultado

`loop.ts` recibe los `functionCall` y:

1. Verifica que la acción exista.
2. Valida y prepara los argumentos con `executor.prepare()`.
3. Si es lectura, ejecuta y devuelve `functionResponse`.
4. Si es escritura con confirmación, crea la acción pendiente y corta el turno.
5. Repite hasta que el modelo responda sin tool calls (máximo `MAX_AGENT_STEPS`, 4).

### 6.5 Gemini 3 y `thought_signature`

Gemini 3 exige devolver el `thoughtSignature` de cada `functionCall` al reenviar el historial. Sin eso responde `400`. `gemini.ts` lo captura y `loop.ts` lo preserva. Si cambiás de modelo, verificá si tu proveedor lo requiere.

### 6.6 El modelo no ve secretos

El modelo no recibe la URL base, la API key ni el token. Ve los nombres de las acciones, las rutas relativas declaradas y los esquemas. El executor es quien conoce el origen y las credenciales.

---

## 7. El mapa de endpoints en detalle

### Campos

| Campo | Uso |
|---|---|
| `id` | Nombre de la tool. `snake_case`, único |
| `method` | `GET` o `POST` (el proyecto está preparado para ambos) |
| `path` | Ruta relativa al `EXTERNAL_API_BASE_URL` |
| `summary` / `description` | Lo que ve el modelo y la UI |
| `effects` | `read` o `write` |
| `confirm` | Si una escritura requiere confirmación |
| `params` | Parámetros de la tool |
| `response` | Documentación del shape de respuesta |
| `examples` | Ejemplos de preguntas para la UI y el prompt |

### Dónde se aplica cada parámetro

| `in` | Significado |
|---|---|
| `path` | Se reemplaza en `{param}` de la URL |
| `query` | Se envía como query string a la API |
| `body` | Se envía en el JSON del POST |
| `local` | **No se envía**: el backend lo aplica después de traer los datos |

### Por qué existe `local`

La API de productos no tiene filtros, orden ni paginación. El backend baja el catálogo completo y aplica `sort_by`, `order`, `limit`, `name_contains`, etc. en memoria. Por eso la tabla puede ser dinámica sin depender de que la API tenga filtros.

Si una API **sí** tiene filtros, se declaran como `in: "query"` y el executor los reenvía. Si tiene paginación, hay que declarar `page`/`limit`/`cursor` y decidir si se pagina o si se pide todo.

### Validaciones del registry

- IDs únicos y en `snake_case`.
- GET no puede declarar `body`.
- Las escrituras deben usar POST.
- Parámetros repetidos rechazados.
- Path params declarados.
- El JSON se valida con Zod al arrancar: si está mal, el backend no levanta.

---

## 8. Cómo replicarlo para cualquier sistema

### Paso 1 — Inventariar la API

Antes de escribir una línea de agente:

- ¿Cuál es la URL base?
- ¿Qué endpoints de lectura y escritura existen?
- ¿Qué autenticación usan?
- ¿Devuelven JSON? ¿Tienen IDs estables?
- ¿Tienen filtros, orden y paginación?
- ¿Cuál es el formato de error?
- ¿Hay límites de rate/size?
- ¿Existe OpenAPI/Swagger?

Probá todo con `curl` antes de conectar el modelo.

### Paso 2 — Decidir el alcance

- **Solo lectura:** más simple y seguro.
- **Lectura + escritura:** requiere confirmación, reglas de duplicados y rate limit.
- **Escritura destructiva:** evitar o exigir confirmación explícita + idempotencia.

### Paso 3 — Crear el mapa de endpoints

Un ejemplo para un sistema de pedidos:

```json
{
  "version": 1,
  "api": {
    "name": "Pedidos",
    "description": "API de pedidos",
    "baseUrlEnv": "EXTERNAL_API_BASE_URL",
    "docsUrl": "https://mi-api.com/docs"
  },
  "definitions": {
    "Order": {
      "type": "object",
      "properties": {
        "id": { "type": "integer" },
        "customer": { "type": "string" },
        "total": { "type": "number" },
        "status": { "type": "string" }
      }
    }
  },
  "endpoints": [
    {
      "id": "list_orders",
      "method": "GET",
      "path": "/api/v1/orders",
      "summary": "Lista pedidos",
      "description": "Devuelve pedidos; acepta status y limit.",
      "effects": "read",
      "params": [
        {
          "name": "status",
          "in": "query",
          "required": false,
          "type": "string",
          "description": "pending, paid o shipped"
        },
        {
          "name": "limit",
          "in": "query",
          "required": false,
          "type": "integer",
          "minimum": 1,
          "maximum": 100,
          "description": "Cantidad máxima de pedidos"
        }
      ],
      "response": { "type": "array", "items": { "$ref": "#/definitions/Order" } },
      "examples": ["¿Qué pedidos están pendientes?"]
    },
    {
      "id": "create_order",
      "method": "POST",
      "path": "/api/v1/orders",
      "summary": "Crea un pedido",
      "description": "Crea un pedido con customer y total.",
      "effects": "write",
      "confirm": true,
      "params": [
        {
          "name": "customer",
          "in": "body",
          "required": true,
          "type": "string",
          "description": "Nombre del cliente"
        },
        {
          "name": "total",
          "in": "body",
          "required": true,
          "type": "number",
          "minimum": 0,
          "description": "Total del pedido"
        }
      ],
      "response": { "$ref": "#/definitions/Order" },
      "examples": ["Crea un pedido para Ana por 150"]
    }
  ]
}
```

### Paso 4 — Adaptar el executor

Si la API requiere autenticación, agregá el header en `lib/http.ts` o en el executor:

```ts
headers: {
  authorization: `Bearer ${config.EXTERNAL_API_KEY}`,
}
```

Nunca pongas la key en el prompt, en la tool declaration ni en el frontend.

Si la API pagina:

- Declarás `page`/`limit` como `query`.
- O hacés un loop de páginas en el executor con un tope.
- No calcules totales sobre una sola página.

Si los campos no son `name/price/stock`:

- Agregá una capa de normalización en `summarize.ts`, o
- Cambiá el modelo de datos y la tabla del frontend, o
- Definí un `mapping` por endpoint en el mapa. Hoy el registry no tiene ese campo; habría que agregarlo.

### Paso 5 — Ajustar el prompt

El prompt debe decir:

- Qué representa cada acción.
- Cuándo usarla y cuándo no.
- Cómo combinar filtros.
- Qué hacer si faltan datos.
- Que no invente valores.
- Que las escrituras se confirman.
- El idioma y el formato de moneda/fechas.

### Paso 6 — Mantener el loop y el transporte

El loop y el SSE son genéricos. Lo que cambia es el mapa, el prompt, el executor y el adaptador de dominio.

### Paso 7 — Adaptar la UI

La tabla actual asume productos (`name`, `price`, `stock`). Para otro dominio:

- Cambiá `TableView.columns` y los renderers.
- O normalizá la respuesta a un shape común (`title`, `subtitle`, `amount`, `status`).
- La tarjeta de confirmación usa `name`, `price`, `stock`; adaptala al payload de tu escritura.

### Paso 8 — Probar

- Una consulta simple.
- Un ranking.
- Un filtro.
- Un total sin tabla.
- Un caso sin resultados.
- Un empate.
- Una escritura confirmada.
- Una escritura cancelada.
- Un lote con fallo parcial.
- Rate limit y timeout.

---

## 9. Qué debe tener la API expuesta

El lenguaje de programación **no cambia lo que el agente necesita**. Cambia cómo exponés la API y cómo generás su contrato. Lo que el agente necesita es siempre lo mismo: **HTTP + JSON + un contrato estable + autenticación + errores predecibles**.

### Contrato mínimo

| Requisito | Por qué |
|---|---|
| URL base HTTPS estable | El executor fija el origen; no se aceptan URLs libres |
| Respuestas JSON | El agente y el frontend no parsean HTML |
| OpenAPI/Swagger o documentación clara | Para construir el mapa sin adivinar |
| IDs estables | Para distinguir filas, confirmar y evitar ambigüedad |
| Endpoint de listado | Para consultas, filtros y tablas |
| Endpoint de detalle (opcional) | Para búsquedas puntuales |
| Endpoint de creación (si hay escritura) | Con POST, `201` y el objeto creado |
| Autenticación documentada | API key, Bearer, OAuth o JWT |
| Códigos de estado correctos | `200`, `201`, `400`, `401`, `404`, `422`, `429`, `500` |
| Formato de error estable | `{ error: { code, message } }` o similar |
| Paginación o límite | Para no traer colecciones infinitas |
| Filtros/orden (deseable) | Si no existen, el backend hace shaping local con un tope |
| Rate limit documentado | Para manejar `429` y `Retry-After` |
| Tamaño de respuesta acotado | El executor corta en 1 MB |
| CORS si el navegador llama directo | En este proyecto el navegador no llama a la API externa |

### Autenticación

| Esquema | Cómo se usa | Dónde vive |
|---|---|---|
| API key en header | `X-API-Key: ...` | `.env` del backend |
| Bearer/JWT | `Authorization: Bearer ...` | `.env` o un proveedor de tokens |
| OAuth client credentials | Token de servicio | Backend, nunca el modelo |
| Sin auth | Solo para demos internas | Rate limit igualmente |

El modelo **nunca** recibe el token. Si la API requiere un token por usuario, el backend debe resolverlo por sesión.

### Paginación y filtros

| Situación | Qué hacer |
|---|---|
| La API devuelve todo | Shaping local (como este proyecto) |
| La API pagina con `page`/`limit` | Declarar `query` y paginar con tope |
| La API pagina con cursor | Guardar el cursor y recorrer con tope |
| La API tiene filtros | Declararlos `query` y dejar que el modelo los use |
| La API no tiene filtros y hay millones de filas | No usar shaping local; agregar búsqueda/filtros o un endpoint específico |

### Escrituras

- Usar POST (no GET con efectos).
- Devolver `201` y el objeto creado con `id`.
- Validar en el servidor, no solo en el agente.
- Si se puede, aceptar una **idempotency key** para evitar duplicados por reintentos.
- No reintentar automáticamente una escritura.
- Documentar qué campos son obligatorios.
- Si hay reglas de negocio (stock no negativo, precio > 0), que la API las valide también.

### Errores

Un formato estable ayuda al agente a explicar el problema:

```json
{
  "error": {
    "code": "STOCK_INVALID",
    "message": "El stock no puede ser negativo."
  }
}
```

Evitá devolver HTML, stack traces o páginas de error del framework.

---

## 10. Según el lenguaje: cómo exponer la API y su contrato

Lo importante es que la API sea HTTP + JSON y tenga un contrato. Estas son las herramientas típicas para lograrlo en cada stack.

| Stack | Framework típico | OpenAPI / Swagger |
|---|---|---|
| Python | FastAPI | Automático en `/openapi.json` y `/docs` |
| Python | Django REST Framework | `drf-spectacular` → `/api/schema/` |
| Python | Flask | `flask-smorest` o `apispec` |
| Node/TS | Express | `zod-to-openapi` + `swagger-ui-express`, o `swagger-jsdoc` |
| Node/TS | NestJS | `@nestjs/swagger` → `/api-json` |
| Node/TS | Fastify | `@fastify/swagger` |
| Java | Spring Boot | `springdoc-openapi` → `/v3/api-docs` |
| C# | ASP.NET Core | Swashbuckle → `/swagger/v1/swagger.json` |
| PHP | Laravel | `l5-swagger` o `Scramble` |
| PHP | Symfony | `NelmioApiDocBundle` |
| Go | Gin / Chi / net/http | `swaggo/swag` |
| Ruby | Rails | `rswag` |
| Rust | Axum | `utoipa` |
| Low-code | Strapi / Directus / Supabase | API REST generada; revisar docs y auth |

### Python / FastAPI

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="API de Pedidos", version="1.0.0")

class OrderCreate(BaseModel):
    customer: str = Field(min_length=1, max_length=120)
    total: float = Field(ge=0)

class Order(OrderCreate):
    id: int

@app.get("/api/v1/orders", response_model=list[Order])
def list_orders():
    return [{"id": 1, "customer": "Ana", "total": 150.0}]

@app.post("/api/v1/orders", response_model=Order, status_code=201)
def create_order(body: OrderCreate):
    if body.customer == "error":
        raise HTTPException(status_code=422, detail="Cliente inválido")
    return {"id": 2, **body.model_dump()}
```

FastAPI ya expone `/openapi.json` y `/docs`. El agente puede usar ese contrato como fuente del mapa.

### Node / Express + Zod

```ts
import express from 'express';
import { z } from 'zod';

const app = express();
app.use(express.json());

const OrderCreate = z.object({
  customer: z.string().min(1).max(120),
  total: z.number().nonnegative(),
});

app.get('/api/v1/orders', (_req, res) => {
  res.json([{ id: 1, customer: 'Ana', total: 150 }]);
});

app.post('/api/v1/orders', (req, res) => {
  const parsed = OrderCreate.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({
      error: { code: 'INVALID_BODY', message: parsed.error.issues[0]?.message },
    });
    return;
  }
  res.status(201).json({ id: 2, ...parsed.data });
});

app.listen(8080);
```

Para OpenAPI: `zod-to-openapi` + `swagger-ui-express`, o `swagger-jsdoc` con comentarios. En NestJS, `@nestjs/swagger` genera `/api-json`.

### Java / Spring Boot

```java
@RestController
@RequestMapping("/api/v1/orders")
public class OrderController {

    @GetMapping
    public List<Order> list() {
        return List.of(new Order(1L, "Ana", 150.0));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Order create(@RequestBody @Valid OrderCreate body) {
        return new Order(2L, body.customer(), body.total());
    }
}
```

Con `springdoc-openapi-starter-webmvc-ui`, el contrato queda en `/v3/api-docs` y la UI en `/swagger-ui/index.html`.

### C# / ASP.NET Core

```csharp
[ApiController]
[Route("api/v1/orders")]
public class OrdersController : ControllerBase
{
    [HttpGet]
    public ActionResult<IEnumerable<Order>> List() =>
        Ok(new[] { new Order(1, "Ana", 150m) });

    [HttpPost]
    public ActionResult<Order> Create(OrderCreate body)
    {
        if (string.IsNullOrWhiteSpace(body.Customer))
            return UnprocessableEntity(new { error = new { code = "INVALID", message = "Cliente requerido" } });

        return CreatedAtAction(nameof(List), new { id = 2 }, new Order(2, body.Customer, body.Total));
    }
}
```

Swashbuckle expone `/swagger/v1/swagger.json`.

### PHP / Laravel

```php
Route::get('/api/v1/orders', [OrderController::class, 'index']);
Route::post('/api/v1/orders', [OrderController::class, 'store']);
```

Usá `l5-swagger` o `Scramble` para publicar el contrato. Validá con `FormRequest` y devolvé `201` con el recurso creado.

### Go / Gin

```go
r := gin.Default()

r.GET("/api/v1/orders", func(c *gin.Context) {
    c.JSON(200, []Order{{ID: 1, Customer: "Ana", Total: 150}})
})

r.POST("/api/v1/orders", func(c *gin.Context) {
    var body OrderCreate
    if err := c.ShouldBindJSON(&body); err != nil {
        c.JSON(422, gin.H{"error": gin.H{"code": "INVALID", "message": err.Error()}})
        return
    }
    c.JSON(201, Order{ID: 2, Customer: body.Customer, Total: body.Total})
})

r.Run(":8080")
```

`swaggo/swag` genera `/swagger/doc.json` a partir de anotaciones.

### Otros casos

- **Django REST Framework:** `drf-spectacular` y `/api/schema/`.
- **NestJS:** `@nestjs/swagger` y `/api-json`.
- **Rails:** `rswag` y `/api-docs/v1/swagger.yaml`.
- **Symfony:** `NelmioApiDocBundle` y `/api/doc.json`.
- **Supabase/PostgREST:** API REST automática; documentá tablas, permisos y auth. El agente puede mapear `/rest/v1/<tabla>`.
- **Strapi/Directus:** API REST generada; usá sus endpoints de colección y sus tokens.

---

## 11. Cómo adaptar este proyecto a otro dominio

Checklist:

1. Cambiá `EXTERNAL_API_BASE_URL` en `backend/.env`.
2. Agregá `EXTERNAL_API_KEY` si la API lo requiere y enviá el header en `lib/http.ts`.
3. Reemplazá `endpoints.json` por el mapa del nuevo sistema.
4. Ajustá `prompt.ts` al vocabulario del dominio.
5. Adaptá `summarize.ts` si los campos no son `name/price/stock`.
6. Ajustá las columnas/renderers del frontend.
7. Definí qué acciones son `write` y si requieren confirmación.
8. Probá lectura, shaping, totales, escritura, cancelación y errores.
9. Revisá rate limits, CORS y cold starts.
10. Actualizá `README.md` y `guia.md`.

El loop, el SSE, la sesión, la validación y la confirmación son reutilizables. Lo específico del dominio está en el mapa, el prompt, el executor/adaptador y la tabla.

---

## 12. Seguridad y límites

- **Allowlist:** solo se ejecutan acciones del mapa.
- **Origen fijo:** el executor compara el origen con `EXTERNAL_API_BASE_URL`.
- **Validación:** tipos, enums, min/max, maxLength, campos obligatorios y desconocidos.
- **Secretos:** la API key vive en el backend; el modelo y el frontend no la ven.
- **Rate limit:** 10 consultas/min y 5 escrituras/min por IP.
- **Timeout:** 60 s (Render free puede despertar lento).
- **Tamaño:** respuesta máxima 1 MB; payload de tool al modelo 12.000 caracteres.
- **Escrituras:** confirmación, sin reintento, lote máximo 10, una sola confirmación por acción pendiente.
- **Prompt injection:** los datos de la API se tratan como datos, no como instrucciones.
- **Logs:** pino con redacción de headers sensibles.
- **Historial:** RAM, 30 min, 50 sesiones, 40 mensajes por sesión.
- **Duplicados:** la API puede permitirlos; si el dominio no los quiere, agregá un pre-chequeo por nombre/ID antes de crear.

---

## 13. Checklist de pruebas

### API

```bash
curl -s https://mi-api.com/openapi.json
curl -s https://mi-api.com/api/v1/orders
curl -s -X POST https://mi-api.com/api/v1/orders \
  -H "Content-Type: application/json" \
  -d '{"customer":"Ana","total":150}'
```

### Agente

- “¿Qué hay?” → listado.
- “El más caro/barato” → un ganador o empates.
- “Top 10” → ranking.
- “Stock menor a 5” → filtro.
- “¿Cuánto vale?” → sin tabla.
- “Busca X” → coincidencias.
- “No hay resultados” → mensaje sin inventar.
- “Crea uno” → tarjeta de confirmación.
- “Crea tres” → una tarjeta batch.
- Confirmar → POST y tabla de creados.
- Cancelar → nada se escribe.
- Fallo parcial → creados + fallidos.
- Rate limit → 429.
- Timeout/cold start → mensaje claro.
- Móvil y desktop.

### Operación

- `/health` responde.
- `/api/health/deps` responde.
- `/api/endpoints` muestra las tools.
- Logs sin secretos.
- Build de producción.
- Variables de entorno en Render.
- CORS del frontend.

---

## 14. Glosario

| Término | Significado |
|---|---|
| **Tool / function calling** | El modelo devuelve el nombre y argumentos de una función; el backend la ejecuta |
| **Function declaration** | Esquema que describe una tool al modelo (nombre, parámetros, tipos) |
| **Endpoint map** | JSON con la allowlist de acciones y su contrato |
| **Shaping** | Filtros, orden y límites aplicados por el backend después de traer los datos |
| **SSE** | Server-Sent Events; el backend envía texto y eventos en streaming |
| **Confirmación** | Tarjeta que muestra una escritura y espera aprobación humana |
| **Acción pendiente** | Escritura validada que espera confirmación; vive 5 min |
| **Sesión** | Historial de texto en RAM asociado a un `sessionId` |
| **Thought signature** | Firma que Gemini 3 exige al reenviar function calls en el historial |
| **Allowlist** | Lista cerrada de acciones permitidas; lo demás se rechaza |

---

## 15. Archivos clave

```
backend/src/
  agent/
    endpoints.json       Allowlist y contrato de tools
    registry.ts          Validación del mapa con Zod
    tools.ts             Mapa → functionDeclarations
    llm.ts               Interfaz del proveedor de LLM
    gemini.ts            Adaptador Gemini + thought signatures
    prompt.ts            System prompt y reglas
    loop.ts              Bucle de tool calling
    executor.ts          Validación + HTTP + shaping + view
    summarize.ts         Productos, métricas, títulos y columnas
    intent.ts            Guard de “ganador único”
    pending-actions.ts   Confirmaciones y batch
    sessions.ts          Historial en RAM
    catalog-cache.ts     Caché del catálogo
  routes/
    chat.ts              POST /api/chat (SSE)
    actions.ts           confirmar/cancelar
    catalog.ts           GET /api/catalog
    endpoints.ts         GET /api/endpoints
    health.ts            /health
  lib/
    http.ts              fetch con timeout, retry y cap
    config.ts            Variables de entorno con Zod
    logger.ts            pino
    errors.ts            Errores tipados
frontend/src/
  hooks/use-chat.ts      Estado del chat, SSE, confirmación
  lib/api.ts             Parser SSE y llamadas al backend
  lib/types.ts           Contratos de eventos y vistas
  features/chat/         Mensajes, tablas, detalle, confirmación
  features/catalog/      Rail y métricas
  features/shell/        Masthead y sidebar
```

---

## Resumen en cinco frases

1. El usuario escribe en el frontend y el backend abre un stream SSE.
2. El backend manda a Gemini el historial, el prompt y las tools declaradas en `endpoints.json`.
3. Gemini elige una tool; el backend valida y consulta la API real.
4. El backend hace shaping y le devuelve a Gemini el mismo subconjunto que muestra la tabla.
5. Si hay escritura, el modelo propone y la persona confirma; recién ahí el backend ejecuta el POST.
