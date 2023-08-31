import {IncomingHttpHeaders} from 'http';

import {Dict} from '../../types';

import {prepareSensitiveKeysRedacter} from './redact-sensitive-keys';

export type SensitiveHeadersRedacter = (inputHeaders: Dict | IncomingHttpHeaders) => Dict;

export default function prepareSensitiveHeadersRedacter(
    sensitiveHeaders: Array<string> = [],
    headersWithSensitiveUrls: Array<string> = [],
    redactSensitiveQueryParams: (input: string) => string = (input) => input,
    isDevMode = false,
) {
    const redactSensitiveHeaders: SensitiveHeadersRedacter = (inputHeaders) => {
        if (isDevMode) {
            return inputHeaders;
        }

        const redactSensitiveKeys = prepareSensitiveKeysRedacter(sensitiveHeaders);

        const result = redactSensitiveKeys(inputHeaders);

        Object.keys(result).forEach((headerName) => {
            if (headersWithSensitiveUrls.includes(headerName.toLowerCase())) {
                result[headerName] = redactSensitiveQueryParams(result[headerName] as string);
            }
        });

        return result;
    };
    return redactSensitiveHeaders;
}
