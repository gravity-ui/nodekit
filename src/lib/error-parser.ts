import {AppError} from './app-error';
import {REQUEST_ID_HEADER, TRACE_KEY} from './consts';

export interface AxiosRequestError extends Error {
    request: {};
    config: {url: string};
}

export interface AxiosResponseError extends AxiosRequestError {
    response: {
        headers: {[key: string]: string};
        status: number;
    };
}

function isAxiosRequestError(err: Error | AxiosRequestError): err is AxiosRequestError {
    const error = err as AxiosRequestError;
    return Boolean(error.request && error.config?.url);
}

function isAxiosResponseError(err: Error | AxiosResponseError): err is AxiosResponseError {
    const error = err as AxiosResponseError;
    return Boolean(isAxiosRequestError(error) && error.response);
}

function extractAxiosRequestDebugInfo(error: AxiosRequestError) {
    return {requestUrl: error.config?.url};
}

function extractAxiosResponseDebugInfo(error: AxiosResponseError) {
    return {
        requestUrl: error.config?.url,
        requestId: error.response?.headers?.[REQUEST_ID_HEADER],
        traceId: error.response?.headers?.[TRACE_KEY],
        responseStatus: error.response?.status,
    };
}

export function extractErrorInfo(error?: AppError | Error | unknown) {
    if (error && error instanceof Error) {
        const {message, stack} = error;

        if (isAxiosResponseError(error)) {
            return {
                err: {
                    message,
                    stack,
                    debug: extractAxiosResponseDebugInfo(error),
                },
            };
        } else if (isAxiosRequestError(error)) {
            return {
                err: {message, stack, debug: extractAxiosRequestDebugInfo(error)},
            };
        } else if (AppError.isAppError(error)) {
            return {
                err: {
                    message,
                    stack,
                    code: error.code,
                    details: error.details,
                    debug: error.debug,
                },
            };
        } else {
            return {err: {message, stack}};
        }
    } else {
        return {err: {type: 'InvalidErrorObject'}};
    }
}
