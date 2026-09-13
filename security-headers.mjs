const supabaseOrigin=process.env.SUPABASE_URL?new URL(process.env.SUPABASE_URL).origin:'';

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://crests.football-data.org https://images.unsplash.com",
  `connect-src 'self' ${supabaseOrigin} ${supabaseOrigin.replace(/^https:/,'wss:').replace(/^http:/,'ws:')}`,
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

export function applySecurityHeaders(res) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(name,value);
  }
}
