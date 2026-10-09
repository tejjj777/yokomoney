/* YOKO! Student · Live Shared Group Budgets (Session 7)
   Uses Supabase JS for Realtime sync. The library is loaded only when groups are used,
   so a slow or blocked network never holds up the rest of the app. */
'use strict';

const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
const GroupSync = {
  client: null,
  channels: {},
  loading: null,
  /** Load the library and connect. Resolves true when groups can be used, false when offline or blocked. */
  ready(timeoutMs = 6000) {
    if (this.client) return Promise.resolve(true);
    if (!navigator.onLine) return Promise.resolve(false);
    if (!this.loading) {
      const load = window.supabase ? Promise.resolve() : loadScript(SUPABASE_JS);
      const timer = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs));
      this.loading = Promise.race([load, timer]).then(async () => {
        if (!window.supabase) return false;
        this.init();
        // Wait for the sign-in to finish. Without this the first create ran with no session and failed.
        try { await this.authReady; } catch (e) { console.warn('Group sign-in failed', e); }
        return !!this.client;
      }).catch(err => { console.warn('Live groups unavailable:', err.message); this.loading = null; return false; });
    }
    return this.loading;
  },
  init() {
    if (!window.supabase || this.client) return;
    this.client = window.supabase.createClient(SYNC_URL, SYNC_KEY);
    this.authReady = this.signIn();
    
    window.addEventListener('online', () => this.processQueue());
    
    if (state.groups) {
      state.groups.forEach(g => this.subscribe(g.id));
    }
  },

  async signIn() {
    const { data: { session } } = await this.client.auth.getSession();
    if (session && session.user) return session;
    const { data, error } = await this.client.auth.signInAnonymously();
    if (error) throw error;
    return data.session;
  },
  /** A signed-in session, signing in again if it went missing. */
  async session() {
    if (this.authReady) { try { await this.authReady; } catch (e) { /* retried below */ } }
    let { data: { session } } = await this.client.auth.getSession();
    if (!session || !session.user) { this.authReady = this.signIn(); session = await this.authReady; }
    if (!session || !session.user) throw new Error('Could not sign in to live groups');
    return session;
  },

  queueAction(action) {
    let q = [];
    try { q = JSON.parse(localStorage.getItem('yoko.groups.outbox')) || []; } catch(e){}
    q.push(action);
    localStorage.setItem('yoko.groups.outbox', JSON.stringify(q));
    if (navigator.onLine) this.ready().then(ok => { if (ok) this.processQueue(); });
  },

  async processQueue() {
    if (!this.client || !navigator.onLine) return;
    let q = [];
    try { q = JSON.parse(localStorage.getItem('yoko.groups.outbox')) || []; } catch(e){}
    if (!q.length) return;
    
    const remaining = [];
    for (const action of q) {
      try {
        if (action.type === 'ADD_EXPENSE') {
          // Remove ID so supabase generates one, or keep local UUID if it matches Postgres UUID
          // Actually, our `uid()` generates short strings, not UUIDs.
          // Let's strip the local `id` and let Supabase generate a UUID.
          const dbExpense = { ...action.expense };
          delete dbExpense.id;
          
          const { data, error } = await this.client.from('group_expenses').insert(dbExpense).select().single();
          if (error) throw error;
          // point the personal budget entry at the saved group expense, so it isn't added twice
          state.budget.expenses.forEach(e => { if (e.groupExp === action.expense.id) e.groupExp = data.id; });
          (state.meta.groupSkip = state.meta.groupSkip || []).push(data.id);
          save();
          
          if (action.splits && action.splits.length > 0) {
            const splitsToInsert = action.splits.map(s => {
              const sp = { ...s, expense_id: data.id };
              delete sp.id;
              return sp;
            });
            await this.client.from('group_expense_splits').insert(splitsToInsert);
          }
        }
      } catch (err) {
        console.error('Group sync error:', err);
        remaining.push(action);
      }
    }
    localStorage.setItem('yoko.groups.outbox', JSON.stringify(remaining));
  },

  subscribe(groupId) {
    if (!this.client || this.channels[groupId]) return;
    
    const channel = this.client.channel(`group:${groupId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_expenses', filter: `group_id=eq.${groupId}` }, payload => {
        this.fetchGroupData(groupId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_expense_splits' }, payload => {
        this.fetchGroupData(groupId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${groupId}` }, payload => {
        this.fetchGroupData(groupId);
      })
      .subscribe();
      
    this.channels[groupId] = channel;
    this.fetchGroupData(groupId);
  },

  /** Put my UPI ID on my member row in every group, so everyone in the group sees it. */
  async shareMyUpi(upi) {
    const id = String(upi || '').trim();
    if (!(state.groups || []).length || !isUpiId(id)) return false;
    if (!(await this.ready())) return false;
    try { await this.session(); } catch (e) { return false; }
    let ok = true;
    for (const g of state.groups) {
      if (!g.myMemberId) continue;
      const { error } = await this.client.from('group_members').update({ upi_id: id }).eq('id', g.myMemberId);
      if (error) { ok = false; console.warn('Could not share UPI ID', error); }
      else this.fetchGroupData(g.id);
    }
    if (!ok) toast('Saved on this phone. Sharing with the group needs a quick database update (see supabase/groups-upi.sql).', 5000);
    return ok;
  },

  async fetchGroupData(groupId) {
    if (!this.client) return;
    try {
      const { data: members } = await this.client.from('group_members').select('*').eq('group_id', groupId);
      const { data: expenses } = await this.client.from('group_expenses').select('*, group_expense_splits(*)').eq('group_id', groupId);
      
      state.groupData = state.groupData || {};
      state.groupData[groupId] = {
        members: members || [],
        expenses: expenses || []
      };
      groupBudgetSync(groupId);
      save();
      if (currentRoute() === 'split') render();
      else scheduleRender(200);
    } catch (err) {
      console.error('Failed to fetch group data', err);
    }
  },

  async createGroup(name, myName) {
    const session = await this.session();
    const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase().padEnd(6, '7');
    const { data: group, error } = await this.client.from('groups').insert({ name, join_code: joinCode }).select().single();
    if (error) throw error;
    
    const { data: member, error: memberErr } = await this.client.from('group_members').insert({
      group_id: group.id,
      user_id: session.user.id,
      name: myName
    }).select().single();
    if (memberErr) throw memberErr;
    
    state.groups.push({ id: group.id, name: group.name, joinCode: group.join_code, myMemberId: member.id });
    save();
    if (isUpiId(state.settings.myUpiId)) this.shareMyUpi(state.settings.myUpiId);
    this.subscribe(group.id);
    return group;
  },

  async joinGroup(joinCode, myName) {
    await this.session();
    const { data: groupId, error } = await this.client.rpc('join_group', { code: joinCode.toUpperCase(), member_name: myName });
    if (error) throw error;
    
    const { data: group } = await this.client.from('groups').select('*').eq('id', groupId).single();
    const { data: member } = await this.client.from('group_members').select('*').eq('group_id', groupId).eq('user_id', (await this.client.auth.getSession()).data.session.user.id).single();
    
    if (!state.groups.find(g => g.id === groupId)) {
      state.groups.push({ id: groupId, name: group.name, joinCode: group.join_code, myMemberId: member.id });
      if (isUpiId(state.settings.myUpiId)) setTimeout(() => this.shareMyUpi(state.settings.myUpiId), 0);
      save();
      this.subscribe(groupId);
    }
  },

  /** True when this expense only exists on this phone so far (still waiting in the outbox). */
  isLocalOnly(ex) { return !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(ex.id)); },
  dropFromOutbox(localId) {
    let q = [];
    try { q = JSON.parse(localStorage.getItem('yoko.groups.outbox')) || []; } catch (e) { q = []; }
    localStorage.setItem('yoko.groups.outbox', JSON.stringify(q.filter(a => !(a.expense && a.expense.id === localId))));
  },
  async deleteExpense(groupId, ex) {
    const data = state.groupData[groupId];
    if (!this.isLocalOnly(ex)) {
      if (!(await this.ready())) return false;
      try {
        await this.session();
        const r1 = await this.client.from('group_expense_splits').delete().eq('expense_id', ex.id);
        if (r1.error) throw r1.error;
        const r2 = await this.client.from('group_expenses').delete().eq('id', ex.id).select();
        if (r2.error) throw r2.error;
        if (!r2.data || !r2.data.length) throw new Error('not allowed');   // database rules blocked it
      } catch (e) { console.warn('Delete group expense failed', e); return false; }
    } else this.dropFromOutbox(ex.id);
    if (data) data.expenses = data.expenses.filter(x => x !== ex);
    state.budget.expenses = state.budget.expenses.filter(e => e.groupExp !== String(ex.id));
    commit();
    return true;
  },
  async updateExpense(groupId, ex, description, amount, splitDetails, categoryId) {
    const g = state.groups.find(x => x.id === groupId);
    const splits = Object.entries(splitDetails).map(([member_id, amt]) => ({ member_id, amount: amt }));
    if (!this.isLocalOnly(ex)) {
      if (!(await this.ready())) return false;
      try {
        await this.session();
        const r1 = await this.client.from('group_expenses').update({ description, amount }).eq('id', ex.id).select();
        if (r1.error) throw r1.error;
        if (!r1.data || !r1.data.length) throw new Error('not allowed');
        const r2 = await this.client.from('group_expense_splits').delete().eq('expense_id', ex.id);
        if (r2.error) throw r2.error;
        const r3 = await this.client.from('group_expense_splits').insert(splits.map(sp => ({ ...sp, expense_id: ex.id })));
        if (r3.error) throw r3.error;
      } catch (e) { console.warn('Update group expense failed', e); return false; }
    } else {
      this.dropFromOutbox(ex.id);
      this.queueAction({ type: 'ADD_EXPENSE', expense: { id: ex.id, group_id: groupId, paid_by: ex.paid_by, description, amount }, splits });
    }
    Object.assign(ex, { description, amount, group_expense_splits: splits });
    // keep your own share in step
    const mine = Number(splitDetails[g && g.myMemberId]) || 0, row = state.budget.expenses.find(e => e.groupExp === String(ex.id));
    if (row && mine > 0.004) { row.amount = Math.round(mine * 100) / 100; row.note = `${g.name}: ${description}`.slice(0, 120); if (categoryId) row.categoryId = categoryId; }
    else if (row) state.budget.expenses = state.budget.expenses.filter(e => e !== row);
    else if (mine > 0.004 && g) { const r = addExpense({ categoryId: categoryId || groupCategoryId(), amount: Math.round(mine * 100) / 100, date: todayISO(), note: `${g.name}: ${description}`.slice(0, 120), noRoundup: true }); r.exp.groupExp = String(ex.id); }
    commit();
    return true;
  },

  addExpense(groupId, description, amount, splitDetails, categoryId) {
    const group = state.groups.find(g => g.id === groupId);
    if (!group) return;
    
    const expense = {
      id: uid(), 
      group_id: groupId,
      paid_by: group.myMemberId,
      description,
      amount
    };
    
    const splits = Object.entries(splitDetails).map(([member_id, amt]) => ({
      member_id,
      amount: amt
    }));
    
    state.groupData[groupId] = state.groupData[groupId] || { members: [], expenses: [] };
    state.groupData[groupId].expenses.push({ ...expense, group_expense_splits: splits });
    // your share counts as your own spending
    const mine = Number(splitDetails[group.myMemberId]) || 0;
    if (mine > 0.004 && !/^Settlement:/.test(description)) {
      const r = addExpense({ categoryId: categoryId || groupCategoryId(), amount: Math.round(mine * 100) / 100, date: todayISO(), note: `${group.name}: ${description}`.slice(0, 120), noRoundup: true });
      r.exp.groupExp = expense.id;
      if (categoryId) state.settings.groupCat = categoryId;
    }
    save();
    if (currentRoute() === 'split') render();
    
    this.queueAction({ type: 'ADD_EXPENSE', expense, splits });
  }
};

// Reconnect existing groups in the background after the app has opened (never blocks start-up)
window.addEventListener('load', () => { if ((state.groups || []).length) setTimeout(() => GroupSync.ready(), 1500); });
/** A plain-words reason a group action failed. */
function groupErrorText(err) {
  if (!navigator.onLine || /fetch|network|timeout|offline/i.test((err && err.message) || '')) return 'Live groups need internet. Try again when you’re online.';
  return 'That didn’t work. Check the code and try again in a minute.';
}

function groupBalances(groupId) {
  const data = state.groupData[groupId];
  if (!data || !data.members || !data.expenses) return [];
  
  const balances = {};
  data.members.forEach(m => { balances[m.id] = { id: m.id, name: m.name, net: 0, paid: 0, share: 0 }; });
  
  data.expenses.forEach(ex => {
    if (!balances[ex.paid_by]) return;
    balances[ex.paid_by].paid += ex.amount;
    balances[ex.paid_by].net += ex.amount;
    
    if (ex.group_expense_splits) {
      ex.group_expense_splits.forEach(sp => {
        if (!balances[sp.member_id]) return;
        balances[sp.member_id].share += sp.amount;
        balances[sp.member_id].net -= sp.amount;
      });
    }
  });
  
  return Object.values(balances).map(b => {
    b.net = Math.round(b.net * 100) / 100;
    return b;
  }).sort((a, b) => b.net - a.net);
}

/** The budget category group spending goes into: the last one picked, else a food/outings-type category. */
function groupCategoryId() {
  const cats = state.budget.categories;
  if (cats.some(c => c.id === state.settings.groupCat)) return state.settings.groupCat;
  const c = cats.find(c => /outing|fun|food|canteen|snack|daily/i.test(c.name)) || cats.find(c => c.type === 'wants') || cats[0];
  return c ? c.id : '';
}
/** Add your share of group expenses other people logged to your own spending. Runs after every group refresh. */
function groupBudgetSync(groupId) {
  const g = state.groups.find(x => x.id === groupId), data = state.groupData[groupId];
  if (!g || !data || !g.myMemberId || !state.budget.categories.length) return;
  const exps = data.expenses || [];
  // first run after this feature arrived: don't back-fill old expenses
  if (!Array.isArray(state.meta.groupSkip)) state.meta.groupSkip = [];
  const skip = new Set(state.meta.groupSkip);
  if (!state.meta.groupSeen) state.meta.groupSeen = {};
  if (!state.meta.groupSeen[groupId]) { exps.forEach(e => { if (e.id) state.meta.groupSkip.push(String(e.id)); }); state.meta.groupSeen[groupId] = true; return; }
  const have = new Set(state.budget.expenses.map(e => e.groupExp).filter(Boolean));
  exps.forEach(ex => {
    const id = String(ex.id || '');
    if (!id || skip.has(id) || have.has(id) || /^Settlement:/.test(ex.description || '')) return;
    const mine = sum((ex.group_expense_splits || []).filter(sp => sp.member_id === g.myMemberId), sp => Number(sp.amount) || 0);
    state.meta.groupSkip.push(id);
    if (!(mine > 0.004)) return;
    const date = String(ex.created_at || '').slice(0, 10);
    const r = addExpense({ categoryId: groupCategoryId(), amount: Math.round(mine * 100) / 100, date: F.parseDate(date) ? date : todayISO(), note: `${g.name}: ${ex.description || 'Group expense'}`.slice(0, 120), noRoundup: true });
    r.exp.groupExp = id;
  });
}

/** Fewest payments that settle a group: biggest debtor pays biggest creditor, repeat. */
function groupTransfers(balances) {
  const cr = balances.filter(b => b.net > 0.004).map(b => ({ m: b, left: b.net })).sort((a, b) => b.left - a.left);
  const db = balances.filter(b => b.net < -0.004).map(b => ({ m: b, left: -b.net })).sort((a, b) => b.left - a.left);
  const out = [];
  let i = 0, j = 0;
  while (i < db.length && j < cr.length) {
    const amt = Math.round(Math.min(db[i].left, cr[j].left) * 100) / 100;
    if (amt > 0.004) out.push({ from: db[i].m, to: cr[j].m, amount: amt });
    db[i].left -= amt; cr[j].left -= amt;
    if (db[i].left < 0.005) i++;
    if (cr[j].left < 0.005) j++;
  }
  return out;
}

function groupExpenseForm(groupId, exId) {
    const g = state.groups.find(x => x.id === groupId), data = state.groupData[groupId];
    if (!g || !data || !data.members || !data.members.length) return;
    const ex = exId ? (data.expenses || []).find(x => String(x.id) === String(exId)) : null;
    const pre = {};
    if (ex) (ex.group_expense_splits || []).forEach(sp => { pre[sp.member_id] = Number(sp.amount) || 0; });
    const preVals = Object.values(pre), preEqual = !ex || (preVals.length && preVals.every(v => Math.abs(v - preVals[0]) < 0.011));
    const myRow = ex && state.budget.expenses.find(e => e.groupExp === String(ex.id));
    const members = data.members, sym = esc(CURRENCIES[state.currency].symbol);
    const cats = state.budget.categories, catNow = groupCategoryId();
    openModal({
      title: ex ? 'Edit group expense' : 'Add group expense', submitLabel: ex ? 'Save changes' : 'Add',
      body: `<div class="field"><label for="ge-desc">What for?</label><input id="ge-desc" class="input" maxlength="80" placeholder="e.g. Dinner, groceries, cab" value="${ex ? esc(ex.description || '') : ''}"></div>
        <div class="field"><label for="ge-amt">Total amount</label><div class="affix"><span class="affix-sym" aria-hidden="true">${sym}</span><input id="ge-amt" class="input" inputmode="decimal" placeholder="0" value="${ex ? numStr(Number(ex.amount)) : ''}"></div></div>
        <fieldset class="field ge-mode"><legend class="field-label">How to split</legend>
          <label class="check"><input type="radio" name="ge-mode" value="equal" ${preEqual ? 'checked' : ''}> Equally</label>
          <label class="check"><input type="radio" name="ge-mode" value="amount" ${preEqual ? '' : 'checked'}> By amount</label></fieldset>
        <div class="ge-list">${members.map(m => `<div class="ge-row"><label class="check"><input type="checkbox" class="ge-in" data-id="${esc(m.id)}" ${!ex || pre[m.id] > 0 ? 'checked' : ''}> ${esc(m.name)}${m.id === g.myMemberId ? ' (you)' : ''}</label>
          <div class="affix ge-amt-wrap" hidden><span class="affix-sym" aria-hidden="true">${sym}</span><input class="input input-sm ge-each" data-id="${esc(m.id)}" inputmode="decimal" placeholder="0" aria-label="${esc(m.name)}'s share" value="${ex && pre[m.id] ? numStr(pre[m.id]) : ''}"></div>
          <span class="ge-eq small muted" data-id="${esc(m.id)}"></span></div>`).join('')}</div>
        <p class="small" id="ge-status" aria-live="polite"></p>
        ${cats.length ? `<div class="field"><label for="ge-cat">Your share goes in</label><select id="ge-cat" class="select">${cats.map(c => `<option value="${c.id}" ${c.id === (myRow ? myRow.categoryId : catNow) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}<option value="__newcat__">+ New category…</option></select><p class="help">Your share counts in your own budget.</p></div>` : ''}
        ${ex ? '' : `<label class="check"><input type="checkbox" id="ge-repeat"> Repeat every month on day ${todayDate().getDate()} (rent, WiFi, subscriptions)</label>`}
        <p class="field-error" id="ge-err"></p>`,
      onMount: form => {
        const q = sel => form.querySelector(sel), qa = sel => [...form.querySelectorAll(sel)];
        const amt = () => { const r = validateValue('money', q('#ge-amt').value, { required: false }); return r.value > 0 ? r.value : 0; };
        const mode = () => (q('input[name="ge-mode"]:checked') || {}).value;
        form._shares = () => {
          const total = amt(), ins = qa('.ge-in').filter(c => c.checked).map(c => c.dataset.id), out = {};
          if (mode() === 'equal') {
            if (!ins.length) return { out, left: total };
            const cents = Math.round(total * 100), base = Math.floor(cents / ins.length);
            ins.forEach((id, i) => { out[id] = (base + (i < cents - base * ins.length ? 1 : 0)) / 100; });
            return { out, left: 0 };
          }
          let used = 0;
          qa('.ge-each').forEach(inp => {
            const on = qa('.ge-in').find(c => c.dataset.id === inp.dataset.id).checked;
            const r = validateValue('money', inp.value, { required: false });
            if (on && r.value > 0) { out[inp.dataset.id] = Math.round(r.value * 100) / 100; used += out[inp.dataset.id]; }
          });
          return { out, left: Math.round((total - used) * 100) / 100 };
        };
        const draw = () => {
          q('#ge-err').textContent = '';
          const byAmt = mode() === 'amount', { out, left } = form._shares();
          qa('.ge-amt-wrap').forEach(w => { w.hidden = !byAmt; });
          qa('.ge-eq').forEach(sp => { sp.textContent = !byAmt && out[sp.dataset.id] ? fmtExact(out[sp.dataset.id]) : ''; });
          qa('.ge-each').forEach(inp => { inp.disabled = !qa('.ge-in').find(c => c.dataset.id === inp.dataset.id).checked; });
          const st = q('#ge-status');
          if (!amt()) st.textContent = 'Enter the total first.';
          else if (!byAmt) st.textContent = `Split between ${plural(Object.keys(out).length, 'person', 'people')}.`;
          else st.textContent = Math.abs(left) < 0.005 ? 'All assigned.' : left > 0 ? `${fmtExact(left)} left to assign.` : `${fmtExact(-left)} too much.`;
          st.className = 'small ' + (byAmt && amt() && Math.abs(left) >= 0.005 ? 'tone-danger-text' : 'muted');
        };
        form.addEventListener('input', draw); form.addEventListener('change', draw);
        draw(); q('#ge-desc').focus();
      },
      onSubmit: form => {
        const desc = form.querySelector('#ge-desc').value.trim(), err = form.querySelector('#ge-err');
        const r = validateValue('money', form.querySelector('#ge-amt').value, { required: true, positive: true });
        const { out, left } = form._shares();
        const msg = !desc ? 'Say what it was for.' : r.error ? r.error : !Object.keys(out).length ? 'Pick at least one person.' : Math.abs(left) >= 0.005 ? (left > 0 ? `${fmtExact(left)} still to assign.` : `Shares add up to ${fmtExact(-left)} more than the total.`) : '';
        err.textContent = msg; if (msg) return false;
        const cat = form.querySelector('#ge-cat'), catId = cat ? cat.value : '';
        if (ex) {
          GroupSync.updateExpense(groupId, ex, desc, r.value, out, catId).then(ok => {
            toast(ok ? 'Group expense updated' : 'Couldn’t update it. Check your internet and try again.', ok ? 2600 : 5000);
            const btn = document.createElement('button'); btn.dataset.id = groupId; GROUP_ACTIONS['group-view'](btn);
          });
          return true;
        }
        GroupSync.addExpense(groupId, desc, r.value, out, catId);
        const rep = form.querySelector('#ge-repeat');
        if (rep && rep.checked) {
          (state.groupRecurring = state.groupRecurring || []).push({ id: uid(), groupId, desc, amount: r.value, splits: out, categoryId: catId, day: todayDate().getDate(), lastPosted: todayISO().slice(0, 7) });
        }
        commit();
        toast(out[g.myMemberId] ? `Added. Your share ${fmtExact(out[g.myMemberId])} is in your budget${rep && rep.checked ? '. Repeats monthly' : ''}` : 'Expense added to group');
        return true;
      }
    });
}

/** Delete one of your own group expenses (and your share from your budget). */
async function groupDeleteExpense(groupId, exId) {
  const data = state.groupData[groupId], ex = data && (data.expenses || []).find(x => String(x.id) === String(exId));
  if (!ex || !confirm(`Delete “${ex.description}” (${fmt(Number(ex.amount))}) for everyone in the group?`)) return;
  const ok = await GroupSync.deleteExpense(groupId, ex);
  toast(ok ? 'Deleted for everyone' : 'Couldn’t delete it. Check your internet and try again.', ok ? 2600 : 5000);
  const btn = document.createElement('button'); btn.dataset.id = groupId; GROUP_ACTIONS['group-view'](btn);
}
/** Post repeating group expenses that are due this month. Runs from dailyTick. */
function postGroupRecurring() {
  const t = todayDate(), ym = todayISO().slice(0, 7);
  let n = 0;
  (state.groupRecurring || []).forEach(r => {
    const g = state.groups.find(x => x.id === r.groupId);
    if (!g || r.lastPosted >= ym) return;
    const dim = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    if (t.getDate() < Math.min(r.day, dim)) return;
    GroupSync.addExpense(r.groupId, r.desc, r.amount, r.splits, r.categoryId);
    r.lastPosted = ym; n++;
  });
  return n;
}

const GROUP_ACTIONS = {
  'create-group': () => {
    formModal({
      title: 'Create a live group', submitLabel: 'Create',
      values: { name: '', myName: '' },
      fields: [
        { name: 'name', label: 'Group name', kind: 'text', required: true, placeholder: 'e.g. Goa Trip' },
        { name: 'myName', label: 'Your name', kind: 'text', required: true }
      ],
      onSave: async (v, form, done) => {
        try {
          if (!GroupSync.client) toast('Connecting…', 1500);
          if (!(await GroupSync.ready())) throw new Error('offline');
          await GroupSync.createGroup(v.name, v.myName);
          toast(`Created ${v.name}`);
          if (currentRoute() === 'split') render();
        } catch (e) {
          console.warn('Create group failed', e);
          toast(groupErrorText(e), 5000);
        }
      }
    });
  },
  'join-group': () => {
    formModal({
      title: 'Join a group', submitLabel: 'Join',
      values: { code: '', myName: '' },
      fields: [
        { name: 'code', label: 'Join code', kind: 'text', required: true },
        { name: 'myName', label: 'Your name', kind: 'text', required: true }
      ],
      onSave: async (v, form, done) => {
        try {
          if (!GroupSync.client) toast('Connecting…', 1500);
          if (!(await GroupSync.ready())) throw new Error('offline');
          await GroupSync.joinGroup(v.code, v.myName);
          toast('Joined group');
          if (currentRoute() === 'split') render();
        } catch (e) {
          console.warn('Join group failed', e);
          toast(groupErrorText(e), 5000);
        }
      }
    });
  },
  'group-view': el => {
    const groupId = el.dataset.id;
    const g = state.groups.find(x => x.id === groupId);
    if (!g) return;
    const data = state.groupData[groupId] || { members: [], expenses: [] };
    const balances = groupBalances(groupId);
    
    openModal({
      title: g.name,
      submitLabel: 'Close',
      body: `<p class="small muted mb">Join code: <strong>${g.joinCode}</strong> (give this to friends)</p>
        
        <h3 style="margin-top:10px">Members</h3>
        <ul class="plain-list mb">${data.members.map(m => `<li>${esc(m.name)} ${m.id === g.myMemberId ? '(You)' : ''} <span class="small muted">${isUpiId(m.upi_id) ? '· UPI ' + esc(m.upi_id) : '· no UPI ID yet'}</span></li>`).join('')}</ul>
        <div class="field mb"><label for="grp-my-upi" class="small"><strong>Your UPI ID</strong> (everyone in the group sees it)</label>
          <div class="row" style="gap:6px;flex-wrap:nowrap"><input id="grp-my-upi" class="input" inputmode="email" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="name@okhdfcbank" value="${esc(state.settings.myUpiId || '')}" style="min-width:0">
          <button type="button" class="btn btn-sm" data-action="group-share-upi">Share</button></div></div>
        
        <h3 style="margin-top:10px">Who pays who</h3>
        ${(() => {
          const myId = g.myMemberId, tx = groupTransfers(balances);
          if (!tx.length) return '<p class="gb-even mb">All square. Nobody owes anything.</p>';
          return `<div class="gb-list mb">${tx.map(t => {
            const mine = t.from.id === myId ? 'owe' : t.to.id === myId ? 'owed' : '';
            const other = mine === 'owe' ? t.to : t.from;
            const who = mine === 'owe' ? `You pay <strong>${esc(t.to.name)}</strong>` : mine === 'owed' ? `<strong>${esc(t.from.name)}</strong> pays you` : `<strong>${esc(t.from.name)}</strong> pays <strong>${esc(t.to.name)}</strong>`;
            const btn = mine ? `<button type="button" class="btn btn-sm ${mine === 'owe' ? 'btn-primary' : ''}" data-action="group-settle" data-group-id="${groupId}" data-person="${esc(other.name)}" data-amount="${t.amount}" data-dir="${mine}">${mine === 'owe' ? 'Pay with UPI' : 'Ask to pay'}</button>` : '';
            return `<div class="gb-row ${mine === 'owe' ? 'gb-owe' : mine === 'owed' ? 'gb-owed' : ''}"><div class="gb-who">${who}</div><div class="gb-amt">${fmtExact(t.amount)}</div>${btn ? `<div class="gb-act no-print">${btn}</div>` : ''}</div>`;
          }).join('')}</div>`;
        })()}
        <details class="collapsible mb"><summary>Paid vs share for each person</summary><div class="details-body"><div class="gb-list">
          ${balances.map(b => `<div class="gb-row"><div class="gb-who"><strong>${esc(b.name)}</strong>${b.id === g.myMemberId ? ' (you)' : ''}<br><span class="small muted">Paid ${fmtExact(b.paid)} · Share ${fmtExact(b.share)}</span></div>
            <div class="gb-amt ${b.net > 0.004 ? 'tone-success-text' : b.net < -0.004 ? 'tone-danger-text' : ''}">${b.net > 0.004 ? 'gets back ' + fmtExact(b.net) : b.net < -0.004 ? 'owes ' + fmtExact(-b.net) : 'even'}</div></div>`).join('')}
        </div></div></details>

        <h3 style="margin-top:10px">Expenses</h3>
        ${data.expenses.length ? `<ul class="plain-list mb">${data.expenses.slice().reverse().map(ex => {
          const paidBy = data.members.find(m => m.id === ex.paid_by);
          const mine = ex.paid_by === g.myMemberId && !/^Settlement:/.test(ex.description || '');
          return `<li class="gx-row"><div class="gx-main">${esc(ex.description)}<br><span class="small muted">Paid by ${paidBy ? esc(paidBy.name) : 'Someone'} · ${fmtExact(Number(ex.amount))}</span></div>${mine ? `<span class="gx-act no-print"><button type="button" class="icon-btn" data-action="group-edit-expense" data-group-id="${groupId}" data-ex-id="${esc(String(ex.id))}" aria-label="Edit ${esc(ex.description)}">${ICON.edit}</button><button type="button" class="icon-btn danger" data-action="group-del-expense" data-group-id="${groupId}" data-ex-id="${esc(String(ex.id))}" aria-label="Delete ${esc(ex.description)}">${ICON.trash}</button></span>` : ''}</li>`;
        }).join('')}</ul>` : '<p class="small muted">No expenses yet.</p>'}
        ${(state.groupRecurring || []).filter(r => r.groupId === groupId).length ? `<h3 style="margin-top:10px">Repeats every month</h3><ul class="plain-list mb">${state.groupRecurring.filter(r => r.groupId === groupId).map(r => `<li class="gx-row"><div class="gx-main">${esc(r.desc)}<br><span class="small muted">${fmtExact(r.amount)} on day ${r.day}</span></div><span class="gx-act no-print"><button type="button" class="btn btn-sm" data-action="group-stop-repeat" data-id="${r.id}">Stop</button></span></li>`).join('')}</ul>` : ''}
        <p class="small muted">You can edit or delete expenses you paid for.</p>
      `,
      onSubmit: () => { closeModal(true); return false; }
    });
  },
  'group-add-expense': el => groupExpenseForm(el.dataset.id),
  'group-edit-expense': el => groupExpenseForm(el.dataset.groupId, el.dataset.exId),
  'group-del-expense': el => groupDeleteExpense(el.dataset.groupId, el.dataset.exId),
  'group-stop-repeat': el => {
    const r = (state.groupRecurring || []).find(x => x.id === el.dataset.id); if (!r) return;
    state.groupRecurring = state.groupRecurring.filter(x => x !== r); commit(); toast(`“${r.desc}” won’t repeat any more`);
    const btn = document.createElement('button'); btn.dataset.id = r.groupId; GROUP_ACTIONS['group-view'](btn);
  },
  'group-share-upi': el => {
    const inp = document.getElementById('grp-my-upi'); if (!inp) return;
    const val = inp.value.trim();
    if (!isUpiId(val)) { toast('That doesn’t look like a UPI ID. It should look like name@bank.'); return; }
    state.settings.myUpiId = val.slice(0, 60); save();
    GroupSync.shareMyUpi(val).then(ok => { if (ok) toast('UPI ID shared with your groups'); });
  },
  'group-settle': el => {
    // Settle a balance within a group using the Session 4 UPI logic
    const groupId = el.dataset.groupId;
    const personName = el.dataset.person;
    const amount = Number(el.dataset.amount);
    const dir = el.dataset.dir; // 'owe' or 'owed'

    const gm = ((state.groupData[groupId] || {}).members || []).find(m => m.name === personName);
    const opts = { dir: dir === 'owed' ? 'owed' : 'owe', person: personName, amount, note: 'Settle up for group', upi: gm && isUpiId(gm.upi_id) ? gm.upi_id : '', group: true };

    const buildModalContent = () => {
      const myUpi = state.settings.myUpiId || '';
      const shareMsg = dir === 'owed'
        ? `Hey ${personName}, please send ₹${amount} for our group.${isUpiId(myUpi) ? ` My UPI: ${myUpi}` : ''}`
        : `Hey ${personName}, sending my group share of ₹${amount} now.`;

      return `
        <div class="stack" id="su-wrap" style="text-align:center">
          <div class="card stat stat-big ${dir === 'owed' ? 'tone-success' : 'tone-danger'}" style="margin-bottom:12px">
            <p class="stat-label">${dir === 'owed' ? `${esc(personName)} owes you` : `You owe ${esc(personName)}`}</p>
            <p class="stat-value">${fmt(amount)}</p>
          </div>

          ${upiSectionHTML(opts)}

          <div class="card mb" style="padding:10px;text-align:left;background:var(--surface-2)">
            <p class="small font-bold" style="margin-bottom:4px">Share message:</p>
            <p class="small" style="background:var(--surface);padding:8px;border-radius:6px;margin-bottom:8px">${esc(shareMsg)}</p>
            <button type="button" class="btn btn-sm" id="su-copy-msg" data-msg="${esc(shareMsg)}">📋 Copy message</button>
          </div>

          <div style="border-top:1px solid var(--border);padding-top:12px">
            <button type="button" class="btn btn-primary" id="su-mark-settled" style="width:100%">✓ Record settlement in group</button>
          </div>
        </div>
      `;
    };

    openModal({
      title: `Settle up with ${esc(personName)}`,
      hideSubmit: true,
      cancelLabel: 'Close',
      body: buildModalContent(),
      onMount: form => {
        const bind = () => {
          const body = form.querySelector('.modal-body');
          bindUpiSection(body, opts, () => { body.innerHTML = buildModalContent(); bind(); });
          const copyMsgBtn = form.querySelector('#su-copy-msg');
          const settleBtn = form.querySelector('#su-mark-settled');

          if (copyMsgBtn) copyMsgBtn.addEventListener('click', () => copyText(copyMsgBtn.dataset.msg, 'Message copied'));
          if (settleBtn) {
            settleBtn.addEventListener('click', () => {
              // Record settlement as a group expense where the payer pays the payee
              const data = state.groupData[groupId];
              const myMember = data.members.find(m => m.id === state.groups.find(g => g.id === groupId).myMemberId);
              const otherMember = data.members.find(m => m.name === personName);
              
              if (myMember && otherMember) {
                const payer = dir === 'owe' ? myMember : otherMember;
                const payee = dir === 'owe' ? otherMember : myMember;
                
                const splits = {};
                splits[payee.id] = amount; // Payee benefits 100% from this payment
                
                GroupSync.addExpense(groupId, `Settlement: ${payer.name} paid ${payee.name}`, amount, splits);
                
                // Note: since this is a settlement, the payer's paid += amount, and the payee's share += amount.
                // Thus the net balance converges by `amount`. 
              }
              closeModal(true);
              commit();
              toast('Settlement recorded');
              playSound('coin');
            });
          }
        };
        bind();
      }
    });
  }
};
