const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

const config = getDefaultConfig(__dirname);

// Reanimated worklets need lazy imports — keep this (#9445)
config.transformer.getTransformOptions = async () => ({
  transform: { inlineRequires: true },
});

// Wrap with Uniwind — replaces NativeWind v5
const uwConfig = withUniwindConfig(config, {
  cssEntryFile: './src/global.css',
  dtsFile: './uniwind-types.d.ts',
});

// SAFETY: re-assert getTransformOptions in case withUniwindConfig overwrote it
if (!uwConfig.transformer.getTransformOptions) {
  uwConfig.transformer.getTransformOptions = config.transformer.getTransformOptions;
}

// Web: alias reanimated/worklets to stubs — Reanimated 4.1.1 crashes with Worklets #8285
const upstreamResolveRequest = uwConfig.resolver.resolveRequest;
uwConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    if (
      moduleName === 'react-native-reanimated' ||
      moduleName.startsWith('react-native-reanimated/')
    ) {
      return {
        filePath: path.resolve(__dirname, 'src/lib/reanimated-web-stub.js'),
        type: 'sourceFile',
      };
    }
    if (
      moduleName === 'react-native-worklets' ||
      moduleName.startsWith('react-native-worklets/')
    ) {
      return {
        filePath: path.resolve(__dirname, 'src/lib/worklets-web-stub.js'),
        type: 'sourceFile',
      };
    }
  }
  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = uwConfig;
