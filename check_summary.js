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
    let found = false;
    rows.forEach(r => {
      let d = r.data;
      if (d.branches && d.branches['1078']) {
        found = true;
        console.log("Branch 1078 in doc:", r.id);
        console.log(JSON.stringify(d.branches['1078'].daily, null, 2));
      }
    });
    if (!found) console.log("Branch 1078 not found in any monthly_summaries!");
  });
});
req.end();
