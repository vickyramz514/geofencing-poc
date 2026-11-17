const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

function sendError(res, statusCode, code, message) {
  res.status(statusCode).setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ success: false, error: { code, message } }));
}

function requestBody(req) {
  if (req.body === undefined || req.body === null || ['GET', 'HEAD'].includes(req.method)) return undefined;
  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) return req.body;
  return JSON.stringify(req.body);
}

export default async function handler(req, res) {
  if (!ALLOWED_METHODS.has(req.method || '')) {
    res.setHeader('Allow', [...ALLOWED_METHODS].join(', '));
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
  }

  const apiUrl = process.env.ADMIN_API_URL?.replace(/\/+$/, '');
  const token = process.env.ADMIN_API_TOKEN;
  if (!apiUrl || !token) {
    return sendError(res, 503, 'ADMIN_PROXY_NOT_CONFIGURED', 'The admin API proxy is not configured on the server.');
  }

  let target;
  try {
    const base = new URL(apiUrl);
    if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Unsupported protocol');
    const rawSegments = req.query.path;
    const segments = Array.isArray(rawSegments) ? rawSegments : rawSegments ? [rawSegments] : [];
    const safePath = segments.map(segment => encodeURIComponent(String(segment))).join('/');
    const incoming = new URL(req.url || '/', 'https://vercel.invalid');
    target = `${apiUrl}/admin${safePath ? `/${safePath}` : ''}${incoming.search}`;
  } catch {
    return sendError(res, 500, 'ADMIN_PROXY_URL_INVALID', 'The configured admin API URL is invalid.');
  }

  const headers = {
    Accept: req.headers.accept || 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
  if (req.headers['idempotency-key']) headers['Idempotency-Key'] = req.headers['idempotency-key'];

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: requestBody(req),
      signal: AbortSignal.timeout(30_000),
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    const disposition = upstream.headers.get('content-disposition');
    if (disposition) res.setHeader('Content-Disposition', disposition);
    const totalCount = upstream.headers.get('x-total-count');
    if (totalCount) res.setHeader('X-Total-Count', totalCount);
    const truncated = upstream.headers.get('x-export-truncated');
    if (truncated) res.setHeader('X-Export-Truncated', truncated);
    return res.end(body);
  } catch {
    return sendError(res, 502, 'ADMIN_API_UNREACHABLE', 'Could not reach the admin API.');
  }
}

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };
