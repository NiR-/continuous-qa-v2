module.exports = {
  "extends": "google",
  "parserOptions": {
    "sourceType": "module",
    "ecmaVersion": 2017,
    "ecmaFeatures": {
      "experimentalObjectRestSpread": true,
    },
  },
  "rules": {
    "object-curly-spacing": ["error", "always"],
    "max-len": ["warn", 90],
  },
};
