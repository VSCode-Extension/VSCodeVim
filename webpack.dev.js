const merge = require('webpack-merge');
const prod_configs = require('./webpack.config.js');

module.exports = [
  merge.merge(prod_configs[0], {
    mode: 'development',
    devtool: 'inline-source-map',
    optimization: {
      minimize: false,
      removeAvailableModules: false,
      removeEmptyChunks: false,
      splitChunks: false,
    },
  }),
];
