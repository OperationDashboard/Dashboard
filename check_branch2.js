const https = require('https');
const options = {
  hostname: 'jolrtaqlpqqydncacqza.supabase.co',
  port: 443,
  path: '/rest/v1/submissions?code=eq.1079&date=gte.2026-07-01&date=lte.2026-07-31',
  method: 'GET',
  headers: {
    'apikey': 'sb_publishable_pcTuDtO5TdBoflRj8hEmpw_X_ETOkaP',
    'Authorization': 'Bearer sb_publishable_pcTuDtO5TdBoflRj8hEmpw_X_ETOkaP'
  }
};
const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    let rows = JSON.parse(data);
    console.log("Found branch 1079 records:", rows.length);
  });
});
req.end();
