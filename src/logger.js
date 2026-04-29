function ts() {
  return new Date().toISOString();
}

function fmt(parts) {
  return parts
    .map((p) => (typeof p === 'string' ? p : JSON.stringify(p)))
    .join(' ');
}

function info(tag, ...msg) {
  console.log(`${ts()} INFO  [${tag}] ${fmt(msg)}`);
}

function warn(tag, ...msg) {
  console.warn(`${ts()} WARN  [${tag}] ${fmt(msg)}`);
}

function error(tag, ...msg) {
  console.error(`${ts()} ERROR [${tag}] ${fmt(msg)}`);
}

function ms(startNs) {
  const elapsed = Number(process.hrtime.bigint() - startNs) / 1e6;
  if (elapsed < 1000) return `${elapsed.toFixed(0)}ms`;
  return `${(elapsed / 1000).toFixed(1)}s`;
}

function now() {
  return process.hrtime.bigint();
}

function bytes(n) {
  if (n == null) return '?';
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(2)}MB`;
}

module.exports = { info, warn, error, ms, now, bytes };
