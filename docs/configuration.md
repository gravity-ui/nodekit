# NodeKit: Configuration

Configuration defines how both NodeKit and your application should work. There are a few ways to define configuration and a few ways to access it.

## Defining configuration

Configuration can be passed to the constructor or can be defined in separate directory as a set of files.

Basic example with a constructor:

```typescript
const nodeKit = new NodeKit({config: {apiEndpoint: 'localhost:4242'}});
nodekit.ctx.log('My api endpoint', {endpoint: nodekit.ctx.config.myApiEndpoint}); // localhost:4242
```

### File-based configuration

You can place all your configuration in a file stored in separate directory and then pass path of that directory in the constructor:

```typescript
// configs/common.ts
export default {apiEndpoint: 'localhost:4242'};

// app.ts
const nodeKit = new NodeKit({configsPath: path.resolve(__dirname, 'configs')});
nodekit.ctx.log('My api endpoint', {endpoint: nodekit.ctx.config.apiEndpoint}); // localhost:4242
```

NodeKit will read that directory and load configuration from the files in it.

Often apps have a number of diferent environments (like staging and production). NodeKit supports them too. In example below, NodeKit will determine current environment using `APP_ENV` env variable and then merge resulting configuration using common and env-specific configuration files:

```typescript
// configs/common.ts
export default {apiEndpoint: 'localhost:4242', someCommonValue: 322};

// configs/staging.ts
export default {apiEndpoint: 'staging.example.com'};

// configs/production.ts
export default {apiEndpoint: 'production.example.com'};

// process.env.APP_ENV is set to "staging"

// app.ts
const nodeKit = new NodeKit({configsPath: path.resolve(__dirname, 'configs')});

nodekit.ctx.log('Configuration', nodekit.config);
// {
//     apiEndpoint: 'staging.example.com',
//     someCommonValue: 322
// }
```

During configuration merge, Nodekit does not apply any kind of deep merge, just simple `Object.assign`. Try to keep your configuration files flat and simple.

In some advanced cases your application can have not only environments but also different **installations**. For example, you can have one app separately deployed in two different departments, using different sets of configuration, each with it's own staging and production environments. Installations in NodeKit are used as another layer above environments and determined in runtime using `APP_INSTALLATION` env varaible.

```typescript
// configs/common.ts
export default {someCommonValue: 322};

// configs/department-one/staging.ts
export default {someCommonValue: 322};
// configs/department-one/production.ts
// ...

// configs/department-two/staging.ts
// ...
// configs/department-two/production.ts
// ...
```

Resulting configuration is merged in the following order (each line overriding previous):

- Default NodeKit config
- File configs (if `configsPath` is passed to the constructor)
  - `configs/common.ts`
  - `configs/<installation>/common.ts` - if `APP_INSTALLATION` is present
  - `configs/<env>.ts` - if `APP_ENV` is present
  - `configs/<installation>/<env>.ts` - if `APP_INSTALLATION` is present
  - `configs/<installation>/<env>.ts` - if `APP_INSTALLATION` and `APP_ENV` are present
- Configuration object (if `config` is passed to the constructor)

### Development mode

`nodekit.config.appDevMode` is defined by ENV variable `APP_DEV_MODE`. It's used internally for things like prettifying logs in development mode, but you can also use it in your application when you need it.

We recommend to use `appDevMode` instead of specific development "environment" or "installation" since logically it often carries purposes that can be applied to any environment.

### App name and version

`appName` and `appVersion` fields are used in places like logs to display what application they relate to.

They can be set in configuration and can be overrided with `APP_NAME` and `APP_VERSION` environment variables.

## ENV variables

NodeKit is bundled with [dotenv](https://www.npmjs.com/package/dotenv) and it's activated by default in constructor.

Dotenv automatically parses `.env` files in the directory and adds them to `process.env`. It's very useful in development since you can keep secrets and dev-related overrides in `.env` file, excluded from the repository history. Example:

```typescript
// .env
API_TOKEN=123abc
API_ENDPOINT=localhost:3030/v1/
APP_DEV_MODE=1

// app.ts
const nodeKit = new NodeKit();
nodekit.ctx.log(process.env.API_TOKEN); // 123abc
```

To disable dotenv, pass an option to the constructor:

```typescript
const nodeKit = new NodeKit({disableDotEnv: true});
```

## Accessing configuration

You can access resulting configuration via NodeKit class instance or using any context:

```typescript
// They are the same
ctx.log('My api endpoint', {endpoint: nodekit.config.apiEndpoint});
ctx.log('My api endpoint', {endpoint: ctx.config.apiEndpoint});
```

## Extending interface

To use additional fields in configuration you should extend AppConfig interface:

```typescript
declare module '@gravity-ui/nodekit' {
  interface AppConfig {
    myApiEndpoint: string;
  }
}
```
