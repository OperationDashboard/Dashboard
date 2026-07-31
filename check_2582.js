const https = require('https');
const SUPABASE_URL = 'https://jolrtaqlpqqydncacqza.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pcTuDtO5TdBoflRj8hEmpw_X_ETOkaP';

async function check2582() {
    let row = await new Promise(res => {
        https.get(`${SUPABASE_URL}/rest/v1/submissions?date=eq.2026-07-05&code=eq.2582&select=*`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        }, r => { let b=''; r.on('data',c=>b+=c); r.on('end',()=>res(JSON.parse(b))); });
    });
    console.log("KH BDR AMANJAYA 1 (2582) on 5th:", row);

    let row2 = await new Promise(res => {
        https.get(`${SUPABASE_URL}/rest/v1/submissions?date=eq.2026-07-05&code=eq.2607&select=*`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        }, r => { let b=''; r.on('data',c=>b+=c); r.on('end',()=>res(JSON.parse(b))); });
    });
    console.log("KH TMN BISTARI UTAMA (2607) on 5th:", row2);
}

check2582();
