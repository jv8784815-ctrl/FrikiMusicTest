const { rpc, countryOf } = require('./_db');

const PERIODS = { day: 1, week: 1, month: 1 };
const SIZE = 20;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body || {}));
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, max-age=120');
  var query = req.query || {};
  if (!PERIODS[query.period]) return send(res, 400);
  var country = countryOf(req);
  var wantsCountry = query.scope === 'country';
  var base = { period: query.period, scope: wantsCountry ? 'country' : 'ALL', country: country };
  // El Top por país sale de YouTube Music (lo pide el cliente); aquí solo se informa del país detectado.
  if (wantsCountry) return send(res, 200, Object.assign(base, { items: [] }));
  try {
    var rows = await rpc('get_top', { p_period: query.period, p_country: wantsCountry ? country : null, p_limit: SIZE });
    var items = (rows || []).map(function (row) {
      return {
        id: row.r_id,
        title: row.r_title || '',
        artist: row.r_artist || '',
        cover: row.r_cover || 'https://i.ytimg.com/vi/' + row.r_id + '/hqdefault.jpg',
        plays: Number(row.r_total)
      };
    }).filter(function (item) { return item.title; });
    return send(res, 200, Object.assign(base, { items: items }));
  } catch (e) {
    return send(res, e.code === 'nocfg' ? 503 : 500);
  }
};
