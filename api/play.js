const { pipeline, buckets, countryOf } = require('./_redis');

const VIDEO = /^[\w-]{11}$/;
const CLIENT = /^[a-f0-9]{16,64}$/;
const COVER = /^https:\/\/([\w-]+\.)?(ytimg\.com|googleusercontent\.com|ggpht\.com)\//;
const DAY = 40 * 86400;
const WEEK = 120 * 86400;
const MONTH = 400 * 86400;

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
  var country = countryOf(req);
  var b = buckets();
  try {
    var minute = Math.floor(Date.now() / 60000);
    var first = await pipeline([
      ['SET', 'dd:' + body.cid + ':' + body.id + ':' + b.day, '1', 'NX', 'EX', '90000'],
      ['INCR', 'rl:' + body.cid + ':' + minute],
      ['EXPIRE', 'rl:' + body.cid + ':' + minute, '120']
    ]);
    if (Number(first[1]) > 30) return send(res, 429);
    if (first[0] === null) return send(res, 200, { counted: false });
    var scopes = country ? ['ALL', country] : ['ALL'];
    var commands = [];
    scopes.forEach(function (scope) {
      commands.push(['ZINCRBY', 'top:d:' + scope + ':' + b.day, '1', body.id], ['EXPIRE', 'top:d:' + scope + ':' + b.day, String(DAY)]);
      commands.push(['ZINCRBY', 'top:w:' + scope + ':' + b.week, '1', body.id], ['EXPIRE', 'top:w:' + scope + ':' + b.week, String(WEEK)]);
      commands.push(['ZINCRBY', 'top:m:' + scope + ':' + b.month, '1', body.id], ['EXPIRE', 'top:m:' + scope + ':' + b.month, String(MONTH)]);
    });
    commands.push(['HSETNX', 'song:' + body.id, 't', title], ['HSETNX', 'song:' + body.id, 'a', artist], ['HSETNX', 'song:' + body.id, 'c', cover], ['EXPIRE', 'song:' + body.id, String(WEEK)]);
    await pipeline(commands);
    return send(res, 200, { counted: true });
  } catch (e) {
    return send(res, e.code === 'nocfg' ? 503 : 500);
  }
};
