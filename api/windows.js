
const { findWindows } = require('./_windows');

module.exports = async function handler(req, res) {
  const w = await findWindows();
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
  res.statusCode = 302;
  res.setHeader('Location', w.url);
  res.end();
};
