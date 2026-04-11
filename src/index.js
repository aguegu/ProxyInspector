import chalk from 'chalk';
import config from 'config';
import https from 'node:https';
import { HttpsProxyAgent } from 'https-proxy-agent';

const proxies = config.get('proxies');

const results = await Promise.allSettled(proxies.map((proxy) =>  new Promise((resolve, reject) => {
  // console.log(proxy);
  const agent = new HttpsProxyAgent(proxy);
  const req = https.get(config.get('target'), { agent }, (res) => {
    // console.log(res);
    resolve(res.statusCode);
  }).setTimeout(1000, () => {
    console.log('timeout');
    // req.abort();
    req.destroy();
    reject('timeout');
  }).on('socket', (socket) => {
    console.log('socket event');
    socket.setTimeout(1000);   // 5 s of inactivity on the TCP socket
    socket.on('timeout', () => {
      console.error('✖ Proxy Error: socket timeout');
      req.destroy();           // triggers req ‘error’ handler :contentReference[oaicite:3]{index=3}
      reject('socket timeout');
    });
  }).on('error', (e) => reject(e.message))
    .end();
})));

console.log(results);

proxies.map((proxy, i) => {
  if (results[i].status === 'fulfilled') {
    console.log(chalk.green(proxy) + ' ' + chalk.bgGreen(results[i].status));
  } else {
    console.log(chalk.red(proxy) + ' ' + chalk.bgRed(results[i].status));
  }
});
