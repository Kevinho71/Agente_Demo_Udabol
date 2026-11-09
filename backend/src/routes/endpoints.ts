import { Router } from 'express';
import { endpointsFile, publicEndpoints } from '../agent/registry.js';

export const endpointsRouter = Router();

endpointsRouter.get('/api/endpoints', (_req, res) => {
  res.json({
    api: {
      name: endpointsFile.api.name,
      description: endpointsFile.api.description,
      docsUrl: endpointsFile.api.docsUrl ?? null,
    },
    endpoints: publicEndpoints(),
  });
});
