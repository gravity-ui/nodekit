import type {pino} from 'pino';

import type {NodeSDKConfiguration} from '@opentelemetry/sdk-node';

import {REQUEST_ID_PARAM_NAME, USER_ID_PARAM_NAME, USER_LANGUAGE_PARAM_NAME} from './lib/consts';
import type {LoggingLevel, NodeKitLogger} from './lib/logging';

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
    appLogger?: NodeKitLogger;

    appTracingEnabled?: boolean;
    /**
     * Service name for all created spans.
     * @default appName from AppConfig
     */
    appTracingServiceName?: string;
    /**
     * Enable debug for tracing with {@link DiagLogLevel.DEBUG}. Will be printed with pino.
     * @default false
     */
    appTracingDebugLogging?: boolean;
    /**
     * Tracing sampler. By default write all spans.
     * @default tracing.TraceIdRatioBasedSampler(1)
     */
    appTracingSampler?: NodeSDKConfiguration['sampler'];
    /**
     * Tracing span exporter. By default write all spans.
     * @default OTLPTraceExporter({ url: appTracingCollectorEndpoint }
     */
    appTracingSpanExporter?: NodeSDKConfiguration['traceExporter'];
    /**
     * Additional autoinstrumentations.
     * @default []
     */
    appTracingInstrumentations?: NodeSDKConfiguration['instrumentations'];
    /**
     * Tracing collector endpoint.
     * @default http://localhost:4318/v1/traces
     */
    appTracingCollectorEndpoint?: string;
    /**
     * Protocols to transport trace data.
     * https://opentelemetry.io/docs/languages/js/exporters/#otlp-dependencies
     * @default HTTP/JSON
     */
    appTracingCollectorProtocol?: 'HTTP/JSON' | 'HTTP/Proto' | 'gRPC';
    /**
     * Disable TLS for gRPC protocol.
     * @default undefined
     */
    appTracingDisableTLS?: boolean | undefined;

    appTelemetryChHost?: string;
    appTelemetryChPort?: string;
    appTelemetryChAuth?: string;
    appTelemetryChDatabase?: string;
    appTelemetryChTables?: {[name: string]: {[name: string]: 'number' | 'string' | 'timestamp'}};
    appTelemetryChSendInterval?: number;
    appTelemetryChBatchSize?: number;
    appTelemetryChBacklogSize?: number;
    appTelemetryChMirrorToLogs?: boolean;

    // Generic HTTP connector (sidecar agent, edge proxy, custom receiver, etc.)
    appTelemetryHttpUrl?: string;
    appTelemetryHttpHeaders?: {[name: string]: string};
    appTelemetryHttpBatchSize?: number;
    appTelemetryHttpSendInterval?: number;
    appTelemetryHttpBacklogSize?: number;
    appTelemetryHttpRequestTimeout?: number;
    appTelemetryHttpTableHeader?: string;
    appTelemetryHttpMirrorToLogs?: boolean;

    // Kinesis API connector (AWS Kinesis, Kinesis-compatible endpoints)
    appTelemetryKinesisEndpoint?: string;
    appTelemetryKinesisStreamName?: string;
    appTelemetryKinesisRegion?: string;
    appTelemetryKinesisAuth?: TelemetryKinesisAuthConfig;
    appTelemetryKinesisBatchSize?: number;
    appTelemetryKinesisSendInterval?: number;
    appTelemetryKinesisBacklogSize?: number;
    appTelemetryKinesisMaxRecordsPerRequest?: number;
    appTelemetryKinesisMaxRequestSizeBytes?: number;
    appTelemetryKinesisMaxRecordSizeBytes?: number;
    appTelemetryKinesisRequestTimeout?: number;
    appTelemetryKinesisMirrorToLogs?: boolean;

    // Logs connector (writes telemetry events into the application logger with a marker)
    appTelemetryLogsEnabled?: boolean;
    appTelemetryLogsSampleRate?: number;
    appTelemetryLogsLevel?: 'trace' | 'debug' | 'info' | 'warn' | 'error';
    appTelemetryLogsNamespace?: string;
    appTelemetryLogsRandom?: () => number;
}

export type TelemetryKinesisAuthConfig =
    | {type: 'iam'; token: string}
    | {type: 'iam-provider'; getToken: () => Promise<string> | string}
    | {type: 'sigv4'; accessKeyId: string; secretAccessKey: string; sessionToken?: string};

export interface AppContextParams {
    [REQUEST_ID_PARAM_NAME]?: string;
    [USER_ID_PARAM_NAME]?: string;
    [USER_LANGUAGE_PARAM_NAME]?: string;
}

export interface AppDynamicConfig {}

export type Dict = {[key: string]: unknown};

export interface ShutdownHandler {
    (signal: 'SIGTERM' | 'SIGINT'): Promise<unknown> | void;
}
export interface TelemetryClickhouseTableDescription {
    [name: string]: 'number' | 'string' | 'timestamp';
}
export {SpanKind} from '@opentelemetry/api';
