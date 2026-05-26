import { buildApp } from "./app";
import { config } from "./config";

const app = buildApp();

const start = async () => {
  try {
    app.log.info(`SERVER_HOST: ${config.server.host}`);
    app.log.info(`SERVER_PORT: ${config.server.port}`);
    app.log.info(`NODE_ENV: ${config.env}`);
    await app.listen({
      port: config.server.port,
      host: config.server.host,
    });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
