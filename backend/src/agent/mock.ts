import type { Llm, LlmContent, LlmEvent } from './llm.js';

/**
 * Modelo falso para desarrollo y tests: no gasta cuota y permite probar
 * el streaming y el rastreo de herramientas de punta a punta.
 */
export class MockLlm implements Llm {
  readonly name = 'mock';

  async *stream(contents: LlmContent[]): AsyncGenerator<LlmEvent> {
    const last = contents[contents.length - 1];
    const alreadyCalled = contents.some((content) =>
      content.parts.some((part) => 'functionResponse' in part),
    );
    const lastResponse = [...contents]
      .reverse()
      .flatMap((content) => content.parts)
      .find((part) => 'functionResponse' in part);

    if (lastResponse && 'functionResponse' in lastResponse) {
      const response = lastResponse.functionResponse.response as {
        count?: number;
        summary?: { inventoryValue?: number; lowStockCount?: number };
      };
      const count = response.count ?? 0;
      const amount = new Intl.NumberFormat('es-BO').format(
        response.summary?.inventoryValue ?? 0,
      );
      const text = `En el catálogo hay ${count} productos. El valor total del inventario es ${amount} y ${response.summary?.lowStockCount ?? 0} tienen stock bajo. (Respuesta de prueba, sin Gemini.)`;
      for (const word of text.split(' ')) {
        yield { type: 'text', text: `${word} ` };
      }
      return;
    }

    const lastText =
      last?.parts.map((part) => ('text' in part ? part.text : '')).join(' ') ?? '';

    if (!alreadyCalled && /producto|caro|stock|inventario|catálogo/i.test(lastText)) {
      yield {
        type: 'calls',
        calls: [{ id: 'mock-call-1', name: 'list_products', args: {} }],
      };
      return;
    }

    yield {
      type: 'text',
      text: 'Puedo consultar el catálogo de productos: totales, precios, stock y disponibilidad. Prueba con "¿qué productos hay?" o "¿cuáles son los 3 más caros?". (Respuesta de prueba, sin Gemini.)',
    };
  }
}
