import { GoogleGenAI, type Content, type FunctionDeclaration } from '@google/genai';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';
import type { Llm, LlmCall, LlmContent, LlmEvent } from './llm.js';

export class GeminiLlm implements Llm {
  readonly name = config.GEMINI_MODEL;
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly systemInstruction: string,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async *stream(
    contents: LlmContent[],
    tools: FunctionDeclaration[],
    signal: AbortSignal,
  ): AsyncGenerator<LlmEvent> {
    let response: Awaited<ReturnType<typeof this.client.models.generateContentStream>>;

    try {
      response = await this.client.models.generateContentStream({
        model: config.GEMINI_MODEL,
        contents: contents as Content[],
        config: {
          systemInstruction: this.systemInstruction,
          tools: [{ functionDeclarations: tools }],
          temperature: 0.2,
          abortSignal: signal,
        },
      });
    } catch (error) {
      throw new AppError(
        'LLM_UNAVAILABLE',
        'El modelo de lenguaje no está disponible en este momento.',
        502,
        error,
      );
    }

    for await (const chunk of response) {
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      const calls: LlmCall[] = [];
      let text = '';

      for (const part of parts) {
        if (part.text) {
          text += part.text;
        }
        if (part.functionCall) {
          calls.push({
            id: part.functionCall.id,
            name: part.functionCall.name ?? '',
            args: part.functionCall.args ?? {},
            thoughtSignature: part.thoughtSignature,
          });
        }
      }

      if (text) {
        yield { type: 'text', text };
      }
      if (calls.length > 0) {
        yield { type: 'calls', calls };
      }
    }
  }
}
