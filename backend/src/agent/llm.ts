import type { FunctionDeclaration } from '@google/genai';

export interface LlmCall {
  id?: string;
  name: string;
  args?: Record<string, unknown>;
  /**
   * Gemini 3 exige devolver la firma del pensamiento junto con cada
   * functionCall al reenviar el historial. Sin ella responde 400.
   */
  thoughtSignature?: string;
}

export type LlmContentPart =
  | { text: string }
  | {
      functionCall: { id?: string; name: string; args?: Record<string, unknown> };
      thoughtSignature?: string;
    }
  | {
      functionResponse: {
        id?: string;
        name: string;
        response: Record<string, unknown>;
      };
    };

export interface LlmContent {
  role: 'user' | 'model';
  parts: LlmContentPart[];
}

export type LlmEvent =
  | { type: 'text'; text: string }
  | { type: 'calls'; calls: LlmCall[] };

export interface Llm {
  readonly name: string;
  stream(
    contents: LlmContent[],
    tools: FunctionDeclaration[],
    signal: AbortSignal,
  ): AsyncGenerator<LlmEvent>;
}
