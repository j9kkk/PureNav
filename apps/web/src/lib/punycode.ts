/**
 * Lightweight RFC 3492 Punycode decoder for Internationalized Domain Names (IDN).
 * Decodes e.g. "xn--9kqp0mora.net" -> "咖啡云.net"
 */
function decodePunycodeLabel(input: string): string {
  let n = 128;
  let i = 0;
  let bias = 72;
  const output: number[] = [];
  const delim = input.lastIndexOf('-');
  let b = 0;
  if (delim > 0) {
    for (b = 0; b < delim; b++) output.push(input.charCodeAt(b));
    b++;
  }
  while (b < input.length) {
    const oldi = i;
    let w = 1;
    let k = 36;
    for (;; k += 36) {
      const c = input.charCodeAt(b++);
      const digit =
        c >= 48 && c <= 57 ? c - 22 : c >= 65 && c <= 90 ? c - 65 : c >= 97 && c <= 122 ? c - 97 : 36;
      i += digit * w;
      const t = k <= bias ? 1 : k >= bias + 26 ? 26 : k - bias;
      if (digit < t) break;
      w *= 36 - t;
    }
    const outLen = output.length + 1;
    let delta = oldi === 0 ? Math.floor(i / 700) : Math.floor((i - oldi) / 2);
    delta += Math.floor(delta / outLen);
    let k2 = 0;
    while (delta > ((36 - 1) * 26) / 2) {
      delta = Math.floor(delta / (36 - 1));
      k2 += 36;
    }
    bias = k2 + Math.floor(((36 - 1 + 1) * delta) / (delta + 38));
    n += Math.floor(i / outLen);
    i %= outLen;
    output.splice(i, 0, n);
    i++;
  }
  return String.fromCodePoint(...output);
}

export function decodeHost(hostname: string): string {
  try {
    return hostname
      .split('.')
      .map((part) => {
        const lower = part.toLowerCase();
        return lower.startsWith('xn--') ? decodePunycodeLabel(lower.slice(4)) : part;
      })
      .join('.');
  } catch {
    return hostname;
  }
}

export function formatDisplayHost(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    let host = decodeHost(parsed.hostname);
    host = host.replace(/^www\./i, '');
    if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
      host += `:${parsed.port}`;
    }
    return host;
  } catch {
    const stripped = rawUrl.replace(/^https?:\/\//i, '').split('/')[0] || '';
    return decodeHost(stripped.replace(/^www\./i, ''));
  }
}
