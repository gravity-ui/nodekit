import {DiagLogLevel, diag} from '@opentelemetry/api';
import {OTLPTraceExporter} from '@opentelemetry/exporter-trace-otlp-http';
import {NodeSDK, core, resources, tracing} from '@opentelemetry/sdk-node';
import {ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION} from '@opentelemetry/semantic-conventions';
import type pino from 'pino';
import type {AppConfig} from '../../types';
import {DEFAULT_COLLECTOR_HOST} from '../consts';
import {createPinoDiagLogger} from './pino-diag-logger';

const textMapPropagator = new core.CompositePropagator({
    propagators: [new core.W3CTraceContextPropagator(), new core.W3CBaggagePropagator()],
});

export const getTracingServiceName = (config: AppConfig) =>
    config?.appTracingServiceName || String(config.appName);

export const initTracing = (config: AppConfig, logger: pino.Logger) => {
    const {
        appVersion,
        appTracingSampler,
        appTracingInstrumentations,
        appTracingCollectorEndpoint,
        appTracingDebugLogging,
        appTracingSpanExporter,
    } = config;

    const sdk = new NodeSDK({
        resource: new resources.Resource({
            [ATTR_SERVICE_NAME]: getTracingServiceName(config),
            [ATTR_SERVICE_VERSION]: appVersion,
        }),
        traceExporter:
            appTracingSpanExporter ||
            new OTLPTraceExporter({
                url: appTracingCollectorEndpoint || DEFAULT_COLLECTOR_HOST,
            }),
        textMapPropagator,
        sampler: appTracingSampler || new tracing.TraceIdRatioBasedSampler(1),
        instrumentations: appTracingInstrumentations,
    });

    if (appTracingDebugLogging) {
        diag.setLogger(createPinoDiagLogger(logger), DiagLogLevel.DEBUG);
    }

    sdk.start();

    return sdk;
};
