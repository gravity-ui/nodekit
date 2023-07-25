import axios, {AxiosError} from 'axios';
import type {AppContext} from './context';

const DYNAMIC_CONFIG_POLL_INTERVAL = 30000;

export interface DynamicConfigSetup {
    url: string;
    interval?: number;
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

    startPolling = () => {
        const {dynamicConfigSetup, namespace} = this;

        if (process.env.APP_DEBUG_DYNAMIC_CONFIG) {
            this.ctx.log('Dynamic config: fetching started', {
                namespace,
            });
        }

        axios
            .get(`${dynamicConfigSetup.url}?cacheInvalidation=${Date.now()}`)
            .then(this.onSuccess, this.onError);
    };

    private getPollTimeout() {
        return this.dynamicConfigSetup.interval || DYNAMIC_CONFIG_POLL_INTERVAL;
    }

    private onSuccess = (response: {data: Record<string, boolean>}) => {
        const {namespace} = this;

        if (process.env.APP_DEBUG_DYNAMIC_CONFIG) {
            this.ctx.log('Dynamic config: fetch complete', {
                oldDynamicConfig: (this.ctx.dynamicConfig as Record<string, any>)[namespace],
                fetchedDynamicConfig: response.data,
                namespace,
            });
        }

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
