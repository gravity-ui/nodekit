import type {AppConfig} from '@gravity-ui/nodekit';

const config: AppConfig = {
    appName: 'tracing-demo-app',
    appTracingEnabled: true,
    appTracingCollectorEndpoint: 'http://localhost:14268/api/traces',
};

export default config;
