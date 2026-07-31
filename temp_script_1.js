
        // --- SURVEY & TRACKING SYSTEM ---

        function getActiveAMs() {
            if (!masterBranches || masterBranches.length === 0) return [];
            let valid = new Set();
            masterBranches.forEach(b => {
                let name = (b.am || '').trim().toUpperCase();
                if (name && name !== 'N/A' && name !== 'NO AM' && name !== 'UNKNOWN') {
                    valid.add(name);
                }
            });
            return Array.from(valid).sort();
        }

        function listenToSurveyBadge() {
            if (typeof surveyUnsubscribe === 'function') surveyUnsubscribe();
            if (typeof responsesUnsubscribe === 'function') responsesUnsubscribe();
            if (_surveyScheduleTimer) clearInterval(_surveyScheduleTimer);
            
            surveysLoaded = false;
            responsesLoaded = false;
            hasAlertedSurvey = false;
            lastActiveSurveyHash = null;

            try {
                let cachedS = localStorage.getItem('cached_all_surveys');
                if (cachedS) {
                    let p = JSON.parse(cachedS);
                    if (Array.isArray(p) && p.length > 0) {
                        allSurveys = p;
                        updateSurveyUI(false);
                    }
                }
            } catch(cacheErr) {}

            _surveyScheduleTimer = setInterval(() => {
                if (typeof window.isFillingSurveyActive === 'boolean' && window.isFillingSurveyActive) return;
                if (!surveysLoaded || document.hidden) return;
                let now = new Date();
                let needsRefresh = allSurveys.some(s => {
                    if (s.status === 'active' && s.publishAt) {
                        let pubTime = new Date(s.publishAt);
                        return now >= pubTime && (now - pubTime) <= 300000;
                    }
                    return false;
                });
                if (needsRefresh) {
                    updateSurveyUI(false);
                }
            }, 60000);

            let processSurveys = (docs) => {
                let fetched = (docs || []).map(doc => {
                    let d = typeof doc.data === 'function' ? doc.data() : (doc || {});
                    return { id: doc.id || d.id, ...d };
                });
                if (typeof allSurveys !== 'undefined' && Array.isArray(allSurveys)) {
                    fetched.forEach(f => {
                        let old = allSurveys.find(x => x.id === f.id);
                        if (old && old.amConfirmations && old.amConfirmations.length > 0) {
                            f.amConfirmations = Array.from(new Set([...(f.amConfirmations || []), ...old.amConfirmations]));
                        }
                        if (old && old.amConfirmTimes) {
                            f.amConfirmTimes = Object.assign({}, old.amConfirmTimes, f.amConfirmTimes || {});
                        }
                        if (old && old.amClosed && old.amClosed.length > 0) {
                            f.amClosed = Array.from(new Set([...(f.amClosed || []), ...old.amClosed]));
                        }
                    });
                }
                if (fetched.length > 0) {
                    allSurveys = fetched;
                    try { localStorage.setItem('cached_all_surveys', JSON.stringify(allSurveys)); } catch(e){}
                } else {
                    let cached = localStorage.getItem('cached_all_surveys');
                    if (cached) {
                        try { let p = JSON.parse(cached); if(Array.isArray(p) && p.length > 0) allSurveys = p; else allSurveys = fetched; } catch(e){ allSurveys = fetched; }
                    } else allSurveys = fetched;
                }
                allSurveys.sort((a, b) => {
                    let getT = (x) => {
                        if (!x) return '';
                        if (typeof x === 'string') return x;
                        if (x.seconds) return String(x.seconds);
                        if (x._seconds) return String(x._seconds);
                        return String(x);
                    };
                    return getT(b.createdAt).localeCompare(getT(a.createdAt));
                });
                surveysLoaded = true;
                updateSurveyUI(true);
            };

            db.collection('surveys').get().then(snap => processSurveys(snap ? snap.docs : [])).catch(e => {
                console.error("Initial get surveys err:", e);
                let cached = localStorage.getItem('cached_all_surveys');
                if (cached) { try { let p = JSON.parse(cached); if(Array.isArray(p)) { allSurveys = p; } } catch(err){} }
                surveysLoaded = true;
                updateSurveyUI(true);
            });
            
            surveyUnsubscribe = db.collection('surveys').onSnapshot(snap => {
                processSurveys(snap ? snap.docs : []);
                
                let sIds = allSurveys.filter(s => s.status === 'active').map(s => s.id);
                if (sIds.length === 0) {
                    if (responsesUnsubscribe) { responsesUnsubscribe(); responsesUnsubscribe = null; }
                    lastActiveSurveyHash = null;
                    allResponses = [];
                    responsesLoaded = true;
                    updateSurveyUI(true);
                    if(surveysLoaded && responsesLoaded) checkSurveyAlerts();
                    return;
                }
                
                let curHash = sIds.slice().sort().join('|');
                if (curHash !== lastActiveSurveyHash || !responsesUnsubscribe) {
                    lastActiveSurveyHash = curHash;
                    if (responsesUnsubscribe) responsesUnsubscribe();
                    
                    let respQuery = db.collection('survey_responses');
                    if (sIds.length > 0 && sIds.length <= 50) {
                        respQuery = respQuery.where('surveyId', 'in', sIds);
                    }
                    if (currentUser && currentUser.role === 'branch') {
                        respQuery = respQuery.where('branchCode', '==', String(currentUser.id));
                    } else if (currentUser && currentUser.role === 'am') {
                        respQuery = respQuery.where('amName', '==', (currentUser.name || '').trim().toUpperCase());
                    }
                    responsesUnsubscribe = respQuery.limit(2000).onSnapshot(rSnap => {
                        let rData = rSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));
                        
                        if (currentUser && currentUser.role === 'branch') {
                            rData = rData.filter(r => String(r.branchCode) === String(currentUser.id));
                        } else if (currentUser && currentUser.role === 'am') {
                            let amName = (currentUser.name || '').trim().toUpperCase();
                            rData = rData.filter(r => (r.amName || '').toUpperCase() === amName);
                        }
                        
                        if (typeof allResponses !== 'undefined' && Array.isArray(allResponses) && allResponses.length > 0) {
                            let respMap = new Map();
                            allResponses.forEach(r => respMap.set(r.id, r));
                            rData.forEach(r => respMap.set(r.id, r));
                            rData = Array.from(respMap.values());
                        }
                        allResponses = rData;
                        try { localStorage.setItem('cached_all_responses', JSON.stringify(allResponses)); } catch(e){}
                        responsesLoaded = true;
                        updateSurveyUI(true);
                        if(surveysLoaded && responsesLoaded) checkSurveyAlerts();
                    }, err => {
                        console.error("Responses snapshot err:", err);
                        if (!Array.isArray(allResponses) || allResponses.length === 0) {
                            let cachedR = localStorage.getItem('cached_all_responses');
                            if (cachedR) { try { let pr = JSON.parse(cachedR); if(Array.isArray(pr)) allResponses = pr; } catch(err){} }
                        }
                        if (!Array.isArray(allResponses)) allResponses = [];
                        responsesLoaded = true;
                        updateSurveyUI(true);
                    });
                }
            }, err => {
                console.error("Surveys snapshot err:", err);
                db.collection('surveys').get().then(snap => {
                    processSurveys(snap ? snap.docs : []);
                }).catch(e => {
                    let cachedS = localStorage.getItem('cached_all_surveys');
                    if (cachedS) { try { let ps = JSON.parse(cachedS); if(Array.isArray(ps)) allSurveys = ps; } catch(err){} }
                    surveysLoaded = true;
                    updateSurveyUI(true);
                });
            });
        }
        
        function filterBranchesForSurvey(branches, s) {
            if (!s || !s.selectedBranches || !Array.isArray(s.selectedBranches) || s.selectedBranches.length === 0) {
                return branches;
            }
            return branches.filter(b => s.selectedBranches.includes(String(b.code)) || s.selectedBranches.includes(Number(b.code)));
        }

        function isSurveyForUser(s, user) {
            if (!s || s.status !== 'active') return false;
            if (s.publishAt && new Date() < new Date(s.publishAt)) {
                if (user.role !== 'admin' && user.role !== 'operation') {
                    return false;
                }
            }
            if (user.role === 'am') {
                // AM always sees active surveys targeted to their branches so they can monitor & verify
            }
            if (s.selectedBranches && s.selectedBranches.length > 0) {
                if (user.role === 'branch') {
                    return s.selectedBranches.includes(String(user.id)) || s.selectedBranches.includes(Number(user.id));
                } else if (user.role === 'am') {
                    if (!masterBranches || masterBranches.length === 0) return true;
                    let amName = (user.name || '').trim().toUpperCase();
                    let myBranches = masterBranches.filter(b => (b.am || '').trim().toUpperCase() === amName);
                    if (myBranches.length > 0) {
                        let hasTarget = myBranches.some(b => s.selectedBranches.includes(String(b.code)) || s.selectedBranches.includes(Number(b.code)));
                        if (!hasTarget) return false;
                    }
                }
            }
            return true;
        }

        function handleUploadBranchesFile(event) {
            let file = event.target.files[0];
            if (!file) return;
            
            let reader = new FileReader();
            reader.onload = function(evt) {
                try {
                    let codes = new Set();
                    if (file.name.endsWith('.txt') || file.name.endsWith('.csv')) {
                        let text = new TextDecoder().decode(evt.target.result);
                        let matches = text.match(/\b\d{3,5}\b/g) || [];
                        matches.forEach(m => {
                            if (masterBranches.some(b => String(b.code) === String(m) || Number(b.code) === Number(m))) {
                                codes.add(String(m));
                            }
                        });
                    } else {
                        const workbook = XLSX.read(new Uint8Array(evt.target.result), {type: 'array'});
                        const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {header: 1});
                        json.forEach(row => {
                            if (Array.isArray(row)) {
                                row.forEach(val => {
                                    if (val) {
                                        let str = String(val).trim();
                                        let matches = str.match(/\b\d{3,5}\b/g) || [];
                                        matches.forEach(m => {
                                            if (masterBranches.some(b => String(b.code) === String(m) || Number(b.code) === Number(m))) {
                                                codes.add(String(m));
                                            }
                                        });
                                    }
                                });
                            }
                        });
                    }
                    
                    if (codes.size > 0) {
                        let arr = Array.from(codes).sort();
                        let existing = document.getElementById('survey-selected-branches').value.trim();
                        let combined = existing ? [...new Set([...existing.split(/[\s,]+/).filter(Boolean), ...arr])].join(', ') : arr.join(', ');
                        document.getElementById('survey-selected-branches').value = combined;
                        showToast('success', `Successfully loaded ${arr.length} branch codes from file!`);
                    } else {
                        showToast('error', 'No valid branch codes found in the file.');
                    }
                } catch (err) {
                    console.error(err);
                    showToast('error', 'Failed to read file. Please ensure valid format.');
                }
                event.target.value = '';
            };
            reader.readAsArrayBuffer(file);
        }

        async function openSelectBranchesModal() {
            let ams = getActiveAMs();
            let amOptions = '<option value="">-- Select All or By AM --</option>';
            ams.forEach(a => { amOptions += `<option value="${a}">${a}</option>`; });
            
            let html = `
                <div class="text-left space-y-4">
                    <p class="text-xs text-slate-300">Select branches quickly using the filters below or upload file:</p>
                    
                    <div class="bg-slate-900 p-3 rounded-lg border border-slate-700 space-y-2">
                        <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">1. Select by Area Manager (AM)</label>
                        <div class="flex gap-2">
                            <select id="modal-filter-am" class="w-full bg-slate-950 text-white rounded px-3 py-1.5 border border-slate-700 text-xs">${amOptions}</select>
                            <button type="button" onclick="addBranchesFromAM()" class="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded text-xs font-bold whitespace-nowrap"><i class="fa-solid fa-plus mr-1"></i> Add This AM</button>
                        </div>
                    </div>

                    <div class="bg-slate-900 p-3 rounded-lg border border-slate-700 space-y-2">
                        <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">2. Search Branch Code / Name</label>
                        <div class="flex gap-2">
                            <input type="text" id="modal-search-branch" class="w-full bg-slate-950 text-white rounded px-3 py-1.5 border border-slate-700 text-xs" placeholder="Type code / name (e.g. 001 or Klang)">
                        </div>
                        <div id="modal-search-results" class="max-h-36 overflow-y-auto text-xs space-y-1 mt-2"></div>
                    </div>

                    <div class="bg-slate-900 p-3 rounded-lg border border-slate-700 flex justify-between items-center">
                        <div>
                            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">3. Upload File CSV / Excel / TXT</span>
                            <span class="text-[10px] text-slate-500">Upload branch code list from your computer</span>
                        </div>
                        <button type="button" onclick="document.getElementById('upload-branches-file').click(); Swal.close();" class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-bold"><i class="fa-solid fa-file-excel mr-1"></i> Upload File</button>
                    </div>
                </div>
            `;
            
            Swal.fire({
                title: '<span class="text-lg font-bold text-white"><i class="fa-solid fa-list-check mr-2 text-indigo-400"></i>Select Target Branches</span>',
                html: html,
                background: '#0f172a',
                color: '#fff',
                showCloseButton: true,
                showConfirmButton: false,
                width: '500px',
                didOpen: () => {
                    let searchInput = document.getElementById('modal-search-branch');
                    if (searchInput) {
                        searchInput.addEventListener('input', (e) => {
                            let val = e.target.value.trim().toLowerCase();
                            let resDiv = document.getElementById('modal-search-results');
                            if (!val || val.length < 2) { resDiv.innerHTML = ''; return; }
                            let matches = masterBranches.filter(b => String(b.code).includes(val) || (b.name && b.name.toLowerCase().includes(val))).slice(0, 15);
                            if (matches.length === 0) {
                                resDiv.innerHTML = '<div class="text-slate-500 text-center py-1">No branch found.</div>';
                            } else {
                                resDiv.innerHTML = matches.map(b => `
                                    <div class="flex justify-between items-center p-1.5 bg-slate-950 rounded hover:bg-slate-800 transition-colors">
                                        <span><strong class="text-emerald-400">${b.code}</strong> - ${b.name} (${b.am || 'No AM'})</span>
                                        <button type="button" onclick="addSingleBranchToSelection('${b.code}');" class="bg-purple-600 hover:bg-purple-500 text-white px-2 py-0.5 rounded text-[10px] font-bold">+ Add</button>
                                    </div>
                                `).join('');
                            }
                        });
                    }
                }
            });
        }

        function addBranchesFromAM() {
            let am = document.getElementById('modal-filter-am').value;
            if (!am) {
                showToast('error', 'Please select an Area Manager (AM)');
                return;
            }
            let branches = masterBranches.filter(b => (b.am || '').trim().toUpperCase() === am).map(b => String(b.code));
            if (branches.length === 0) {
                showToast('error', 'No branches found for this AM.');
                return;
            }
            let existing = document.getElementById('survey-selected-branches').value.trim();
            let combined = existing ? [...new Set([...existing.split(/[\s,]+/).filter(Boolean), ...branches])].join(', ') : branches.join(', ');
            document.getElementById('survey-selected-branches').value = combined;
            showToast('success', `Successfully added ${branches.length} branches under AM ${am}!`);
            Swal.close();
        }

        function addSingleBranchToSelection(code) {
            let existing = document.getElementById('survey-selected-branches').value.trim();
            let arr = existing ? existing.split(/[\s,]+/).filter(Boolean) : [];
            if (!arr.includes(String(code))) {
                arr.push(String(code));
                document.getElementById('survey-selected-branches').value = arr.join(', ');
                showToast('success', `Branch ${code} added!`);
            } else {
                showToast('info', `Branch ${code} is already in the list.`);
            }
        }

        let hasAlertedSurvey = false;
        function checkSurveyAlerts() {
            if (!currentUser) return;
            
            let pendingSurveys = [];
            let badge = null;
            
            if (currentUser.role === 'am') {
                let amName = (currentUser.name || '').trim().toUpperCase();
                pendingSurveys = allSurveys.filter(s => {
                    if (!isSurveyForUser(s, currentUser)) return false;
                    if (!s.targetAudience || s.targetAudience === 'am') {
                        if (s.type === 'custom') {
                            let respondedBranches = allResponses.filter(r => r.surveyId === s.id && (r.amName || '').trim().toUpperCase() === amName).map(r => String(r.branchCode));
                            let myBranches = filterBranchesForSurvey(masterBranches.filter(b => (b.am || '').trim().toUpperCase() === amName), s);
                            if (myBranches.length === 0) return false;
                            return myBranches.some(b => !respondedBranches.includes(String(b.code)));
                        }
                        return !allResponses.some(r => r.surveyId === s.id && (r.amName || '').trim().toUpperCase() === amName);
                    }
                    if (s.targetAudience === 'branch') {
                        let myBranches = filterBranchesForSurvey(masterBranches.filter(b => (b.am || '').trim().toUpperCase() === amName), s);
                        if (myBranches.length === 0) return false;
                        return !isAMSurveyConfirmed(s, amName);
                    }
                    return false;
                });
                badge = document.getElementById('survey-badge');
            } else if (currentUser.role === 'branch') {
                let branchCode = currentUser.id;
                pendingSurveys = allSurveys.filter(s => isSurveyForUser(s, currentUser) && s.targetAudience === 'branch' && !allResponses.some(r => r.surveyId === s.id && r.branchCode === branchCode));
                // Assuming branch might not have a badge, but if they do we can handle it here
            }

            if (pendingSurveys.length > 0) {
                if (badge) {
                    badge.innerText = pendingSurveys.length;
                    badge.classList.remove('hidden');
                }
                let prevCount = window._lastSurveyAlertCount || 0;
                window._lastSurveyAlertCount = pendingSurveys.length;
                let isNewOrDeleted = pendingSurveys.length > prevCount;

                if (!hasAlertedSurvey || isNewOrDeleted) {
                    hasAlertedSurvey = true;
                    if (typeof Swal !== 'undefined') {
                        Swal.fire({
                            icon: 'warning',
                            title: 'Attention: Survey Action Required!',
                            text: `You have ${pendingSurveys.length} pending survey(s) required to be filled out (or re-submitted due to data reset by Admin/AM). Please complete below.`,
                            confirmButtonColor: '#8b5cf6',
                            background: '#1e293b',
                            color: '#fff'
                        });
                    } else {
                        console.warn("SweetAlert2 not loaded, fallback to UI badge only for survey alert.");
                    }
                }
            } else {
                if (badge) badge.classList.add('hidden');
            }
        }

        function renderSurveys() {
            if (!surveysLoaded && typeof listenToSurveyBadge === 'function') {
                listenToSurveyBadge();
            }
            updateSurveyUI(true);
            try { toggleSurveyTypeUI(); } catch(e) {}
        }

        async function handleSurveyYesNoChange(selectEl, qLabel) {
            window.isFillingSurveyActive = true;
            if (selectEl.value === 'Tidak') {
                let reasonsStr = selectEl.getAttribute('data-reasons');
                let reasons = [];
                if (reasonsStr) {
                    try { reasons = JSON.parse(reasonsStr); } catch(e){}
                }
                
                let inputOptions = {};
                if (reasons && reasons.length > 0) {
                    reasons.forEach(r => { inputOptions[r] = r; });
                    inputOptions['Lain-lain'] = 'Lain-lain / Nyatakan';
                } else {
                    inputOptions['Tiada Stok'] = 'Tiada Stok';
                    inputOptions['Tiada Ruang / Rak'] = 'Tiada Ruang / Rak';
                    inputOptions['Tidak Relevan'] = 'Tidak Relevan';
                    inputOptions['Lain-lain'] = 'Lain-lain / Nyatakan';
                }
                
                let { value: selectedReason, isDismissed } = await Swal.fire({
                    title: 'Reason for "No" Answer',
                    text: `Please select a reason for: ${qLabel}`,
                    input: 'select',
                    inputOptions: inputOptions,
                    inputPlaceholder: '-- Select Reason --',
                    showCancelButton: true,
                    confirmButtonText: 'Confirm',
                    cancelButtonText: 'Cancel',
                    confirmButtonColor: '#4f46e5',
                    inputValidator: (value) => {
                        if (!value) {
                            return 'Please select a reason!';
                        }
                    }
                });
                
                if (isDismissed || !selectedReason) {
                    selectEl.value = '';
                    return;
                }
                
                let finalReason = selectedReason;
                if (selectedReason === 'Lain-lain') {
                    let { value: customText } = await Swal.fire({
                        title: 'Specify Other Reason',
                        input: 'text',
                        inputPlaceholder: 'Type reason here...',
                        showCancelButton: true,
                        confirmButtonText: 'Confirm',
                        confirmButtonColor: '#4f46e5',
                        inputValidator: (val) => {
                            if (!val || !val.trim()) return 'Please specify a reason!';
                        }
                    });
                    if (!customText) {
                        selectEl.value = '';
                        return;
                    }
                    finalReason = customText.trim();
                }
                
                let displayVal = `Tidak - ${finalReason}`;
                let opt = Array.from(selectEl.options).find(o => o.value === displayVal);
                if (!opt) {
                    opt = document.createElement('option');
                    opt.value = displayVal;
                    opt.text = `Tidak (${finalReason})`;
                    selectEl.add(opt);
                }
                selectEl.value = displayVal;
            }
        }

        function generateCustomSurveyHTML(s, amBranches = null) {
            let html = `<div class="bg-slate-800 rounded-lg p-4 border border-indigo-500/50 mb-4 shadow-lg shadow-indigo-900/20" id="survey-box-${s.id}">`;
            html += `<h3 class="text-md font-bold text-white mb-4 border-b border-slate-700 pb-2"><i class="fa-solid fa-clipboard-list text-indigo-400 mr-2"></i>${s.title}</h3>`;
            
            if (amBranches && amBranches.length > 0) {
                html += `<div class="overflow-x-auto mb-4">
                    <table class="w-full text-left text-sm text-slate-300">
                        <thead class="text-xs text-slate-400 bg-slate-800/50">
                            <tr>
                                <th class="p-2 border border-slate-700 whitespace-nowrap">CODE</th>
                                <th class="p-2 border border-slate-700 whitespace-nowrap">BRANCH NAME</th>`;
                (s.questions || []).forEach(q => {
                    html += `<th class="p-2 border border-slate-700 text-center">${q.label}</th>`;
                });
                html += `</tr></thead><tbody>`;
                
                amBranches.forEach(b => {
                    html += `<tr class="border-b border-slate-700/50">
                        <td class="p-2 border border-slate-700 font-bold">${b.code}</td>
                        <td class="p-2 border border-slate-700 whitespace-nowrap">${b.name}</td>`;
                    
                    (s.questions || []).forEach(q => {
                        html += `<td class="p-2 border border-slate-700">`;
                        if(q.type === 'number') {
                            html += `<input type="number" id="sq_${s.id}_${b.code}_${q.id}" class="w-full min-w-[80px] bg-slate-900 text-white rounded px-2 py-1 text-center border border-slate-700 outline-none focus:border-indigo-500" placeholder="0">`;
                        } else if (q.type === 'yesno') {
                            let rAttr = (q.reasons && q.reasons.length > 0) ? `data-reasons='${JSON.stringify(q.reasons).replace(/'/g, "&#39;")}'` : '';
                            html += `<select id="sq_${s.id}_${b.code}_${q.id}" ${rAttr} onchange="handleSurveyYesNoChange(this, '${q.label.replace(/'/g, "\\'")}')" class="w-full min-w-[80px] bg-slate-900 text-white rounded px-2 py-1 border border-slate-700 outline-none focus:border-indigo-500">
                                <option value="">-</option>
                                <option value="Ya">Ya</option>
                                <option value="Tidak">Tidak</option>
                            </select>`;
                        } else {
                            html += `<input type="text" id="sq_${s.id}_${b.code}_${q.id}" class="w-full min-w-[120px] bg-slate-900 text-white rounded px-2 py-1 border border-slate-700 outline-none focus:border-indigo-500" placeholder="...">`;
                        }
                        html += `</td>`;
                    });
                    html += `</tr>`;
                });
                html += `</tbody></table></div>`;
                html += `<button onclick="submitCustomSurveyResponseAM('${s.id}')" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors"><i class="fa-solid fa-paper-plane mr-2"></i>Hantar Maklum Balas Semua Branch</button>`;
            } else {
                html += `<div class="space-y-4 mb-4">`;
                (s.questions || []).forEach(q => {
                    html += `<div><label class="text-xs font-bold text-slate-300 block mb-1">${q.label}</label>`;
                    if(q.type === 'number') {
                        html += `<input type="number" id="sq_${s.id}_${q.id}" class="w-full bg-slate-900 text-white rounded px-3 py-2 border border-slate-700 outline-none focus:border-indigo-500" placeholder="Quantity (0)">`;
                    } else if (q.type === 'yesno') {
                        let rAttr = (q.reasons && q.reasons.length > 0) ? `data-reasons='${JSON.stringify(q.reasons).replace(/'/g, "&#39;")}'` : '';
                        html += `<select id="sq_${s.id}_${q.id}" ${rAttr} onchange="handleSurveyYesNoChange(this, '${q.label.replace(/'/g, "\\'")}')" class="w-full bg-slate-900 text-white rounded px-3 py-2 border border-slate-700 outline-none focus:border-indigo-500">
                            <option value="">-- Select --</option>
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                        </select>`;
                    } else {
                        html += `<input type="text" id="sq_${s.id}_${q.id}" class="w-full bg-slate-900 text-white rounded px-3 py-2 border border-slate-700 outline-none focus:border-indigo-500" placeholder="Answer...">`;
                    }
                    html += `</div>`;
                });
                html += `</div>`;
                html += `<button onclick="submitCustomSurveyResponse('${s.id}')" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors"><i class="fa-solid fa-paper-plane mr-2"></i>Hantar Maklum Balas</button>`;
            }
            html += `</div>`;
            return html;
        }

        function formatSafeDate(val) {
            if (!val) return '';
            try {
                if (typeof val.toMillis === 'function') return new Date(val.toMillis()).toLocaleString();
                if (val.seconds) return new Date(val.seconds * 1000).toLocaleString();
                return new Date(val).toLocaleString();
            } catch(e) { return String(val); }
        }

        function triggerLiveSync() {
            if (window._liveSyncListeners && Array.isArray(window._liveSyncListeners)) {
                window._liveSyncListeners.forEach(fn => {
                    try { fn(); } catch(e) {}
                });
            }
        }

        function isAMSurveyConfirmed(s, amName) {
            if (!s || !amName) return false;
            amName = amName.trim().toUpperCase();
            return (s.amConfirmations || []).includes(amName);
        }

        function updateSurveyUI(force = false, isPostSubmit = false) {
            if (!currentUser) {
                let saved = localStorage.getItem('pbi_user');
                if (saved) { try { currentUser = JSON.parse(saved); } catch(e){} }
            }
            if (!currentUser) {
                currentUser = { role: 'admin', name: 'System Admin' };
            }
            if (!Array.isArray(allSurveys)) allSurveys = [];
            if (!Array.isArray(allResponses)) allResponses = [];

            let adV = document.getElementById('survey-admin-view');
            let amV = document.getElementById('survey-am-view');
            let brV = document.getElementById('branch-survey-container');
            if (currentUser.role === 'branch') {
                if (brV) { brV.classList.remove('hidden'); brV.style.display = 'block'; }
                if (amV) { amV.classList.add('hidden'); amV.style.display = 'none'; }
                if (adV) { adV.classList.add('hidden'); adV.style.display = 'none'; }
            } else if (currentUser.role === 'am') {
                if (amV) { amV.classList.remove('hidden'); amV.style.display = 'block'; }
                if (adV) { adV.classList.add('hidden'); adV.style.display = 'none'; }
                if (brV) { brV.classList.add('hidden'); brV.style.display = 'none'; }
            } else {
                if (adV) { adV.classList.remove('hidden'); adV.style.display = 'block'; }
                if (amV) { amV.classList.add('hidden'); amV.style.display = 'none'; }
                if (brV) { brV.classList.add('hidden'); brV.style.display = 'none'; }
            }
            
            // Elak data hilang: Jangan re-render UI jika pengguna sedang mengisi borang survey atau popup Swal aktif
            if (!isPostSubmit) {
                if (typeof Swal !== 'undefined' && typeof Swal.isVisible === 'function' && Swal.isVisible()) {
                    if (force && window._currentOpenReportSurveyId) {
                        if (typeof viewSurveyReport === 'function') viewSurveyReport(window._currentOpenReportSurveyId, true);
                    }
                    return;
                }
                let builderArea = document.getElementById('survey-builder-area');
                let titleArea = document.getElementById('survey-new-title');
                if (document.activeElement && ((builderArea && builderArea.contains(document.activeElement)) || (titleArea && titleArea === document.activeElement))) {
                    if (!force) return;
                }
                let amListEl = document.getElementById('survey-am-list');
                let branchListEl = document.getElementById('branch-survey-container');
                let hasActiveInput = false;

                if (amListEl && amListEl.innerHTML.trim() !== '' && !amListEl.innerHTML.includes('Loading')) {
                    if (amListEl.contains(document.activeElement) || window.isFillingSurveyActive) hasActiveInput = true;
                    let hasInput = Array.from(amListEl.querySelectorAll('input:not([type="hidden"]), select, textarea')).some(el => {
                        if (el.id && el.id.startsWith('survey-exc-')) return el.value !== '0' && el.value !== '';
                        if (el.id && el.id.startsWith('survey-code-')) return true; // Pengecualian branch sedang diisi
                        if (el.id && el.id.startsWith('sq_')) return el.value !== '' && el.value !== '-' && el.value !== '0';
                        return el.value !== '' && el.value !== '0' && el.value !== '-';
                    });
                    if (hasInput) hasActiveInput = true;
                }
                if (branchListEl && branchListEl.innerHTML.trim() !== '') {
                    if (branchListEl.contains(document.activeElement) || window.isFillingSurveyActive) hasActiveInput = true;
                    let hasInput = Array.from(branchListEl.querySelectorAll('input:not([type="hidden"]), select, textarea')).some(el => {
                        if (el.id && el.id.startsWith('sq_')) return el.value !== '' && el.value !== '-' && el.value !== '0';
                        return el.value !== '' && el.value !== '0' && el.value !== '-';
                    });
                    if (hasInput) hasActiveInput = true;
                }
                if (hasActiveInput) return;
            } else {
                window.isFillingSurveyActive = false;
            }
            
            if (currentUser.role === 'branch') {
                let branchCode = currentUser.id;
                let pendingSurveys = allSurveys.filter(s => isSurveyForUser(s, currentUser) && s.targetAudience === 'branch' && !allResponses.some(r => r.surveyId === s.id && r.branchCode === branchCode));
                
                let html = '';
                if (pendingSurveys.length > 0) {
                    pendingSurveys.forEach(s => {
                        html += generateCustomSurveyHTML(s);
                    });
                }

                let container = document.getElementById('branch-survey-container');
                if (container) container.innerHTML = html;
                return;
            }

            if (currentUser.role === 'am') {
                let amName = (currentUser.name || '').trim().toUpperCase();
                let pendingSurveys = allSurveys.filter(s => isSurveyForUser(s, currentUser) && !isAMSurveyConfirmed(s, amName) && !(s.amClosed || []).includes(amName));
                
                let html = '';
                if (pendingSurveys.length === 0) {
                    html = '<div class="text-green-400 text-sm font-bold py-4 text-center"><i class="fa-solid fa-check-circle mr-2"></i>No active surveys!</div>';
                } else {
                    pendingSurveys.forEach(s => {
                        try {
                            if (s.targetAudience === 'branch') {
                                let myBranches = filterBranchesForSurvey(masterBranches.filter(b => (b.am || '').trim().toUpperCase() === amName), s);
                                let responsesForSurvey = allResponses.filter(r => r.surveyId === s.id);
                                
                                html += `<div class="bg-slate-800 rounded-lg p-4 border border-blue-500/50 mb-4 shadow-lg shadow-blue-900/20">
                                    <h3 class="text-md font-bold text-blue-400 mb-2"><i class="fa-solid fa-eye mr-2"></i>Pantauan: ${s.title}</h3>
                                    <p class="text-xs text-slate-400 mb-3">Ini adalah survey untuk diisi oleh cawangan. Di bawah adalah status dan maklum balas cawangan anda:</p>`;
                                    
                                if (s.questions && s.questions.length > 0) {
                                    html += `<div class="overflow-x-auto mb-2 custom-scrollbar">
                                        <table class="w-full text-left text-sm text-slate-300">
                                            <thead class="text-xs text-slate-400 bg-slate-900">
                                                <tr>
                                                    <th class="p-2 border border-slate-700 whitespace-nowrap">KOD</th>
                                                    <th class="p-2 border border-slate-700 whitespace-nowrap">NAMA CAWANGAN</th>
                                                    <th class="p-2 border border-slate-700 whitespace-nowrap text-center">STATUS</th>`;
                                    let isYesNoAM = (q) => q.type === 'yesno' || (responsesForSurvey && responsesForSurvey.some(r => r.answers && r.answers[q.id] && String(r.answers[q.id].value).startsWith('Tidak - ')));
                                    (s.questions || []).forEach(q => {
                                        html += `<th class="p-2 border border-slate-700 text-center">${q.label}</th>`;
                                        if (isYesNoAM(q)) html += `<th class="p-2 border border-slate-700 text-center text-amber-300">Sebab (Jika Tidak)</th>`;
                                    });
                                    html += `</tr></thead><tbody>`;
                                    
                                    myBranches.forEach(b => {
                                        let resp = responsesForSurvey.find(r => String(r.branchCode) === String(b.code));
                                        let statusHtml = resp 
                                            ? `<span class="bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded text-[10px] font-bold"><i class="fa-solid fa-check mr-1"></i>HANTAR</span><button onclick="deleteSurveyResponse('${resp.id}', '${s.id}')" class="text-rose-400 hover:text-rose-300 ml-2" title="Padam jawapan cawangan ini supaya boleh isi semula"><i class="fa-solid fa-trash"></i></button>` 
                                            : `<span class="bg-rose-500/20 text-rose-400 px-2 py-1 rounded text-[10px] font-bold"><i class="fa-solid fa-times mr-1"></i>BELUM</span>`;
                                        
                                        html += `<tr class="border-b border-slate-700/50 hover:bg-slate-700/30">
                                            <td class="p-2 border border-slate-700 font-bold">${b.code}</td>
                                            <td class="p-2 border border-slate-700 whitespace-nowrap">${b.name}</td>
                                            <td class="p-2 border border-slate-700 text-center">${statusHtml}</td>`;
                                        
                                        (s.questions || []).forEach(q => {
                                            let ans = getSurveyAnswerVal(resp, q);
                                            let colorClass = resp ? "text-white font-medium" : "text-slate-500";
                                            if (isYesNoAM(q)) {
                                                let mainAns = String(ans);
                                                let reasonAns = '-';
                                                if (mainAns.startsWith('Tidak - ')) {
                                                    reasonAns = mainAns.substring(8).trim();
                                                    mainAns = 'Tidak';
                                                } else if (mainAns === 'Tidak') {
                                                    mainAns = 'Tidak';
                                                    reasonAns = '-';
                                                }
                                                html += `<td class="p-2 border border-slate-700 text-center ${colorClass}">${mainAns}</td>`;
                                                html += `<td class="p-2 border border-slate-700 text-center text-amber-300 font-semibold">${reasonAns}</td>`;
                                            } else {
                                                html += `<td class="p-2 border border-slate-700 text-center ${colorClass}">${ans}</td>`;
                                            }
                                        });
                                        html += `</tr>`;
                                    });
                                    html += `</tbody></table></div>`;
                                } else {
                                    html += `<div class="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">`;
                                    myBranches.forEach(b => {
                                        let hasResponded = responsesForSurvey.some(r => String(r.branchCode) === String(b.code));
                                        let color = hasResponded ? 'text-emerald-400' : 'text-rose-400';
                                        let icon = hasResponded ? 'fa-check-circle' : 'fa-times-circle';
                                        html += `<div class="bg-slate-900 p-2 rounded border border-slate-700 flex justify-between">
                                            <span class="text-slate-300 font-bold">${b.code} - ${b.name}</span>
                                            <span class="${color}"><i class="fa-solid ${icon}"></i></span>
                                        </div>`;
                                    });
                                    html += `</div>`;
                                }

                                let isConfirmedAM = isAMSurveyConfirmed(s, amName);
                                if (isConfirmedAM) {
                                    html += `<div class="mt-3 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-emerald-950/80 border border-emerald-800 p-3 rounded-lg shadow-lg">
                                        <div class="flex items-center text-emerald-300 text-xs font-bold">
                                            <i class="fa-solid fa-check-double text-emerald-400 text-base mr-2.5"></i>
                                            <div>
                                                <div>Status Pengesahan AM: <span class="text-emerald-400 font-extrabold">DISAHKAN (BERJAYA HANTAR)</span></div>
                                                <div class="text-[10px] text-emerald-400/80 font-normal">Data maklum balas cawangan anda telah disahkan dan direkodkan di Admin.</div>
                                            </div>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            <button onclick="downloadAMSurveyExcel('${s.id}')" class="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-3 rounded-lg shadow text-xs flex items-center gap-1.5 transition-colors">
                                                <i class="fa-solid fa-file-excel"></i> Muat Turun Data
                                            </button>
                                            <button onclick="closeAMSurveyCard('${s.id}')" class="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-3 rounded-lg shadow text-xs flex items-center gap-1.5 transition-colors">
                                                <i class="fa-solid fa-xmark"></i> Keluar / Tutup
                                            </button>
                                        </div>
                                    </div>`;
                                } else {
                                    html += `<div class="mt-3 flex flex-col md:flex-row md:items-center justify-between gap-2 bg-slate-900/90 p-3 rounded-lg border border-slate-700">
                                        <div class="text-xs text-slate-300">
                                            Status Pengesahan AM: <span class="text-amber-400 font-bold">Belum Disahkan</span>
                                            <div class="text-[10px] text-slate-400">Pastikan semua cawangan telah selesai mengisi dengan betul sebelum menekan hantar.</div>
                                        </div>
                                        <button onclick="confirmAMSurveySubmission('${s.id}')" class="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded-lg shadow-lg text-xs flex items-center justify-center gap-2 transition-colors">
                                            <i class="fa-solid fa-paper-plane"></i> Sahkan & Hantar ke Admin
                                        </button>
                                    </div>`;
                                }
                                html += `</div>`;
                            } else if (s.type === 'custom') {
                                let respondedBranches = allResponses.filter(r => r.surveyId === s.id && (r.amName || '').trim().toUpperCase() === amName).map(r => String(r.branchCode));
                                let remainingBranches = masterBranches.filter(b => (b.am || '').trim().toUpperCase() === amName && !respondedBranches.includes(String(b.code)));
                                html += generateCustomSurveyHTML(s, remainingBranches);
                            } else {
                                html += `
                                <div class="bg-slate-800 rounded-lg p-4 border border-slate-700 mb-4" id="survey-box-${s.id}">
                                    <h3 class="text-md font-bold text-white mb-3">${s.title}</h3>
                                    <div class="flex items-center gap-2 mb-3">
                                        <label class="text-xs text-slate-400">Jumlah Pengecualian (Branch Belum Siap):</label>
                                        <select id="survey-exc-${s.id}" onchange="renderSurveyInputs('${s.id}')" class="bg-slate-900 text-white rounded px-2 py-1 outline-none border border-slate-600">
                                            ${[...Array(11).keys()].map(i => `<option value="${i}">${i}</option>`).join('')}
                                        </select>
                                    </div>
                                    <div id="survey-inputs-${s.id}" class="space-y-2 mb-3"></div>
                                    <button onclick="submitSurveyResponse('${s.id}')" class="bg-purple-600 hover:bg-purple-500 text-white font-bold py-1.5 px-4 rounded text-sm transition-colors"><i class="fa-solid fa-check mr-2"></i>Hantar Maklum Balas</button>
                                </div>
                                `;
                            }
                        } catch(amErr) {
                            console.error("Error rendering AM survey row:", s, amErr);
                        }
                    });
                }
                if (!html) {
                    html = '<div class="text-green-400 text-sm font-bold py-4 text-center"><i class="fa-solid fa-check-circle mr-2"></i>Tiada survey aktif / pantauan baru!</div>';
                }
                let completedAMSurveys = allSurveys.filter(s => (isSurveyForUser(s, currentUser) || s.targetAudience === 'branch' || s.targetAudience === 'am') && isAMSurveyConfirmed(s, amName));
                if (completedAMSurveys.length > 0) {
                    html += `<div class="mt-6 border-t border-slate-700 pt-4">
                        <h4 class="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-3"><i class="fa-solid fa-clock-rotate-left mr-1.5"></i>Sejarah Survey Dihantar / Disahkan</h4>
                        <div class="space-y-2">`;
                    completedAMSurveys.forEach(s => {
                        html += `<div class="bg-slate-900/80 border border-emerald-800/40 rounded-lg p-3 flex flex-col md:flex-row md:items-center justify-between gap-2">
                            <div>
                                <div class="text-xs font-bold text-emerald-400"><i class="fa-solid fa-check-circle mr-1.5"></i>${s.title}</div>
                                <div class="text-[10px] text-slate-400">Status: Telah disahkan dan dihantar ke Admin</div>
                            </div>
                            <div>
                                <button onclick="downloadAMSurveyExcel('${s.id}')" class="bg-emerald-700 hover:bg-emerald-600 text-white font-bold py-1.5 px-3 rounded text-xs flex items-center gap-1.5 shadow transition-colors">
                                    <i class="fa-solid fa-file-excel"></i> Muat Turun Data
                                </button>
                            </div>
                        </div>`;
                    });
                    html += `</div></div>`;
                }
                let amList = document.getElementById('survey-am-list');
                if (amList) amList.innerHTML = html;
            } else {
                // Admin / Operation
                let adV = document.getElementById('survey-admin-view'); if(adV) { adV.classList.remove('hidden'); adV.style.display = 'block'; }
                let amV = document.getElementById('survey-am-view'); if(amV) { amV.classList.add('hidden'); amV.style.display = 'none'; }
                let html = '';
                if (allSurveys.length === 0) {
                    html = !surveysLoaded 
                        ? '<tr><td colspan="5" class="p-4 text-center text-slate-400 text-sm"><i class="fa-solid fa-spinner fa-spin text-purple-400 mr-2"></i>Sedang memuat turun data survey dari cloud...</td></tr>'
                        : '<tr><td colspan="5" class="p-4 text-center text-slate-400 text-sm">Tiada survey dijumpai. Sila cipta survey baru di atas.</td></tr>';
                } else {
                    allSurveys.forEach(s => {
                        try {
                            let sResp = allResponses.filter(r => r.surveyId === s.id);
                            
                            let rCount = 0;
                            let tCount = 0;
                            if (s.targetAudience === 'branch') {
                                tCount = (s.selectedBranches && s.selectedBranches.length > 0) ? s.selectedBranches.length : (masterBranches ? masterBranches.length : 0);
                                let uniqueBranches = new Set();
                                sResp.forEach(r => { if(r.branchCode) uniqueBranches.add(String(r.branchCode)); });
                                rCount = uniqueBranches.size;
                            } else {
                                let activeAMs = getActiveAMs();
                                if (s.selectedBranches && s.selectedBranches.length > 0) {
                                    activeAMs = activeAMs.filter(a => masterBranches && masterBranches.some(b => (b.am || '').trim().toUpperCase() === a && (s.selectedBranches.includes(String(b.code)) || s.selectedBranches.includes(Number(b.code)))));
                                }
                                tCount = activeAMs.length;
                                let uniqueAMs = new Set();
                                sResp.forEach(r => { if(r.amName) uniqueAMs.add(String(r.amName).toUpperCase()); });
                                rCount = uniqueAMs.size;
                            }
                            
                            let isClosed = s.status === 'closed';
                            let isScheduled = s.publishAt && new Date() < new Date(s.publishAt);
                            let dateStr = formatSafeDate(s.createdAt);
                            let pubStr = String(s.publishAt || '').replace('T', ' ');
                            let statusBadgeHtml = isClosed
                                ? `<span class="text-red-400 font-bold text-xs uppercase bg-slate-900 px-2 py-1 rounded border border-red-500/30">CLOSED</span>`
                                : (isScheduled
                                    ? `<span class="text-amber-400 font-bold text-[11px] uppercase bg-slate-900 px-2 py-1 rounded border border-amber-500/30" title="Akan terbit pada ${pubStr}"><i class="fa-solid fa-clock mr-1"></i>TERBIT: ${pubStr}</span>`
                                    : `<span class="text-green-400 font-bold text-xs uppercase bg-slate-900 px-2 py-1 rounded border border-green-500/30">ACTIVE</span>`);
                            html += `
                            <tr class="hover:bg-slate-800/30 transition-colors">
                                <td class="p-3 text-sm text-slate-300 border-b border-slate-800/50">${dateStr}</td>
                                <td class="p-3 text-sm text-white font-bold border-b border-slate-800/50">${s.title || 'Untitled Survey'}</td>
                                <td class="p-3 text-sm border-b border-slate-800/50 text-center">
                                    ${statusBadgeHtml}
                                </td>
                                <td class="p-3 text-sm text-slate-300 border-b border-slate-800/50 text-center font-bold">${isClosed ? '<span class="text-[10px] text-slate-500">CLOSED</span>' : rCount + ' / ' + tCount}</td>
                                <td class="p-3 text-sm border-b border-slate-800/50 text-right">
                                    <button onclick="viewSurveyReport('${s.id}')" class="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold py-1 px-3 rounded-md shadow-lg transition-colors"><i class="fa-solid fa-chart-pie mr-1"></i> Check</button>
                                    <button onclick="cloneSurvey('${s.id}')" class="bg-teal-600 hover:bg-teal-500 text-white text-[10px] font-bold py-1 px-3 rounded-md shadow-lg transition-colors ml-1" title="Reuse This Survey For Today / New Date"><i class="fa-solid fa-copy mr-1"></i> Reuse</button>
                                    ${isClosed ? '' : `<button onclick="closeSurvey('${s.id}')" class="bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold py-1 px-3 rounded-md shadow-lg transition-colors ml-1"><i class="fa-solid fa-lock mr-1"></i> Close</button>`}
                                    <button onclick="deleteSurvey('${s.id}')" class="bg-rose-900 hover:bg-rose-700 text-rose-300 text-[10px] font-bold py-1 px-3 rounded-md shadow-lg transition-colors ml-1"><i class="fa-solid fa-trash mr-1"></i> Delete</button>
                                </td>
                            </tr>
                            `;
                        } catch(rowErr) {
                            console.error("Error rendering survey row:", s, rowErr);
                        }
                    });
                }
                if (!html) {
                    html = !surveysLoaded 
                        ? '<tr><td colspan="5" class="p-4 text-center text-slate-400 text-sm"><i class="fa-solid fa-spinner fa-spin text-purple-400 mr-2"></i>Sedang memuat turun data survey dari cloud...</td></tr>'
                        : '<tr><td colspan="5" class="p-4 text-center text-slate-400 text-sm">Tiada survey dijumpai. Sila cipta survey baru di atas.</td></tr>';
                }
                let listEl = document.getElementById('survey-admin-list');
                if (listEl) listEl.innerHTML = html;
            }
            try { toggleSurveyTypeUI(); } catch(e) {}
        }

        function renderSurveyInputs(id) {
            window.isFillingSurveyActive = true;
            let count = parseInt(document.getElementById(`survey-exc-${id}`).value) || 0;
            let html = '';
            
            let amName = (currentUser.name || '').trim().toUpperCase();
            let myBranches = masterBranches.filter(b => (b.am || '').trim().toUpperCase() === amName).sort((a,b) => String(a.name || '').localeCompare(String(b.name || '')));
            
            let optionsHtml = '<option value="" disabled selected>-- Pilih Branch Pengecualian --</option>';
            myBranches.forEach(b => {
                let safeName = (b.name || '').replace(/"/g, '&quot;');
                optionsHtml += `<option value="${b.code}" data-name="${safeName}">${b.name} (${b.code})</option>`;
            });

            for(let i=0; i<count; i++) {
                html += `
                <div class="mb-2">
                    <select id="survey-code-${id}-${i}" onchange="updateSurveyExceptionOptions('${id}', ${count})" class="w-full bg-slate-950 text-white rounded px-3 py-2 border border-slate-700 outline-none text-sm focus:border-purple-500">
                        ${optionsHtml}
                    </select>
                </div>`;
            }
            document.getElementById(`survey-inputs-${id}`).innerHTML = html;
            updateSurveyExceptionOptions(id, count);
        }

        function updateSurveyExceptionOptions(id, count) {
            let selected = new Set();
            for(let i=0; i<count; i++) {
                let el = document.getElementById(`survey-code-${id}-${i}`);
                if(el && el.value) selected.add(el.value);
            }
            for(let i=0; i<count; i++) {
                let el = document.getElementById(`survey-code-${id}-${i}`);
                if(!el) continue;
                let curVal = el.value;
                Array.from(el.options).forEach(opt => {
                    if(opt.value && opt.value !== curVal && selected.has(opt.value)) {
                        opt.disabled = true;
                        opt.style.color = '#475569';
                        opt.style.backgroundColor = '#0f172a';
                        if (!opt.text.endsWith(' (Telah Dipilih)')) opt.text += ' (Telah Dipilih)';
                    } else if (opt.value) {
                        opt.disabled = false;
                        opt.style.color = '#ffffff';
                        opt.style.backgroundColor = '';
                        opt.text = opt.text.replace(' (Telah Dipilih)', '');
                    }
                });
            }
        }

        ['input', 'change', 'focusin', 'click', 'touchstart'].forEach(evt => {
            document.addEventListener(evt, function(e) {
                if (e.target && ((e.target.id || '').startsWith('sq_') || (e.target.id || '').startsWith('survey-exc-') || (e.target.id || '').startsWith('survey-code-'))) {
                    window.isFillingSurveyActive = true;
                }
            });
        });

        let builderQuestions = [];

        function toggleSurveyTypeUI() {
            let typeEl = document.getElementById('survey-new-type');
            let area = document.getElementById('survey-builder-area');
            if (!typeEl || !area) return;
            let type = typeEl.value;
            if (type === 'custom') {
                area.classList.remove('hidden');
                area.style.display = 'block';
                area.style.setProperty('display', 'block', 'important');
                try { renderBuilderQuestions(); } catch(e) {}
                try { toggleSurveyQuestionReasonUI(); } catch(e) {}
            } else {
                area.classList.add('hidden');
                area.style.display = 'none';
                area.style.setProperty('display', 'none', 'important');
            }
        }

        function toggleSurveyQuestionReasonUI() {
            let type = document.getElementById('survey-builder-qtype').value;
            let container = document.getElementById('survey-builder-reason-container');
            if (container) {
                if (type === 'yesno') {
                    container.classList.remove('hidden');
                } else {
                    container.classList.add('hidden');
                }
            }
        }

        function renderBuilderQuestions() {
            let container = document.getElementById('survey-builder-questions');
            if (builderQuestions.length === 0) {
                container.innerHTML = '<div class="text-xs text-slate-400 italic">No questions added yet.</div>';
                return;
            }
            let html = '';
            builderQuestions.forEach((q, idx) => {
                let icon = q.type === 'number' ? 'fa-hashtag' : (q.type === 'yesno' ? 'fa-toggle-on' : 'fa-font');
                let typeName = q.type === 'number' ? 'Kuantiti' : (q.type === 'yesno' ? 'Ya/Tidak' : 'Teks');
                let reasonsBadge = '';
                if (q.type === 'yesno' && q.reasons && q.reasons.length > 0) {
                    reasonsBadge = `<div class="text-[10px] text-amber-300 mt-1"><i class="fa-solid fa-circle-question mr-1"></i>Sebab Tidak: ${q.reasons.join(', ')}</div>`;
                }
                html += `
                <div class="flex justify-between items-center bg-slate-950 p-2 rounded border border-slate-700">
                    <div>
                        <div class="text-sm text-white"><i class="fa-solid ${icon} text-indigo-400 w-5"></i> ${q.label} <span class="text-xs text-slate-500 ml-2">(${typeName})</span></div>
                        ${reasonsBadge}
                    </div>
                    <button type="button" onclick="removeCustomQuestion(${idx})" class="text-rose-500 hover:text-rose-400"><i class="fa-solid fa-times"></i></button>
                </div>
                `;
            });
            container.innerHTML = html;
        }

        function addCustomQuestion() {
            let label = document.getElementById('survey-builder-qlabel').value.trim();
            let type = document.getElementById('survey-builder-qtype').value;
            let reasonsEl = document.getElementById('survey-builder-qreasons');
            let reasonsStr = reasonsEl ? reasonsEl.value.trim() : '';
            if (!label) return showToast('error', 'Please enter question label.');
            
            let qObj = { id: 'q_' + Date.now() + '_' + Math.floor(Math.random()*1000), label, type };
            if (type === 'yesno' && reasonsStr) {
                qObj.reasons = reasonsStr.split(',').map(r => r.trim()).filter(r => r.length > 0);
            }
            builderQuestions.push(qObj);
            document.getElementById('survey-builder-qlabel').value = '';
            if (reasonsEl) reasonsEl.value = '';
            renderBuilderQuestions();
        }

        function removeCustomQuestion(idx) {
            builderQuestions.splice(idx, 1);
            renderBuilderQuestions();
        }

        function bulkAddQuestions() {
            let text = document.getElementById('survey-builder-bulk').value;
            let lines = text.split('\\n').map(l => l.trim()).filter(l => l.length > 0);
            if (lines.length === 0) return showToast('error', 'No item list found.');
            lines.forEach(l => {
                builderQuestions.push({ id: 'q_' + Date.now() + '_' + Math.floor(Math.random()*1000), label: l, type: 'number' });
            });
            document.getElementById('survey-builder-bulk').value = '';
            renderBuilderQuestions();
            showToast('success', `${lines.length} item ditambah!`);
        }
        window.addCustomQuestion = addCustomQuestion;
        window.removeCustomQuestion = removeCustomQuestion;
        window.bulkAddQuestions = bulkAddQuestions;
        window.renderBuilderQuestions = renderBuilderQuestions;
        window.toggleSurveyTypeUI = toggleSurveyTypeUI;
        window.toggleSurveyQuestionReasonUI = toggleSurveyQuestionReasonUI;

        async function createSurvey() {
            let title = document.getElementById('survey-new-title').value.trim();
            let target = document.getElementById('survey-new-target').value;
            let type = document.getElementById('survey-new-type').value;
            
            if(!title) return showToast('error', 'Please enter survey question/title.');
            if(type === 'custom' && builderQuestions.length === 0) {
                return showToast('error', 'Please add at least 1 question for Custom Survey.');
            }
            
            let selBranchesStr = (document.getElementById('survey-selected-branches') ? document.getElementById('survey-selected-branches').value : "").trim();
            let selectedBranches = [];
            if (selBranchesStr) {
                selectedBranches = selBranchesStr.split(/[\s,]+/).map(s => s.trim().toUpperCase()).filter(s => s.length > 0);
            }

            let publishAtVal = (document.getElementById('survey-new-publish-at') ? document.getElementById('survey-new-publish-at').value : '') || null;
            let surveyData = {
                title: title,
                targetAudience: target,
                type: type,
                selectedBranches: selectedBranches,
                publishAt: publishAtVal,
                createdBy: currentUser ? currentUser.name : 'Admin',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'active'
            };
            
            if(type === 'custom') {
                surveyData.questions = builderQuestions;
            }
            
            try {
                let tempId = 'doc_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
                let newSurveyObj = { id: tempId, ...surveyData, createdAt: new Date().toISOString() };
                let ref = await db.collection('surveys').add(surveyData);
                if (ref && ref.id) newSurveyObj.id = ref.id;
                
                if (!Array.isArray(allSurveys)) allSurveys = [];
                allSurveys.unshift(newSurveyObj);
                surveysLoaded = true;
                try { localStorage.setItem('cached_all_surveys', JSON.stringify(allSurveys)); } catch(e){}
                
                document.getElementById('survey-new-title').value = '';
                document.getElementById('survey-new-type').value = 'exception';
                document.getElementById('survey-new-target').value = 'am';
                if(document.getElementById('survey-new-publish-at')) document.getElementById('survey-new-publish-at').value = '';
                if(document.getElementById('survey-selected-branches')) document.getElementById('survey-selected-branches').value = '';
                builderQuestions = [];
                toggleSurveyTypeUI();
                renderBuilderQuestions();
                
                updateSurveyUI(true, true);
                triggerLiveSync();
                if (typeof surveyUnsubscribe !== 'undefined' && surveyUnsubscribe && typeof surveyUnsubscribe.refresh === 'function') surveyUnsubscribe.refresh();
                showToast('success', 'Survey Published Successfully!');
            } catch(e) {
                showToast('error', 'Error: ' + e.message);
            }
        }

        async function closeSurvey(id) {
            if(!confirm('Anda pasti mahu menutup survey ini? AM tidak lagi boleh menghantar maklum balas.')) return;
            try {
                let s = typeof allSurveys !== 'undefined' ? allSurveys.find(x => x.id === id) : null;
                if (s) s.status = 'closed';
                if (typeof updateSurveyUI === 'function') updateSurveyUI();
                await db.collection('surveys').doc(id).update({ status: 'closed' });
                showToast('success', 'Survey Ditutup!');
                if (typeof surveyUnsubscribe !== 'undefined' && surveyUnsubscribe && typeof surveyUnsubscribe.refresh === 'function') surveyUnsubscribe.refresh();
            } catch(e) {
                showToast('error', 'Error: ' + e.message);
            }
        }

        async function cloneSurvey(id) {
            let s = allSurveys.find(x => x.id === id);
            if(!s) return;
            let { value: newTitle } = await Swal.fire({
                title: 'Guna Semula / Clone Survey',
                text: 'Sila semak atau ubah tajuk survey. Format soalan akan dimuat naik ke kotak cipta di atas untuk anda edit & sahkan sebelum diterbitkan:',
                input: 'text',
                inputValue: s.title,
                showCancelButton: true,
                confirmButtonColor: '#0d9488',
                cancelButtonColor: '#475569',
                confirmButtonText: '<i class="fa-solid fa-pen-to-square mr-1"></i> Muat Naik ke Kotak Cipta & Edit',
                cancelButtonText: 'Batal',
                background: '#1e293b',
                color: '#fff',
                inputValidator: (value) => {
                    if (!value || !value.trim()) return 'Tajuk survey diperlukan!';
                }
            });
            if (!newTitle) return;

            document.getElementById('survey-new-title').value = newTitle.trim();
            document.getElementById('survey-new-target').value = s.targetAudience || s.target || 'am';
            document.getElementById('survey-new-type').value = s.type || 'exception';
            
            if (s.selectedBranches && s.selectedBranches.length > 0) {
                let selBox = document.getElementById('survey-selected-branches');
                if (selBox) selBox.value = s.selectedBranches.join(', ');
            } else {
                let selBox = document.getElementById('survey-selected-branches');
                if (selBox) selBox.value = '';
            }

            if ((s.type === 'custom' || s.type === 'survey') && s.questions) {
                builderQuestions = JSON.parse(JSON.stringify(s.questions));
            } else {
                builderQuestions = [];
            }
            toggleSurveyTypeUI();
            renderBuilderQuestions();

            let createCard = document.getElementById('survey-new-title');
            if (createCard) createCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            Swal.fire({
                title: 'Format Sedia Untuk Diedit!',
                text: 'Semua soalan & tetapan telah dimuat naik ke kotak cipta di atas. Sila semak/edit dan tekan butang ungu "Publish Survey" apabila selesai.',
                icon: 'success',
                timer: 3500,
                showConfirmButton: true,
                confirmButtonColor: '#8b5cf6'
            });
        }

        function deleteSurvey(id) {
            Swal.fire({
                title: 'Padam Survey?',
                text: "Anda pasti mahu padam survey ini secara kekal? Semua data maklum balas juga akan dipadam.",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#e11d48',
                cancelButtonColor: '#475569',
                confirmButtonText: 'Ya, Padam!',
                cancelButtonText: 'Batal',
                background: '#1e293b',
                color: '#fff'
            }).then(async (result) => {
                if (result.isConfirmed) {
                    showToast('info', 'Sedang memadam data survey...');
                    try {
                        // Immediately remove from UI for instant feedback
                        allSurveys = allSurveys.filter(s => s.id !== id);
                        allResponses = allResponses.filter(r => r.surveyId !== id);
                        updateSurveyUI();
                        
                        // Fast bulk delete in Supabase for all responses belonging to this survey
                        if (typeof sbClient !== 'undefined' && sbClient) {
                            await sbClient.from('survey_responses').delete().eq('surveyId', id);
                        }
                        
                        await db.collection('surveys').doc(id).delete();
                        showToast('success', `Survey dan semua rekod maklum balas berjaya dipadam bersih.`);
                    } catch(e) {
                        console.error(e);
                        showToast('error', 'Error memadam survey: ' + e.message);
                    }
                }
            });
        }

        async function submitCustomSurveyResponse(id) {
            let s = allSurveys.find(x => x.id === id);
            if(!s) return;
            
            let answers = {};
            for (let q of (s.questions || [])) {
                let val = document.getElementById(`sq_${s.id}_${q.id}`).value.trim();
                if(!val) {
                    return showToast('error', `Please provide an answer for: ${q.label}`);
                }
                answers[q.id] = { label: q.label, type: q.type, value: val };
            }
            
            let btn = document.querySelector(`#survey-box-${id} button`);
            let oldHtml = btn ? btn.innerHTML : '';
            if (btn) {
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Menghantar...';
                btn.disabled = true;
            }
            
            try {
                let payload = {
                    surveyId: id,
                    submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    answers: answers,
                    type: 'custom'
                };
                
                if (currentUser.role === 'am') {
                    payload.amName = currentUser.name.trim().toUpperCase();
                    let branchSel = document.getElementById(`sq_branch_${id}`);
                    if (branchSel) {
                        payload.branchCode = branchSel.value;
                        let bInfo = masterBranches.find(b => String(b.code) === branchSel.value);
                        if(bInfo) payload.branchName = bInfo.name;
                    }
                } else if (currentUser.role === 'branch') {
                    payload.branchCode = currentUser.id;
                    payload.branchName = currentUser.name;
                    let bInfo = masterBranches.find(b => String(b.code) === String(currentUser.id));
                    if (bInfo && bInfo.am) {
                        payload.amName = bInfo.am.trim().toUpperCase();
                    }
                }
                await db.collection('survey_responses').add(payload);
                window.isFillingSurveyActive = false;
                triggerLiveSync();
                updateSurveyUI(true, true);
                showToast('success', 'Maklum balas telah direkodkan!');
                let box = document.getElementById(`survey-box-${id}`);
                if (box) {
                    box.innerHTML = '<div class="text-emerald-400 text-sm font-bold py-2"><i class="fa-solid fa-check-circle mr-2"></i>Maklum balas telah direkodkan.</div>';
                    setTimeout(() => { if(box) box.remove(); }, 2000);
                }
            } catch(e) {
                window.isFillingSurveyActive = false;
                showToast('error', 'Error: ' + e.message);
                if (btn) {
                    btn.innerHTML = oldHtml;
                    btn.disabled = false;
                }
            }
        }

        async function submitCustomSurveyResponseAM(id) {
            let s = allSurveys.find(x => x.id === id);
            if(!s) return;
            
            let amName = (currentUser.name || '').trim().toUpperCase();
            let myBranches = filterBranchesForSurvey(masterBranches.filter(b => (b.am || '').trim().toUpperCase() === amName), s);
            let respondedBranches = allResponses.filter(r => r.surveyId === s.id && (r.amName || '').trim().toUpperCase() === amName).map(r => String(r.branchCode));
            let remainingBranches = myBranches.filter(b => !respondedBranches.includes(String(b.code)));
            
            let allPayloads = [];
            
            for (let b of remainingBranches) {
                let answers = {};
                for (let q of (s.questions || [])) {
                    let inputEl = document.getElementById(`sq_${s.id}_${b.code}_${q.id}`);
                    if (!inputEl) continue;
                    let val = inputEl.value.trim();
                    if(val === '') {
                        return showToast('error', `Please fill all boxes for branch ${b.code}. Put 0 if none.`);
                    }
                    answers[q.id] = { label: q.label, type: q.type, value: val };
                }
                
                allPayloads.push({
                    surveyId: id,
                    submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    answers: answers,
                    type: 'custom',
                    surveyType: 'custom',
                    amName: amName,
                    branchCode: String(b.code),
                    branchName: b.name
                });
            }
            
            if (allPayloads.length === 0) return;
            
            let btn = document.querySelector(`#survey-box-${id} button`);
            let oldHtml = btn ? btn.innerHTML : '';
            if (btn) {
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Menghantar...';
                btn.disabled = true;
            }
            
            try {
                let batch = db.batch();
                allPayloads.forEach(p => {
                    let docRef = db.collection('survey_responses').doc();
                    batch.set(docRef, p);
                });
                await batch.commit();
                window.isFillingSurveyActive = false;
                showToast('success', 'Maklum balas semua cawangan direkodkan!');
                let container = document.getElementById('survey-am-list');
                if (container) {
                    container.querySelectorAll('input, select').forEach(el => el.value = '');
                }
                updateSurveyUI(true, true);
            } catch (e) {
                window.isFillingSurveyActive = false;
                console.error(e);
                showToast('error', 'Failed to save feedback.');
                if (btn) {
                    btn.innerHTML = oldHtml;
                    btn.disabled = false;
                }
            }
        }

        async function submitSurveyResponse(id) {
            let count = parseInt(document.getElementById(`survey-exc-${id}`).value) || 0;
            let exceptions = [];
            if(count > 0) {
                let selectedCodes = new Set();
                for(let i=0; i<count; i++) {
                    let sel = document.getElementById(`survey-code-${id}-${i}`);
                    let code = sel.value;
                    let opt = sel.options[sel.selectedIndex];
                    let bname = opt ? opt.getAttribute('data-name') : null;
                    if(!code || !bname) {
                        return showToast('error', 'Please select a valid excluded branch from the list.');
                    }
                    if(selectedCodes.has(code)) {
                        return showToast('error', 'Branch pengecualian tidak boleh berulang.');
                    }
                    selectedCodes.add(code);
                    exceptions.push({ code: code, name: bname });
                }
            }
            
            let btn = document.querySelector(`#survey-box-${id} button`);
            let oldHtml = btn ? btn.innerHTML : '';
            if (btn) {
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Menghantar...';
                btn.disabled = true;
            }

            try {
                await db.collection('survey_responses').add({
                    surveyId: id,
                    amName: currentUser.name.trim().toUpperCase(),
                    submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    exceptionCount: count,
                    exceptions: exceptions
                });
                window.isFillingSurveyActive = false;
                triggerLiveSync();
                updateSurveyUI(true, true);
                showToast('success', 'Terima kasih! Maklum balas berjaya dihantar.');
                let box = document.getElementById(`survey-box-${id}`);
                if (box) {
                    box.innerHTML = '<div class="text-emerald-400 text-sm font-bold py-2"><i class="fa-solid fa-check-circle mr-2"></i>Maklum balas telah direkodkan.</div>';
                }
            } catch(e) {
                window.isFillingSurveyActive = false;
                showToast('error', 'Error: ' + e.message);
                if (btn) {
                    btn.innerHTML = oldHtml;
                    btn.disabled = false;
                }
            }
        }

        function filterSwalTable() {
            let input = document.getElementById('swal-search');
            if(!input) return;
            let filter = input.value.toUpperCase();
            let trs = document.querySelectorAll('#swal-report-table tbody tr');
            trs.forEach(tr => {
                let tdCode = tr.getElementsByTagName("td")[0];
                let tdName = tr.getElementsByTagName("td")[1];
                if (tdCode || tdName) {
                    let txtValue = (tdCode ? tdCode.textContent || tdCode.innerText : "") + " " + (tdName ? tdName.textContent || tdName.innerText : "");
                    if (txtValue.toUpperCase().indexOf(filter) > -1) {
                        tr.style.display = "";
                    } else {
                        tr.style.display = "none";
                    }
                }
            });
        }

        async function confirmAMSurveySubmission(id) {
            if(!currentUser || currentUser.role !== 'am') return;
            let amName = (currentUser.name || '').trim().toUpperCase();
            
            let s = allSurveys.find(x => x.id === id);
            if(!s) return;
            
            let myBranches = filterBranchesForSurvey(masterBranches.filter(b => (b.am || '').trim().toUpperCase() === amName), s);
            let responsesForSurvey = allResponses.filter(r => r.surveyId === s.id);
            let unresponded = myBranches.filter(b => !responsesForSurvey.some(r => String(r.branchCode) === String(b.code)));
            
            if (unresponded.length > 0) {
                let res = await Swal.fire({
                    title: 'Cawangan Belum Lengkap!',
                    html: `Terdapat <b>${unresponded.length}</b> cawangan di bawah anda yang belum mengisi survey ini.<br><br>Adakah anda tetap mahu mengesahkan dan menghantar ke Admin sekarang?`,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Ya, Tetap Sahkan & Hantar',
                    cancelButtonText: 'Batal',
                    confirmButtonColor: '#4f46e5'
                });
                if (!res.isConfirmed) return;
            } else {
                let res = await Swal.fire({
                    title: 'Sahkan & Hantar ke Admin?',
                    text: 'Semua cawangan di bawah anda telah lengkap mengisi survey ini. Sahkan hantaran ke Admin & Operation?',
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Ya, Sahkan & Hantar',
                    cancelButtonText: 'Batal',
                    confirmButtonColor: '#10b981'
                });
                if (!res.isConfirmed) return;
            }
            
            try {
                let list = s.amConfirmations || [];
                if (!list.includes(amName)) {
                    list.push(amName);
                }
                s.amConfirmations = list;
                s.amConfirmTimes = s.amConfirmTimes || {};
                s.amConfirmTimes[amName] = Date.now();
                try { localStorage.setItem(`am_confirm_time_${id}_${amName}`, Date.now()); } catch(e){}
                await db.collection('surveys').doc(id).update({ amConfirmations: list, amConfirmTimes: s.amConfirmTimes });
                try { localStorage.setItem('cached_all_surveys', JSON.stringify(allSurveys)); } catch(e){}
                triggerLiveSync();
                showToast('success', 'Pengesahan AM berjaya dihantar ke Admin! Status anda kini Disahkan.');
                updateSurveyUI(true, true);
                setTimeout(() => updateSurveyUI(true, true), 350);
            } catch(e) {
                showToast('error', 'Ralat menghantar pengesahan: ' + e.message);
            }
        }

        function downloadAMSurveyExcel(id) {
            let s = allSurveys.find(x => x.id === id);
            if (!s || !currentUser) return;
            let amName = (currentUser.name || '').trim().toUpperCase();
            let myBranches = filterBranchesForSurvey(masterBranches.filter(b => (b.am || '').trim().toUpperCase() === amName), s);
            let sResp = allResponses.filter(r => r.surveyId === id);
            let isYesNoAM = (q) => q.type === 'yesno' || (sResp && sResp.some(r => {
                let ansObj = r.answers && r.answers[q.id || q.label || q.text];
                let val = (typeof ansObj === 'object' && ansObj !== null) ? ansObj.value : ansObj;
                return val && String(val).startsWith('Tidak - ');
            }));
            
            let headers = ["Kod Cawangan", "Nama Cawangan", "Area Manager", "Status Hantar"];
            if (s.questions && s.questions.length > 0) {
                s.questions.forEach((q, i) => {
                    headers.push(`Soalan ${i+1}: ${q.label || q.text || q}`);
                    if (isYesNoAM(q)) headers.push(`Sebab / Catatan Soalan ${i+1}`);
                });
            } else {
                headers.push("Pengecualian / Catatan");
            }
            headers.push("Masa Hantar");
            
            let rows = [];
            myBranches.forEach(b => {
                let r = sResp.find(x => String(x.branchCode) === String(b.code));
                let row = [
                    `"${b.code}"`,
                    `"${b.name}"`,
                    `"${amName}"`,
                    r ? '"SUDAH HANTAR"' : '"BELUM HANTAR"'
                ];
                if (s.questions && s.questions.length > 0) {
                    s.questions.forEach(q => {
                        if (r && r.answers) {
                            let ansObj = r.answers[q.id || q.label || q.text];
                            let ans = (typeof ansObj === 'object' && ansObj !== null) ? ansObj.value : ansObj;
                            if (ans === true) ans = "Ya";
                            if (ans === false) ans = "Tidak";
                            if (isYesNoAM(q)) {
                                let mainAns = String(ans || '-');
                                let reasonAns = '-';
                                if (mainAns.startsWith('Tidak - ')) {
                                    reasonAns = mainAns.substring(8).trim();
                                    mainAns = 'Tidak';
                                }
                                row.push(`"${mainAns}"`);
                                row.push(`"${reasonAns}"`);
                            } else {
                                row.push(`"${ans || '-'}"`);
                            }
                        } else {
                            row.push('"-"');
                            if (isYesNoAM(q)) row.push('"-"');
                        }
                    });
                } else {
                    row.push(`"${r ? (r.exceptions || []).join('; ') : '-'}"`);
                }
                let timeStr = '-';
                if (r && r.submittedAt) {
                    let d = r.submittedAt.toDate ? r.submittedAt.toDate() : new Date(r.submittedAt);
                    timeStr = d.toLocaleString('en-GB');
                }
                row.push(`"${timeStr}"`);
                rows.push(row);
            });
            
            let csvContent = "\uFEFF" + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
            let blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            let link = document.createElement("a");
            let url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `Data_Survey_${s.title.replace(/[^a-zA-Z0-9]/g, '_')}_${amName}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToast('success', 'Data file downloaded successfully!');
        }

        async function closeAMSurveyCard(id) {
            let s = allSurveys.find(x => x.id === id);
            if (!s || !currentUser || currentUser.role !== 'am') return;
            let amName = (currentUser.name || '').trim().toUpperCase();
            let res = await Swal.fire({
                title: 'Close & Exit This Survey?',
                text: 'This survey will be closed from your view.',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Yes, Close Now',
                cancelButtonText: 'Cancel',
                confirmButtonColor: '#4f46e5'
            });
            if (!res.isConfirmed) return;
            
            let list = s.amClosed || [];
            if (!list.includes(amName)) {
                list.push(amName);
                s.amClosed = list;
                try {
                    await db.collection('surveys').doc(id).update({ amClosed: list });
                } catch(e) {}
            }
            triggerLiveSync();
            showToast('success', 'Survey closed from your list.');
            updateSurveyUI(true);
        }
        window.confirmAMSurveySubmission = confirmAMSurveySubmission;
        window.downloadAMSurveyExcel = downloadAMSurveyExcel;
        window.closeAMSurveyCard = closeAMSurveyCard;

        function getSurveyAnswerVal(r, q) {
            if (!r || !r.answers || !q) return '-';
            let ansObj = r.answers[q.id] !== undefined ? r.answers[q.id] :
                         (r.answers[q.label] !== undefined ? r.answers[q.label] :
                         (r.answers[q.text] !== undefined ? r.answers[q.text] : undefined));
            if (ansObj === undefined || ansObj === null) return '-';
            let val = (typeof ansObj === 'object' && ansObj !== null) ? ansObj.value : ansObj;
            if (val === true) return 'Ya';
            if (val === false) return 'Tidak';
            return (val !== undefined && val !== null && val !== '') ? String(val) : '-';
        }
        window.getSurveyAnswerVal = getSurveyAnswerVal;

        async function viewSurveyReport(id, silent = false) {
            let curSearch = '';
            let activeTab = 'maklum';
            if (silent && typeof Swal !== 'undefined' && typeof Swal.isVisible === 'function' && Swal.isVisible()) {
                let searchEl = document.getElementById('swal-search');
                if (searchEl) curSearch = searchEl.value;
                let tabAm = document.getElementById('tab-am-status');
                if (tabAm && !tabAm.classList.contains('hidden')) activeTab = 'am';
            } else {
                Swal.fire({ title: 'Memuat data maklum balas...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
            }
            window._currentOpenReportSurveyId = id;
            let s = allSurveys.find(x => x.id === id);
            if(!s) return;
            
            let sResp = [];
            try {
                let snap = await db.collection('survey_responses').where('surveyId', '==', id).get();
                sResp = snap.docs.map(d => ({id: d.id, ...d.data()}));
                if (!silent) Swal.close();
            } catch(e) {
                if (!silent) Swal.close();
                console.error(e);
                sResp = allResponses.filter(x => x.surveyId === id);
            }
            
            if (s.type === 'custom') {
                let isYesNoReport = (q) => q.type === 'yesno' || (sResp && sResp.some(r => {
                    let val = getSurveyAnswerVal(r, q);
                    return val && String(val).startsWith('Tidak');
                }));
                let totalCols = 5;
                let theads = `<th class="p-2 border border-slate-700 whitespace-nowrap">Kod</th>`;
                theads += `<th class="p-2 border border-slate-700 whitespace-nowrap">Branch</th>`;
                theads += `<th class="p-2 border border-slate-700 whitespace-nowrap">AM</th>`;
                theads += `<th class="p-2 border border-slate-700 whitespace-nowrap text-center">Status AM</th>`;
                totalCols += 1;
                (s.questions || []).forEach(q => {
                    theads += `<th class="p-2 border border-slate-700 whitespace-nowrap">${q.label}</th>`;
                    totalCols++;
                    if (isYesNoReport(q)) {
                        theads += `<th class="p-2 border border-slate-700 whitespace-nowrap text-amber-300">Reason (If No)</th>`;
                        totalCols++;
                    }
                });
                theads += `<th class="p-2 border border-slate-700 whitespace-nowrap">Time</th>`;
                theads += `<th class="p-2 border border-slate-700 text-center whitespace-nowrap">Action</th>`;
                
                let tbodys = '';
                sResp.forEach(r => {
                    let code = r.branchCode || '';
                    let bName = r.branchName || '';
                    let am = r.amName || '';
                    if (!am && code) {
                        let bInfo = masterBranches.find(b => String(b.code) === String(code));
                        if(bInfo) am = bInfo.am;
                    }
                    if (!bName && code) {
                        let bInfo = masterBranches.find(b => String(b.code) === String(code));
                        if(bInfo) bName = bInfo.name;
                    }
                    
                    let isAmConfirmed = isAMSurveyConfirmed(s, am);
                    let badgeAM = isAmConfirmed
                        ? `<span class="bg-emerald-950 border border-emerald-800 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-bold"><i class="fa-solid fa-check mr-1"></i>YES</span>`
                        : `<span class="bg-rose-950 border border-rose-800 text-rose-400 px-2 py-0.5 rounded text-[10px] font-bold">NO</span>`;

                    let dateStr = formatSafeDate(r.submittedAt);
                    tbodys += `<tr class="border-b border-slate-800">`;
                    tbodys += `<td class="p-2 border-r border-slate-700 font-bold text-emerald-400">${code}</td>`;
                    tbodys += `<td class="p-2 border-r border-slate-700">${bName}</td>`;
                    tbodys += `<td class="p-2 border-r border-slate-700 font-bold">${am}</td>`;
                    tbodys += `<td class="p-2 border-r border-slate-700 text-center">${badgeAM}</td>`;
                    (s.questions || []).forEach(q => {
                        let ans = getSurveyAnswerVal(r, q);
                        if (isYesNoReport(q)) {
                            let mainAns = ans;
                            let reasonAns = '-';
                            if (ans.startsWith('Tidak - ')) {
                                mainAns = 'Tidak';
                                reasonAns = ans.substring(8).trim();
                            } else if (ans === 'Tidak') {
                                mainAns = 'Tidak';
                                reasonAns = '-';
                            }
                            tbodys += `<td class="p-2 border-r border-slate-700 text-center">${mainAns}</td>`;
                            tbodys += `<td class="p-2 border-r border-slate-700 text-center text-amber-300 font-semibold">${reasonAns}</td>`;
                        } else {
                            tbodys += `<td class="p-2 border-r border-slate-700 text-center">${ans}</td>`;
                        }
                    });
                    tbodys += `<td class="p-2 border-r border-slate-700 text-[10px] text-slate-400">${dateStr}</td>`;
                    tbodys += `<td class="p-2 text-center"><button onclick="deleteSurveyResponse('${r.id}', '${id}')" class="text-rose-400 hover:text-rose-300" title="Reset/Padam"><i class="fa-solid fa-trash"></i></button></td></tr>`;
                });
                
                if(sResp.length === 0) {
                    tbodys = `<tr><td colspan="${totalCols}" class="p-4 text-center text-slate-400">No feedback submitted yet.</td></tr>`;
                }
                
                let amStatusMap = {};
                getActiveAMs().forEach(am => {
                    amStatusMap[am] = { total: 0, submitted: 0 };
                });
                
                masterBranches.forEach(b => {
                    if (s.selectedBranches && s.selectedBranches.length > 0 && !s.selectedBranches.includes(String(b.code)) && !s.selectedBranches.includes(Number(b.code))) return;
                    let am = (b.am || '').trim().toUpperCase();
                    if(amStatusMap[am]) {
                        amStatusMap[am].total++;
                        let hasResponded = sResp.some(r => String(r.branchCode) === String(b.code));
                        if(hasResponded) amStatusMap[am].submitted++;
                    }
                });
                
                let missingAMsHtml = '';
                let totalAMCount = 0;
                let pendingAMCount = 0;
                Object.keys(amStatusMap).sort().forEach(am => {
                    let d = amStatusMap[am];
                    if (d.total === 0) return;
                    totalAMCount++;
                    let isAmConfirmed = isAMSurveyConfirmed(s, am);
                    if (!isAmConfirmed) {
                        pendingAMCount++;
                        missingAMsHtml += `<tr class="border-b border-slate-800 hover:bg-slate-800/30">
                            <td class="p-2 border-r border-slate-700 font-bold">${am}</td>
                            <td class="p-2 border-r border-slate-700 text-center text-rose-400 font-bold">${d.submitted} / ${d.total} branches filled (Not Confirmed)</td>
                        </tr>`;
                    }
                });
                if (missingAMsHtml === '') {
                    missingAMsHtml = `<tr><td colspan="2" class="p-4 text-center text-emerald-400 font-bold"><i class="fa-solid fa-check-circle mr-1"></i>All AMs have confirmed and submitted!</td></tr>`;
                }

                let customHtml = `
                        <div class="text-left space-y-4">
                            <div class="bg-slate-900 p-3 rounded-lg border border-slate-700">
                                <div class="text-[10px] text-slate-400 uppercase font-black tracking-wider mb-1">Survey Question</div>
                                <div class="text-sm text-cyan-400 font-bold">${s.title}</div>
                            </div>
                            
                            <div class="flex border-b border-slate-700">
                                <button onclick="document.getElementById('tab-maklum-balas').classList.remove('hidden'); document.getElementById('tab-am-status').classList.add('hidden'); this.classList.add('text-indigo-400', 'border-indigo-400'); this.classList.remove('text-slate-400', 'border-transparent'); document.getElementById('btn-tab-am').classList.remove('text-indigo-400', 'border-indigo-400'); document.getElementById('btn-tab-am').classList.add('text-slate-400', 'border-transparent');" id="btn-tab-maklum" class="px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 text-indigo-400 border-indigo-400 transition-colors focus:outline-none">Feedback Data</button>
                                <button onclick="document.getElementById('tab-am-status').classList.remove('hidden'); document.getElementById('tab-maklum-balas').classList.add('hidden'); this.classList.add('text-indigo-400', 'border-indigo-400'); this.classList.remove('text-slate-400', 'border-transparent'); document.getElementById('btn-tab-maklum').classList.remove('text-indigo-400', 'border-indigo-400'); document.getElementById('btn-tab-maklum').classList.add('text-slate-400', 'border-transparent');" id="btn-tab-am" class="px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 text-slate-400 border-transparent transition-colors focus:outline-none">AM Status (${pendingAMCount}/${totalAMCount} Pending)</button>
                            </div>
                            
                            <div id="tab-maklum-balas">
                                <div class="flex justify-between items-center mb-2">
                                    <div class="text-xs text-purple-400 uppercase font-bold tracking-wider"><i class="fa-solid fa-list-ul mr-1"></i> Data Semasa</div>
                                    <div class="flex gap-2">
                                        <input type="text" id="swal-search" oninput="filterSwalTable()" class="bg-slate-950 border border-slate-700 outline-none focus:border-indigo-500 rounded px-2 py-1 text-[10px] text-white placeholder-slate-500 w-32" placeholder="Cari cawangan...">
                                        <button onclick="downloadSurveyExcel('${id}')" class="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold py-1 px-3 rounded-md shadow-lg transition-colors"><i class="fa-solid fa-file-excel mr-1"></i> CSV</button>
                                    </div>
                                </div>
                                <div class="bg-slate-950 rounded-lg max-h-80 overflow-auto border border-slate-800 shadow-inner">
                                    <table id="swal-report-table" class="w-full text-xs text-white text-left whitespace-nowrap">
                                        <thead class="bg-slate-800 sticky top-0"><tr>${theads}</tr></thead>
                                        <tbody>${tbodys}</tbody>
                                    </table>
                                </div>
                            </div>
                            
                            <div id="tab-am-status" class="hidden">
                                <div class="text-xs text-rose-400 uppercase font-bold tracking-wider mb-2"><i class="fa-solid fa-users mr-1"></i> AM List (With Pending Branches)</div>
                                <div class="bg-slate-950 rounded-lg max-h-80 overflow-auto border border-slate-800 shadow-inner">
                                    <table class="w-full text-xs text-white text-left whitespace-nowrap">
                                        <thead class="bg-slate-800 sticky top-0">
                                            <tr>
                                                <th class="p-2 border border-slate-700 whitespace-nowrap">AM Name</th>
                                                <th class="p-2 border border-slate-700 whitespace-nowrap text-center">Pending Submission</th>
                                            </tr>
                                        </thead>
                                        <tbody>${missingAMsHtml}</tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                `;
                if (silent && typeof Swal !== 'undefined' && typeof Swal.isVisible === 'function' && Swal.isVisible() && Swal.getHtmlContainer()) {
                    Swal.getHtmlContainer().innerHTML = customHtml;
                    let searchEl = document.getElementById('swal-search');
                    if (searchEl && curSearch) {
                        searchEl.value = curSearch;
                        if (typeof filterSwalTable === 'function') filterSwalTable();
                    }
                    if (activeTab === 'am') {
                        let btnAm = document.getElementById('btn-tab-am');
                        if (btnAm) btnAm.click();
                    }
                } else {
                    Swal.fire({
                        title: '<span class="text-lg">Custom Survey Report</span>',
                        html: customHtml,
                        width: '800px',
                        background: '#0f172a',
                        color: '#fff',
                        showConfirmButton: false,
                        showCloseButton: true,
                        didClose: () => { if (window._currentOpenReportSurveyId === id) window._currentOpenReportSurveyId = null; }
                    });
                }
                return;
            }

            let ams = getActiveAMs();
            if (s.selectedBranches && s.selectedBranches.length > 0) {
                ams = ams.filter(a => masterBranches.some(b => (b.am || '').trim().toUpperCase() === a && (s.selectedBranches.includes(String(b.code)) || s.selectedBranches.includes(Number(b.code)))));
            }
            
            let submittedAMs = [...new Set(sResp.map(r => r.amName))].sort();
            let missingAMs = ams.filter(a => !submittedAMs.includes(a)).sort();
            
            let exHtml = '';
            let totalExceptions = 0;
            sResp.forEach(r => {
                if(r.exceptionCount > 0 && r.exceptions) {
                    totalExceptions += r.exceptionCount;
                    r.exceptions.forEach(ex => {
                        exHtml += `<div class="text-xs text-slate-300 py-1.5 border-b border-slate-800"><span class="font-bold text-rose-400 mr-2">[${ex.code}]</span> ${ex.name} <span class="text-slate-500 float-right text-[10px] bg-slate-950 px-2 py-0.5 rounded">${r.amName}</span></div>`;
                    });
                }
            });
            
            if(exHtml === '') exHtml = '<div class="text-emerald-400 text-xs font-bold py-4 text-center">No pending branches! All Ok.</div>';
            
            let submittedHtml = submittedAMs.map(a => `<span class="bg-emerald-950 border border-emerald-900 text-emerald-400 px-2 py-0.5 rounded text-[10px] mr-1 mb-1 font-bold inline-block">${a}</span>`).join('');
            if(submittedHtml === '') submittedHtml = '<span class="text-slate-500 font-bold text-xs">No feedback submitted yet.</span>';

            let missingHtml = missingAMs.map(a => `<span class="bg-rose-950 border border-rose-900 text-rose-400 px-2 py-0.5 rounded text-[10px] mr-1 mb-1 font-bold inline-block">${a}</span>`).join('');
            if(missingHtml === '') missingHtml = '<span class="text-emerald-400 font-bold text-xs"><i class="fa-solid fa-check-double mr-1"></i> All AMs have submitted feedback!</span>';
            
            let fullHtml = `
                    <div class="text-left space-y-5">
                        <div class="bg-slate-900 p-3 rounded-lg border border-slate-700">
                            <div class="text-[10px] text-slate-400 uppercase font-black tracking-wider mb-1">Survey Question</div>
                            <div class="text-sm text-cyan-400 font-bold">${s.title}</div>
                        </div>
                        <div>
                            <div class="text-xs text-emerald-400 uppercase font-bold mb-2 tracking-wider"><i class="fa-solid fa-user-check mr-1"></i> Submitted Feedback (${submittedAMs.length})</div>
                            <div class="p-2 bg-slate-900 rounded-lg border border-slate-800">${submittedHtml}</div>
                        </div>
                        <div>
                            <div class="text-xs text-rose-400 uppercase font-bold mb-2 tracking-wider"><i class="fa-solid fa-user-xmark mr-1"></i> Pending Feedback (${missingAMs.length})</div>
                            <div class="p-2 bg-slate-900 rounded-lg border border-slate-800">${missingHtml}</div>
                        </div>
                        <div>
                            <div class="flex justify-between items-center mb-2">
                                <div class="text-xs text-purple-400 uppercase font-bold tracking-wider"><i class="fa-solid fa-list-ul mr-1"></i> Exception Branch List (${totalExceptions})</div>
                                <button onclick="downloadSurveyExcel('${id}')" class="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold py-1 px-3 rounded-md shadow-lg transition-colors"><i class="fa-solid fa-file-excel mr-1"></i> Download CSV</button>
                            </div>
                            <div class="bg-slate-950 p-3 rounded-lg max-h-60 overflow-y-auto border border-slate-800 shadow-inner">${exHtml}</div>
                        </div>
                    </div>
            `;
            if (silent && typeof Swal !== 'undefined' && typeof Swal.isVisible === 'function' && Swal.isVisible() && Swal.getHtmlContainer()) {
                    Swal.getHtmlContainer().innerHTML = fullHtml;
                    let searchEl = document.getElementById('swal-search');
                    if (searchEl && curSearch) {
                        searchEl.value = curSearch;
                        if (typeof filterSwalTable === 'function') filterSwalTable();
                    }
                    if (activeTab === 'am') {
                        let btnAm = document.getElementById('btn-tab-am');
                        if (btnAm) btnAm.click();
                    }
                } else {
                    Swal.fire({
                        title: '<span class="text-lg">Custom Survey Report</span>',
                        html: fullHtml,
                        background: '#0f172a',
                        color: '#fff',
                        width: '600px',
                        showConfirmButton: false,
                        showCloseButton: true,
                        didClose: () => { if (window._currentOpenReportSurveyId === id) window._currentOpenReportSurveyId = null; }
                    });
                }
        }

        async function deleteSurveyResponse(responseId, surveyId) {
            Swal.fire({
                title: 'Delete Branch Data?',
                text: 'This branch data will be removed and AM verification status changed back to Unverified so the branch (or AM) must resubmit.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#64748b',
                confirmButtonText: 'Yes, Delete',
                cancelButtonText: 'Cancel'
            }).then(async (result) => {
                if(result.isConfirmed) {
                    try {
                        let targetResp = allResponses.find(r => r.id === responseId);
                        if (!targetResp) {
                            try {
                                let docSnap = await db.collection('survey_responses').doc(responseId).get();
                                if (docSnap && docSnap.data) targetResp = docSnap.data();
                            } catch(err){}
                        }

                        await db.collection('survey_responses').doc(responseId).delete();
                        allResponses = allResponses.filter(r => r.id !== responseId);

                        if (targetResp) {
                            let amName = (targetResp.amName || '').trim().toUpperCase();
                            if (!amName && targetResp.branchCode) {
                                let bInfo = masterBranches.find(b => String(b.code) === String(targetResp.branchCode));
                                if (bInfo) amName = (bInfo.am || '').trim().toUpperCase();
                            }
                            if (amName && amName !== 'N/A' && amName !== 'UNKNOWN') {
                                let s = allSurveys.find(x => x.id === surveyId);
                                if (!s) {
                                    try {
                                        let sSnap = await db.collection('surveys').doc(surveyId).get();
                                        if (sSnap && sSnap.data) s = { id: sSnap.id, ...sSnap.data() };
                                    } catch(err){}
                                }
                                if (s) {
                                    let list = (s.amConfirmations || []).filter(x => x !== amName);
                                    let closed = (s.amClosed || []).filter(x => x !== amName);
                                    s.amConfirmations = list;
                                    s.amClosed = closed;
                                    if (s.amConfirmTimes && s.amConfirmTimes[amName]) delete s.amConfirmTimes[amName];
                                    try {
                                        await db.collection('surveys').doc(surveyId).update({
                                            amConfirmations: list,
                                            amClosed: closed,
                                            amConfirmTimes: s.amConfirmTimes || {}
                                        });
                                    } catch(err) { console.error("Failed to revoke AM confirmation:", err); }
                                }
                            }
                        }

                        showToast('success', 'Branch data deleted & AM status changed to Unverified.');
                        triggerLiveSync();

                        if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'operation') && typeof Swal !== 'undefined' && typeof Swal.isVisible === 'function' && Swal.isVisible()) {
                            setTimeout(() => viewSurveyReport(surveyId), 300);
                        } else {
                            updateSurveyUI(true, true);
                            setTimeout(() => updateSurveyUI(true, true), 350);
                        }
                    } catch(e) {
                        console.error("Delete response error:", e);
                        showToast('error', 'Failed to delete data.');
                    }
                }
            });
        }

        async function downloadSurveyExcel(id) {
            let s = allSurveys.find(x => x.id === id);
            
            Swal.fire({ title: 'Memuat data maklum balas...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
            let sResp = [];
            try {
                let snap = await db.collection('survey_responses').where('surveyId', '==', id).get();
                sResp = snap.docs.map(d => ({id: d.id, ...d.data()}));
                Swal.close();
            } catch(e) {
                Swal.close();
                console.error(e);
                sResp = allResponses.filter(x => x.surveyId === id);
            }
            let csv = '';
            
            if (s.type === 'custom') {
                let isYesNoExport = (q) => q.type === 'yesno' || (sResp && sResp.some(r => {
                    let val = getSurveyAnswerVal(r, q);
                    return val && String(val).startsWith('Tidak');
                }));
                let headers = ['CODE', 'BRANCH NAME', 'AREA MANAGER'];
                (s.questions || []).forEach(q => {
                    headers.push(q.label);
                    if (isYesNoExport(q)) headers.push('REASON (IF NO)');
                });
                csv += headers.map(h => '"' + h.replace(/"/g, '""') + '"').join(',') + '\n';
                
                sResp.forEach(r => {
                    let code = r.branchCode || '';
                    let bName = r.branchName || '';
                    let am = r.amName || '';
                    if (!am && code) {
                        let bInfo = masterBranches.find(b => String(b.code) === String(code));
                        if(bInfo) am = bInfo.am;
                    }
                    if (!bName && code) {
                        let bInfo = masterBranches.find(b => String(b.code) === String(code));
                        if(bInfo) bName = bInfo.name;
                    }
                    
                    let row = ['"'+code+'"', '"'+bName.replace(/"/g, '""')+'"', '"'+am.replace(/"/g, '""')+'"'];
                    (s.questions || []).forEach(q => {
                        let ans = getSurveyAnswerVal(r, q);
                        if (isYesNoExport(q)) {
                            let mainAns = ans;
                            let reasonAns = '-';
                            if (ans.startsWith('Tidak - ')) {
                                mainAns = 'Tidak';
                                reasonAns = ans.substring(8).trim();
                            } else if (ans === 'Tidak') {
                                mainAns = 'Tidak';
                                reasonAns = '-';
                            }
                            row.push('"' + mainAns.replace(/"/g, '""') + '"');
                            row.push('"' + reasonAns.replace(/"/g, '""') + '"');
                        } else {
                            row.push('"' + ans.replace(/"/g, '""') + '"');
                        }
                    });
                    csv += row.join(',') + '\n';
                });
            } else {
                csv = 'Survey Question,AM Name,Submitted At,Exception Branch Code,Exception Branch Name\n';
                sResp.forEach(r => {
                    let dateStr = formatSafeDate(r.submittedAt);
                    let title = '"' + s.title.replace(/"/g, '""') + '"';
                    let amName = '"' + r.amName.replace(/"/g, '""') + '"';
                    let dateEsc = '"' + dateStr + '"';
                    
                    if (r.exceptionCount === 0 || !r.exceptions || r.exceptions.length === 0) {
                        csv += title + ',' + amName + ',' + dateEsc + ',NO EXCEPTION,-\n';
                    } else {
                        r.exceptions.forEach(ex => {
                            let code = '"' + ex.code + '"';
                            let name = '"' + ex.name.replace(/"/g, '""') + '"';
                            csv += title + ',' + amName + ',' + dateEsc + ',' + code + ',' + name + '\n';
                        });
                    }
                });
            }
            
            let blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            let link = document.createElement("a");
            let url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", "Survey_Report_" + id + ".csv");
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        async function aggregateAllData() {
            if (!currentUser || currentUser.role !== 'admin') {
                alert("Fungsi ini adalah khas untuk Admin sahaja.");
                return;
            }
            const { value: targetMonth } = await Swal.fire({
                title: 'Recalculate Monthly Data',
                input: 'month',
                inputLabel: 'Select month to recalculate',
                inputValue: todayStr.substring(0, 7),
                showCancelButton: true,
                confirmButtonText: 'Recalculate & Clean Data',
                cancelButtonText: 'Cancel',
                inputValidator: (value) => {
                    if (!value) return 'You must select a month!';
                }
            });

            if (!targetMonth) return;

            let confirmResult = await Swal.fire({
                title: 'Total Cleanup Warning!',
                text: `This will DELETE existing summary for month ${targetMonth} and recalculate from daily tables (Clean Sweep). Continue?`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#3085d6',
                cancelButtonColor: '#d33',
                confirmButtonText: 'Yes, Clean & Recalculate',
                cancelButtonText: 'Cancel'
            });
            if (!confirmResult.isConfirmed) return;
            
            setSyncing(true);
            Swal.fire({ title: 'Processing...', text: `Downloading daily data for ${targetMonth}...`, allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});
            try {
                let docs = await fetchSubmissionsChunked(targetMonth, null, true);
                Swal.fire({ title: 'Organizing Data', text: `Found ${docs.length} records. Deleting old summary & recalculating new summary...`, allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});
                
                let rawList = [];
                docs.forEach(doc => {
                    let d = typeof doc.data === 'function' ? doc.data() : (() => {
                        let out = Object.assign({}, doc.data || {});
                        for (let k in doc) {
                            if (k !== 'data' && doc[k] !== null && doc[k] !== undefined) {
                                out[k] = doc[k];
                            }
                        }
                        return out;
                    })();
                    if (d && d.date && d.code) rawList.push(d);
                });
                let cleanList = deduplicateSubmissionsList(rawList);
                
                let summaries = {}; // key: docId -> updateObj
                
                cleanList.forEach(d => {
                    let monthStr = d.date.substring(0, 7);
                    let [sy, sm, sd] = d.date.split('-').map(Number);
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

                    let cTrim = String(d.code).trim();
                    let cNum = !isNaN(Number(cTrim)) ? Number(cTrim) : null;
                    let cPad = /^\d+$/.test(cTrim) ? cTrim.padStart(4, '0') : cTrim;
                    let mb = masterBranches && masterBranches.find(x => String(x.code).trim() === cTrim || (cNum !== null && Number(x.code) === cNum) || String(x.code).trim() === cPad);
                    let bAm = mb && mb.am ? String(mb.am).trim().toUpperCase() : (d.am || "UNASSIGNED").trim().toUpperCase();
                    let bName = mb && mb.name ? mb.name : (d.name || cTrim);
                    let amKey = bAm.replace(/\//g, '-'); 
                    let docId = monthStr + "_" + amKey;
                    
                    if(!summaries[docId]) {
                        summaries[docId] = { branches: {}, am: bAm, month: monthStr };
                    }
                    if(!summaries[docId].branches[cTrim]) {
                        summaries[docId].branches[cTrim] = { totalSales: 0, totalLorry: 0, weeksCount: {}, daily: {}, am: bAm, name: bName };
                    }
                    
                    let s = parseFloat(d.sales) || 0;
                    let l = parseFloat(d.lorry) || 0;
                    let m = parseFloat(d.mykasih) || 0;
                    let t = parseInt(d.transactions) || 0;
                    let b1 = parseFloat(d.bank1) || 0;
                    let b2 = parseFloat(d.bank2) || 0;
                    
                    summaries[docId].branches[cTrim].totalSales += s;
                    summaries[docId].branches[cTrim].totalLorry += l;
                    if(l > 0 && weekLabel) {
                        if(!summaries[docId].branches[cTrim].weeksCount[weekLabel]) summaries[docId].branches[cTrim].weeksCount[weekLabel] = 0;
                        summaries[docId].branches[cTrim].weeksCount[weekLabel] += 1;
                    }
                    
                    if(!summaries[docId].branches[cTrim].daily[dayStr]) {
                        summaries[docId].branches[cTrim].daily[dayStr] = { s: 0, l: 0, m: 0, t: 0, b1: 0, b2: 0 };
                    }
                    summaries[docId].branches[cTrim].daily[dayStr].s += s;
                    summaries[docId].branches[cTrim].daily[dayStr].l += l;
                    summaries[docId].branches[cTrim].daily[dayStr].m += m;
                    summaries[docId].branches[cTrim].daily[dayStr].t += t;
                    summaries[docId].branches[cTrim].daily[dayStr].b1 += b1;
                    summaries[docId].branches[cTrim].daily[dayStr].b2 += b2;
                });
                
                Swal.fire({ title: 'Deleting & Saving', text: 'Cleaning old records & saving new data...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});
                
                // Delete existing monthly_summaries for this month using Promise.all to bypass batch limits
                let existingSummaries = await db.collection("monthly_summaries").where(firebase.firestore.FieldPath.documentId(), ">=", targetMonth + "_").where(firebase.firestore.FieldPath.documentId(), "<=", targetMonth + "_\uf8ff").get();
                let delPromises = [];
                existingSummaries.docs.forEach(dDoc => {
                    delPromises.push(dDoc.ref.delete());
                });
                for (let i = 0; i < delPromises.length; i += 50) {
                    await Promise.all(delPromises.slice(i, i + 50));
                }
                
                // Write new summaries using Promise.all
                let docIds = Object.keys(summaries);
                let setPromises = [];
                docIds.forEach(id => {
                    let ref = db.collection("monthly_summaries").doc(id);
                    setPromises.push(ref.set(summaries[id]));
                });
                for (let i = 0; i < setPromises.length; i += 50) {
                    await Promise.all(setPromises.slice(i, i + 50));
                }
                
                // Reload page to fetch the newly generated summaries
                window.location.reload();
                
                setSyncing(false);
                Swal.fire('Success!', 'All data has been successfully calculated and saved!', 'success');
            } catch(e) {
                console.error(e);
                setSyncing(false);
                Swal.fire('Error', 'Process failed: ' + e.message, 'error');
            }
        }

        // ================= TARGET TRACKER LOGIC =================
        function initTargetTracker() {
            let mSelect = document.getElementById('target-month-select');
            if(!mSelect) return;
            mSelect.innerHTML = '';
            let date = new Date();
            for(let i=0; i<6; i++) {
                let d = new Date(date.getFullYear(), date.getMonth()-i, 1);
                let mStr = d.getFullYear() + '-' + ((d.getMonth()+1)<10?'0':'')+(d.getMonth()+1);
                let lbl = d.toLocaleString('en-US', {month: 'long', year: 'numeric'});
                mSelect.innerHTML += `<option value="${mStr}">${lbl}</option>`;
            }
            if (currentUser && currentUser.role === 'admin') {
                let amFilter = document.getElementById('target-am-filter');
                if (amFilter) {
                    amFilter.innerHTML = '<option value="">All Area Managers</option>';
                    let ams = [...new Set(masterBranches.filter(b=>b.am).map(b=>b.am))].sort();
                    ams.forEach(am => {
                        amFilter.innerHTML += `<option value="${am}">${am}</option>`;
                    });
                }
            }
        }

        async function loadTargetTracker(force = false) {
            if (!force && document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('target-input')) {
                return;
            }
            let mEl = document.getElementById('target-month-select');
            if(!mEl) return;
            let month = mEl.value;
            let amEl = document.getElementById('target-am-filter');
            let isAdminOrOp = currentUser.role === 'admin' || currentUser.role === 'operation';
            let amFilter = isAdminOrOp && amEl ? amEl.value : currentUser.name;
            let tbody = document.getElementById('target-table-body');
            
            if(tbody && (!tbody.children.length || force || tbody.getAttribute('data-month') !== month || tbody.getAttribute('data-am') !== String(amFilter))) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-slate-500"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Loading step 1...</td></tr>';
            }
            
            try {
                let branches = getManagerFilteredBranches();
                let allowedCodes = new Set(branches.map(b => String(b.code)));

                if(tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-slate-500"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Loading step 2 (targets)...</td></tr>';
                let targetSnap;
                try {
                    targetSnap = await db.collection('targets').where('month', '==', month).get();
                } catch(e) {
                    console.error("Query targets failed", e);
                    throw new Error("Gagal tarik database targets: " + e.message);
                }

                let targets = {};
                if (targetSnap && targetSnap.docs) {
                    targetSnap.docs.forEach(d => {
                        let tData = d.data();
                        let tVal = tData.target_sales !== undefined ? tData.target_sales : (tData.target !== undefined ? tData.target : 0);
                        let cTrim = String(tData.code || '').trim();
                        let cNum = !isNaN(Number(cTrim)) ? Number(cTrim) : cTrim;
                        let cPad = /^\d+$/.test(cTrim) ? cTrim.padStart(4, '0') : cTrim;
                        if (allowedCodes.has(cTrim) || allowedCodes.has(String(cNum)) || allowedCodes.has(cPad)) {
                            targets[cTrim] = tVal;
                            targets[cNum] = tVal;
                            targets[cPad] = tVal;
                        }
                    });
                }

                if(tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-slate-500"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Loading step 3 (sales)...</td></tr>';
                let currentSales = {};
                try {
                    let combinedDocs = await fetchSubmissionsChunked(month, (amFilter && amFilter !== 'Semua') ? amFilter : null);
                    combinedDocs.forEach(doc => {
                        let d = doc.data();
                        if (d && d.code && d.date && d.date.startsWith(month) && allowedCodes.has(String(d.code))) {
                            let c = String(d.code);
                            currentSales[c] = (currentSales[c] || 0) + (parseFloat(d.sales) || 0);
                        }
                    });
                } catch(e) {
                    console.error("Error loading submissions for target tracker:", e);
                }
                branches.forEach(b => {
                    let subSales = 0;
                    dbSubmissions.forEach(sub => {
                        if (String(sub.code) === String(b.code) && sub.date && sub.date.startsWith(month)) {
                            subSales += (parseFloat(sub.sales) || 0);
                        }
                    });
                    if (subSales > (currentSales[b.code] || 0)) {
                        currentSales[b.code] = subSales;
                    }
                });

                if(tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-slate-500"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Loading step 4 (render)...</td></tr>';

                let today = new Date();
                let isCurrentMonth = (today.getFullYear() + '-' + ((today.getMonth()+1)<10?'0':'')+(today.getMonth()+1)) === month;
                let daysInMonth = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
                let remainingDays = isCurrentMonth ? (daysInMonth - today.getDate() + 1) : 0;

                let htmlStr = '';
                let tTarget = 0, tSales = 0, noTarget = 0;

                branches.sort((a,b)=>String(a.code).localeCompare(String(b.code))).forEach(b => {
                    let cTrim = String(b.code).trim();
                    let cNum = !isNaN(Number(cTrim)) ? Number(cTrim) : cTrim;
                    let cPad = /^\d+$/.test(cTrim) ? cTrim.padStart(4, '0') : cTrim;
                    let target = targets[cTrim] !== undefined ? targets[cTrim] : (targets[cNum] !== undefined ? targets[cNum] : (targets[cPad] !== undefined ? targets[cPad] : 0));
                    let sales = currentSales[b.code] || currentSales[cTrim] || currentSales[cNum] || currentSales[cPad] || 0;
                    let pct = target > 0 ? ((sales/target)*100).toFixed(1) : 0;
                    let required = target - sales;
                    let reqPerDay = (required > 0 && remainingDays > 0) ? (required / remainingDays) : 0;
                    
                    tTarget += target;
                    if(target > 0) tSales += sales;
                    if(target == 0) noTarget++;

                    let canEditTarget = (currentUser && (currentUser.role === 'admin' || currentUser.role === 'operation' || currentUser.role === 'am'));
                    let targetInput = canEditTarget
                        ? `<input type="text" class="target-input bg-slate-900 border border-slate-700 rounded px-2 py-1 w-full text-white outline-none focus:border-pink-500" data-code="${b.code}" data-original="${target ? Number(target).toString() : ''}" value="${target ? Number(target).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : ''}" placeholder="Target RM" oninput="let p=this.value.replace(/[^0-9.]/g,'').split('.'); this.value=p[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g,',')+(p.length>1?'.'+p.slice(1).join(''):'');">`
                        : `<span class="font-bold text-pink-400">RM ${formatRM(target)}</span>`;

                    htmlStr += `
                        <tr class="hover:bg-slate-800/50 transition-colors">
                            <td class="py-3 px-4 text-xs font-bold text-slate-400">${b.code}</td>
                            <td class="py-3 px-4">
                                <div class="font-bold text-white">${b.name}</div>
                                <div class="text-[10px] text-slate-500">${b.am}</div>
                            </td>
                            <td class="py-3 px-4 bg-pink-950/20">${targetInput}</td>
                            <td class="py-3 px-4 text-right font-bold text-emerald-400">RM ${formatRM(sales)}</td>
                            <td class="py-3 px-4">
                                <div class="w-full bg-slate-800 rounded-full h-2.5 mt-1 relative overflow-hidden">
                                    <div class="bg-gradient-to-r ${pct >= 100 ? 'from-emerald-500 to-emerald-400' : 'from-pink-600 to-pink-400'} h-2.5 rounded-full" style="width: ${Math.min(pct, 100)}%"></div>
                                </div>
                                <div class="text-[10px] text-center mt-1 font-bold ${pct >= 100 ? 'text-emerald-400' : 'text-slate-400'}">${pct}%</div>
                            </td>
                            <td class="py-3 px-4 text-right">
                                <div class="font-bold text-rose-400">${reqPerDay > 0 ? 'RM '+formatRM(reqPerDay) : (pct>=100 ? '<i class="fa-solid fa-check text-emerald-500"></i>' : '-')}</div>
                            </td>
                        </tr>
                    `;
                });

                if(branches.length === 0) htmlStr = '<tr><td colspan="6" class="text-center py-8 text-slate-500">No branches found.</td></tr>';
                if(tbody) {
                    tbody.innerHTML = htmlStr;
                    tbody.setAttribute('data-month', month);
                    tbody.setAttribute('data-am', String(amFilter));
                }
                if (typeof applyRoleVisibilities === 'function') applyRoleVisibilities();

                if(isAdminOrOp || (currentUser && currentUser.role === 'am')) {
                    let eT = document.getElementById('target-total-kpi');
                    if(eT) eT.innerText = `RM ${formatRM(tTarget)}`;
                    let eS = document.getElementById('target-sales-kpi');
                    if(eS) eS.innerText = `RM ${formatRM(tSales)}`;
                    let tPct = tTarget > 0 ? ((tSales/tTarget)*100).toFixed(1) : 0;
                    let eP = document.getElementById('target-percent-kpi');
                    if(eP) eP.innerText = `${tPct}% Achieved`;
                    let eM = document.getElementById('target-missing-kpi');
                    if(eM) eM.innerText = noTarget;
                }
            } catch (err) {
                console.error("Error loading targets:", err);
                if(tbody) tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-rose-500"><i class="fa-solid fa-circle-exclamation mr-2"></i>Error: ${err.message || 'Please try again'}</td></tr>`;
            }
        }

        async function saveTargets() {
            let mEl = document.getElementById('target-month-select');
            if(!mEl) return;
            let month = mEl.value;
            let inputs = document.querySelectorAll('.target-input');
            let updates = [];
            
            inputs.forEach(inp => {
                let rawVal = inp.value.replace(/,/g, '').trim();
                let origVal = inp.getAttribute('data-original') || '';
                let numRaw = rawVal === '' ? null : parseFloat(rawVal);
                let numOrig = origVal === '' ? null : parseFloat(origVal);
                
                if (numRaw !== numOrig) {
                    if (numRaw === null || isNaN(numRaw)) {
                        updates.push({ code: inp.getAttribute('data-code'), delete: true });
                    } else if (numRaw >= 0) {
                        updates.push({ code: inp.getAttribute('data-code'), target: numRaw });
                    }
                }
            });

            if(updates.length === 0) return showToast('info', 'No changes detected.');
            
            setSyncing(true);
            try {
                let chunks = [];
                for(let i=0; i<updates.length; i+=400) chunks.push(updates.slice(i, i+400));
                
                for(let chunk of chunks) {
                    let batch = db.batch();
                    chunk.forEach(u => {
                        let ref = db.collection('targets').doc(`${month}_${u.code}`);
                        if(u.delete) {
                            batch.delete(ref);
                        } else {
                            let bInfo = masterBranches.find(b => String(b.code) === String(u.code));
                            batch.set(ref, {
                                month: month,
                                code: String(u.code),
                                am: bInfo ? bInfo.am : currentUser.name,
                                target_sales: u.target,
                                target: u.target,
                                updated_at: firebase.firestore.FieldValue.serverTimestamp()
                            }, {merge: true});
                        }
                    });
                    await batch.commit();
                }
                showToast('success', 'Targets saved successfully!');
                loadTargetTracker();
            } catch(e) {
                showToast('error', 'Error saving targets: ' + e.message);
            }
            setSyncing(false);
        }

        // --- AUTO LOGOUT ON IDLE ---
        let idleTimeout;
        function resetIdleTimer() {
            clearTimeout(idleTimeout);
            // Set for 15 minutes (15 * 60 * 1000 = 900000 ms)
            idleTimeout = setTimeout(() => {
                if (typeof currentUser !== 'undefined' && currentUser) {
                    if (typeof logout === 'function') logout();
                    Swal.fire('Session Expired', 'The system logged out automatically due to inactivity for 15 minutes for security reasons.', 'info').then(() => {
                        window.location.reload();
                    });
                }
            }, 900000);
        }

        // Detect user activity to reset the timer
        ['mousemove', 'keydown', 'scroll', 'touchstart', 'click'].forEach(evt => 
            document.addEventListener(evt, resetIdleTimer, true)
        );
        // Start the timer when the script loads
        resetIdleTimer();

