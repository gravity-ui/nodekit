import axios, {AxiosRequestConfig} from 'axios';

import type {AppContext} from './context';

const DYNAMIC_CONFIG_POLL_INTERVAL = 30000;

export type DynamicConfigFetcher = (ctx: AppContext) => Promise<unknown>;

interface DynamicConfigBase {
    interval?: number;
    /**
     * Transform raw response data into the stored config value.
     * Use this to apply defaults, remap fields, or coerce types.
     */
    transform?: (raw: unknown) => unknown;
}

interface DynamicConfigWithUrl extends DynamicConfigBase {
    /** Source URL fetched via the built-in HTTP GET. */
    url: string;
    /** Static headers. */
    headers?: Record<string, string>;
    /** Dynamic headers. */
    dynamicHeaders?: Record<string, () => Promise<string>>;
    fetch?: never;
}

interface DynamicConfigWithFetch extends DynamicConfigBase {
    url?: never;
    headers?: never;
    dynamicHeaders?: never;
    /** Custom fetcher for the raw config value. */
    fetch: DynamicConfigFetcher;
}

export type DynamicConfigSetup = DynamicConfigWithUrl | DynamicConfigWithFetch;

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

        if (dynamicConfigSetup.fetch) {
            return Promise.resolve()
                .then(() => dynamicConfigSetup.fetch(this.ctx))
                .then((data) => this.onSuccess({data}), this.onError);
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

    private onSuccess = (response: {data: unknown}) => {
        const {namespace, dynamicConfigSetup} = this;

        let result: unknown;
        try {
            result = dynamicConfigSetup.transform
                ? dynamicConfigSetup.transform(response.data)
                : response.data;
        } catch (error) {
            this.ctx.logError('Dynamic config: transform failed', error, {namespace});
            setTimeout(this.startPolling, this.getPollTimeout());
            return;
        }

        if (process.env.APP_DEBUG_DYNAMIC_CONFIG) {
            this.ctx.log('Dynamic config: fetch complete', {
                oldDynamicConfig: (this.ctx.dynamicConfig as Record<string, unknown>)[namespace],
                fetchedDynamicConfig: result,
                namespace,
            });
        }

        (this.ctx.dynamicConfig as Record<string, unknown>)[namespace] = result;

        setTimeout(this.startPolling, this.getPollTimeout());
    };

    private onError = (error: unknown) => {
        const timeout = this.getPollTimeout();
        const {namespace} = this;

        this.ctx.logError('Dynamic config: fetch failed', error, {
            timeout,
            namespace,
        });

        setTimeout(this.startPolling, timeout);
    };
}
