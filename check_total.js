const https = require('https');
const options = {
  hostname: 'jolrtaqlpqqydncacqza.supabase.co',
  port: 443,
  path: '/rest/v1/submissions?date=gte.2026-07-01&date=lte.2026-07-31&select=id',
  method: 'GET',
  headers: {
    'apikey': 'sb_publishable_pcTuDtO5TdBoflRj8hEmpw_X_ETOkaP',
    'Authorization': 'Bearer sb_publishable_pcTuDtO5TdBoflRj8hEmpw_X_ETOkaP',
    'Prefer': 'count=exact,head=true'
  }
};
const req = https.request(options, (res) => {
  console.log("Status:", res.statusCode);
  console.log("Headers:", res.headers);
});
req.end();
