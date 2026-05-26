import pino from "pino";
import { FastifyLoggerOptions } from "fastify";
import { config } from ".";

const prettyPrintConfig = {
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
    },
  },
};

const generateRequestId = (req: any): string =>
  (req.headers["x-request-id"] as string) ||
  `req-${Math.random().toString(36).substring(2, 10)}`;

const loggerFactory = {
  getLogger() {
    return pino({
      level: config.logLevel || "info",
      ...(config.env === "local" && prettyPrintConfig),
    });
  },

  createFastifyConfig(): FastifyLoggerOptions {
    const env = config.env || "local";
    const level = config.logLevel || "info";

    return {
      level,
      genReqId: generateRequestId,
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url,
            path: request.raw.url,
          };
        },
        res(response) {
          return {
            statusCode: response.statusCode,
          };
        },
        err(error) {
          return {
            type: error.name,
            message: error.message,
            stack: error.stack || "",
          };
        },
      },
      ...(env === "local" && prettyPrintConfig),
    };
  },
};

export const logger = loggerFactory.getLogger();
export const fastifyLogger = loggerFactory.createFastifyConfig();
