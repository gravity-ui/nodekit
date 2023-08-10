import {URL} from 'url';
import {Dict} from '../../types';
import {prepareSensitiveKeysRedacter} from './redact-sensitive-keys';

export type SensitiveQueryParamsRedacter = (input?: string) => string;

export default function prepareSensitiveQueryParamsRedacter(
    sensitiveQueryParams: Array<string> = [],
    isDevMode = false,
) {
    const redactSensitiveQueryParams: SensitiveQueryParamsRedacter = (input = ''): string => {
        if (isDevMode || !input) {
            return input;
        }

        if (sensitiveQueryParams.length === 0) {
            return input;
        }

        const defaultBase = 'http://127.0.0.1';
        const parsedUrl = new URL(input, defaultBase);

        const matchedSensitiveQueryParams = sensitiveQueryParams.reduce<Dict>((acc, key) => {
            if (parsedUrl.searchParams.has(key)) {
                acc[key] = parsedUrl.searchParams.get(key);
            }
            return acc;
        }, {});

        if (Object.keys(matchedSensitiveQueryParams).length === 0) {
            return input;
        }

        const redactSensitiveKeys = prepareSensitiveKeysRedacter(sensitiveQueryParams);
        const redactedSensitiveQueryParams = redactSensitiveKeys(matchedSensitiveQueryParams);

        Object.keys(redactedSensitiveQueryParams).forEach((key) => {
            parsedUrl.searchParams.set(key, redactedSensitiveQueryParams[key] as string);
        });

        const resultUrl = parsedUrl.toString();

        return resultUrl.startsWith(defaultBase) ? resultUrl.replace(defaultBase, '') : resultUrl;
    };

    return redactSensitiveQueryParams;
}
