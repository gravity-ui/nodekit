import axios, {AxiosError, AxiosRequestConfig} from 'axios';

import type {AppContext} from './context';

const DYNAMIC_CONFIG_POLL_INTERVAL = 30000;

export interface DynamicConfigSetup {
    url: string;
    interval?: number;
    /** static headers */
    headers?: Record<string, string>;
    /** dynamic headers */
    dynamicHeaders?: Record<string, () => Promise<string>>;
}

export class DynamicConfigPoller {
    ctx: AppContext;

    private namespace: string;
    private dynamicConfigSetup: DynamicConfigSetup;

    constructor(ctx: AppContext, namespace: string, dynamicConfigSetup: DynamicConfigSetup) {
        this.ctx = ctx;
        this.namespace = namespace;
        this.dynamicConfigSetup = dynamicConfigSetup;
    }

    startPolling = async () => {
        const {dynamicConfigSetup, namespace} = this;

        if (process.env.APP_DEBUG_DYNAMIC_CONFIG) {
            this.ctx.log('Dynamic config: fetching started', {
                namespace,
            });
        }

        const requestConfig: AxiosRequestConfig = {};

        try {
            const headers: Record<string, string> = {};

            // static headers
            if (dynamicConfigSetup.headers) {
                Object.assign(headers, dynamicConfigSetup.headers);
            }

            // dynamic headers
            if (dynamicConfigSetup.dynamicHeaders) {
                for (const [key, getValue] of Object.entries(dynamicConfigSetup.dynamicHeaders)) {
                    headers[key] = await getValue();
                }
            }

            if (Object.keys(headers).length > 0) {
                requestConfig.headers = headers;
            }
        } catch (error) {
            this.ctx.logError('Dynamic config: error on preparing headers', error, {
                namespace,
            });
            return setTimeout(this.startPolling, this.getPollTimeout());
        }

        return axios
            .get(`${dynamicConfigSetup.url}?cacheInvalidation=${Date.now()}`, requestConfig)
            .then(this.onSuccess, this.onError);
    };

    private getPollTimeout() {
        return this.dynamicConfigSetup.interval || DYNAMIC_CONFIG_POLL_INTERVAL;
    }

    private onSuccess = (response: {data: Record<string, boolean>}) => {
        const {namespace} = this;

        if (process.env.APP_DEBUG_DYNAMIC_CONFIG) {
            this.ctx.log('Dynamic config: fetch complete', {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                oldDynamicConfig: (this.ctx.dynamicConfig as Record<string, any>)[namespace],
                fetchedDynamicConfig: response.data,
                namespace,
            });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.ctx.dynamicConfig as Record<string, any>)[namespace] = response.data;

        setTimeout(this.startPolling, this.getPollTimeout());
    };

    private onError = (error: AxiosError) => {
        const timeout = this.getPollTimeout();
        const {namespace} = this;

        this.ctx.logError('Dynamic config: fetch failed', error, {
            timeout,
            namespace,
        });

        setTimeout(this.startPolling, timeout);
    };
}
