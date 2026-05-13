import {credentials} from '@grpc/grpc-js';
import {DiagLogLevel, diag} from '@opentelemetry/api';
import {OTLPTraceExporter as OTLPTraceExporterHTTP} from '@opentelemetry/exporter-trace-otlp-http';
import {OTLPTraceExporter as OTLPTraceExporterProto} from '@opentelemetry/exporter-trace-otlp-proto';
import {OTLPTraceExporter as OTLPTraceExporterGRPC} from '@opentelemetry/exporter-trace-otlp-grpc';
import {JaegerPropagator} from '@opentelemetry/propagator-jaeger';
import {NodeSDK, core, resources, tracing} from '@opentelemetry/sdk-node';
import {ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION} from '@opentelemetry/semantic-conventions';
import type {AppConfig} from '../../types';
import {createNodekitDiagLogger} from './nodekit-diag-logger';
import {PinoLogRecordProcessor} from './pino-log-record-processor';
import type {NodeKitLogger} from '../logging';
import {prepareSensitiveKeysRedacter} from '../utils/redact-sensitive-keys';

const textMapPropagator = new core.CompositePropagator({
    propagators: [
        new core.W3CTraceContextPropagator(),
        new core.W3CBaggagePropagator(),
        new JaegerPropagator(),
    ],
});

export const getTracingServiceName = (config: AppConfig) =>
    config?.appTracingServiceName || String(config.appName);

export const initTracing = (config: AppConfig, logger: NodeKitLogger) => {
    const {
        appVersion,
        appTracingSampler,
        appTracingInstrumentations,
        appTracingCollectorEndpoint,
        appTracingDebugLogging,
        appTracingSpanExporter,
        appTracingCollectorProtocol,
        appTracingDisableTLS,
        experimentalAppTracingLogsBridge,
    } = config;

    let tracingSpanExporter: tracing.SpanExporter;

    if (appTracingSpanExporter) {
        tracingSpanExporter = appTracingSpanExporter;
    } else if (appTracingCollectorProtocol === 'HTTP/Proto') {
        tracingSpanExporter = new OTLPTraceExporterProto({
            url: appTracingCollectorEndpoint,
        });
    } else if (appTracingCollectorProtocol === 'gRPC') {
        tracingSpanExporter = new OTLPTraceExporterGRPC({
            url: appTracingCollectorEndpoint,
            credentials: appTracingDisableTLS ? credentials.createInsecure() : undefined,
        });
    } else {
        tracingSpanExporter = new OTLPTraceExporterHTTP({
            url: appTracingCollectorEndpoint,
        });
    }

    const sdk = new NodeSDK({
        resource: resources.resourceFromAttributes({
            [ATTR_SERVICE_NAME]: getTracingServiceName(config),
            [ATTR_SERVICE_VERSION]: appVersion,
        }),
        traceExporter: tracingSpanExporter,
        textMapPropagator,
        sampler: appTracingSampler || new tracing.TraceIdRatioBasedSampler(1),
        instrumentations: appTracingInstrumentations,
        ...(experimentalAppTracingLogsBridge && {
            logRecordProcessors: [
                new PinoLogRecordProcessor(
                    logger,
                    prepareSensitiveKeysRedacter(
                        config.nkDefaultSensitiveKeys?.concat(config.appSensitiveKeys ?? []),
                    ),
                ),
            ],
        }),
    });

    if (appTracingDebugLogging) {
        diag.setLogger(createNodekitDiagLogger(logger), DiagLogLevel.DEBUG);
    }

    sdk.start();

    return {sdk, tracingSpanExporter};
};
