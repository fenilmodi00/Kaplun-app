const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativewind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Reanimated worklets need lazy imports — keep this (#9445)
config.transformer.getTransformOptions = async () => ({
  transform: { inlineRequires: true },
});

// Wrap with NativeWind — per official docs, only 2 options exist in v5:
const nwConfig = withNativewind(config, {
  globalClassNamePolyfill: false,
  typescriptEnvPath: 'nativewind-env.d.ts',
});

// SAFETY: re-assert getTransformOptions in case withNativewind overwrote it
if (!nwConfig.transformer.getTransformOptions) {
  nwConfig.transformer.getTransformOptions = config.transformer.getTransformOptions;
}

// Web: alias reanimated/worklets to stubs — Reanimated 4.1.1 crashes with Worklets #8285
const upstreamResolveRequest = nwConfig.resolver.resolveRequest;
nwConfig.resolver.resolveRequest = (context, moduleName, platform) => {
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

module.exports = nwConfig;
