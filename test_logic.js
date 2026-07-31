const https = require('https');

async function getMonthly() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'jolrtaqlpqqydncacqza.supabase.co',
      port: 443,
      path: '/rest/v1/monthly_summaries?select=id,data',
      method: 'GET',
      headers: {
        'apikey': 'sb_publishable_pcTuDtO5TdBoflRj8hEmpw_X_ETOkaP',
        'Authorization': 'Bearer sb_publishable_pcTuDtO5TdBoflRj8hEmpw_X_ETOkaP'
      }
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve(JSON.parse(body));
      });
    });
    req.end();
  });
}

async function fetchSubmissions(start, end) {
  let rows = [];
  let from = 0;
  let step = 1000;
  while (true) {
    let data = await new Promise((resolve) => {
      const options = {
        hostname: 'jolrtaqlpqqydncacqza.supabase.co',
        port: 443,
        path: `/rest/v1/submissions?date=gte.${start}&date=lte.${end}&select=*&order=id.asc&offset=${from}&limit=${step}`,
        method: 'GET',
        headers: {
          'apikey': 'sb_publishable_pcTuDtO5TdBoflRj8hEmpw_X_ETOkaP',
          'Authorization': 'Bearer sb_publishable_pcTuDtO5TdBoflRj8hEmpw_X_ETOkaP'
        }
      };
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (c) => body += c);
        res.on('end', () => resolve(JSON.parse(body)));
      });
      req.end();
    });
    if (Array.isArray(data) && data.length > 0) rows.push(...data);
    if (!data || data.length < step) break;
    from += step;
  }
  return rows;
}

function getCanonicalSubKey(s) {
    if (!s || s.code == null || !s.date) return "";
    let c = String(s.code).trim();
    if (!isNaN(Number(c)) && c !== "") c = String(Number(c));
    let d = String(s.date).trim().substring(0, 10);
    return c + "_" + d;
}

function deduplicateSubmissionsList(list) {
    if (!Array.isArray(list)) return [];
    let map = new Map();
    for (let i = 0; i < list.length; i++) {
        let s = list[i];
        if (!s || s.code == null || !s.date) continue;
        let k = getCanonicalSubKey(s);
        if (!k) continue;
        let existing = map.get(k);
        if (!existing) {
            map.set(k, s);
        } else {
            let existScore = (existing.night_locked ? 100 : 0) + ((parseFloat(existing.sales)||0)>0 ? 10 : 0) + ((parseFloat(existing.lorry)||0)>0 ? 1 : 0);
            let currScore = (s.night_locked ? 100 : 0) + ((parseFloat(s.sales)||0)>0 ? 10 : 0) + ((parseFloat(s.lorry)||0)>0 ? 1 : 0);
            if (currScore > existScore || (currScore === existScore && String(s.updated_at || "") >= String(existing.updated_at || ""))) {
                map.set(k, s);
            }
        }
    }
    return Array.from(map.values());
}

async function run() {
  let subs = await fetchSubmissions('2026-07-23', '2026-07-23');
  
  // Mimic fetchSubmissionsChunked
  let recordMap = new Map();
  subs.forEach(doc => {
      let d = typeof doc.data === 'function' ? doc.data() : doc;
      if (d.code && d.date) {
          let k = getCanonicalSubKey(d);
          if (k) recordMap.set(k, d);
      }
  });
  
  let docs = Array.from(recordMap.values());
  
  // Mimic aggregateAllData
  let rawList = [];
  docs.forEach(doc => {
      let d = typeof doc.data === 'function' ? doc.data() : doc;
      if (d && d.date && d.code) rawList.push(d);
  });
  
  let cleanList = deduplicateSubmissionsList(rawList);
  
  let branch1013 = cleanList.find(c => c.code == '1013');
  console.log("Branch 1013 in cleanList:", branch1013.sales);
}
run();
