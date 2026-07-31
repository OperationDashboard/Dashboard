const https = require('https');
const intervals = [
  ['2026-07-01', '2026-07-08'],
  ['2026-07-09', '2026-07-16'],
  ['2026-07-17', '2026-07-24'],
  ['2026-07-25', '2026-07-31']
];

async function fetchChunkCount(start, end) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'jolrtaqlpqqydncacqza.supabase.co',
      port: 443,
      path: `/rest/v1/submissions?date=gte.${start}&date=lte.${end}&select=id`,
      method: 'GET',
      headers: {
        'apikey': 'sb_publishable_pcTuDtO5TdBoflRj8hEmpw_X_ETOkaP',
        'Authorization': 'Bearer sb_publishable_pcTuDtO5TdBoflRj8hEmpw_X_ETOkaP',
        'Prefer': 'count=exact,head=true'
      }
    };
    const req = https.request(options, (res) => {
      resolve(res.headers['content-range']);
    });
    req.on('error', (e) => resolve("Error"));
    req.end();
  });
}

async function run() {
  for (let r of intervals) {
    let count = await fetchChunkCount(r[0], r[1]);
    console.log(`${r[0]} to ${r[1]}: ${count}`);
  }
}
run();
