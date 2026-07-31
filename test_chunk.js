const https = require('https');

async function fetchChunk(start, end) {
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
  console.log("Fetching July 1-8...");
  let rows = await fetchChunk('2026-07-01', '2026-07-08');
  console.log("Rows fetched:", rows.length);
  
  let branch1078 = rows.filter(r => r.code == '1078');
  console.log("Branch 1078 rows:", branch1078.length);
  branch1078.forEach(r => console.log(r.date, r.sales));
}
run();
