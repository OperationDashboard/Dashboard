const https = require('https');

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
    let rows = JSON.parse(body);
    let zeroCount = 0;
    let nonZeroCount = 0;
    let noDataCount = 0;
    
    rows.forEach(docObj => {
        let d = docObj.data;
        let docMonth = docObj.id.split('_')[0];
        if (docMonth !== '2026-07') return;
        if (d.branches) {
            for (let code in d.branches) {
                let bData = d.branches[code];
                if (bData.daily && bData.daily['23']) {
                    let sales = bData.daily['23'].s;
                    if (sales === 0) zeroCount++;
                    else nonZeroCount++;
                } else {
                    noDataCount++;
                }
            }
        }
    });
    console.log("July 23 stats in monthly_summaries:");
    console.log("Zero sales:", zeroCount);
    console.log("Non-zero sales:", nonZeroCount);
    console.log("No data for 23rd:", noDataCount);
  });
});
req.end();
