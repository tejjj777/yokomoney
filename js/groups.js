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
      this.loading = Promise.race([load, timer]).then(() => {
        if (!window.supabase) return false;
        this.init();
        return !!this.client;
      }).catch(err => { console.warn('Live groups unavailable:', err.message); this.loading = null; return false; });
    }
    return this.loading;
  },
  init() {
    if (!window.supabase || this.client) return;
    this.client = window.supabase.createClient(SYNC_URL, SYNC_KEY);
    this.signIn().catch(err => console.warn('Group sign-in failed', err));
    
    window.addEventListener('online', () => this.processQueue());
    
    if (state.groups) {
      state.groups.forEach(g => this.subscribe(g.id));
    }
  },

  async signIn() {
    const { data: { session } } = await this.client.auth.getSession();
    if (!session) {
      await this.client.auth.signInAnonymously();
    }
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
      save();
      if (currentRoute() === 'split') render();
    } catch (err) {
      console.error('Failed to fetch group data', err);
    }
  },

  async createGroup(name, myName) {
    const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data: group, error } = await this.client.from('groups').insert({ name, join_code: joinCode }).select().single();
    if (error) throw error;
    
    const { data: member, error: memberErr } = await this.client.from('group_members').insert({
      group_id: group.id,
      user_id: (await this.client.auth.getSession()).data.session.user.id,
      name: myName
    }).select().single();
    if (memberErr) throw memberErr;
    
    state.groups.push({ id: group.id, name: group.name, joinCode: group.join_code, myMemberId: member.id });
    save();
    this.subscribe(group.id);
    return group;
  },

  async joinGroup(joinCode, myName) {
    const { data: groupId, error } = await this.client.rpc('join_group', { code: joinCode.toUpperCase(), member_name: myName });
    if (error) throw error;
    
    const { data: group } = await this.client.from('groups').select('*').eq('id', groupId).single();
    const { data: member } = await this.client.from('group_members').select('*').eq('group_id', groupId).eq('user_id', (await this.client.auth.getSession()).data.session.user.id).single();
    
    if (!state.groups.find(g => g.id === groupId)) {
      state.groups.push({ id: groupId, name: group.name, joinCode: group.join_code, myMemberId: member.id });
      save();
      this.subscribe(groupId);
    }
  },

  addExpense(groupId, description, amount, splitDetails) {
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
        <ul class="plain-list mb">${data.members.map(m => `<li>${esc(m.name)} ${m.id === g.myMemberId ? '(You)' : ''}</li>`).join('')}</ul>
        
        <h3 style="margin-top:10px">Balances</h3>
        <div class="table-wrap mb"><table>
          <thead><tr><th>Person</th><th>Paid</th><th>Share</th><th>Net</th><th></th></tr></thead>
          <tbody>
            ${balances.map(b => {
              const myId = g.myMemberId;
              let settleBtn = '';
              if (b.id !== myId && b.net !== 0) {
                // b.net > 0 means they paid more than their share (so someone owes them)
                // Wait, our groupBalances: net = paid - share. 
                // So if b.net > 0, they are owed money. If I'm paying them, I "owe" them.
                const dir = b.net > 0 ? 'owe' : 'owed'; // from my perspective, if they are owed money, I owe them
                settleBtn = `<button type="button" class="btn btn-sm btn-primary" data-action="group-settle" data-group-id="${groupId}" data-person="${esc(b.name)}" data-amount="${Math.abs(b.net)}" data-dir="${dir}">Settle</button>`;
              }
              return `<tr><td>${esc(b.name)}</td><td>${fmt(b.paid)}</td><td>${fmt(b.share)}</td>
              <td class="num ${b.net > 0 ? 'tone-success-text' : b.net < 0 ? 'tone-danger-text' : ''}">${b.net > 0 ? '+' : ''}${fmt(b.net)}</td>
              <td class="actions no-print">${settleBtn}</td></tr>`;
            }).join('')}
          </tbody>
        </table></div>

        <h3 style="margin-top:10px">Expenses</h3>
        ${data.expenses.length ? `<ul class="plain-list mb">${data.expenses.slice().reverse().map(ex => {
          const paidBy = data.members.find(m => m.id === ex.paid_by);
          return `<li>${esc(ex.description)} <br><span class="small muted">Paid by ${paidBy ? esc(paidBy.name) : 'Someone'} · ${fmt(ex.amount)}</span></li>`;
        }).join('')}</ul>` : '<p class="small muted">No expenses yet.</p>'}
      `,
      onSubmit: () => { closeModal(true); return false; }
    });
  },
  'group-add-expense': el => {
    const groupId = el.dataset.id;
    const data = state.groupData[groupId];
    if (!data || !data.members || !data.members.length) return;
    
    // Equal split form by default
    formModal({
      title: 'Add group expense', submitLabel: 'Add',
      values: { desc: '', amount: '' },
      fields: [
        { name: 'desc', label: 'What for?', kind: 'text', required: true },
        { name: 'amount', label: 'Total Amount', kind: 'money', required: true, positive: true }
      ],
      onSave: (v) => {
        const perPerson = Math.round(v.amount / data.members.length * 100) / 100;
        const splits = {};
        data.members.forEach(m => { splits[m.id] = perPerson; });
        GroupSync.addExpense(groupId, v.desc, v.amount, splits);
        toast('Expense added to group');
      }
    });
  },
  'group-settle': el => {
    // Settle a balance within a group using the Session 4 UPI logic
    const groupId = el.dataset.groupId;
    const personName = el.dataset.person;
    const amount = Number(el.dataset.amount);
    const dir = el.dataset.dir; // 'owe' or 'owed'

    const note = `Settle up for group`;
    let currentUpi = (state.wallet.upiIds && state.wallet.upiIds[personName]) || '';

    const buildModalContent = (upiId) => {
      const upiUrl = upiId ? F.buildUpiUrl({ pa: upiId, pn: personName, am: amount, cu: 'INR', tn: note }) : '';
      const qrSvg = upiUrl ? QRCode.toSvg(upiUrl, 160) : '';

      const shareMsg = dir === 'owed'
        ? `Hey ${personName}, please settle ₹${amount} for our group. UPI: ${upiId || '<your-upi-id>'}`
        : `Hey ${personName}, I'm ready to pay my group share of ₹${amount}.`;

      return `
        <div class="stack" id="su-wrap" style="text-align:center">
          <div class="card stat stat-big ${dir === 'owed' ? 'tone-success' : 'tone-danger'}" style="margin-bottom:12px">
            <p class="stat-label">${dir === 'owed' ? `${esc(personName)} owes you` : `You owe ${esc(personName)}`}</p>
            <p class="stat-value">${fmt(amount)}</p>
          </div>

          <div class="field" style="text-align:left;margin-bottom:14px">
            <label for="su-upi-input" class="small"><strong>${esc(personName)}'s UPI ID:</strong></label>
            <div class="row" style="gap:6px">
              <input type="text" id="su-upi-input" class="input" value="${esc(upiId)}">
              <button type="button" class="btn btn-sm" id="su-save-upi">Save</button>
            </div>
          </div>

          ${upiUrl ? `
            <div class="card mb" style="padding:14px;background:var(--surface);display:flex;flex-direction:column;align-items:center;gap:10px">
              <div class="su-qr-frame" style="background:#fff;padding:8px;border-radius:8px;">${qrSvg}</div>
              <div class="row" style="gap:8px;justify-content:center;flex-wrap:wrap">
                <a href="${upiUrl}" class="btn btn-primary" target="_blank" rel="noopener">⚡ Pay via UPI App</a>
                <button type="button" class="btn" id="su-copy-link" data-url="${esc(upiUrl)}">Copy Link</button>
              </div>
            </div>
          ` : `
            <div class="alert alert-info small" style="margin-bottom:12px">Enter a UPI ID above to generate a QR code.</div>
          `}

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
      body: buildModalContent(currentUpi),
      onMount: form => {
        const bind = (upi) => {
          const upiInp = form.querySelector('#su-upi-input');
          const saveBtn = form.querySelector('#su-save-upi');
          const copyLinkBtn = form.querySelector('#su-copy-link');
          const copyMsgBtn = form.querySelector('#su-copy-msg');
          const settleBtn = form.querySelector('#su-mark-settled');

          const persistUpi = () => {
            const val = upiInp.value.trim();
            state.wallet.upiIds = state.wallet.upiIds || {};
            state.wallet.upiIds[personName] = val;
            commit();
            toast(`Saved UPI ID`);
            form.querySelector('.modal-body').innerHTML = buildModalContent(val);
            bind(val);
          };

          if (saveBtn) saveBtn.addEventListener('click', persistUpi);
          if (copyLinkBtn) {
            copyLinkBtn.addEventListener('click', () => {
              navigator.clipboard.writeText(copyLinkBtn.dataset.url).then(() => toast('Copied!'));
            });
          }
          if (copyMsgBtn) {
            copyMsgBtn.addEventListener('click', () => {
              navigator.clipboard.writeText(copyMsgBtn.dataset.msg).then(() => toast('Copied!'));
            });
          }
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
        bind(currentUpi);
      }
    });
  }
};
