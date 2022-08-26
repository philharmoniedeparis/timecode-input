module.exports = {
  root: true,
  env: {
    env: { es6: true, browser: true },
  },
  extends: ["eslint:recommended", "plugin:prettier/recommended"],
  overrides: [
    {
      files: [
        "**/__tests__/*.{j,t}s?(x)",
        "**/tests/unit/*.{j,t}s?(x)",
        "**/tests/unit/**/*.spec.{j,t}s?(x)",
      ],
      env: {
        jest: true,
      },
    },
  ],
};
