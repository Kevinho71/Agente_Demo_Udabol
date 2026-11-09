# Guía simple: cómo funciona este agente

## La idea en una frase

El agente **no es un robot que vive dentro del sistema**. Es un **intermediario** que entiende lo que pedís, elige una acción permitida, el backend la ejecuta contra la API y después te cuenta el resultado.

No tiene ojos, ni manos, ni una base de datos adentro. Solo conversa, elige y explica.

---

## 1. No es un robot adentro del sistema

Cuando ves el chat, parece que “alguien” está adentro. En realidad hay **tres programas hablando entre sí**:

1. **La pantalla** (el chat que usás).
2. **El backend** (un programa en Node que recibe tu mensaje).
3. **La IA** (Gemini, un servicio externo que entiende y redacta).

Y un cuarto actor: **la API externa**, que es donde están los datos reales.

La IA no entra a la API. El backend es el que entra. La IA solo dice: “quiero que alguien ejecute esta acción con estos datos”. El backend revisa si esa acción está permitida y la ejecuta.

---

## 2. La comparación del restaurante

Imaginá un restaurante:

| En el restaurante | En el agente |
|---|---|
| Vos | El usuario |
| El mozo que entiende el pedido | La IA |
| Las manos y piernas del mozo | El backend |
| La cocina | La API externa |
| El menú | La lista de acciones permitidas |
| La mesa y el plato | La pantalla del chat |

El mozo **no cocina**: entiende lo que pedís, elige del menú y lleva el pedido a la cocina. La cocina tiene los ingredientes reales. El mozo vuelve con el plato y te lo explica.

Si pedís algo que no está en el menú, el mozo no lo inventa: te dice que no puede. Si la cocina no tiene un ingrediente, el mozo te lo dice.

**La IA es el mozo. El backend son sus manos. La API es la cocina.**

---

## 3. Qué pasa cuando escribís una pregunta

Ejemplo: *“¿Cuáles son los 3 productos más caros?”*

1. Escribís la pregunta en el chat.
2. La pantalla se la manda al backend.
3. El backend le pasa a la IA:
   - tu pregunta,
   - la conversación anterior,
   - el **menú de acciones permitidas**.
4. La IA elige una acción del menú: `list_products`, ordenada por precio y limitada a 3.
5. El backend revisa que la acción exista y que los datos sean válidos.
6. El backend llama a la API real.
7. La API devuelve los productos.
8. El backend los ordena y recorta; le devuelve a la IA el mismo subconjunto que después vas a ver en la tabla.
9. La IA escribe la respuesta con esos datos.
10. La pantalla muestra el texto y la tabla.

En ningún paso la IA “tocó” la base de datos. Solo eligió una acción y redactó.

---

## 4. ¿Cómo sabe qué acción usar?

Porque el backend le da un **menú cerrado**. Ese menú está en un archivo del proyecto:

`backend/src/agent/endpoints.json`

Hoy el menú tiene dos acciones:

| Acción | Para qué sirve | Qué puede hacer |
|---|---|---|
| `list_products` | Consultar el catálogo | Buscar, ordenar, filtrar y limitar |
| `create_product` | Crear un producto | Pedir nombre, precio y stock, y confirmar antes de escribir |

Cada acción tiene:

- un nombre,
- una descripción,
- los datos que necesita,
- y reglas (por ejemplo, el precio no puede ser negativo).

El backend le muestra ese menú a la IA. **La IA solo puede elegir de ahí.** No puede inventar una URL, una acción ni un dato que no esté permitido.

Si la pregunta no coincide con ninguna acción, la IA lo dice. No sale a navegar por internet.

---

## 5. ¿Por qué la tabla cambia según la pregunta?

Porque el backend usa los mismos parámetros que eligió la IA para preparar los datos:

| Pregunta | Qué hace el backend | Qué ves |
|---|---|---|
| “El más caro” | Ordena por precio y muestra el máximo (o los empatados) | Una ficha o una tabla corta |
| “Top 10 más baratos” | Ordena por precio y limita a 10 | Tabla con 10 filas |
| “Stock menor a 5” | Filtra por stock y ordena | Tabla con los que cumplen |
| “¿Cuánto vale el inventario?” | No muestra tabla; calcula el total | Solo el número |
| “¿Qué productos hay?” | Muestra el catálogo | Tabla con vista previa |

La regla importante: **la tabla y el texto salen de los mismos datos**. Por eso no deberían contradecirse.

---

## 6. ¿Y cuando crea un producto?

La IA **no crea nada por su cuenta**. El flujo es:

1. Le pedís crear un producto.
2. La IA propone los datos: nombre, precio y stock.
3. La pantalla muestra una **tarjeta de confirmación**.
4. Vos apretás **Crear producto**.
5. Recién ahí el backend hace el POST a la API.
6. La pantalla muestra el producto creado con su número de ID.

Si apretás **Cancelar**, no se escribe nada.

También puede crear varios productos en un mismo pedido: muestra **una sola tarjeta** con todos. Si uno falla, los demás se crean igual y te avisa cuál falló.

**La confirmación existe porque la IA se puede equivocar.** Es la diferencia entre “proponer” y “hacer”.

---

## 7. Lo que el agente NO hace

| Creencia | Realidad |
|---|---|
| “Es un robot que vive adentro del sistema” | Es una conversación entre la pantalla, el backend y una IA externa |
| “Tiene los datos adentro” | Pide los datos a la API cada vez |
| “Puede hacer cualquier cosa” | Solo puede elegir las acciones del menú |
| “Aprende de tu catálogo” | No entrena con tus datos; los consulta en el momento |
| “Se acuerda para siempre” | El historial vive en la memoria del backend y dura 30 minutos |
| “Ejecuta código o SQL” | No; solo pide acciones HTTP permitidas |
| “Siempre acierta” | Puede equivocarse; por eso hay validaciones y confirmación antes de escribir |
| “Es un chatbot con los datos pegados” | No; usa acciones y recibe datos frescos de la API |

---

## 8. ¿Se acuerda de la conversación?

Sí, pero **mientras el backend esté corriendo**:

- Guarda los últimos **40 mensajes** de texto en la memoria RAM.
- La conversación expira a los **30 minutos**.
- No usa `localStorage` del navegador.
- Si recargás la página, el chat visual se pierde.
- Si el backend se reinicia, se pierde todo el historial.
- No guarda las tablas ni los JSON de las respuestas anteriores; guarda solo el texto.

Para entenderlo: es como un mozo que recuerda tu mesa mientras el restaurante está abierto. Si cierran y vuelven a abrir, no se acuerda.

---

## 9. Qué necesita cualquier API para conectarse a un agente así

No importa si la API está hecha en Python, Node, Java, C#, PHP, Go o Ruby. Lo que importa es que hable **HTTP + JSON** y tenga un contrato claro.

### Lo mínimo

| Requisito | Para qué |
|---|---|
| Una URL base (HTTPS) | El backend tiene que saber dónde llamar |
| Endpoints de lectura | Para consultar datos |
| Un endpoint de creación (si querés escribir) | Para crear registros |
| Respuestas JSON | El agente no lee páginas HTML |
| IDs estables | Para distinguir un registro de otro |
| Autenticación | API key, token o usuario |
| Errores claros | Para explicar qué falló |
| Documentación | Swagger/OpenAPI es lo ideal |
| Paginación o filtros | Para no traer millones de filas |

### Según el lenguaje

| Lenguaje | Forma habitual de exponer la API | Dónde suele estar la documentación |
|---|---|---|
| Python | FastAPI, Flask o Django REST | `/docs` o `/openapi.json` |
| Node/TypeScript | Express, NestJS o Fastify | Swagger/OpenAPI |
| Java | Spring Boot | `/v3/api-docs` o Swagger UI |
| C# | ASP.NET Core | `/swagger` |
| PHP | Laravel o Symfony | Swagger/Scramble |
| Go | Gin, Chi o net/http | Swagger generado con swaggo |
| Ruby | Rails | rswag |

**El lenguaje no cambia lo que el agente necesita.** Cambia la herramienta con la que exponés la API y generás la documentación.

### Si la API no tiene filtros

El backend puede bajar la lista completa y filtrar él mismo, como hace este proyecto con el catálogo completo. Pero eso solo sirve si la lista es chica.

Si la API tiene miles de registros, conviene que ella misma tenga filtros, orden y paginación. Si no, el agente vería solo una parte y podría responder mal.

---

## 10. Cómo hacer lo mismo para otro sistema

1. **Anotá qué acciones tiene la API.** Por ejemplo: listar pedidos, ver un pedido, crear un pedido.
2. **Armá el menú.** Para cada acción: nombre, método, ruta, parámetros y si es lectura o escritura.
3. **Configurá la URL y la clave** de la API en las variables de entorno del backend.
4. **Ajustá las palabras y la tabla** al nuevo dominio (pedidos en vez de productos, por ejemplo).
5. **Probá** una consulta simple, un filtro, un total, una creación, una cancelación y un error.

El resto se reutiliza: el chat, el loop con la IA, el streaming, la memoria y la confirmación.

---

## 11. Glosario mínimo

| Palabra | Qué significa |
|---|---|
| **Agente** | La IA + el menú de acciones + el programa que las ejecuta |
| **API** | El sistema externo donde están los datos reales |
| **Backend** | El programa que valida, llama a la API y responde |
| **Frontend** | La pantalla que ves: chat, tablas y tarjetas |
| **Acción / tool** | Una operación del menú, por ejemplo “listar productos” |
| **Endpoint** | Una dirección de la API, por ejemplo `/api/v1/products` |
| **Confirmación** | La tarjeta donde aprobás una escritura antes de que ocurra |
| **Sesión** | La memoria temporal de una conversación |

---

## Resumen

El agente no es un robot que vive adentro del sistema. Es un **mozo automático**:

- entiende tu pedido,
- elige una acción del menú,
- el backend la ejecuta contra la API,
- la IA te explica el resultado,
- y si hay que crear algo, te pide confirmación antes de hacerlo.
