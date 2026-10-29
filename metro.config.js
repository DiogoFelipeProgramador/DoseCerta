// expo-sqlite's web build loads a .wasm file, which Metro doesn't bundle by default.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('wasm');

module.exports = config;
