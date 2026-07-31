const https = require('https');

async function buildRangeQuery(fromIdx, toIdx) {
    return new Promise((resolve) => {
        const options = {
            hostname: 'jolrtaqlpqqydncacqza.supabase.co',
            port: 443,
            path: `/rest/v1/submissions?date=gte.2026-07-17&date=lte.2026-07-24&select=*&order=id.asc`,
            method: 'GET',
            headers: {
                'apikey': 'sb_publishable_pcTuDtO5TdBoflRj8hEmpw_X_ETOkaP',
                'Authorization': 'Bearer sb_publishable_pcTuDtO5TdBoflRj8hEmpw_X_ETOkaP',
                'Range-Unit': 'items',
                'Range': `${fromIdx}-${toIdx}`
            }
        };
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (c) => body += c);
            res.on('end', () => resolve(JSON.parse(body)));
        });
        req.end();
    });
}

async function testQuery() {
    let from = 0;
    let step = 1000;
    let rows = [];
    
    while (true) {
        let batchPromises = [];
        for (let b = 0; b < 4; b++) {
            let bFrom = from + (b * step);
            batchPromises.push(buildRangeQuery(bFrom, bFrom + step - 1));
        }
        let batchResults = await Promise.all(batchPromises);
        let stopBatch = false;
        for (let bRes of batchResults) {
            let bChunk = bRes || [];
            rows.push(...bChunk);
            if (bChunk.length < step) { stopBatch = true; break; }
        }
        from += 4 * step;
        if (stopBatch) {
            break;
        }
    }
    console.log("Total fetched by SBQuery logic:", rows.length);
    let july23Count = rows.filter(r => r.date === '2026-07-23').length;
    console.log("July 23 count in SBQuery logic:", july23Count);
    
    let branch1013 = rows.find(r => r.date === '2026-07-23' && r.code == '1013');
    console.log("Branch 1013 sales in SBQuery logic:", branch1013 ? branch1013.sales : 'Not Found');
}

testQuery();
