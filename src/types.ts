import type {pino} from 'pino';

import {REQUEST_ID_PARAM_NAME} from './lib/consts';
import type {LoggingLevel} from './lib/logging';

export interface AppConfig {
    appName?: string;
    appVersion?: string;

    appEnv?: string;
    appInstallation?: string;

    appDevMode?: boolean;

    nkDefaultSensitiveKeys?: string[];
    nkDefaultSensitiveHeaders?: string[];
    nkDefaultHeadersWithSensitiveUrls?: string[];
    nkDefaultSensitiveQueryParams?: string[];

    appSensitiveKeys?: string[];
    appSensitiveHeaders?: string[];
    appHeadersWithSensitiveUrls?: string[];
    appSensitiveQueryParams?: string[];

    appLoggingDestination?: pino.DestinationStream;
    appLoggingLevel?: LoggingLevel;

    appTracingEnabled?: boolean;
    appTracingServiceName?: string;
    appTracingDebugLogging?: boolean;
    appTracingSampler?: {type: string; param: number};
    appTracingAgentHost?: string;
    appTracingAgentPort?: number;
    appTracingCollectorEndpoint?: string;

    appTelemetryChHost?: string;
    appTelemetryChPort?: string;
    appTelemetryChAuth?: string;
    appTelemetryChDatabase?: string;
    appTelemetryChTables?: {[name: string]: {[name: string]: 'number' | 'string' | 'timestamp'}};
    appTelemetryChBatchSize?: number;
    appTelemetryChBacklogSize?: number;
    appTelemetryChMirrorToLogs?: boolean;
}

export interface AppContextParams {
    [REQUEST_ID_PARAM_NAME]?: string;
}

export interface AppDynamicConfig {}

export type Dict = {[key: string]: unknown};

export interface ShutdownHandler {
    (signal: 'SIGTERM' | 'SIGINT'): Promise<unknown> | void;
}
export interface TelemetryClickhouseTableDescription {
    [name: string]: 'number' | 'string' | 'timestamp';
}
