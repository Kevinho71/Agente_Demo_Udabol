import { AppError } from '../lib/errors.js';
import { describeWrite, type ApiCallResult, type ApiExecutor, type PreparedCall } from './executor.js';
import type { Llm, LlmCall, LlmContent, LlmContentPart } from './llm.js';
import { SYSTEM_PROMPT, truncateForModel } from './prompt.js';
import { toolPayload, type TableView } from './summarize.js';
import type { ChatMessage } from './sessions.js';
import { buildFunctionDeclarations } from './tools.js';
import { createPendingAction, MAX_BATCH_ITEMS } from './pending-actions.js';
import { applySingularIntent } from './intent.js';
import type { FunctionDeclaration } from '@google/genai';

export type AgentEvent =
  | { type: 'token'; text: string }
  | {
      type: 'tool_start';
      callId: string;
      endpointId: string;
      method: string;
      path: string;
    }
  | {
      type: 'tool_end';
      callId: string;
      endpointId: string;
      ok: boolean;
      httpStatus: number | null;
      durationMs: number;
      itemCount: number | null;
      data?: unknown;
      view?: TableView;
      error?: string;
    }
  | {
      type: 'confirm_required';
      actionId: string;
      endpointId: string;
      method: string;
      path: string;
      items: Record<string, unknown>[];
      count: number;
    }
  | { type: 'done'; text: string };

export const MAX_RESULT_ITEMS = 50;

function buildContents(history: ChatMessage[], userMessage: string): LlmContent[] {
  const contents: LlmContent[] = history.map((message) => ({
    role: message.role,
    parts: [{ text: message.text }],
  }));

  contents.push({ role: 'user', parts: [{ text: userMessage }] });
  return contents;
}

function resultForFrontend(result: ApiCallResult): unknown {
  if (!result.ok || result.data === null) return undefined;
  if (Array.isArray(result.data)) {
    return result.data.slice(0, MAX_RESULT_ITEMS);
  }
  return result.data;
}

export interface RunAgentOptions {
  llm: Llm;
  executor: ApiExecutor;
  history: ChatMessage[];
  userMessage: string;
  sessionId: string;
  maxSteps: number;
  signal: AbortSignal;
  tools?: FunctionDeclaration[];
}

export async function* runAgent({
  llm,
  executor,
  history,
  userMessage,
  sessionId,
  maxSteps,
  signal,
  tools = buildFunctionDeclarations(),
}: RunAgentOptions): AsyncGenerator<AgentEvent> {
  const contents = buildContents(history, userMessage);
  let finalText = '';

  for (let step = 1; step <= maxSteps; step += 1) {
    const calls: LlmCall[] = [];
    let stepText = '';

    for await (const event of llm.stream(contents, tools, signal)) {
      if (event.type === 'text') {
        stepText += event.text;
        yield { type: 'token', text: event.text };
      } else {
        calls.push(...event.calls);
      }
    }

    finalText += stepText;

    if (calls.length === 0) {
      if (!stepText.trim()) {
        throw new AppError(
          'LLM_UNAVAILABLE',
          'El modelo no devolvió una respuesta. Intenta reformular la pregunta.',
          502,
        );
      }
      yield { type: 'done', text: finalText.trim() };
      return;
    }

    contents.push({
      role: 'model',
      parts: calls.map((call) => ({
        functionCall: {
          id: call.id,
          name: call.name,
          args: call.args ?? {},
        },
        ...(call.thoughtSignature ? { thoughtSignature: call.thoughtSignature } : {}),
      })),
    });

    const responses: LlmContentPart[] = [];
    const writes: Array<{ prepared: PreparedCall; summary: Record<string, unknown> }> = [];

    for (const [index, call] of calls.entries()) {
      const callId = call.id ?? `call_${step}_${index + 1}`;
      let endpoint;

      try {
        endpoint = executor.describe(call.name);
      } catch {
        const message = `La acción "${call.name}" no existe en el mapa de endpoints.`;
        responses.push({
          functionResponse: {
            id: callId,
            name: call.name,
            response: { ok: false, error: message },
          },
        });
        continue;
      }

      let prepared;
      try {
        prepared = executor.prepare(call.name, call.args);
      } catch (error) {
        const message =
          error instanceof AppError ? error.message : 'Los argumentos de la acción son inválidos.';
        responses.push({
          functionResponse: {
            id: callId,
            name: call.name,
            response: { ok: false, error: message },
          },
        });
        continue;
      }

      applySingularIntent(userMessage, prepared);

      if (endpoint.effects === 'write' && endpoint.confirm) {
        writes.push({ prepared, summary: describeWrite(prepared) });
        continue;
      }

      yield {
        type: 'tool_start',
        callId,
        endpointId: endpoint.id,
        method: endpoint.method,
        path: endpoint.path,
      };

      const result = await executor.executePrepared(prepared, signal);

      yield {
        type: 'tool_end',
        callId,
        endpointId: result.endpointId,
        ok: result.ok,
        httpStatus: result.status,
        durationMs: result.durationMs,
        itemCount: result.itemCount,
        data: resultForFrontend(result),
        view: result.view,
        error: result.error,
      };

      responses.push({
        functionResponse: {
          id: callId,
          name: call.name,
          response: truncateForModel(toolPayload(result)) as Record<string, unknown>,
        },
      });
    }

    if (writes.length > 0) {
      if (writes.length > MAX_BATCH_ITEMS) {
        throw new AppError(
          'INVALID_ARGUMENTS',
          `No se pueden crear más de ${MAX_BATCH_ITEMS} productos en una misma confirmación.`,
          400,
        );
      }

      const action = createPendingAction({ sessionId, items: writes });
      const first = writes[0]!.prepared;

      yield {
        type: 'confirm_required',
        actionId: action.id,
        endpointId: action.endpointId,
        method: action.method,
        path: action.path,
        items: writes.map((write) => write.summary),
        count: writes.length,
      };
      return;
    }

    contents.push({ role: 'user', parts: responses });
  }

  throw new AppError(
    'MAX_STEPS',
    'La consulta necesitó demasiados pasos. Prueba con una pregunta más concreta.',
    422,
  );
}

export { SYSTEM_PROMPT };
