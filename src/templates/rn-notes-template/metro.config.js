const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')
const path = require('path')

const defaultConfig = getDefaultConfig(__dirname)

const config = {
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
  resolver: {
    // Disable package exports to avoid "Cannot read property 'default' of undefined" errors
    // RN 0.79 enabled this by default but some libraries aren't compatible
    unstable_enablePackageExports: false,
    // Exclude backend code from Metro bundling
    blockList: [
      /src-backend\/.*/,
      /teenybase\.ts$/,
      /migrations\/.*/,
      /\.local-persist\/.*/,
      /[\\/]\\.wrangler[\\/].*/,
      /wrangler\.toml$/,
      /\.dev\.vars$/,
    ],
  },
  // Use Metro's default watchFolders (entire project root)
  // blockList already prevents backend files from being bundled
}

module.exports = mergeConfig(defaultConfig, config)
