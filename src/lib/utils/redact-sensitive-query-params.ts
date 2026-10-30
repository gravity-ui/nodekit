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
 * `qs` style params carry the name in brackets, which is read as a path of names:
 * `auth[token][0]=` means `auth` → `token` → `0`.
 */
function getParamKeyPath(rawKey: string): Array<string> {
    const key = decodeParamKey(rawKey).toLowerCase();

    return key.includes('[') ? key.split(/[[\]]/).filter(Boolean) : [key];
}

/**
 * A configured name matches when its own path runs through the path of the key, so that both
 * `token` and `auth[token]` match `auth[token][0]=`. Names are compared whole, which leaves a
 * merely similar `csrf_token` alone.
 */
function matchesKeyPath(keyPath: Array<string>, sensitiveNamePath: Array<string>): boolean {
    return keyPath.some((_, startIndex) =>
        sensitiveNamePath.every((name, offset) => keyPath[startIndex + offset] === name),
    );
}

/**
 * Redacts values of sensitive params of an `&`-separated part. A value is taken up to the next `#`
 * or to the end of the part, since a nested `?`, `;` or `/` may well belong to it.
 */
function redactParamsPart(part: string, sensitiveNamePaths: Array<Array<string>>): string {
    let redacted = '';
    let copiedUntilIndex = 0;
    let valueEndIndex = 0;

    // Matching the whole part upfront would skip keys that only match once decoded
    for (const match of part.matchAll(PARAM_KEY_PATTERN)) {
        const keyPath = getParamKeyPath(match[1]);

        if (
            match.index >= valueEndIndex &&
            sensitiveNamePaths.some((namePath) => matchesKeyPath(keyPath, namePath))
        ) {
            const valueStartIndex = match.index + match[0].length;
            const fragmentStartIndex = part.indexOf('#', valueStartIndex);

            redacted += `${part.slice(copiedUntilIndex, valueStartIndex)}${REDACTED_VALUE}`;
            valueEndIndex = fragmentStartIndex === -1 ? part.length : fragmentStartIndex;
            copiedUntilIndex = valueEndIndex;
        }
    }

    return redacted + part.slice(copiedUntilIndex);
}

export default function prepareSensitiveQueryParamsRedacter(
    sensitiveQueryParams: Array<string> = [],
    isDevMode = false,
) {
    const sensitiveNamePaths = sensitiveQueryParams.map(getParamKeyPath);

    const redactSensitiveQueryParams: SensitiveQueryParamsRedacter = (input = ''): string => {
        if (isDevMode || !input || sensitiveNamePaths.length === 0) {
            return input;
        }

        // Params are found by hand rather than by parsing the input into an URL and serializing it
        // back: a round-trip needs a base to resolve relative urls against, and can then only
        // guess how to strip it off again. Everything but a redacted value is kept byte-for-byte
        return input
            .split(PARAMS_SEPARATOR)
            .map((part) => redactParamsPart(part, sensitiveNamePaths))
            .join(PARAMS_SEPARATOR);
    };

    return redactSensitiveQueryParams;
}
