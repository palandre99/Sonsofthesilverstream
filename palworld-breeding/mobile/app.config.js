// app.config.js — gives the DEV build its own identity.
//
// WHY THIS EXISTS
// Until 2026-08-15 both EAS profiles produced the same app: name "Palforge",
// bundle id com.palandre.hatchlab, identical fingerprints. iOS treats that as
// ONE app, so installing the FAST build silently deleted the CEO's dev client
// (and vice versa) — Metro, shake-to-refresh and live reload just vanished.
// He reported "the app is broken" and was right to.
//
// HOW IT WORKS
// Expo reads app.json first and hands it to this function as `config`.
//   - preview / production  -> UNCHANGED. The FAST build keeps the exact
//     identity it already has, so the CEO's installed app and its OTA updates
//     keep working. Do not "tidy" this branch.
//   - everything else (the `development` EAS profile AND a plain local
//     `expo start`) -> the DEV identity below.
//
// Local `expo start` must land in the DEV branch: the dev server has to speak
// the same scheme as the installed dev client, or the deep link opens nothing.
// That is why the default is DEV and only release profiles opt out.

const RELEASE_PROFILES = new Set(['preview', 'production']);

module.exports = ({ config }) => {
  const profile = process.env.EAS_BUILD_PROFILE;

  if (RELEASE_PROFILES.has(profile)) {
    return config;
  }

  return {
    ...config,
    name: 'Palforge DEV',
    scheme: 'palforge-dev',
    ios: {
      ...config.ios,
      bundleIdentifier: 'com.palandre.hatchlab.dev',
    },
    android: {
      ...config.android,
      package: 'com.palandre.hatchlab.dev',
    },
  };
};
