import pino from 'pino';

interface InitLoggerOptions {
    appName: string;
    devMode: boolean;
}

export function initLogger({appName, devMode}: InitLoggerOptions) {
    const transportConfig = devMode
        ? {
              target: 'pino-pretty',
              options: {
                  colorize: true,
                  ignore: 'pid,hostname,name',
                  translateTime: 'HH:MM:ss Z',
              },
          }
        : undefined;

    return pino({
        name: appName,
        safe: true,
        leve: 'debug',
        serializers: {
            error: pino.stdSerializers.err,
        },
        transport: transportConfig,
    });
}
