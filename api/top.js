const { pipeline, buckets, countryOf } = require('./_redis');

const PERIODS = { day: 'd', week: 'w', month: 'm' };
const SIZE = 20;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body || {}));
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, max-age=120');
  var query = req.query || {};
  var code = PERIODS[query.period];
  if (!code) return send(res, 400);
  var country = countryOf(req);
  var wantsCountry = query.scope === 'country';
  var scope = wantsCountry ? country : 'ALL';
  var bucket = buckets()[query.period];
  var base = { period: query.period, scope: wantsCountry ? 'country' : 'ALL', country: country, bucket: bucket };
  if (!scope) return send(res, 200, Object.assign(base, { items: [] }));
  try {
    var rows = (await pipeline([['ZREVRANGE', 'top:' + code + ':' + scope + ':' + bucket, '0', String(SIZE - 1), 'WITHSCORES']]))[0] || [];
    var ids = [];
    var plays = [];
    for (var i = 0; i < rows.length; i += 2) {
      ids.push(rows[i]);
      plays.push(Number(rows[i + 1]));
    }
    var metas = ids.length ? await pipeline(ids.map(function (id) { return ['HMGET', 'song:' + id, 't', 'a', 'c']; })) : [];
    var items = ids.map(function (id, n) {
      var meta = metas[n] || [];
      return { id: id, title: meta[0] || '', artist: meta[1] || '', cover: meta[2] || 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg', plays: plays[n] };
    }).filter(function (item) { return item.title; });
    return send(res, 200, Object.assign(base, { items: items }));
  } catch (e) {
    return send(res, e.code === 'nocfg' ? 503 : 500);
  }
};
