const https = require('https');
const SUPABASE_URL = 'https://jolrtaqlpqqydncacqza.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pcTuDtO5TdBoflRj8hEmpw_X_ETOkaP';

async function checkMonthlySummary() {
    let row = await new Promise(res => {
        https.get(`${SUPABASE_URL}/rest/v1/monthly_summaries?id=eq.2026-07_AMEETA&select=*`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        }, r => { let b=''; r.on('data',c=>b+=c); r.on('end',()=>res(JSON.parse(b))); });
    });
    console.log("AMEETA Summary:");
    if (row && row[0] && row[0].data && row[0].data.branches['2582']) {
        console.log("2582 daily:", row[0].data.branches['2582'].daily['05']);
    } else {
        console.log("Not found");
    }
}

checkMonthlySummary();
