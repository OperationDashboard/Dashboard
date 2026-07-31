const https = require('https');
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
    let rows = JSON.parse(body);
    let allDocs = rows;
    let results = [];
    let filterAm = "";
    let amBranchCodes = null;
    let startDate = "2026-07-01";
    let endDate = "2026-07-31";
    
    allDocs.forEach(docObj => {
        let d = docObj.data;
        let docMonth = docObj.id.split('_')[0];
        if (d.branches) {
            for (let code in d.branches) {
                let bData = d.branches[code];
                if (code !== '1078') continue;
                if (bData.daily) {
                    for (let day in bData.daily) {
                        let daily = bData.daily[day];
                        let dateStr = `${docMonth}-${day}`;
                        if (dateStr >= startDate && dateStr <= endDate) {
                            results.push(dateStr);
                        }
                    }
                }
            }
        }
    });
    console.log("Branch 1078 generated dates:", results.sort());
  });
});
req.end();
