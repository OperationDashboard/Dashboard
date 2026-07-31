const https = require('https');
const API_URL = 'jolrtaqlpqqydncacqza.supabase.co';
const API_KEY = 'sb_publishable_pcTuDtO5TdBoflRj8hEmpw_X_ETOkaP';

let payload = { id: 'system', data: { global_lock: true } };

const req = https.request({
    hostname: API_URL,
    port: 443,
    path: '/rest/v1/config?on_conflict=id',
    method: 'POST',
    headers: {
        'apikey': API_KEY,
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
    }
}, (res) => {
    let body = '';
    res.on('data', c => body+=c);
    res.on('end', () => console.log('Status:', res.statusCode, 'Body:', body));
});
req.on('error', (e) => console.error(e));
req.write(JSON.stringify(payload));
req.end();
