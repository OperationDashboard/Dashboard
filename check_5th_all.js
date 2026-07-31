const https = require('https');
const SUPABASE_URL = 'https://jolrtaqlpqqydncacqza.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pcTuDtO5TdBoflRj8hEmpw_X_ETOkaP';

async function check5th() {
    let res = await new Promise(res => {
        https.get(`${SUPABASE_URL}/rest/v1/submissions?date=eq.2026-07-05&select=id,sales,data&limit=50`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        }, r => { let b=''; r.on('data',c=>b+=c); r.on('end',()=>res(JSON.parse(b))); });
    });
    let nullTopLevel = res.filter(r => r.sales === null && r.data && r.data.sales > 0);
    console.log("Total checked:", res.length);
    console.log("Null top-level but has JSON sales:", nullTopLevel.length);
    if(nullTopLevel.length > 0) console.log("Sample:", nullTopLevel[0]);
}

check5th();
