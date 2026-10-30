import {REDACTED_STRING} from '../consts';

export type SensitiveQueryParamsRedacter = (input?: string) => string;

const PARAMS_SEPARATOR = '&';
// Percent-encoded, so that the result stays a valid url and decodes back to REDACTED_STRING
const REDACTED_VALUE = encodeURIComponent(REDACTED_STRING);
// A param is started by any url delimiter, not just by `&`: `#access_token=...`, `/cb;token=...`,
// `#/folder/id=5?token=...`. Anchoring the key to a delimiter keeps `csrf_token` out of `token`
const PARAM_KEY_PATTERN = /(?:^|[?;/#])([^=&?;/#]*)=/g;

function decodeParamKey(rawKey: string): string {
    try {
        return decodeURIComponent(rawKey.replace(/\+/g, ' '));
    } catch {
        // Malformed encoding, the raw key is still worth matching
        return rawKey;
    }
}

/**
 * `qs` style params carry the name in brackets: `token[]=`, `token[0]=`, `auth[token]=`. Every
 * bracketed segment is a name on its own, and is still compared whole, so that a merely similar
 * name like `csrf_token` keeps being left alone.
 */
function getParamKeyNames(rawKey: string): Array<string> {
    const key = decodeParamKey(rawKey).toLowerCase();

    return key.includes('[') ? key.split(/[[\]]/).filter(Boolean) : [key];
}

/**
 * Redacts values of sensitive params of an `&`-separated part. A value is taken up to the next `#`
 * or to the end of the part, since a nested `?`, `;` or `/` may well belong to it.
 */
function redactParamsPart(part: string, loweredSensitiveParams: Array<string>): string {
    // Matching the whole part upfront would skip keys that only match once decoded
    for (const match of part.matchAll(PARAM_KEY_PATTERN)) {
        const keyNames = getParamKeyNames(match[1]);

        if (keyNames.some((keyName) => loweredSensitiveParams.includes(keyName))) {
            const valueStartIndex = match.index + match[0].length;
            const fragmentStartIndex = part.indexOf('#', valueStartIndex);
            const redactedHead = `${part.slice(0, valueStartIndex)}${REDACTED_VALUE}`;

            return fragmentStartIndex === -1
                ? redactedHead
                : redactedHead +
                      redactParamsPart(part.slice(fragmentStartIndex), loweredSensitiveParams);
        }
    }

    return part;
}

export default function prepareSensitiveQueryParamsRedacter(
    sensitiveQueryParams: Array<string> = [],
    isDevMode = false,
) {
    const loweredSensitiveQueryParams = sensitiveQueryParams.map((key) => key.toLowerCase());

    const redactSensitiveQueryParams: SensitiveQueryParamsRedacter = (input = ''): string => {
        if (isDevMode || !input || loweredSensitiveQueryParams.length === 0) {
            return input;
        }

        // Params are found by hand rather than by parsing the input into an URL and serializing it
        // back: a round-trip needs a base to resolve relative urls against, and can then only
        // guess how to strip it off again. Everything but a redacted value is kept byte-for-byte
        return input
            .split(PARAMS_SEPARATOR)
            .map((part) => redactParamsPart(part, loweredSensitiveQueryParams))
            .join(PARAMS_SEPARATOR);
    };

    return redactSensitiveQueryParams;
}
