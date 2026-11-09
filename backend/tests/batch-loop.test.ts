import { describe, expect, it } from 'vitest';
import { runAgent, type AgentEvent } from '../src/agent/loop.js';
import { ApiExecutor } from '../src/agent/executor.js';
import type { Llm, LlmEvent } from '../src/agent/llm.js';

class BatchLlm implements Llm {
  readonly name = 'batch-test';

  async *stream(): AsyncGenerator<LlmEvent> {
    yield {
      type: 'calls',
      calls: [
        { id: 'a', name: 'create_product', args: { name: 'Batch A', price: 1, stock: 1 } },
        { id: 'b', name: 'create_product', args: { name: 'Batch B', price: 2, stock: 2 } },
        { id: 'c', name: 'create_product', args: { name: 'Batch C', price: 3, stock: 3 } },
      ],
    };
  }
}

describe('batch de escrituras', () => {
  it('agrupa varias llamadas create_product en una sola confirmación', async () => {
    const events: AgentEvent[] = [];

    for await (const event of runAgent({
      llm: new BatchLlm(),
      executor: new ApiExecutor(),
      history: [],
      userMessage: 'crea Batch A, Batch B y Batch C',
      sessionId: `batch-loop-${Date.now()}`,
      maxSteps: 3,
      signal: new AbortController().signal,
    })) {
      events.push(event);
    }

    const confirmation = events.find((event) => event.type === 'confirm_required');

    expect(confirmation).toBeDefined();
    if (confirmation?.type !== 'confirm_required') return;

    expect(confirmation.count).toBe(3);
    expect(confirmation.items).toHaveLength(3);
    expect(confirmation.items[0]).toMatchObject({ name: 'Batch A', price: 1, stock: 1 });
    expect(events.some((event) => event.type === 'tool_start')).toBe(false);
  });
});
