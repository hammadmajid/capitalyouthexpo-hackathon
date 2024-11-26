module.exports = function (api) {
  const testing = api.env('test');
  return {
    plugins: testing ? ['@babel/plugin-transform-dynamic-import'] : [],
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
