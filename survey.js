<script>
        // --- SURVEY & TRACKING SYSTEM ---
        let surveyUnsubscribe = null;
        let responsesUnsubscribe = null;
        let allSurveys = [];
        let allResponses = [];

        function getActiveAMs() {
            if (!tbcBranches) return [];
            let ams = new Set();
            tbcBranches.forEach(b => {
                let name = b['AREA MANAGER'] || '';
                if (name && name !== 'N/A' && name !== '') ams.add(name.trim().toUpperCase());
            });
            return Array.from(ams).sort();
        }

        function listenToSurveyBadge() {
            if (surveyUnsubscribe) surveyUnsubscribe();
            if (responsesUnsubscribe) responsesUnsubscribe();
            
            surveyUnsubscribe = db.collection('surveys').orderBy('createdAt', 'desc').limit(10).onSnapshot(snap => {
                allSurveys = snap.docs.map(doc => ({id: doc.id, ...doc.data()}));
                
                let sIds = allSurveys.map(s => s.id);
                if (sIds.length === 0) {
                    allResponses = [];
                    updateSurveyUI();
                    checkSurveyAlerts();
                    return;
                }
                
                if (responsesUnsubscribe) responsesUnsubscribe();
                responsesUnsubscribe = db.collection('survey_responses').where('surveyId', 'in', sIds).onSnapshot(rSnap => {
                    allResponses = rSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));
                    updateSurveyUI();
                    checkSurveyAlerts();
                });
            });
        }

        
        let hasAlertedSurvey = false;
        function checkSurveyAlerts() {
            if (currentUser.role === 'am' && currentUser) {
                let amName = (currentUser.name || '').trim().toUpperCase();
                let pendingSurveys = allSurveys.filter(s => s.status === 'active' && !allResponses.some(r => r.surveyId === s.id && r.amName === amName));
                
                let badge = document.getElementById('survey-badge');
                if (pendingSurveys.length > 0) {
                    if (badge) {
                        badge.innerText = pendingSurveys.length;
                        badge.classList.remove('hidden');
                    }
                    if (!hasAlertedSurvey) {
                        hasAlertedSurvey = true;
                        Swal.fire({
                            icon: 'info',
                            title: 'Peringatan Survey!',
                            text: `Bos ada ${pendingSurveys.length} survey yang belum dijawab. Sila semak tab Survey & Tracking.`,
                            confirmButtonColor: '#8b5cf6',
                            background: '#1e293b',
                            color: '#fff'
                        });
                    }
                } else {
                    if (badge) badge.classList.add('hidden');
                }
            }
        }

        function renderSurveys() {
            // Already listening via listenToSurveyBadge, just update UI
            updateSurveyUI();
        }

        function updateSurveyUI() {
            if (currentUser.role === 'am') {
                document.getElementById('survey-am-view').classList.remove('hidden');
                document.getElementById('survey-admin-view').classList.add('hidden');
                if(!currentUser) return;
                
                let amName = (currentUser.name || '').trim().toUpperCase();
                let pendingSurveys = allSurveys.filter(s => s.status === 'active' && !allResponses.some(r => r.surveyId === s.id && r.amName === amName));
                
                let html = '';
                if (pendingSurveys.length === 0) {
                    html = '<div class="text-green-400 text-sm font-bold py-4 text-center"><i class="fa-solid fa-check-circle mr-2"></i>Anda telah menyelesaikan semua survey yang aktif!</div>';
                } else {
                    pendingSurveys.forEach(s => {
                        html += `
                        <div class="bg-slate-800 rounded-lg p-4 border border-slate-700 mb-4" id="survey-box-${s.id}">
                            <h3 class="text-md font-bold text-white mb-3">${s.title}</h3>
                            <div class="flex items-center gap-2 mb-3">
                                <label class="text-xs text-slate-400">Jumlah Pengecualian (Cawangan Belum Siap):</label>
                                <select id="survey-exc-${s.id}" onchange="renderSurveyInputs('${s.id}')" class="bg-slate-900 text-white rounded px-2 py-1 outline-none border border-slate-600">
                                    ${[...Array(11).keys()].map(i => `<option value="${i}">${i}</option>`).join('')}
                                </select>
                            </div>
                            <div id="survey-inputs-${s.id}" class="space-y-2 mb-3"></div>
                            <button onclick="submitSurveyResponse('${s.id}')" class="bg-purple-600 hover:bg-purple-500 text-white font-bold py-1.5 px-4 rounded text-sm transition-colors"><i class="fa-solid fa-check mr-2"></i>Hantar Maklum Balas</button>
                        </div>
                        `;
                    });
                }
                document.getElementById('survey-am-list').innerHTML = html;
            } else {
                // Admin / Operation
                document.getElementById('survey-admin-view').classList.remove('hidden');
                document.getElementById('survey-am-view').classList.add('hidden');
                let html = '';
                if (allSurveys.length === 0) {
                    html = '<tr><td colspan="5" class="p-4 text-center text-slate-400 text-sm">Tiada survey ditemui.</td></tr>';
                } else {
                    allSurveys.forEach(s => {
                        let sResp = allResponses.filter(r => r.surveyId === s.id);
                        let dateStr = s.createdAt ? new Date(s.createdAt.toMillis()).toLocaleString() : '';
                        let isClosed = s.status === 'closed';
                        html += `
                        <tr class="hover:bg-slate-800/30 transition-colors">
                            <td class="p-3 text-sm text-slate-300 border-b border-slate-800/50">${dateStr}</td>
                            <td class="p-3 text-sm text-white font-bold border-b border-slate-800/50">${s.title}</td>
                            <td class="p-3 text-sm border-b border-slate-800/50 text-center">
                                <span class="${isClosed ? 'text-red-400' : 'text-green-400'} font-bold text-xs uppercase bg-slate-900 px-2 py-1 rounded border ${isClosed ? 'border-red-500/30' : 'border-green-500/30'}">${s.status}</span>
                            </td>
                            <td class="p-3 text-sm text-slate-300 border-b border-slate-800/50 text-center font-bold">${sResp.length} / ${getActiveAMs().length}</td>
                            <td class="p-3 text-sm border-b border-slate-800/50 text-right">
                                <button onclick="viewSurveyReport('${s.id}')" class="text-cyan-400 hover:text-cyan-300 mr-3"><i class="fa-solid fa-eye"></i> Semak</button>
                                ${!isClosed ? `<button onclick="closeSurvey('${s.id}')" class="text-red-400 hover:text-red-300"><i class="fa-solid fa-lock"></i> Tutup</button>` : ''}
                            </td>
                        </tr>
                        `;
                    });
                }
                document.getElementById('survey-admin-list').innerHTML = html;
            }
        }

        function renderSurveyInputs(id) {
            let count = parseInt(document.getElementById(`survey-exc-${id}`).value) || 0;
            let html = '';
            for(let i=0; i<count; i++) {
                html += `<input type="text" id="survey-code-${id}-${i}" placeholder="Kod Cawangan ${i+1}" class="w-full bg-slate-950 text-white rounded px-3 py-1.5 border border-slate-700 outline-none text-sm mb-2" onblur="validateSurveyCode('${id}', ${i})">
                         <div id="survey-name-${id}-${i}" class="text-xs text-slate-400 mb-2 ml-1 font-bold"></div>`;
            }
            document.getElementById(`survey-inputs-${id}`).innerHTML = html;
        }

        function validateSurveyCode(id, idx) {
            let codeInput = document.getElementById(`survey-code-${id}-${idx}`);
            let nameDiv = document.getElementById(`survey-name-${id}-${idx}`);
            let val = codeInput.value.trim().toUpperCase();
            if(!val) { nameDiv.innerText = ''; return; }
            
            let b = tbcBranches.find(x => String(x['CODE']) === val || String(x['CODE']) === val.replace(/^0+/, ''));
            if (b) {
                nameDiv.innerHTML = `<span class="text-emerald-400"><i class="fa-solid fa-check mr-1"></i> ${b['BRANCH NAME']}</span>`;
                nameDiv.dataset.bname = b['BRANCH NAME'];
            } else {
                nameDiv.innerHTML = `<span class="text-rose-400"><i class="fa-solid fa-times mr-1"></i> Kod Cawangan Tiada Padanan</span>`;
                nameDiv.dataset.bname = '';
            }
        }

        async function createSurvey() {
            let title = document.getElementById('survey-new-title').value.trim();
            if(!title) return showToast('error', 'Sila masukkan soalan survey.');
            
            try {
                await db.collection('surveys').add({
                    title: title,
                    createdBy: currentUser.name,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    status: 'active'
                });
                document.getElementById('survey-new-title').value = '';
                showToast('success', 'Survey Berjaya Diterbitkan!');
            } catch(e) {
                showToast('error', 'Ralat: ' + e.message);
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
                showToast('error', 'Ralat: ' + e.message);
            }
        }

        async function submitSurveyResponse(id) {
            let count = parseInt(document.getElementById(`survey-exc-${id}`).value) || 0;
            let exceptions = [];
            if(count > 0) {
                for(let i=0; i<count; i++) {
                    let code = document.getElementById(`survey-code-${id}-${i}`).value.trim().toUpperCase();
                    let bname = document.getElementById(`survey-name-${id}-${i}`).dataset.bname;
                    if(!code || !bname) {
                        return showToast('error', 'Sila lengkapkan kod cawangan yang sah untuk pengecualian.');
                    }
                    exceptions.push({ code: code, name: bname });
                }
            }
            
            let btn = document.querySelector(`#survey-box-${id} button`);
            let oldHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Menghantar...';
            btn.disabled = true;

            try {
                await db.collection('survey_responses').add({
                    surveyId: id,
                    amName: currentUser.name.trim().toUpperCase(),
                    submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    exceptionCount: count,
                    exceptions: exceptions
                });
                showToast('success', 'Terima kasih! Maklum balas berjaya dihantar.');
                document.getElementById(`survey-box-${id}`).innerHTML = '<div class="text-emerald-400 text-sm font-bold py-2"><i class="fa-solid fa-check-circle mr-2"></i>Maklum balas telah direkodkan.</div>';
            } catch(e) {
                showToast('error', 'Ralat: ' + e.message);
                btn.innerHTML = oldHtml;
                btn.disabled = false;
            }
        }

        function viewSurveyReport(id) {
            let s = allSurveys.find(x => x.id === id);
            if(!s) return;
            let sResp = allResponses.filter(x => x.surveyId === id);
            let ams = getActiveAMs();
            
            let submittedAMs = sResp.map(r => r.amName);
            let missingAMs = ams.filter(a => !submittedAMs.includes(a));
            
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
            
            if(exHtml === '') exHtml = '<div class="text-emerald-400 text-xs font-bold py-4 text-center">Tiada cawangan yang belum siap! Semua Ok.</div>';
            
            let missingHtml = missingAMs.map(a => `<span class="bg-rose-950 border border-rose-900 text-rose-400 px-2 py-0.5 rounded text-[10px] mr-1 mb-1 font-bold inline-block">${a}</span>`).join('');
            if(missingHtml === '') missingHtml = '<span class="text-emerald-400 font-bold text-xs"><i class="fa-solid fa-check-double mr-1"></i> Semua AM telah hantar maklum balas!</span>';
            
            Swal.fire({
                title: '<span class="text-lg">Laporan Survey</span>',
                html: `
                    <div class="text-left space-y-5">
                        <div class="bg-slate-900 p-3 rounded-lg border border-slate-700">
                            <div class="text-[10px] text-slate-400 uppercase font-black tracking-wider mb-1">Soalan Survey</div>
                            <div class="text-sm text-cyan-400 font-bold">${s.title}</div>
                        </div>
                        <div>
                            <div class="text-xs text-slate-400 uppercase font-bold mb-2 tracking-wider"><i class="fa-solid fa-user-xmark mr-1 text-rose-500"></i> Belum Maklum Balas (${missingAMs.length})</div>
                            <div class="p-2 bg-slate-900 rounded-lg border border-slate-800">${missingHtml}</div>
                        </div>
                        <div>
                            <div class="flex justify-between items-center mb-2">
                                <div class="text-xs text-slate-400 uppercase font-bold tracking-wider"><i class="fa-solid fa-list-ul mr-1 text-purple-400"></i> Senarai Cawangan Pengecualian (${totalExceptions})</div>
                                <button onclick="downloadSurveyExcel('${id}')" class="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold py-1 px-3 rounded-md shadow-lg transition-colors"><i class="fa-solid fa-file-excel mr-1"></i> Muat Turun CSV</button>
                            </div>
                            <div class="bg-slate-950 p-3 rounded-lg max-h-60 overflow-y-auto border border-slate-800 shadow-inner">${exHtml}</div>
                        </div>
                    </div>
                `,
                background: '#1e293b',
                color: '#fff',
                width: '600px',
                showConfirmButton: false,
                showCloseButton: true
            });
        }

        function downloadSurveyExcel(id) {
            let s = allSurveys.find(x => x.id === id);
            let sResp = allResponses.filter(x => x.surveyId === id);
            
            let csv = 'Soalan Survey,Nama AM,Tarikh Hantar,Kod Cawangan Pengecualian,Nama Cawangan Pengecualian\\n';
            
            sResp.forEach(r => {
                let dateStr = r.submittedAt ? new Date(r.submittedAt.toMillis()).toLocaleString() : '';
                let title = \`"\${s.title.replace(/"/g, '""')}"\`;
                let amName = \`"\${r.amName.replace(/"/g, '""')}"\`;
                let dateEsc = \`"\${dateStr}"\`;
                
                if (r.exceptionCount === 0 || !r.exceptions || r.exceptions.length === 0) {
                    csv += \`\${title},\${amName},\${dateEsc},TIADA PENGECUALIAN,-\\n\`;
                } else {
                    r.exceptions.forEach(ex => {
                        let code = \`"\${ex.code}"\`;
                        let name = \`"\${ex.name.replace(/"/g, '""')}"\`;
                        csv += \`\${title},\${amName},\${dateEsc},\${code},\${name}\\n\`;
                    });
                }
            });
            
            let blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            let link = document.createElement("a");
            let url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", \`Laporan_Survey_\${id}.csv\`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
</script>
