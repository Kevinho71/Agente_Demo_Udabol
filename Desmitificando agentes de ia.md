# DESMITIFICANDO A LOS AGENTES DE IA
# Qué es realmente un agente de IA: el LLM solo devuelve texto

> Una explicación honesta, de cero a producción, de lo que hay detrás de la palabra "agente".
> Todo el código de ejemplo está en Python. Al final encontrarás un mini-ejemplo funcional completo.
> **Versión revisada:** matiza las simplificaciones de la versión original y corrige el código de ejemplo (llamadas a herramientas en paralelo, manejo de errores, parámetros de la API y diferencias entre proveedores).

---

## Tabla de contenidos

- [Parte 0 — El LLM puro](#parte-0--el-llm-puro)
  - [§1. Qué es un LLM](#1-qué-es-un-llm)
  - [§2. Cómo funciona una llamada a la API de un LLM](#2-cómo-funciona-una-llamada-a-la-api-de-un-llm)
  - [§3. La amnesia del LLM (stateless)](#3-la-amnesia-del-llm-stateless)
- [Parte 1 — El "agente" como bucle de código](#parte-1--el-agente-como-bucle-de-código)
  - [§4. Qué es realmente un agente](#4-qué-es-realmente-un-agente)
  - [§5. Contexto inicial (system prompt)](#5-contexto-inicial-system-prompt)
  - [§6. La fase de petición al LLM](#6-la-fase-de-petición-al-llm)
- [Parte 2 — Tool calling: cómo el agente "usa" funciones](#parte-2--tool-calling-cómo-el-agente-usa-funciones)
  - [§7. Cómo el LLM "sabe" qué funciones tiene disponibles](#7-cómo-el-llm-sabe-qué-funciones-tiene-disponibles)
  - [§8. Cómo el LLM pide llamar a una función](#8-cómo-el-llm-pide-llamar-a-una-función)
  - [§9. El código ejecuta la función (determinista)](#9-el-código-ejecuta-la-función-determinista)
  - [§10. La función devuelve datos y se reinyectan al LLM](#10-la-función-devuelve-datos-y-se-reinyectan-al-llm)
- [Parte 3 — Robustez en producción](#parte-3--robustez-en-producción)
  - [§11. Validación server-side de los datos](#11-validación-server-side-de-los-datos)
  - [§12. Verificación de respuestas: validación determinista y LLM auditor](#12-verificación-de-respuestas-validación-determinista-y-llm-auditor)
- [Parte 4 — Conectar con herramientas externas](#parte-4--conectar-con-herramientas-externas)
  - [§13. fetch directo y MCP: dos niveles, no dos rivales](#13-fetch-directo-y-mcp-dos-niveles-no-dos-rivales)
- [Parte 5 — La verdad incómoda (conclusiones)](#parte-5--la-verdad-incómoda-conclusiones)
  - [§14. El rol del LLM dentro del agente](#14-el-rol-del-llm-dentro-del-agente)
  - [§15. Herramientas, MCP y funciones son código determinista](#15-herramientas-mcp-y-funciones-son-código-determinista)
  - [§16. Mini-ejemplo funcional completo + diagrama + checklist + glosario](#16-mini-ejemplo-funcional-completo--diagrama--checklist--glosario)

---

# Parte 0 — El LLM puro

Antes de hablar de "agentes", hay que dejar claro qué es la pieza sobre la que todo se construye: el modelo de lenguaje (LLM, *Large Language Model*). Si no entiendes esto, todo lo demás parecerá magia cuando en realidad no lo es.

## §1. Qué es un LLM

Un LLM es un **modelo que predice el siguiente token**.

- Un *token* es una unidad de texto: puede ser una palabra, parte de una palabra, o un símbolo. "hola" puede ser 1 token; "increíblemente" puede ser 3.
- El modelo recibe una secuencia de tokens y calcula, para cada posible token siguiente, una probabilidad. Elige uno (según la `temperature` y otros parámetros de muestreo), lo añade a la secuencia y repite.
- Por eso se dice que **genera** texto: lo construye token a token, en un bucle.

Lo más importante de esta sección, y de todo el documento, es el contrato de la API:

> **Desde fuera, un LLM recibe texto (o tokens) y devuelve texto. Nada más.**

Puedes verlo como una función:

```python
def llm(texto_de_entrada: str) -> str:
    return texto_de_salida
```

> Matiz: no es una función *pura* en sentido estricto. Con `temperature > 0` la misma entrada puede producir salidas distintas, e incluso con `temperature = 0` las salidas no siempre son idénticas entre llamadas. Lo que sí es cierto es que **no tiene estado entre llamadas** (§3).

### Qué hace y qué no hace un LLM

"Predice el siguiente token" describe el **mecanismo de generación**, no la cantidad de computación que hay detrás. Para predecir bien el siguiente token, el modelo ha aprendido representaciones muy complejas del lenguaje, del mundo y del razonamiento. Además, los modelos de razonamiento modernos generan texto intermedio ("cadena de pensamiento") antes de la respuesta final, y eso mejora de forma medible su desempeño en matemáticas, código y planificación.

Por eso conviene evitar dos extremos: pensar que el modelo es una mente con voluntad propia, o pensar que es "solo autocompletar" sin más. La forma útil de verlo es esta:

| Creencia común | Matiz correcto |
| --- | --- |
| "Piensa como una persona" | Genera texto token a token; puede producir razonamiento útil, pero no sabemos (ni hace falta asumir) que "piense" como un humano. |
| "Tiene memoria" | No entre llamadas: no recuerda nada salvo lo que le reenvías en la petición (§3). |
| "Ejecuta código / funciones" | No. Solo produce texto (incluyendo peticiones estructuradas de herramientas). Las funciones las ejecuta tu código (Parte 2). |
| "Tiene acceso a internet o a tu base de datos" | No por sí mismo. Solo sabe lo que aprendió en el entrenamiento y lo que tú le pases como texto en la petición. |
| "Toma decisiones" | Funcionalmente sí: elige qué herramienta pedir, con qué argumentos, o cuándo dar la respuesta final. Pero esa decisión es una **propuesta en texto**; **tu código controla qué se ejecuta realmente**. |

Esta tabla es el corazón del documento. Vuelve a ella cada vez que la palabra "agente" te haga imaginar algo más de lo que es.

## §2. Cómo funciona una llamada a la API de un LLM

Para "hablar" con un LLM, haces una petición HTTP a un servicio en la nube (OpenAI, Anthropic, Google, etc.) usando una **API key** que te identifica y por la que pagas.

### 2.1. La API key

Es una credencial (una cadena larga) que:

- Identifica tu cuenta.
- Determina a qué modelos tienes acceso.
- Sirve para cobrarte por uso.

La pones en una cabecera HTTP de autorización. **Nunca** la pongas en el código del frontend ni la subas a un repositorio: vive en variables de entorno de tu backend.

### 2.2. El request

Una llamada mínima tiene esta forma (formato estilo OpenAI *Chat Completions*):

```python
import os
import requests

API_KEY = os.environ["LLM_API_KEY"]        # nunca hardcodeada
MODELO = os.environ["LLM_MODEL"]           # consulta en la documentación el nombre vigente
URL = "https://api.openai.com/v1/chat/completions"

respuesta = requests.post(
    URL,
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={
        "model": MODELO,
        "messages": [
            {"role": "user", "content": "¿Cuánto es 2 + 2?"}
        ],
        "temperature": 0.7,   # aleatoriedad (algunos modelos de razonamiento no lo aceptan)
        "max_completion_tokens": 100,   # límite de tokens a generar
    },
    timeout=60,
)
respuesta.raise_for_status()
```

Los campos clave del `json`:

| Campo | Qué es |
| --- | --- |
| `model` | Qué modelo usar. Los nombres cambian con frecuencia: consulta siempre la documentación vigente de tu proveedor. |
| `messages` | **Todo** el contexto como una lista de mensajes. Es lo más importante: aquí va TODO lo que el modelo debe "saber". |
| `temperature` | Controla la aleatoriedad del muestreo. Más bajo = respuestas más predecibles; más alto = más variadas. Algunos modelos (por ejemplo, ciertos modelos de razonamiento) no admiten este parámetro o lo fijan ellos. |
| `max_completion_tokens` | Máximo de tokens a generar. En APIs antiguas este campo se llamaba `max_tokens`; en varias APIs modernas se ha reemplazado, así que verifica el nombre exacto en tu proveedor. |

### 2.3. El response

```python
data = respuesta.json()
texto = data["choices"][0]["message"]["content"]
print(texto)  # -> "2 + 2 es 4"

print(data["usage"])  # -> {"prompt_tokens": 12, "completion_tokens": 5, "total_tokens": 17}
```

Tres cosas a notar:

1. La respuesta útil es `choices[0].message.content`: **un string**. Texto. (Cuando hay tool calls, además aparece `tool_calls`; lo vemos en §8.)
2. `usage` te dice cuántos tokens consumiste. Pagas por tokens de **entrada** (tu prompt) y de **salida** (la respuesta). Algunos proveedores también cobran o reportan por separado tokens de razonamiento.
3. Los tokens de entrada incluyen todo el historial que reenvíes (ver §3). Por eso las conversaciones largas cuestan más.

> Regla mental: **el modelo es un servicio sin estado al que le mandas texto y te devuelve texto.** No hay ningún objeto "sesión" o "conversación" viviendo en el servidor.
>
> Nota: algunos proveedores ofrecen, como funcionalidad opcional, APIs con estado gestionado por ellos (conversaciones o hilos almacenados en su servidor). Aun así, por debajo el modelo sigue recibiendo el contexto completo en cada generación; lo único que cambia es *quién* guarda y reenvía el historial.

## §3. La amnesia del LLM (stateless)

Pregunta típica: *"le dije mi nombre en el mensaje anterior, ¿por qué no lo recuerda?"*

Respuesta: **porque el LLM no recuerda nada entre llamadas**. Cada llamada es un universo aislado. Esto se llama ser *stateless* (sin estado).

### 3.1. La ilusión de memoria

Cuando usas un chat y "recuerda" tu nombre, lo que ocurre por debajo es que **el cliente (la app) reenvía toda la conversación en cada petición**.

Ejemplo: quieres que recuerde que te llamas Ana.

```python
historial = []  # esto lo guarda TU código, no el LLM

# Primera llamada
historial.append({"role": "user", "content": "Me llamo Ana."})
respuesta = llamar_llm(historial)
historial.append({"role": "assistant", "content": respuesta})

# Segunda llamada (en un request NUEVO, separado en el tiempo)
historial.append({"role": "user", "content": "¿Cómo me llamo?"})
respuesta = llamar_llm(historial)  # <- se reenvía TODO el historial
```

La clave está en `llamar_llm(historial)`: en la segunda llamada, el array `messages` que envías contiene los **tres** mensajes (el de Ana, la respuesta del modelo, y la pregunta nueva). El modelo solo "recuerda" porque se lo cuentas de nuevo cada vez.

### 3.2. Dónde se guarda el historial

Como el LLM no guarda nada, **tú** debes persistir el historial si quieres continuidad entre sesiones:

- En memoria (se pierde al reiniciar el proceso).
- En una base de datos (para conversaciones persistentes).
- En un archivo o en Redis (para sesiones de corta vida).

```python
# Guardar el historial en tu backend para la sesión 123
guardar_en_bd(sesion_id="123", mensajes=historial)

# Recuperarlo la próxima vez que el usuario escriba
historial = leer_de_bd(sesion_id="123")
```

### 3.3. El límite: context window

Cada modelo acepta una cantidad máxima de tokens (la *context window*). Si tu historial crece sin control, llegará un punto en que:

1. La petición se rechaza por exceder el límite.
2. O pagas cada vez más tokens de entrada (y el modelo puede rendir peor con contextos enormes).

Por eso hay técnicas para gestionar el contexto: resumir mensajes antiguos, eliminar los más viejos, recuperar solo fragmentos relevantes (RAG) o usar sistemas de memoria externa. Pero el principio no cambia: **todo lo que el modelo debe saber tiene que caber, como texto, dentro de la petición**.

---

# Parte 1 — El "agente" como bucle de código

Con el LLM entendido como "texto entra, texto sale", ya podemos desmontar la palabra "agente".

## §4. Qué es realmente un agente

No existe una pieza de software llamada "agente" que mágicamente haga cosas. En su núcleo, lo que existe es:

> **Un agente es un bucle de código que llama al LLM, lee lo que devuelve, y según eso ejecuta una acción (o no), repitiendo el ciclo hasta terminar.**

El LLM **no es** el agente. El agente es **tu código** (el bucle y todo lo que lo rodea). El LLM es el componente que, en cada vuelta, decide qué proponer a continuación.

El bucle, en pseudocódigo:

```
historial = [system, user]
repetir (con límite):
    respuesta = llamar_llm(historial)         # texto / peticiones de herramientas
    si respuesta pide ejecutar algo:
        resultado = ejecutar(respuesta)        # código tuyo, determinista
        historial += resultado                 # se lo cuentas al LLM
    si no:
        terminar y devolver respuesta
```

En Python, el esqueleto más simple:

```python
def agente(pregunta_usuario: str) -> str:
    historial = [
        {"role": "system", "content": "Eres un asistente útil."},
        {"role": "user", "content": pregunta_usuario},
    ]
    respuesta = llamar_llm(historial)
    return respuesta  # solo texto
```

Eso ya es, técnicamente, un "agente" de un solo paso. La complejidad viene después (Parte 2), cuando el bucle empieza a ejecutar funciones.

### El bucle es el núcleo, no el sistema completo

Decir "un agente es solo un bucle" es cierto como modelo mental y como esqueleto de implementación, pero los agentes reales de producción suelen añadir muchas piezas alrededor de ese bucle:

- **Planificación**: descomponer tareas largas en pasos.
- **Gestión de contexto**: resumir, recortar o recuperar información para no desbordar la context window.
- **Memoria persistente**: guardar y recuperar hechos entre sesiones.
- **Permisos y aprobaciones**: qué acciones requieren confirmación humana.
- **Subagentes**: delegar subtareas a otros bucles con su propio contexto.
- **Observabilidad**: logs, trazas, métricas y evaluaciones.

Todo eso sigue siendo código determinista tuyo alrededor del LLM. El bucle es la base; el resto es ingeniería que se construye encima.

## §5. Contexto inicial (system prompt)

La primera pieza de contexto que le das al modelo es el **system prompt**: un mensaje con `role: "system"` que va al principio de la conversación. (En algunas APIs es un campo aparte, por ejemplo `system`, en lugar de un mensaje dentro de la lista.)

Su función es *condicionar* todo lo que viene después: le dice al modelo quién es, cómo debe comportarse, qué puede y qué no puede hacer, y qué formato debe usar para responder.

```python
system_prompt = """
Eres un asistente de soporte técnico de una empresa de climatización.
Reglas:
- Responde siempre en español.
- Si te piden el clima de una ciudad, usa la herramienta get_clima.
- Nunca inventes datos: si no tienes un dato, dilo.
- Responde en formato JSON: {"respuesta": "...", "fuente": "..."}.
"""
```

Puntos importantes:

1. El system prompt es **texto plano** inyectado en la petición. No es "programación": son instrucciones en lenguaje natural.
2. Es tu principal mecanismo de control sobre el comportamiento. Cuanto más preciso, más predecible es la salida.
3. Aunque le pidas "nunca inventes datos", **no lo garantiza**: es una instrucción que el modelo sigue de forma probabilística, no una regla de seguridad. La seguridad real está en tu código (Parte 3).

## §6. La fase de petición al LLM

Cada vuelta del bucle es una petición completa. El payload que envías combina tres capas:

1. **System prompt** (quién es y qué reglas sigue).
2. **Historial** (toda la conversación previa, incluidos resultados de funciones en la Parte 2).
3. **Mensaje actual** (lo que el usuario acaba de pedir).

```python
def construir_payload(system_prompt, historial, mensaje_actual):
    return {
        "model": MODELO,
        "messages": [
            {"role": "system", "content": system_prompt},
            *historial,                                # todos los mensajes previos
            {"role": "user", "content": mensaje_actual},
        ],
        "temperature": 0.3,
    }
```

La respuesta, insistimos, es **solo texto** (o una petición estructurada de herramienta, que sigue siendo texto/JSON). En esta fase el modelo no ha ejecutado nada: ha devuelto datos que tu código va a interpretar.

---

# Parte 2 — Tool calling: cómo el agente "usa" funciones

Aquí es donde la gente empieza a creer en la magia: "el agente consultó mi base de datos", "el agente llamó a una API externa". La realidad es más prosaica y más útil de entender.

## §7. Cómo el LLM "sabe" qué funciones tiene disponibles

> **El LLM no tiene ninguna función integrada en tu sistema. No ejecuta nada. No tiene acceso a tu base de datos, ni a tu API, ni a internet (salvo que el proveedor ofrezca herramientas alojadas en su lado, y en ese caso también las ejecuta código del proveedor, no el modelo).**

Entonces, ¿cómo "llama" a una función? Muy simple: **tú le describes las funciones como texto**, y el modelo, si cree que necesita una, *te pide* que la ejecutes.

Estas descripciones se llaman *tools* (o *functions*) y se envían en la petición con un esquema JSON. Una definición de tool tiene tres partes:

- `name`: el nombre de la función.
- `description`: qué hace, en lenguaje natural (el modelo "lee" esto).
- `parameters`: qué argumentos acepta, con tipos (JSON Schema).

```python
tools = [
    {
        "type": "function",
        "function": {
            "name": "get_clima",
            "description": "Devuelve la temperatura actual de una ciudad usando latitud y longitud.",
            "parameters": {
                "type": "object",
                "properties": {
                    "latitud":  {"type": "number", "description": "Latitud en grados decimales"},
                    "longitud": {"type": "number", "description": "Longitud en grados decimales"},
                },
                "required": ["latitud", "longitud"],
            },
        },
    }
]
```

Fíjate en lo esencial: **la descripción es texto**. El modelo no "ve" la función `get_clima`; ve una descripción que dice "devuelve la temperatura de una ciudad". Si decides eliminar la función de tu código pero dejas la descripción, el modelo seguirá pidiéndola, y tu código fallará al intentar ejecutarla.

> Nota: los modelos actuales están **entrenados específicamente** para usar herramientas: leer bien las descripciones, elegir la herramienta adecuada y producir argumentos válidos. Por eso la calidad del modelo importa mucho en este paso, aunque quien ejecute sea siempre tu código.

## §8. Cómo el LLM pide llamar a una función

Cuando el modelo decide que necesita una herramienta, su respuesta incluye un campo especial `tool_calls` con:

- El nombre de la función que quiere.
- Los argumentos, en JSON (como **string**, que tú debes parsear).

```python
# Respuesta del modelo (simplificada)
mensaje = {
    "role": "assistant",
    "content": None,               # puede ser None (o incluso contener algo de texto)
    "tool_calls": [{
        "id": "call_abc123",
        "type": "function",
        "function": {
            "name": "get_clima",
            "arguments": '{"latitud": 40.4168, "longitud": -3.7038}'
        }
    }]
}
```

Dos puntos críticos:

> **El modelo no ha ejecutado `get_clima`. Solo ha dicho: "quiero llamar a `get_clima` con estos argumentos".** Es un mensaje (estructurado como JSON) que tu código debe interpretar.

> **`tool_calls` es una lista: el modelo puede pedir varias herramientas en la misma respuesta (llamadas en paralelo).** Tu código debe ejecutar **todas** y devolver un resultado `role: "tool"` por cada `id`. Si respondes solo a una, la API devolverá un error en la siguiente llamada.

## §9. El código ejecuta la función (determinista)

Ahora sí actúa **tu código**. Tienes una función real, escrita por ti, que hace el trabajo de verdad:

```python
def get_clima(latitud: float, longitud: float) -> dict:
    """Consulta TU backend o una API externa y devuelve el clima."""
    respuesta = requests.get(
        "https://tu-backend.com/api/clima",
        params={"lat": latitud, "lon": longitud},
        timeout=10,
    )
    respuesta.raise_for_status()
    return respuesta.json()  # {"ciudad": "Madrid", "temp_c": 14.5}
```

El bucle, al detectar un `tool_call`, ejecuta la función correspondiente:

```python
FUNCIONES_DISPONIBLES = {
    "get_clima": get_clima,   # <- aquí está la función real
}

def ejecutar_tool(tool_call):
    nombre = tool_call["function"]["name"]
    argumentos = json.loads(tool_call["function"]["arguments"])
    funcion = FUNCIONES_DISPONIBLES[nombre]
    return funcion(**argumentos)
```

Observa lo que ocurre:

1. El `name` que el LLM devolvió (`"get_clima"`) se usa como **clave de un diccionario** que apunta a tu función real. No hay conexión mágica: es un `if`/diccionario. (Este diccionario actúa también como **lista blanca**: el modelo solo puede disparar lo que tú registraste.)
2. Los `arguments` que el LLM produjo (en JSON) se convierten a parámetros Python.
3. La función real puede consultar **tu propia API backend**, tu base de datos, o un servicio externo. Esa lógica es 100% código tuyo, determinista.

> Este `ejecutar_tool` es una versión mínima. En la sección siguiente y en §11 se muestra cómo manejar nombres desconocidos, JSON inválido y argumentos incorrectos.

## §10. La función devuelve datos y se reinyectan al LLM

La función devuelve datos. Ahora hay que *contarle* al LLM lo que devolvió, para que redacte la respuesta final.

Primero se añade al historial **el mensaje completo del asistente** (con todos sus `tool_calls`) y después un mensaje `role: "tool"` **por cada** tool call, asociado a su `id`:

```python
# El modelo respondió con "mensaje" (que contiene tool_calls)
historial.append(mensaje)   # el mensaje del asistente tal cual, con TODOS sus tool_calls

for tool_call in mensaje["tool_calls"]:
    resultado = ejecutar_tool(tool_call)   # {"ciudad": "Madrid", "temp_c": 14.5}
    historial.append({
        "role": "tool",
        "tool_call_id": tool_call["id"],
        "content": json.dumps(resultado),  # <- los datos reales, como texto
    })
```

Y se vuelve a llamar al LLM, ahora con esos resultados en el contexto:

```python
respuesta_final = llamar_llm(historial)
print(respuesta_final["content"])
# -> "En Madrid la temperatura actual es de 14.5 °C."
```

El bucle se cierra así:

```
usuario pregunta  ->  LLM pide get_clima  ->  tu código ejecuta  ->  resultado se reinyecta  ->  LLM redacta
```

La función **sí** hizo el trabajo real (llamó a la API). El LLM **solo** tradujo el resultado a lenguaje natural (y antes decidió qué herramienta pedir y con qué argumentos). Esa división de responsabilidades es la lección central del documento.

### 10.1. Otros proveedores usan otro formato

Todo el código de este documento usa el formato estilo OpenAI (`choices`, `tool_calls`, `role: "tool"`). **El concepto es idéntico en todos los proveedores, pero la estructura cambia.** Por ejemplo, en la API de Anthropic:

- La respuesta contiene una lista de **bloques de contenido** (`content: [...]`), entre ellos bloques `text` y bloques `tool_use` (con `id`, `name` e `input` ya como objeto JSON, no como string).
- Los resultados se devuelven en un mensaje con `role: "user"` que contiene bloques `tool_result` (con `tool_use_id`).
- La señal de que el modelo quiere herramientas es el `stop_reason: "tool_use"`.

```python
# Esquema conceptual (formato Anthropic), NO es código portable de lo anterior
respuesta = {
    "stop_reason": "tool_use",
    "content": [
        {"type": "text", "text": "Voy a consultar el clima."},
        {"type": "tool_use", "id": "toolu_01", "name": "get_clima",
         "input": {"latitud": 40.4168, "longitud": -3.7038}},
    ],
}

# Tu código responde con:
siguiente_mensaje = {
    "role": "user",
    "content": [
        {"type": "tool_result", "tool_use_id": "toolu_01",
         "content": '{"ciudad": "Madrid", "temp_c": 14.5}'},
    ],
}
```

Si cambias de proveedor, adapta el código a su estructura (o usa su SDK oficial, que ya la encapsula). El bucle y la lógica son los mismos.

---

# Parte 3 — Robustez en producción

Hasta aquí funciona en un demo. En producción, confiar ciegamente en el LLM es un error grave.

## §11. Validación server-side de los datos

Regla de oro:

> **El LLM no valida nada por ti. El LLM produce texto. La validación la hace tu código, siempre, en el servidor.**

### 11.1. Validar los argumentos antes de ejecutar

El LLM puede devolver argumentos mal formados, JSON inválido, tipos incorrectos o valores absurdos (un `latitud: 999`). Nunca ejecutes una función con los argumentos crudos del modelo:

```python
from pydantic import BaseModel, Field

class ArgsClima(BaseModel):
    latitud: float = Field(ge=-90, le=90)
    longitud: float = Field(ge=-180, le=180)

ESQUEMAS_ARGS = {"get_clima": ArgsClima}

def ejecutar_tool_seguro(tool_call):
    nombre = tool_call["function"]["name"]

    if nombre not in FUNCIONES_DISPONIBLES:            # herramienta que no existe
        raise ValueError(f"Herramienta desconocida: {nombre}")

    argumentos = json.loads(tool_call["function"]["arguments"])   # puede lanzar JSONDecodeError
    args = ESQUEMAS_ARGS[nombre](**argumentos)                     # lanza error si no valida
    return FUNCIONES_DISPONIBLES[nombre](**args.model_dump())
```

### 11.2. Validar el output de la función

También validas lo que tu función devuelve, para garantizar que cumple un contrato:

```python
from pydantic import BaseModel

class ResultadoClima(BaseModel):
    ciudad: str
    temp_c: float

def get_clima(latitud: float, longitud: float) -> ResultadoClima:
    respuesta = requests.get(..., timeout=10)
    respuesta.raise_for_status()
    return ResultadoClima(**respuesta.json())  # valida estructura y tipos
```

### 11.3. Manejo de errores

Si la función falla, **no** dejes que el bucle se rompa silenciosamente: devuélvele el error al LLM como texto, para que pueda responder coherentemente. Hazlo **para cada tool call** (recuerda que puede haber varias):

```python
for tool_call in mensaje["tool_calls"]:
    try:
        resultado = ejecutar_tool_seguro(tool_call)
        if hasattr(resultado, "model_dump"):
            resultado = resultado.model_dump()
    except Exception as e:
        resultado = {"error": str(e)}

    historial.append({
        "role": "tool",
        "tool_call_id": tool_call["id"],
        "content": json.dumps(resultado),
    })
```

El LLM leerá `{"error": "..."}` y podrá decir "no pude obtener el clima" en lugar de inventárselo, o corregir los argumentos y reintentar.

> Cuidado con lo que expones en los mensajes de error: no devuelvas trazas internas, rutas, claves ni datos sensibles al modelo (ni, a través de él, al usuario).

### 11.4. Nunca confiar en la salida del LLM para lógica crítica

Si el LLM decide "borrar la cuenta del usuario 7", **no** ejecutes el borrado porque el texto lo diga. La decisión de negocio crítica debe pasar por tus propias reglas, permisos y confirmaciones. El LLM propone; tu código dispone y valida.

Esto incluye la **inyección de prompts**: si el modelo procesa contenido externo (páginas web, correos, documentos), ese contenido puede contener instrucciones maliciosas que intenten manipularlo. Por eso los permisos y las restricciones tienen que estar en tu código, no en el prompt.

## §12. Verificación de respuestas: validación determinista y LLM auditor

Antes de recurrir a un segundo LLM, aprovecha las verificaciones **baratas y fiables**:

- **Validación con esquemas** (Pydantic, Zod, JSON Schema) del formato de salida.
- **Comprobación contra los datos de la herramienta**: si la respuesta cita una temperatura, verifica en código que coincide con la que devolvió `get_clima`.
- **Citas o referencias obligatorias**: exigir que cada dato venga con su fuente (ID de registro, URL) y comprobar que existe.
- **Reglas de negocio** expresadas como código (rangos, listas permitidas, longitud máxima).

Cuando lo anterior no basta (por ejemplo, para evaluar coherencia semántica o detectar afirmaciones no respaldadas), un patrón útil es usar **un segundo LLM** para revisar la salida del primero:

```python
respuesta = agente_principal(pregunta)

# Un segundo LLM revisa la respuesta
revision = llamar_llm([
    {"role": "system", "content": (
        "Eres un auditor. Revisa si la siguiente respuesta contiene datos inventados, "
        "incoherencias o no cumple el formato. Responde SOLO 'OK' o 'ERROR: <motivo>'."
    )},
    {"role": "user", "content": (
        f"Datos reales: {json.dumps(datos_reales)}\n"
        f"Respuesta a revisar: {respuesta}"
    )},
])["content"]

if revision.strip().startswith("ERROR"):
    respuesta = corregir_o_reintentar(respuesta, revision)
```

Qué revisa típicamente el auditor:

- **Alucinaciones**: que la respuesta no invente datos que no están en los datos reales.
- **Coherencia**: que la conclusión se derive de los datos de la función.
- **Formato**: que cumpla el esquema acordado (JSON, markdown, etc.).
- **Restricciones**: que no haya filtrado información que no debía.

**Trade-offs:** añade latencia (otra llamada) y costo (más tokens). Úsalo donde el error es caro (dinero, salud, legal), no para todo.

Ojo: el auditor es también un LLM y también se equivoca. Es una capa de reducción de riesgo, no una garantía absoluta. La garantía real la dan las validaciones deterministas de §11 y las comprobaciones de arriba.

---

# Parte 4 — Conectar con herramientas externas

Tu sistema necesita recopilar datos de herramientas externas (una API del clima, una pasarela de pagos, un CRM...). Hay dos enfoques que a menudo se presentan como rivales, pero en realidad operan a **niveles distintos**.

## §13. fetch directo y MCP: dos niveles, no dos rivales

### 13.1. fetch directo

Tu backend hace la petición HTTP directamente a la API externa:

```python
import os
import requests

def get_clima(latitud, longitud):
    r = requests.get(
        "https://api.meteo.com/v1/current",
        params={"lat": latitud, "lon": longitud},
        headers={"Authorization": f"Bearer {os.environ['METEO_KEY']}"},
        timeout=10,
    )
    r.raise_for_status()
    return r.json()
```

**Ventajas:**

- Control total: tú decides qué pedir, cómo autenticar, cómo cachear, cómo validar.
- Simple de depurar y testear.
- La seguridad y validación están en un solo lugar: tu código.

**Desventajas:**

- Escribes y mantienes cada integración a mano.

### 13.2. MCP (Model Context Protocol)

MCP es un **protocolo abierto** que estandariza cómo un cliente (una aplicación o *harness* que usa un LLM) descubre y usa capacidades expuestas por un servidor. Piensa en él como "USB-C para herramientas de IA".

Un servidor MCP puede exponer tres tipos de capacidades:

| Capacidad | Qué es |
| --- | --- |
| **Tools** | Funciones que el cliente puede invocar (`tools/list`, `tools/call`). |
| **Resources** | Datos o contenido que el cliente puede leer como contexto (archivos, registros, documentos). |
| **Prompts** | Plantillas de prompt reutilizables que el servidor ofrece al cliente. |

```python
# Conceptualmente, un servidor MCP expone:
#   tools/list      -> devuelve qué herramientas hay disponibles
#   tools/call      -> ejecuta una herramienta con argumentos
#   resources/list, resources/read  -> datos de contexto
#   prompts/list, prompts/get       -> plantillas de prompt
```

Un **servidor MCP** es un proceso (local o remoto) que:

1. **Expone** capacidades con su esquema.
2. **Recibe** invocaciones del cliente y ejecuta el código correspondiente (que, de nuevo, es determinista).

**Ventajas:**

- Estándar: un mismo servidor MCP lo pueden consumir distintos clientes (Claude Code, otros harnesses, aplicaciones propias).
- Descubrimiento automático: el cliente lista las capacidades sin que las programes una a una.

**Desventajas:**

- Añade una capa intermedia y un protocolo que entender.
- Si lo integras en tu propio backend, necesitas un cliente MCP además del servidor.
- Un servidor MCP de terceros es código de terceros: hay que evaluar su seguridad y los permisos que le das.

### 13.3. Cómo se relacionan (no son alternativas excluyentes)

Esta es la imprecisión más común: "fetch vs MCP" suena a elegir una cosa u otra, pero **están en capas distintas**:

- `fetch` es **cómo habla tu código con una API HTTP**.
- MCP es **cómo se describe y se invoca una herramienta de forma estándar entre un cliente y un servidor**.

Un servidor MCP, por dentro, normalmente **hace fetch** (o consulta una base de datos) para cumplir lo que la herramienta promete. Y tu agente propio puede hacer fetch directo sin MCP, o usar MCP para obtener herramientas, o ambas cosas.

| Situación | Recomendación |
| --- | --- |
| Tu sistema necesita llamar a una API concreta y quieres controlar todo (validación, caché, errores) | **fetch directo** dentro de tu función |
| Quieres exponer tus herramientas a múltiples clientes/harnesses de forma estándar | **Servidor MCP** (que internamente hará fetch o lo que necesite) |
| Quieres reutilizar integraciones ya existentes sin reescribirlas | **Cliente MCP** conectado a servidores existentes |
| Construyes un ecosistema donde varios agentes comparten herramientas | **MCP** |

> Nota importante: **MCP no es magia**. Un servidor MCP ejecuta código que alguien escribió. Cambiar de fetch a MCP no cambia el hecho de que la lógica real es determinista. MCP solo estandariza el *transporte* y el *descubrimiento*.

---

# Parte 5 — La verdad incómoda (conclusiones)

## §14. El rol del LLM dentro del agente

Repitámoslo sin adornos, pero con precisión:

> **El "agente" no existe como entidad con voluntad propia. Existe tu código ejecutando un bucle. El LLM dentro de ese bucle recibe texto y devuelve texto, y en ese texto va incluida la propuesta de qué hacer a continuación.**

- Toda la lógica de negocio → tu código.
- Toda la seguridad y los permisos → tu código.
- Toda la validación → tu código.
- Toda la ejecución de funciones → tu código.
- La capacidad de interpretar la petición, razonar sobre ella, elegir herramientas y redactar la respuesta → el LLM.

La sensación de que el agente "hace cosas" es producto del bucle: el texto del LLM dispara acciones en tu código, y el resultado de esas acciones vuelve como texto al LLM. Esto no es una "ilusión" en el sentido de que no ocurra nada real (el sistema completo sí actúa en el mundo); es una **división de trabajo**: el modelo propone, tu código ejecuta y controla.

## §15. Herramientas, MCP y funciones son código determinista

Cada pieza que parece "poder" del agente es, en realidad, código determinista:

| Elemento | Qué es en realidad |
| --- | --- |
| Función / tool (`get_clima`) | Una función Python que escribiste tú. |
| Catálogo de tools | Texto JSON Schema que tú envías en la petición. |
| Servidor MCP | Un proceso cuyo código alguien escribió (tú o un tercero). |
| Validación | Librerías (Pydantic/Zod) y reglas tuyas. |
| Auditor LLM | Otra llamada a un LLM, controlada por tu código. |

El LLM **describe y pide**; **nunca ejecuta**.

### 15.1. La diferencia con los harnesses (OpenCode, Claude Code, Codex, Cursor...)

Aquí está el matiz que confunde a mucha gente. Herramientas como **OpenCode**, **Claude Code**, **Codex** o **Cursor** *parecen* LLMs con poderes (editar archivos, ejecutar terminal, buscar código). ¿De dónde salen esos poderes?

> **La capacidad de actuar (editar archivos, ejecutar comandos) la trae el harness. La capacidad de usarla bien, en buena parte, la trae el modelo.**

Un harness es una aplicación que ya viene con un montón de herramientas **integradas**: acceso al sistema de archivos, ejecución de comandos de terminal, búsqueda en el código, edición de archivos, etc. Cuando el LLM "pide" editar un archivo, es el **harness** el que tiene la función `editar_archivo(...)` y la ejecuta.

Pero el modelo no es intercambiable sin consecuencias: los modelos se entrenan específicamente para trabajar con herramientas (elegir la correcta, formular bien los argumentos, interpretar errores, saber cuándo parar). Un modelo sin ese entrenamiento rendiría mucho peor en el mismo harness.

| | Harness (Claude Code, OpenCode, Codex) | Tu sistema |
| --- | --- | --- |
| ¿Quién trae las herramientas? | El harness, ya integradas. | Tú, una a una (o vía MCP). |
| ¿El LLM ejecuta algo? | No. Ejecuta el harness. | No. Ejecuta tu código. |
| ¿Qué hace el LLM? | Produce texto (y `tool_calls`): decide y propone. | Produce texto (y `tool_calls`): decide y propone. |
| ¿Dónde vive la lógica? | En el código del harness. | En tu código. |
| ¿Qué aporta el modelo? | Razonamiento y buen uso de herramientas (entrenado para ello). | Lo mismo. |

**Conclusión:** cuando construyes tu propio agente, no obtienes las herramientas del harness gratis. Tienes que programarlas (o conectarlas por MCP). El LLM que contratas por API **no incluye** filesystem, terminal ni nada parecido: solo devuelve texto.

## §16. Mini-ejemplo funcional completo + diagrama + checklist + glosario

### 16.1. Mini-ejemplo funcional completo

Un agente mínimo de clima, de principio a fin, con validación, soporte para llamadas en paralelo y manejo de errores. Usa el formato estilo OpenAI; adapta los nombres de campos si usas otro proveedor (ver §10.1).

```python
import json
import os
import requests
from pydantic import BaseModel, Field, ValidationError

# ---------- 1. La llamada cruda al LLM ----------
API_KEY = os.environ["LLM_API_KEY"]
MODELO = os.environ["LLM_MODEL"]        # usa el nombre vigente según la documentación del proveedor
URL = "https://api.openai.com/v1/chat/completions"

def llamar_llm(messages, tools=None):
    payload = {"model": MODELO, "messages": messages}
    # Nota: algunos modelos no aceptan 'temperature'; omítelo si tu modelo lo rechaza.
    if tools:
        payload["tools"] = tools
    r = requests.post(
        URL,
        headers={"Authorization": f"Bearer {API_KEY}"},
        json=payload,
        timeout=60,
    )
    r.raise_for_status()
    return r.json()["choices"][0]["message"]

# ---------- 2. La función real (determinista, tuya) ----------
class ArgsClima(BaseModel):
    latitud: float = Field(ge=-90, le=90)
    longitud: float = Field(ge=-180, le=180)

class ResultadoClima(BaseModel):
    ciudad: str
    temp_c: float

def get_clima(latitud: float, longitud: float) -> ResultadoClima:
    """Consulta TU backend y devuelve el clima (aquí simulado)."""
    # En producción:
    # r = requests.get("https://tu-backend.com/api/clima",
    #                  params={"lat": latitud, "lon": longitud}, timeout=10)
    # r.raise_for_status()
    # return ResultadoClima(**r.json())
    return ResultadoClima(ciudad="Madrid", temp_c=14.5)

FUNCIONES = {"get_clima": get_clima}
ESQUEMAS_ARGS = {"get_clima": ArgsClima}

# ---------- 3. Definición del tool (texto que se envía al LLM) ----------
TOOLS = [{
    "type": "function",
    "function": {
        "name": "get_clima",
        "description": "Devuelve la temperatura actual de una ciudad con latitud y longitud.",
        "parameters": {
            "type": "object",
            "properties": {
                "latitud": {"type": "number", "description": "Latitud en grados decimales"},
                "longitud": {"type": "number", "description": "Longitud en grados decimales"},
            },
            "required": ["latitud", "longitud"],
        },
    },
}]

SYSTEM_PROMPT = (
    "Eres un asistente de clima. Usa la herramienta get_clima cuando necesites datos reales. "
    "Nunca inventes temperaturas."
)

# ---------- 4. Ejecución segura de UNA tool call ----------
def ejecutar_tool_call(tool_call) -> str:
    """Devuelve siempre un string (JSON) con el resultado o el error."""
    try:
        nombre = tool_call["function"]["name"]
        if nombre not in FUNCIONES:
            raise ValueError(f"Herramienta desconocida: {nombre}")

        argumentos = json.loads(tool_call["function"]["arguments"])   # JSON inválido -> error
        args = ESQUEMAS_ARGS[nombre](**argumentos)                    # validación server-side
        resultado = FUNCIONES[nombre](**args.model_dump())
        return resultado.model_dump_json()
    except (ValidationError, ValueError, TypeError, KeyError, requests.RequestException) as e:
        # json.JSONDecodeError es subclase de ValueError
        return json.dumps({"error": str(e)})   # el error se le devuelve al LLM

# ---------- 5. El bucle agente ----------
def agente(pregunta: str, max_iteraciones: int = 5) -> str:
    historial = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": pregunta},
    ]

    for _ in range(max_iteraciones):          # límite para evitar bucles infinitos
        mensaje = llamar_llm(historial, tools=TOOLS)

        tool_calls = mensaje.get("tool_calls")
        if not tool_calls:
            # Respuesta final en lenguaje natural
            return mensaje.get("content") or ""

        # El LLM pidió ejecutar una o VARIAS funciones:
        historial.append(mensaje)             # mensaje del asistente completo, con todos sus tool_calls

        for tool_call in tool_calls:          # un resultado "tool" por CADA tool_call
            historial.append({
                "role": "tool",
                "tool_call_id": tool_call["id"],
                "content": ejecutar_tool_call(tool_call),
            })

    return "No pude completar la tarea dentro del límite de pasos."

# ---------- 6. Uso ----------
if __name__ == "__main__":
    print(agente("¿Qué temperatura hace en Madrid?"))
    # -> "En Madrid hace 14.5 °C."
```

### 16.2. Diagrama del flujo completo

```
                    ┌───────────────────────────────────────────────┐
                    │                 TU CÓDIGO (agente)            │
                    │                                               │
  usuario ─────────►│  historial = [system, user]                   │
                    │       │                                       │
                    │       ▼                                       │
                    │  llamar_llm(historial, tools)  ───────────────┼──►  LLM (API)
                    │       │                                       │      │
                    │       ▼                                       │◄─────┘  (devuelve texto / tool_calls)
                    │  ¿hay tool_calls?                             │
                    │    ├─ NO ─► devolver texto final al usuario   │
                    │    └─ SÍ ─► para CADA tool_call:              │
                    │              validar argumentos (server-side) │
                    │              │                                │
                    │              ▼                                │
                    │         ejecutar FUNCIONES[nombre]()          │
                    │              │   (fetch a tu API / BD / MCP)  │
                    │              ▼                                │
                    │         reinyectar resultado como role="tool" │
                    │              │                                │
                    │              └────► (volver a llamar_llm) ────┤
                    └───────────────────────────────────────────────┘
```

### 16.3. Checklist de seguridad

Antes de pasar a producción, verifica:

- [ ] La API key está en variable de entorno, nunca en el frontend ni en el repo.
- [ ] El historial se persiste en tu backend y se limita su tamaño (context window).
- [ ] Todos los argumentos que el LLM propone se validan (tipos y rangos) antes de ejecutar.
- [ ] Se manejan JSON inválido y herramientas desconocidas sin romper el bucle.
- [ ] Se responde a **todas** las tool calls de cada respuesta (llamadas en paralelo).
- [ ] El output de cada función se valida contra un esquema.
- [ ] Los errores de las funciones se devuelven al LLM (sin datos sensibles), no se ocultan.
- [ ] Ninguna acción crítica (borrar, pagar, modificar datos) se ejecuta solo porque el texto del LLM lo diga.
- [ ] Hay protección frente a inyección de prompts cuando el modelo procesa contenido externo.
- [ ] Existe un límite de iteraciones del bucle para evitar loops infinitos, y *timeouts* en todas las llamadas de red.
- [ ] Las respuestas se verifican con comprobaciones deterministas; (opcional) un LLM auditor revisa donde el error es costoso.
- [ ] No expones credenciales de APIs externas a través del LLM.
- [ ] Los nombres de modelo y parámetros se contrastan con la documentación vigente del proveedor.

### 16.4. Glosario

| Término | Definición |
| --- | --- |
| **LLM** | Modelo de lenguaje que predice el siguiente token; desde fuera, recibe texto y devuelve texto. |
| **Token** | Unidad mínima de texto (palabra o fragmento) con la que trabaja el modelo. |
| **Prompt** | Todo el texto que envías al modelo en una petición. |
| **System prompt** | Instrucciones iniciales (mensaje con `role="system"` o campo `system`) que condicionan el comportamiento. |
| **Context window** | Límite máximo de tokens que acepta el modelo en una petición. |
| **Stateless** | El modelo no guarda estado entre llamadas; hay que reenviar el historial. |
| **Tool call** | Estructura con la que el LLM *pide* ejecutar una función (nombre + argumentos). Puede haber varias en una misma respuesta. |
| **Tool / function** | Función real, escrita por ti, que ejecuta la lógica determinista. |
| **MCP** | Model Context Protocol: estándar abierto para exponer herramientas, recursos y prompts a clientes LLM. |
| **fetch** | Petición HTTP directa desde tu backend a una API externa. |
| **Harness** | Aplicación (OpenCode, Claude Code, Codex, Cursor) con herramientas ya integradas que ejecuta lo que el modelo pide. |
| **Agente** | Bucle de código que llama al LLM e interpreta su salida para ejecutar acciones, normalmente rodeado de planificación, memoria, permisos y validación. |
| **Inyección de prompts** | Ataque en el que contenido externo contiene instrucciones que intentan manipular al modelo. |

---

### Resumen en una frase

> **Un "agente de IA" es tu código ejecutando un bucle alrededor de un LLM que solo recibe y produce texto (incluidas las peticiones de herramientas); el modelo decide qué proponer, pero todo lo que realmente se ejecuta (funciones, MCP, validaciones, acceso a datos) es código determinista que tú controlas.**
