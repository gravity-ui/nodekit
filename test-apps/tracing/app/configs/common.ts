import type {AppConfig} from '@gravity-ui/nodekit';

const config: AppConfig = {
    appName: 'tracing-demo-app',
    appVersion: '1.0.0',
    appTracingEnabled: true,
    appTracingCollectorEndpoint: 'http://localhost:14268/api/traces',
    appTracingDebugLogging: true,
};

export default config;
