import baseConfig from "./packages/config/eslint.config.js";

export default [
  ...baseConfig,
  {
    settings: {
      "import/resolver": {
        alias: {
          map: [
            ["@client", "./apps/client/src"],
            ["@server", "./apps/server/src"],
            ["@shared", "./packages/shared/src"],
            ["@config", "./packages/config"],
          ],
          extensions: [".ts", ".tsx", ".js", ".jsx"],
        },
      },
    },
  },
];
