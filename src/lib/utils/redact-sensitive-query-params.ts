import {URL, URLSearchParams} from 'url';

import {REDACTED_STRING} from '../consts';

export type SensitiveQueryParamsRedacter = (input?: string) => string;

// Relative urls are supported by parsing them against a base that is stripped back on serialization
const RELATIVE_URL_BASE = 'http://127.0.0.1';

function parseUrl(input: string): URL | undefined {
    try {
        return new URL(input, RELATIVE_URL_BASE);
    } catch {
        return undefined;
    }
}

function serializeUrl(parsedUrl: URL): string {
    const result = parsedUrl.toString();

    return result.startsWith(RELATIVE_URL_BASE) ? result.replace(RELATIVE_URL_BASE, '') : result;
}

function mentionsSensitiveQueryParam(input: string, sensitiveQueryParams: Array<string>): boolean {
    const loweredInput = input.toLowerCase();

    return sensitiveQueryParams.some((key) => loweredInput.includes(`${key.toLowerCase()}=`));
}

/** Redacts params in place, returns true if anything was redacted */
function redactParams(params: URLSearchParams, sensitiveQueryParams: Array<string>): boolean {
    const matchedSensitiveQueryParams = sensitiveQueryParams.filter((key) => params.has(key));

    matchedSensitiveQueryParams.forEach((key) => params.set(key, REDACTED_STRING));

    return matchedSensitiveQueryParams.length > 0;
}

/** Redacts params carried by the url fragment in place, returns true if anything was redacted */
function redactHashParams(parsedUrl: URL, sensitiveQueryParams: Array<string>): boolean {
    const hash = parsedUrl.hash.slice(1);

    if (!hash.includes('=')) {
        return false;
    }

    // Fragment may carry params directly (#access_token=...) or after a path (#/callback?token=...)
    const queryStartIndex = hash.indexOf('?');
    const pathPrefix = queryStartIndex === -1 ? '' : hash.slice(0, queryStartIndex + 1);
    const hashParams = new URLSearchParams(
        queryStartIndex === -1 ? hash : hash.slice(queryStartIndex + 1),
    );

    if (!redactParams(hashParams, sensitiveQueryParams)) {
        return false;
    }

    parsedUrl.hash = `#${pathPrefix}${hashParams.toString()}`;

    return true;
}

export default function prepareSensitiveQueryParamsRedacter(
    sensitiveQueryParams: Array<string> = [],
    isDevMode = false,
) {
    const redactSensitiveQueryParams: SensitiveQueryParamsRedacter = (input = ''): string => {
        if (isDevMode || !input || sensitiveQueryParams.length === 0) {
            return input;
        }

        const parsedUrl = parseUrl(input);

        if (!parsedUrl) {
            // Value is not a parsable url, so there is no way to redact it selectively
            return mentionsSensitiveQueryParam(input, sensitiveQueryParams)
                ? REDACTED_STRING
                : input;
        }

        const queryRedacted = redactParams(parsedUrl.searchParams, sensitiveQueryParams);
        const hashRedacted = redactHashParams(parsedUrl, sensitiveQueryParams);

        return queryRedacted || hashRedacted ? serializeUrl(parsedUrl) : input;
    };

    return redactSensitiveQueryParams;
}
