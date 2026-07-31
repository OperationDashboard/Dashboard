const https = require('https');

async function getMonthly() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'jolrtaqlpqqydncacqza.supabase.co',
      port: 443,
      path: '/rest/v1/monthly_summaries?select=id,data',
      method: 'GET',
      headers: {
        'apikey': 'sb_publishable_pcTuDtO5TdBoflRj8hEmpw_X_ETOkaP',
        'Authorization': 'Bearer sb_publishable_pcTuDtO5TdBoflRj8hEmpw_X_ETOkaP'
      }
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve(JSON.parse(body));
      });
    });
    req.end();
  });
}

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
  let monthly = await getMonthly();
  let subs = await fetchSubmissions('2026-07-23', '2026-07-23');
  
  let zeroInMonthly = new Set();
  monthly.forEach(docObj => {
      let d = docObj.data;
      let docMonth = docObj.id.split('_')[0];
      if (docMonth !== '2026-07') return;
      if (d.branches) {
          for (let code in d.branches) {
              let bData = d.branches[code];
              if (bData.daily && bData.daily['23']) {
                  if (bData.daily['23'].s === 0) {
                      zeroInMonthly.add(code);
                  }
              }
          }
      }
  });
  
  let mismatch = [];
  subs.forEach(s => {
      if (zeroInMonthly.has(String(s.code).trim())) {
          if (parseFloat(s.sales) > 0) {
              mismatch.push(s);
          }
      }
  });
  
  console.log("Mismatches where monthly is 0 but submissions is > 0:");
  console.log(mismatch.length);
  mismatch.slice(0, 5).forEach(m => console.log(m));
}
run();
