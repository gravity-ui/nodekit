import {AppConfig} from '../types';

export const NODEKIT_BASE_CONFIG: AppConfig = {
    nkDefaultSensitiveKeys: ['password'],
    nkDefaultSensitiveHeaders: ['authorization', 'cookie', 'set-cookie', 'password'],
    nkDefaultHeadersWithSensitiveUrls: ['referer'],
    nkDefaultSensitiveQueryParams: [],
};
