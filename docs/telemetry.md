## Send statistics to ClickHouse

NodeKit provides functionality to send some statistics to ClickHouse. The data from ClickHouse might be useful to analyse work of you application or create some visual dashboards.

Standard configuration describes the schema for default table `apiRequests` wich fits to collect statistics from your controllers or middlewares. Default configuration describese base set of filed for the table but you can extend it, also you can add your tables with custom schemes to write your specific data.

## Quick start

You need to prepare your own ClickHouse-cluster (it is recommended to have at least 2 hosts) and:

1. Create your a database (for example `dbName`).
2. Create default table `apiRequests` in the database (see query below).

```sql
CREATE TABLE IF NOT EXISTS dbName.apiRequests ON CLUSTER '{cluster}' (
timestamp DateTime,
host String,
service LowCardinality(String),
action LowCardinality(String),
responseStatus UInt16,
requestTime UInt32,
requestId String,
requestMethod LowCardinality(String),
requestUrl String
) ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/dbName.apiRequests', '{replica}')
PARTITION BY toMonday(timestamp) ORDER BY (responseStatus, timestamp)
```

Probably you want to set TTL for your table to remove old rows automatically. You need to choose your time range accourding to your requirements and qouta siz, for example, if you want to store statitstics for last 100 days use query:

```sql
ALTER TABLE dbName.apiRequests ON cluster '{cluster}' MODIFY TTL timestamp + INTERVAL 100 DAY DELETE;
```

Query to check if TTL already configured for your table:

```sql
SHOW CREATE TABLE dbName.apiRequests;
```

### Configuration

To configure standard telemetry it is enough to provide following option:
`appTelemetryChHost` — host of your cluster to connect
`appTelemetryChDatabase` — name of your database
`appTelemetryChAuth` – auth credentials in format: `login:password`

, other options:
`appTelemetryChPort` – default 8443
`appTelemetryChTables` – object with description of custom tables (see explanation below)
`appTelemetryChSendInterval` – interval sending batch requests in milliseconds (default 3s)
`appTelemetryChBatchSize` – count of rows to send within a batch requests (default 30)
`appTelemetryChBacklogSize` – queue size (default 500)

### How it works

`ctx.stats` just adds a row in table queue to send, it returns nothing. All the work is done as a background task. So your application should not expect anything as result. Collected rows from a queue are sent when the queue size is equal to `appTelemeteryChBatchSize` value, if the request is failed the rows will be put back to the queue. Also all queued rows might be sent from quey by timeout in 5 seconds. If queue size is reached `appTelemetryChBacklogSize` value then older rows will be displaced with new ones.

ClickHouse does not support several queries in one request, so separate queue is created for each configured table.

### `apiRequets` table

You don't need to provide table name if you want to write statistics to default table `apiRequests`:

```ts
ctx.stats({
  service: 'iam',
  action: 'login',
  requestId: req.id,
  requestMethod: 'POST',
  requestUrl: `${iamEndpoint}/v1/console/login`,
  requestTime: ctx.getTime(),
  responseStatus: 200,
});
```

also `timestamp` and `host` are added automatically for this table, but for custom tables it is up to you.

`requestTime` - time duration of some operation in ms, in case your operation is wrapped by a context it is good idea to use `ctx.getTime()` for the value, but in other cases you need to calculate `requestTime` by self.

### `appTelemetryChTable` explanation (custom tables)

```ts
appTelemetryChTable?: Record<tableName, Record<fieldName, 'number' | 'string' | 'timestamp'>>;
```

The field is used to construct `INSERT`-queries to described tables with following rules:

- `string`-values are escaped and wrapped with quotas,
- `nubmer`-values are parsed with `parseFload` call and validated with `isNaN`
- `timestamp`-values are parsed as `nubmer`-values and converted to seconds `Math.floor(ms / 1000)`
- missing fieldNames will not be sent

##### Example of custom table:

```ts
// Add description of required tables to your config
cosnt config: AppConfig = {
  appTelemetryChTables: {
    requests: { // `requests` table
        url: 'string',
        latency: 'number',
        status: 'number',
        timestamp: 'number',
    },
    events: { // `events` table
        type: 'string',
        message: 'string',
        timestamp: 'number',
    },
  },
  // ...
}

// Use ctx.stats in your code
ctx.stats('events', {
    type: 'fatal',
    timestamp: new Date().getTime(),
    message: 'Summer is over'
});
```

### Environment variables

- `APP_DEBUG_TELEMETRY_CH` - if not empty detailed logging mode of queries will be activated
