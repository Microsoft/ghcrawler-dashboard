// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const RefreshingConfig = require('refreshing-config');
const RefreshingConfigRedis = require('refreshing-config-redis');
const Q = require('q');

class OptionsService {
  constructor() {
  }

  static setupOptions(configs, defaults) {
    return Q.all(Object.getOwnPropertyNames(configs).map(subsystemName => {
      return configs[subsystemName].getAll().then(subsystemConfig => {
        return OptionsService.initializeSubsystemOptions(subsystemConfig, subsystemName, defaults[subsystemName]).then(subsystemOptions =>
          configs[subsystemName] = subsystemOptions);
      });
    })).then(() => { return configs; });
  }

  static initializeSubsystemOptions(config, name, defaults) {
    if (Object.getOwnPropertyNames(config).length > 1) {
      return Q(config);
    }
    return Q.all(Object.getOwnPropertyNames(defaults).map(optionName => {
      return config._config.set(optionName, defaults[optionName]);
    })).then(() => { return config._config.getAll(); });
  }

  static createRedisOptions(defaults, crawlerName, redisClient) {
    const result = {};
    Object.getOwnPropertyNames(defaults).forEach(subsystemName => {
      const key = `${crawlerName}:options:${subsystemName}`;
      const channel = `${key}-channel`;
      const configStore = new RefreshingConfigRedis.RedisConfigStore(redisClient, key);
      result[subsystemName] = new RefreshingConfig.RefreshingConfig(configStore)
        .withExtension(new RefreshingConfigRedis.RedisPubSubRefreshPolicyAndChangePublisher(redisClient, channel));
    });
    return OptionsService.setupOptions(result, defaults);
  }

  static createInMemoryOptions(defaults) {
    const result = {};
    Object.getOwnPropertyNames(defaults).forEach(subsystemName => {
      const configStore = new RefreshingConfig.InMemoryConfigStore();
      result[subsystemName] = new RefreshingConfig.RefreshingConfig(configStore)
        .withExtension(new RefreshingConfig.InMemoryPubSubRefreshPolicyAndChangePublisher());
    });
    return OptionsService.setupOptions(result, defaults);
  }

  initialize(options) {
    if (!this.options) {
      this.options = options;
    }
    if (typeof this.options.then === 'function') {
      return this.options.then(options => {
        this.options = options;
      });
    }
    return Q();
  }

  apply(patches) {
    const sorted = this._collectPatches(patches);
    return Q.all(Object.getOwnPropertyNames(sorted).map(key => {
      return this.options[key]._config.apply(sorted[key]);
    }));
  }

  getAll() {
    return Q.all(Object.getOwnPropertyNames(this.options).map(key => {
      return this.options[key]._config.getAll();
    })).then(() => { return this.options;});
  }

  _collectPatches(patches) {
    return patches.reduce((result, patch) => {
      const segments = patch.path.split('/');
      const key = segments[1];
      result[key] = result[key] || [];
      patch.path = '/' + segments.slice(2).join('/');
      result[key].push(patch);
      return result;
    }, {});
  }
}

module.exports = OptionsService;