import http from 'node:http';

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://esm.sh",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://crests.football-data.org https://images.unsplash.com",
  "connect-src 'self' https://agxffllgcahbacvxhqua.supabase.co wss://agxffllgcahbacvxhqua.supabase.co https://esm.sh",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "worker-src 'self'",
  "manifest-src 'self'"
].join('; ');

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Content-Security-Policy': CSP
};

const originalWriteHead = http.ServerResponse.prototype.writeHead;
http.ServerResponse.prototype.writeHead = function patchedWriteHead(statusCode, statusMessage, headers) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!this.hasHeader(name)) this.setHeader(name, value);
  }
  return originalWriteHead.call(this, statusCode, statusMessage, headers);
};
