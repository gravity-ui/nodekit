export interface AppConfig {
    appName?: string;
    appVersion?: string;

    appEnv?: string;
    appInstallation?: string;

    appDevMode?: boolean;

    nkDefaultSensitiveKeys?: string[];
    appSensitiveKeys?: string[];

    appTracingEnabled?: boolean;
    appTracingServiceName?: string;
    appTracingDebugLogging?: boolean;
    appTracingSampler?: {type: string; param: number};
    appTracingAgentHost?: string;
    appTracingAgentPort?: number;

    appTelemetryChHost?: string;
    appTelemetryChPort?: string;
    appTelemetryChAuth?: string;
    appTelemetryChDatabase?: string;
    appTelemetryChTables?: {[name: string]: {[name: string]: 'number' | 'string' | 'timestamp'}};
    appTelemetryChBatchSize?: number;
    appTelemetryChBacklogSize?: number;
    appTelemetryChMirrorToLogs?: boolean;
}

export interface AppContextParams {}

export interface AppDynamicConfig {}

export type Dict = {[key: string]: unknown};

export interface ShutdownHandler {
    (signal: 'SIGTERM' | 'SIGINT'): Promise<unknown> | void;
}
export interface TelemetryClickhouseTableDescription {
    [name: string]: 'number' | 'string' | 'timestamp';
}
