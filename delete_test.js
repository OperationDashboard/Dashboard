const https = require('https');
const API_URL = 'jolrtaqlpqqydncacqza.supabase.co';
const API_KEY = 'sb_publishable_pcTuDtO5TdBoflRj8hEmpw_X_ETOkaP';

async function req(method, path) {
    return new Promise((resolve) => {
        let headers = {
            'apikey': API_KEY,
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
        };
        const r = https.request({
            hostname: API_URL,
            port: 443,
            path: path,
            method: method,
            headers: headers
        }, (res) => {
            let b = '';
            res.on('data', c => b+=c);
            res.on('end', () => resolve({ status: res.statusCode, body: b }));
        });
        r.end();
    });
}

async function deleteTestRow() {
    let res = await req('DELETE', '/rest/v1/submissions?id=eq.2026-07-24_TEST');
    console.log("Delete status:", res.status, res.body);
}
deleteTestRow();
