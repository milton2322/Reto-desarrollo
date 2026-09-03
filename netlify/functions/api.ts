import serverless from 'serverless-http';
import { createApp } from '../../src/server.js';

const handlerPromise = createApp(process.cwd(), '/tmp/registro-proveedor').then((app) => serverless(app));

export const handler = async (...args: Parameters<Awaited<typeof handlerPromise>>) => {
  const serverlessHandler = await handlerPromise;
  return serverlessHandler(...args);
};
