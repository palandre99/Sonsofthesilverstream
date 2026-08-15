module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-reanimated v4 worklets — MUST stay the last plugin.
    // Bundler-side only: safe before the native module ships in a build,
    // because no worklet code exists until we actually import reanimated.
    plugins: ['react-native-worklets/plugin'],
  };
};
