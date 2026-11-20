const { rpc, countryOf } = require('./_db');

const VIDEO = /^[\w-]{11}$/;
const CLIENT = /^[a-f0-9]{16,64}$/;
const COVER = /^https:\/\/([\w-]+\.)?(ytimg\.com|googleusercontent\.com|ggpht\.com)\//;

function clip(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body || {}));
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return send(res, 405);
  var body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  if (!body || !VIDEO.test(String(body.id || '')) || !CLIENT.test(String(body.cid || ''))) return send(res, 400);
  var title = clip(body.title, 120);
  var artist = clip(body.artist, 120);
  if (!title) return send(res, 400);
  var cover = COVER.test(String(body.cover || '')) ? String(body.cover).slice(0, 300) : 'https://i.ytimg.com/vi/' + body.id + '/hqdefault.jpg';
  try {
    var result = await rpc('register_play', {
      p_id: body.id,
      p_cid: body.cid,
      p_title: title,
      p_artist: artist,
      p_cover: cover,
      p_country: countryOf(req)
    });
    if (result === 'rate') return send(res, 429);
    return send(res, 200, { counted: result === 'counted' });
  } catch (e) {
    return send(res, e.code === 'nocfg' ? 503 : 500);
  }
};
