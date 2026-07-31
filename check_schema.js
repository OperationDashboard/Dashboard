const https = require('https');
const options = {
  hostname: 'jolrtaqlpqqydncacqza.supabase.co',
  port: 443,
  path: '/rest/v1/submissions?limit=1',
  method: 'GET',
  headers: {
    'apikey': 'sb_publishable_pcTuDtO5TdBoflRj8hEmpw_X_ETOkaP',
    'Authorization': 'Bearer sb_publishable_pcTuDtO5TdBoflRj8hEmpw_X_ETOkaP',
    'Prefer': 'return=representation'
  }
};
const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => console.log(body));
});
req.end();
