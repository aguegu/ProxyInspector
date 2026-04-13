import { readFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import chalk from 'chalk';

const file = process.argv[2] || 'proxies.txt';
const target = process.argv[3] || 'http://httpbin.org/status/204';
const timeout = 5000;

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

const checkHttpProxy = (proxyUrl, targetUrl) => new Promise((resolve, reject) => {
  const start = Date.now();

  const req = http.request({
    host: proxyUrl.hostname,
    port: proxyUrl.port || 80,
    method: 'GET',
    path: target,
    headers: { Host: targetUrl.host },
    timeout,
  }, (res) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => {
      resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks).toString(), ms: Date.now() - start });
    });
  });

  req.on('timeout', () => {
    req.destroy();
    reject(new Error('timeout'));
  });

  req.on('error', (e) => reject(e));
  req.end();
});

const checkSocks5Proxy = (proxyUrl, targetUrl) => new Promise((resolve, reject) => {
  const start = Date.now();
  const port = parseInt(targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80));
  const host = targetUrl.hostname;

  const socket = net.connect(proxyUrl.port || 1080, proxyUrl.hostname, () => {
    // SOCKS5 greeting: version 5, 1 method, no-auth
    socket.write(Buffer.from([0x05, 0x01, 0x00]));
  });

  socket.setTimeout(timeout);
  socket.on('timeout', () => {
    socket.destroy();
    reject(new Error('timeout'));
  });
  socket.on('error', (e) => reject(e));

  let step = 'greeting';
  const httpChunks = [];

  socket.on('close', () => {
    if (httpChunks.length === 0) return;
    const raw = Buffer.concat(httpChunks).toString();
    const match = raw.match(/^HTTP\/\d\.\d (\d{3})/);
    if (match) {
      const bodyStart = raw.indexOf('\r\n\r\n');
      const body = bodyStart !== -1 ? raw.slice(bodyStart + 4) : '';
      resolve({ statusCode: parseInt(match[1]), body, ms: Date.now() - start });
    } else {
      reject(new Error('invalid http response'));
    }
  });

  socket.on('data', (data) => {
    if (step === 'greeting') {
      if (data[0] !== 0x05 || data[1] !== 0x00) {
        socket.destroy();
        return reject(new Error('socks5 auth rejected'));
      }
      // Connect request: version, connect cmd, reserved, domain type, domain length, domain, port
      const hostBuf = Buffer.from(host);
      const buf = Buffer.alloc(7 + hostBuf.length);
      buf[0] = 0x05; // version
      buf[1] = 0x01; // connect
      buf[2] = 0x00; // reserved
      buf[3] = 0x03; // domain name
      buf[4] = hostBuf.length;
      hostBuf.copy(buf, 5);
      buf.writeUInt16BE(port, 5 + hostBuf.length);
      socket.write(buf);
      step = 'connect';
    } else if (step === 'connect') {
      if (data[0] !== 0x05 || data[1] !== 0x00) {
        socket.destroy();
        return reject(new Error(`socks5 connect failed (${data[1]})`));
      }
      // Tunnel established — send a simple HTTP request through it
      socket.write(`GET ${targetUrl.pathname || '/'} HTTP/1.1\r\nHost: ${targetUrl.host}\r\nConnection: close\r\n\r\n`);
      step = 'http';
    } else if (step === 'http') {
      httpChunks.push(data);
    }
  });
});

const checkProxy = (proxy) => {
  const proxyUrl = new URL(proxy);
  const targetUrl = new URL(target);
  const scheme = proxyUrl.protocol.replace(':', '');

  if (scheme === 'http') return checkHttpProxy(proxyUrl, targetUrl);
  if (scheme === 'socks5') return checkSocks5Proxy(proxyUrl, targetUrl);
  return Promise.reject(new Error(`unsupported scheme: ${scheme}`));
};

const results = await Promise.allSettled(proxies.map(checkProxy));

let good = 0;
for (let i = 0; i < proxies.length; i++) {
  const r = results[i];
  if (r.status === 'fulfilled') {
    good++;
    console.log(chalk.green(`✔ ${proxies[i]}`) + chalk.gray(` ${r.value.statusCode} ${r.value.ms}ms`));
    if (r.value.body) console.log(chalk.dim(r.value.body.trim()));
  } else {
    console.log(chalk.red(`✖ ${proxies[i]}`) + chalk.gray(` ${r.reason.message}`));
  }
}

console.log(`\n${chalk.green(good)} good / ${chalk.red(proxies.length - good)} bad / ${proxies.length} total`);
