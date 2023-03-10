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
}

export interface AppContextParams {}

export type Dict = {[key: string]: unknown};

export interface ShutdownHandler {
    (): Promise<void>;
}
