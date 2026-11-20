const BASE = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function pipeline(commands) {
  if (!BASE || !TOKEN) throw Object.assign(new Error('Redis sin configurar'), { code: 'nocfg' });
  const response = await fetch(BASE + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands)
  });
  if (!response.ok) throw new Error('Redis respondió ' + response.status);
  const out = await response.json();
  return out.map(function (item) {
    if (item.error) throw new Error(item.error);
    return item.result;
  });
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function buckets(date) {
  var d = date || new Date();
  var day = d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  var t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  var dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  var start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  var week = Math.ceil(((t - start) / 864e5 + 1) / 7);
  return { day: day, week: t.getUTCFullYear() + '-W' + pad(week), month: day.slice(0, 7) };
}

function countryOf(req) {
  var value = String(req.headers['x-vercel-ip-country'] || '').toUpperCase();
  return /^[A-Z]{2}$/.test(value) ? value : '';
}

module.exports = { pipeline: pipeline, buckets: buckets, countryOf: countryOf };
