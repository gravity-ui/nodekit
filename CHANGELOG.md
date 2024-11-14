# Changelog

## [2.0.0](https://github.com/gravity-ui/nodekit/compare/v1.7.0...v2.0.0) (2024-11-14)


### ⚠ BREAKING CHANGES

* use opentelemetry library for tracing ([#60](https://github.com/gravity-ui/nodekit/issues/60)) ([a2e9653](https://github.com/gravity-ui/nodekit/commit/a2e9653e0952fa8d82d9716570847c45f127475e))

### Features

* refactor logging ([dfeae88](https://github.com/gravity-ui/nodekit/commit/dfeae88759bc642d4cf94789bbab93bb2c77e61a))

## [1.7.0](https://github.com/gravity-ui/nodekit/compare/v1.6.0...v1.7.0) (2024-10-25)


### Features

* add spanId getter for app context ([#57](https://github.com/gravity-ui/nodekit/issues/57)) ([f0b4e02](https://github.com/gravity-ui/nodekit/commit/f0b4e023514f2a32fb8a2b0e4870f23bb11c1af6))

## [1.6.0](https://github.com/gravity-ui/nodekit/compare/v1.5.0...v1.6.0) (2024-10-10)


### Features

* add re-export public consts ([#55](https://github.com/gravity-ui/nodekit/issues/55)) ([acc8dde](https://github.com/gravity-ui/nodekit/commit/acc8dde5d4e4b210948988fc04e7243df667af85))

## [1.5.0](https://github.com/gravity-ui/nodekit/compare/v1.4.0...v1.5.0) (2024-10-10)


### Features

* add ability to attach extra data to log lines ([#50](https://github.com/gravity-ui/nodekit/issues/50)) ([76eb406](https://github.com/gravity-ui/nodekit/commit/76eb4060fdcea61bb2d9a0f1254287835497ab2c))
* add user language param ([#54](https://github.com/gravity-ui/nodekit/issues/54)) ([23aa1f6](https://github.com/gravity-ui/nodekit/commit/23aa1f6273873807e5a4ee060d278abcc007d7c5))


### Bug Fixes

* update dependencies ([#52](https://github.com/gravity-ui/nodekit/issues/52)) ([79cd488](https://github.com/gravity-ui/nodekit/commit/79cd488ba6ff1a49f69a2b8d5fc2f02735cd8d4f))

## [1.4.0](https://github.com/gravity-ui/nodekit/compare/v1.3.0...v1.4.0) (2024-07-25)


### Features

* **utils:** make data redacters settings case insensitive ([#48](https://github.com/gravity-ui/nodekit/issues/48)) ([12a32ca](https://github.com/gravity-ui/nodekit/commit/12a32cae2a24085279ccd44e0c98c11564410ae9))

## [1.3.0](https://github.com/gravity-ui/nodekit/compare/v1.2.1...v1.3.0) (2023-12-08)


### Features

* add userId context param for legacy compatibility ([#42](https://github.com/gravity-ui/nodekit/issues/42)) ([8edc95a](https://github.com/gravity-ui/nodekit/commit/8edc95aded8fb7a4e96b8924d54c082b33cb3956))
* **clickhouse:** make telementry send interval configurable ([#40](https://github.com/gravity-ui/nodekit/issues/40)) ([cd4a9eb](https://github.com/gravity-ui/nodekit/commit/cd4a9ebe649e5a2c35f93b750a967f1f433fe38c))

## [1.2.1](https://github.com/gravity-ui/nodekit/compare/v1.2.0...v1.2.1) (2023-09-20)


### Bug Fixes

* change requestId header name ([#37](https://github.com/gravity-ui/nodekit/issues/37)) ([a9d8173](https://github.com/gravity-ui/nodekit/commit/a9d8173c9000c5a1b490ba5c3de1e1dea208304d))

## [1.2.0](https://github.com/gravity-ui/nodekit/compare/v1.1.1...v1.2.0) (2023-09-19)


### Features

* add requestId to the context ([#35](https://github.com/gravity-ui/nodekit/issues/35)) ([73b93de](https://github.com/gravity-ui/nodekit/commit/73b93de177279811ce424bcdbf8a1928065919cd))

## [1.1.1](https://github.com/gravity-ui/nodekit/compare/v1.1.0...v1.1.1) (2023-09-01)


### Bug Fixes

* **types:** use correct type of isTrueEnvValue ([#33](https://github.com/gravity-ui/nodekit/issues/33)) ([cd2d5e1](https://github.com/gravity-ui/nodekit/commit/cd2d5e1c92c1daaf1b59afab701fce32fbee8362))

## [1.1.0](https://github.com/gravity-ui/nodekit/compare/v1.0.0...v1.1.0) (2023-09-01)


### Features

* **utils:** improve redactSensitiveHeaders types ([#29](https://github.com/gravity-ui/nodekit/issues/29)) ([86763d5](https://github.com/gravity-ui/nodekit/commit/86763d56306068c05c9aa7bcaeca65492fda64b5))


### Bug Fixes

* **utils:** allow undefined input in isTrueEnvValue ([#32](https://github.com/gravity-ui/nodekit/issues/32)) ([41fb0d4](https://github.com/gravity-ui/nodekit/commit/41fb0d42a65f0f85011c6844a1de50485ccf556d))

## [1.0.0](https://github.com/gravity-ui/nodekit/compare/v0.7.0...v1.0.0) (2023-08-31)


### ⚠ BREAKING CHANGES

* **package:** update axios peer dependency
* **loadFileConfigs:** use standard node js algorithm to resolve configs ([#23](https://github.com/gravity-ui/nodekit/issues/23))

### chore

* **package:** update axios peer dependency ([1a5b307](https://github.com/gravity-ui/nodekit/commit/1a5b307bb70511dae9eab2b064ba7af839db7e52))


### Features

* **loadFileConfigs:** use standard node js algorithm to resolve configs ([#23](https://github.com/gravity-ui/nodekit/issues/23)) ([75ab0a7](https://github.com/gravity-ui/nodekit/commit/75ab0a7ef3858ef5a27315fdec02779660a69aaa))

## [0.7.0](https://github.com/gravity-ui/nodekit/compare/v0.6.0...v0.7.0) (2023-08-31)

### Features

- **logging:** add option to control logging level ([#25](https://github.com/gravity-ui/nodekit/issues/25)) ([ab52cb0](https://github.com/gravity-ui/nodekit/commit/ab52cb06fc8cc3b4a767a43bfd2333be35df93ea))
- **tracing:** allow to pass collector endpoint option to tracing reporter ([#26](https://github.com/gravity-ui/nodekit/issues/26)) ([6798b40](https://github.com/gravity-ui/nodekit/commit/6798b4049e1b8527b3d91f4e9768e9bba303b631))

### Bug Fixes

- **tracer:** tracer does not have close method if it is not enabled ([#24](https://github.com/gravity-ui/nodekit/issues/24)) ([98c4a96](https://github.com/gravity-ui/nodekit/commit/98c4a9660279c43e7baf6c18c4998ba417bcf5d0))

## [0.6.0](https://github.com/gravity-ui/nodekit/compare/v0.5.0...v0.6.0)

### Features

- **logging:** add logging destination option ([#22](https://github.com/gravity-ui/nodekit/issues/22)) ([833b5b6](https://github.com/gravity-ui/nodekit/commit/833b5b63794d7aaab77a7ce1c4ce6c7d8dc184d9))

## [0.5.0](https://github.com/gravity-ui/nodekit/compare/v0.4.0...v0.5.0)

### Features

- **package:** update axios ([30e5a6a](https://github.com/gravity-ui/nodekit/commit/30e5a6a16516839fde8e2adc7d8665599e625ee0))

## [0.4.0](https://github.com/gravity-ui/nodekit/compare/v0.3.0...v0.4.0)

### Features

- **utils:** add headers redacter ([#18](https://github.com/gravity-ui/nodekit/issues/18)) ([60318bd](https://github.com/gravity-ui/nodekit/commit/60318bdf501441390c7a594ce6f6000955581d6c))

## [0.3.0](https://github.com/gravity-ui/nodekit/compare/v0.2.0...v0.3.0)

### Features

- add dynamic config poller ([b3fab1f](https://github.com/gravity-ui/nodekit/commit/b3fab1fb0dfa441c99a98aaca996bb368d279fe5))

### Bug Fixes

- improve shutdown handlers ([#13](https://github.com/gravity-ui/nodekit/issues/13)) ([68a9120](https://github.com/gravity-ui/nodekit/commit/68a9120daf7dab90b07a54e28c646a9fb25b9f53))

## [0.2.0](https://github.com/gravity-ui/nodekit/compare/v0.1.0...v0.2.0)

### Features

- add clickhouse telemetry ([#14](https://github.com/gravity-ui/nodekit/pull/14)) ([1913e8c](https://github.com/gravity-ui/nodekit/commit/1913e8c2a7f704d85a7b1fa58ef401d9b6e87ab3))

## 0.1.0

Initial release.
