import {Dict} from '../../types';

export type SensitiveKeysRedacter = (inputObject: Dict) => Dict;

export function prepareSensitiveKeysRedacter(keysToRemove: string[] = []) {
    const redactSensitiveKeys: SensitiveKeysRedacter = (inputObject: Dict) => {
        return Object.keys(inputObject).reduce((result, key) => {
            if (keysToRemove.includes(key.toLowerCase())) {
                result[key] = '[REDACTED]';
            } else {
                result[key] = inputObject[key];
            }
            return result;
        }, {} as Dict);
    };

    return redactSensitiveKeys;
}
