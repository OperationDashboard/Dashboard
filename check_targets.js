const https = require('https');
const API_URL = 'jolrtaqlpqqydncacqza.supabase.co';
const API_KEY = 'sb_publishable_pcTuDtO5TdBoflRj8hEmpw_X_ETOkaP';

const req = https.request({
    hostname: API_URL,
    path: '/rest/v1/targets?select=id,month,code&limit=5',
    method: 'GET',
    headers: {
        'apikey': API_KEY,
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
    }
}, (res) => {
    let body = '';
    res.on('data', c => body+=c);
    res.on('end', () => console.log('Body:', body));
});
req.on('error', (e) => console.error(e));
req.end();
