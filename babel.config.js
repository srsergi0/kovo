module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { esmodules: false }, modules: false }],
    ['@babel/preset-react', { runtime: 'classic' }],
    '@babel/preset-typescript',
  ],
  plugins: ['./scripts/babel-plugin-vela-ux.js'],
};
