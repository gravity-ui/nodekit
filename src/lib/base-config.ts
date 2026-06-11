import {AppConfig} from '../types';

export const NODEKIT_BASE_CONFIG: AppConfig = {
    nkDefaultSensitiveKeys: ['authorization', 'cookie', 'set-cookie', 'password'],
    nkDefaultSensitiveHeaders: [
        'authorization',
        'cookie',
        'set-cookie',
        'password',
        'x-csrf-token',
    ],
    nkDefaultHeadersWithSensitiveUrls: ['referer'],
    nkDefaultSensitiveQueryParams: [],
};
