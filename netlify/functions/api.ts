import serverless from 'serverless-http';
import { createApp } from '../../src/server.js';

const app = await createApp(process.cwd());

export const handler = serverless(app);
