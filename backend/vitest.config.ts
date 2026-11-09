import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      MOCK_LLM: 'true',
      EXTERNAL_API_WARMUP: 'false',
      GEMINI_API_KEY: '',
      LOG_LEVEL: 'error',
      RATE_LIMIT_MAX: '100',
      WRITE_RATE_LIMIT_MAX: '60',
    },
  },
});
