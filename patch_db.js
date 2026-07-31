const https = require('https');

const API_URL = 'jolrtaqlpqqydncacqza.supabase.co';
const API_KEY = 'sb_publishable_pcTuDtO5TdBoflRj8hEmpw_X_ETOkaP';

async function fetchSubmissions(start, end) {
  let rows = [];
  let from = 0;
  let step = 1000;
  while (true) {
    let data = await new Promise((resolve) => {
      const options = {
        hostname: API_URL,
        port: 443,
        path: `/rest/v1/submissions?date=gte.${start}&date=lte.${end}&select=*&order=id.asc&offset=${from}&limit=${step}`,
        method: 'GET',
        headers: {
          'apikey': API_KEY,
          'Authorization': `Bearer ${API_KEY}`
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

async function upsertMonthlySummary(id, dataObj) {
    let payload = { id: id, data: dataObj, updated_at: new Date().toISOString() };
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: API_URL,
            port: 443,
            path: '/rest/v1/monthly_summaries?on_conflict=id',
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
            res.on('end', () => resolve({ status: res.statusCode, body }));
        });
        req.on('error', reject);
        req.write(JSON.stringify(payload));
        req.end();
    });
}

function parseDoc(doc) {
    let out = Object.assign({}, doc.data || {});
    for (let k in doc) {
        if (k !== 'data' && doc[k] !== null && doc[k] !== undefined) {
            out[k] = doc[k];
        }
    }
    return out;
}

async function run() {
  let subs = await fetchSubmissions('2026-07-01', '2026-07-31');
  console.log("Total subs fetched:", subs.length);
  
  let recordMap = new Map();
  subs.forEach(doc => {
      let d = parseDoc(doc);
      if (d.code && d.date) {
          let k = getCanonicalSubKey(d);
          if (k) recordMap.set(k, d);
      }
  });
  let docs = Array.from(recordMap.values());
  
  let rawList = [];
  docs.forEach(doc => {
      if (doc && doc.date && doc.code) rawList.push(doc);
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
      let l = parseFloat(d.lorry) || 0;
      let m = parseFloat(d.mykasih) || 0;
      let t = parseFloat(d.transactions) || 0;
      let b1 = parseFloat(d.bank1) || 0;
      let b2 = parseFloat(d.bank2) || 0;
      
      summaries[docId].branches[cTrim].totalSales += s;
      summaries[docId].branches[cTrim].totalLorry += l;
      
      if(!summaries[docId].branches[cTrim].daily[dayStr]) {
          summaries[docId].branches[cTrim].daily[dayStr] = { s:0, l:0, m:0, t:0, b1:0, b2:0 };
      }
      summaries[docId].branches[cTrim].daily[dayStr].s += s;
      summaries[docId].branches[cTrim].daily[dayStr].l += l;
      summaries[docId].branches[cTrim].daily[dayStr].m += m;
      summaries[docId].branches[cTrim].daily[dayStr].t += t;
      summaries[docId].branches[cTrim].daily[dayStr].b1 += b1;
      summaries[docId].branches[cTrim].daily[dayStr].b2 += b2;
  });
  
  console.log("Writing to Supabase...");
  let keys = Object.keys(summaries);
  let ok = 0, fail = 0;
  for (let k of keys) {
      let r = await upsertMonthlySummary(k, summaries[k]);
      if (r.status >= 200 && r.status < 300) ok++;
      else { fail++; console.error("Fail:", k, r.body); }
  }
  console.log(`Done. OK: ${ok}, Fail: ${fail}`);
}
run();
