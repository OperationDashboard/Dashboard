const https = require('https');

async function fetchSubmissions(start, end) {
  let rows = [];
  let from = 0;
  let step = 1000;
  while (true) {
    let data = await new Promise((resolve) => {
      const options = {
        hostname: 'jolrtaqlpqqydncacqza.supabase.co',
        port: 443,
        path: `/rest/v1/submissions?date=gte.${start}&date=lte.${end}&select=*&order=id.asc&offset=${from}&limit=${step}`,
        method: 'GET',
        headers: {
          'apikey': 'sb_publishable_pcTuDtO5TdBoflRj8hEmpw_X_ETOkaP',
          'Authorization': 'Bearer sb_publishable_pcTuDtO5TdBoflRj8hEmpw_X_ETOkaP'
        }
      };
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (c) => body += c);
        res.on('end', () => resolve(JSON.parse(body)));
      });
      req.end();
    });
    if (Array.isArray(data) && data.length > 0) rows.push(...data);
    if (!data || data.length < step) break;
    from += step;
  }
  return rows;
}

async function run() {
  let rows23 = await fetchSubmissions('2026-07-23', '2026-07-23');
  
  let map = new Map();
  rows23.forEach(s => {
    if (!map.has(s.code)) map.set(s.code, []);
    map.get(s.code).push(s);
  });
  
  let badBranches = [];
  for (let [code, subs] of map.entries()) {
    if (subs.length > 1) {
      let salesSum = subs.reduce((sum, s) => sum + (parseFloat(s.sales) || 0), 0);
      let nightLocked = subs.some(s => s.night_locked);
      // See if they have conflicting data
      badBranches.push({ code, count: subs.length, salesSum, nightLocked });
    }
  }
  console.log("Branches with multiple subs on 23rd:", badBranches.length);
  badBranches.slice(0, 5).forEach(b => console.log(b));
}
run();
