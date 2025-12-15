import crypto from 'crypto';

const base64UrlEncode = (input) => {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

const base64UrlDecode = (input) => {
  const pad = 4 - (input.length % 4 || 4);
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad === 4 ? 0 : pad);
  return Buffer.from(normalized, 'base64').toString('utf8');
};

const signToken = (payload = {}, secret, { expiresInDays = 30 } = {}) => {
  if (!secret) throw new Error('JWT secret is required');

  const header = { alg: 'HS256', typ: 'JWT' };
  const nowSeconds = Math.floor(Date.now() / 1000);
  const exp = nowSeconds + expiresInDays * 24 * 60 * 60;
  const body = { ...payload, exp };

  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(body));
  const data = `${headerEncoded}.${payloadEncoded}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${data}.${signature}`;
};

const verifyToken = (token, secret) => {
  if (!secret) throw new Error('JWT secret is required');
  if (!token || typeof token !== 'string') throw new Error('Token is required');

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');

  const [headerEncoded, payloadEncoded, signature] = parts;
  const data = `${headerEncoded}.${payloadEncoded}`;
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  if (signature !== expectedSig) throw new Error('Invalid signature');

  const payload = JSON.parse(base64UrlDecode(payloadEncoded));
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.exp && nowSeconds > payload.exp) throw new Error('Token expired');

  return payload;
};

export { signToken, verifyToken }; 
