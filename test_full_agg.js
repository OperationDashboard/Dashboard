const https = require('https');

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
  let subs = await fetchSubmissions('2026-07-01', '2026-07-31');
  console.log("Total subs fetched:", subs.length);
  
  let recordMap = new Map();
  subs.forEach(doc => {
      let d = typeof doc.data === 'function' ? doc.data() : doc;
      if (d.code && d.date) {
          let k = getCanonicalSubKey(d);
          if (k) recordMap.set(k, d);
      }
  });
  let docs = Array.from(recordMap.values());
  
  let rawList = [];
  docs.forEach(doc => {
      let d = typeof doc.data === 'function' ? doc.data() : doc;
      if (d && d.date && d.code) rawList.push(d);
  });
  
  let cleanList = deduplicateSubmissionsList(rawList);
  
  let summaries = {};
  cleanList.forEach(d => {
      let monthStr = d.date.substring(0, 7);
      let [sy, sm, sd] = d.date.split('-').map(Number);
      let dayStr = sd < 10 ? '0'+sd : ''+sd;
      
      let cTrim = String(d.code).trim();
      let bAm = (d.am || "UNASSIGNED").trim().toUpperCase();
      let amKey = bAm.replace(/\//g, '-'); 
      let docId = monthStr + "_" + amKey;
      
      if(!summaries[docId]) {
          summaries[docId] = { branches: {}, am: bAm, month: monthStr };
      }
      if(!summaries[docId].branches[cTrim]) {
          summaries[docId].branches[cTrim] = { totalSales: 0, totalLorry: 0, weeksCount: {}, daily: {}, am: bAm, name: d.name || cTrim };
      }
      
      let s = parseFloat(d.sales) || 0;
      
      summaries[docId].branches[cTrim].totalSales += s;
      
      if(!summaries[docId].branches[cTrim].daily[dayStr]) {
          summaries[docId].branches[cTrim].daily[dayStr] = { s:0, l:0, m:0, t:0, b1:0, b2:0 };
      }
      summaries[docId].branches[cTrim].daily[dayStr].s += s;
  });
  
  // Find branch 1013 in docId 2026-07_SYAMSULBAHRI
  let docId = '2026-07_SYAMSULBAHRI';
  console.log("Branch 1013 sales in summaries on 23rd:", summaries[docId].branches['1013'].daily['23'].s);
}
run();
