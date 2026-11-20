const BASE = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

async function rpc(name, args) {
  if (!BASE || !KEY) throw Object.assign(new Error('Supabase sin configurar'), { code: 'nocfg' });
  var headers = { apikey: KEY, 'Content-Type': 'application/json' };
  if (KEY.indexOf('eyJ') === 0) headers.Authorization = 'Bearer ' + KEY;
  var response = await fetch(BASE + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(args || {})
  });
  if (!response.ok) throw new Error('Supabase respondió ' + response.status);
  return response.json();
}

function countryOf(req) {
  var value = String(req.headers['x-vercel-ip-country'] || '').toUpperCase();
  return /^[A-Z]{2}$/.test(value) ? value : '';
}

module.exports = { rpc: rpc, countryOf: countryOf };
