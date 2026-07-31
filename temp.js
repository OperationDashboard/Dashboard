
window.onerror = function(msg, url, lineNo, columnNo, error) {
    console.error('JS Error:', msg, 'Line:', lineNo);
    return false;
};
window.onunhandledrejection = function(event) {
    console.error('Unhandled Promise Rejection:', event.reason);
};

        // Auto-purge cache when localStorage quota (5MB) is exceeded to prevent app crashes
        (function() {
            try {
                const _origGetItem = localStorage.getItem.bind(localStorage);
                localStorage.getItem = function(key) {
                    try { return _origGetItem(key); } catch(e) { return null; }
                };
                const _origRemoveItem = localStorage.removeItem.bind(localStorage);
                localStorage.removeItem = function(key) {
                    try { _origRemoveItem(key); } catch(e) {}
                };
                const _origSetItem = localStorage.setItem.bind(localStorage);
                localStorage.setItem = function(key, val) {
                    try {
                        _origSetItem(key, val);
                    } catch(e) {
                        try {
                            let keysToRemove = [];
                            for (let i = 0; i < localStorage.length; i++) {
                                let k = localStorage.key(i);
                                if (k && (k.startsWith('cache_sub_') || k.startsWith('am_confirm_time_') || k === 'master_branches_cache' || k === 'cached_all_surveys' || k.startsWith('audit_'))) {
                                    keysToRemove.push(k);
                                }
                            }
                            keysToRemove.forEach(k => localStorage.removeItem(k));
                            _origSetItem(key, val);
                        } catch(e2) {
                            console.warn('Storage quota exceeded or access denied, unable to save key:', key);
                        }
                    }
                };
            } catch(err) {
                console.warn('localStorage override skipped or denied:', err.message);
            }
        })();

        function formatDecimalInput(el) {
            let val = el.value.replace(/[^\d.]/g, '');
            let parts = val.split('.');
            if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
            if(val !== '') {
                let p = val.split('.');
                p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
                el.value = p.join('.');
            } else { el.value = ''; }
        }
        function formatIntInput(el) {
            let val = el.value.replace(/[^\d]/g, '');
            if(val !== '') el.value = val.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
            else el.value = '';
        }

        // --- Supabase Database Bridge (v10.00 Merdeka Edition) ---
        const SUPABASE_URL = "https://jolrtaqlpqqydncacqza.supabase.co";
        const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpvbHJ0YXFscHFxeWRuY2FjcXphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxOTM5OTYsImV4cCI6MjA5ODc2OTk5Nn0.09IP62_5lE5mMziTeBlYfVhydZeCXHuxwMSvnZBQD6E";
        let _sbClientInstance = null;
        function getSbClient() {
            if (_sbClientInstance) return _sbClientInstance;
            if (window.supabase && typeof window.supabase.createClient === 'function') {
                _sbClientInstance = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
                return _sbClientInstance;
            }
            return null;
        }
        const sbClient = {
            from: (col) => {
                let client = getSbClient();
                if (!client) throw new Error("Supabase client not initialized yet");
                return client.from(col);
            }
        };

        function applyDotUpdates(target, updateObj) {
            target = target || {};
            for (let key in updateObj) {
                let val = updateObj[key];
                if (key.includes('.')) {
                    let parts = key.split('.'); let curr = target;
                    for (let i = 0; i < parts.length - 1; i++) {
                        if (!curr[parts[i]] || typeof curr[parts[i]] !== 'object') curr[parts[i]] = {};
                        curr = curr[parts[i]];
                    }
                    let last = parts[parts.length - 1];
                    if (val && val.__isIncrement) curr[last] = (Number(curr[last]) || 0) + val.val;
                    else curr[last] = val;
                } else {
                    if (val && val.__isIncrement) target[key] = (Number(target[key]) || 0) + val.val;
                    else target[key] = val;
                }
            }
            return target;
        }

        class SBQuery {
            constructor(col, filters = [], orders = [], lim = null) {
                this.col = col; this.filters = filters; this.orders = orders; this.lim = lim;
            }
            where(field, op, val) {
                if ((typeof field === 'object' && field && field.__isDocId) || field === '__name__' || field === 'id') field = 'id';
                return new SBQuery(this.col, [...this.filters, {field, op, val}], this.orders, this.lim);
            }
            like(field, val) {
                if ((typeof field === 'object' && field && field.__isDocId) || field === '__name__' || field === 'id') field = 'id';
                return new SBQuery(this.col, [...this.filters, {field, op: 'like', val}], this.orders, this.lim);
            }
            orderBy(field, dir = 'asc') {
                return new SBQuery(this.col, this.filters, [...this.orders, {field, dir}], this.lim);
            }
            limit(n) {
                return new SBQuery(this.col, this.filters, this.orders, n);
            }
            async get() {
                let rows = [];
                let from = 0;
                let step = 1000;
                while (true) {
                    let buildRangeQuery = (fromIdx, toIdx) => {
                        let qObj = sbClient.from(this.col).select('*');
                        let normFld = (f) => ((typeof f === 'object' && f && f.__isDocId) || f === '__name__' || f === 'documentId' || f === 'id' ? 'id' : f);
                        for (let i = 0; i < this.filters.length; i++) {
                            let f = this.filters[i];
                            let fName = normFld(f.field);
                            if (f.op === '<=' && typeof f.val === 'string' && (f.val.includes('\uf8ff') || f.val.includes('\uffff'))) {
                                let cleanVal = f.val.replace(/[\uf8ff\uffff]/g, '') + 'z';
                                qObj = qObj.lte(fName, cleanVal);
                                continue;
                            }
                            if (f.op === '==' || f.op === 'eq') qObj = qObj.eq(fName, f.val);
                            else if (f.op === '>=' || f.op === 'gte') qObj = qObj.gte(fName, f.val);
                            else if (f.op === '<=' || f.op === 'lte') qObj = qObj.lte(fName, f.val);
                            else if (f.op === '>' || f.op === 'gt') qObj = qObj.gt(fName, f.val);
                            else if (f.op === '<' || f.op === 'lt') qObj = qObj.lt(fName, f.val);
                            else if (f.op === 'in') qObj = qObj.in(fName, Array.isArray(f.val) ? f.val : [f.val]);
                            else if (f.op === 'like' || f.op === 'ilike') qObj = qObj.like(fName, f.val);
                        }
                        let hasIdOrder = false;
                        for (let o of this.orders) {
                            if (normFld(o.field) === 'id') hasIdOrder = true;
                            qObj = qObj.order(normFld(o.field), { ascending: o.dir !== 'desc' });
                        }
                        if (!hasIdOrder) {
                            try { qObj = qObj.order('id', { ascending: true }); } catch(e){}
                        }
                        return qObj.range(fromIdx, toIdx);
                    };
                    let runQuery = async (queryObj) => {
                        for (let attempt = 1; attempt <= 3; attempt++) {
                            try {
                                let res = await queryObj;
                                if (!res.error && res.data) return res;
                                if (attempt === 3) {
                                    if (res.error) throw new Error(res.error.message || 'Supabase Query Error');
                                    return res;
                                }
                            } catch (e) {
                                if (attempt === 3) throw e;
                            }
                            await new Promise(r => setTimeout(r, 250 * Math.pow(1.5, attempt - 1)));
                        }
                    };
                    if (this.lim && this.lim <= 1000) {
                        let res = await runQuery(buildRangeQuery(0, this.lim - 1));
                        if (res.data) rows = res.data;
                        break;
                    } else {
                        let res = await runQuery(buildRangeQuery(from, from + step - 1));
                        let chunk = (res && res.data) || [];
                        rows.push(...chunk);
                        if (chunk.length < step) break;
                        from += step;
                        if (this.lim && rows.length >= this.lim) {
                            rows = rows.slice(0, this.lim);
                            break;
                        }
                        while (true) {
                            let batchPromises = [];
                            for (let b = 0; b < 4; b++) {
                                let bFrom = from + (b * step);
                                batchPromises.push(runQuery(buildRangeQuery(bFrom, bFrom + step - 1)));
                            }
                            let batchResults = await Promise.all(batchPromises);
                            let stopBatch = false;
                            for (let bRes of batchResults) {
                                let bChunk = (bRes && bRes.data) || [];
                                rows.push(...bChunk);
                                if (bChunk.length < step) { stopBatch = true; break; }
                            }
                            from += 4 * step;
                            if (stopBatch || (this.lim && rows.length >= this.lim)) {
                                if (this.lim && rows.length >= this.lim) rows = rows.slice(0, this.lim);
                                break;
                            }
                        }
                        break;
                    }
                }
                let seenIds = new Set();
                let uniqueRows = [];
                for (let r of rows) {
                    if (r && r.id && !seenIds.has(r.id)) {
                        seenIds.add(r.id);
                        uniqueRows.push(r);
                    } else if (r && !r.id) {
                        uniqueRows.push(r);
                    }
                }
                rows = uniqueRows;
                let docs = rows.map(r => ({
                    id: r.id,
                    exists: true,
                    ref: new SBDocRef(this.col, r.id),
                    data: () => (r ? (typeof r === 'object' ? Object.assign({}, r, r.data || {}) : r) : null)
                }));
                return {
                    empty: docs.length === 0,
                    size: docs.length,
                    docs: docs,
                    forEach: (fn) => docs.forEach(fn)
                };
            }
            onSnapshot(cb, errCb) {
                let active = true;
                let isFetching = false;
                let lastHash = "";
                let firstSnapDone = false;
                let lastFetchTime = 0;
                let doFetch = () => {
                    if (!active || isFetching) return;
                    let now = Date.now();
                    if (now - lastFetchTime < 35000 && firstSnapDone) return;
                    lastFetchTime = now;
                    isFetching = true;
                    this.get().then(snap => {
                        isFetching = false;
                        if (!active) return;
                        let hash = snap.docs.length + "_" + snap.docs.map(d => {
                            let r = typeof d.data === 'function' ? d.data() : (d || {});
                            return (r.id || "") + ":" + (r.updated_at || r.updatedAt || r.status || r.sales || r.am || JSON.stringify(r));
                        }).join("|");
                        if (hash !== lastHash || !firstSnapDone) {
                            lastHash = hash;
                            firstSnapDone = true;
                            cb(snap);
                        }
                    }).catch(e => {
                        isFetching = false;
                        console.error("SBQuery.onSnapshot error:", this.col, e);
                        if (errCb && active) errCb(e);
                    });
                };
                doFetch();
                let syncListener = () => { lastHash = ""; doFetch(); };
                if (!window._liveSyncListeners) window._liveSyncListeners = [];
                window._liveSyncListeners.push(syncListener);
                
                let rtChannel = null;
                try {
                    rtChannel = sbClient.channel('rt_' + this.col + '_' + Math.random().toString(36).substring(2))
                        .on('postgres_changes', { event: '*', schema: 'public', table: this.col }, () => {
                            if (active) doFetch();
                        }).subscribe();
                } catch(e) {}

                let onVisChange = () => { if (active && !document.hidden) doFetch(); };
                let intervalMs = (this.col === 'surveys' || this.col === 'survey_responses') ? (180000 + Math.floor(Math.random() * 60000)) : (240000 + Math.floor(Math.random() * 60000));
                let interval = setInterval(() => {
                    if (!active || document.hidden) return;
                    doFetch();
                }, intervalMs);
                let unsub = () => {
                    active = false;
                    clearInterval(interval);
                    document.removeEventListener('visibilitychange', onVisChange);
                    window.removeEventListener('focus', onVisChange);
                    if (rtChannel) { try { sbClient.removeChannel(rtChannel); } catch(e){} }
                    if (window._liveSyncListeners) window._liveSyncListeners = window._liveSyncListeners.filter(x => x !== syncListener);
                };
                unsub.refresh = syncListener;
                return unsub;
            }
        }

        class SBDocRef {
            constructor(col, id) { this.col = col; this.id = id; }
            async get() {
                let res = null;
                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        res = await sbClient.from(this.col).select('*').eq('id', this.id).maybeSingle();
                        if (!res.error) break;
                    } catch (e) { if (attempt === 3) throw e; }
                    if (attempt < 3) await new Promise(r => setTimeout(r, 250 * Math.pow(1.5, attempt - 1)));
                }
                let r = res && res.data;
                return {
                    exists: !!r,
                    id: this.id,
                    ref: this,
                    data: () => (r ? (typeof r === 'object' ? Object.assign({}, r, r.data || {}) : r) : null)
                };
            }
            async set(dataObj, opts) {
                let payload = { id: this.id };
                if (this.col === 'monthly_summaries' || this.col === 'targets') {
                    if (opts && opts.merge) {
                        let cur = await this.get();
                        let merged = applyDotUpdates(cur.exists ? cur.data() : {}, dataObj);
                        payload.data = merged;
                        if (this.col === 'targets') {
                            payload.month = dataObj.month || this.id.split('_')[0];
                            payload.code = dataObj.code || this.id.split('_')[1];
                            let tVal = dataObj.target !== undefined ? dataObj.target : (dataObj.target_sales !== undefined ? dataObj.target_sales : (cur.exists ? (cur.data().target || cur.data().target_sales || 0) : 0));
                            payload.target = tVal;
                        } else if (this.col === 'monthly_summaries') {
                            // am and month stay cleanly inside payload.data (JSONB)
                        }
                    } else {
                        payload.data = dataObj;
                        if (this.col === 'targets') {
                            payload.month = dataObj.month || this.id.split('_')[0];
                            payload.code = dataObj.code || this.id.split('_')[1];
                            let tVal = dataObj.target !== undefined ? dataObj.target : (dataObj.target_sales !== undefined ? dataObj.target_sales : 0);
                            payload.target = tVal;
                        } else if (this.col === 'monthly_summaries') {
                            // am and month stay cleanly inside payload.data (JSONB)
                        }
                    }
                    payload.updated_at = new Date().toISOString();
                } else if (this.col === 'surveys' || this.col === 'survey_responses' || this.col === 'audit_logs' || this.col === 'config') {
                    let curData = {};
                    if (opts && opts.merge) { let cur = await this.get(); curData = cur.exists ? cur.data() : {}; }
                    let merged = applyDotUpdates(curData, dataObj);
                    payload = { id: this.id, data: merged };
                    if (this.col === 'surveys') {
                        if (merged.title !== undefined) payload.title = merged.title;
                        if (merged.targetAudience !== undefined) payload.targetAudience = merged.targetAudience;
                        if (merged.status !== undefined) payload.status = merged.status;
                        merged.updatedAt = new Date().toISOString();
                        payload.data = merged;
                    } else if (this.col === 'survey_responses') {
                        if (merged.surveyId !== undefined) payload.surveyId = merged.surveyId;
                        if (merged.branchCode !== undefined) payload.branchCode = merged.branchCode;
                        if (merged.amName !== undefined) payload.amName = merged.amName;
                        if (merged.branchName !== undefined) payload.branchName = merged.branchName;
                        if (merged.submittedAt !== undefined) payload.submittedAt = merged.submittedAt;
                        if (merged.answers !== undefined) payload.answers = merged.answers;
                    } else if (this.col === 'config') {
                        if (merged.global_lock !== undefined) payload.global_lock = merged.global_lock;
                        if (merged.past_lock !== undefined) payload.past_lock = merged.past_lock;
                        if (merged.app_version !== undefined) payload.app_version = merged.app_version;
                        if (merged.enable_3days_alert !== undefined) payload.enable_3days_alert = merged.enable_3days_alert;
                        if (merged.limit_sales !== undefined) payload.limit_sales = merged.limit_sales;
                        if (merged.limit_mykasih !== undefined) payload.limit_mykasih = merged.limit_mykasih;
                        if (merged.limit_lorry !== undefined) payload.limit_lorry = merged.limit_lorry;
                    } else if (this.col === 'audit_logs') {
                        delete payload.data;
                        payload.id = this.id;
                        payload.timestamp_ms = merged.timestamp_ms || Date.now();
                        payload.action = merged.action || '';
                        payload.details = merged;
                    }
                } else {
                    let curData = {};
                    if (opts && opts.merge) { let cur = await this.get(); curData = cur.exists ? cur.data() : {}; }
                    let merged = applyDotUpdates(curData, dataObj);
                    payload = { id: this.id, data: merged };
                    if (merged.date !== undefined) payload.date = merged.date;
                    if (merged.code !== undefined) payload.code = merged.code;
                    if (merged.name !== undefined) payload.name = merged.name;
                    if (merged.am !== undefined) payload.am = merged.am;
                    if (merged.sales !== undefined) payload.sales = merged.sales;
                    if (merged.lorry !== undefined) payload.lorry = merged.lorry;
                    if (merged.mykasih !== undefined) payload.mykasih = merged.mykasih;
                    if (merged.transactions !== undefined) payload.transactions = merged.transactions;
                    if (merged.bank1 !== undefined) payload.bank1 = merged.bank1;
                    if (merged.bank2 !== undefined) payload.bank2 = merged.bank2;
                    if (merged.night_locked !== undefined) payload.night_locked = merged.night_locked;
                    if (merged.night_unlocked !== undefined) payload.night_unlocked = merged.night_unlocked;
                    if (merged.bank2_unlocked !== undefined) payload.bank2_unlocked = merged.bank2_unlocked;
                    if (merged.night_submit_time !== undefined) payload.night_submit_time = merged.night_submit_time;
                    if (merged.bank1_time !== undefined) payload.bank1_time = merged.bank1_time;
                    if (merged.bank2_time !== undefined) payload.bank2_time = merged.bank2_time;
                    payload.updated_at = new Date().toISOString();
                }
                let res = null;
                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        res = await sbClient.from(this.col).upsert(payload);
                        if (!res.error) break;
                    } catch (e) { if (attempt === 3) throw e; }
                    if (attempt < 3) await new Promise(r => setTimeout(r, 250 * Math.pow(1.5, attempt - 1)));
                }
                if (res && res.error) {
                    console.error(`Supabase Upsert Error (${this.col}):`, res.error.message);
                    throw new Error(res.error.message);
                }
                return res || { data: null };
            }
            async update(dataObj) { return await this.set(dataObj, { merge: true }); }
            async delete() {
                let res = null;
                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        res = await sbClient.from(this.col).delete().eq('id', this.id);
                        if (!res.error) break;
                    } catch (e) { if (attempt === 3) throw e; }
                    if (attempt < 3) await new Promise(r => setTimeout(r, 250 * Math.pow(1.5, attempt - 1)));
                }
                if (res && res.error) {
                    console.error(`Supabase Delete Error (${this.col}):`, res.error.message);
                    throw new Error(res.error.message);
                }
                return res;
            }
            onSnapshot(cb, errCb) {
                let active = true;
                let isFetching = false;
                let lastHash = "";
                let firstSnapDone = false;
                let lastFetchTime = 0;
                let doFetch = () => {
                    if (!active || isFetching) return;
                    let now = Date.now();
                    if (now - lastFetchTime < 15000 && firstSnapDone) return;
                    lastFetchTime = now;
                    isFetching = true;
                    this.get().then(docSnap => {
                        isFetching = false;
                        if (!active) return;
                        let r = docSnap.exists ? docSnap.data() : {};
                        let hash = JSON.stringify(r);
                        if (hash !== lastHash || !firstSnapDone) {
                            lastHash = hash;
                            firstSnapDone = true;
                            cb(docSnap);
                        }
                    }).catch(e => {
                        isFetching = false;
                        if (errCb && active) errCb(e);
                    });
                };
                doFetch();
                let interval = setInterval(() => {
                    if (!active || document.hidden) return;
                    doFetch();
                }, 180000 + Math.floor(Math.random() * 60000));
                let unsub = () => { active = false; clearInterval(interval); };
                unsub.refresh = doFetch;
                return unsub;
            }
        }

        class SBCollectionRef extends SBQuery {
            constructor(col) { super(col); }
            doc(id) {
                if (!id) id = 'doc_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
                return new SBDocRef(this.col, id);
            }
            async add(dataObj) {
                let id = 'doc_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
                let ref = new SBDocRef(this.col, id);
                await ref.set(dataObj);
                return ref;
            }
        }

        class SBBatch {
            constructor() { this.ops = []; }
            update(ref, data) { this.ops.push({ type: 'update', ref, data }); }
            set(ref, data, opts) { this.ops.push({ type: 'set', ref, data, opts }); }
            delete(ref) { this.ops.push({ type: 'delete', ref }); }
            async commit() {
                for (let i = 0; i < this.ops.length; i += 15) {
                    let chunk = this.ops.slice(i, i + 15);
                    await Promise.all(chunk.map(async op => {
                        if (op.type === 'update') await op.ref.update(op.data);
                        else if (op.type === 'set') await op.ref.set(op.data, op.opts);
                        else if (op.type === 'delete') await op.ref.delete();
                    }));
                }
            }
        }

        const db = {
            collection: (col) => new SBCollectionRef(col),
            batch: () => new SBBatch(),
            enablePersistence: () => Promise.resolve(),
        };

        window.firebase = {
            initializeApp: () => {},
            firestore: () => db,
        };
        window.firebase.firestore.FieldValue = {
            increment: (n) => ({ __isIncrement: true, val: n }),
            serverTimestamp: () => new Date().toISOString(),
        };
        window.firebase.firestore.FieldPath = {
            documentId: () => 'id',
        };
        window.db = db;

        // Polyfill for Swal if it fails to load due to poor network
        if (typeof window.Swal === 'undefined') {
            window.Swal = {
                fire: function(arg1, arg2, arg3) {
                    if (typeof arg1 === 'object') {
                        if (arg1.input === 'text') {
                            let ans = prompt((arg1.title || '') + '\n\n' + (arg1.text || 'Sila taip VALID / SAH untuk mengesahkan:'), '');
                            if (arg1.inputValidator && ans !== null) {
                                let err = arg1.inputValidator(ans);
                                if (err) { alert(err); return Promise.resolve({ isConfirmed: false, value: ans }); }
                            }
                            return Promise.resolve({ isConfirmed: ans !== null, value: ans });
                        } else if (arg1.showCancelButton) {
                            return Promise.resolve({ isConfirmed: confirm((arg1.title || '') + '\n\n' + (arg1.text || '')) });
                        } else {
                            alert((arg1.title || '') + '\n\n' + (arg1.text || ''));
                            return Promise.resolve({ isConfirmed: true });
                        }
                    } else {
                        alert(arg1 + (arg2 ? '\n\n' + arg2 : ''));
                        return Promise.resolve({ isConfirmed: true });
                    }
                },
                isVisible: function() { return false; }
            };
            console.warn('SweetAlert2 failed to load. Using native fallback.');
        }

        // --- 1. Settings & Variables ---
        const GLOBAL_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbwRIWmGmQw3QsYOl3C5rLyi2hBADJukGmns7QkEGgdebKJWRYuUxdeU2P3FpHOkRaUhUQ/exec"; 
        const APP_VERSION = 10.37;
        let currentLang = 'EN';
        let currentUser = null; 
        let currentTab = 'dashboard';
        let dbSubmissions = []; 
        let salesLineChartInstance = null;
        let amPieChartInstance = null;
        let salesVsLorryChartInstance = null;
        let execCurrentTimeframe = 'monthly';
        let execChartAMShare = null;
        let execChartAMShare2 = null;
        let execChartSalesTarget = null;
        let execChartSalesTarget2 = null;
        let execChartLorryRatio = null;
        let execChartLorryRatio2 = null;
        let execChartDayPattern = null;
        let execChartKPIMeter = null;
        let execChartStateSales = null;
        let isSyncing = false;
        var configListener = null;
        var surveyUnsubscribe = null;
        var responsesUnsubscribe = null;
        var lastActiveSurveyHash = null;
        var _surveyScheduleTimer = null;
        var allSurveys = [];
        var allResponses = [];
        var surveysLoaded = false;
        var responsesLoaded = false;
        
        const DICT = {
            EN: { subtitle_login: "Please login to continue", btn_branch: "Branch", btn_am: "Area Manager", btn_admin: "Admin", btn_refresh: "Refresh", welcome_title: "Secure Access System", welcome_desc: "Please select your role at the top right to access operational data.", branch_form_title: "Daily Data Entry Form", branch_form_desc: "Complete daily sales and logistics. Data is auto-synced to HQ.", status_done: "SYNCED TO HQ", branch_locked_desc: "Data has been successfully submitted to the server. Contact AM to reset.", branch_section_night: "Primary Operations Data", branch_section_bank: "Bank-In Updates (Always Editable)", field_sales: "Daily Sales (RM)", field_trans: "Transactions", field_mykasih: "MyKasih (RM)", field_lorry: "Lorry Cost (RM)", field_bank1: "1st Bank-In (RM)", field_bank2: "2nd Bank-In (RM)", btn_submit_night: "Submit & Sync to HQ", btn_save_bank: "Sync Bank-In Data", branch_info: "Branch Information", tab_dashboard: "Analytics Dashboard", tab_tracking: "Tracking & Reset", tab_comparison: "Daily Comparison", tab_control: "System Control", kpi_sales: "Total Sales", kpi_mykasih: "MyKasih", kpi_lorry: "Lorry Cost (RM)", kpi_trans: "Transactions", lbl_password: "Password", btn_login_submit: "Submit Login", confirm_title: "Confirm Submission?", confirm_desc: "Data will be permanently synced to HQ.", lbl_submission_ratio: "Submission Ratio:" },
            BM: { subtitle_login: "Please log in", btn_branch: "Branch", btn_am: "Area Manager", btn_admin: "Admin", btn_refresh: "Reload", welcome_title: "Secure Access System", welcome_desc: "Please select your role at the top right corner to access operational data.", branch_form_title: "Daily Entry Form", branch_form_desc: "Complete the daily data. Data is connected directly to HQ server.", status_done: "SUBMITTED TO HQ", branch_locked_desc: "Data has been successfully saved to HQ database. Contact AM to reset.", branch_section_night: "Main Operation Data", branch_section_bank: "Bank-In Update", field_sales: "Daily Sales (RM)", field_trans: "Transactions", field_mykasih: "MyKasih (RM)", field_lorry: "Lorry Cost (RM)", field_bank1: "1st Bank-In (RM)", field_bank2: "2nd Bank-In (RM)", btn_submit_night: "Submit & Save to HQ", btn_save_bank: "Save Bank-In", branch_info: "Maklumat Branch", tab_dashboard: "Analytics Dashboard", tab_tracking: "Check & Reset", tab_comparison: "Daily Comparison", tab_control: "System Control", kpi_sales: "Total Sales", kpi_mykasih: "MyKasih", kpi_lorry: "Kos Lori", kpi_trans: "Transactions", lbl_password: "Password", btn_login_submit: "Confirm Login", confirm_title: "Confirm Submission?", confirm_desc: "Data will be sent directly to HQ central system.", lbl_submission_ratio: "Submission Ratio:" }
        };

        function toggleLang() {
            currentLang = currentLang === 'EN' ? 'BM' : 'EN';
            document.getElementById('lang-indicator').innerText = currentLang;
            document.querySelectorAll('[data-i18n]').forEach(el => { let key = el.getAttribute('data-i18n'); if (DICT[currentLang][key]) el.innerText = DICT[currentLang][key]; });
        }

        function updateThemeBtnVisibility() {}

        setInterval(() => {
            let now = new Date();
            let clockEl = document.getElementById('live-clock'), dateEl = document.getElementById('live-date');
            if(clockEl) clockEl.innerText = now.toLocaleTimeString('en-US', {hour12: false});
            if(dateEl) dateEl.innerText = now.toLocaleDateString('en-GB');
        }, 1000);

        function copyGasCode() { navigator.clipboard.writeText(document.getElementById('gas-code').innerText); showToast('success', 'Google Apps Script code copied!'); }
function saveGlobalGSUrl() { 
            let url = document.getElementById('global-gs-url').value.trim();
            if(!url.endsWith('/exec')) { showToast('error', 'URL must end with /exec !'); return; }
            localStorage.setItem('global_gs_url', url); 
            showToast('success', 'Global Webhook Saved!'); 
            fetchBranchesFromCloud(); // Try fetching branches if manually set
        }

        async function saveLogicalLimits() {
            let s = parseFloat(document.getElementById('limit-sales').value) || 0;
            let m = parseFloat(document.getElementById('limit-mykasih').value) || 0;
            let l = parseFloat(document.getElementById('limit-lorry').value) || 0;
            try {
                await db.collection("config").doc("system").set({
                    limit_sales: s, limit_mykasih: m, limit_lorry: l
                }, {merge: true});
                Swal.fire('Success!', 'Logical Limits updated.', 'success');
            } catch(e) {
                Swal.fire('Error', 'Failed to update limit: ' + e.message, 'error');
            }
        }

        const GLOBALS = { cacheKey: 'pbi_branches' };
        let masterBranches = [];
        let ams = [];
        let masterLock = false;
        let pastLock = true;

        function normalizeBranchData(list) {
            if(!Array.isArray(list)) return [];
            let seen = new Set();
            return list.filter(b => {
                if(!b || !b.code) return false;
                let c = String(b.code).trim();
                if(seen.has(c)) return false;
                seen.add(c);
                return true;
            }).map(b => {
                if(b.code != null) b.code = String(b.code).trim();
                if (!b.am || String(b.am).trim() === "") {
                    if (b["AREA MANAGER"]) b.am = b["AREA MANAGER"];
                    else if (b["AM"]) b.am = b["AM"];
                    else if (b["AreaMgr"]) b.am = b["AreaMgr"];
                    else if (b["AREA MGR"]) b.am = b["AREA MGR"];
                }
                if (b.am != null) {
                    b.am = String(b.am).trim().toUpperCase();
                }
                if (!b.state || String(b.state).trim() === "") {
                    if (b["NEGERI"]) b.state = b["NEGERI"];
                    else if (b["State"]) b.state = b["State"];
                    else if (b["STATE"]) b.state = b["STATE"];
                    else if (b["negeri"]) b.state = b["negeri"];
                    else if (typeof branchStateMap !== 'undefined' && branchStateMap[String(b.code)]) b.state = branchStateMap[String(b.code)];
                }
                if (b.state != null) {
                    b.state = String(b.state).trim().toUpperCase();
                    if (b.state === 'LAIN2' || b.state === 'LAIN') b.state = 'LAIN-LAIN';
                } else {
                    b.state = (typeof branchStateMap !== 'undefined' && branchStateMap[String(b.code)]) ? String(branchStateMap[String(b.code)]).trim().toUpperCase() : "";
                }
                if (!b.state || b.state === '' || b.state === 'LAIN2' || b.state === 'LAIN') b.state = 'LAIN-LAIN';
                if (b.name != null) {
                    b.name = String(b.name).trim();
                }
                return b;
            });
        }

        function loadBranchesCache() {
            let cached = localStorage.getItem('master_branches_cache');
            if(cached) {
                try {
                    let parsed = JSON.parse(cached);
                    masterBranches = normalizeBranchData(parsed);
                    ams = [...new Set(masterBranches.map(b => b.am))].filter(Boolean);
                } catch(e) {}
            }
        }
        
        function fetchBranchesFromCloud() {
            let url = GLOBAL_WEBHOOK_URL || localStorage.getItem('global_gs_url');
            if(!url || url === "SILA_TAMPAL_URL_GOOGLE_APPS_SCRIPT_DI_SINI") return;
            fetch(url + '?t=' + new Date().getTime() + '&action=get_branches').then(r=>r.json()).then(data => {
                if(Array.isArray(data) && data.length > 0) {
                    masterBranches = normalizeBranchData(data);
                    ams = [...new Set(masterBranches.map(b => b.am))].filter(Boolean);
                    localStorage.setItem('master_branches_cache', JSON.stringify(data));
                    let authModal = document.getElementById('auth-modal');
                    if (authModal && !authModal.classList.contains('hidden')) {
                        let sInput = document.getElementById('auth-search');
                        if (sInput) handleAuthSearch(sInput.value || "");
                    }
                    if(document.getElementById('am-select') && ams.length > 0) {
                        let html = '<option value="" disabled selected data-i18n="am_select">-- Select Area Manager --</option>';
                        ams.forEach(am => html += `<option value="${am}">${am}</option>`);
                        document.getElementById('am-select').innerHTML = html;
                    }
                    if(typeof populateFilters === 'function' && currentUser && currentUser.role !== 'branch') populateFilters();
                    if (typeof currentUser !== 'undefined' && currentUser && typeof currentTab !== 'undefined') {
                        if (currentTab === 'dashboard' && typeof renderDashboard === 'function') renderDashboard();
                        else if (currentTab === 'analytics' && typeof renderExecCharts === 'function') renderExecCharts();
                        else if (currentTab === 'comparison' && typeof renderComparisonTable === 'function') renderComparisonTable();
                        else if (currentTab === 'survey' && typeof renderSurveys === 'function') renderSurveys();
                        updateSurveyUI();
                        if (currentTab === 'tracking' && typeof renderTrackingTable === 'function') renderTrackingTable();
                    }
                }
            }).catch(e => {
                console.warn("Branch fetch error (using fallback/cache):", e.message);
            });
        }
          function getYYYYMMDD(date) {
              let d = new Date(date), month = '' + (d.getMonth() + 1), day = '' + d.getDate(), year = d.getFullYear();
              if (month.length < 2) month = '0' + month; if (day.length < 2) day = '0' + day; return [year, month, day].join('-');
          }
          let todayStr = getYYYYMMDD(new Date());
          let currentMonthStr = todayStr.substring(0, 7);
          
          let yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          let yesterdayStr = getYYYYMMDD(yesterday);
        function updateAllDateMax() {
            todayStr = getYYYYMMDD(new Date());
            currentMonthStr = todayStr.substring(0, 7);
            ['night-date', 'bank-in-date', 'dash-date', 'track-date', 'exec-filter-date'].forEach(id => {
                let el = document.getElementById(id);
                if (el) el.max = todayStr;
            });
        }
        setInterval(() => {
            updateAllDateMax();
            let yd = new Date(); yd.setDate(yd.getDate() - 1);
            yesterdayStr = getYYYYMMDD(yd);
        }, 60000);
        let PASSWORDS = { 
            'branch': '826f17bdafceecbf58a5cf484347b0d5b65f6c3a46103bd4f825a6798024f1fd', 
            'am': '7b51a13e03685026f78e3538156ef52a1978cb5ddf715921095de708bd00dca5', 
            'admin': '04445e6487736590d1ef50186b414e737e0164683cbbec64e00e73c000fd3bef', 
            'operation': '7262a53f2a8a12d14ae9a03d528660c052ae6702a6f959a0272880fd6a7f7e24' 
        };
        
        async function hashPassword(password) {
            const msgBuffer = new TextEncoder().encode(password);
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }
        
        function getSafeTimeStr() {
            let d = new Date();
            let hh = d.getHours().toString().padStart(2, '0');
            let mm = d.getMinutes().toString().padStart(2, '0');
            let ss = d.getSeconds().toString().padStart(2, '0');
            return hh + ":" + mm + ":" + ss;
        }

        function formatTime(t) {
            if(!t) return "";
            if(typeof t === 'string' && t.includes('1899')) { let d = new Date(t); if(!isNaN(d)) return d.toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit'}); }
            return t;
        }

        function formatRM(num) {
            if(!num || isNaN(num)) return "0.00";
            return parseFloat(num).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        }

        function formatNum(num) {
            if(!num || isNaN(num)) return "0";
            return parseInt(num).toLocaleString('en-US');
        }

        document.addEventListener("DOMContentLoaded", () => {
              if (typeof applyTheme === 'function') applyTheme(localStorage.getItem('app_theme') || 'dark');
              let vd = document.getElementById('version-display'); if(vd) vd.innerText = APP_VERSION;
              setTimeout(() => {
                  fetch(window.location.pathname + "?t=" + Date.now(), { cache: "no-store" })
                      .then(r => r.text())
                      .then(html => {
                          let m = html.match(/const APP_VERSION = ([0-9.]+);/);
                          if (m && parseFloat(m[1]) > APP_VERSION) {
                              window.location.replace(window.location.pathname + "?v=" + m[1]);
                          }
                      }).catch(e => {});
              }, 2000);
              listenToFirebaseConfig();
              document.addEventListener("visibilitychange", () => {
                  if (!document.hidden && currentUser) {
                      if (typeof triggerDataSync === 'function') triggerDataSync();
                  }
              });
              window.addEventListener("focus", () => {
                  if (!document.hidden && currentUser) {
                      if (typeof triggerDataSync === 'function') triggerDataSync();
                  }
              });
              window.addEventListener("pageshow", () => {
                  if (currentUser && typeof triggerDataSync === 'function') triggerDataSync();
              });
            updateAllDateMax();
            loadBranchesCache();
            fetchBranchesFromCloud();
            
            document.getElementById('dash-date').value = todayStr;
            document.getElementById('dash-month').value = currentMonthStr;
            document.getElementById('track-date').value = todayStr;
            if(document.getElementById('bank-in-date')) document.getElementById('bank-in-date').value = todayStr;
            if(document.getElementById('night-date')) document.getElementById('night-date').value = todayStr;
            updateDateDisplay('dash-date'); updateDateDisplay('track-date');
            let savedUrl = localStorage.getItem('global_gs_url');
            if(savedUrl) document.getElementById('global-gs-url').value = savedUrl;
            
            let savedUser = localStorage.getItem('pbi_user');
            if(savedUser) {
                try {
                    currentUser = JSON.parse(savedUser); let role = currentUser.role;
                    
            
                      applyRoleVisibilities();
                      if (typeof updateThemeBtnVisibility === 'function') updateThemeBtnVisibility();


            document.getElementById('header-subtitle').classList.add('hidden');
                    document.getElementById('nav-buttons').classList.add('hidden');
                    document.getElementById('logged-in-controls').classList.remove('hidden'); document.getElementById('logged-in-controls').classList.add('flex');
                    document.getElementById('current-user-name').innerText = currentUser.name; document.getElementById('current-user-role').innerText = role;
                    try { listenToSurveyBadge(); } catch(errSurvey) { console.error("Auto login listenToSurveyBadge err:", errSurvey); }
                    if(role === 'branch') {
                        try { if(typeof setupBranchView === 'function') setupBranchView(); } catch(e){}
                        try { syncBranchFromCloud(); } catch(e){}
                    } else {
                        try { setupManagerView(); } catch(errManager) { console.error("Auto login setupManagerView err:", errManager); }
                    }
                } catch(e) {
                    console.error("Auto-login error:", e);
                }
            }
        });
        
        function setSyncing(status) {
            isSyncing = status;
            let el = document.getElementById('sync-status');
            if(syncTimeout) clearTimeout(syncTimeout);
            
            if(status) { 
                el.classList.remove('hidden'); el.classList.add('flex');
                syncTimeout = setTimeout(() => {
                    setSyncing(false);
                }, 15000);
            } else { 
                el.classList.add('hidden'); el.classList.remove('flex'); 
            }
        }

        function triggerDataSync() {
            if (configListener && typeof configListener.refresh === 'function') configListener.refresh();
            if(!currentUser) return;
            if(currentUser.role === 'branch') syncBranchFromCloud();
            else {
                if (currentTab === 'drop') {
                    if (document.getElementById('drop-start').value && document.getElementById('drop-end').value) {
                        runDropAnalysis();
                    }
                } else if (currentTab === 'lorry') {
                    renderLorryTracker();
                } else {
                    syncManagerFromCloud();
                }
            }
        }

        function listenToFirebaseConfig() {
            if(!db) return;
            if(configListener) return;
            configListener = db.collection("config").doc("system").onSnapshot(doc => {
                if(doc.exists) {
                    let data = doc.data();

                    window.globalConfig = data;

                    if(document.getElementById('btn-toggle-3days')) {
                        let isEnabled = data.enable_3days_alert === true;
                        let btn = document.getElementById('btn-toggle-3days');
                        if(isEnabled) {
                            btn.className = "bg-emerald-600 text-white px-4 py-1.5 rounded-full text-[10px] font-bold transition-colors shadow border border-emerald-500";
                            btn.innerText = "UNLOCKED (ON)";
                        } else {
                            btn.className = "bg-rose-900 text-rose-200 px-4 py-1.5 rounded-full text-[10px] font-bold transition-colors shadow border border-rose-700";
                            btn.innerText = "LOCKED (OFF)";
                        }
                    }
                    if (document.getElementById('limit-sales') && !(document.activeElement && ['limit-sales', 'limit-mykasih', 'limit-lorry'].includes(document.activeElement.id))) {
                        document.getElementById('limit-sales').value = data.limit_sales || '';
                        document.getElementById('limit-mykasih').value = data.limit_mykasih || '';
                        document.getElementById('limit-lorry').value = data.limit_lorry || '';
                    }

                    let lockChanged = false;
                    if (data.past_lock !== undefined) { 
                        if (pastLock !== data.past_lock) lockChanged = true;
                        pastLock = data.past_lock; 
                    } else { 
                        pastLock = true; 
                    }
                    if (data.global_lock !== undefined) {
                        if (masterLock !== data.global_lock) lockChanged = true;
                        masterLock = data.global_lock;
                    }
                    if(typeof updateMasterLockUI === 'function') updateMasterLockUI();
                    if (lockChanged || !window._configLoadedOnce) {
                        window._configLoadedOnce = true;
                        if(currentUser && currentUser.role === 'branch') {
                            if(typeof setupBranchView === 'function') setupBranchView();
                        } else if(typeof refreshCurrentTabView === 'function') {
                            refreshCurrentTabView(true);
                        }
                    }
                }
            });
            if (!window._configHeartbeat) {
                window._configHeartbeat = setInterval(() => {
                    if (!document.hidden && configListener && typeof configListener.refresh === 'function') {
                        configListener.refresh();
                    }
                }, 60000);
            }
        }

        let lastWinRefresh = 0;
        window.addEventListener('focus', () => {
            if (Date.now() - lastWinRefresh < 60000) return;
            lastWinRefresh = Date.now();
            if (configListener && typeof configListener.refresh === 'function') configListener.refresh();
            if (typeof unsubToday !== 'undefined' && unsubToday && typeof unsubToday.refresh === 'function') unsubToday.refresh();
            if (typeof unsubNight !== 'undefined' && unsubNight && typeof unsubNight.refresh === 'function') unsubNight.refresh();
            if (typeof unsubBank !== 'undefined' && unsubBank && typeof unsubBank.refresh === 'function') unsubBank.refresh();
        });
        window.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                if (Date.now() - lastWinRefresh < 60000) return;
                lastWinRefresh = Date.now();
                if (configListener && typeof configListener.refresh === 'function') configListener.refresh();
                if (typeof unsubToday !== 'undefined' && unsubToday && typeof unsubToday.refresh === 'function') unsubToday.refresh();
                if (typeof unsubNight !== 'undefined' && unsubNight && typeof unsubNight.refresh === 'function') unsubNight.refresh();
                if (typeof unsubBank !== 'undefined' && unsubBank && typeof unsubBank.refresh === 'function') unsubBank.refresh();
            }
        });
        let unsubNight = null;
        function syncBranchNightData() {
            let ndate = document.getElementById('night-date') ? document.getElementById('night-date').value : todayStr;
            setSyncing(true);
            let docId = ndate + "_" + currentUser.id;
            if(unsubNight) unsubNight();
            unsubNight = db.collection("submissions").doc(docId).onSnapshot(doc => {
                dbSubmissions = dbSubmissions.filter(s => !(s.code == currentUser.id && s.date === ndate));
                if(doc.exists) dbSubmissions.push(doc.data());
                setupBranchView();
                setSyncing(false);
            }, e => { console.error(e); setupBranchView(); setSyncing(false); });
        }

        let unsubToday = null;
        function syncBranchFromCloud() {
            try { if(typeof setupBranchView === 'function') setupBranchView(); } catch(e){ console.error(e); }
            if (unsubToday && typeof unsubToday.refresh === 'function') {
                unsubToday.refresh();
                if (configListener && typeof configListener.refresh === 'function') configListener.refresh();
                return;
            }
            setSyncing(true);
            let docId = todayStr + "_" + currentUser.id;
            if(unsubToday) unsubToday();
            unsubToday = db.collection("submissions").doc(docId).onSnapshot(doc => {
                try {
                    dbSubmissions = dbSubmissions.filter(s => !(s.code == currentUser.id && s.date === todayStr));
                    if(doc.exists) dbSubmissions.push(doc.data());
                    setupBranchView();
                } catch(e) { console.error("Error in setupBranchView:", e); }
                finally { setSyncing(false); }
            }, e => { console.error(e); try{ setupBranchView(); }catch(err){} setSyncing(false); });
        }

        let unsubBank = null;
        function syncBranchBankData() {
            try { if(typeof setupBranchView === 'function') setupBranchView(); } catch(e){ console.error(e); }
            let bDate = document.getElementById('bank-in-date').value;
            setSyncing(true);
            let docId = bDate + "_" + currentUser.id;
            if(unsubBank) unsubBank();
            unsubBank = db.collection("submissions").doc(docId).onSnapshot(doc => {
                try {
                    dbSubmissions = dbSubmissions.filter(s => !(s.code == currentUser.id && s.date === bDate));
                    if(doc.exists) dbSubmissions.push(doc.data());
                    setupBranchView();
                } catch(e) { console.error("Error in setupBranchView:", e); }
                finally { setSyncing(false); }
            }, e => { console.error(e); try{ setupBranchView(); }catch(err){} setSyncing(false); });
        }

        window.activeListeners = window.activeListeners || {};
        window.fetchedQueries = window.fetchedQueries || {};

        function clearCacheAndRefresh() {
            setSyncing(true);
            
            // Clear current listeners
            for (let key in window.activeListeners) {
                if (typeof window.activeListeners[key] === 'function') {
                    window.activeListeners[key]();
                }
            }
            window.activeListeners = {};
            window.fetchedQueries = {};
            dbSubmissions = [];
            
            // Re-fetch everything
            if (currentUser.role === 'branch') {
                syncBranchFromCloud();
            } else {
                syncManagerFromCloud();
            }
        }

        function refreshCurrentTabView(force = false) {
            if (!force && window.isFillingSurveyActive) {
                return;
            }
            if (!force && document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) && !['date', 'month', 'checkbox', 'radio'].includes(document.activeElement.type)) {
                return; // Prevent screen blink or focus loss when user is actively typing in a text field
            }
            if (currentTab === 'dashboard') renderDashboard();
            else if (currentTab === 'analytics' && typeof renderExecCharts === 'function') renderExecCharts();
            else if (currentTab === 'comparison') renderComparisonTable();
            else if (currentTab === 'tracking') renderTrackingTable();
            else if (currentTab === 'lorry') renderLorryTracker();
            else if (currentTab === 'target') loadTargetTracker(force);
            else if (currentTab === 'drop') {
                if (document.getElementById('drop-start') && document.getElementById('drop-start').value && document.getElementById('drop-end') && document.getElementById('drop-end').value) runDropAnalysis();
            }
            else if (currentTab === 'survey') {
                if (typeof renderSurveys === 'function') renderSurveys();
                if (typeof updateSurveyUI === 'function') updateSurveyUI();
            }
            else if (currentTab === 'control') {
                if (typeof renderAuditLogs === 'function') renderAuditLogs();
            }
            else if (currentTab === 'exec-charts') {
                if (typeof renderExecCharts === 'function') renderExecCharts();
            }
            if (typeof applyRoleVisibilities === 'function') applyRoleVisibilities();
        }

        async function fetchSubmissionsChunked(monthStr, amName, forceRaw = false) {
            let recordMap = new Map();
            let isDaily = monthStr && monthStr.length === 10;
            let startD = isDaily ? monthStr : monthStr + "-01";
            let endD = isDaily ? monthStr : monthStr + "-31";

            let sumDataLoaded = false;
            if (!forceRaw && typeof queryMonthlySummariesData === 'function') {
                try {
                    let sumData = await queryMonthlySummariesData(startD, endD, amName);
                    if (sumData && sumData.length > 0) {
                        sumData.forEach(item => {
                            let k = typeof getCanonicalSubKey === 'function' ? getCanonicalSubKey(item) : (String(item.code) + "_" + String(item.date));
                            if (k) recordMap.set(k, item);
                        });
                        sumDataLoaded = true;
                    }
                } catch (e) {
                    console.error("Failed monthly summaries read:", e);
                }
            }

            try {
                let timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Direct submissions query timed out after 60s")), 60000));
                
                // If sumData is loaded, ONLY fetch today's date from submissions (to get live unlock/bank times).
                // Do not fetch the entire month from submissions and hammer the DB!
                let todayStr = new Date().toLocaleDateString('en-CA', {timeZone: 'Asia/Kuala_Lumpur'}).substring(0, 10);
                let fetchStart = startD;
                let fetchEnd = endD;
                if (sumDataLoaded && !isDaily) {
                    // Only fetch today if it falls within the month we are fetching
                    if (todayStr >= startD && todayStr <= endD) {
                        fetchStart = todayStr;
                        fetchEnd = todayStr;
                    } else {
                        // Skip submissions query entirely if today is not in the month requested
                        fetchStart = null;
                    }
                }

                if (fetchStart && fetchEnd) {
                    if (!isDaily && fetchStart !== fetchEnd && (!currentUser || currentUser.role !== 'branch')) {
                        let intervals = [
                            [monthStr + "-01", monthStr + "-08"],
                            [monthStr + "-09", monthStr + "-16"],
                            [monthStr + "-17", monthStr + "-24"],
                            [monthStr + "-25", monthStr + "-31"]
                        ];
                        let queries = intervals.map(r => db.collection("submissions").where("date", ">=", r[0]).where("date", "<=", r[1]).get());
                        let snaps = await Promise.race([Promise.all(queries), timeoutPromise]);
                        snaps.forEach(snap => {
                            snap.forEach(doc => {
                                if (doc && doc.exists) {
                                    let d = doc.data();
                                    if (d && d.code != null && d.date) {
                                        let k = typeof getCanonicalSubKey === 'function' ? getCanonicalSubKey(d) : (String(d.code) + "_" + String(d.date));
                                        if (k) recordMap.set(k, d);
                                    }
                                }
                            });
                        });
                    } else {
                        let q = db.collection("submissions").where("date", ">=", fetchStart).where("date", "<=", fetchEnd);
                    if (currentUser && currentUser.role === 'branch') {
                        q = q.where("code", "==", String(currentUser.id));
                    }
                    let snap = await Promise.race([q.get(), timeoutPromise]);
                    snap.forEach(doc => {
                        if (doc && doc.exists) {
                            let d = doc.data();
                            if (d && d.code != null && d.date) {
                                let k = typeof getCanonicalSubKey === 'function' ? getCanonicalSubKey(d) : (String(d.code) + "_" + String(d.date));
                                if (k) recordMap.set(k, d);
                            }
                        }
                    });
                }
                }
            } catch (e) {
                console.warn("Direct submissions query failed or timed out (using summary/cache):", e.message || e);
            }

            let combined = [];
            recordMap.forEach(val => {
                combined.push({
                    exists: true,
                    data: () => val
                });
            });
            if (amName && (!currentUser || currentUser.role === 'am')) {
                let targetAM = String(amName).trim().toUpperCase();
                let branches = typeof getManagerFilteredBranches === 'function' ? getManagerFilteredBranches() : (typeof masterBranches !== 'undefined' ? masterBranches.filter(b => (b.am || '').trim().toUpperCase() === targetAM || (b.am || '').trim().toUpperCase().includes(targetAM)) : []);
                let allowedCodes = new Set(branches.map(b => String(b.code).trim()));
                if (allowedCodes.size > 0) {
                    combined = combined.filter(doc => {
                        let d = doc.data();
                        if (!d || !d.code) return false;
                        let cTrim = String(d.code).trim();
                        let cNum = !isNaN(Number(cTrim)) ? Number(cTrim) : null;
                        let cPad = /^\d+$/.test(cTrim) ? cTrim.padStart(4, '0') : cTrim;
                        return allowedCodes.has(cTrim) || (cNum !== null && allowedCodes.has(String(cNum))) || allowedCodes.has(cPad);
                    });
                }
            }
            return combined;
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
        window.deduplicateSubmissionsList = deduplicateSubmissionsList;

        let _syncDebounceTimer = null;
        function debouncedTriggerSync() {
            if (_syncDebounceTimer) clearTimeout(_syncDebounceTimer);
            _syncDebounceTimer = setTimeout(() => {
                if (currentUser && currentUser.role !== 'branch') {
                    syncManagerFromCloud();
                } else if (currentUser && currentUser.role === 'branch') {
                    syncBranchFromCloud();
                }
            }, 800);
        }
        window.debouncedTriggerSync = debouncedTriggerSync;

        function syncManagerFromCloud(forceRefresh = false) {
            let mode = 'daily';
            let dateStr = todayStr;
            
            if (currentTab === 'dashboard') {
                mode = document.getElementById('dash-mode').value;
                dateStr = mode === 'daily' ? document.getElementById('dash-date').value : document.getElementById('dash-month').value;
            } else if (currentTab === 'analytics') {
                mode = 'monthly';
                dateStr = todayStr.substring(0,7);
            } else if (currentTab === 'comparison') {
                mode = 'monthly';
                dateStr = document.getElementById('compare-month') ? document.getElementById('compare-month').value : todayStr.substring(0,7);
            } else if (currentTab === 'tracking') {
                mode = 'daily';
                dateStr = document.getElementById('track-date').value;
            } else if (currentTab === 'lorry') {
                mode = 'monthly';
                dateStr = document.getElementById('lorry-month') ? document.getElementById('lorry-month').value : todayStr.substring(0,7);
            } else if (currentTab === 'target') {
                mode = 'monthly';
                dateStr = document.getElementById('target-month') ? document.getElementById('target-month').value : todayStr.substring(0,7);
            } else if (currentTab === 'exec-charts') {
                mode = (typeof execCurrentTimeframe !== 'undefined' && execCurrentTimeframe === 'daily') ? 'daily' : 'monthly';
                dateStr = mode === 'daily' ? (document.getElementById('exec-filter-date').value || todayStr) : (document.getElementById('exec-filter-month').value || todayStr.substring(0,7));
            } else if (currentTab === 'drop') {
                return;
            }

            if (!dateStr) return;
            let userKeyPart = currentUser ? (currentUser.role + "_" + (currentUser.name || currentUser.id || "")) : 'anon';
            let queryKey = mode + "_" + dateStr + "_" + userKeyPart;

            if (!forceRefresh && (window.activeListeners[queryKey] || window.fetchedQueries[queryKey])) {
                if (window.fetchedQueries[queryKey] && mode === 'daily' && !dbSubmissions.some(s => s.date === dateStr)) {
                    delete window.fetchedQueries[queryKey];
                    if (window.activeListeners[queryKey]) {
                        try { window.activeListeners[queryKey](); } catch(e){}
                        delete window.activeListeners[queryKey];
                    }
                } else {
                    refreshCurrentTabView();
                    if(currentTab==='dashboard' && mode === 'daily') setTimeout(() => check3DaysDropAlert(dateStr), 100);
                    return;
                }
            }

            setSyncing(true);
            
            let fetchMode = mode;
            let fetchDateStr = dateStr;

            let processSnap = async (snap) => {
                let fbData = [];
                snap.forEach(doc => { let d = doc.data(); if(d && d.date) fbData.push(d); });
                if (typeof queryMonthlySummariesData === 'function' && fetchMode === 'daily') {
                    try {
                        let startD = fetchDateStr;
                        let endD = fetchDateStr;
                        let amFilterVal = (currentUser && currentUser.role === 'am') ? currentUser.name : "";
                        let sumDaily = await queryMonthlySummariesData(startD, endD, amFilterVal, forceRefresh);
                        if (sumDaily && sumDaily.length > 0) {
                            let existSet = new Set(fbData.map(s => String(s.code).trim() + "_" + String(s.date).trim()));
                            sumDaily.forEach(item => {
                                let k = String(item.code).trim() + "_" + String(item.date).trim();
                                if (!existSet.has(k)) fbData.push(item);
                            });
                        }
                    } catch(e) {}
                }
                if (fbData.length > 0) {
                    try { localStorage.setItem('cache_sub_' + queryKey, JSON.stringify(fbData)); } catch(e){}
                } else {
                    let cached = localStorage.getItem('cache_sub_' + queryKey);
                    if (cached) {
                        try {
                            let parsed = JSON.parse(cached);
                            if (Array.isArray(parsed) && parsed.length > 0) fbData = parsed;
                        } catch(e){}
                    }
                }
                dbSubmissions = dbSubmissions.filter(s => fetchMode === 'daily' ? s.date !== fetchDateStr : !s.date.startsWith(fetchDateStr));
                dbSubmissions = deduplicateSubmissionsList(dbSubmissions.concat(fbData));
                window.fetchedQueries[queryKey] = true;
                refreshCurrentTabView();
                if(currentTab==='dashboard' && mode === 'daily') setTimeout(() => check3DaysDropAlert(dateStr), 100);
                setSyncing(false);
            };

            if (!window.fetchedQueries[queryKey]) {
                try {
                    let cached = localStorage.getItem('cache_sub_' + queryKey);
                    if (cached) {
                        let parsed = JSON.parse(cached);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            dbSubmissions = dbSubmissions.filter(s => fetchMode === 'daily' ? s.date !== fetchDateStr : !s.date.startsWith(fetchDateStr));
                            dbSubmissions = deduplicateSubmissionsList(dbSubmissions.concat(parsed));
                            refreshCurrentTabView();
                        }
                    }
                } catch(e){}
            }

            // Clear previous listener if exists
            if (window.activeListeners[queryKey]) {
                window.activeListeners[queryKey]();
                delete window.activeListeners[queryKey];
            }

            if (fetchMode === 'monthly') {
                fetchSubmissionsChunked(fetchDateStr, (currentUser && currentUser.role === 'am') ? currentUser.name : null, false)
                    .then(processSnap)
                    .catch(e => {
                        console.error("Monthly sync failed", e);
                        setSyncing(false);
                    });
            } else {
                let query = db.collection("submissions").where("date", "==", fetchDateStr);
                if (currentUser && currentUser.role === 'branch') {
                    query = query.where("code", "==", String(currentUser.id));
                }
                let snapTimer = null;
                window.activeListeners[queryKey] = query.onSnapshot(snap => {
                    if (snapTimer) clearTimeout(snapTimer);
                    snapTimer = setTimeout(() => { processSnap(snap); }, 800);
                }, e => {
                    console.error("Live sync failed", e);
                    setSyncing(false);
                });
            }
        }

        window.historicalDropCache = window.historicalDropCache || {};
        let checkDropAlertId = 0;
        let syncTimeout;

        async function check3DaysDropAlert(currentDateStr) {
            let currentId = ++checkDropAlertId;
            let alertBox = document.getElementById('alert-3days-drop');
            let alertContent = document.getElementById('alert-3days-content');
            if(!alertBox) return;

            if(!window.globalConfig || window.globalConfig.enable_3days_alert !== true) {
                alertBox.classList.add('hidden');
                return;
            }
            
            let modeEl = document.getElementById('dash-mode');
            if(!modeEl || modeEl.value !== 'daily') {
                alertBox.classList.add('hidden');
                return;
            }

            let d = new Date(currentDateStr);
            let dates = [];
            for(let i=0; i<3; i++) {
                let dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                dates.push(dStr);
                d.setDate(d.getDate() - 1);
            }

            try {
                if(alertBox.classList.contains('hidden') || !alertContent.innerHTML.includes('Branch List')) {
                    alertBox.classList.remove('hidden');
                    alertContent.innerHTML = `<div class="py-3 text-center text-rose-300 font-bold animate-pulse text-xs"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Analyzing sales records... Please wait.</div>`;
                }

                let datesToFetch = [dates[1], dates[2]].filter(d => !window.historicalDropCache[d]);
                if(datesToFetch.length > 0) {
                    let minDate = datesToFetch.reduce((a, b) => a < b ? a : b);
                    let maxDate = datesToFetch.reduce((a, b) => a > b ? a : b);
                    let rangeData = await fetchRangeFromSummaries(minDate, maxDate);
                    if(currentId !== checkDropAlertId) return;
                    
                    datesToFetch.forEach(dStr => {
                        window.historicalDropCache[dStr] = {};
                        rangeData.filter(x => x.date === dStr).forEach(data => {
                            window.historicalDropCache[dStr][data.code] = parseFloat(data.sales) || 0;
                        });
                    });
                }

                if(currentId !== checkDropAlertId) return;

                let currentDayRecords = {};
                dbSubmissions.forEach(data => {
                    if(data.date === dates[0]) {
                        currentDayRecords[data.code] = parseFloat(data.sales) || 0;
                    }
                });

                let branches = getManagerFilteredBranches();
                let droppingBranches = [];

                branches.forEach(b => {
                    let s0 = currentDayRecords[b.code] !== undefined ? currentDayRecords[b.code] : null;
                    let s1 = window.historicalDropCache[dates[1]] && window.historicalDropCache[dates[1]][b.code] !== undefined ? window.historicalDropCache[dates[1]][b.code] : null;
                    let s2 = window.historicalDropCache[dates[2]] && window.historicalDropCache[dates[2]][b.code] !== undefined ? window.historicalDropCache[dates[2]][b.code] : null;
                    
                    if(s0 !== null && s1 !== null && s2 !== null) {
                        if(s0 > 0 && s1 > 0 && s2 > 0) {
                            if(s0 < s1 && s1 < s2) {
                                droppingBranches.push({ code: b.code, name: b.name, am: b.am });
                            }
                        }
                    }
                });

                if(droppingBranches.length > 0) {
                    droppingBranches.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                    window.dropAlertList = droppingBranches.map(b => {
                        if(currentUser.role === 'admin' || currentUser.role === 'operation') {
                            return `${b.code} - ${b.name} (AM: ${b.am || 'N/A'})`;
                        } else {
                            return b.name;
                        }
                    });
                    
                    window.renderDropAlertPage = function(page) {
                        const ITEMS_PER_PAGE = 15;
                        let totalPages = Math.ceil(window.dropAlertList.length / ITEMS_PER_PAGE);
                        if(page < 1) page = 1;
                        if(page > totalPages) page = totalPages;
                        
                        let start = (page - 1) * ITEMS_PER_PAGE;
                        let end = start + ITEMS_PER_PAGE;
                        let pageItems = window.dropAlertList.slice(start, end);
                        
                        let htmlList = pageItems.map(item => `<li>&#x2022; ${item}</li>`).join('');
                        
                        let paginationHtml = '';
                        if(totalPages > 1) {
                            paginationHtml = `
                            <div class="flex items-center gap-2 mt-4 justify-center">
                                <button onclick="renderDropAlertPage(${page - 1})" class="px-3 py-1 bg-rose-950 border border-rose-800 hover:bg-rose-900 rounded text-[10px] ${page === 1 ? 'opacity-50 cursor-not-allowed' : ''}" ${page === 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left mr-1"></i> Prev</button>
                                <span class="text-[10px] font-bold">Page ${page} of ${totalPages}</span>
                                <button onclick="renderDropAlertPage(${page + 1})" class="px-3 py-1 bg-rose-950 border border-rose-800 hover:bg-rose-900 rounded text-[10px] ${page === totalPages ? 'opacity-50 cursor-not-allowed' : ''}" ${page === totalPages ? 'disabled' : ''}>Next <i class="fa-solid fa-chevron-right ml-1"></i></button>
                            </div>`;
                        }

                        alertContent.innerHTML = `Branch List (Based on date ${currentDateStr}): <br><ul class="mt-2 mb-2 space-y-1 font-bold text-rose-300 text-[10px] leading-tight">${htmlList}</ul>${paginationHtml}<div class="mt-3 text-center"><span class="italic text-[10px]">Please investigate immediately. Total: ${window.dropAlertList.length} Branches</span></div>`;
                    };
                    
                    window.renderDropAlertPage(1);
                    alertBox.classList.remove('hidden');
                } else {
                    alertBox.classList.add('hidden');
                }
            } catch(e) {
                console.error("Drop alert error", e);
            }
        }

        function logAuditAction(actionType, payloadData) {
            let docId = Date.now().toString() + "_" + Math.random().toString(36).substring(7);
                        let bAm = "";
            if (payloadData && payloadData.code) {
                let b = masterBranches.find(x => x.code == payloadData.code);
                if (b && b.am) bAm = b.am;
            }
            let actionName = actionType;
            if (actionType === 'set_global_lock') actionName = (payloadData && payloadData.locked) ? 'LOCK SYSTEM (TODAY)' : 'UNLOCK SYSTEM (TODAY)';
            if (actionType === 'set_past_lock') actionName = (payloadData && payloadData.locked) ? 'LOCK SYSTEM (PAST)' : 'UNLOCK SYSTEM (PAST)';

            db.collection('audit_logs').doc(docId).set({
                timestamp: new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kuala_Lumpur' }),
                timestamp_ms: Date.now(),
                user: currentUser ? currentUser.name : "Unknown",
                role: currentUser ? currentUser.role : "Unknown",
                action: actionName,
                target_code: (payloadData && payloadData.code) ? String(payloadData.code) : "ALL BRANCHES",
                target_date: (payloadData && payloadData.date) ? payloadData.date : "GLOBAL",
                target_am: bAm
            }).catch(e => console.error("Audit log error", e));
        }

        async function updateMonthlySummary(payloadData, bAm, overrideOldRec = null) {
            if (!payloadData || !payloadData.date || !payloadData.code) return;
            let cTrim = String(payloadData.code).trim();
            let cNum = !isNaN(Number(cTrim)) ? Number(cTrim) : null;
            let cPad = /^\d+$/.test(cTrim) ? cTrim.padStart(4, '0') : cTrim;
            let mb = masterBranches && masterBranches.find(x => String(x.code).trim() === cTrim || (cNum !== null && Number(x.code) === cNum) || String(x.code).trim() === cPad);
            if (mb && mb.am) bAm = String(mb.am).trim().toUpperCase();
            if (mb && mb.name) payloadData.name = mb.name;
            let monthStr = payloadData.date.substring(0, 7);
            let [sy, sm, sd] = payloadData.date.split('-').map(Number);
            let dObj = new Date(sy, sm-1, sd, 12, 0, 0, 0);
            let dayStr = sd < 10 ? '0'+sd : ''+sd;
            
            let weeks = typeof getWeeksForMonth === 'function' ? getWeeksForMonth(sy, sm) : [];
            let weekLabel = null;
            for(let w of weeks) {
                let wStart = new Date(w.start); wStart.setHours(0,0,0,0);
                let wEnd = new Date(w.end); wEnd.setHours(23,59,59,999);
                if(dObj >= wStart && dObj <= wEnd) {
                    weekLabel = w.label;
                    break;
                }
            }

            let oldRec = overrideOldRec || dbSubmissions.find(s => s.code == payloadData.code && s.date === payloadData.date);
            if (!oldRec) {
                try {
                    let oldRecDoc = await db.collection("submissions").doc(payloadData.date + "_" + payloadData.code).get();
                    if (oldRecDoc.exists) oldRec = oldRecDoc.data();
                } catch(e) { console.error(e); }
            }
            let oldSales = oldRec ? (parseFloat(oldRec.sales) || 0) : 0;
            let oldLorry = oldRec ? (parseFloat(oldRec.lorry) || 0) : 0;
            let oldMyKasih = oldRec ? (parseFloat(oldRec.mykasih) || 0) : 0;
            let oldTrans = oldRec ? (parseInt(oldRec.transactions) || 0) : 0;
            let oldBank1 = oldRec ? (parseFloat(oldRec.bank1) || 0) : 0;
            let oldBank2 = oldRec ? (parseFloat(oldRec.bank2) || 0) : 0;
            
            let newSales = payloadData.sales !== undefined ? parseFloat(payloadData.sales) || 0 : oldSales;
            let newLorry = payloadData.lorry !== undefined ? parseFloat(payloadData.lorry) || 0 : oldLorry;
            let newMyKasih = payloadData.mykasih !== undefined ? parseFloat(payloadData.mykasih) || 0 : oldMyKasih;
            let newTrans = payloadData.transactions !== undefined ? parseInt(payloadData.transactions) || 0 : oldTrans;
            let newBank1 = payloadData.bank1 !== undefined ? parseFloat(payloadData.bank1) || 0 : oldBank1;
            let newBank2 = payloadData.bank2 !== undefined ? parseFloat(payloadData.bank2) || 0 : oldBank2;
            
            let diffSales = newSales - oldSales;
            let diffLorry = newLorry - oldLorry;
            let diffMyKasih = newMyKasih - oldMyKasih;
            let diffTrans = newTrans - oldTrans;
            let diffBank1 = newBank1 - oldBank1;
            let diffBank2 = newBank2 - oldBank2;
            
            let oldTrips = (oldLorry > 0) ? 1 : 0;
            let newTrips = (newLorry > 0) ? 1 : 0;
            let diffTrips = newTrips - oldTrips;

            if(diffSales === 0 && diffLorry === 0 && diffTrips === 0 && diffMyKasih === 0 && diffTrans === 0 && diffBank1 === 0 && diffBank2 === 0) return;

            let amKey = bAm || "UNASSIGNED";
            amKey = amKey.replace(/\//g, '-'); 
            let docId = monthStr + "_" + amKey;

            let updateObj = {};
            if(diffSales !== 0) updateObj[`branches.${payloadData.code}.totalSales`] = firebase.firestore.FieldValue.increment(diffSales);
            if(diffLorry !== 0) updateObj[`branches.${payloadData.code}.totalLorry`] = firebase.firestore.FieldValue.increment(diffLorry);
            
            if(diffSales !== 0) updateObj[`branches.${payloadData.code}.daily.${dayStr}.s`] = firebase.firestore.FieldValue.increment(diffSales);
            if(diffLorry !== 0) updateObj[`branches.${payloadData.code}.daily.${dayStr}.l`] = firebase.firestore.FieldValue.increment(diffLorry);
            if(diffMyKasih !== 0) updateObj[`branches.${payloadData.code}.daily.${dayStr}.m`] = firebase.firestore.FieldValue.increment(diffMyKasih);
            if(diffTrans !== 0) updateObj[`branches.${payloadData.code}.daily.${dayStr}.t`] = firebase.firestore.FieldValue.increment(diffTrans);
            if(diffBank1 !== 0) updateObj[`branches.${payloadData.code}.daily.${dayStr}.b1`] = firebase.firestore.FieldValue.increment(diffBank1);
            if(diffBank2 !== 0) updateObj[`branches.${payloadData.code}.daily.${dayStr}.b2`] = firebase.firestore.FieldValue.increment(diffBank2);
            
            if(weekLabel && diffTrips !== 0) {
                updateObj[`branches.${payloadData.code}.weeksCount.${weekLabel}`] = firebase.firestore.FieldValue.increment(diffTrips);
            }
            updateObj[`branches.${payloadData.code}.am`] = bAm || "";
            updateObj[`branches.${payloadData.code}.name`] = payloadData.name || (oldRec ? oldRec.name : "");
            updateObj[`am`] = bAm || "UNASSIGNED";
            updateObj[`month`] = monthStr;

            try {
                await db.collection("monthly_summaries").doc(docId).set(updateObj, {merge: true});
            } catch(e) {
                console.error("Failed to update summary", e);
            }
        }

        function syncToCloud(action, payloadData, callback) {
            setSyncing(true);
            sessionStorage.clear(); // Clear cache to ensure fresh data after mutation
            if (window._monthlySummaryCache) window._monthlySummaryCache = {};
            
            if(['reset_night', 'reset_bank', 'unlock_night', 'unlock_bank2', 'master_reset'].includes(action)) {
                logAuditAction(action, payloadData);
            }
            
            let bAm = "";
            if (payloadData && payloadData.code) {
                let cTrim = String(payloadData.code).trim();
                let cNum = !isNaN(Number(cTrim)) ? Number(cTrim) : null;
                let cPad = /^\d+$/.test(cTrim) ? cTrim.padStart(4, '0') : cTrim;
                let b = typeof masterBranches !== 'undefined' && Array.isArray(masterBranches) ? masterBranches.find(x => String(x.code).trim() === cTrim || (cNum !== null && Number(x.code) === cNum) || String(x.code).trim() === cPad) : null;
                if (b && b.am) bAm = String(b.am).trim().toUpperCase();
                else if (payloadData.am) bAm = String(payloadData.am).trim().toUpperCase();
                else if (currentUser && currentUser.am) bAm = String(currentUser.am).trim().toUpperCase();
            }

            let fbPromise = Promise.resolve();
            if (action === 'reset_night' && payloadData.date && payloadData.code) {
                let docId = payloadData.date + "_" + payloadData.code;
                let payload = { sales: 0, transactions: 0, mykasih: 0, lorry: 0, date: payloadData.date, code: payloadData.code };
                fbPromise = db.collection("submissions").doc(docId).set({
                    date: payloadData.date, code: payloadData.code,
                    sales: 0, transactions: 0, mykasih: 0, lorry: 0, night_locked: false, night_submit_time: "", night_unlocked: false, am: bAm
                }, {merge: true}).then(() => {
                    setTimeout(() => { updateMonthlySummary(payload, bAm).catch(e => console.error(e)); }, 10);
                });
            } else if (action === 'reset_bank' && payloadData.date && payloadData.code) {
                let docId = payloadData.date + "_" + payloadData.code;
                let payload = { bank1: 0, bank2: 0, date: payloadData.date, code: payloadData.code };
                fbPromise = db.collection("submissions").doc(docId).set({
                    date: payloadData.date, code: payloadData.code,
                    bank1: 0, bank2: 0, bank1_time: "", bank2_time: "", bank2_unlocked: true, am: bAm
                }, {merge: true}).then(() => {
                    setTimeout(() => { updateMonthlySummary(payload, bAm).catch(e => console.error(e)); }, 10);
                });
            } else if (action === 'unlock_night' && payloadData.date && payloadData.code) {
                let docId = payloadData.date + "_" + payloadData.code;
                fbPromise = db.collection("submissions").doc(docId).set({ date: payloadData.date, code: payloadData.code, night_unlocked: true, night_locked: false, am: bAm }, {merge: true});
            } else if (action === 'unlock_bank2' && payloadData.date && payloadData.code) {
                let docId = payloadData.date + "_" + payloadData.code;
                fbPromise = db.collection("submissions").doc(docId).set({ date: payloadData.date, code: payloadData.code, bank2_unlocked: true, am: bAm }, {merge: true});
            } else if (action === 'master_reset' && payloadData.date) {
                fbPromise = db.collection("submissions").where("date", "==", payloadData.date).get().then(async snap => {
                    let docs = snap.docs;
                    for (let i = 0; i < docs.length; i += 400) {
                        let batch = db.batch();
                        let chunk = docs.slice(i, i + 400);
                        chunk.forEach(doc => {
                              let payload = { sales: 0, transactions: 0, mykasih: 0, lorry: 0, bank1: 0, bank2: 0, date: payloadData.date, code: doc.data().code };
                              updateMonthlySummary(payload, doc.data().am, doc.data());
                              batch.update(doc.ref, { sales: 0, transactions: 0, mykasih: 0, lorry: 0, bank1: 0, bank2: 0, night_locked: false, night_submit_time: "", night_unlocked: false, bank1_time: "", bank2_time: "", bank2_unlocked: true });
                        });
                        await batch.commit();
                    }
                });
            } else if (payloadData && payloadData.date && payloadData.code) {
                let docId = payloadData.date + "_" + payloadData.code;
                payloadData.am = bAm;
                fbPromise = db.collection("submissions").doc(docId).set(payloadData, {merge: true}).then(() => {
                    if (typeof payloadData.sales !== 'undefined' || typeof payloadData.lorry !== 'undefined' || typeof payloadData.bank1 !== 'undefined' || typeof payloadData.bank2 !== 'undefined') {
                        setTimeout(() => { updateMonthlySummary(payloadData, bAm).catch(e => console.error(e)); }, 10);
                    }
                });
            } else if (action === 'set_global_lock') {
                fbPromise = db.collection("config").doc("system").set({global_lock: payloadData.locked}, {merge: true});
            } else if (action === 'set_past_lock') {
                fbPromise = db.collection("config").doc("system").set({past_lock: payloadData.locked}, {merge: true});
            }

            fbPromise.then(() => {
                showToast('success', 'Data Saved!');
                if(callback) callback();
                setSyncing(false);
            }).catch(e => {
                console.error("Firebase Save Error:", e);
                showToast('error', 'Network Error! Failed to save.');
                setSyncing(false);
            });
        }

        // --- 3. UI/Routing ---
        function updateDateDisplay(id) { 
            let el = document.getElementById(id);
            if (!el) return;
            let v = el.value;
            if (!v) {
                v = (id === 'dash-month' || id === 'compare-month') ? getYYYYMMDD(new Date()).substring(0, 7) : getYYYYMMDD(new Date());
                el.value = v;
            }
            if(id === 'dash-month') {
                let modeEl = document.getElementById('dash-mode');
                if (modeEl && modeEl.value === 'monthly') {
                    let dArr = v.split('-'); if(dArr.length===2) {
                        let disp = document.getElementById('dash-date-display');
                        if (disp) disp.innerText = `${dArr[1]}/${dArr[0]}`;
                    }
                }
            } else if (id === 'dash-date') {
                let dArr = v.split('-'); if(dArr.length===3) {
                    let disp = document.getElementById('dash-date-display');
                    if (disp) disp.innerText = `${dArr[2]}/${dArr[1]}/${dArr[0]}`;
                }
            } else {
                let dArr = v.split('-'); if(dArr.length===3) {
                    let disp = document.getElementById(id+'-display');
                    if (disp) disp.innerText = `${dArr[2]}/${dArr[1]}/${dArr[0]}`;
                }
            }
        }
        
        function toggleDashMode() {
            let mode = document.getElementById('dash-mode').value;
            if(mode === 'daily') {
                document.getElementById('dash-date').classList.remove('hidden'); document.getElementById('dash-month').classList.add('hidden');
                updateDateDisplay('dash-date');
            } else {
                document.getElementById('dash-date').classList.add('hidden'); document.getElementById('dash-month').classList.remove('hidden');
                updateDateDisplay('dash-month');
            }
            triggerDataSync();
        }
        
        function openLoginModal(role) {
            document.getElementById('auth-role').value = role;
            document.getElementById('auth-search-container').classList.add('hidden');
            document.getElementById('auth-popup').classList.add('hidden');
            document.getElementById('auth-search').value = ""; document.getElementById('auth-selected-id').value = ""; document.getElementById('auth-pwd').value = "";
            document.getElementById('auth-title').innerText = role==='branch'?(currentLang==='EN'?"Branch Login":"Log Masuk Branch"):role==='am'?(currentLang==='EN'?"AM Login":"Log Masuk AM"):role==='operation'?(currentLang==='EN'?"Operation Login":"Log Masuk Operasi"):(currentLang==='EN'?"Admin Login":"Log Masuk Admin");
            if (role === 'branch' || role === 'am') {
                document.getElementById('auth-search-container').classList.remove('hidden');
                if (!masterBranches || masterBranches.length === 0) {
                    loadBranchesCache();
                    fetchBranchesFromCloud();
                }
            }
            document.getElementById('auth-modal').classList.remove('hidden'); document.getElementById('auth-modal').classList.add('flex');
        }

        function closeModal(id) { document.getElementById(id).classList.add('hidden'); document.getElementById(id).classList.remove('flex'); }

        function handleAuthSearch(val) {
            let pop = document.getElementById('auth-popup'); let role = document.getElementById('auth-role').value;
            let term = val ? val.toLowerCase() : ""; let html = "";
            if (role === 'branch' || role === 'am') {
                if (!masterBranches || masterBranches.length === 0) {
                    pop.innerHTML = '<div class="p-4 text-xs font-bold text-cyan-400 flex items-center gap-2"><i class="fa-solid fa-spinner fa-spin"></i> Loading branches & AM list...</div>';
                    pop.classList.remove('hidden');
                    return;
                }
            }
            if (role === 'branch') {
                let filtered = masterBranches;
                if(term) filtered = masterBranches.filter(b => String(b.code).toLowerCase().includes(term) || String(b.name).toLowerCase().includes(term));
                html = filtered.slice(0, 50).map(b => `<div onclick="selectAuth(&quot;${b.code}&quot;, &quot;${String(b.name).replace(/"/g, '&quot;')}&quot;)" class="p-3 text-xs font-bold text-white cursor-pointer hover:bg-slate-800"><span class="text-cyan-400 mr-2">${b.code}</span> ${b.name}</div>`).join('');
            } else if (role === 'am') {
                let filtered = [...new Set(masterBranches.map(b=>b.am).filter(Boolean))];
                if(term) filtered = filtered.filter(a => String(a).toLowerCase().includes(term));
                html = filtered.slice(0, 50).map(a => `<div onclick="selectAuth(&quot;${String(a).replace(/"/g, '&quot;')}&quot;, &quot;${String(a).replace(/"/g, '&quot;')}&quot;)" class="p-3 text-xs font-bold text-white cursor-pointer hover:bg-slate-800"><i class="fa-solid fa-user-tie text-emerald-500 mr-2"></i> ${a}</div>`).join('');
            }
            if(html) { pop.innerHTML = html; pop.classList.remove('hidden'); } else pop.classList.add('hidden');
        }

        function selectAuth(id, display) { document.getElementById('auth-selected-id').value = id; document.getElementById('auth-search').value = display; document.getElementById('auth-popup').classList.add('hidden'); }

        async function handleLogin(e) {
            e.preventDefault();
            try {
                let role = document.getElementById('auth-role').value, pwd = document.getElementById('auth-pwd').value, selId = document.getElementById('auth-selected-id').value;
                let hashedPwd = await hashPassword(pwd);
                if (hashedPwd !== PASSWORDS[role]) { showToast('error', currentLang==='EN'?'Invalid Password!':'Password Salah!'); return; }
                if ((role === 'branch' || role === 'am') && !selId) { showToast('error', 'Please select from search!'); return; }
                
                closeModal('auth-modal');
                currentUser = { role: role };
                
                applyRoleVisibilities();
                if (typeof updateThemeBtnVisibility === 'function') updateThemeBtnVisibility();


                document.getElementById('header-subtitle').classList.add('hidden');
                document.getElementById('nav-buttons').classList.add('hidden');
                document.getElementById('logged-in-controls').classList.remove('hidden'); document.getElementById('logged-in-controls').classList.add('flex');
                
                if (role === 'branch') {
                    currentUser.id = selId; let b = masterBranches.find(x => String(x.code) === String(currentUser.id));
                    if(b) {
                        currentUser.name = b.name; currentUser.am = b.am;
                    } else {
                        currentUser.name = "Unknown Branch"; currentUser.am = "";
                    }
                    localStorage.setItem('pbi_user', JSON.stringify(currentUser));
                    document.getElementById('current-user-name').innerText = currentUser.name; document.getElementById('current-user-role').innerText = role;
                    if(typeof setupBranchView === 'function') setupBranchView();
                    try { listenToSurveyBadge(); } catch(err) {}
                    try { syncBranchFromCloud(); } catch(err) {}
                } else if (role === 'am') {
                    currentUser.name = selId; localStorage.setItem('pbi_user', JSON.stringify(currentUser));
                    document.getElementById('current-user-name').innerText = currentUser.name; document.getElementById('current-user-role').innerText = role;
                    setupManagerView();
                    try { listenToSurveyBadge(); } catch(err) {}
                } else {
                    currentUser.name = "System Administrator"; localStorage.setItem('pbi_user', JSON.stringify(currentUser));
                    document.getElementById('current-user-name').innerText = currentUser.name; document.getElementById('current-user-role').innerText = role;
                    setupManagerView();
                    try { listenToSurveyBadge(); } catch(err) {}
                }
            } catch(error) {
                console.error("Login exception:", error);
                showToast('error', 'Error logging in: ' + error.message);
            }
        }

        function logout() {
            currentUser = null; localStorage.removeItem('pbi_user');
            if(typeof hasAlertedSurvey !== 'undefined') hasAlertedSurvey = false;
            if(typeof surveyUnsubscribe !== 'undefined' && surveyUnsubscribe) { surveyUnsubscribe(); surveyUnsubscribe = null; }
            if(typeof responsesUnsubscribe !== 'undefined' && responsesUnsubscribe) { responsesUnsubscribe(); responsesUnsubscribe = null; }
            if(typeof unsubToday !== 'undefined' && unsubToday) { unsubToday(); unsubToday = null; }
            if(typeof unsubBank !== 'undefined' && unsubBank) { unsubBank(); unsubBank = null; }
            if(typeof unsubNight !== 'undefined' && unsubNight) { unsubNight(); unsubNight = null; }
            if(typeof window.unsubTarget !== 'undefined' && window.unsubTarget) { window.unsubTarget(); window.unsubTarget = null; }
            window.currentBranchTarget = 0;
            window.currentBranchSales = 0;
            if (window.activeListeners) {
                for (let key in window.activeListeners) {
                    if (typeof window.activeListeners[key] === 'function') window.activeListeners[key]();
                }
            }
            window.activeListeners = {};
            window.fetchedQueries = {};
            window.fetchedRangeQueries = {};
            dbSubmissions = [];
            document.getElementById('header-subtitle').classList.remove('hidden');
            document.getElementById('logged-in-controls').classList.add('hidden'); document.getElementById('logged-in-controls').classList.remove('flex');
            document.getElementById('nav-buttons').classList.remove('hidden'); document.getElementById('section-branch').classList.add('hidden');
            document.getElementById('section-manager').classList.add('hidden'); document.getElementById('section-welcome').classList.remove('hidden');
            if (typeof updateThemeBtnVisibility === 'function') updateThemeBtnVisibility();
        }

        function applyRoleVisibilities() {
            let role = currentUser ? currentUser.role : '';
            document.querySelectorAll('.super-admin').forEach(el => { if(el) { el.style.display = role==='admin' ? 'block' : 'none'; if(role==='admin') el.classList.remove('hidden'); else el.classList.add('hidden'); } });
            document.querySelectorAll('.hide-from-operation').forEach(el => { if(el) { el.style.display = role==='operation' ? 'none' : 'block'; if(role==='operation') el.classList.add('hidden'); else el.classList.remove('hidden'); } });
            document.querySelectorAll('.admin-only').forEach(el => { if(el) { el.style.display = (role==='admin' || role==='operation') ? 'block' : 'none'; if(role==='admin' || role==='operation') el.classList.remove('hidden'); else el.classList.add('hidden'); } });
            document.querySelectorAll('.am-only').forEach(el => { 
                if(el) {
                    if (role === 'am' || role === 'admin' || role === 'operation') {
                        el.style.display = 'flex';
                        el.classList.remove('hidden');
                    } else {
                        el.style.display = 'none';
                        el.classList.add('hidden');
                    }
                }
            });
            let btnPatch = document.getElementById('btn-patch-db');
            if (btnPatch) {
                if (role === 'admin') {
                    btnPatch.classList.remove('hidden');
                    btnPatch.style.display = 'inline-block';
                } else {
                    btnPatch.classList.add('hidden');
                    btnPatch.style.display = 'none';
                }
            }
        }

        function switchTab(tab) {
            if (tab === 'exec-charts' && (!currentUser || currentUser.role !== 'admin')) {
                showToast('error', 'Executive Charts is strictly for Admin only.');
                return;
            }
            window.isFillingSurveyActive = false;
            currentTab = tab;
            applyRoleVisibilities();
            ['dashboard', 'tracking', 'comparison', 'control', 'hub', 'drop', 'audit', 'lorry', 'survey', 'target', 'exec-charts'].forEach(t => {
                let s = document.getElementById('tab-' + t), b = document.getElementById('tab-btn-' + t);
                if(s) s.classList.add('hidden');
                if(b) { b.classList.remove('tab-active'); b.classList.add('tab-inactive'); }
            });
            let aSec = document.getElementById('tab-' + tab), aBtn = document.getElementById('tab-btn-' + tab);
            if(aSec) aSec.classList.remove('hidden');
            if(aBtn) { aBtn.classList.remove('tab-inactive'); aBtn.classList.add('tab-active'); }
            
            if (tab === 'survey') {
                let adV = document.getElementById('survey-admin-view');
                let amV = document.getElementById('survey-am-view');
                let brV = document.getElementById('branch-survey-container');
                let role = currentUser ? currentUser.role : 'admin';
                if (role === 'branch') {
                    if (brV) { brV.classList.remove('hidden'); brV.style.display = 'block'; }
                    if (amV) { amV.classList.add('hidden'); amV.style.display = 'none'; }
                    if (adV) { adV.classList.add('hidden'); adV.style.display = 'none'; }
                } else if (role === 'am') {
                    if (amV) { amV.classList.remove('hidden'); amV.style.display = 'block'; }
                    if (adV) { adV.classList.add('hidden'); adV.style.display = 'none'; }
                    if (brV) { brV.classList.add('hidden'); brV.style.display = 'none'; }
                } else {
                    if (adV) { adV.classList.remove('hidden'); adV.style.display = 'block'; }
                    if (amV) { amV.classList.add('hidden'); amV.style.display = 'none'; }
                    if (brV) { brV.classList.add('hidden'); brV.style.display = 'none'; }
                }
                try { renderSurveys(); toggleSurveyTypeUI(); } catch(err) { console.error("renderSurveys error:", err); }
            } else if (tab === 'target') {
                loadTargetTracker();
            } else if (tab === 'control') {
                renderAuditLogs();
            } else if (tab === 'exec-charts') {
                if (typeof updateAllDateMax === 'function') updateAllDateMax();
                if (typeof triggerDataSync === 'function') triggerDataSync();
                if (typeof renderExecCharts === 'function') setTimeout(renderExecCharts, 50);
            } else {
                if(tab === 'dashboard' || tab === 'analytics' || tab === 'tracking' || tab === 'comparison' || tab === 'lorry') {
                    if (typeof updateAllDateMax === 'function') updateAllDateMax();
                    triggerDataSync();
                }
            }
        }

        async function renderAuditLogs() {
            let tbody = document.getElementById('audit-log-tbody');
            if(!tbody) return;
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-slate-500 text-xs">Loading logs...</td></tr>';
            try {
                let logs = [];
                // 1. Fetch directly from Supabase REST API
                try {
                    let sbRes = await fetch('https://jolrtaqlpqqydncacqza.supabase.co/rest/v1/audit_logs?select=*&order=timestamp_ms.desc&limit=200', {
                        headers: {
                            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpvbHJ0YXFscHFxeWRuY2FjcXphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxOTM5OTYsImV4cCI6MjA5ODc2OTk5Nn0.09IP62_5lE5mMziTeBlYfVhydZeCXHuxwMSvnZBQD6E',
                            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpvbHJ0YXFscHFxeWRuY2FjcXphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxOTM5OTYsImV4cCI6MjA5ODc2OTk5Nn0.09IP62_5lE5mMziTeBlYfVhydZeCXHuxwMSvnZBQD6E'
                        }
                    });
                    if (sbRes.ok) {
                        let sbData = await sbRes.json();
                        sbData.forEach(item => {
                            logs.push(Object.assign({}, item, item.details || {}, item.data || {}));
                        });
                    }
                } catch(e) { console.error("SB Audit fetch error", e); }

                // Fallback to db wrapper if direct fetch yielded nothing
                if (logs.length === 0) {
                    let snap = await db.collection('audit_logs').limit(200).get();
                    if (!snap.empty) {
                        snap.docs.forEach(doc => {
                            let raw = doc.data();
                            logs.push(Object.assign({}, raw, raw.details || {}, raw.data || {}));
                        });
                    }
                }

                if (logs.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-slate-500 text-xs">No audit logs found.</td></tr>';
                    return;
                }

                logs.sort((a, b) => {
                    let tA = Number(a.timestamp_ms || (a.timestamp ? new Date(a.timestamp).getTime() : 0));
                    let tB = Number(b.timestamp_ms || (b.timestamp ? new Date(b.timestamp).getTime() : 0));
                    return (tB || 0) - (tA || 0);
                });

                window.allAuditLogs = logs;
                filterAuditLogs();
            } catch(err) {
                console.error("renderAuditLogs err:", err);
                tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-rose-500 text-xs">Failed to load logs.</td></tr>';
            }
        }

        window.auditFilterMode = window.auditFilterMode || 'all';

        function setAuditFilterMode(mode) {
            window.auditFilterMode = mode;
            document.getElementById('audit-filter-all')?.classList.toggle('bg-indigo-600', mode === 'all');
            document.getElementById('audit-filter-all')?.classList.toggle('text-white', mode === 'all');
            document.getElementById('audit-filter-all')?.classList.toggle('text-slate-400', mode !== 'all');

            document.getElementById('audit-filter-daily')?.classList.toggle('bg-indigo-600', mode === 'daily');
            document.getElementById('audit-filter-daily')?.classList.toggle('text-white', mode === 'daily');
            document.getElementById('audit-filter-daily')?.classList.toggle('text-slate-400', mode !== 'daily');

            document.getElementById('audit-filter-monthly')?.classList.toggle('bg-indigo-600', mode === 'monthly');
            document.getElementById('audit-filter-monthly')?.classList.toggle('text-white', mode === 'monthly');
            document.getElementById('audit-filter-monthly')?.classList.toggle('text-slate-400', mode !== 'monthly');

            let datePicker = document.getElementById('audit-date-picker');
            let monthPicker = document.getElementById('audit-month-picker');
            if (datePicker) {
                datePicker.classList.toggle('hidden', mode !== 'daily');
                if (mode === 'daily' && !datePicker.value) {
                    let now = new Date();
                    datePicker.value = now.toISOString().split('T')[0];
                }
            }
            if (monthPicker) {
                monthPicker.classList.toggle('hidden', mode !== 'monthly');
                if (mode === 'monthly' && !monthPicker.value) {
                    let now = new Date();
                    monthPicker.value = now.toISOString().slice(0, 7);
                }
            }
            filterAuditLogs();
        }

        function filterAuditLogs() {
            let tbody = document.getElementById('audit-log-tbody');
            if (!tbody || !window.allAuditLogs) return;

            let mode = window.auditFilterMode || 'all';
            let keyword = (document.getElementById('audit-search-input')?.value || '').toLowerCase().trim();
            let selectedDate = document.getElementById('audit-date-picker')?.value || '';
            let selectedMonth = document.getElementById('audit-month-picker')?.value || '';

            let filtered = window.allAuditLogs.filter(d => {
                if (mode === 'daily' && selectedDate) {
                    let logDateStr = d.target_date || '';
                    let tsDateStr = '';
                    if (d.timestamp_ms) {
                        let dt = new Date(Number(d.timestamp_ms));
                        let y = dt.getFullYear();
                        let m = String(dt.getMonth() + 1).padStart(2, '0');
                        let day = String(dt.getDate()).padStart(2, '0');
                        tsDateStr = `${y}-${m}-${day}`;
                    }
                    if (logDateStr !== selectedDate && tsDateStr !== selectedDate) return false;
                } else if (mode === 'monthly' && selectedMonth) {
                    let logMonthStr = (d.target_date || '').slice(0, 7);
                    let tsMonthStr = '';
                    if (d.timestamp_ms) {
                        let dt = new Date(Number(d.timestamp_ms));
                        let y = dt.getFullYear();
                        let m = String(dt.getMonth() + 1).padStart(2, '0');
                        tsMonthStr = `${y}-${m}`;
                    }
                    if (logMonthStr !== selectedMonth && tsMonthStr !== selectedMonth) return false;
                }

                if (keyword) {
                    let str = [
                        d.user || '',
                        d.action || '',
                        d.target_code || '',
                        d.target_date || '',
                        d.role || ''
                    ].join(' ').toLowerCase();
                    if (!str.includes(keyword)) return false;
                }
                return true;
            });

            let countBadge = document.getElementById('audit-log-count');
            if (countBadge) countBadge.innerText = `${filtered.length} Rekod`;

            if (filtered.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-slate-500 text-xs">Tiada log aktiviti dijumpai untuk penapis ini.</td></tr>';
                return;
            }

            let bMap = {};
            if (window.masterBranches) {
                window.masterBranches.forEach(b => { bMap[String(b.code)] = b.name; });
            }

            let html = '';
            filtered.forEach(d => {
                let actionBadge = `<span class="bg-slate-800 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider">${d.action || '-'}</span>`;
                let actUpper = (d.action || '').toUpperCase();
                if (actUpper.includes('RESET') || actUpper.includes('LOCK')) {
                    actionBadge = `<span class="inline-flex items-center gap-1.5 bg-rose-500/15 text-rose-400 border border-rose-500/30 px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider uppercase"><i class="fa-solid fa-rotate-left text-rose-400"></i> ${actUpper.replace(/_/g, ' ')}</span>`;
                } else if (actUpper.includes('UNLOCK')) {
                    actionBadge = `<span class="inline-flex items-center gap-1.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider uppercase"><i class="fa-solid fa-unlock text-emerald-400"></i> ${actUpper.replace(/_/g, ' ')}</span>`;
                }

                let tsStr = d.timestamp || (d.timestamp_ms ? new Date(Number(d.timestamp_ms)).toLocaleString('en-GB', { timeZone: 'Asia/Kuala_Lumpur' }) : '-');
                let codeStr = d.target_code || '-';
                let branchName = bMap[codeStr] || '';
                let branchDisplay = branchName ? `<span class="font-bold text-white">${codeStr}</span> <span class="text-slate-400 text-[11px]">- ${branchName}</span>` : `<span class="font-bold text-white">${codeStr}</span>`;

                let userRoleBadge = d.role ? `<span class="ml-1.5 text-[9px] uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">${d.role}</span>` : '';

                html += `<tr class="border-b border-slate-800/80 hover:bg-slate-800/60 transition-colors">
                    <td class="p-3.5 text-[11px] text-slate-300 font-mono whitespace-nowrap"><i class="fa-regular fa-clock mr-1.5 text-slate-500"></i>${tsStr}</td>
                    <td class="p-3.5 text-[11px] font-bold text-cyan-400 flex items-center">${d.user || '-'}${userRoleBadge}</td>
                    <td class="p-3.5 whitespace-nowrap">${actionBadge}</td>
                    <td class="p-3.5 text-[11px]">${branchDisplay}</td>
                    <td class="p-3.5 text-[11px] text-slate-300 font-mono"><span class="bg-slate-900/80 border border-slate-800 px-2 py-1 rounded"><i class="fa-regular fa-calendar mr-1.5 text-slate-500"></i>${d.target_date || '-'}</span></td>
                </tr>`;
            });
            tbody.innerHTML = html;
        }

        function exportAuditLogsExcel() {
            if (!window.allAuditLogs || window.allAuditLogs.length === 0) {
                showToast('error', 'Tiada data log untuk dimuat turun!');
                return;
            }
            let mode = window.auditFilterMode || 'all';
            let keyword = (document.getElementById('audit-search-input')?.value || '').toLowerCase().trim();
            let selectedDate = document.getElementById('audit-date-picker')?.value || '';
            let selectedMonth = document.getElementById('audit-month-picker')?.value || '';

            let filtered = window.allAuditLogs.filter(d => {
                if (mode === 'daily' && selectedDate) {
                    let logDateStr = d.target_date || '';
                    let tsDateStr = '';
                    if (d.timestamp_ms) {
                        let dt = new Date(Number(d.timestamp_ms));
                        let y = dt.getFullYear();
                        let m = String(dt.getMonth() + 1).padStart(2, '0');
                        let day = String(dt.getDate()).padStart(2, '0');
                        tsDateStr = `${y}-${m}-${day}`;
                    }
                    if (logDateStr !== selectedDate && tsDateStr !== selectedDate) return false;
                } else if (mode === 'monthly' && selectedMonth) {
                    let logMonthStr = (d.target_date || '').slice(0, 7);
                    let tsMonthStr = '';
                    if (d.timestamp_ms) {
                        let dt = new Date(Number(d.timestamp_ms));
                        let y = dt.getFullYear();
                        let m = String(dt.getMonth() + 1).padStart(2, '0');
                        tsMonthStr = `${y}-${m}`;
                    }
                    if (logMonthStr !== selectedMonth && tsMonthStr !== selectedMonth) return false;
                }
                if (keyword) {
                    let str = [d.user || '', d.action || '', d.target_code || '', d.target_date || '', d.role || ''].join(' ').toLowerCase();
                    if (!str.includes(keyword)) return false;
                }
                return true;
            });

            if (filtered.length === 0) {
                showToast('error', 'Tiada log yang sepadan dengan penapis.');
                return;
            }

            let exportArr = filtered.map(d => ({
                "Timestamp": d.timestamp || (d.timestamp_ms ? new Date(Number(d.timestamp_ms)).toLocaleString('en-GB', { timeZone: 'Asia/Kuala_Lumpur' }) : '-'),
                "User": d.user || '-',
                "Role": d.role || '-',
                "Action": d.action || '-',
                "Branch Code": d.target_code || '-',
                "Target Date": d.target_date || '-'
            }));

            let wb = XLSX.utils.book_new();
            let ws = XLSX.utils.json_to_sheet(exportArr);
            XLSX.utils.book_append_sheet(wb, ws, "Audit Logs");
            XLSX.writeFile(wb, `Audit_Log_Report_${mode}.xlsx`);
            showToast('success', 'Audit Log Report downloaded successfully!');
        }

        // --- 4. Branch Logic ---
                window.currentBranchTarget = 0;
        function renderBranchTargetWidget(curSales) {
            let target = window.currentBranchTarget;
            if(target > 0) {
                let today = new Date();
                let daysInMonth = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();
                let remainingDays = daysInMonth - today.getDate() + 1;
                let reqSales = target - curSales;
                let reqPerDay = (reqSales > 0 && remainingDays > 0) ? (reqSales / remainingDays) : 0;
                let pct = Math.min((curSales / target) * 100, 100);
                
                document.getElementById('b-target-total').innerText = 'RM ' + formatRM(target);
                document.getElementById('b-target-pct').innerText = pct.toFixed(1) + '%';
                document.getElementById('b-target-bar').style.width = pct + '%';
                if(reqSales <= 0) {
                    document.getElementById('b-target-req').classList.remove('text-pink-500');
                    document.getElementById('b-target-req').classList.add('text-emerald-400');
                    document.getElementById('b-target-req').innerHTML = '<i class="fa-solid fa-check mr-1"></i>Tercapai';
                } else {
                    document.getElementById('b-target-req').innerText = 'RM ' + formatRM(reqPerDay);
                    document.getElementById('b-target-req').classList.add('text-pink-500');
                    document.getElementById('b-target-req').classList.remove('text-emerald-400');
                }
            } else {
                document.getElementById('b-target-total').innerText = 'Belum ditetapkan';
                document.getElementById('b-target-pct').innerText = '0%';
                document.getElementById('b-target-bar').style.width = '0%';
                document.getElementById('b-target-req').innerText = '-';
            }
        }
        
        async function setupBranchView() {
            if(!currentUser) return;
            applyRoleVisibilities();
            todayStr = getYYYYMMDD(new Date());
            currentMonthStr = todayStr.substring(0, 7);
            if (document.getElementById('night-date') && !document.getElementById('night-date').value) document.getElementById('night-date').value = todayStr;
            if (document.getElementById('bank-in-date') && !document.getElementById('bank-in-date').value) document.getElementById('bank-in-date').value = todayStr;
            document.getElementById('section-welcome').classList.add('hidden');
            document.getElementById('section-branch').classList.remove('hidden');
            
            document.getElementById('info-branch-code').innerText = currentUser.id;
            document.getElementById('info-branch-name').innerText = currentUser.name;
            let b = masterBranches.find(x=>x.code==currentUser.id);
            document.getElementById('info-branch-am').innerText = b ? (b.am || "UNASSIGNED") : "UNASSIGNED";

            let nightDate = document.getElementById('night-date') ? document.getElementById('night-date').value : todayStr;
            let nightRec = dbSubmissions.find(s => s.code == currentUser.id && s.date === nightDate);
            let timeEl = document.getElementById('info-branch-submit-time');
            
            let parseD = (str) => { if(!str) return 0; let p=str.split('-'); return new Date(p[0], p[1]-1, p[2]).getTime(); };

            let nightDiff = Math.round((parseD(todayStr) - parseD(nightDate)) / 86400000);
            let isToday = (nightDiff === 0);
            let nightUnlocked = false;
            let isIndividualLocked = (nightRec && nightRec.night_locked === true);
            let isIndividualUnlocked = (nightRec && nightRec.night_unlocked === true);
            if (isToday) {
                if (masterLock || isIndividualLocked) {
                    nightUnlocked = isIndividualUnlocked;
                } else {
                    nightUnlocked = true;
                }
            } else {
                if (pastLock || isIndividualLocked) {
                    nightUnlocked = isIndividualUnlocked;
                } else {
                    nightUnlocked = true;
                }
            }
            
            let fnSales = document.getElementById('f-sales'); let fnTrans = document.getElementById('f-trans'); let fnMyKasih = document.getElementById('f-mykasih'); let fnLorry = document.getElementById('f-lorry');
            let btnNight = document.getElementById('btn-submit-night');

            if(nightRec && nightRec.night_locked && nightRec.night_submit_time) {
                timeEl.innerText = formatTime(nightRec.night_submit_time); timeEl.className = "text-xs font-bold text-emerald-400 mt-0.5";
                if(!nightUnlocked && btnNight) { btnNight.disabled = true; btnNight.classList.add('hidden'); }
            } else {
                timeEl.innerText = currentLang==='EN' ? "Not submitted yet" : "Belum dihantar"; timeEl.className = "text-xs font-bold text-amber-500 mt-0.5 italic";
            }

            if (nightUnlocked) {
                fnSales.disabled = false; fnSales.readOnly = false; fnSales.classList.remove('opacity-50', 'cursor-not-allowed'); fnSales.placeholder = "0.00";
                fnTrans.disabled = false; fnTrans.readOnly = false; fnTrans.classList.remove('opacity-50', 'cursor-not-allowed'); fnTrans.placeholder = "0";
                fnMyKasih.disabled = false; fnMyKasih.readOnly = false; fnMyKasih.classList.remove('opacity-50', 'cursor-not-allowed'); fnMyKasih.placeholder = "0.00";
                fnLorry.disabled = false; fnLorry.readOnly = false; fnLorry.classList.remove('opacity-50', 'cursor-not-allowed'); fnLorry.placeholder = "0.00";
                if(btnNight) { btnNight.disabled = false; btnNight.classList.remove('hidden'); }
            } else {
                fnSales.disabled = true; fnSales.readOnly = true; fnSales.classList.add('opacity-50', 'cursor-not-allowed');
                fnTrans.disabled = true; fnTrans.readOnly = true; fnTrans.classList.add('opacity-50', 'cursor-not-allowed');
                fnMyKasih.disabled = true; fnMyKasih.readOnly = true; fnMyKasih.classList.add('opacity-50', 'cursor-not-allowed');
                fnLorry.disabled = true; fnLorry.readOnly = true; fnLorry.classList.add('opacity-50', 'cursor-not-allowed');
                if(btnNight) { btnNight.disabled = true; btnNight.classList.add('hidden'); }
            }

            let activeEl = document.activeElement;
            let isTypingNight = (activeEl === fnSales || activeEl === fnTrans || activeEl === fnMyKasih || activeEl === fnLorry);
            if (!isTypingNight) {
                if (nightRec && (nightRec.sales > 0 || nightRec.transactions > 0 || nightRec.mykasih > 0 || nightRec.lorry > 0 || nightRec.night_locked)) {
                    fnSales.value = nightRec.sales || ''; 
                    fnTrans.value = nightRec.transactions || '';
                    fnMyKasih.value = nightRec.mykasih || ''; 
                    fnLorry.value = nightRec.lorry || '';
                } else if (!nightUnlocked) {
                    fnSales.value = ""; fnTrans.value = ""; fnMyKasih.value = ""; fnLorry.value = "";
                    let phText = masterLock ? "SYSTEM LOCKED BY ADMIN" : "Locked (Requires Admin Unlock)";
                    fnSales.placeholder = phText; fnTrans.placeholder = "Locked"; fnMyKasih.placeholder = "Locked"; fnLorry.placeholder = "Locked";
                }
            }

            if (nightRec && nightRec.night_locked) {
                document.getElementById('branch-night-locked').classList.remove('hidden'); document.getElementById('branch-night-locked').classList.add('flex');
            } else {
                document.getElementById('branch-night-locked').classList.add('hidden'); 
            }
            
            if (typeof surveysLoaded !== 'undefined' && surveysLoaded && responsesLoaded) {
                checkSurveyAlerts();
            }
            
            let bankDate = document.getElementById('bank-in-date').value;
            let bankRec = dbSubmissions.find(s => s.code == currentUser.id && s.date === bankDate);
            
            let fBank2 = document.getElementById('f-bank2');
            let diffDays = Math.round((parseD(todayStr) - parseD(bankDate)) / 86400000);
            let b2Unlocked = (diffDays === 1) || (diffDays > 1 && bankRec && bankRec.bank2_unlocked);
            
            if(b2Unlocked) {
                fBank2.disabled = false; fBank2.readOnly = false; fBank2.classList.remove('opacity-50', 'cursor-not-allowed'); fBank2.placeholder = "0.00";
            } else {
                fBank2.disabled = true; fBank2.readOnly = true; fBank2.classList.add('opacity-50', 'cursor-not-allowed'); fBank2.placeholder = diffDays <= 0 ? "Locked (Key in tomorrow)" : "Locked (Admin Unlock Req)";
            }

            let fBank1El = document.getElementById('f-bank1');
            let fBank2El = document.getElementById('f-bank2');
            let isTypingBank = (activeEl === fBank1El || activeEl === fBank2El);
            if (!isTypingBank) {
                if (bankRec && (bankRec.bank1 > 0 || bankRec.bank2 > 0 || bankRec.bank1_time || bankRec.bank2_time)) {
                    fBank1El.value = bankRec.bank1 || ''; fBank2El.value = bankRec.bank2 || '';
                    document.getElementById('bank1-time').innerText = bankRec.bank1_time ? `Updated: ${formatTime(bankRec.bank1_time)}` : '';
                    document.getElementById('bank2-time').innerText = bankRec.bank2_time ? `Updated: ${formatTime(bankRec.bank2_time)}` : '';
                } else {
                    fBank1El.value = ''; fBank2El.value = ''; 
                    document.getElementById('bank1-time').innerText = ''; document.getElementById('bank2-time').innerText = '';
                }
            }

            // Target Tracker Logic (run asynchronously without blocking UI)
            try {
                let today = new Date();
                let mStr = today.getFullYear() + '-' + ((today.getMonth()+1)<10?'0':'')+(today.getMonth()+1);
                
                if (document.getElementById('branch-target-widget')) {
                    document.getElementById('branch-target-widget').classList.remove('hidden');
                    if (window.currentBranchTarget !== undefined) {
                        renderBranchTargetWidget(window.currentBranchSales || 0);
                    }
                }
                
                // Live listener for targets
                if(typeof window.unsubTarget !== 'undefined' && window.unsubTarget) {
                    // listener already attached
                } else {
                    window.unsubTarget = db.collection('targets').doc(`${mStr}_${currentUser.id}`).onSnapshot(tSnap => {
                        if (!currentUser) return; // safeguard
                        let target = (tSnap.exists && tSnap.data().target_sales > 0) ? tSnap.data().target_sales : 0;
                        window.currentBranchTarget = target;
                        renderBranchTargetWidget(window.currentBranchSales || 0);
                    }, e => {
                        console.error('Error loading target:', e); 
                        if(document.getElementById('b-target-total')) document.getElementById('b-target-total').innerText = 'Ralat: ' + e.message; 
                    });
                }
                
                // Query branch submissions matching string or number code
                let curSales = 0;
                let seenDates = new Set();
                dbSubmissions.forEach(sub => {
                    if (sub.code == currentUser.id && sub.date && sub.date.startsWith(mStr)) {
                        let sVal = parseFloat(sub.sales) || 0;
                        if (sVal > 0) { curSales += sVal; seenDates.add(sub.date); }
                    }
                });
                db.collection("submissions").where("code", "in", [String(currentUser.id), Number(currentUser.id)]).get().then(subSnap => {
                    subSnap.forEach(doc => {
                        let d = doc.data();
                        if (d && d.date && d.date.startsWith(mStr) && !seenDates.has(d.date)) {
                            let sVal = parseFloat(d.sales) || 0;
                            if (sVal > 0) { curSales += sVal; seenDates.add(d.date); }
                        }
                    });
                    window.currentBranchSales = curSales;
                    if(document.getElementById('b-target-current')) document.getElementById('b-target-current').innerText = 'RM ' + formatRM(window.currentBranchSales);
                    if (typeof window.currentBranchTarget !== 'undefined') {
                        renderBranchTargetWidget(window.currentBranchSales || 0);
                    }
                }).catch(e => {
                    console.error("Error fetching branch submissions:", e);
                    window.currentBranchSales = curSales;
                    if(document.getElementById('b-target-current')) document.getElementById('b-target-current').innerText = 'RM ' + formatRM(window.currentBranchSales);
                    if (typeof window.currentBranchTarget !== 'undefined') {
                        renderBranchTargetWidget(window.currentBranchSales || 0);
                    }
                });
            } catch(e) { console.error('Error loading target:', e); }
        }

        let pendingNightData = null;
        function confirmNightSubmit(e) {
            e.preventDefault();

            let nightDateEl = document.getElementById('night-date');
            let nightDate = nightDateEl ? nightDateEl.value : todayStr;
            let nightRec = dbSubmissions.find(s => s.code == currentUser.id && s.date === nightDate);
            let isIndividualUnlocked = (nightRec && nightRec.night_unlocked === true);
            let isTodaySubmit = (nightDate === todayStr);

            if (isTodaySubmit && masterLock && !isIndividualUnlocked) {
                Swal.fire({
                    icon: 'error',
                    title: 'System Locked / Sistem Dikunci',
                    text: 'Sales submission for today has been locked by HQ (Admin). You are not allowed to submit data.'
                });
                return;
            }
            if (!isTodaySubmit && pastLock && !isIndividualUnlocked) {
                Swal.fire({
                    icon: 'error',
                    title: 'System Locked / Sistem Dikunci',
                    text: 'Sales submission for past dates has been locked by Admin.'
                });
                return;
            }

            let sVal = document.getElementById('f-sales').value.replace(/,/g, '');
            let mVal = document.getElementById('f-mykasih').value.replace(/,/g, '');
            let transVal = document.getElementById('f-trans').value.replace(/,/g, '');
            let lVal = document.getElementById('f-lorry').value.replace(/,/g, '');
            
            let isValidCents = (v) => {
                if(!v) return true;
                let parts = v.split('.');
                if(parts.length === 1) return true;
                if(parts[1].length > 2) return false;
                let cents = parseInt((parts[1] + '00').substring(0, 2));
                return cents % 5 === 0;
            };
            
            if(!isValidCents(sVal) || !isValidCents(mVal)) {
                Swal.fire({
                    icon: 'error',
                    title: 'Error Nilai Sen',
                    text: 'Please ensure cents for Daily Sales and MyKasih are in multiples of 5 (e.g. .00, .05, .10, .50). Do not enter odd values like .02 or .03'
                });
                return;
            }

            let pSales = parseFloat(sVal) || 0;
            let pTrans = parseInt(transVal) || 0;
            let pMyKasih = parseFloat(mVal) || 0;
            let pLorry = parseFloat(lVal) || 0;

            pendingNightData = { sales: pSales, transactions: pTrans, mykasih: pMyKasih, lorry: pLorry };
            document.getElementById('confirm-sales-val').innerText = 'RM ' + formatRM(pendingNightData.sales);
            document.getElementById('confirm-trans-val').innerText = formatNum(pendingNightData.transactions);
            document.getElementById('confirm-mykasih-val').innerText = 'RM ' + formatRM(pendingNightData.mykasih);
            document.getElementById('confirm-lorry-val').innerText = 'RM ' + formatRM(pendingNightData.lorry);
            document.getElementById('confirm-modal').classList.remove('hidden'); document.getElementById('confirm-modal').classList.add('flex');
        }

        function executeNightSubmit() {
            closeModal('confirm-modal');
            
            let nightDateEl = document.getElementById('night-date');
            let nightDate = nightDateEl ? nightDateEl.value : todayStr;
            let nightRec = dbSubmissions.find(s => s.code == currentUser.id && s.date === nightDate);
            let isIndividualUnlocked = (nightRec && nightRec.night_unlocked === true);
            let isTodaySubmit = (nightDate === todayStr);

            if (isTodaySubmit && masterLock && !isIndividualUnlocked) {
                Swal.fire({ icon: 'error', title: 'System Locked / Sistem Dikunci', text: 'Sales submission is locked by Admin.' });
                return;
            }
            if (!isTodaySubmit && pastLock && !isIndividualUnlocked) {
                Swal.fire({ icon: 'error', title: 'System Locked / Sistem Dikunci', text: 'Past date sales submission is locked by Admin.' });
                return;
            }

            let pSales = pendingNightData.sales;
            let pMyKasih = pendingNightData.mykasih;
            let pLorry = pendingNightData.lorry;
            
            let overLimit = false;
            let limitMsgs = [];
            if(window.globalConfig && window.globalConfig.limit_sales > 0 && pSales > window.globalConfig.limit_sales) { overLimit = true; limitMsgs.push('Sales (RM ' + formatRM(pSales) + ')'); }
            if(window.globalConfig && window.globalConfig.limit_mykasih > 0 && pMyKasih > window.globalConfig.limit_mykasih) { overLimit = true; limitMsgs.push('MyKasih (RM ' + formatRM(pMyKasih) + ')'); }
            if(window.globalConfig && window.globalConfig.limit_lorry > 0 && pLorry > window.globalConfig.limit_lorry) { overLimit = true; limitMsgs.push('Lorry (RM ' + formatRM(pLorry) + ')'); }

            let finalizeNightSubmit = () => {
                let nightDate = document.getElementById('night-date').value;
                
                let updatePayload = {
                    date: nightDate, code: currentUser.id, name: currentUser.name, am: currentUser.am || "",
                    sales: pendingNightData.sales, transactions: pendingNightData.transactions,
                    mykasih: pendingNightData.mykasih, lorry: pendingNightData.lorry,
                    night_locked: true, night_unlocked: false, night_submit_time: getSafeTimeStr()
                };
                
                syncToCloud('submit_sales', updatePayload, () => {
                    let rec = dbSubmissions.find(s => s.code == currentUser.id && s.date === nightDate);
                    if(!rec) { rec = { ...updatePayload }; dbSubmissions.push(rec); }
                    else { Object.assign(rec, updatePayload); }
                    setupBranchView();
                });
            };

            if(overLimit) {
                let tTitle = 'Logical Limit Warning / Amaran Had Logik!';
                let tDesc = 'The value you entered is abnormal or exceeds limit / Nilai yang dimasukkan melepasi had biasa:';
                let tInst = 'Please type <strong class="text-lg">VALID</strong> below if this value is truly valid, or press Cancel to re-check.<br>(Sila taip <strong>VALID</strong> atau <strong>SAH</strong> jika nilai ini betul)';
                let tConf = 'Yes, Valid / Ya, Sah';
                let tCanc = 'Cancel / Batal';
                let tVali = 'You must type VALID or SAH to proceed! / Sila taip VALID atau SAH untuk meneruskan.';
                
                Swal.fire({
                    title: tTitle,
                    html: '<p class="text-rose-500 font-bold mb-4">' + tDesc + '</p><p class="text-sm font-black text-rose-300 mb-4 text-left p-3 bg-rose-950/50 rounded">' + limitMsgs.join('<br>') + '</p><p class="text-xs">' + tInst + '</p>',
                    input: 'text',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: tConf,
                    cancelButtonText: tCanc,
                    confirmButtonColor: '#ef4444',
                    inputValidator: (value) => {
                        let v = String(value || '')
                            .replace(/[\u200B-\u200D\uFEFF]/g, '') // strip zero-width characters
                            .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()'"“”]/g, '') // strip periods/punctuation from mobile auto-correct
                            .trim()
                            .toUpperCase();
                        let allowed = ['VALID', 'SAH', 'YA', 'YES', 'BETUL', 'BENAR', 'OK', 'CONFIRM', 'SURE', 'YES VALID', 'YA SAH', 'BETUL SAH', 'SAYA SAHKAN'];
                        if (!allowed.includes(v)) {
                            return tVali;
                        }
                        return null;
                    }
                }).then((result) => {
                    if (result.isConfirmed) {
                        finalizeNightSubmit();
                    }
                });
            } else {
                finalizeNightSubmit();
            }
        }

        function saveBankInData(e) {
            e.preventDefault();
            let bDate = document.getElementById('bank-in-date').value;
            if(!bDate) { showToast('error', 'Select Sales Date first!'); return; }
            let rec = dbSubmissions.find(s => s.code == currentUser.id && s.date === bDate);
            
            let pBank1 = rec ? (rec.bank1 || 0) : 0;
            let pBank2 = rec ? (rec.bank2 || 0) : 0;
            let nBank1 = parseFloat(document.getElementById('f-bank1').value) || 0;
            let nBank2 = parseFloat(document.getElementById('f-bank2').value) || 0;
            let tStr = getSafeTimeStr();
            
            let updatePayload = { date: bDate, code: currentUser.id, name: currentUser.name, am: currentUser.am || "", bank1: nBank1, bank2: nBank2 };
            if (nBank1 !== pBank1 || (nBank1 > 0 && !(rec && rec.bank1_time))) updatePayload.bank1_time = tStr;
            if (nBank2 !== pBank2 || (nBank2 > 0 && !(rec && rec.bank2_time))) updatePayload.bank2_time = tStr;
            
            syncToCloud('upsert', updatePayload, () => {
                let rec = dbSubmissions.find(s => s.code == currentUser.id && s.date === bDate);
                if(!rec) { rec = { ...updatePayload }; dbSubmissions.push(rec); }
                else { Object.assign(rec, updatePayload); }
                setupBranchView();
            });
        }

        // --- 5. Manager Dashboards & Tracking ---
        let trendChartObj = null, barChartObj = null;

        function setupManagerView() {
            try {
                if (typeof updateAllDateMax === 'function') updateAllDateMax();
                todayStr = getYYYYMMDD(new Date());
                currentMonthStr = todayStr.substring(0, 7);
                if(document.getElementById('dash-month')) {
                    document.getElementById('dash-month').value = currentMonthStr;
                    updateDateDisplay('dash-month');
                }
                if(document.getElementById('dash-date')) {
                    document.getElementById('dash-date').value = todayStr;
                    updateDateDisplay('dash-date');
                }
                if(document.getElementById('track-date')) {
                    document.getElementById('track-date').value = todayStr;
                    updateDateDisplay('track-date');
                }
                if(document.getElementById('exec-filter-date')) {
                    document.getElementById('exec-filter-date').value = todayStr;
                    updateDateDisplay('exec-filter-date');
                }
                if(document.getElementById('exec-filter-month')) {
                    document.getElementById('exec-filter-month').value = currentMonthStr;
                    updateDateDisplay('exec-filter-month');
                }
                let sw = document.getElementById('section-welcome'); if(sw) sw.classList.add('hidden');
                let sb = document.getElementById('section-branch'); if(sb) sb.classList.add('hidden');
                let sm = document.getElementById('section-manager'); if(sm) sm.classList.remove('hidden');
            } catch(e) {}
            try { populateFilters(); } catch(e) {}
            try { switchTab('dashboard'); } catch(e) {}
            try { updateMasterLockUI(); } catch(e) {}
            try { initTargetTracker(); } catch(e) {}
            try {
                let btnPatch = document.getElementById('btn-patch-db');
                if (btnPatch) {
                    if (currentUser && currentUser.role === 'admin') {
                        btnPatch.classList.remove('hidden');
                        btnPatch.style.display = 'inline-block';
                    } else {
                        btnPatch.classList.add('hidden');
                        btnPatch.style.display = 'none';
                    }
                }
            } catch(e) {}
            try {
                if (typeof surveysLoaded !== 'undefined' && surveysLoaded && responsesLoaded) {
                    checkSurveyAlerts();
                }
            } catch(e) {}
        }

        function getManagerFilteredBranches() {
            if(!currentUser) return [];
            let cName = (currentUser.name || '').trim().toUpperCase();
            let base = (currentUser.role === 'admin' || currentUser.role === 'operation') 
                ? [...masterBranches] 
                : masterBranches.filter(b => {
                      let bAm = (b.am || '').trim().toUpperCase();
                      return bAm === cName;
                  });
            if (base.length === 0 && Array.isArray(dbSubmissions) && dbSubmissions.length > 0) {
                let seenCode = new Set();
                dbSubmissions.forEach(s => {
                    if (s && s.code && !seenCode.has(String(s.code))) {
                        let sAm = (s.am || '').trim().toUpperCase();
                        if (currentUser.role === 'admin' || currentUser.role === 'operation' || sAm === cName) {
                            seenCode.add(String(s.code));
                            let mb = masterBranches.find(x => String(x.code) === String(s.code));
                            base.push({ 
                                code: String(s.code), 
                                name: mb && mb.name ? mb.name : (s.name || String(s.code)), 
                                am: mb && mb.am ? mb.am : (s.am || cName), 
                                state: mb && mb.state ? mb.state : (s.state || ''), 
                                warehouse: mb && mb.warehouse ? mb.warehouse : (s.warehouse || '') 
                            });
                        }
                    }
                });
            }
            let fAM = document.getElementById('filter-am') ? document.getElementById('filter-am').value : '';
            let fState = document.getElementById('filter-state') ? document.getElementById('filter-state').value : '';
            let fWH = document.getElementById('filter-warehouse') ? document.getElementById('filter-warehouse').value : '';
            let fB = document.getElementById('filter-branch') ? document.getElementById('filter-branch').value : '';
            if(fAM) base = base.filter(b => (b.am || '').trim().toUpperCase() === String(fAM).trim().toUpperCase());
            if(fState) base = base.filter(b => (b.state || '') === fState);
            if(fWH) base = base.filter(b => (b.warehouse || '') === fWH);
            if(fB) base = base.filter(b => String(b.code) === String(fB));
            base.forEach(b => { if (!b.state || b.state === '' || b.state === 'LAIN2' || b.state === 'LAIN') b.state = 'LAIN-LAIN'; });
            return base;
        }

        function populateFilters() {
            if(!document.getElementById('filter-am') || !currentUser) return;
            let base = (currentUser.role === 'admin' || currentUser.role === 'operation') ? masterBranches : masterBranches.filter(b => (b.am || '').trim().toUpperCase() === (currentUser.name || '').trim().toUpperCase());
            
            let ams = [...new Set(base.map(b=>b.am).filter(Boolean))].sort();
            let states = [...new Set(base.map(b=>b.state).filter(Boolean))].sort();
            let whs = [...new Set(base.map(b=>b.warehouse).filter(Boolean))].sort();
            
            let prevAM = document.getElementById('filter-am').value;
            let amHtml = '<option value="">All Area Managers</option>';
            ams.forEach(x => amHtml += `<option value="${x}">${x}</option>`);
            document.getElementById('filter-am').innerHTML = amHtml;
            document.getElementById('filter-am').value = prevAM;
            
            let prevState = document.getElementById('filter-state').value;
            let stateHtml = '<option value="">All States</option>';
            states.forEach(x => stateHtml += `<option value="${x}">${x}</option>`);
            document.getElementById('filter-state').innerHTML = stateHtml;
            document.getElementById('filter-state').value = prevState;
            
            let prevWH = document.getElementById('filter-warehouse').value;
            let whHtml = '<option value="">All Warehouses</option>';
            whs.forEach(x => whHtml += `<option value="${x}">${x}</option>`);
            document.getElementById('filter-warehouse').innerHTML = whHtml;
            document.getElementById('filter-warehouse').value = prevWH;
            
            if(document.getElementById('filter-branch')) {
                let branches = base.map(b => ({code: b.code, name: b.name})).sort((a,b) => a.name.localeCompare(b.name));
                let prevBranch = document.getElementById('filter-branch').value;
                let branchHtml = '<option value="">All Branches</option>';
                branches.forEach(x => branchHtml += `<option value="${x.code}">${x.name} (${x.code})</option>`);
                document.getElementById('filter-branch').innerHTML = branchHtml;
                document.getElementById('filter-branch').value = prevBranch;
            }
        }

        function isSubmissionCountable(s) {
            if (!s) return false;
            return Boolean(s.night_locked || ((parseFloat(s.sales) || 0) !== 0) || ((parseInt(s.transactions) || 0) > 0) || ((parseFloat(s.lorry) || 0) > 0) || ((parseFloat(s.mykasih) || 0) > 0) || ((parseFloat(s.bank1) || 0) > 0) || ((parseFloat(s.bank2) || 0) > 0));
        }

        function isSubmissionSubmitted(s) {
            if (!s) return false;
            return Boolean(s.night_locked || ((parseFloat(s.sales) || 0) !== 0) || ((parseInt(s.transactions) || 0) > 0) || ((parseFloat(s.lorry) || 0) > 0) || ((parseFloat(s.mykasih) || 0) > 0));
        }

        function updateSubmissionRatio() {
            let mode = currentTab === 'dashboard' ? (document.getElementById('dash-mode') ? document.getElementById('dash-mode').value : 'daily') : 'daily';
            let targetDate = mode === 'daily' ? document.getElementById(currentTab === 'dashboard' ? 'dash-date' : 'track-date').value : document.getElementById('dash-month').value;
            let branches = getManagerFilteredBranches(); let bCodes = branches.map(b=>String(b.code));
            let cName = currentUser ? (currentUser.name || '').trim().toUpperCase() : '';
            let dashData = deduplicateSubmissionsList(dbSubmissions.filter(s => {
                let matchDate = (mode === 'daily' ? s.date === targetDate : s.date.startsWith(targetDate));
                if (!matchDate) return false;
                if (!isSubmissionSubmitted(s)) return false;
                if (bCodes.length > 0 && !bCodes.includes(String(s.code))) return false;
                return true;
            }));
            
            let subRatioEl = document.getElementById('am-stat-ratio');
            if(subRatioEl) {
                let submittedCount = new Set(dashData.map(s=>String(s.code))).size;
                let totalBranches = branches.length;
                if (totalBranches === 0) {
                    totalBranches = masterBranches && masterBranches.length > 0 ? masterBranches.length : 2855;
                }
                if (totalBranches < submittedCount) totalBranches = submittedCount;
                subRatioEl.innerText = mode==='daily' ? `${submittedCount} / ${totalBranches}` : `Monthly`;
                subRatioEl.className = `text-sm font-black ml-1 ${submittedCount===totalBranches && totalBranches>0 ? 'text-emerald-400' : 'text-amber-400'}`;
            }
        }

        function updateMasterLockUI() {
            let btn = document.getElementById('btn-master-lock');
              let btnPast = document.getElementById('btn-past-lock');
              if(!btn) return;
              if(masterLock) {
                btn.className = "super-admin hidden flex-1 sm:flex-none cursor-pointer bg-rose-700 text-white border border-rose-400 hover:bg-rose-600 px-4 py-2.5 rounded-lg text-xs font-bold transition-colors shadow";
                btn.innerHTML = `<i class="fa-solid fa-lock mr-1"></i> System Locked (Today)`;
            } else {
                btn.className = "super-admin hidden flex-1 sm:flex-none cursor-pointer bg-emerald-700 text-white border border-emerald-400 hover:bg-emerald-600 px-4 py-2.5 rounded-lg text-xs font-bold transition-colors shadow";
                btn.innerHTML = `<i class="fa-solid fa-lock-open mr-1"></i> System Unlocked (Today)`;
              }
              if(currentUser && currentUser.role === 'admin') btn.classList.remove('hidden');

              if(btnPast) {
                  if(pastLock) {
                      btnPast.className = "super-admin hidden flex-1 sm:flex-none cursor-pointer bg-rose-700 text-white border border-rose-400 hover:bg-rose-600 px-4 py-2.5 rounded-lg text-xs font-bold transition-colors shadow";
                      btnPast.innerHTML = `<i class="fa-solid fa-lock mr-1"></i> System Locked (Past)`;
                  } else {
                      btnPast.className = "super-admin hidden flex-1 sm:flex-none cursor-pointer bg-emerald-700 text-white border border-emerald-400 hover:bg-emerald-600 px-4 py-2.5 rounded-lg text-xs font-bold transition-colors shadow";
                      btnPast.innerHTML = `<i class="fa-solid fa-lock-open mr-1"></i> System Unlocked (Past)`;
                  }
                  if(currentUser && currentUser.role === 'admin') btnPast.classList.remove('hidden');
              }
          }

        function togglePastLock() {
              if(currentUser.role !== 'admin') return;
              let actionText = pastLock ? "Unlock" : "Lock";
              let newLockState = !pastLock;
              Swal.fire({ title: `${actionText} Past Dates?`, text: `Are you sure you want to ${actionText.toLowerCase()} the Primary Operations form for ALL PAST DATES?`, icon: 'warning', showCancelButton: true, confirmButtonText: `Yes, ${actionText}` })
              .then((result) => {
                  if (result.isConfirmed) {
                      Swal.fire({ title: 'Saving...', text: `Updating past date lock status on server...`, allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});
                      syncToCloud('set_past_lock', {locked: newLockState}, () => { 
                          pastLock = newLockState;
                          updateMasterLockUI();
                          Swal.close();
                          syncManagerFromCloud(); 
                      });
                  }
              });
          }

          function toggleMasterLock() {
            if(currentUser.role !== 'admin') return;
            let actionText = masterLock ? "Unlock" : "Lock";
            let newLockState = !masterLock;
            Swal.fire({ title: `${actionText} System?`, text: `Are you sure you want to ${actionText.toLowerCase()} the Primary Operations form for ALL branches?`, icon: 'warning', showCancelButton: true, confirmButtonText: `Yes, ${actionText}` })
            .then((result) => {
                if (result.isConfirmed) {
                    Swal.fire({ title: 'Menyimpan...', text: `Mengemaskini status kunci sistem hari ini di server...`, allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});
                    syncToCloud('set_global_lock', {locked: newLockState}, () => { 
                        masterLock = newLockState;
                        updateMasterLockUI();
                        Swal.close();
                        syncManagerFromCloud(); 
                    });
                }
            });
        }

        function renderDashboard() {
            let mode = document.getElementById('dash-mode') ? document.getElementById('dash-mode').value : 'daily';
            let targetDate = mode === 'daily' ? document.getElementById('dash-date').value : document.getElementById('dash-month').value;
            let branches = getManagerFilteredBranches(); let bCodes = branches.map(b=>String(b.code));
            let cName = currentUser ? (currentUser.name || '').trim().toUpperCase() : '';
            let dashData = deduplicateSubmissionsList(dbSubmissions.filter(s => {
                let matchDate = (mode === 'daily' ? s.date === targetDate : s.date.startsWith(targetDate));
                if (!matchDate) return false;
                if (!currentUser || currentUser.role === 'admin' || currentUser.role === 'operation') return true;
                if (currentUser.role === 'am') {
                    if (bCodes.length > 0) return bCodes.includes(String(s.code));
                    let sAm = (s.am || '').trim().toUpperCase();
                    return sAm && cName && sAm === cName;
                }
                return bCodes.includes(String(s.code));
            }));
            
            updateSubmissionRatio();

            let calcKPI = (data) => data.reduce((acc, curr) => ({
                sales: acc.sales + (curr.sales||0), trans: acc.trans + (curr.transactions||0), mykasih: acc.mykasih + (curr.mykasih||0), lorry: acc.lorry + (curr.lorry||0), bank: acc.bank + (curr.bank1||0) + (curr.bank2||0)
            }), {sales:0, trans:0, mykasih:0, lorry:0, bank:0});

            let tKPI = calcKPI(dashData.filter(isSubmissionCountable)); 

            document.getElementById('kpi-sales').innerText = `RM ${formatRM(tKPI.sales)}`; document.getElementById('kpi-mykasih').innerText = `RM ${formatRM(tKPI.mykasih)}`;
            document.getElementById('kpi-lorry').innerText = `RM ${formatRM(tKPI.lorry)}`; document.getElementById('kpi-trans').innerText = formatNum(tKPI.trans);

            let diff = tKPI.lorry - tKPI.sales;
            let diffEl = document.getElementById('kpi-diff');
            diffEl.innerText = `${diff < 0 ? '-' : ''}RM ${formatRM(Math.abs(diff))}`;
            let diffStatus = document.getElementById('kpi-diff-status');
            if(diff > 0) {
                diffEl.className = "text-2xl sm:text-3xl font-black text-emerald-400";
                diffStatus.innerText = "Target Achieved (Green)"; diffStatus.className = "text-[10px] font-bold uppercase mt-1 text-emerald-500";
            } else if(diff < 0) {
                diffEl.className = "text-2xl sm:text-3xl font-black text-rose-500";
                diffStatus.innerText = "Below Target (Red)"; diffStatus.className = "text-[10px] font-bold uppercase mt-1 text-rose-500";
            } else {
                diffEl.className = "text-2xl sm:text-3xl font-black text-white"; diffStatus.innerText = "Balanced"; diffStatus.className = "text-[10px] font-bold uppercase mt-1 text-slate-500";
            }

            let grouped = {};
            dashData.filter(s => s.night_locked || (parseFloat(s.sales)||0)>0 || (parseFloat(s.transactions)||0)>0).forEach(s => {
                if(!grouped[s.code]) grouped[s.code] = { code: s.code, sales: 0, lorry: 0 };
                grouped[s.code].sales += (s.sales || 0);
                grouped[s.code].lorry += (s.lorry || 0);
            });
            let sorted = Object.values(grouped).sort((a,b) => b.sales - a.sales);
            let top10 = sorted.slice(0, 10), bot10 = sorted.slice(-10).reverse();
            let rowTempl = (s, idx, isTop) => {
                let cTrim = String(s.code).trim();
                let cNum = !isNaN(Number(cTrim)) ? Number(cTrim) : null;
                let cPad = /^\d+$/.test(cTrim) ? cTrim.padStart(4, '0') : cTrim;
                let findB = (arr) => arr ? arr.find(x => String(x.code).trim() === cTrim || (cNum !== null && Number(x.code) === cNum) || String(x.code).trim() === cPad) : null;
                let b = findB(branches) || findB(masterBranches) || {name: s.name || 'Unknown', am: s.am || 'NO AM'};
                return `<div class="flex items-center justify-between bg-slate-900/50 p-2 rounded-lg border border-slate-800 shadow-sm"><div class="flex items-center gap-3"><span class="w-5 text-center text-xs font-black text-slate-500 bg-slate-950 rounded py-0.5 border border-slate-800">${idx+1}</span><div><p class="text-[11px] font-bold text-white">${b.name}</p><div class="flex items-center gap-1.5"><p class="text-[9px] text-slate-500 uppercase tracking-widest">${s.code}</p><span class="text-[8px] text-cyan-500 font-semibold uppercase"><i class="fa-solid fa-user-tie mr-0.5"></i>${b.am}</span></div></div></div><span class="text-xs font-bold ${isTop?'text-emerald-400':'text-rose-400'}">RM ${formatRM(s.sales)}</span></div>`;
            };
            document.getElementById('board-top').innerHTML = top10.length > 0 ? top10.map((s, i) => rowTempl(s, i, true)).join('') : '<p class="text-xs text-slate-500">No data</p>';
            document.getElementById('board-bottom').innerHTML = bot10.length > 0 ? bot10.map((s, i) => rowTempl(s, sorted.length - i - 1, false)).join('') : '<p class="text-xs text-slate-500">No data</p>';

            // Branch Comparison Table
            let compHtml = "";
            let allBranchesData = branches.map(b => {
                let s = grouped[b.code] || { sales: 0, lorry: 0 };
                return { code: b.code, name: b.name, am: b.am, sales: s.sales, lorry: s.lorry, diff: s.lorry - s.sales };
            }).sort((a,b) => b.diff - a.diff);
            let slicedBranchesData = allBranchesData.slice(0, 150);
            
            slicedBranchesData.forEach(b => {
                let diffColor = b.diff > 0 ? 'text-emerald-400' : (b.diff < 0 ? 'text-rose-500' : 'text-slate-400');
                compHtml += `<tr class="hover:bg-slate-900/40 border-b border-slate-800/50 transition-colors">
                    <td class="p-3"><div class="font-bold text-slate-300 text-[11px]">${b.code}</div><div class="text-[9px] text-slate-500 truncate max-w-[150px]">${b.name}</div><div class="text-[8px] text-cyan-500 font-semibold mt-0.5 uppercase"><i class="fa-solid fa-user-tie mr-1"></i>${b.am}</div></td>
                    <td class="p-3 text-cyan-400 font-semibold">RM ${formatRM(b.sales)}</td>
                    <td class="p-3 text-purple-400">RM ${formatRM(b.lorry)}</td>
                    <td class="p-3 text-right font-bold ${diffColor}">${b.diff < 0 ? '-' : ''}RM ${formatRM(Math.abs(b.diff))}</td>
                </tr>`;
            });
            
            if (allBranchesData.length > 150) {
                compHtml += `<tr><td colspan="4" class="p-3 text-center text-amber-500 font-bold bg-amber-500/10 text-xs">Memaparkan 150 cawangan teratas sahaja untuk kelancaran sistem.</td></tr>`;
            }

            document.getElementById('dashboard-compare-tbody').innerHTML = compHtml || '<tr><td colspan="4" class="p-4 text-center text-slate-500 text-xs">No data</td></tr>';

            renderCharts(targetDate, bCodes, tKPI);
        }

        function renderCharts(dateStr, branchCodes, tKPI) {
            if (typeof Chart === 'undefined') {
                console.warn("Chart.js is not loaded. Skipping renderCharts.");
                return;
            }
            Chart.defaults.color = '#f8fafc'; Chart.defaults.font.family = "'Inter', sans-serif";
            
            let barEl = document.getElementById('chart-bar-compare');
            if (barEl) {
                if(barChartObj) barChartObj.destroy();
                barChartObj = new Chart(barEl.getContext('2d'), { type: 'bar', data: { labels: ['Today\'s Operations'], datasets: [ { label: 'Total Sales', data: [tKPI.sales], backgroundColor: '#06b6d4', borderRadius: 4 }, { label: 'Total Bank-In', data: [tKPI.bank], backgroundColor: '#10b981', borderRadius: 4 }, { label: 'Lorry Cost', data: [tKPI.lorry], backgroundColor: '#a855f7', borderRadius: 4 } ]}, options: { responsive: true, maintainAspectRatio: false, scales:{y:{grid:{color:'rgba(51,65,85,0.3)'}}} } });
            }

            let trendEl = document.getElementById('chart-sales-trend');
            if (!trendEl) return;

            let labels = [], datesArr = [], salesData = [];
            let baseD = new Date(dateStr);
            for(let i=6; i>=0; i--) {
                let d = getYYYYMMDD(new Date(baseD.getTime() - (i*86400000)));
                datesArr.push(d);
                labels.push(d.slice(5)); 
                let daySum = deduplicateSubmissionsList(dbSubmissions.filter(s => s.date === d && branchCodes.includes(String(s.code)) && isSubmissionCountable(s))).reduce((a,c)=>a+(parseFloat(c.sales)||0), 0);
                salesData.push(daySum);
            }

            if(trendChartObj) trendChartObj.destroy();
            trendChartObj = new Chart(trendEl.getContext('2d'), { type: 'line', data: { labels: labels, datasets: [{ label: 'Sales (RM)', data: salesData, borderColor: '#06b6d4', backgroundColor: 'rgba(6, 182, 212, 0.1)', tension: 0.4, fill: true }] }, options: { responsive: true, maintainAspectRatio: false, plugins:{legend:{display:false}}, scales:{y:{grid:{color:'rgba(51,65,85,0.3)'}},x:{grid:{color:'rgba(51,65,85,0.3)'}}} } });

            // Asynchronously fetch 7-day historical sales directly from submissions collection
            if (typeof db !== 'undefined' && db.collection && datesArr.length > 0) {
                db.collection("submissions").where("date", "in", datesArr).get().then(snap => {
                    let fetchedRecords = [];
                    snap.forEach(doc => {
                        let d = doc.data();
                        if (d && d.date) fetchedRecords.push(d);
                    });
                    
                    let existSet = new Set(dbSubmissions.map(s => String(s.code).trim() + "_" + String(s.date).trim()));
                    fetchedRecords.forEach(s => {
                        let k = String(s.code).trim() + "_" + String(s.date).trim();
                        if (!existSet.has(k)) dbSubmissions.push(s);
                    });
                    dbSubmissions = deduplicateSubmissionsList(dbSubmissions);

                    let updatedSalesData = datesArr.map(d => {
                        return deduplicateSubmissionsList(dbSubmissions.filter(s => s.date === d && branchCodes.includes(String(s.code)) && isSubmissionCountable(s))).reduce((a,c)=>a+(parseFloat(c.sales)||0), 0);
                    });
                    if (trendChartObj && trendChartObj.data && trendChartObj.data.datasets[0]) {
                        trendChartObj.data.datasets[0].data = updatedSalesData;
                        trendChartObj.update();
                    }
                }).catch(e => console.error("Error fetching 7-day chart trend:", e));
            }
        }

        function setExecTimeframe(mode) {
            execCurrentTimeframe = mode;
            ['daily', 'weekly', 'monthly'].forEach(m => {
                let btn = document.getElementById('btn-exec-tf-' + m);
                if (btn) {
                    if (m === mode) {
                        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-cyan-600 text-white shadow-md';
                    } else {
                        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-400 hover:text-white';
                    }
                }
            });
            let dateInput = document.getElementById('exec-filter-date');
            let monthInput = document.getElementById('exec-filter-month');
            if (dateInput && monthInput) {
                if (mode === 'daily' || mode === 'weekly') {
                    dateInput.classList.remove('hidden');
                    monthInput.classList.add('hidden');
                    if (!dateInput.value) dateInput.value = todayStr;
                } else {
                    dateInput.classList.add('hidden');
                    monthInput.classList.remove('hidden');
                    if (!monthInput.value) monthInput.value = todayStr.substring(0, 7);
                }
            }
            if (typeof triggerDataSync === 'function') triggerDataSync();
            renderExecCharts();
        }

        function renderExecCharts() {
            if (typeof Chart === 'undefined') {
                console.warn("Chart.js not loaded. Skipping renderExecCharts.");
                return;
            }
            Chart.defaults.color = '#f8fafc';
            Chart.defaults.font.family = "'Inter', sans-serif";

            let mode = execCurrentTimeframe || 'monthly';
            let dateInput = document.getElementById('exec-filter-date');
            let monthInput = document.getElementById('exec-filter-month');
            
            let targetDate = todayStr;
            let targetMonth = todayStr.substring(0, 7);
            if (dateInput) { if (!dateInput.value) dateInput.value = todayStr; targetDate = dateInput.value; }
            if (monthInput) { if (!monthInput.value) monthInput.value = todayStr.substring(0, 7); targetMonth = monthInput.value; }

            // Filter submissions based on timeframe
            let filteredSubs = [];
            let datesList = [];
            if (mode === 'daily') {
                datesList = [targetDate];
                filteredSubs = deduplicateSubmissionsList(dbSubmissions.filter(s => s.date === targetDate && isSubmissionCountable(s)));
            } else if (mode === 'weekly') {
                let baseD = new Date(targetDate);
                for (let i = 6; i >= 0; i--) {
                    let dStr = getYYYYMMDD(new Date(baseD.getTime() - (i * 86400000)));
                    datesList.push(dStr);
                }
                filteredSubs = deduplicateSubmissionsList(dbSubmissions.filter(s => datesList.includes(s.date) && isSubmissionCountable(s)));
            } else {
                // monthly
                filteredSubs = deduplicateSubmissionsList(dbSubmissions.filter(s => s && s.date && String(s.date).startsWith(targetMonth) && isSubmissionCountable(s)));
            }

            // Calculate overall KPIs for cards
            let totalSales = 0, totalLorry = 0, totalTrans = 0, totalBank = 0;
            filteredSubs.forEach(s => {
                totalSales += (parseFloat(s.sales) || 0);
                totalLorry += (parseFloat(s.lorry) || 0);
                totalTrans += (parseFloat(s.transactions) || 0);
                totalBank += (parseFloat(s.bank1) || 0) + (parseFloat(s.bank2) || 0);
            });
            let netRev = totalSales - totalLorry;
            let costRatio = totalSales > 0 ? ((totalLorry / totalSales) * 100) : 0;

            let elSales = document.getElementById('exec-stat-sales') || document.getElementById('exec-kpi-sales');
            let elTarget = document.getElementById('exec-stat-target');
            let elDiff = document.getElementById('exec-stat-diff');
            let elAchieve = document.getElementById('exec-stat-achieve');
            let elAchieveBar = document.getElementById('exec-stat-achieve-bar');
            let elLorry = document.getElementById('exec-stat-lorry');
            let elRatio = document.getElementById('exec-stat-lorry-ratio') || document.getElementById('exec-kpi-lorry-ratio');
            let elLorryStatus = document.getElementById('exec-stat-lorry-status');
            let elTrans = document.getElementById('exec-stat-trans') || document.getElementById('exec-kpi-trans');
            let elTransAvg = document.getElementById('exec-stat-trans-avg');
            let elNet = document.getElementById('exec-kpi-net');

            if (elSales) elSales.innerText = `RM ${formatRM(totalSales)}`;
            if (elNet) {
                elNet.innerText = `RM ${formatRM(netRev)}`;
                elNet.className = netRev >= 0 ? 'text-2xl font-black text-emerald-400 mt-1' : 'text-2xl font-black text-rose-400 mt-1';
            }
            if (elLorry) elLorry.innerText = `RM ${formatRM(totalLorry)}`;
            if (elRatio) elRatio.innerText = `${costRatio.toFixed(1)}%`;
            if (elLorryStatus) {
                if (costRatio <= 5.0) {
                    elLorryStatus.innerText = 'Safe (< 5.0%)';
                    elLorryStatus.className = 'text-emerald-400 font-bold';
                } else {
                    elLorryStatus.innerText = 'Alert (> 5.0%)';
                    elLorryStatus.className = 'text-rose-400 font-bold';
                }
            }
            if (elTrans) elTrans.innerText = formatNum(totalTrans);
            if (elTransAvg) {
                let activeBranchesCount = Math.max(1, masterBranches.length);
                elTransAvg.innerText = `${Math.round(totalTrans / activeBranchesCount)}`;
            }

            // Map branch code to AM and code to target
            let amMap = {}; // branchCode -> amName
            let allAMs = new Set();
            masterBranches.forEach(b => {
                let am = (b.am || 'TIADA AM').trim().toUpperCase();
                let cStr = String(b.code).trim();
                amMap[cStr] = am;
                if (!isNaN(Number(cStr))) amMap[Number(cStr)] = am;
                if (/^\d+$/.test(cStr)) amMap[cStr.padStart(4, '0')] = am;
                allAMs.add(am);
            });
            let sortedAMs = Array.from(allAMs).sort();
            let palette = ['#06b6d4', '#a855f7', '#ec4899', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#14b8a6', '#ef4444', '#6366f1', '#e11d48', '#0d9488', '#7c3aed', '#d97706', '#2563eb'];

            // Calculate sales by AM
            let amSalesMap = {};
            sortedAMs.forEach(am => amSalesMap[am] = 0);
            filteredSubs.forEach(s => {
                let codeStr = String(s.code).trim();
                let am = amMap[codeStr] || (!isNaN(Number(codeStr)) ? amMap[Number(codeStr)] : null) || amMap[codeStr.padStart(4, '0')] || (s.am ? s.am.trim().toUpperCase() : 'TIADA AM');
                amSalesMap[am] = (amSalesMap[am] || 0) + (parseFloat(s.sales) || 0);
            });

            // Sort AMs by sales descending for split charts (1A/1B and 2A/2B)
            let sortedAMsBySales = Object.keys(amSalesMap).filter(am => amSalesMap[am] > 0 || allAMs.has(am)).sort((a, b) => (amSalesMap[b] || 0) - (amSalesMap[a] || 0));
            if (sortedAMsBySales.length === 0) sortedAMsBySales = sortedAMs;
            let topAMs1 = sortedAMsBySales.slice(0, 15);
            let bottomAMs1 = sortedAMsBySales.slice(15);

            // Chart 1A & 1B: Sumbangan AM (Donut Charts Split: Top 15 vs #16+)
            let ctxAM1 = document.getElementById('exec-chart-am-share-1') || document.getElementById('exec-chart-am-share') || document.getElementById('chart-exec-am');
            let ctxAM2 = document.getElementById('exec-chart-am-share-2');

            let donutCenterPlugin = {
                id: 'donutCenterText',
                beforeDraw: function(chart) {
                    if (chart.config.type !== 'doughnut') return;
                    let width = chart.width, height = chart.height, ctx = chart.ctx;
                    ctx.save();
                    let chartArea = chart.chartArea;
                    let centerX = (chartArea.left + chartArea.right) / 2;
                    let centerY = (chartArea.top + chartArea.bottom) / 2;
                    
                    let dataset = chart.data.datasets[0];
                    if (!dataset || !dataset.data) return;
                    let total = dataset.data.reduce((a, b) => a + (parseFloat(b) || 0), 0);
                    let totalStr = `RM ${formatRM(total)}`;
                    
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.font = "bold 11px 'Inter', sans-serif";
                    ctx.fillStyle = "#94a3b8";
                    ctx.fillText("TOTAL SHARE", centerX, centerY - 12);
                    
                    ctx.font = "900 15px 'Inter', sans-serif";
                    ctx.fillStyle = "#38bdf8";
                    ctx.fillText(totalStr, centerX, centerY + 8);
                    ctx.restore();
                }
            };

            if (ctxAM1) {
                if (execChartAMShare) execChartAMShare.destroy();
                let amData1 = topAMs1.map(am => amSalesMap[am] || 0);
                execChartAMShare = new Chart(ctxAM1.getContext('2d'), {
                    type: 'doughnut',
                    plugins: [donutCenterPlugin],
                    data: {
                        labels: topAMs1,
                        datasets: [{
                            data: amData1,
                            backgroundColor: palette.slice(0, topAMs1.length),
                            borderWidth: 3,
                            borderColor: '#0f172a',
                            hoverOffset: 12,
                            borderRadius: 6
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { 
                                position: 'right', 
                                align: 'center',
                                labels: { 
                                    boxWidth: 12, 
                                    padding: 10, 
                                    font: { size: 11, family: 'Inter', weight: 'bold' },
                                    color: '#ffffff',
                                    generateLabels: function(chart) {
                                        let data = chart.data;
                                        if (data.labels.length && data.datasets.length) {
                                            let dataset = data.datasets[0];
                                            let total = dataset.data.reduce((a, b) => a + (parseFloat(b) || 0), 0);
                                            return data.labels.map(function(label, i) {
                                                let val = parseFloat(dataset.data[i]) || 0;
                                                let pct = total > 0 ? ((val / total) * 100).toFixed(1) : (totalSales > 0 ? ((val / totalSales) * 100).toFixed(1) : 0);
                                                return {
                                                    text: `${label} (${pct}% | RM ${formatRM(val)})`,
                                                    fillStyle: dataset.backgroundColor[i],
                                                    strokeStyle: dataset.borderColor || '#0f172a',
                                                    lineWidth: dataset.borderWidth || 2,
                                                    fontColor: '#ffffff',
                                                    color: '#ffffff',
                                                    hidden: isNaN(dataset.data[i]) || (chart.getDatasetMeta(0).data[i] && chart.getDatasetMeta(0).data[i].hidden),
                                                    index: i
                                                };
                                            });
                                        }
                                        return [];
                                    }
                                } 
                            },
                            tooltip: {
                                callbacks: {
                                    label: function(ctx) {
                                        let val = ctx.raw || 0;
                                        let pct = totalSales > 0 ? ((val / totalSales) * 100).toFixed(1) : 0;
                                        return `${ctx.label}: RM ${formatRM(val)} (${pct}%)`;
                                    }
                                }
                            }
                        },
                        cutout: '68%'
                    }
                });
            }

            if (ctxAM2) {
                if (execChartAMShare2) execChartAMShare2.destroy();
                if (bottomAMs1.length > 0) {
                    let amData2 = bottomAMs1.map(am => amSalesMap[am] || 0);
                    execChartAMShare2 = new Chart(ctxAM2.getContext('2d'), {
                        type: 'doughnut',
                        plugins: [donutCenterPlugin],
                        data: {
                            labels: bottomAMs1,
                            datasets: [{
                                data: amData2,
                                backgroundColor: palette.slice(0, bottomAMs1.length),
                                borderWidth: 3,
                                borderColor: '#0f172a',
                                hoverOffset: 12,
                                borderRadius: 6
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { 
                                    position: 'right', 
                                    align: 'center',
                                    labels: { 
                                        boxWidth: 12, 
                                        padding: 10, 
                                        font: { size: 11, family: 'Inter', weight: 'bold' },
                                        color: '#ffffff',
                                        generateLabels: function(chart) {
                                            let data = chart.data;
                                            if (data.labels.length && data.datasets.length) {
                                                let dataset = data.datasets[0];
                                                let total = dataset.data.reduce((a, b) => a + (parseFloat(b) || 0), 0);
                                                return data.labels.map(function(label, i) {
                                                    let val = parseFloat(dataset.data[i]) || 0;
                                                    let pct = total > 0 ? ((val / total) * 100).toFixed(1) : (totalSales > 0 ? ((val / totalSales) * 100).toFixed(1) : 0);
                                                    return {
                                                        text: `${label} (${pct}% | RM ${formatRM(val)})`,
                                                        fillStyle: dataset.backgroundColor[i],
                                                        strokeStyle: dataset.borderColor || '#0f172a',
                                                        lineWidth: dataset.borderWidth || 2,
                                                        fontColor: '#ffffff',
                                                        color: '#ffffff',
                                                        hidden: isNaN(dataset.data[i]) || (chart.getDatasetMeta(0).data[i] && chart.getDatasetMeta(0).data[i].hidden),
                                                        index: i
                                                    };
                                                });
                                            }
                                            return [];
                                        }
                                    } 
                                },
                                tooltip: {
                                    callbacks: {
                                        label: function(ctx) {
                                            let val = ctx.raw || 0;
                                            let pct = totalSales > 0 ? ((val / totalSales) * 100).toFixed(1) : 0;
                                            return `${ctx.label}: RM ${formatRM(val)} (${pct}%)`;
                                        }
                                    }
                                }
                            },
                            cutout: '68%'
                        }
                    });
                }
            }

            // Chart 2A & 2B: Jualan Sebenar vs Sasaran (Split: Top 1-28 AM vs #29+)
            window.chart2Orientation = window.chart2Orientation || 'vertical';
            let txtChart2Orient = document.getElementById('txt-chart2-orient');
            if (txtChart2Orient) {
                txtChart2Orient.innerText = window.chart2Orientation === 'vertical' ? 'Switch Horizontal' : 'Switch Vertical';
            }

            let ctxTarget1 = document.getElementById('exec-chart-sales-target-1') || document.getElementById('exec-chart-sales-target') || document.getElementById('chart-exec-target');
            let ctxTarget2 = document.getElementById('exec-chart-sales-target-2');

            let topAMs2 = sortedAMsBySales.slice(0, 28);
            let bottomAMs2 = sortedAMsBySales.slice(28);

            let targetMultiplier = mode === 'daily' ? (1/30) : (mode === 'weekly' ? (7/30) : 1);
            let amTargetMap = {};
            sortedAMs.forEach(am => amTargetMap[am] = 0);
            let targetQueryMonth = mode === 'monthly' ? targetMonth : targetDate.substring(0, 7);

            let renderTargetCharts = function() {
                let totalTargetSum = sortedAMs.map(am => amTargetMap[am] || 0).reduce((a, b) => a + b, 0);

                if (elTarget) elTarget.innerText = `RM ${formatRM(totalTargetSum)}`;
                if (elDiff) {
                    let diffVal = totalSales - totalTargetSum;
                    elDiff.innerText = `${diffVal >= 0 ? '+' : '-'}RM ${formatRM(Math.abs(diffVal))}`;
                    elDiff.className = diffVal >= 0 ? 'font-bold text-emerald-400' : 'font-bold text-rose-400';
                }
                if (elAchieve) {
                    let achPct = totalTargetSum > 0 ? ((totalSales / totalTargetSum) * 100).toFixed(1) : 0;
                    elAchieve.innerText = `${achPct}%`;
                }
                if (elAchieveBar) {
                    let barPct = Math.min(100, Math.max(0, Math.round(totalTargetSum > 0 ? ((totalSales / totalTargetSum) * 100) : 0)));
                    elAchieveBar.style.width = `${barPct}%`;
                }

                if (ctxTarget1) {
                    if (execChartSalesTarget) execChartSalesTarget.destroy();
                    execChartSalesTarget = new Chart(ctxTarget1.getContext('2d'), {
                        type: 'bar',
                        data: {
                            labels: topAMs2,
                            datasets: [
                                { label: 'Actual Sales (RM)', data: topAMs2.map(am => amSalesMap[am] || 0), backgroundColor: '#06b6d4', borderRadius: 6 },
                                { label: 'Target Sales (RM)', data: topAMs2.map(am => amTargetMap[am] || 0), backgroundColor: 'rgba(236, 72, 153, 0.4)', borderColor: '#ec4899', borderWidth: 1, borderRadius: 6 }
                            ]
                        },
                        options: {
                            indexAxis: window.chart2Orientation === 'horizontal' ? 'y' : 'x',
                            responsive: true,
                            maintainAspectRatio: false,
                            scales: {
                                [window.chart2Orientation === 'horizontal' ? 'x' : 'y']: { grid: { color: 'rgba(51,65,85,0.3)' }, ticks: { callback: v => 'RM ' + formatRM(v) } },
                                [window.chart2Orientation === 'horizontal' ? 'y' : 'x']: { grid: { display: false } }
                            },
                            plugins: { legend: { position: 'top' } }
                        }
                    });
                }

                if (ctxTarget2) {
                    if (execChartSalesTarget2) execChartSalesTarget2.destroy();
                    if (bottomAMs2.length > 0) {
                        execChartSalesTarget2 = new Chart(ctxTarget2.getContext('2d'), {
                            type: 'bar',
                            data: {
                                labels: bottomAMs2,
                                datasets: [
                                    { label: 'Actual Sales (RM)', data: bottomAMs2.map(am => amSalesMap[am] || 0), backgroundColor: '#06b6d4', borderRadius: 6 },
                                    { label: 'Target Sales (RM)', data: bottomAMs2.map(am => amTargetMap[am] || 0), backgroundColor: 'rgba(236, 72, 153, 0.4)', borderColor: '#ec4899', borderWidth: 1, borderRadius: 6 }
                                ]
                            },
                            options: {
                                indexAxis: window.chart2Orientation === 'horizontal' ? 'y' : 'x',
                                responsive: true,
                                maintainAspectRatio: false,
                                scales: {
                                    [window.chart2Orientation === 'horizontal' ? 'x' : 'y']: { grid: { color: 'rgba(51,65,85,0.3)' }, ticks: { callback: v => 'RM ' + formatRM(v) } },
                                    [window.chart2Orientation === 'horizontal' ? 'y' : 'x']: { grid: { display: false } }
                                },
                                plugins: { legend: { position: 'top' } }
                            }
                        });
                    }
                }
            };

            if (typeof db !== 'undefined' && db.collection) {
                db.collection('targets').where('month', '==', targetQueryMonth).get().then(snap => {
                    snap.forEach(doc => {
                        let d = doc.data();
                        if (d && d.code && d.target_sales) {
                            let am = amMap[String(d.code)] || 'TIADA AM';
                            amTargetMap[am] = (amTargetMap[am] || 0) + (parseFloat(d.target_sales) || 0) * targetMultiplier;
                        }
                    });
                    renderTargetCharts();
                }).catch(e => {
                    console.error("Exec chart target query error:", e);
                    renderTargetCharts();
                });
            } else {
                renderTargetCharts();
            }

            // Chart 3A & 3B: Nisbah Kos Lori vs Jualan (Sorted by Kos Lori % Descending, Split: #1-28 vs #29+)
            let ctxLorry1 = document.getElementById('exec-chart-lorry-ratio-1') || document.getElementById('exec-chart-lorry-ratio') || document.getElementById('chart-exec-lorry');
            let ctxLorry2 = document.getElementById('exec-chart-lorry-ratio-2');

            let amLorryMap = {};
            sortedAMs.forEach(am => amLorryMap[am] = 0);
            filteredSubs.forEach(s => {
                let codeStr = String(s.code).trim();
                let am = amMap[codeStr] || (!isNaN(Number(codeStr)) ? amMap[Number(codeStr)] : null) || amMap[codeStr.padStart(4, '0')] || (s.am ? s.am.trim().toUpperCase() : 'TIADA AM');
                amLorryMap[am] = (amLorryMap[am] || 0) + (parseFloat(s.lorry) || 0);
            });

            let amRatioMap = {};
            sortedAMs.forEach(am => {
                let sVal = amSalesMap[am] || 0;
                let lVal = amLorryMap[am] || 0;
                amRatioMap[am] = sVal > 0 ? parseFloat(((lVal / sVal) * 100).toFixed(2)) : 0;
            });

            let sortedAMsBySalesList = sortedAMs.slice().sort((a, b) => (amSalesMap[b] || 0) - (amSalesMap[a] || 0));
            let topLorryAMs = sortedAMsBySalesList.slice(0, 28);
            let bottomLorryAMs = sortedAMsBySalesList.slice(28);

            if (ctxLorry1) {
                if (execChartLorryRatio) execChartLorryRatio.destroy();
                execChartLorryRatio = new Chart(ctxLorry1.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: topLorryAMs,
                        datasets: [
                            { label: 'Total Sales (RM)', data: topLorryAMs.map(am => amSalesMap[am] || 0), backgroundColor: '#3b82f6', borderRadius: 6 },
                            { label: 'Lorry Trip Sales (RM)', data: topLorryAMs.map(am => amLorryMap[am] || 0), backgroundColor: '#f59e0b', borderRadius: 6 }
                        ]
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            x: { grid: { color: 'rgba(51,65,85,0.3)' }, ticks: { callback: v => 'RM ' + formatRM(v) } },
                            y: { grid: { display: false } }
                        },
                        plugins: {
                            legend: { position: 'top' },
                            tooltip: {
                                callbacks: {
                                    label: function(ctx) {
                                        let am = ctx.label;
                                        let sVal = amSalesMap[am] || 0;
                                        let lVal = amLorryMap[am] || 0;
                                        let diff = sVal - lVal;
                                        let ratio = amRatioMap[am] || 0;
                                        if (ctx.datasetIndex === 0) {
                                            return `Total Sales: RM ${formatRM(sVal)} (Non-Lorry: RM ${formatRM(diff)})`;
                                        } else {
                                            return `Lorry Trip Sales: RM ${formatRM(lVal)} (${ratio}% of Total Sales)`;
                                        }
                                    }
                                }
                            }
                        }
                    }
                });
            }

            if (ctxLorry2) {
                if (execChartLorryRatio2) execChartLorryRatio2.destroy();
                if (bottomLorryAMs.length > 0) {
                    execChartLorryRatio2 = new Chart(ctxLorry2.getContext('2d'), {
                        type: 'bar',
                        data: {
                            labels: bottomLorryAMs,
                            datasets: [
                                { label: 'Total Sales (RM)', data: bottomLorryAMs.map(am => amSalesMap[am] || 0), backgroundColor: '#3b82f6', borderRadius: 6 },
                                { label: 'Lorry Trip Sales (RM)', data: bottomLorryAMs.map(am => amLorryMap[am] || 0), backgroundColor: '#f59e0b', borderRadius: 6 }
                            ]
                        },
                        options: {
                            indexAxis: 'y',
                            responsive: true,
                            maintainAspectRatio: false,
                            scales: {
                                x: { grid: { color: 'rgba(51,65,85,0.3)' }, ticks: { callback: v => 'RM ' + formatRM(v) } },
                                y: { grid: { display: false } }
                            },
                            plugins: {
                                legend: { position: 'top' },
                                tooltip: {
                                    callbacks: {
                                        label: function(ctx) {
                                            let am = ctx.label;
                                            let sVal = amSalesMap[am] || 0;
                                            let lVal = amLorryMap[am] || 0;
                                            let diff = sVal - lVal;
                                            let ratio = amRatioMap[am] || 0;
                                            if (ctx.datasetIndex === 0) {
                                                return `Total Sales: RM ${formatRM(sVal)} (Non-Lorry: RM ${formatRM(diff)})`;
                                            } else {
                                                return `Lorry Trip Sales: RM ${formatRM(lVal)} (${ratio}% of Total Sales)`;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    });
                }
            }

            // Chart 4: Pola Pembelian Mengikut Hari Dalam Minggu (Day-of-Week Sales Pattern)
            window.dayPatternMode = window.dayPatternMode || 'avg';
            let btnDayAvg = document.getElementById('btn-day-mode-avg');
            let btnDayTotal = document.getElementById('btn-day-mode-total');
            if (btnDayAvg && btnDayTotal) {
                if (window.dayPatternMode === 'avg') {
                    btnDayAvg.className = 'px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-bold transition-all shadow-md border border-purple-400';
                    btnDayTotal.className = 'px-3 py-1.5 bg-transparent text-slate-400 hover:text-white rounded-lg text-xs font-bold transition-all';
                } else {
                    btnDayTotal.className = 'px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-bold transition-all shadow-md border border-purple-400';
                    btnDayAvg.className = 'px-3 py-1.5 bg-transparent text-slate-400 hover:text-white rounded-lg text-xs font-bold transition-all';
                }
            }

            let ctxDay = document.getElementById('exec-chart-day-pattern') || document.getElementById('chart-exec-day');
            if (ctxDay) {
                let daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                let daySums = [0, 0, 0, 0, 0, 0, 0];
                let uniqueDays = [new Set(), new Set(), new Set(), new Set(), new Set(), new Set(), new Set()];

                filteredSubs.forEach(s => {
                    if (s.date) {
                        let parts = s.date.split('-');
                        if (parts.length === 3) {
                            let dt = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                            let dayIdx = dt.getDay();
                            daySums[dayIdx] += (parseFloat(s.sales) || 0);
                            uniqueDays[dayIdx].add(s.date);
                        }
                    }
                });

                let dayCounts = uniqueDays.map(set => Math.max(1, set.size));
                let displayData = window.dayPatternMode === 'avg'
                    ? daySums.map((sum, i) => sum / dayCounts[i])
                    : daySums;

                if (execChartDayPattern) execChartDayPattern.destroy();
                execChartDayPattern = new Chart(ctxDay.getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: daysOfWeek,
                        datasets: [{
                            label: window.dayPatternMode === 'avg' ? 'Daily Average Sales (RM/Day)' : 'Total Accumulated Sales (RM)',
                            data: displayData,
                            borderColor: '#a855f7',
                            backgroundColor: 'rgba(168, 85, 247, 0.15)',
                            pointBackgroundColor: '#a855f7',
                            pointRadius: 6,
                            pointHoverRadius: 8,
                            tension: 0.3,
                            fill: true
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: { grid: { color: 'rgba(51,65,85,0.3)' }, ticks: { callback: v => 'RM ' + formatRM(v) } },
                            x: { grid: { color: 'rgba(51,65,85,0.3)' } }
                        },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    label: function(ctx) {
                                        let idx = ctx.dataIndex;
                                        let sum = daySums[idx];
                                        let count = uniqueDays[idx].size || 1;
                                        let avg = sum / count;
                                        if (window.dayPatternMode === 'avg') {
                                            return [
                                                `Daily Average: RM ${formatRM(avg)} / day (from ${count} days on ${daysOfWeek[idx]})`,
                                                `Total Accumulated: RM ${formatRM(sum)}`
                                            ];
                                        } else {
                                            return [
                                                `Total Accumulated: RM ${formatRM(sum)} (from ${count} days on ${daysOfWeek[idx]})`,
                                                `Daily Average: RM ${formatRM(avg)} / day`
                                            ];
                                        }
                                    }
                                }
                            }
                        }
                    }
                });
            }

            // Chart 5: Meter Pencapaian KPI vs Sasaran (Gauge / Half-Doughnut Chart)
            let ctxMeter = document.getElementById('exec-chart-kpi-meter') || document.getElementById('chart-exec-meter');
            if (ctxMeter && typeof db !== 'undefined' && db.collection) {
                let targetQueryMonth = mode === 'monthly' ? targetMonth : targetDate.substring(0, 7);
                db.collection('targets').where('month', '==', targetQueryMonth).get().then(snap => {
                    let totalTarget = 0;
                    let amTargetMap = {};
                    sortedAMs.forEach(am => amTargetMap[am] = 0);

                    let targetMultiplier = mode === 'daily' ? (1/30) : (mode === 'weekly' ? (7/30) : 1);
                    snap.forEach(doc => {
                        let d = doc.data();
                        if (d && d.target_sales) {
                            totalTarget += (parseFloat(d.target_sales) || 0) * targetMultiplier;
                            let am = amMap[String(d.code)] || 'TIADA AM';
                            amTargetMap[am] = (amTargetMap[am] || 0) + (parseFloat(d.target_sales) || 0) * targetMultiplier;
                        }
                    });

                    if (totalTarget === 0) totalTarget = Math.max(totalSales * 1.2, 100000);

                    // Compute AM Status Buckets
                    let achievedAMs = [], ontrackAMs = [], attentionAMs = [];
                    sortedAMs.forEach(am => {
                        let act = amSalesMap[am] || 0;
                        let tgt = amTargetMap[am] || 0;
                        let pct = tgt > 0 ? (act / tgt) * 100 : (act > 0 ? 100 : 0);
                        if (pct >= 100) achievedAMs.push(am + ` (${pct.toFixed(0)}%)`);
                        else if (pct >= 80) ontrackAMs.push(am + ` (${pct.toFixed(0)}%)`);
                        else attentionAMs.push(am + ` (${pct.toFixed(0)}%)`);
                    });

                    window.kpiStatusBuckets = { achieved: achievedAMs, ontrack: ontrackAMs, attention: attentionAMs };

                    let cntAchEl = document.getElementById('cnt-kpi-achieved');
                    let cntOnEl = document.getElementById('cnt-kpi-ontrack');
                    let cntAttEl = document.getElementById('cnt-kpi-attention');
                    if (cntAchEl) cntAchEl.innerText = `${achievedAMs.length} AM`;
                    if (cntOnEl) cntOnEl.innerText = `${ontrackAMs.length} AM`;
                    if (cntAttEl) cntAttEl.innerText = `${attentionAMs.length} AM`;

                    let achievedPct = Math.min(100, Math.round((totalSales / totalTarget) * 100));
                    let remainingPct = Math.max(0, 100 - achievedPct);
                    let meterColor = achievedPct >= 100 ? '#10b981' : (achievedPct >= 80 ? '#06b6d4' : (achievedPct >= 50 ? '#f59e0b' : '#f43f5e'));

                    let meterPctEl = document.getElementById('exec-meter-pct') || document.getElementById('exec-stat-achieve');
                    let meterSubEl = document.getElementById('exec-meter-subtitle');
                    if (meterPctEl) {
                        meterPctEl.innerText = `${((totalSales/totalTarget)*100).toFixed(1)}%`;
                        meterPctEl.style.color = meterColor;
                    }
                    if (meterSubEl) {
                        meterSubEl.innerText = `RM ${formatRM(totalSales)} / RM ${formatRM(totalTarget)}`;
                    }
                    if (elAchieveBar) elAchieveBar.style.width = `${achievedPct}%`;

                    if (execChartKPIMeter) execChartKPIMeter.destroy();
                    execChartKPIMeter = new Chart(ctxMeter.getContext('2d'), {
                        type: 'doughnut',
                        data: {
                            labels: ['Current Achievement (%)', 'Remaining Target (%)'],
                            datasets: [{
                                data: [achievedPct, remainingPct],
                                backgroundColor: [meterColor, 'rgba(51, 65, 85, 0.4)'],
                                borderWidth: 0,
                                circumference: 180,
                                rotation: 270
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            cutout: '76%',
                            plugins: {
                                legend: { display: false },
                                tooltip: {
                                    callbacks: {
                                        label: function(ctx) {
                                            return `${ctx.label}: ${ctx.raw}% (RM ${formatRM(ctx.dataIndex===0?totalSales:Math.max(0,totalTarget-totalSales))})`;
                                        }
                                    }
                                }
                            }
                        }
                    });
                }).catch(e => {
                    console.error("Exec chart KPI meter query error:", e);
                });
            }

            // Chart 6: Prestasi Jualan & Sasaran Mengikut Negeri (State / Negeri Chart)
            let ctxState = document.getElementById('exec-chart-state-sales');
            if (ctxState) {
                // Map branch code to state
                let stateMap = {};
                let allStates = new Set();
                masterBranches.forEach(b => {
                    let st = (b.state || (typeof branchStateMap !== 'undefined' ? branchStateMap[String(b.code)] : '') || 'LAIN-LAIN').trim().toUpperCase();
                    if (st !== '' && st !== 'LAIN-LAIN') {
                        let cStr = String(b.code).trim();
                        stateMap[cStr] = st;
                        if (!isNaN(cStr)) stateMap[Number(cStr)] = st;
                        stateMap[cStr.padStart(4, '0')] = st;
                        allStates.add(st);
                    }
                });

                let stateSalesMap = {};
                allStates.forEach(st => stateSalesMap[st] = 0);
                filteredSubs.forEach(s => {
                    let code = String(s.code).trim();
                    let numCode = !isNaN(code) ? Number(code) : code;
                    let padCode = code.padStart(4, '0');
                    let st = stateMap[code] || stateMap[numCode] || stateMap[padCode] || (s.state ? String(s.state).trim().toUpperCase() : '') || (typeof branchStateMap !== 'undefined' && (branchStateMap[code] || branchStateMap[numCode]) ? String(branchStateMap[code] || branchStateMap[numCode]).trim().toUpperCase() : '');
                    if (st === 'LAIN2' || st === 'LAIN' || st === 'UNKNOWN' || st === 'LAIN-LAIN' || !st) {
                        let mb = masterBranches && masterBranches.find(x => String(x.code).trim() === code || (!isNaN(numCode) && Number(x.code) === numCode) || String(x.code).trim() === padCode);
                        if (mb && mb.state && mb.state !== 'LAIN2' && mb.state !== 'LAIN' && mb.state !== 'LAIN-LAIN') st = mb.state.trim().toUpperCase();
                    }
                    if (st && st !== 'LAIN-LAIN' && st !== 'LAIN' && st !== 'LAIN2' && st !== 'UNKNOWN') {
                        if (!allStates.has(st)) allStates.add(st);
                        stateSalesMap[st] = (stateSalesMap[st] || 0) + (parseFloat(s.sales) || 0);
                    }
                });

                let sortedStates = Array.from(allStates).filter(st => st && st !== 'LAIN-LAIN' && st !== 'LAIN' && st !== 'LAIN2' && st !== 'UNKNOWN' && (stateSalesMap[st] > 0 || stateSalesMap[st] < 0)).sort((a, b) => (stateSalesMap[b] || 0) - (stateSalesMap[a] || 0));
                if (sortedStates.length === 0) sortedStates = Array.from(allStates).filter(st => st && st !== 'LAIN-LAIN' && st !== 'LAIN' && st !== 'LAIN2' && st !== 'UNKNOWN');

                let stateTargetMap = {};
                sortedStates.forEach(st => stateTargetMap[st] = 0);
                let targetQueryMonth = mode === 'monthly' ? targetMonth : targetDate.substring(0, 7);
                let targetMultiplier = mode === 'daily' ? (1/30) : (mode === 'weekly' ? (7/30) : 1);

                let renderStateChart = function() {
                    let topStateEl = document.getElementById('state-top-name');
                    let countStateEl = document.getElementById('state-count-txt');
                    if (topStateEl) topStateEl.innerText = sortedStates.length > 0 ? sortedStates[0] : 'N/A';
                    if (countStateEl) countStateEl.innerText = `${sortedStates.length} States`;

                    if (execChartStateSales) execChartStateSales.destroy();
                    execChartStateSales = new Chart(ctxState.getContext('2d'), {
                        type: 'bar',
                        data: {
                            labels: sortedStates,
                            datasets: [
                                { label: 'State Sales (RM)', data: sortedStates.map(st => stateSalesMap[st] || 0), backgroundColor: '#3b82f6', borderRadius: 6 },
                                { label: 'State Target (RM)', data: sortedStates.map(st => stateTargetMap[st] || 0), backgroundColor: 'rgba(245, 158, 11, 0.4)', borderColor: '#f59e0b', borderWidth: 1, borderRadius: 6 }
                            ]
                        },
                        options: {
                            indexAxis: 'y',
                            responsive: true,
                            maintainAspectRatio: false,
                            scales: {
                                x: { grid: { color: 'rgba(51,65,85,0.3)' }, ticks: { callback: v => 'RM ' + formatRM(v) } },
                                y: { grid: { display: false } }
                            },
                            plugins: {
                                legend: { position: 'top' },
                                tooltip: {
                                    callbacks: {
                                        label: function(ctx) {
                                            let st = ctx.label;
                                            let act = stateSalesMap[st] || 0;
                                            let tgt = stateTargetMap[st] || 0;
                                            let pct = tgt > 0 ? ((act / tgt) * 100).toFixed(1) : 0;
                                            return `${ctx.dataset.label}: RM ${formatRM(ctx.raw || 0)} (${pct}% of state target)`;
                                        }
                                    }
                                }
                            }
                        }
                    });
                };

                if (typeof db !== 'undefined' && db.collection) {
                    db.collection('targets').where('month', '==', targetQueryMonth).get().then(snap => {
                        snap.forEach(doc => {
                            let d = doc.data();
                            if (d && d.code && d.target_sales) {
                                let cTrim = String(d.code).trim();
                                let cNum = !isNaN(Number(cTrim)) ? Number(cTrim) : null;
                                let cPad = /^\d+$/.test(cTrim) ? cTrim.padStart(4, '0') : cTrim;
                                let st = stateMap[cTrim] || (cNum !== null ? stateMap[cNum] : null) || stateMap[cPad] || (typeof branchStateMap !== 'undefined' && branchStateMap[cTrim] ? branchStateMap[cTrim].trim().toUpperCase() : '');
                                if (st && st !== 'LAIN-LAIN' && st !== 'LAIN' && st !== 'LAIN2' && st !== 'UNKNOWN') {
                                    stateTargetMap[st] = (stateTargetMap[st] || 0) + (parseFloat(d.target_sales) || 0) * targetMultiplier;
                                }
                            }
                        });
                        renderStateChart();
                    }).catch(e => {
                        console.error("State chart target query error:", e);
                        renderStateChart();
                    });
                } else {
                    renderStateChart();
                }
            }
        }

        function toggleChart2Orientation() {
            window.chart2Orientation = (window.chart2Orientation === 'vertical') ? 'horizontal' : 'vertical';
            if (typeof renderExecCharts === 'function') renderExecCharts();
        }

        function toggleDayPatternMode(mode) {
            window.dayPatternMode = mode;
            if (typeof renderExecCharts === 'function') renderExecCharts();
        }

        function filterOrToastAMStatus(status) {
            let buckets = window.kpiStatusBuckets || { achieved: [], ontrack: [], attention: [] };
            let list = buckets[status] || [];
            let title = status === 'achieved' ? 'AM Capai KPI (>=100%)' : (status === 'ontrack' ? 'AM Dalam Landasan (80-99%)' : 'AM Perlu Bimbingan (<80%)');
            if (typeof showToast === 'function') {
                if (list.length === 0) {
                    showToast(`${title}: Tiada AM dalam kategori ini.`, 'info');
                } else {
                    showToast(`${title} (${list.length} AM):\n` + list.slice(0, 10).join(', ') + (list.length > 10 ? ` ...dan ${list.length-10} lagi` : ''), 'info');
                }
            } else {
                alert(`${title} (${list.length} AM):\n\n` + (list.length ? list.join('\n') : 'Tiada AM dalam kategori ini.'));
            }
        }

        function renderComparisonTable() {
            let monthStr = document.getElementById('compare-month').value;
            if(!monthStr) {
                let now = new Date();
                let m = now.getMonth()+1;
                document.getElementById('compare-month').value = `${now.getFullYear()}-${m<10?'0'+m:m}`;
                monthStr = document.getElementById('compare-month').value;
            }
            if(!monthStr) return;
            
            let [y, m] = monthStr.split('-');
            let daysInMonth = new Date(y, m, 0).getDate();
            
            let branches = getManagerFilteredBranches();
            
            let thead = `<tr class="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                            <th class="p-3 sticky left-0 z-40 bg-slate-950 outline outline-1 outline-slate-800 min-w-[60px]">Code</th>
                            <th class="p-3 sticky left-[60px] z-40 bg-slate-950 outline outline-1 outline-slate-800 min-w-[150px]">Name</th>`;
            for(let d=1; d<=daysInMonth; d++) {
                thead += `<th class="p-3 border-l border-slate-800 text-center">${d}</th><th class="p-3 text-amber-500/70 text-[9px] text-center">TRANS</th>`;
            }
            thead += `</tr>`;
            document.getElementById('comparison-thead').innerHTML = thead;
            
            let tbody = '';
            
            let dataMap = {};
            let dailyTotals = {};
            for(let d=1; d<=daysInMonth; d++) dailyTotals[d] = {sales:0, trans:0, lorry:0};
            
            let branchCodeMap = {};
            branches.forEach(b => {
                let cTrim = String(b.code || '').trim();
                let cNum = !isNaN(Number(cTrim)) ? Number(cTrim) : cTrim;
                let cPad = /^\d+$/.test(cTrim) ? cTrim.padStart(4, '0') : cTrim;
                branchCodeMap[cTrim] = true;
                branchCodeMap[cNum] = true;
                branchCodeMap[cPad] = true;
            });
            
            dbSubmissions.forEach(sub => {
                if(sub.date.startsWith(monthStr)) {
                    let cTrim = String(sub.code || '').trim();
                    let cNum = !isNaN(Number(cTrim)) ? Number(cTrim) : cTrim;
                    let cPad = /^\d+$/.test(cTrim) ? cTrim.padStart(4, '0') : cTrim;
                    [cTrim, cNum, cPad].forEach(cKey => {
                        if(!dataMap[cKey]) dataMap[cKey] = {};
                        dataMap[cKey][sub.date] = { sales: sub.sales || 0, trans: sub.transactions || 0 };
                    });
                    
                    if (branchCodeMap[cTrim] || branchCodeMap[cNum] || branchCodeMap[cPad]) {
                        let dayNum = parseInt(sub.date.split('-')[2]);
                        if(dailyTotals[dayNum]) {
                            dailyTotals[dayNum].sales += (sub.sales || 0);
                            dailyTotals[dayNum].trans += (sub.transactions || 0);
                            dailyTotals[dayNum].lorry += (sub.lorry || 0);
                        }
                    }
                }
            });
            
            let totalRowHtml = `<td colspan="2" class="p-3 font-black text-amber-400 sticky left-0 z-30 bg-slate-900 outline outline-1 outline-slate-700 text-right uppercase">TOTAL KESELURUHAN</td>`;
            let prevTotSales = null;
            for(let d=1; d<=daysInMonth; d++) {
                let s = dailyTotals[d].sales;
                let t = dailyTotals[d].trans;
                let salesClass = "text-amber-400 font-bold";
                if(d > 1 && prevTotSales !== null) {
                    if(s > prevTotSales) salesClass = "text-emerald-400 font-bold bg-emerald-500/10";
                    else if(s < prevTotSales) salesClass = "text-rose-400 font-bold bg-rose-500/10";
                }
                prevTotSales = s;
                let salesDisplay = s > 0 ? formatRM(s) : '-';
                let transDisplay = t > 0 ? formatNum(t) : '-';
                totalRowHtml += `<td class="p-3 border-l border-slate-700 text-right ${salesClass}">${salesDisplay}</td><td class="p-3 text-[10px] text-amber-500/90 text-right font-bold">${transDisplay}</td>`;
            }
            tbody += `<tr class="bg-slate-900 border-b-2 border-amber-500/50 shadow-md">${totalRowHtml}</tr>`;
            
            let labels = [];
            let salesData = [];
            let lorryData = [];
            for(let d=1; d<=daysInMonth; d++) {
                labels.push(`${d}hb`);
                salesData.push(dailyTotals[d].sales);
                lorryData.push(dailyTotals[d].lorry);
            }
            
            let trendTitle = document.getElementById('trend-title-suffix');
            let logisticsTrendTitle = document.getElementById('logistics-trend-title-suffix');
            let titleText = (currentUser && (currentUser.role === 'admin' || currentUser.role === 'operation')) ? '(Total Company)' : `(Area: ${currentUser.name || currentUser.id || 'Manager'})`;
            if(trendTitle) trendTitle.innerText = titleText;
            if(logisticsTrendTitle) logisticsTrendTitle.innerText = titleText;
            
            if(window.monthlyTrendChartObj) window.monthlyTrendChartObj.destroy();
            let trendCtx = document.getElementById('chart-monthly-trend');
            if(trendCtx && typeof Chart !== 'undefined') {
                window.monthlyTrendChartObj = new Chart(trendCtx.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                type: 'bar',
                                label: 'Total Sales (RM)',
                                data: salesData,
                                backgroundColor: 'rgba(245, 158, 11, 0.8)',
                                yAxisID: 'y',
                                borderRadius: 4
                            },
                            {
                                type: 'line',
                                label: 'Logistics Cost (RM)',
                                data: lorryData,
                                borderColor: '#06b6d4',
                                backgroundColor: 'rgba(6, 182, 212, 0.1)',
                                tension: 0.3,
                                fill: true,
                                pointBackgroundColor: '#06b6d4',
                                pointRadius: 4,
                                borderWidth: 3,
                                yAxisID: 'y1'
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: true, position: 'top', labels: { color: '#cbd5e1', font: { family: 'Inter', weight: 'bold' } } },
                            tooltip: { callbacks: { label: function(context) { return context.dataset.label + ': RM ' + context.raw.toLocaleString('en-US', {minimumFractionDigits:2}); } } }
                        },
                        scales: {
                            x: { grid: { color: 'rgba(51,65,85,0.3)' }, ticks: { color: '#94a3b8' } },
                            y: {
                                type: 'linear', display: true, position: 'left',
                                title: { display: true, text: 'Sales (RM)', color: '#f59e0b', font: { weight: 'bold' } },
                                grid: { color: 'rgba(51,65,85,0.3)' },
                                ticks: { color: '#f59e0b', callback: function(value) { return 'RM ' + (value/1000).toFixed(0) + 'k'; } }
                            },
                            y1: {
                                type: 'linear', display: true, position: 'right',
                                title: { display: true, text: 'Logistics (RM)', color: '#06b6d4', font: { weight: 'bold' } },
                                grid: { drawOnChartArea: false },
                                ticks: { color: '#06b6d4', callback: function(value) { return 'RM ' + (value/1000).toFixed(0) + 'k'; } }
                            }
                        }
                    }
                });
            }
            
            let rendered = 0;
            branches.forEach(b => {
                if (rendered >= 100) return;
                rendered++;
                let rowHtml = `<td class="p-3 font-bold text-cyan-400 sticky left-0 z-20 bg-slate-950 outline outline-1 outline-slate-800">${b.code}</td>
                               <td class="p-3 font-bold text-white sticky left-[60px] z-20 bg-slate-950 outline outline-1 outline-slate-800 truncate overflow-hidden whitespace-nowrap max-w-[200px]" title="${b.name}">${b.name}<div class="text-[8px] text-cyan-500 font-semibold mt-0.5 uppercase"><i class="fa-solid fa-user-tie mr-1"></i>${b.am}</div></td>`;
                
                let bData = dataMap[b.code] || {};
                let prevSales = null;
                
                for(let d=1; d<=daysInMonth; d++) {
                    let dateKey = monthStr + '-' + (d<10?'0':'') + d;
                    let dayData = bData[dateKey];
                    let sales = dayData ? dayData.sales : 0;
                    let trans = dayData ? dayData.trans : 0;
                    
                    let salesClass = "text-slate-300";
                    
                    if (d === 1) {
                        salesClass = "bg-emerald-500/20 text-emerald-400 font-bold";
                    } else if (prevSales !== null) {
                        if (sales > prevSales) salesClass = "bg-emerald-500/20 text-emerald-400 font-bold";
                        else if (sales < prevSales) salesClass = "bg-rose-500/20 text-rose-400 font-bold";
                    }
                    
                    prevSales = sales;
                    
                    let salesDisplay = sales > 0 ? formatRM(sales) : '-';
                    let transDisplay = trans > 0 ? formatNum(trans) : '-';
                    
                    rowHtml += `<td class="p-3 border-l border-slate-800/60 text-right ${salesClass}">${salesDisplay}</td>
                                <td class="p-3 text-[10px] text-amber-500/70 text-right">${transDisplay}</td>`;
                }
                
                tbody += `<tr class="hover:bg-slate-900/50">${rowHtml}</tr>`;
            });
            
            if (branches.length > 100) {
                tbody += `<tr><td colspan="${daysInMonth * 2 + 2}" class="p-4 text-center text-amber-500 font-bold bg-amber-500/10 border-b border-amber-500/30">Showing top 100 branches only to maintain performance. Please use the filters above (Area, State, etc.) to view other branches.</td></tr>`;
            }
            
            document.getElementById('comparison-tbody').innerHTML = tbody;
        }

        function renderTrackingTable() {
            let date = document.getElementById('track-date').value;
            let term = document.getElementById('track-search').value.toLowerCase();
            let branches = getManagerFilteredBranches();
            let tbody = document.getElementById('tracking-tbody');
            let html = ""; let rendered = 0;
            
            updateSubmissionRatio();

            let subMap = {};
            for (let i = 0; i < dbSubmissions.length; i++) {
                if (dbSubmissions[i].date === date) {
                    subMap[dbSubmissions[i].code] = dbSubmissions[i];
                }
            }

            branches.forEach(b => {
                if(term && !(b.code.toString().includes(term) || b.name.toLowerCase().includes(term))) return;
                if(!term && rendered >= 1000) return; rendered++;

                let sub = subMap[b.code];
                let isNightLocked = !!(sub && sub.night_locked);
                let hasNightData = !!(sub && ((sub.sales||0)>0 || (sub.transactions||0)>0 || (sub.mykasih||0)>0 || (sub.lorry||0)>0 || isNightLocked));
                let hasBankIn = !!(sub && ((sub.bank1||0)>0 || (sub.bank2||0)>0));
                
                let tSales = hasNightData ? sub.sales||0 : 0; let tTrans = hasNightData ? sub.transactions||0 : 0;
                let tMy = hasNightData ? sub.mykasih||0 : 0; let tLor = hasNightData ? sub.lorry||0 : 0;
                let bank1 = hasBankIn ? sub.bank1||0 : 0; let bank2 = hasBankIn ? sub.bank2||0 : 0;
                let tBank = bank1 + bank2; let bal = tSales - tBank;
                
                let lorryCol = tLor === 0 && hasNightData ? `<span class="text-rose-500 font-bold">RM 0.00</span>` : `RM ${formatRM(tLor)}`;
                let bank1Col = bank1 === 0 && hasBankIn ? `<span class="text-rose-500 font-bold">RM 0.00</span>` : `RM ${formatRM(bank1)}`;
                let bank2Col = bank2 === 0 && hasBankIn ? `<span class="text-rose-500 font-bold">RM 0.00</span>` : `RM ${formatRM(bank2)}`;

                let balCol = `<span class="${bal === 0 ? 'text-emerald-500' : 'text-rose-500'} font-bold">RM ${formatRM(bal)}</span>`;
                let statusBadge = isNightLocked ? `<span class="bg-emerald-950/60 text-emerald-400 border border-emerald-900/40 px-2 py-0.5 rounded text-[9px] font-bold uppercase">Sent</span>` : (hasNightData ? `<span class="bg-cyan-950/60 text-cyan-400 border border-cyan-900/40 px-2 py-0.5 rounded text-[9px] font-bold uppercase">Keyed In</span>` : `<span class="bg-amber-950/60 text-amber-500 border border-amber-900/40 px-2 py-0.5 rounded text-[9px] font-bold uppercase">Pending</span>`);
                
                let actNight = hasNightData ? `<button onclick="resetNight('${date}', '${b.code}')" class="flex-1 bg-rose-950/80 text-rose-400 border border-rose-900/50 hover:bg-rose-900 hover:text-white px-1 py-2 rounded shadow transition-all text-[9px] font-bold text-center">RST SALES</button>` : `<div class="flex-1"></div>`;
                let actBank = hasBankIn ? `<button onclick="resetBank('${date}', '${b.code}')" class="flex-1 bg-amber-950/80 text-amber-400 border border-amber-900/50 hover:bg-amber-900 hover:text-white px-1 py-2 rounded shadow transition-all text-[9px] font-bold text-center">RST BANK</button>` : `<div class="flex-1"></div>`;
                
                let adminAct = "";
                let todayD = new Date(todayStr); let salesD = new Date(date);
                let diffDays = Math.floor((todayD - salesD) / (1000 * 60 * 60 * 24));
                
                  let needsUnlockNight = isNightLocked || (date !== todayStr && pastLock && (!sub || !sub.night_unlocked)) || (date === todayStr && masterLock && (!sub || !sub.night_unlocked));
                  let canUnlockRole = (currentUser.role === 'admin' || currentUser.role === 'am' || currentUser.role === 'operation');
                  let adminUnlockNight = (canUnlockRole && needsUnlockNight) ? `<button onclick="unlockNight('${date}', '${b.code}')" class="w-full mt-1 bg-indigo-950/80 text-indigo-400 border border-indigo-900/50 hover:bg-indigo-900 hover:text-white px-2 py-1.5 rounded shadow transition-all text-[9px] font-bold text-center tracking-wider"><i class="fa-solid fa-key mr-1 text-[8px]"></i> UNLOCK NIGHT</button>` : '';
                
                let adminUnlockBank = (canUnlockRole && diffDays > 1 && (!sub || !sub.bank2_unlocked)) ? `<button onclick="unlockBank2('${date}', '${b.code}')" class="w-full mt-1 bg-cyan-950/80 text-cyan-400 border border-cyan-900/50 hover:bg-cyan-900 hover:text-white px-2 py-1.5 rounded shadow transition-all text-[9px] font-bold text-center tracking-wider"><i class="fa-solid fa-unlock mr-1 text-[8px]"></i> UNLOCK 2ND BANK</button>` : '';
                
                adminAct = adminUnlockNight + adminUnlockBank;

                let acts = (hasNightData || hasBankIn || isNightLocked || adminAct || (date !== todayStr && !sub)) ? `<div class="flex flex-col w-[130px]"><div class="flex gap-2 w-full">${actNight}${actBank}</div>${adminAct}</div>` : `<span class="text-slate-600">-</span>`;

                html += `<tr class="hover:bg-slate-900/40 border-b border-slate-800/50 transition-colors">
                    <td class="p-3"><div class="font-bold text-slate-300 text-[11px]">${b.code}</div><div class="text-[9px] text-slate-500 truncate max-w-[150px]">${b.name}</div><div class="text-[8px] text-cyan-500 font-semibold mt-0.5 uppercase"><i class="fa-solid fa-user-tie mr-1"></i>${b.am}</div></td>
                    <td class="p-3 text-cyan-400 font-semibold">RM ${formatRM(tSales)}</td>
                    <td class="p-3 text-slate-300">${formatNum(tTrans)}</td>
                    <td class="p-3 text-slate-300">RM ${formatRM(tMy)}</td>
                    <td class="p-3 text-slate-300">${lorryCol}</td>
                    <td class="p-3 text-emerald-400">${bank1Col}</td>
                    <td class="p-3 text-emerald-400">${bank2Col}</td>
                    <td class="p-3 text-emerald-400 font-bold bg-emerald-950/10 border-r border-slate-800/50">RM ${formatRM(tBank)}</td>
                    <td class="p-3 bg-slate-950/40">${balCol}</td>
                    <td class="p-3 text-center">${statusBadge}</td>
                    <td class="p-3 p-1 align-middle pdf-exclude">${acts}</td>
                </tr>`;
            });
            tbody.innerHTML = html;
        }

        function resetNight(date, code) {
            if(confirm(`Reset Night Data for ${code}?\nThis will instruct the server to delete the row's night operations data.`)) {
                syncToCloud('reset_night', { date: date, code: String(code), amName: currentUser.name });
                let idx = dbSubmissions.findIndex(s => String(s.code) === String(code) && s.date === date);
                if(idx > -1) { 
                    dbSubmissions[idx].sales = 0; dbSubmissions[idx].transactions = 0; dbSubmissions[idx].mykasih = 0; dbSubmissions[idx].lorry = 0; dbSubmissions[idx].night_locked = false; dbSubmissions[idx].night_submit_time = ""; dbSubmissions[idx].night_unlocked = false; 
                } else {
                    dbSubmissions.push({ date: date, code: String(code), sales: 0, transactions: 0, mykasih: 0, lorry: 0, night_locked: false, night_submit_time: "", night_unlocked: false, am: currentUser.name });
                }
                renderTrackingTable();
                updateSubmissionRatio();
                calculateTotals();
            }
        }

        function resetBank(date, code) {
            if(confirm(`Reset Bank-In Data for ${code}?`)) {
                syncToCloud('reset_bank', { date: date, code: String(code), amName: currentUser.name });
                let idx = dbSubmissions.findIndex(s => String(s.code) === String(code) && s.date === date);
                if(idx > -1) { 
                    dbSubmissions[idx].bank1 = 0; dbSubmissions[idx].bank2 = 0; dbSubmissions[idx].bank_edit_time = ""; 
                } else {
                    dbSubmissions.push({ date: date, code: String(code), bank1: 0, bank2: 0, bank_edit_time: "", am: currentUser.name });
                }
                renderTrackingTable();
            }
        }

        function unlockNight(date, code) {
            Swal.fire({ title: 'Unlock Night Sales?', text: 'Allow branch to edit primary operations data for ' + date + '?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Yes, Unlock' })
            .then((result) => { 
                if (result.isConfirmed) {
                    let idx = dbSubmissions.findIndex(s => String(s.code) === String(code) && s.date === date);
                    if(idx > -1) {
                        dbSubmissions[idx].night_unlocked = true;
                        dbSubmissions[idx].night_locked = false;
                    } else {
                        dbSubmissions.push({ date: date, code: String(code), night_unlocked: true, night_locked: false });
                    }
                    syncToCloud('unlock_night', {date: date, code: String(code), amName: currentUser.name}, () => { 
                        renderTrackingTable(); 
                        updateSubmissionRatio();
                        calculateTotals();
                    });
                }
            });
        }

        function unlockBank2(date, code) {
            if(confirm(`Unlock 2nd Bank-In for Branch ${code} on ${date}?`)) {
                let idx = dbSubmissions.findIndex(s => String(s.code) === String(code) && s.date === date);
                if(idx > -1) { dbSubmissions[idx].bank2_unlocked = true; }
                else { dbSubmissions.push({date: date, code: String(code), bank2_unlocked: true}); }
                renderTrackingTable();
                syncToCloud('unlock_bank2', { date: date, code: String(code), amName: currentUser.name });
            }
        }

          function showMissingSales() {
              let mdate = currentTab === 'tracking' && document.getElementById('track-date') 
                  ? document.getElementById('track-date').value 
                  : (document.getElementById('dash-date') ? document.getElementById('dash-date').value : getYYYYMMDD(new Date()));
              let branches = getManagerFilteredBranches();
              let missing = [];
              let submittedCodes = dbSubmissions.filter(s => s.date === mdate && isSubmissionSubmitted(s)).map(s => String(s.code));
              missing = branches.filter(b => !submittedCodes.includes(String(b.code)));
              document.getElementById('missing-date-display').innerHTML = `${mdate} <span class="bg-rose-600 text-white px-2 py-0.5 rounded text-xs ml-1">${missing.length} Cawangan Missing</span>`;
              let html = '';
              if(missing.length === 0) {
                  html = '<p class="text-sm text-emerald-400 font-bold p-4 text-center bg-emerald-500/10 rounded-lg border border-emerald-500/20"><i class="fa-solid fa-check-circle mr-2"></i>All branches have submitted!</p>';
              } else {
                  html = missing.map((b,i) => `
                      <div class="flex items-center justify-between p-3 bg-slate-950/80 border border-slate-800 rounded-lg mb-2">
                          <div class="flex items-center gap-3">
                              <span class="text-xs font-black text-slate-500 bg-slate-900 px-2 py-1 rounded border border-slate-700">${i+1}</span>
                              <div>
                                  <p class="text-sm font-bold text-rose-400">${b.name} <span class="text-[10px] text-slate-500 ml-1 tracking-widest">${b.code}</span></p>
                                  <p class="text-[10px] text-cyan-500 mt-0.5 uppercase"><i class="fa-solid fa-user-tie mr-1"></i>AM: ${b.am || 'N/A'} <span class="text-slate-500 mx-2">|</span> <i class="fa-solid fa-warehouse mr-1"></i>WH: ${b.warehouse || 'N/A'}</p>
                              </div>
                          </div>
                      </div>
                  `).join('');
              }
              document.getElementById('missing-sales-list').innerHTML = html;
              document.getElementById('missing-sales-modal').classList.remove('hidden');
              document.getElementById('missing-sales-modal').classList.add('flex');
          }
          
          function exportComparisonCSV() {
              let table = document.getElementById('main-comparison-table');
              if(!table) return;
              let rows = Array.from(table.querySelectorAll('tr'));
              let csv = rows.map(row => {
                  let cells = Array.from(row.querySelectorAll('th, td'));
                  return cells.map(cell => '"' + cell.innerText.replace(/"/g, '""') + '"').join(',');
              }).join('\n');
              let blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
              let link = document.createElement("a");
              let url = URL.createObjectURL(blob);
              link.setAttribute("href", url);
              link.setAttribute("download", `Daily_Comparison_${document.getElementById('compare-month').value}.csv`);
              link.style.visibility = 'hidden';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
          }
          
          function exportComparisonPDF() {
              let area = document.getElementById('comparison-table-area');
              let sl = area.scrollLeft;
              let opt = {
                margin:       0.2,
                filename:     `Daily_Comparison_${document.getElementById('compare-month').value}.pdf`,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2, useCORS: true },
                jsPDF:        { unit: 'in', format: 'a3', orientation: 'landscape' }
              };
              area.classList.remove('max-h-[600px]', 'overflow-x-auto');
              showToast('info', 'Generating PDF... Please wait.');
              setTimeout(() => {
                  html2pdf().set(opt).from(area).save().then(()=>{
                      area.classList.add('max-h-[600px]', 'overflow-x-auto');
                      area.scrollLeft = sl;
                  });
              }, 500);
          }

        function confirmMasterReset() {
            let date = document.getElementById('track-date').value;
            Swal.fire({
                title: 'MASTER RESET WARNING',
                html: `<p class="mb-4">This will WIPE all night data for <b>${date}</b> globally.<br>Enter Admin Password to proceed:</p>
                       <input type="password" id="swal-input-pwd" class="swal2-input bg-slate-900 border-slate-700 text-white" placeholder="Password">`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#334155',
                confirmButtonText: 'CONFIRM MASTER RESET',
                preConfirm: () => {
                    const pwd = Swal.getPopup().querySelector('#swal-input-pwd').value;
                    if (!pwd) Swal.showValidationMessage('Password is required');
                    return pwd;
                }
            }).then(async (result) => {
                if (result.isConfirmed) {
                    let hashedPwd = await hashPassword(result.value);
                    if (hashedPwd === PASSWORDS['admin']) {
                        syncToCloud('master_reset', { date: date, amName: currentUser.name });
                        dbSubmissions.forEach(s => { if(s.date === date) { s.sales = 0; s.transactions = 0; s.mykasih = 0; s.lorry = 0; s.bank1 = 0; s.bank2 = 0; s.night_locked = false; s.night_submit_time = ""; s.bank1_time = ""; s.bank2_time = ""; s.bank2_unlocked = true; } });
                        renderTrackingTable();
                        showToast('success', 'Master Reset Executed!');
                    } else {
                        Swal.fire('Error', 'Incorrect Admin Password. Reset Aborted.', 'error');
                    }
                }
            });
        }

        async function exportData(type) {
            let mode = document.getElementById('dash-mode') ? document.getElementById('dash-mode').value : 'daily';
            let date = mode === 'daily' ? document.getElementById('dash-date').value : document.getElementById('dash-month').value;
            let branches = getManagerFilteredBranches();
            
            // Group data by branch (supports both daily and monthly)
            let grouped = {};
            deduplicateSubmissionsList(dbSubmissions.filter(s => mode==='daily' ? s.date === date : s.date.startsWith(date))).forEach(s => {
                if(!grouped[s.code]) {
                    grouped[s.code] = { sales:0, trans:0, mykasih:0, lorry:0, bank1:0, bank2:0, night_submit_time: "", bank1_time: "", bank2_time: "" };
                }
                grouped[s.code].sales += Number(s.sales||0); 
                grouped[s.code].trans += Number(s.transactions||0);
                grouped[s.code].mykasih += Number(s.mykasih||0); 
                grouped[s.code].lorry += Number(s.lorry||0);
                grouped[s.code].bank1 += Number(s.bank1||0); 
                grouped[s.code].bank2 += Number(s.bank2||0);
                if(s.night_submit_time) grouped[s.code].night_submit_time = s.night_submit_time;
                if(s.bank1_time) grouped[s.code].bank1_time = s.bank1_time;
                if(s.bank2_time) grouped[s.code].bank2_time = s.bank2_time;
            });

            if (type === 'excel') {
                if (typeof XLSX === 'undefined') {
                    alert("Sistem sedang memuat turun modul Excel kerana liputan internet lemah.\nSila tunggu sebentar dan tekan butang EXCEL sekali lagi.");
                    let s = document.createElement('script');
                    s.src = "https://unpkg.com/xlsx/dist/xlsx.full.min.js";
                    document.head.appendChild(s);
                    return;
                }

                if (mode === 'monthly') {
                    showToast('info', 'Generating Monthly & Daily Report (1-31)... Please wait.');
                    try {
                        let [y, m] = date.split('-').map(Number);
                        let daysInMonth = new Date(y, m, 0).getDate();
                        let startD = `${date}-01`;
                        let endD = `${date}-${String(daysInMonth).padStart(2, '0')}`;

                        let dailyMap = {}; // dailyMap[code][day] = {sales, mykasih, lorry}
                        try {
                            let snap = await Promise.race([
                                db.collection("submissions").where("date", ">=", startD).where("date", "<=", endD).get(),
                                new Promise(r => setTimeout(() => r(null), 3500))
                            ]);
                            if (snap && snap.forEach) {
                                snap.forEach(doc => {
                                    let d = doc.data();
                                    if (d && d.code && d.date) {
                                        let dayNum = parseInt(d.date.split('-')[2], 10);
                                        if (!dailyMap[d.code]) dailyMap[d.code] = {};
                                        dailyMap[d.code][dayNum] = {
                                            sales: Number(d.sales || 0),
                                            mykasih: Number(d.mykasih || 0),
                                            lorry: Number(d.lorry || 0)
                                        };
                                    }
                                });
                            }
                        } catch (e) {
                            console.warn("Monthly daily export Firestore query warning:", e);
                        }

                        // Also merge any loaded dbSubmissions for current month
                        if (Array.isArray(dbSubmissions)) {
                            deduplicateSubmissionsList(dbSubmissions.filter(s => s && s.date && String(s.date).startsWith(date))).forEach(d => {
                                let parts = String(d.date).split('-');
                                if (parts.length === 3) {
                                    let dayNum = parseInt(parts[2], 10);
                                    if (!dailyMap[d.code]) dailyMap[d.code] = {};
                                    if (!dailyMap[d.code][dayNum]) {
                                        dailyMap[d.code][dayNum] = {
                                            sales: Number(d.sales || 0),
                                            mykasih: Number(d.mykasih || 0),
                                            lorry: Number(d.lorry || 0)
                                        };
                                    }
                                }
                            });
                        }

                        branches.sort((a,b) => Number(a.code||0) - Number(b.code||0));

                        // 1. Summary Sheet
                        let summaryArr = branches.map(b => {
                            let s = grouped[b.code] || { sales:0, trans:0, mykasih:0, lorry:0, bank1:0, bank2:0 };
                            return {
                                Month: date, Code: b.code, Branch: b.name, AM: b.am,
                                "Total Sales": s.sales, "Total Trans": s.trans, "Total MyKasih": s.mykasih,
                                "Total WH (Lorry)": s.lorry, "Total 1st Bank-In": s.bank1, "Total 2nd Bank-In": s.bank2,
                                "Balance": s.sales - (s.bank1 + s.bank2)
                            };
                        });

                        // Helper to build daily matrix sheets
                        let buildDailyMatrix = (fieldLabel) => {
                            return branches.map(b => {
                                let row = { Code: b.code, Branch: b.name, AM: b.am };
                                let totalVal = 0;
                                for (let dNum = 1; dNum <= daysInMonth; dNum++) {
                                    let dayKey = String(dNum).padStart(2, '0');
                                    let val = (dailyMap[b.code] && dailyMap[b.code][dNum]) ? (dailyMap[b.code][dNum][fieldLabel] || 0) : 0;
                                    row[dayKey] = val;
                                    totalVal += val;
                                }
                                row["TOTAL BULANAN"] = totalVal;
                                return row;
                            });
                        };

                        let salesArr = buildDailyMatrix("sales");
                        let mykasihArr = buildDailyMatrix("mykasih");
                        let lorryArr = buildDailyMatrix("lorry");

                        let dailyHeaderOrder = ['Code', 'Branch', 'AM'];
                        for (let dNum = 1; dNum <= daysInMonth; dNum++) {
                            dailyHeaderOrder.push(String(dNum).padStart(2, '0'));
                        }
                        dailyHeaderOrder.push('TOTAL BULANAN');

                        let summaryHeaderOrder = ["Month", "Code", "Branch", "AM", "Total Sales", "Total Trans", "Total MyKasih", "Total WH (Lorry)", "Total 1st Bank-In", "Total 2nd Bank-In", "Balance"];

                        let wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryArr, { header: summaryHeaderOrder }), "Summary Bulanan");
                        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesArr, { header: dailyHeaderOrder }), "Daily Sales");
                        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mykasihArr, { header: dailyHeaderOrder }), "Daily MyKasih");
                        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lorryArr, { header: dailyHeaderOrder }), "Daily WH Lorry");

                        XLSX.writeFile(wb, `Report_Monthly_${date}.xlsx`);
                        showToast('success', 'Monthly + Daily Report (4 Sheets) downloaded successfully!');
                    } catch (errExcel) {
                        console.error("Excel generation failed:", errExcel);
                        showToast('error', 'Gagal memuat turun Excel: ' + (errExcel.message || errExcel));
                    }
                    return;
                }

                showToast('info', `Generating EXCEL...`);
                let exportArr = branches.map(b => {
                    let s = grouped[b.code] || { sales:0, trans:0, mykasih:0, lorry:0, bank1:0, bank2:0, night_submit_time:"", bank1_time:"", bank2_time:"" };
                    let cleanTime = (t) => t ? (String(t).startsWith("'") ? String(t).substring(1) : String(t)) : "-";
                    return { 
                        Date: date, Code: b.code, Branch: b.name, AM: b.am, 
                        Sales: s.sales, Trans: s.trans, MyKasih: s.mykasih, Lorry: s.lorry, 
                        Bank1: s.bank1, Bank2: s.bank2, Balance: s.sales-(s.bank1+s.bank2),
                        "Submission Time": cleanTime(s.night_submit_time),
                        "1st Bank-In Time": cleanTime(s.bank1_time),
                        "2nd Bank-In Time": cleanTime(s.bank2_time)
                    };
                });
                let wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exportArr), "Report"); XLSX.writeFile(wb, `Report_${date}.xlsx`);
              } else if (type === 'pdf') {
                  if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined' || !window.jspdf?.jsPDF?.API?.autoTable) {
                      showToast('info', 'Downloading Vector PDF Engine... Please wait 2 seconds.');
                      let s1 = document.createElement('script');
                      s1.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
                      document.head.appendChild(s1);
                      s1.onload = () => {
                          let s2 = document.createElement('script');
                          s2.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js";
                          document.head.appendChild(s2);
                          s2.onload = () => exportData('pdf');
                      };
                      return;
                  }
                  showToast('info', `Generating Crisp PDF Report...`);
                  const { jsPDF } = window.jspdf;
                  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
                  doc.setFontSize(14);
                  doc.setTextColor(15, 23, 42);
                  doc.text(`Operations Report (${mode === 'daily' ? 'Daily' : 'Monthly'}: ${date})`, 14, 15);
                  
                  let bodyData = branches.map(b => {
                      let s = grouped[b.code] || { sales:0, trans:0, mykasih:0, lorry:0, bank1:0, bank2:0, night_submit_time:"" };
                      let totBank = (s.bank1||0) + (s.bank2||0);
                      let bal = (s.sales||0) - totBank;
                      let cleanTime = (t) => t ? (String(t).startsWith("'") ? String(t).substring(1) : String(t)) : "-";
                      return [
                          b.code, b.name, b.am||"-",
                          "RM " + (s.sales||0).toLocaleString('en-US',{minimumFractionDigits:2}),
                          (s.trans||0).toLocaleString(),
                          "RM " + (s.mykasih||0).toLocaleString('en-US',{minimumFractionDigits:2}),
                          "RM " + (s.lorry||0).toLocaleString('en-US',{minimumFractionDigits:2}),
                          "RM " + totBank.toLocaleString('en-US',{minimumFractionDigits:2}),
                          "RM " + bal.toLocaleString('en-US',{minimumFractionDigits:2}),
                          cleanTime(s.night_submit_time)
                      ];
                  });

                  doc.autoTable({
                      startY: 22,
                      head: [['Code', 'Branch', 'AM', 'Sales', 'Trans', 'MyKasih', 'Lorry', 'Bank-In', 'Balance', 'Submission Time']],
                      body: bodyData,
                      styles: { fontSize: 8, cellPadding: 2.5, textColor: [51, 65, 85] },
                      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
                      alternateRowStyles: { fillColor: [248, 250, 252] },
                      margin: { left: 14, right: 14 }
                  });
                  doc.save(`Report_${date}.pdf`);
                }
        }

        function getWeeksForMonth(year, month) {
            let weeks = [];
            let lastDay = new Date(year, month, 0).getDate();
            let fmt = (d) => `${d.getDate()}/${d.getMonth()+1}`;
            
            let intervals = [
                { s: 1, e: 5 },
                { s: 6, e: 12 },
                { s: 13, e: 19 },
                { s: 20, e: 26 },
                { s: 27, e: lastDay }
            ];
            
            intervals.forEach(i => {
                let start = new Date(year, month - 1, i.s);
                let end = new Date(year, month - 1, i.e);
                weeks.push({
                    start: start,
                    end: end,
                    label: `${fmt(start)} - ${fmt(end)}`
                });
            });
            return weeks;
        }

        window._monthlySummaryCache = window._monthlySummaryCache || {};
        async function queryMonthlySummariesData(startDate, endDate, amFilter = "", forceRefresh = false) {
            let normDate = (str) => {
                if (!str) return str;
                let parts = str.split('-');
                if (parts.length === 3) return `${parts[0]}-${String(parts[1]).padStart(2,'0')}-${String(parts[2]).padStart(2,'0')}`;
                return str;
            };
            startDate = normDate(startDate);
            endDate = normDate(endDate);
            let sDate = new Date(startDate);
            let eDate = new Date(endDate);
            let monthsToFetch = new Set();
            let curr = new Date(sDate);
            while (curr <= eDate) {
                let y = curr.getFullYear();
                let m = String(curr.getMonth() + 1).padStart(2, '0');
                monthsToFetch.add(`${y}-${m}`);
                curr.setDate(curr.getDate() + 1);
            }
            
            let allDocs = [];
            let missingMonths = [];
            
            for (let mStr of monthsToFetch) {
                if (!forceRefresh && window._monthlySummaryCache[mStr] && (Date.now() - window._monthlySummaryCache[mStr].ts < 300000)) {
                    allDocs.push(...window._monthlySummaryCache[mStr].docs);
                } else {
                    missingMonths.push(mStr);
                }
            }
            
            if (missingMonths.length > 0) {
                let promises = missingMonths.map(mStr => {
                    return db.collection("monthly_summaries")
                        .where(firebase.firestore.FieldPath.documentId(), ">=", mStr + "_")
                        .where(firebase.firestore.FieldPath.documentId(), "<=", mStr + "_\uf8ff")
                        .get()
                        .then(snap => {
                            if (snap && snap.docs && snap.docs.length > 0) {
                                return { mStr, docs: snap.docs.map(doc => ({ id: doc.id, data: doc.data() })) };
                            }
                            return db.collection("monthly_summaries")
                                .where("id", ">=", mStr + "_")
                                .where("id", "<=", mStr + "_z")
                                .get()
                                .then(s2 => ({ mStr, docs: (s2 && s2.docs) ? s2.docs.map(doc => ({ id: doc.id, data: doc.data() })) : [] }));
                        })
                        .catch(err => {
                            console.error("Error loading monthly summaries for " + mStr, err);
                            return { mStr, docs: [] };
                        });
                });
                let fetched = await Promise.all(promises);
                fetched.forEach(item => {
                    if (item.docs && item.docs.length > 0) {
                        window._monthlySummaryCache[item.mStr] = { ts: Date.now(), docs: item.docs };
                    }
                    allDocs.push(...item.docs);
                });
            }
            
            let results = [];
            let filterAm = amFilter ? amFilter.trim().toUpperCase() : (currentUser && currentUser.role === 'am' ? String(currentUser.name).trim().toUpperCase() : "");
            let amBranchCodes = null;
            if (filterAm) {
                amBranchCodes = new Set();
                masterBranches.filter(b => (b.am || "").trim().toUpperCase() === filterAm).forEach(b => {
                    let cStr = String(b.code).trim();
                    amBranchCodes.add(cStr);
                    if (!isNaN(Number(cStr))) amBranchCodes.add(String(Number(cStr)));
                    if (/^\d+$/.test(cStr)) amBranchCodes.add(cStr.padStart(4, '0'));
                });
            }
            
            allDocs.forEach(docObj => {
                let d = docObj.data;
                let docMonth = docObj.id.split('_')[0];
                if (d.branches) {
                    for (let code in d.branches) {
                        let bData = d.branches[code];
                        let cTrim = String(code).trim();
                        let cNum = !isNaN(Number(cTrim)) ? Number(cTrim) : null;
                        let cPad = /^\d+$/.test(cTrim) ? cTrim.padStart(4, '0') : cTrim;
                        let mb = masterBranches && masterBranches.find(x => String(x.code).trim() === cTrim || (cNum !== null && Number(x.code) === cNum) || String(x.code).trim() === cPad);
                        let canonicalAM = mb && mb.am ? String(mb.am).trim().toUpperCase() : String(bData.am || d.am || docObj.id.split('_')[1] || "").trim().toUpperCase();
                        let canonicalName = mb && mb.name ? mb.name : (bData.name || cTrim);

                        if (filterAm) {
                            let isMatch = (canonicalAM === filterAm) || canonicalAM.includes(filterAm) || (amBranchCodes && (amBranchCodes.has(cTrim) || (cNum !== null && amBranchCodes.has(String(cNum))) || amBranchCodes.has(cPad)));
                            if (!isMatch) continue;
                        }
                        if (bData.daily) {
                            for (let day in bData.daily) {
                                let daily = bData.daily[day];
                                let fullDate = String(day).includes('-') ? String(day) : (d.month || docMonth) + "-" + String(day).padStart(2, '0');
                                if (fullDate >= startDate && fullDate <= endDate) {
                                    let sVal = parseFloat(daily.s) || 0;
                                    let lVal = parseFloat(daily.l) || 0;
                                    let mVal = parseFloat(daily.m) || 0;
                                    let tVal = parseInt(daily.t) || 0;
                                    let b1Val = parseFloat(daily.b1) || 0;
                                    let b2Val = parseFloat(daily.b2) || 0;
                                    let isSubmitted = (sVal > 0 || lVal > 0 || mVal > 0 || tVal > 0 || b1Val > 0 || b2Val > 0);
                                    results.push({
                                        code: cTrim,
                                        date: fullDate,
                                        name: canonicalName,
                                        sales: sVal,
                                        lorry: lVal,
                                        mykasih: mVal,
                                        transactions: tVal,
                                        bank1: b1Val,
                                        bank2: b2Val,
                                        night_locked: isSubmitted,
                                        am: canonicalAM
                                    });
                                }
                            }
                        }
                    }
                }
            });
            return deduplicateSubmissionsList(results);
        }

        async function fetchRangeFromSummaries(startDate, endDate) {
            try {
                let amFilterVal = currentUser && currentUser.role === 'am' ? currentUser.name : "";
                let sumRes = [];
                try {
                    sumRes = await queryMonthlySummariesData(startDate, endDate, amFilterVal);
                } catch(e) {}
                let subRes = [];
                let d1 = new Date(startDate);
                let d2 = new Date(endDate);
                let diffDays = (d2 - d1) / (1000 * 3600 * 24);
                let todayStr = new Date().toLocaleDateString('en-CA', {timeZone: 'Asia/Kuala_Lumpur'}).substring(0, 10);
                
                let sumDataLoaded = Array.isArray(sumRes) && sumRes.length > 0;
                let fetchStart = startDate;
                let fetchEnd = endDate;
                
                if (sumDataLoaded) {
                    if (todayStr >= startDate && todayStr <= endDate) {
                        fetchStart = todayStr;
                        fetchEnd = todayStr;
                    } else {
                        fetchStart = null;
                    }
                }

                if (fetchStart && fetchEnd) {
                    if (diffDays > 10 && fetchStart !== fetchEnd && (!currentUser || currentUser.role !== 'branch')) {
                        let intervals = [
                            [fetchStart.substring(0, 8) + "01", fetchStart.substring(0, 8) + "08"],
                            [fetchStart.substring(0, 8) + "09", fetchStart.substring(0, 8) + "16"],
                            [fetchStart.substring(0, 8) + "17", fetchStart.substring(0, 8) + "24"],
                            [fetchStart.substring(0, 8) + "25", fetchEnd]
                        ];
                        let queries = intervals.map(r => db.collection("submissions").where("date", ">=", r[0]).where("date", "<=", r[1]).get());
                        let snaps = await Promise.all(queries);
                        snaps.forEach(snap => {
                            snap.forEach(d => { let val = d.data(); if (val) subRes.push(val); });
                        });
                    } else {
                        let query = db.collection("submissions").where("date", ">=", fetchStart).where("date", "<=", fetchEnd);
                        let snap = await query.get();
                        snap.forEach(d => { let val = d.data(); if (val) subRes.push(val); });
                    }
                }
                
                let combinedList = deduplicateSubmissionsList([...(Array.isArray(sumRes) ? sumRes : []), ...subRes]);
                let resultList = combinedList;
                if (amFilterVal && (!currentUser || currentUser.role === 'am')) {
                    let targetAM = String(amFilterVal).trim().toUpperCase();
                    let branches = typeof getManagerFilteredBranches === 'function' ? getManagerFilteredBranches() : (typeof masterBranches !== 'undefined' ? masterBranches.filter(b => (b.am || '').trim().toUpperCase() === targetAM || (b.am || '').trim().toUpperCase().includes(targetAM)) : []);
                    let allowedCodes = new Set(branches.map(b => String(b.code).trim()));
                    if (allowedCodes.size > 0) {
                        resultList = resultList.filter(d => {
                            if (!d || !d.code) return false;
                            let cTrim = String(d.code).trim();
                            let cNum = !isNaN(Number(cTrim)) ? Number(cTrim) : null;
                            let cPad = /^\d+$/.test(cTrim) ? cTrim.padStart(4, '0') : cTrim;
                            return allowedCodes.has(cTrim) || (cNum !== null && allowedCodes.has(String(cNum))) || allowedCodes.has(cPad);
                        });
                    }
                }
                return resultList;
            } catch(e) {
                console.error("Error in fetchRangeFromSummaries:", e);
                return [];
            }
        }

        function renderLorryTracker() {
            let monthVal = document.getElementById('lorry-month').value;
            if(!monthVal) {
                let now = new Date();
                let m = now.getMonth()+1;
                document.getElementById('lorry-month').value = `${now.getFullYear()}-${m<10?'0'+m:m}`;
                monthVal = document.getElementById('lorry-month').value;
            }
            
            let [year, month] = monthVal.split('-').map(Number);
            let weeks = getWeeksForMonth(year, month);
            
            let formatFB = (d) => {
                let m = d.getMonth()+1; let day = d.getDate();
                return `${d.getFullYear()}-${m<10?'0'+m:m}-${day<10?'0'+day:day}`;
            };
            
            let fetchStart = formatFB(weeks[0].start);
            let fetchEnd = formatFB(weeks[weeks.length-1].end);
            
            window.fetchedRangeQueries = window.fetchedRangeQueries || {};
            let userKey = currentUser ? (currentUser.role + "_" + (currentUser.name || currentUser.id || "")) : 'anon';
            let cacheKey = 'lorry_' + fetchStart + '_' + fetchEnd + '_' + userKey;
            if (window.fetchedRangeQueries[cacheKey]) {
                buildLorryTable(weeks, window.fetchedRangeQueries[cacheKey]);
                return;
            }
            
            setSyncing(true);
            fetchRangeFromSummaries(fetchStart, fetchEnd).then(subData => {
                window.fetchedRangeQueries[cacheKey] = subData;
                buildLorryTable(weeks, subData);
                setSyncing(false);
            }).catch(e => {
                console.error(e);
                Swal.fire('Error', 'Failed to download lorry records.', 'error');
                setSyncing(false);
            });
        }

        function buildLorryTable(weeks, subData) {
            let branches = getManagerFilteredBranches();
            let allowedCodes = new Set(branches.map(b => String(b.code)));
            let grouped = {};
            branches.forEach(b => {
                grouped[b.code] = {
                    code: b.code, name: b.name, am: b.am,
                    totalSales: 0, totalLorry: 0, weeksCount: weeks.map(() => 0)
                };
            });
            
            subData.forEach(s => {
                if(!s || !s.code) return;
                if(!allowedCodes.has(String(s.code))) return;
                if(!grouped[s.code]) {
                    grouped[s.code] = {
                        code: s.code, name: s.name || s.code, am: s.am || 'Unknown',
                        totalSales: 0, totalLorry: 0, weeksCount: weeks.map(() => 0)
                    };
                }
                let sNum = parseFloat(s.sales)||0;
                let lNum = parseFloat(s.lorry)||0;
                if(sNum > 0) grouped[s.code].totalSales += sNum;
                if(lNum > 0) {
                    grouped[s.code].totalLorry += lNum;
                    let [sy, sm, sd] = s.date.split('-').map(Number);
                    let dObj = new Date(sy, sm-1, sd, 12, 0, 0, 0);
                    for(let i=0; i<weeks.length; i++) {
                        let wStart = new Date(weeks[i].start); wStart.setHours(0,0,0,0);
                        let wEnd = new Date(weeks[i].end); wEnd.setHours(23,59,59,999);
                        if(dObj >= wStart && dObj <= wEnd) {
                            grouped[s.code].weeksCount[i]++;
                            break;
                        }
                    }
                }
            });
            
            let thead = document.getElementById('lorry-table-header');
            let baseHeaders = `
                <th class="py-3 px-4 sticky left-0 bg-slate-800 z-10 border-r border-slate-700">Code</th>
                <th class="py-3 px-4">Outlet</th>
                <th class="py-3 px-4">Area Manager</th>
                <th class="py-3 px-4 text-right">Jumlah Sales</th>
                <th class="py-3 px-4 text-right">Jumlah Lorry Trip</th>
                <th class="py-3 px-4 text-right border-r border-slate-700">Short</th>
            `;
            let weekHeaders = weeks.map(w => `<th class="py-3 px-4 text-center">${w.label}</th>`).join('');
            thead.innerHTML = baseHeaders + weekHeaders;
            
            let tbody = document.getElementById('lorry-table-body');
            let sorted = Object.values(grouped).filter(r => r.totalSales > 0 || r.weeksCount.some(c=>c>0)).sort((a,b) => {
                let amCmp = (a.am||'').localeCompare(b.am||'');
                if (amCmp !== 0) return amCmp;
                let bTrips = b.weeksCount.reduce((s,c)=>s+c,0);
                let aTrips = a.weeksCount.reduce((s,c)=>s+c,0);
                if (bTrips !== aTrips) return bTrips - aTrips;
                return b.totalLorry - a.totalLorry;
            });
            
            let html = '';
            sorted.forEach(r => {
                let short = r.totalSales - r.totalLorry;
                let shortVal = short > 0 ? short : 0;
                let weekTds = r.weeksCount.map(c => `<td class="py-3 px-4 text-center font-bold ${c > 0 ? 'text-cyan-400' : 'text-slate-600'}">${c}</td>`).join('');
                
                html += `
                <tr class="hover:bg-slate-800/50 transition-colors">
                    <td class="py-3 px-4 sticky left-0 bg-slate-900 border-r border-slate-800 font-mono text-cyan-400">${r.code}</td>
                    <td class="py-3 px-4 font-bold text-white">${r.name}</td>
                    <td class="py-3 px-4 text-slate-300 text-xs">${r.am}</td>
                    <td class="py-3 px-4 text-right text-emerald-400">RM ${formatRM(r.totalSales)}</td>
                    <td class="py-3 px-4 text-right text-amber-400">RM ${formatRM(r.totalLorry)}</td>
                    <td class="py-3 px-4 text-right border-r border-slate-800 ${shortVal > 0 ? 'text-rose-400 font-bold' : 'text-slate-500'}">${shortVal > 0 ? 'RM '+formatRM(shortVal) : '-'}</td>
                    ${weekTds}
                </tr>`;
            });
            
            if(sorted.length === 0) html = '<tr><td colspan="15" class="py-8 text-center text-slate-500">No data found</td></tr>';
            tbody.innerHTML = html;
            
            window.currentLorryData = sorted;
            window.currentLorryWeeks = weeks;
        }

        function exportLorryExcel() {
            if(!window.currentLorryData || window.currentLorryData.length === 0) return Swal.fire('Info', 'No lorry data to export', 'info');
            if (typeof XLSX === 'undefined') {
                alert("Modul Excel gagal dimuat turun kerana liputan lemah.\nSistem sedang cuba lagi. Tekan EXCEL semula selepas 3 saat.");
                let s = document.createElement('script');
                s.src = "https://unpkg.com/xlsx/dist/xlsx.full.min.js";
                document.head.appendChild(s);
                return;
            }
            showToast('info', 'Generating Excel...');
            let wb = XLSX.utils.book_new();
            let data = [];
            
            let header = ["Code", "Outlet", "Area Manager", "Jumlah Sales", "Jumlah Lorry Trip", "Short"];
            window.currentLorryWeeks.forEach(w => header.push(w.label));
            data.push(header);
            
            window.currentLorryData.forEach(r => {
                let row = [
                    r.code, r.name, r.am,
                    r.totalSales, r.totalLorry,
                    (r.totalSales - r.totalLorry > 0 ? r.totalSales - r.totalLorry : 0)
                ];
                r.weeksCount.forEach(c => row.push(c));
                data.push(row);
            });
            
            let ws = XLSX.utils.aoa_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, "Lorry Trip");
            
            let monthLabel = document.getElementById('lorry-month').value || "Monthly";
            XLSX.writeFile(wb, `Lorry_Trip_${monthLabel}.xlsx`);
        }

        async function runDropAnalysis() {
            let startDate = document.getElementById('drop-start').value;
            let endDate = document.getElementById('drop-end').value;
            let targetDrops = parseInt(document.getElementById('drop-days').value);
            
            if (!startDate || !endDate) {
                showToast('error', 'Please select both start and end dates.');
                return;
            }
            let sD = new Date(startDate);
            let eD = new Date(endDate);
            if (sD > eD) {
                showToast('error', 'Start Date cannot be later than End Date.');
                return;
            }
            if ((eD - sD) / (1000 * 60 * 60 * 24) > 14) {
                showToast('error', 'Date range cannot exceed 14 days to save database quota.');
                return;
            }

            document.getElementById('drop-results-body').innerHTML = '';
            document.getElementById('drop-loading').classList.remove('hidden');
            document.getElementById('drop-loading').classList.add('flex');

            try {
                let branches = getManagerFilteredBranches();
                let bCodes = branches.map(b => String(b.code));
                
                window.fetchedRangeQueries = window.fetchedRangeQueries || {};
                let cacheKey = 'drop_' + startDate + '_' + endDate;
                let snapData = window.fetchedRangeQueries[cacheKey];
                
                if (!snapData) {
                    snapData = await fetchRangeFromSummaries(startDate, endDate);
                    window.fetchedRangeQueries[cacheKey] = snapData;
                }
                
                let data = [];
                snapData.forEach(d => {
                    if (d.night_locked && bCodes.includes(String(d.code))) {
                        data.push(d);
                    }
                });

                // Group by branch
                let grouped = {};
                data.forEach(s => {
                    let c = String(s.code);
                    if (!grouped[c]) grouped[c] = [];
                    grouped[c].push({ date: s.date, sales: s.sales || 0 });
                });

                let results = [];
                
                for (let code in grouped) {
                    let arr = grouped[code].sort((a, b) => a.date.localeCompare(b.date));
                    
                    let maxDropStreak = 0;
                    let currentStreak = 0;
                    let streakPath = [];
                    let bestStreakPath = [];

                    for (let i = 1; i < arr.length; i++) {
                        let prev = arr[i-1];
                        let curr = arr[i];
                        
                        let d1 = new Date(prev.date);
                        let d2 = new Date(curr.date);
                        let diffTime = Math.abs(d2 - d1);
                        let diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        
                        if (diffDays === 1 && curr.sales < prev.sales) {
                            if (currentStreak === 0) {
                                streakPath = [prev, curr];
                                currentStreak = 1;
                            } else {
                                streakPath.push(curr);
                                currentStreak++;
                            }
                            if (currentStreak >= maxDropStreak) {
                                maxDropStreak = currentStreak;
                                bestStreakPath = [...streakPath];
                            }
                        } else {
                            currentStreak = 0;
                        }
                    }

                    if (maxDropStreak >= targetDrops) {
                        let b = branches.find(x => String(x.code) === code) || {name: 'Unknown', am: 'Unknown'};
                        results.push({ code: code, name: b.name, am: b.am, path: bestStreakPath, dropCount: maxDropStreak });
                    }
                }

                results.sort((a, b) => b.dropCount - a.dropCount);

                let tbody = document.getElementById('drop-results-body');
                let btnExcel = document.getElementById('btn-drop-excel');
                if (results.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-emerald-500 text-sm font-bold"><i class="fa-solid fa-check-circle mr-2"></i>No branches found with ${targetDrops} consecutive drops!</td></tr>`;
                    if(btnExcel) btnExcel.classList.add('hidden');
                    window.currentDropResults = null;
                } else {
                    window.currentDropResults = results;
                    if(btnExcel) btnExcel.classList.remove('hidden');
                    let html = '';
                    results.forEach((r, idx) => {
                        let pathHtml = r.path.map(p => `<span class="inline-block bg-slate-950 px-2 py-1 rounded text-[10px] mx-0.5 border border-slate-700">${p.date.slice(5)}: <span class="text-rose-400 font-bold">RM${formatRM(p.sales)}</span></span>`).join(' <i class="fa-solid fa-caret-right text-slate-600 text-xs"></i> ');
                        html += `<tr class="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                            <td class="p-3 text-xs font-mono text-slate-500">${idx+1}</td>
                            <td class="p-3 text-xs font-mono text-slate-400 tracking-wider">${r.code}</td>
                            <td class="p-3 text-xs font-bold text-slate-300">${r.name}</td>
                            <td class="p-3 text-[10px] font-semibold text-cyan-500 uppercase">${r.am}</td>
                            <td class="p-3 text-right whitespace-nowrap">${pathHtml}</td>
                        </tr>`;
                    });
                    tbody.innerHTML = html;
                }

            } catch(e) {
                console.error(e);
                showToast('error', 'Error fetching analysis data.');
                document.getElementById('drop-results-body').innerHTML = `<tr><td colspan="5" class="p-6 text-center text-rose-500 text-sm font-bold">Failed to load data.</td></tr>`;
            } finally {
                document.getElementById('drop-loading').classList.add('hidden');
                document.getElementById('drop-loading').classList.remove('flex');
            }
        }

        function exportDropAnalysisExcel() {
            if(!window.currentDropResults || window.currentDropResults.length === 0) return showToast('warning', 'No data to export');
            if (typeof XLSX === 'undefined') {
                alert("Modul Excel gagal dimuat turun kerana liputan lemah.\nSistem sedang cuba lagi. Tekan butang EXCEL semula selepas 3 saat.");
                let s = document.createElement('script');
                s.src = "https://unpkg.com/xlsx/dist/xlsx.full.min.js";
                document.head.appendChild(s);
                return;
            }
            showToast('info', 'Generating EXCEL for Drop Analysis...');
            
            let allDates = new Set();
            window.currentDropResults.forEach(r => {
                r.path.forEach(p => allDates.add(p.date));
            });
            let sortedDates = Array.from(allDates).sort();
            
            let formatDateStr = (dStr) => {
                let parts = dStr.split('-');
                if(parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
                return dStr;
            };

            let exportArr = window.currentDropResults.map(r => {
                let row = {
                    "Code": r.code,
                    "Branch Name": r.name,
                    "AM": r.am,
                    "Consecutive Drops": r.dropCount
                };
                
                sortedDates.forEach(d => {
                    let p = r.path.find(x => x.date === d);
                    let headerDate = formatDateStr(d);
                    row[headerDate] = p ? `RM${formatRM(p.sales)}` : "-";
                });
                
                return row;
            });
            
            let wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exportArr), "Drop Analysis");
            
            let startDate = document.getElementById('drop-start').value;
            let endDate = document.getElementById('drop-end').value;
            XLSX.writeFile(wb, `DropAnalysis_${startDate}_to_${endDate}.xlsx`);
        }

        async function patchDatabase() {
            if(!currentUser || currentUser.role !== 'admin') {
                alert("Fungsi PATCH DB adalah khas untuk Admin sahaja.");
                return;
            }
            if(!confirm("Mula proses baiki database? (Jangan tutup page ini sehingga siap)")) return;
            setSyncing(true);
            try {
                let snap = await db.collection("submissions").where("date", ">=", "2026-06-01").get();
                let batch = db.batch();
                let count = 0;
                let batches = [];
                snap.forEach(doc => {
                    let d = doc.data();
                    if(!d.am && d.code) { 
                        let b = masterBranches.find(x => x.code == d.code);
                        if(b && b.am) {
                            batch.update(doc.ref, { am: b.am });
                            count++;
                            if(count === 400) {
                                batches.push(batch.commit());
                                batch = db.batch();
                                count = 0;
                            }
                        }
                    }
                });
                if(count > 0) batches.push(batch.commit());
                await Promise.all(batches);
                setSyncing(false);
                alert("Done! All data has been successfully repaired. AM can now view historical data.");
                syncManagerFromCloud();
            } catch(e) {
                console.error(e);
                setSyncing(false);
                alert("Error while repairing database!");
            }
        }

        async function toggle3DaysAlert() {
            if(!db) return;
            let current = window.globalConfig && window.globalConfig.enable_3days_alert === true;
            let newVal = !current;
            
            let confirmMsg = newVal ? "Are you sure you want to UNLOCK the 3-Days Drop Alert? This will consume high database reads." : "Are you sure you want to LOCK this feature to save costs?";
            let { value: confirm } = await Swal.fire({
                title: 'Confirm Toggle',
                text: confirmMsg,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Yes, Proceed',
                confirmButtonColor: newVal ? '#059669' : '#e11d48'
            });
            if(!confirm) return;

            try {
                await db.collection("config").doc("system").set({enable_3days_alert: newVal}, {merge: true});
                Swal.fire('Success', 'Feature toggle updated.', 'success');
            } catch(e) {
                Swal.fire('Error', 'Failed to update toggle: ' + e.message, 'error');
            }
        }

        // --- 6. Admin Utils ---
        function pushToGoogleSheets() {
            let url = GLOBAL_WEBHOOK_URL || localStorage.getItem('global_gs_url');
            if(!url || url === "SILA_TAMPAL_URL_GOOGLE_APPS_SCRIPT_DI_SINI") {
                showToast('error', 'Google Sheets Webhook URL not set!');
                return;
            }
            if(!dbSubmissions || dbSubmissions.length === 0) {
                showToast('error', 'No data loaded to push. Please refresh Tracking tab.');
                return;
            }

            let fDate = document.getElementById('track-date').value;
            if (!fDate) {
                Swal.fire({
                    title: 'Select Date Dahulu',
                    text: "Please select a Date from the filter above before pressing the Push button. This prevents the system from processing a full month's data at once which causes slow loading and double data.",
                    icon: 'warning'
                });
                return;
            }

            let dataToPush = dbSubmissions.filter(d => d.date === fDate);
            if(dataToPush.length === 0) {
                showToast('info', 'No data for date ' + fDate);
                return;
            }

            Swal.fire({
                title: 'Confirm Push Data?',
                text: `System will insert ${dataToPush.length} special records for date ${fDate} into database.`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#10b981',
                cancelButtonColor: '#334155',
                confirmButtonText: 'Ya, Push Data'
            }).then((result) => {
                if (result.isConfirmed) {
                    setSyncing(true);
                    showToast('info', 'Pushing data in batches...');
                    
                    let chunks = [];
                    for (let i = 0; i < dataToPush.length; i += 50) { // Batch of 50 for Google Apps Script limits
                        chunks.push(dataToPush.slice(i, i + 50));
                    }

                    async function pushBatches() {
                        for (let chunk of chunks) {
                            let payloadData = { action: 'batch_upsert', data: chunk };
                            await fetch(url, {
                                method: 'POST',
                                mode: 'no-cors',
                                headers: { 'Content-Type': 'text/plain' },
                                body: JSON.stringify(payloadData)
                            });
                        }
                        showToast('success', 'Push to Google Sheets Completed!');
                        setSyncing(false);
                    }
                    
                    pushBatches().catch(e => {
                        console.error('Push GS Error:', e);
                        showToast('error', 'Failed to push some data. Check console.');
                        setSyncing(false);
                    });
                }
            });
        }

        function savePasswords() {
            PASSWORDS['admin']=document.getElementById('pwd-admin').value||PASSWORDS['admin']; 
            PASSWORDS['am']=document.getElementById('pwd-am').value||PASSWORDS['am']; 
            PASSWORDS['branch']=document.getElementById('pwd-branch').value||PASSWORDS['branch'];
            PASSWORDS['operation']=document.getElementById('pwd-op').value||PASSWORDS['operation'];
            PASSWORDS['operation']=document.getElementById('pwd-op').value||PASSWORDS['operation'];
            showToast('success', 'Passwords updated in active session!');
        }

        async function repairAMNames() {
            if(!dbSubmissions || dbSubmissions.length === 0) {
                showToast('error', 'No data loaded to repair. Please select a date in Tracking.');
                return;
            }

            let batch = db.batch();
            let count = 0;
            let promises = [];

            setSyncing(true);
            showToast('info', 'Scanning data for missing AM names...');

            dbSubmissions.forEach(sub => {
                if (!sub.am || sub.am.trim() === "") {
                    let b = masterBranches.find(x => x.code == sub.code);
                    if (b && b.am) {
                        let docId = sub.date + "_" + sub.code;
                        let ref = db.collection("submissions").doc(docId);
                        batch.update(ref, { am: b.am });
                        count++;
                        
                        if (count % 400 === 0) {
                            promises.push(batch.commit());
                            batch = db.batch();
                        }
                    }
                }
            });

            if (count % 400 !== 0 && count > 0) {
                promises.push(batch.commit());
            }

            if (count === 0) {
                showToast('success', 'All records are fine! No missing AM names found.');
                setSyncing(false);
                return;
            }

            try {
                await Promise.all(promises);
                showToast('success', `Successfully repaired ${count} records! Area Managers can now see them.`);
                setSyncing(false);
                triggerDataSync();
            } catch (e) {
                console.error("Repair Error", e);
                showToast('error', 'Failed to repair some records. Check console.');
                setSyncing(false);
            }
        }

        function processExcelUpload(e) {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = function(evt) {
                try {
                    const workbook = XLSX.read(new Uint8Array(evt.target.result), {type: 'array'});
                    const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
                    if(json.length > 0) {
                        let seen = new Set();
                        masterBranches = json.filter(b => {
                            if(!b.CODE) return false;
                            let c = String(b.CODE).trim();
                            if(seen.has(c)) return false;
                            seen.add(c);
                            return true;
                        }).map(row => {
                            let getVal = (possible) => { let k = Object.keys(row).find(x => possible.includes(x.trim().toLowerCase())); return k ? row[k] : ""; };
                            return { code: parseInt(getVal(['code', 'kod'])) || Math.floor(Math.random()*9000)+1000, name: getVal(['outlet', 'name', 'nama']) || "UNKNOWN", am: getVal(['am', 'area manager', 'pengurus']) || "NO AM", state: getVal(['state', 'negeri']) || "N/A", warehouse: getVal(['warehouse', 'wh', 'gudang']) || "N/A" };
                        });
                        showToast('success', `Master directory updated with ${masterBranches.length} records.`);
                    }
                } catch (err) { showToast('error', 'Failed to parse Excel file.'); }
            };
            reader.readAsArrayBuffer(file);
        }

        function showToast(type, msg) {
            let t = document.getElementById('toast'), icon = document.getElementById('toast-icon');
            let tType = type==='success'?'emerald':type==='error'?'rose':'cyan';
            t.className = `fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-xl p-4 shadow-2xl border transition-all duration-300 opacity-100 bg-${tType}-950/90 border-${tType}-500/50`;
            icon.className = `flex h-8 w-8 items-center justify-center rounded-lg bg-${tType}-500 text-white`;
            icon.innerHTML = type==='success'?'<i class="fa-solid fa-check"></i>':type==='error'?'<i class="fa-solid fa-xmark"></i>':'<i class="fa-solid fa-info"></i>';
            document.getElementById('toast-title').className = `text-xs font-bold text-${tType}-400 uppercase`; document.getElementById('toast-title').innerText = type;
            document.getElementById('toast-msg').innerText = msg;
            setTimeout(() => { t.classList.add('translate-y-20', 'opacity-0'); }, 3000);
        }
        let tbcBranches = [];
        
        function fetchTBCBranches() {
            let url = GLOBAL_WEBHOOK_URL || localStorage.getItem('global_gs_url');
            if(!url || url === "SILA_TAMPAL_URL_GOOGLE_APPS_SCRIPT_DI_SINI") {
                alert("Please set the Webhook URL first in System Control menu.");
                return;
            }
            document.getElementById('hub-total-branches').innerText = "Syncing...";
            fetch(url + '?t=' + new Date().getTime() + '&action=get_tbc_branches')
              .then(r=>r.json())
              .then(data => {
                  if(data && data.error) {
                      alert("GOOGLE SHEET ERROR: " + data.error);
                      document.getElementById('hub-total-branches').innerText = "Error";
                      return;
                  }
                if(Array.isArray(data) && data.length > 0) {
                    tbcBranches = data;
                    document.getElementById('hub-total-branches').innerText = tbcBranches.length;
                    showToast('success', 'Ops Branch Hub data downloaded successfully!');
                } else if (data.error) {
                    showToast('error', "Error dari Google Sheet: " + data.error);
                } else {
                    showToast('info', "No data found or invalid format.");
                }
            }).catch(e => {
                console.error(e);
                showToast('error', "Error sambungan ketika muat turun data TBC.");
            });
        }
        
        function resetHubSearch() {
            document.getElementById('hub-search-input').value = "";
            document.getElementById('hub-search-results').classList.add('hidden');
            document.getElementById('hub-result-card').classList.add('hidden');
        }
        
        let hubSearchInputEl = document.getElementById('hub-search-input');
        if (hubSearchInputEl) hubSearchInputEl.addEventListener('input', function(e) {
            let q = e.target.value.toLowerCase().trim();
            let resBox = document.getElementById('hub-search-results');
            resBox.innerHTML = '';
            if(q.length < 2) {
                resBox.classList.add('hidden');
                return;
            }
            
            let matches = tbcBranches.filter(b => {
                let code = String(b['CODE'] || '').toLowerCase();
                let name = String(b['BRANCH NAME'] || '').toLowerCase();
                let fullStr = `${code} - ${name} ${code} ${name}`;
                let terms = q.split(/\s+/);
                return terms.every(t => fullStr.includes(t));
            }).slice(0, 10);
            
            if(matches.length > 0) {
                matches.forEach(b => {
                    let div = document.createElement('div');
                    div.className = "p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0";
                    div.innerHTML = `<div class="font-bold text-slate-800">${b['CODE'] || 'N/A'} - ${b['BRANCH NAME'] || 'N/A'}</div><div class="text-xs text-slate-500">${b['AREA'] || 'N/A'} | ${b['WH'] || 'N/A'}</div>`;
                    div.onclick = function() {
                        showHubResult(b);
                        resBox.classList.add('hidden');
                        document.getElementById('hub-search-input').value = (b['CODE'] || '') + ' - ' + (b['BRANCH NAME'] || '');
                    };
                    resBox.appendChild(div);
                });
                resBox.classList.remove('hidden');
            } else {
                resBox.innerHTML = `<div class="p-3 text-slate-500 text-sm italic">No match found</div>`;
                resBox.classList.remove('hidden');
            }
        });

        // hide search results on click outside
        document.addEventListener('click', function(e) {
            let sInput = document.getElementById('hub-search-input');
            let sRes = document.getElementById('hub-search-results');
            if(sInput && sRes && !sInput.contains(e.target) && !sRes.contains(e.target)) {
                sRes.classList.add('hidden');
            }
        });

        function showHubResult(b) {
            document.getElementById('hub-result-card').classList.remove('hidden');
            document.getElementById('hub-res-code-badge').innerText = b['CODE'] || 'N/A';
            document.getElementById('hub-res-name').innerText = b['BRANCH NAME'] || 'N/A';
            
            document.getElementById('hub-res-code').innerText = b['CODE'] || 'N/A';
            document.getElementById('hub-res-branch').innerText = b['BRANCH NAME'] || 'N/A';
            document.getElementById('hub-res-area').innerText = b['AREA'] || 'N/A';
            document.getElementById('hub-res-am').innerText = b['AREA MANAGER'] || 'N/A';
            document.getElementById('hub-res-wh').innerText = b['WH'] || 'N/A';
            
            let commDate = b['COMMERCE DATE'] || 'N/A';
            if(commDate && commDate !== 'N/A' && commDate.includes('T')) commDate = commDate.split('T')[0];
            document.getElementById('hub-res-commerce').innerText = commDate;
            
            document.getElementById('hub-res-hours').innerText = b['BUSINESS HOUR'] || 'N/A';
            
            let beer = b['BEER CATEGORY'] || 'N/A';
            let beerEl = document.getElementById('hub-res-beer');
            beerEl.innerText = beer;
            if(beer.includes('A')) { beerEl.className = "inline-block px-3 py-1 bg-green-50 border border-green-200 text-green-700 rounded-lg font-bold text-sm"; }
            else if(beer.includes('B')) { beerEl.className = "inline-block px-3 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg font-bold text-sm"; }
            else { beerEl.className = "inline-block px-3 py-1 bg-slate-50 border border-slate-200 text-slate-700 rounded-lg font-bold text-sm"; }
            
            document.getElementById('hub-res-address').innerText = b['ADDRESS'] || b['BRANCH ADDRESS'] || 'N/A';
            document.getElementById('hub-res-majlis').innerText = b['MAJLIS'] || 'N/A';
            document.getElementById('hub-res-negeri').innerText = b['NEGERI'] || 'N/A';

            function fD(v) { 
                if(!v || v==='N/A') return 'N/A'; 
                if(typeof v === 'string' && v.includes('T')) {
                    let ms = new Date(v).getTime();
                    if (isNaN(ms)) return v.split('T')[0];
                    // Tambah 8 jam untuk pastikan ia zon masa Malaysia (UTC+8)
                    let d = new Date(ms + 8 * 60 * 60 * 1000);
                    let year = d.getUTCFullYear();
                    // Fix pepijat Google Sheet (Tahun 30 dibaca sebagai 1930)
                    if (year > 1900 && year < 2000) year += 100;
                    let month = String(d.getUTCMonth() + 1).padStart(2, '0');
                    let day = String(d.getUTCDate()).padStart(2, '0');
                    return `${year}-${month}-${day}`;
                }
                return v; 
            }
            document.getElementById('hub-res-lic-biz1').innerText = fD(b['LIC_LESEN BISNES 1'] || b['LIC_NORM_LESENBISNES1'] || b['LESEN BISNES 1'] || 'N/A');
            document.getElementById('hub-res-lic-biz2').innerText = fD(b['LIC_LESEN BISNES 2'] || b['LIC_NORM_LESENBISNES2'] || b['LESEN BISNES 2'] || 'N/A');
            document.getElementById('hub-res-lic-kakilima').innerText = fD(b['LIC_LESEN KAKI LIMA'] || b['LIC_NORM_LESENKAKILIMA'] || b['LESEN KAKI LIMA'] || 'N/A');
            document.getElementById('hub-res-lic-iklan1').innerText = fD(b['LIC_LESEN PENGIKLANAN 1'] || b['LIC_NORM_LESENPENGIKLANAN1'] || b['LESEN PENGIKLANAN 1'] || 'N/A');
            document.getElementById('hub-res-lic-iklan2').innerText = fD(b['LIC_LESEN PENGIKLANAN 2'] || b['LIC_NORM_LESENPENGIKLANAN2'] || b['LESEN PENGIKLANAN 2'] || 'N/A');
            document.getElementById('hub-res-lic-beer2').innerText = fD(b['LIC_LESEN MINUMAN BEER'] || b['LIC_NORM_LESENMINUMANBEER'] || b['LESEN MINUMAN BEER'] || 'N/A');
            
            document.getElementById('hub-res-lic-plastik1').innerText = fD(b['LIC_SIJIL CAJ BEG PLASTIK'] || b['LIC_NORM_SIJILCAJBEGPLASTIK'] || b['SIJIL CAJ BEG PLASTIK'] || 'N/A');
            document.getElementById('hub-res-lic-plastik2').innerText = fD(b['LIC_SIJIL BEBAS BEG PLASTIK'] || b['LIC_NORM_SIJILBEBASBEGPLASTIK'] || b['SIJIL BEBAS BEG PLASTIK'] || 'N/A');
            
            document.getElementById('hub-res-lic-tembakau').innerText = fD(b['LIC_LESEN TEMBAKAU'] || b['LIC_NORM_LESENTEMBAKAU'] || b['LESEN TEMBAKAU'] || 'N/A');
            document.getElementById('hub-res-lic-beras').innerText = fD(b['LIC_LESEN BERAS'] || b['LIC_NORM_LESENBERAS'] || b['LESEN BERAS'] || 'N/A');
            document.getElementById('hub-res-lic-runcit').innerText = fD(b['LIC_LESEN RUNCIT'] || b['LIC_NORM_LESENRUNCIT'] || b['LESEN RUNCIT'] || 'N/A');
            document.getElementById('hub-res-lic-arak').innerText = fD(b['LIC_LESEN ARAK'] || b['LIC_NORM_LESENARAK'] || b['LESEN ARAK'] || 'N/A');

        }
        
        // --- AUDIT & ANOMALY ---
        async function runAuditCheck() {
            let dateStr = document.getElementById('audit-date').value;
            let limitSales = parseFloat(document.getElementById('audit-limit-sales').value) || 50000;
            let limitLorry = parseFloat(document.getElementById('audit-limit-lorry').value) || 90000;
            
            if(!dateStr) {
                Swal.fire('Info', 'Please select a date.', 'warning');
                return;
            }
            
            setSyncing(true);
            try {
                let snap = await db.collection("submissions").where("date", "==", dateStr).get();
                let tbody = document.getElementById('audit-table-body');
                tbody.innerHTML = '';
                let found = 0;
                
                snap.forEach(doc => {
                    let d = doc.data();
                    let s = parseFloat(d.sales) || 0;
                    let l = parseFloat(d.lorry) || 0;
                    
                    let isuJualan = s >= limitSales ? `> RM${limitSales}` : '-';
                    let isuLori = l >= limitLorry ? `> RM${limitLorry}` : '-';
                    
                    if(s >= limitSales || l >= limitLorry) {
                        found++;
                        
                        let br = masterBranches.find(b => String(b.code) === String(d.code)) || {};
                        let amName = br.am || 'N/A';
                        let branchName = br.name || '';
                        let cawanganText = branchName ? `${d.code} - ${branchName}` : d.code;
                        
                        let tr = document.createElement('tr');
                        tr.className = "border-b border-slate-800 hover:bg-slate-800/50 transition-colors";
                        tr.innerHTML = `
                            <td class="py-3 px-4 text-white">${d.date}</td>
                            <td class="py-3 px-4 text-slate-300 font-bold">${amName}</td>
                            <td class="py-3 px-4 font-bold text-white">${cawanganText}</td>
                            <td class="py-3 px-4 ${s >= limitSales ? 'text-rose-400 font-bold' : 'text-slate-300'}">${s.toLocaleString('en-US', {minimumFractionDigits:2})}</td>
                            <td class="py-3 px-4 ${l >= limitLorry ? 'text-rose-400 font-bold' : 'text-slate-300'}">${l.toLocaleString('en-US', {minimumFractionDigits:2})}</td>
                            <td class="py-3 px-4 ${s >= limitSales ? 'text-rose-400 font-bold' : 'text-slate-500'}">${isuJualan}</td>
                            <td class="py-3 px-4 ${l >= limitLorry ? 'text-rose-400 font-bold' : 'text-slate-500'}">${isuLori}</td>
                        `;
                        tbody.appendChild(tr);
                    }
                });
                
                if(found === 0) {
                    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-teal-400 font-bold"><i class="fa-solid fa-check-circle mr-1"></i> No Anomaly Found</td></tr>`;
                }
                setSyncing(false);
            } catch(e) {
                console.error(e);
                Swal.fire('Error', 'Failed to download Audit data.', 'error');
                setSyncing(false);
            }
        }
        
    
