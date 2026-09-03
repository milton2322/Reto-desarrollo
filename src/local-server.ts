import { createApp } from './server.js';

const app = await createApp();

app.listen(Number(process.env.PORT ?? 3000), () => {
  console.log(`API disponible en http://localhost:${process.env.PORT ?? 3000}`);
});
