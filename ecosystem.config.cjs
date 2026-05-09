module.exports = {
  apps: [
    {
      name: 'zavier-sama',
      script: 'app.js',
      interpreter: 'node',
      watch: false,
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
