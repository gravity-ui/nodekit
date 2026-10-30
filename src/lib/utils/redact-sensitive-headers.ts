import {IncomingHttpHeaders, OutgoingHttpHeaders} from 'http';

import {prepareSensitiveKeysRedacter} from './redact-sensitive-keys';
import type {SensitiveQueryParamsRedacter} from './redact-sensitive-query-params';

// Headers of both kinds are covered, since IncomingHttpHeaders is assignable to OutgoingHttpHeaders
type HttpHeaders = OutgoingHttpHeaders;

export interface SensitiveHeadersRedacter {
    (inputHeaders?: IncomingHttpHeaders): IncomingHttpHeaders;
    (inputHeaders?: OutgoingHttpHeaders): OutgoingHttpHeaders;
}

export default function prepareSensitiveHeadersRedacter(
    sensitiveHeaders: Array<string> = [],
    headersWithSensitiveUrls: Array<string> = [],
    redactSensitiveQueryParams: SensitiveQueryParamsRedacter = (input = '') => input,
    isDevMode = false,
) {
    const headersWithSensitiveUrlsLowered = headersWithSensitiveUrls.map((name) =>
        name.toLowerCase(),
    );
    const redactSensitiveKeys = prepareSensitiveKeysRedacter(sensitiveHeaders);

    // Header value may also be multi-valued, a number or undefined, only urls can be redacted
    const redactHeaderValue = (headerValue: unknown): unknown => {
        if (Array.isArray(headerValue)) {
            return headerValue.map(redactHeaderValue);
        }

        return typeof headerValue === 'string'
            ? redactSensitiveQueryParams(headerValue)
            : headerValue;
    };

    const redactSensitiveHeaders = (inputHeaders: HttpHeaders = {}): HttpHeaders => {
        if (isDevMode) {
            return inputHeaders;
        }

        const result = redactSensitiveKeys(inputHeaders);

        Object.keys(result).forEach((headerName) => {
            if (headersWithSensitiveUrlsLowered.includes(headerName.toLowerCase())) {
                result[headerName] = redactHeaderValue(result[headerName]);
            }
        });

        return result as HttpHeaders;
    };

    return redactSensitiveHeaders as SensitiveHeadersRedacter;
}
