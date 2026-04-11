import { readFileSync } from 'node:fs';
import http from 'node:http';
import chalk from 'chalk';

const file = process.argv[2] || 'proxies.txt';
const target = process.argv[3] || 'https://httpbin.org/status/204';

let lines;
try {
  lines = readFileSync(file, 'utf-8').split('\n');
} catch (e) {
  console.error(chalk.red(`Cannot read proxy file: ${file}`));
  process.exit(1);
}

const proxies = lines
  .map(line => line.trim())
  .filter(line => line && !line.startsWith('#'));

if (proxies.length === 0) {
  console.error(chalk.red('No proxies found in file.'));
  process.exit(1);
}

console.log(`Checking ${proxies.length} proxies against ${target}\n`);

function checkProxy(proxy) {
  const proxyUrl = new URL(proxy);
  const targetUrl = new URL(target);

  return new Promise((resolve, reject) => {
    const start = Date.now();

    const req = http.request({
      host: proxyUrl.hostname,
      port: proxyUrl.port || 80,
      method: 'GET',
      path: target,
      headers: { Host: targetUrl.host },
      timeout: 5000,
    }, (res) => {
      res.resume();
      resolve({ statusCode: res.statusCode, ms: Date.now() - start });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });

    req.on('error', (e) => reject(e));
    req.end();
  });
}

const results = await Promise.allSettled(proxies.map(checkProxy));

let good = 0;
for (let i = 0; i < proxies.length; i++) {
  const r = results[i];
  if (r.status === 'fulfilled') {
    good++;
    console.log(chalk.green(`✔ ${proxies[i]}`) + chalk.gray(` ${r.value.statusCode} ${r.value.ms}ms`));
  } else {
    console.log(chalk.red(`✖ ${proxies[i]}`) + chalk.gray(` ${r.reason.message}`));
  }
}

console.log(`\n${chalk.green(good)} good / ${chalk.red(proxies.length - good)} bad / ${proxies.length} total`);
