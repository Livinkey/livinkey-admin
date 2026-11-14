// Electricity meter readings: history table, export, delete.
document.addEventListener('DOMContentLoaded', () => {
    renderLayout('meter_readings', 'Meter readings', 'History of electricity readings for every tenant and room');
    const $ = (id) => document.getElementById(id), E = (v) => LKUI.esc(v);
    if (!Permissions.hasPermission('bills', 'view')) {
        $('mainContent').innerHTML = '<div class="empty-state"><i class="bi bi-shield-lock"></i><p class="fw-semibold mb-1">No access</p><p class="mb-0">You do not have permission to view meter readings.</p></div>';
        return;
    }
    const canDelete = Permissions.hasPermission('bills', 'delete') || Permissions.canDelete('bills');
    const PAGE = 25;
    let page = 0, total = 0, rows = [];
    const selected = new Set();
    let pending = null; // {ids} | {filters}

    const num = (v) => v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 });
    const dt = (d) => d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
    const filters = () => ({ pg_id: $('fPg').value, month: $('fMonth').value, from: $('fFrom').value, to: $('fTo').value, q: $('fQ').value.trim() });

    async function load() {
        $('tbody').innerHTML = '<tr><td colspan="13" class="text-center py-5 text-muted-soft">Loading…</td></tr>';
        try {
            const r = await API.electricity.readings({ ...filters(), limit: PAGE, offset: page * PAGE });
            rows = r.data || []; total = r.total || 0;
            renderKpis(r); render();
        } catch (e) {
            $('tbody').innerHTML = `<tr><td colspan="13" class="text-center py-5 text-danger">${E(e.message || 'Could not load readings')}</td></tr>`;
        }
    }

    function renderKpis(r) {
        const k = (label, icon, ico, val) => `<div class="col-6 col-xl-3"><div class="kpi"><div class="k-top"><span>${label}</span><span class="k-ico ${ico}"><i class="bi ${icon}"></i></span></div><div class="k-val">${val}</div></div></div>`;
        $('kpiRow').innerHTML = k('Readings', 'bi-speedometer2', 'stat-icon-green', Number(r.total || 0).toLocaleString('en-IN')) +
            k('Total units', 'bi-lightning-charge', 'stat-icon-amber', num(r.total_units)) +
            k('Total billed', 'bi-currency-rupee', 'stat-icon-green', fmtINR(r.total_amount || 0));
    }

    function render() {
        $('deleteFilteredBtn').hidden = !canDelete || total === 0;
        if (!rows.length) {
            $('tbody').innerHTML = '<tr><td colspan="13" class="text-center py-5 text-muted-soft">No meter readings found for this selection.</td></tr>';
        } else {
            $('tbody').innerHTML = rows.map(r => {
                const dual = r.meter_mode === 'dual';
                return `<tr>
                  <td><input type="checkbox" class="form-check-input rowchk" data-id="${r.id}" ${selected.has(r.id) ? 'checked' : ''} ${canDelete ? '' : 'disabled'}></td>
                  <td>${dt(r.recorded_at)}</td>
                  <td><div class="fw-semibold">${E(r.tenant_name || '—')}</div>${r.bill_group_id ? '<div class="small text-muted-soft">Shared room bill</div>' : ''}</td>
                  <td>${E(r.pg_name || '—')}</td><td>${E(r.room_number || '—')}</td><td>${E(r.billing_month || '—')}</td>
                  <td class="text-end">${num(r.previous_reading)}</td><td class="text-end">${num(r.current_reading)}</td><td class="text-end fw-semibold">${num(r.units)}</td>
                  <td class="text-end">${dual ? `${num(r.inverter_previous_reading)} → ${num(r.inverter_current_reading)} <span class="text-muted-soft">(${num(r.inverter_units)})</span>` : '—'}</td>
                  <td class="text-end">${fmtINR(r.amount || 0)}</td>
                  <td><span class="chip ${r.bill_status === 'paid' ? 'chip-green' : r.bill_status === 'partially_paid' ? 'chip-amber' : 'chip-red'}">${E(String(r.bill_status || '—').replace('_', ' '))}</span></td>
                  <td class="text-end">${canDelete ? `<button class="btn-icon" title="Delete this reading" data-del="${r.id}"><i class="bi bi-trash3"></i></button>` : ''}</td>
                </tr>`;
            }).join('');
        }
        const from = total ? page * PAGE + 1 : 0, to = Math.min((page + 1) * PAGE, total);
        $('pageInfo').textContent = total ? `Showing ${from}–${to} of ${total}` : '';
        $('prevBtn').disabled = page <= 0; $('nextBtn').disabled = (page + 1) * PAGE >= total;
        $('chkAll').checked = rows.length > 0 && rows.every(r => selected.has(r.id));
        $('deleteSelBtn').hidden = !canDelete || selected.size === 0;
        $('selCount').textContent = selected.size ? `${selected.size} selected` : '';
    }

    // ---- events ----
    ['fPg', 'fMonth', 'fFrom', 'fTo'].forEach(id => $(id).addEventListener('change', () => { page = 0; selected.clear(); load(); }));
    let t; $('fQ').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { page = 0; selected.clear(); load(); }, 350); });
    $('resetBtn').onclick = () => { ['fPg', 'fMonth', 'fFrom', 'fTo', 'fQ'].forEach(id => $(id).value = ''); page = 0; selected.clear(); load(); };
    $('prevBtn').onclick = () => { if (page > 0) { page--; load(); } };
    $('nextBtn').onclick = () => { if ((page + 1) * PAGE < total) { page++; load(); } };
    $('chkAll').onchange = (e) => { rows.forEach(r => e.target.checked ? selected.add(r.id) : selected.delete(r.id)); render(); };
    $('tbody').addEventListener('change', (e) => { const c = e.target.closest('.rowchk'); if (!c) return; const id = Number(c.dataset.id); c.checked ? selected.add(id) : selected.delete(id); render(); });
    $('tbody').addEventListener('click', (e) => { const b = e.target.closest('[data-del]'); if (b) askDelete({ ids: [Number(b.dataset.del)] }, '1 reading'); });
    $('deleteSelBtn').onclick = () => askDelete({ ids: [...selected] }, `${selected.size} selected reading${selected.size === 1 ? '' : 's'}`);
    $('deleteFilteredBtn').onclick = () => askDelete({ filters: filters(), confirm: true }, `ALL ${total} readings matching the current filters`, true);

    const delModal = new bootstrap.Modal($('delModal'));
    function askDelete(payload, label, typed) {
        pending = payload;
        $('delBody').textContent = `You are about to delete ${label}.`;
        $('delTypeWrap').classList.toggle('d-none', !typed); $('delType').value = '';
        delModal.show();
    }
    $('delConfirm').onclick = async function () {
        if (!$('delTypeWrap').classList.contains('d-none') && $('delType').value.trim() !== 'DELETE') { LKUI.toast('Type DELETE to confirm', 'warning'); return; }
        this.disabled = true;
        try {
            const r = await API.electricity.deleteReadings(pending);
            LKUI.toast(r.message || 'Deleted', 'success');
            delModal.hide(); selected.clear(); page = 0; await load();
        } catch (e) { LKUI.toast(e.message || 'Could not delete', 'danger'); }
        this.disabled = false;
    };

    // ---- export (all rows matching the filters, not just this page) ----
    $('exportBtn').onclick = async function () {
        this.disabled = true;
        try {
            const r = await API.electricity.readings({ ...filters(), limit: 5000, offset: 0 });
            const list = r.data || [];
            if (!list.length) { LKUI.toast('Nothing to export for this selection', 'info'); return; }
            const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
            const head = ['Recorded at', 'Tenant', 'PG', 'Room', 'Bill month', 'Meter mode', 'Previous reading', 'Current reading', 'Units', 'Inverter previous', 'Inverter current', 'Inverter units', 'Electricity amount', 'Bill status'];
            const csv = [head.join(',')].concat(list.map(x => [dt(x.recorded_at), x.tenant_name, x.pg_name, x.room_number, x.billing_month, x.meter_mode, x.previous_reading, x.current_reading, x.units, x.inverter_previous_reading, x.inverter_current_reading, x.inverter_units, x.amount, x.bill_status].map(q).join(','))).join('\n');
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
            a.download = `livinkey-meter-readings-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
            if (r.total > list.length) LKUI.toast(`Exported the latest ${list.length} of ${r.total} readings. Narrow the filters to export the rest.`, 'info');
        } catch (e) { LKUI.toast(e.message || 'Export failed', 'danger'); }
        this.disabled = false;
    };

    (async () => {
        try { const r = await API.pgs.getAll(); (r.data || []).forEach(p => $('fPg').insertAdjacentHTML('beforeend', `<option value="${p.id}">${E(p.name)}</option>`)); } catch (_) {}
        load();
    })();
});
