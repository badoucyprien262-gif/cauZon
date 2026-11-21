const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Résolution forcée de tslib pour éviter le crash _extends of undefined avec pdf-lib
try {
  const tslibPath = require.resolve('tslib/tslib.es6.js');
  config.resolver.extraNodeModules = {
    ...config.resolver.extraNodeModules,
    tslib: tslibPath,
  };
} catch (_) {}

module.exports = config;
