require('dotenv-flow').config();

module.exports = {
  proxies: [
    'http://localhost:12901',
    'http://localhost:12910',
    // 'http://localhost:12914',
    'http://localhost:12916',
    'http://10.10.0.25:12910',
    // 'http://10.10.0.25:12914',
    'http://10.10.0.25:12916',
    // 'http://10.10.0.23:12910',
    // 'http://10.10.0.23:12914',
    // 'http://10.10.0.23:12916',
    ...process.env.PROXIES.split(';'),
  ],
  target: process.env.TARGET,
};
