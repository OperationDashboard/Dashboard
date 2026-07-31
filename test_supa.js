const https = require('https');
const API_URL = 'jolrtaqlpqqydncacqza.supabase.co';
const API_KEY = 'sb_publishable_pcTuDtO5TdBoflRj8hEmpw_X_ETOkaP';

async function testSupabase() {
    console.log("Testing Supabase connectivity...");
    let start = Date.now();
    let res = await new Promise((resolve) => {
        const req = https.request({
            hostname: API_URL,
            port: 443,
            path: '/rest/v1/submissions?limit=1',
            method: 'GET',
            headers: {
                'apikey': API_KEY,
                'Authorization': `Bearer ${API_KEY}`
            }
        }, (res) => {
            let body = '';
            res.on('data', c => body+=c);
            res.on('end', () => resolve({ status: res.statusCode, body }));
        });
        req.on('error', e => resolve({ error: e.message }));
        req.end();
    });
    console.log("Time taken:", Date.now() - start, "ms");
    console.log("Response:", res);
}
testSupabase();
