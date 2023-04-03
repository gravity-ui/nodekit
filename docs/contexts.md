# NodeKit: Contexts

NodeKit Context is a class that carries app configuration and set of _context-dependent_ utilities for logging, tracing, sending metrics and stats and so on.

NodeKit app contains root context that can be accessed as `nodekit.ctx`:

```typescript
const nodeKit = new NodeKit();
nodekit.ctx.log('Hello World', {
  valueFromConfig: nodekit.ctx.config.apiEndpoint,
});
```

If your app is very simple it's sometimes enough to just use one root context for configiration and logging and not bother with other contexts. But for almost any other case it's useful to create sub-contexts.

## Sub-contexts

Sub-context is a Context class instance that's created as a child of other Context. They can be created in two ways: by using `create()` and `call()`.

`create()` is a manual way of handling Contexts, you should not forget to `end()` this context:

```typescript
const ctx = nodekit.ctx.create('getUserSettings');

ctx.log('Preparing to fetch user settings');
const settings = await getUserSettings({userId: 42});
ctx.log('User settings received');

ctx.end();
```

`call()` is more automated since it handles `end()` by itself, you just need to pass callback with your logic to it. It supports both synchronous and async functions:

```typescript
const settings = await nodekit.ctx.call('getUserSettings', (cx) => {
  // "cx" here is sub-context and "getUserSettings" is it's name
  return await getUserSettings({userId: 42});
});
```

NodeKit will close `getUserSettings` context when callback function will resolve. It also will correcly handle errors throwed from that function (failing the span and rethrowing them outside).

It's useful to create sub-contexts for all important function calls in your application. There are two reasons for that: you'll see prefix of context names in your logs, and if your application has tracing enabled, it would also create separate spans for each of that calls (more on this later).

You can approach usage of sub-contexts in your application with two different ways:

- Create contexts outside (using call() or manually) and pass them to the functions
- Pass parent (current) contexts to the functions and create sub-contexts inside of them

Each way have it's own upsides and downsides so choose what suits you more. But it's recommended to try to use only one of the above styles in one application so it doesn't get confusing what to pass to the functions.

## Logging

Context provides two logging functions:

- `log(message: string, extra?: Dict)`
- `logError(message: string, error?: AppError|Error|unknown, extra?: Dict)`

`log()` logs passed string as INFO-level logline and attaches optional data from `extra` argument.

`logError()` logs data at ERROR-level and attaches some additional information from provided error instance:

- Error name
- Error stack
- If error is an instance of AxiosError: some information about failed request (url, response status, request id and trace id - if present)

Examples:

```typescript
ctx.log('Hello world');
ctx.log('Log line with attached information', {foo: 'bar'};

ctx.logError('We broke something?');
ctx.logError('Definitely broke something', error);
ctx.logError('Definitely broke something and we even know what', error, {
    userId: 42,
});
```

Each log line from sub-contexts will use names of all parent contexts as a prefix. You can also provide postfix to the context, it will be passed to it's children as well:

```typescript
const requestCtx = nodekit.ctx.create('incomingRequest', {loggerPostfix: '[REQ-1]'});

requestCtx.log('Data arrived, preparing to handle it');
// => [incomingRequest] Data arrived, preparing to handle it [REQ-1]

const childCtx = requestCtx.create('preparingResponse');

childCtx.log('Waiting for response to prepare');
// => [incomingRequest] [preparingResponse] Waiting for response to prepare [REQ-1]

// ...
```

**Note: NodeKit uses pino for logging but does not exposes any of it's API or configuration capabilities. However, we would like to add option for configuring pino little later, see [this issue](https://github.com/gravity-ui/nodekit/issues/5) for more details**.

## Distributed tracing

**Note: currently NodeKit uses OpenTelemetry & jaeger-client for tracing. However, we're planning to move to the OpenTelemetry libraries. See [this issue](https://github.com/gravity-ui/nodekit/issues/2) for more details.**

NodeKit Contexts are integrated with [Jaeger Tracing](https://www.jaegertracing.io). If tracing is enabled in your application, each created context (except the root one) will create jaeger span alongside it. Logs are working too: they're added to spans as events.

You can also set tags for spans:

```typescript
ctx.setTag('tagName', 'tagValue');
```

To make tracing really distributed there are two kinds of cases that you should be able to handle:

1. Receiving trace information from outside of your app and creating your spans on top of that (example: some other system queries your service)
2. Attaching trace information with requests that your application makes to another services

Code examples for both cases:

```typescript
// Extracing trace information from incoming http headers and creating span based on that info:
const ctx = nodekit.ctx.create('requestContext', {
  parentSpanContext: nodekit.ctx.extractSpanContext(req.headers),
});

// Attaching trace information to outgoing request:
fetch('https://some-url/', {
  headers: {
    // ...
    ...ctx.getMetadata(),
  },
});
```

### Failed spans

Spans in jaeger can be marked as failed, highlighting traces with them in Jaeger UI. It can be done in a number of ways:

- Any span that calls `logError()` would be marked as failed automatically
- Spans in call()-generated context would be marked as failed if call() callback fails
- You can manually mark span as failed using `fail(err?: Error)` function of Context

### Tracing configuration

To make tracing work with default settings, you only need to set `appTracingEnabled` to `true`. All other settings are optional:

- `appTracingServiceName: string` - by default NodeKit uses your appName as a service name for traces. But you can override it with this settings.
- `appTracingDebugLogging: boolean` - enables debug logging for spans
- `appTracingSampler: {type: string; param: number}` - allows to tune probability with which spans would be sent to the tracing system (by default NodeKit sends all spans)
- `appTracingAgentHost: string` and `appTracingAgentPort: number` allow to change default jaeger agent location

## Telemetry statistics

To collect timing statitistics from your app, you need to prepare your own clickhouse-server and provide required options in your config:

```ts
interface AppConfig {
  /* Required telemetry options */
  appTelemetryChHost?: string;
  appTelemetryChAuth?: string; // 'login:password'
  appTelemetryChDatabase?: string;
  // ...
}
```

See more details on [Telemetry](httsp://github.com/gravity-ui/nodekit/blob/main/docs/telemetry.md) page.

## Metrics

**This feature is not implemented yet, but it's on our roadmap. See [this issue](https://github.com/gravity-ui/nodekit/issues/3).**

## Contexts key-value in-memory storage

Sometimes it can be useful to pass some data alongside your context. You can use `set` and `get` functions for that:

```typescript
// First, extend the interface:
declare module '@gravity-ui/nodekit' {
  interface AppContextParams {
    userId: string;
    userAdmin: boolean;
  }
}

// Then set value in the context. Values are inherited only from parents to childs:
ctx.set('userId', 123);

ctx.call('someFunctionCall', (cx) => {
  cx.log('user id is', {userId: cx.get('userId')}); // => 123
  cx.set('userAdmin', true);
  cx.log('user is admin', {userAdmin: cx.get('userAdmin')}); // => true
});

ctx.log('user id is', {userId: ctx.get('userId')}); // => 123
ctx.log('user is admin', {userAdmin: ctx.get('userAdmin')}); // => undefined
```

## stats

**This feature is not implemented yet, but it's on our roadmap. See [this issue](https://github.com/gravity-ui/nodekit/issues/1) for more information.**

NodeKit is bundled with a logic for forming and sending batches of telemetry information to your ClickHouse instance. This data then can be used for building interactive dashboards with useful data about your application. This stats are not replacement for logs, traces or metrics, but an extension to them.

## Note on async_hooks

NodeKit Contexts were designed before `AsyncLocalStorage` API stabilized in Node.js. We'll explore possibility of using it's capabilities in NodeKit-based projects in the future. Track [this issue](https://github.com/gravity-ui/nodekit/issues/4) for more details.
