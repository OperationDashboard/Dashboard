const https = require('https');
const API_URL = 'jolrtaqlpqqydncacqza.supabase.co';
const API_KEY = 'sb_publishable_pcTuDtO5TdBoflRj8hEmpw_X_ETOkaP';

async function req(method, path, body, prefer) {
    return new Promise((resolve) => {
        let headers = {
            'apikey': API_KEY,
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
        };
        if (prefer) headers['Prefer'] = prefer;
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
        r.write(JSON.stringify(body));
        r.end();
    });
}

async function testUpsert() {
    let payload = { id: "2026-07-24_TEST", date: "2026-07-24", code: "TEST", bank1: 500, sales: 100 };
    let r1 = await req('POST', '/rest/v1/submissions?on_conflict=id', payload, 'resolution=merge-duplicates,return=representation');
    
    // Test what supabase-js sends by default for upsert!
    // supabase-js upsert without options sends Prefer: return=representation,resolution=merge-duplicates
    let payload2 = { id: "2026-07-24_TEST", date: "2026-07-24", code: "TEST", sales: 200 };
    let r2 = await req('POST', '/rest/v1/submissions?on_conflict=id', payload2, 'resolution=merge-duplicates,return=representation');
    console.log("R2", r2.status, r2.body);
}
testUpsert();
