import {IncomingHttpHeaders, OutgoingHttpHeaders} from 'http';

import {prepareSensitiveKeysRedacter} from './redact-sensitive-keys';

type HttpHeaders = IncomingHttpHeaders | OutgoingHttpHeaders;

export type SensitiveHeadersRedacter = <T extends HttpHeaders = IncomingHttpHeaders>(
    inputHeaders?: T,
) => T;

export default function prepareSensitiveHeadersRedacter(
    sensitiveHeaders: Array<string> = [],
    headersWithSensitiveUrls: Array<string> = [],
    redactSensitiveQueryParams: (input: string) => string = (input) => input,
    isDevMode = false,
) {
    const headersWithSensitiveUrlsLowered = headersWithSensitiveUrls.map((name) =>
        name.toLowerCase(),
    );
    const redactSensitiveKeys = prepareSensitiveKeysRedacter(sensitiveHeaders);

    const redactSensitiveHeaders: SensitiveHeadersRedacter = <T extends HttpHeaders>(
        inputHeaders: T = {} as T,
    ) => {
        if (isDevMode) {
            return inputHeaders;
        }

        const result = redactSensitiveKeys(inputHeaders);

        Object.keys(result).forEach((headerName) => {
            if (headersWithSensitiveUrlsLowered.includes(headerName.toLowerCase())) {
                result[headerName] = redactSensitiveQueryParams(result[headerName] as string);
            }
        });

        return result as T;
    };
    return redactSensitiveHeaders;
}
