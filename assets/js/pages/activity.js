document.addEventListener("DOMContentLoaded", () => {
    renderLayout("activity_logs", "Activity Tracking", "App adoption, user activity and admin audit trail");
    let users = [];
    let activeUser = null;
    let page = 1;
    const pageSize = 25;
    // Sidebar submenu deep-link: ?status=installed|not_installed
    const _actStatusQs = new URLSearchParams(window.location.search).get('status');
    if (_actStatusQs === 'installed' || _actStatusQs === 'not_installed') {
        // Apply after DOM elements exist — deferred to end of init
        document.addEventListener('lk-activity-ready', () => {
            const el = document.getElementById('statusFilter');
            if (el) { el.value = _actStatusQs; }
        }, { once: true });
    }
    const timelineModal = new bootstrap.Modal(document.getElementById("timelineModal"));
    const messageModal = new bootstrap.Modal(document.getElementById("messageModal"));

    const canMessage=Permissions.hasPermission('activity_logs','message');
    const canExport=Permissions.hasPermission('activity_logs','export');
    const canDelete=((Auth.getSession()||{}).role==='super_admin')||Permissions.hasPermission('activity_logs','delete');
    const tlSel=new Set(); let tlUser=null, tlRows=[];
    if(!canExport) document.getElementById('exportBtn')?.classList.add('d-none');
    const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
    const date = v => v ? formatDateTime(v) : "—";

    async function loadPGs() {
        try {
            const r = await API.pgs.getAll();
            const select = document.getElementById("pgFilter");
            (r.data || []).forEach(pg => select.insertAdjacentHTML("beforeend", `<option value="${pg.id}">${esc(pg.name)}</option>`));
        } catch (_) {}
    }

    function params() {
        return {
            search: document.getElementById("searchInput").value.trim(),
            role: document.getElementById("roleFilter").value,
            pg_id: document.getElementById("pgFilter").value,
            module: document.getElementById("moduleFilter").value,
            action: document.getElementById("actionFilter").value,
            from: document.getElementById("fromDate").value,
            to: document.getElementById("toDate").value
        };
    }

    async function loadUsers() {
        const tbody=document.getElementById("usersTbody");
        PAGE_LOADER.table(tbody, 8, 'Loading activity...');
        try {
            const r=await API.activityLogs.users(params());
            users=r.data||[];
            renderUsers();
        } catch(e) {
            tbody.innerHTML=`<tr><td colspan="7" class="text-center py-5 text-danger">${esc(e.message||"Failed to load activity")}</td></tr>`;
        }
    }

    function renderUsers() {
        const tbody=document.getElementById("usersTbody");
        const status=document.getElementById("statusFilter").value;
        let data=users.filter(u => !status || (status==="installed" ? !!u.installed : !u.installed));
        const totalPages=Math.max(1,Math.ceil(data.length/pageSize));
        if(page>totalPages) page=totalPages;
        const visible=data.slice((page-1)*pageSize,page*pageSize);
        document.getElementById("pageInfo").textContent=`Page ${page} of ${totalPages} · ${data.length} users`;
        document.getElementById("prevPage").disabled=page<=1;
        document.getElementById("nextPage").disabled=page>=totalPages;
        if(!data.length){tbody.innerHTML='<tr><td colspan="7" class="text-center py-5 text-muted-soft">No users found.</td></tr>';return;}
        tbody.innerHTML=visible.map(u=>`
          <tr>
            <td><div class="fw-semibold">${esc(u.full_name||"—")}</div><div class="small text-muted-soft">${esc(u.email||"")}</div></td>
            <td>${u.role==="guest"?"Guest":"Tenant"}</td>
            <td>${esc(u.pg_name||"—")}</td>
            <td>${u.installed
              ? (u.logged_in ? '<span class="badge bg-success-subtle text-success">Installed</span>' : '<span class="badge bg-success-subtle text-success">Installed</span> <span class="badge bg-warning-subtle text-warning" title="The app is on the phone but the person is logged out">Logged out</span>')
              : (u.uninstalled ? '<span class="badge bg-danger-subtle text-danger" title="The phone no longer has the app">Uninstalled</span>' : '<span class="badge bg-secondary-subtle text-secondary" title="Never opened the app">Never installed</span>')}${u.app_version ? `<div class="small text-muted-soft">v${esc(u.app_version)}</div>` : ''}</td>
            <td>${date(u.last_app_activity)}</td>
            <td><button class="btn btn-sm btn-outline-brand" onclick="openTimeline(${u.id},'${esc(u.full_name||"User")}','${u.role}')"><i class="bi bi-clock-history me-1"></i>Timeline</button></td>
            <td class="text-end">${canMessage
              ? `<button class="btn btn-sm btn-icon" title="Send Message" onclick="openMessage(${u.id},'${esc(u.full_name||"User")}')"><i class="bi bi-chat-left-text"></i></button>`
              : `<button class="btn btn-sm btn-icon" title="Message permission required" disabled><i class="bi bi-lock"></i></button>`}</td>
          </tr>`).join("");
    }

    async function loadStats() {
        try {
            const r=await API.activityLogs.stats(), d=r.data||{}, a=d.app_adoption||{}, l=d.last_30_days||{};
            const total=Number(a.total_tenants ?? a.total_users ?? 0), installed=Number(a.installed_tenants ?? a.installed_users ?? 0);
            document.getElementById("installedPct").textContent=total ? `${Math.round(installed/total*100)}%` : "0%";
            document.getElementById("installedCount").textContent=`${installed} of ${total} active users`;
            document.getElementById("activityCount").textContent=Number(l.total_activities||0).toLocaleString("en-IN");
            document.getElementById("profileCount").textContent=Number(l.active_profiles||0).toLocaleString("en-IN");
            const pgBody=document.getElementById("pgAdoptionTbody");
            pgBody.innerHTML=(d.per_pg||[]).length ? d.per_pg.map(pg=>{
                const total=Number(pg.total_users||0), installed=Number(pg.installed_users||0);
                return `<tr><td>${esc(pg.name||"—")}</td><td>${total}</td><td>${installed}</td><td>${total?Math.round(installed/total*100):0}%</td></tr>`;
            }).join("") : '<tr><td colspan="4" class="text-center text-muted-soft py-3">No PG data available.</td></tr>';
        } catch (_) {}
    }

    window.openTimeline=async function(id,name,role){
        document.getElementById("timelineTitle").textContent=name;
        document.getElementById("timelineMeta").textContent=role==="guest"?"Guest":"Tenant";
        PAGE_LOADER.element(document.getElementById("timelineBody"), "Loading timeline...");
        document.getElementById("timelineFooter").hidden=true;
        timelineModal.show();
        try{
            const r=await API.activityLogs.list(role==="tenant"?{tenant_id:id,limit:100}:{guest_id:id,limit:100});
            const rows=r.data||[]; tlRows=rows; tlSel.clear(); tlUser={id,role,name};
            document.getElementById("timelineBody").innerHTML=rows.length?rows.map(x=>`
              <div class="d-flex gap-3 pb-3 mb-3 border-bottom">
                ${canDelete?`<div class="pt-2"><input type="checkbox" class="form-check-input tl-chk" data-id="${x.id}" aria-label="Select entry"></div>`:''}
                <div class="rounded-circle bg-light d-flex align-items-center justify-content-center" style="width:38px;height:38px;flex:0 0 38px"><i class="bi bi-activity"></i></div>
                <div class="flex-grow-1"><div class="fw-semibold">${esc(x.action.replaceAll("_"," "))}</div><div class="small text-muted-soft">${esc(x.module)} · ${date(x.created_at)}</div>
                <div class="small mt-1">Done by <strong>${esc(x.actor_name||"System")}, ${esc(x.actor_position||"System")}</strong></div>
                ${x.metadata&&Object.keys(x.metadata).length?`<div class="small text-muted-soft mt-1">${esc(JSON.stringify(x.metadata))}</div>`:""}</div>
              </div>`).join(""):'<div class="text-center py-4 text-muted-soft">No activity recorded yet.</div>';
            syncTl();
        }catch(e){document.getElementById("timelineBody").innerHTML=`<div class="text-danger">${esc(e.message)}</div>`;}
    };


    // ---- deleting app activity ----
    function syncTl(){
        const f=document.getElementById("timelineFooter");
        f.hidden=!canDelete||!tlRows.length;
        document.getElementById("tlDelSel").hidden=!tlSel.size;
        document.getElementById("timelineSel").textContent=tlSel.size?`${tlSel.size} selected`:`${tlRows.length} entr${tlRows.length===1?'y':'ies'} shown`;
    }
    document.getElementById("timelineBody").addEventListener("change",e=>{const c=e.target.closest(".tl-chk"); if(!c) return; c.checked?tlSel.add(c.dataset.id):tlSel.delete(c.dataset.id); syncTl();});
    async function delActivity(payload,title,body,typed){
        const ok=await LKUI.confirm({title,body,confirmText:"Delete permanently",requireText:typed?"DELETE":undefined});
        if(!ok) return false;
        try{ const r=await API.activityLogs.remove({scope:"app",...payload}); if(!r.success) throw new Error(r.message); LKUI.toast(r.message||"Deleted","success"); return true; }
        catch(e){ LKUI.toast(e.message||"Could not delete","danger"); return false; }
    }
    document.getElementById("tlDelSel").addEventListener("click",async()=>{
        if(await delActivity({ids:[...tlSel].map(Number)},`Delete ${tlSel.size} activity entr${tlSel.size===1?'y':'ies'}?`,"They will be removed from this user's timeline for good.")){
            openTimeline(tlUser.id,tlUser.name,tlUser.role); loadUsers(); loadStats();
        }
    });
    document.getElementById("tlDelAll").addEventListener("click",async()=>{
        const key=tlUser.role==="guest"?"guest_id":"tenant_id";
        if(await delActivity({filters:{[key]:tlUser.id},confirm:true},`Clear all activity for ${tlUser.name}?`,"Every recorded activity entry for this user will be removed. This cannot be undone.",true)){
            openTimeline(tlUser.id,tlUser.name,tlUser.role); loadUsers(); loadStats();
        }
    });
    const clearBtn=document.getElementById("clearAppBtn");
    if(clearBtn){
        clearBtn.hidden=!canDelete;
        clearBtn.addEventListener("click",async()=>{
            const days=await LKUI.prompt({title:"Clear app activity",body:"Delete app activity (tenants and guests) older than how many days? Leave 0 to delete ALL app activity that matches the current filters.",label:"Older than (days)",type:"number",value:"90",icon:"bi-eraser",tone:"warn"});
            if(days===null||days===undefined) return;
            const n=Math.max(0,parseInt(days,10)||0);
            const p=params();
            const filters={pg_id:p.pg_id,module:p.module,action:p.action,from:p.from,to:p.to};
            const label=n>0?`older than ${n} days`:"matching the current filters";
            if(await delActivity({filters,older_than_days:n||undefined,confirm:true},"Delete app activity?",`All app activity ${label} will be removed permanently. Admin audit logs are not affected.`,true)){ loadUsers(); loadStats(); }
        });
    }

    window.openMessage=function(id,name){
        activeUser=id;
        document.getElementById("messageRecipient").textContent=`— ${name}`;
        document.getElementById("messageForm").reset();
        messageModal.show();
    };

    document.getElementById("messageForm").addEventListener("submit",async e=>{
        e.preventDefault();
        const btn=e.target.querySelector("button[type=submit]");
        LOADER.show(btn,"Sending...");
        try{
            const r=await API.activityLogs.sendMessage(activeUser,document.getElementById("msgTitle").value,document.getElementById("msgBody").value,document.getElementById("msgSubject").value);
            showToast(r.message||"Message sent successfully.","success");
            messageModal.hide();
            loadUsers(); loadStats();
        }catch(err){showToast(err.message||"Failed to send message.","danger");}
        LOADER.hide(btn);
    });

    ["searchInput","roleFilter","pgFilter","moduleFilter","actionFilter","statusFilter","fromDate","toDate"].forEach(id=>document.getElementById(id)?.addEventListener(id==="searchInput"?"input":"change",id==="searchInput"?LKUI.debounce(()=>{page=1;loadUsers();},350):()=>{page=1;loadUsers();}));
    document.getElementById("clearFilters")?.addEventListener("click",()=>{
        ["searchInput","fromDate","toDate"].forEach(id=>{const el=document.getElementById(id); if(el) el.value="";});
        ["roleFilter","pgFilter","moduleFilter","actionFilter","statusFilter"].forEach(id=>{const el=document.getElementById(id); if(el) el.value="";});
        page=1; loadUsers();
    });
    document.getElementById("prevPage").addEventListener("click",()=>{if(page>1){page--;renderUsers();}});
    document.getElementById("nextPage").addEventListener("click",()=>{page++;renderUsers();});
    document.getElementById("refreshBtn").addEventListener("click",()=>{loadUsers();loadStats();});
    document.getElementById("recheckBtn")?.addEventListener("click", async (ev) => {
        const btn = ev.currentTarget; btn.disabled = true;
        try {
            const r = await API.activityLogs.recheckInstalls();
            if (window.LKUI && LKUI.toast) LKUI.toast(r.message || "Install check complete", "success");
            await loadUsers(); await loadStats();
        } catch (e) { if (window.LKUI && LKUI.toast) LKUI.toast(e.message || "Could not re-check installs", "danger"); }
        btn.disabled = false;
    });
    document.getElementById("exportBtn").addEventListener("click",()=>API.activityLogs.export({...params(),app_status:document.getElementById("statusFilter").value,from:document.getElementById("fromDate").value,to:document.getElementById("toDate").value}));

    loadPGs();
    // Apply URL status filter before first load
    if (_actStatusQs === 'installed' || _actStatusQs === 'not_installed') {
        const el = document.getElementById('statusFilter');
        if (el) el.value = _actStatusQs;
    }
    LKUI.onRefresh(() => Promise.all([loadUsers(), loadStats()]));
    loadUsers(); loadStats();
});