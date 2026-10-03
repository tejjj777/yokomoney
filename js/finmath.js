/* FINANCIAL MATH + parsing. Pure functions only: no DOM access, no app state, no rounding.
   Exposes the global FinMath. Money is rounded only when it is displayed or exported. */
const FinMath = (() => {
  'use strict';

  /** Multipliers that turn one pay period into a monthly amount. */
  const PAY_FREQUENCIES = {
    weekly: 52 / 12,
    biweekly: 26 / 12,
    semimonthly: 2,
    monthly: 1,
    yearly: 1 / 12
  };
  const MAX_MONTHS = 600;   // simulation cap (50 years)
  const EPS = 1e-9;

  const isNum = v => typeof v === 'number' && Number.isFinite(v);

  /** Convert an amount paid at `freq` into its monthly equivalent. */
  function toMonthly(amount, freq) {
    const f = PAY_FREQUENCIES[freq];
    if (!isNum(amount) || !f) return 0;
    return amount * f;
  }

  /** Net pay = gross − deductions. Deductions are fixed amounts or % of gross. No tax brackets. */
  function netFromGross(gross, deductions) {
    const g = isNum(gross) ? gross : 0;
    let total = 0;
    for (const d of deductions || []) {
      const v = isNum(d.value) ? d.value : 0;
      total += d.mode === 'percent' ? g * v / 100 : v;
    }
    return { net: g - total, totalDeductions: total };
  }

  /** Annual % → monthly decimal rate. */
  function monthlyRate(annualPct) { return (isNum(annualPct) ? annualPct : 0) / 12 / 100; }

  /** EMI = P × r × (1+r)^n / ((1+r)^n − 1); r = annual/12/100. Zero-rate loans split evenly. */
  function emi(principal, annualPct, months) {
    if (!(principal > 0) || !(months > 0)) return 0;
    const r = monthlyRate(annualPct);
    if (r === 0) return principal / months;
    const f = Math.pow(1 + r, months);
    return principal * r * f / (f - 1);
  }

  /** Month-by-month schedule for a fixed-EMI loan. The final row absorbs float drift. */
  function amortizationSchedule(principal, annualPct, months) {
    const payment = emi(principal, annualPct, months);
    const r = monthlyRate(annualPct);
    const rows = [];
    let bal = principal > 0 ? principal : 0;
    for (let m = 1; m <= months && bal > EPS; m++) {
      const interest = bal * r;
      let principalPart = payment - interest;
      let pay = payment;
      if (m === months || principalPart > bal) { principalPart = bal; pay = bal + interest; }
      bal -= principalPart;
      if (Math.abs(bal) < 1e-7) bal = 0;
      rows.push({ month: m, payment: pay, interest, principal: principalPart, balance: bal });
    }
    const totalInterest = rows.reduce((s, x) => s + x.interest, 0);
    const totalPaid = rows.reduce((s, x) => s + x.payment, 0);
    return { payment, rows, totalInterest, totalPaid };
  }

  /** True when the payment can't even cover one month of interest. */
  function neverPaysOff(balance, annualPct, payment) {
    if (!(balance > 0)) return false;
    return !(payment > balance * monthlyRate(annualPct));
  }

  /** Months to clear one balance at a fixed payment (Infinity if it never clears). */
  function monthsToPayoff(balance, annualPct, payment) {
    if (!(balance > 0)) return 0;
    if (neverPaysOff(balance, annualPct, payment)) return Infinity;
    const r = monthlyRate(annualPct);
    if (r === 0) return Math.ceil(balance / payment - EPS);
    const n = -Math.log(1 - r * balance / payment) / Math.log(1 + r);
    return Math.ceil(n - 1e-7);
  }

  /** Priority order. Avalanche: highest rate first. Snowball: smallest balance first. */
  function payoffOrder(debts, strategy) {
    const list = debts.slice();
    if (strategy === 'snowball') list.sort((a, b) => (a.balance - b.balance) || (b.rate - a.rate));
    else list.sort((a, b) => (b.rate - a.rate) || (a.balance - b.balance));
    return list.map(d => d.id);
  }

  /**
   * Simulate paying off several debts.
   *  - 'minimum'  : each debt gets only its own minimum; nothing rolls over.
   *  - 'avalanche' / 'snowball': a fixed monthly budget (sum of minimums + extra).
   *    Minimums are paid first, the rest goes to the priority debt. When a debt
   *    is cleared its minimum rolls into the budget for the next one.
   * Interest accrues monthly before payments. Capped at `maxMonths`.
   */
  function simulatePayoff(debts, extra, strategy, maxMonths = MAX_MONTHS) {
    const active = (debts || []).filter(d => d.balance > 0);
    const bal = {}, interestBy = {}, payoffMonth = {};
    active.forEach(d => { bal[d.id] = d.balance; interestBy[d.id] = 0; payoffMonth[d.id] = null; });
    const order = payoffOrder(active, strategy === 'minimum' ? 'avalanche' : strategy);
    const minTotal = active.reduce((s, d) => s + (d.minPayment > 0 ? d.minPayment : 0), 0);
    const monthlyBudget = minTotal + (strategy === 'minimum' ? 0 : Math.max(0, isNum(extra) ? extra : 0));
    const rows = [];
    let totalInterest = 0, totalPaid = 0, month = 0;
    const anyLeft = () => active.some(d => bal[d.id] > EPS);

    while (anyLeft() && month < maxMonths) {
      month++;
      let mInterest = 0, mPaid = 0;
      const paid = {};
      for (const d of active) {                       // 1. interest accrues
        paid[d.id] = 0;
        if (bal[d.id] <= EPS) continue;
        const i = bal[d.id] * monthlyRate(d.rate);
        bal[d.id] += i; interestBy[d.id] += i; mInterest += i;
      }
      for (const d of active) {                       // 2. minimum payments
        if (bal[d.id] <= EPS) continue;
        const p = Math.min(Math.max(0, d.minPayment), bal[d.id]);
        bal[d.id] -= p; paid[d.id] += p; mPaid += p;
      }
      if (strategy !== 'minimum') {                   // 3. extra + rolled-over minimums
        let left = monthlyBudget - mPaid;
        for (const id of order) {
          if (left <= EPS) break;
          if (bal[id] <= EPS) continue;
          const p = Math.min(left, bal[id]);
          bal[id] -= p; paid[id] += p; left -= p; mPaid += p;
        }
      }
      for (const d of active) {
        if (bal[d.id] <= 1e-7) { bal[d.id] = 0; if (payoffMonth[d.id] === null) payoffMonth[d.id] = month; }
      }
      totalInterest += mInterest; totalPaid += mPaid;
      rows.push({
        month, interest: mInterest, payment: mPaid, principal: mPaid - mInterest,
        balances: Object.assign({}, bal), paid,
        totalBalance: active.reduce((s, d) => s + bal[d.id], 0)
      });
    }
    return {
      strategy, order, months: month, paidOff: !anyLeft(), totalInterest, totalPaid, rows,
      payoffMonth, interestBy, monthlyBudget, minTotal,
      startBalance: active.reduce((s, d) => s + d.balance, 0)
    };
  }

  /**
   * Required monthly saving to reach `target` in `months`.
   * FV = PV(1+r)^n + PMT × ((1+r)^n − 1)/r  →  PMT = (FV − PV(1+r)^n) × r / ((1+r)^n − 1)
   * If r = 0: PMT = (FV − PV)/n.  Returns 0 if interest alone gets there, NaN if no time is left.
   */
  function requiredMonthlySaving(target, saved, annualPct, months) {
    if (!(target > 0) || saved >= target) return 0;
    if (!(months > 0)) return NaN;
    const r = monthlyRate(annualPct);
    if (r === 0) return (target - saved) / months;
    const f = Math.pow(1 + r, months);
    return Math.max(0, (target - saved * f) * r / (f - 1));
  }

  /** Balance after `months` of end-of-month deposits `pmt`. */
  function futureValue(saved, annualPct, pmt, months) {
    const r = monthlyRate(annualPct);
    if (r === 0) return saved + pmt * months;
    const f = Math.pow(1 + r, months);
    return saved * f + pmt * (f - 1) / r;
  }

  /** Reverse mode: months until `target` is reached saving `pmt`/month (Infinity if never). */
  function monthsToReachGoal(target, saved, annualPct, pmt) {
    if (saved >= target) return 0;
    const p = isNum(pmt) && pmt > 0 ? pmt : 0;
    const r = monthlyRate(annualPct);
    if (r === 0) return p > 0 ? Math.ceil((target - saved) / p - 1e-9) : Infinity;
    const den = saved + p / r;
    if (!(den > 0)) return Infinity;
    const n = Math.log((target + p / r) / den) / Math.log(1 + r);
    return Number.isFinite(n) ? Math.max(0, Math.ceil(n - 1e-9)) : Infinity;
  }

  /** Month-by-month projected balance, index 0 = today. */
  function projectBalance(saved, annualPct, pmt, months) {
    const r = monthlyRate(annualPct);
    const out = [saved];
    let b = saved;
    for (let i = 1; i <= months; i++) { b = b * (1 + r) + pmt; out.push(b); }
    return out;
  }

  /* ---------- Date helpers (local time, pure) ---------- */
  function parseDate(s) {
    if (typeof s !== 'string') return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? d : null;
  }
  const pad = n => String(n).padStart(2, '0');
  function toISO(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function addMonths(d, n) {
    const y = d.getFullYear(), m = d.getMonth() + n;
    const last = new Date(y, m + 1, 0).getDate();
    return new Date(y, m, Math.min(d.getDate(), last));
  }
  function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / 864e5); }
  /** Whole months from `from` to `to`; at least 1 if `to` is in the future, 0 if past. */
  function monthsBetween(from, to) {
    if (startOfDay(to) <= startOfDay(from)) return 0;
    let m = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
    if (to.getDate() < from.getDate()) m--;
    return Math.max(1, m);
  }
  /** Roll a known pay date forward by its frequency until it is today or later. */
  function nextPayday(anchor, freq, today) {
    if (!anchor) return null;
    const step = k => {
      switch (freq) {
        case 'weekly': return addDays(anchor, 7 * k);
        case 'biweekly': return addDays(anchor, 14 * k);
        case 'semimonthly': return k % 2 === 0 ? addMonths(anchor, k / 2) : addDays(addMonths(anchor, (k - 1) / 2), 15);
        case 'yearly': return addMonths(anchor, 12 * k);
        default: return addMonths(anchor, k);
      }
    };
    let k = 0, d = anchor;
    while (startOfDay(d) < startOfDay(today) && k < 10000) { k++; d = step(k); }
    return d;
  }
  /** Same date if it's still ahead; otherwise its next yearly repeat. */
  function nextAnnualOccurrence(date, today) {
    if (startOfDay(date) >= startOfDay(today)) return date;
    const mk = y => new Date(y, date.getMonth(), Math.min(date.getDate(), new Date(y, date.getMonth() + 1, 0).getDate()));
    let c = mk(today.getFullYear());
    if (startOfDay(c) < startOfDay(today)) c = mk(today.getFullYear() + 1);
    return c;
  }

  /** Round-up jar: spare change to the next multiple of `to` (0 if already round). */
  function roundUpAmount(amount, to) {
    if (!(amount > 0) || !(to > 0)) return 0;
    return Math.ceil(amount / to - 1e-9) * to - amount;
  }
  /** Rule of 72: approximate years for money to double at an annual %. */
  function ruleOf72(annualPct) { return annualPct > 0 ? 72 / annualPct : Infinity; }
  /** Days left in the month, counting today. */
  function daysLeftInMonth(today) { return new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate() + 1; }
  /** No-spend streaks from `start` to `today` (inclusive). `spendDays` = Set of ISO dates with "want" spending. */
  function streaks(spendDays, start, today) {
    const s = startOfDay(start), t = startOfDay(today);
    if (s > t) return { current: 0, longest: 0 };
    let run = 0, longest = 0;
    for (let d = s; d <= t; d = addDays(d, 1)) {
      if (spendDays.has(toISO(d))) run = 0;
      else { run++; if (run > longest) longest = run; }
    }
    return { current: run, longest };
  }


  /* ---------- Tax year ---------- */
  /** Tax year containing `today`, starting on the 1st of `startMonth` (1–12). India = 4 (April). */
  function taxYear(today, startMonth) {
    const m = (startMonth || 1) - 1;
    const y = today.getMonth() >= m ? today.getFullYear() : today.getFullYear() - 1;
    return { start: new Date(y, m, 1), end: new Date(y + 1, m, 0), year: y };
  }

  /* ---------- Payslip text → numbers ----------
     Works on the text of a digital payslip (Indian and most US/UK layouts).
     Every figure is only a suggestion: the app always shows them for review first. */
  const MONTHS3 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  function isoDate(y, m, d) {
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? toISO(dt) : null;
  }
  function stripDates(s) {
    return s
      .replace(/\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b/g, ' ')
      .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
      .replace(new RegExp('\\b\\d{1,2}(?:st|nd|rd|th)?[\\s\\-]*' + MONTH_RE + '[a-z]*\\.?[\\s,\\-\']*\\d{2,4}\\b', 'gi'), ' ')
      .replace(new RegExp('\\b' + MONTH_RE + '[a-z]*\\.?[\\s,\\-\']*\\d{2,4}\\b', 'gi'), ' ');
  }
  /** First standalone money amount in `s`. Skips percentages, day counts and ID-like numbers. */
  function firstAmount(s) {
    const re = /(^|[\s:=(|]|₹|rs\.?|inr|\$|usd|€|£)\s*(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?=$|[\s)|\/]|-)/gi;
    let m;
    while ((m = re.exec(s))) {
      const raw = m[2], rest = s.slice(re.lastIndex);
      if (/^\s*(%|days?\b|hrs?\b|hours?\b|months?\b|yrs?\b)/i.test(rest)) continue;
      if (!raw.includes(',') && raw.replace('.', '').length >= 9) continue;   // account/ID numbers
      return Number(raw.replace(/,/g, ''));
    }
    return null;
  }
  function findField(lines, patterns, mask) {
    for (const pat of patterns) {
      for (let i = 0; i < lines.length; i++) {
        const line = mask ? mask(lines[i]) : lines[i];
        const m = pat.exec(line);
        if (!m) continue;
        const after = line.slice(m.index + m[0].length);
        if (/^\s*[:\-.]?\s*(no\b|no\.|number|num\b|a\/c|acc(ount)?\b|uan\b|id\b|code\b)/i.test(after)) continue;   // "PF No: MH/…"
        let v = firstAmount(stripDates(after));
        if (v === null && i + 1 < lines.length && /^\s*(₹|rs\.?|inr|\$|€|£)?\s*\d/i.test(lines[i + 1])) v = firstAmount(stripDates(lines[i + 1]));   // value on the next line
        if (v !== null) return v;
      }
    }
    return null;
  }
  let DATE_ORDER = 'dmy';   // how to read 03/04: day-first (most of the world) or month-first (US)
  function setDateOrder(o) { DATE_ORDER = o === 'mdy' ? 'mdy' : 'dmy'; }
  function parseLooseDate(s) {
    let m = /(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/.exec(s);
    if (m) return isoDate(+m[1], +m[2], +m[3]);
    m = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/.exec(s);
    if (m) {
      let a = +m[1], b = +m[2], y = +m[3];
      if (y < 100) y += 2000;
      const monthFirst = DATE_ORDER === 'mdy' ? a <= 12 : (b > 12 && a <= 12);
      return monthFirst ? isoDate(y, a, b) : isoDate(y, b, a);
    }
    m = new RegExp('(\\d{1,2})(?:st|nd|rd|th)?[\\s\\-]*' + MONTH_RE + '[a-z]*\\.?[\\s,\\-\']*(\\d{2,4})', 'i').exec(s);
    if (m) { let y = +m[3]; if (y < 100) y += 2000; return isoDate(y, MONTHS3.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, +m[1]); }
    m = new RegExp(MONTH_RE + '[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})', 'i').exec(s);
    if (m) return isoDate(+m[3], MONTHS3.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, +m[2]);
    return null;
  }
  function findPayDate(text) {
    const m = /(pay\s*date|payment\s*date|date\s*of\s*payment|paid\s*on|credited\s*on|pay\s*day)\s*[:\-]?\s*([^\n]{6,24})/i.exec(text);
    return m ? parseLooseDate(m[2]) : null;
  }
  function findMonth(text) {
    const lab = new RegExp('(pay\\s*(?:period|month|slip)|salary\\s*(?:slip|month|statement)|payslip|month)[^\\n]{0,32}?\\b' + MONTH_RE + '[a-z]*\\.?[\\s,\\-\']*(\\d{4}|\\d{2})\\b', 'i');
    let m = lab.exec(text);
    if (!m) m = new RegExp('()\\b' + MONTH_RE + '[a-z]*\\.?[\\s,\\-\']*(20\\d{2})\\b', 'i').exec(text);
    if (!m) return null;
    const mi = MONTHS3.indexOf(m[2].slice(0, 3).toLowerCase());
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    return mi >= 0 ? `${y}-${String(mi + 1).padStart(2, '0')}` : null;
  }
  function findEmployer(lines) {
    const co = /(pvt|private|ltd|limited|llp|\binc\b|corp|company|technolog|solutions|services|industries|enterprises|labs|consult)/i;
    for (const l of lines.slice(0, 8)) {
      const t = l.split(/\s{2,}/)[0].trim();
      if (co.test(t) && t.length <= 80 && !/payslip|salary|statement/i.test(t)) return t;
    }
    return null;
  }
  /** Several deductions that belong in one box (e.g. Social Security + Medicare + state tax): add them up. */
  function sumFields(lines, patterns) {
    const used = new Set();
    let total = 0, any = false;
    for (const pat of patterns) {
      const re = new RegExp(pat.source, 'gi');
      for (let i = 0; i < lines.length; i++) {
        re.lastIndex = 0;
        let m, hit = false;
        while ((m = re.exec(lines[i]))) {
          const key = i + ':' + m.index;
          if (used.has(key)) continue;
          const v = firstAmount(stripDates(lines[i].slice(m.index + m[0].length)));
          if (v !== null) { used.add(key); total += v; any = true; hit = true; break; }
        }
        if (hit) break;
      }
    }
    return any ? total : null;
  }
  function parsePayslip(input) {
    const lines = (Array.isArray(input) ? input : String(input || '').split(/\r?\n/))
      .map(l => String(l).replace(/ /g, ' ').trim()).filter(Boolean);
    const text = lines.join('\n');
    const maskPT = l => l.replace(/prof(?:essional|\.)?\s*tax|\bp\.?\s?tax\b|(?:state|local|city|provincial)\s+(?:income\s+)?tax|national\s+insurance/gi, '###');
    const r = {
      gross: findField(lines, [/total\s+earnings?/i, /gross\s+(earnings?|salary|pay|wages|amount|total)/i, /\bgross\b(?!\s*deduct)/i]),
      net: findField(lines, [/net\s*(pay(able)?|salary|amount(\s*payable)?|take[\s-]*home)/i, /take[\s-]*home(\s*pay)?/i, /amount\s+(credited|paid|payable)/i, /\bnet\b/i]),
      totalDeductions: findField(lines, [/total\s+deductions?/i, /gross\s+deductions?/i, /deductions?\s+total/i]),
      pt: sumFields(lines, [/professional\s*tax|prof\.?\s*tax|\bp\.?\s?tax\b/i, /national\s+insurance|\bn\.?i\.?\s+(?:ee|employee|contribution)/i, /social\s+security|\boasdi\b/i, /medicare/i, /\bfica\b/i,
        /(?:state|local|city|provincial)\s+(?:income\s+)?tax/i, /\bcpp\b|canada\s+pension/i, /\bei\s+(?:premium|contribution)|employment\s+insurance/i, /\bsdi\b/i]),
      tax: findField(lines, [/income\s*tax/i, /\bt\.?\s?d\.?\s?s\b/i, /tax\s+deducted(\s+at\s+source)?/i, /withholding(\s+tax)?/i, /federal\s+(income\s+)?tax/i, /\bpaye\b/i], maskPT),
      pf: findField(lines, [/employee'?s?\s*(pf|provident\s*fund|epf)/i, /provident\s*fund/i, /\bepf\b/i, /\bp\.?\s?f\b/i, /\b401\s?\(?k\)?/i, /\bnps\b/i, /\bpension\b/i, /superannuation/i, /\brrsp\b/i, /\bcpf\b/i, /retirement/i], maskPT),
      esi: findField(lines, [/\besic?\b/i, /employee'?s?\s+state\s+insurance/i, /(health|medical|dental|group|term|life)\s+insurance/i, /\binsurance\b/i], maskPT),
      payDate: findPayDate(text),
      employer: findEmployer(lines)
    };
    r.month = findMonth(text) || (r.payDate ? r.payDate.slice(0, 7) : null);
    const found = {};
    for (const k of ['gross', 'net', 'tax', 'pf', 'pt', 'esi', 'totalDeductions', 'month', 'payDate', 'employer']) found[k] = r[k] !== null;
    const calculated = {};
    if (r.totalDeductions === null && r.gross !== null && r.net !== null && r.gross >= r.net) { r.totalDeductions = r.gross - r.net; calculated.totalDeductions = true; }
    if (r.net === null && r.gross !== null && r.totalDeductions !== null) { r.net = r.gross - r.totalDeductions; calculated.net = true; }
    if (r.gross === null && r.net !== null && r.totalDeductions !== null) { r.gross = r.net + r.totalDeductions; calculated.gross = true; }
    const known = (r.tax || 0) + (r.pf || 0) + (r.pt || 0) + (r.esi || 0);
    r.other = r.totalDeductions !== null ? Math.max(0, r.totalDeductions - known) : 0;
    if (r.other < 0.5) r.other = 0;
    r.found = found;
    r.calculated = calculated;
    r.warning = r.gross !== null && r.net !== null && r.net > r.gross ? 'Net pay is higher than gross, which can’t be right. Check these numbers.' : '';
    return r;
  }


  /* ---------- Bank SMS, statements, auto-categorising ---------- */
  /** "1,234.50" or European "1.234,50" → 1234.5 */
  const toNum = s => {
    let t = String(s).replace(/[\s']/g, '');
    if (/,\d{1,2}$/.test(t) && !/\.\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    return Number(t.replace(/,/g, ''));
  };
  const CUR_RE = "(?:rs\\.?|inr|₹|us\\$|\\$|usd|€|eur|£|gbp|aed|dhs?|sar|c\\$|cad|a\\$|aud|nz\\$|nzd|s\\$|sgd|¥|jpy|cny|rmb|hk\\$|hkd|₩|krw|chf|kr|sek|nok|dkk|zł|pln|₺|try|r\\$|brl|mx\\$|mxn|zar|₦|ngn|ksh|kes|pkr|bdt|৳|lkr|egp|e£|₱|php|rm|myr|rp|idr|฿|thb|₫|vnd)";
  const AMT_RE = '(\\d{1,3}(?:[,.\\s]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)';
  const DEBIT_WORDS = /\b(debited|spent|paid|sent|withdrawn|withdrawal|purchase|charged|used|txn of|transaction of|payment of|dr)\b/i;
  const CREDIT_WORDS = /\b(credited|received|deposited|deposit|refund(ed)?|cashback|reversed|reversal|cr)\b/i;
  const STOP = /\s+(?:not you|not u|avl|avbl|ref|refno|bal|call|if|sms|info|on|via|from|using|for|thru|through|dated|upi ref|txn|-\s)\b/i;
  function cleanMerchant(m) {
    if (!m) return '';
    let s = String(m).replace(/\s+/g, ' ').trim();
    const cut = STOP.exec(' ' + s); if (cut) s = (' ' + s).slice(0, cut.index).trim();
    if (s.includes('@')) s = s.split('@')[0];                     // swiggy@icici → swiggy
    s = s.replace(/^(vpa|upi|m\/s|ms|mr|mrs)\.?\s+/i, '').replace(/[.,;:\-\/]+$/, '').trim();
    if (!s || /^(a\/?c|acct|account|your|you|xx+\d*|\*+\d+|\d+|the|bank)\b/i.test(s)) return '';
    return s.slice(0, 50);
  }
  const SMS_DATE = /\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}[\s\-]?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-,']?\d{2,4})\b/gi;
  /** One bank / UPI SMS → { amount, type, merchant, date } (or null). */
  function parseSms(text, todayISO) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t) return null;
    const am = new RegExp(CUR_RE + '\\s*' + AMT_RE, 'i').exec(t) || new RegExp(AMT_RE + '\\s*' + CUR_RE + '(?![a-z])', 'i').exec(t)
      || /\b(?:debited|credited|spent|paid|sent|received|withdrawn)\s+(?:by|with|for|of)?\s*([\d,]+(?:\.\d{1,2})?)\b/i.exec(t)
      || /\b(\d{1,3}(?:,\d{2,3})+\.\d{2}|\d+\.\d{2})\b/.exec(t);
    if (!am) return null;
    const amount = toNum(am[1]);
    if (!(amount > 0)) return null;
    const d = DEBIT_WORDS.exec(t), c = CREDIT_WORDS.exec(t);
    const type = d && c ? (d.index <= c.index ? 'debit' : 'credit') : c ? 'credit' : 'debit';
    const NAME = "([A-Za-z0-9@._&'* -]{2,48})";
    const pats = type === 'credit'
      ? [new RegExp('\\bfrom\\s+(?:vpa\\s+)?' + NAME, 'i'), new RegExp('\\bby\\s+(?:vpa\\s+)?' + NAME, 'i'), /upi\/(?:p2[ma]\/)?\d+\/([A-Za-z][A-Za-z0-9 .&'-]{1,40})/i]
      : [/upi\/(?:p2[ma]\/)?\d+\/([A-Za-z][A-Za-z0-9 .&'-]{1,40})/i, /;\s*([A-Za-z][A-Za-z0-9 .&'-]{1,40}?)\s+credited/i,
        new RegExp('\\b(?:to|at|towards|bei|chez)\\s+(?:vpa\\s+)?' + NAME, 'i'), /info[:\s]+(?:upi\/)?(?:[a-z0-9]+\/)?(?:\d+\/)?([A-Za-z][A-Za-z0-9 .&'-]{1,30})/i];
    let merchant = '';
    for (const p of pats) {
      const re = new RegExp(p.source, 'gi'); let m;
      while ((m = re.exec(t))) { const v = cleanMerchant(m[1].split(/[.,;(]/)[0]); if (v) { merchant = v; break; } }
      if (merchant) break;
    }
    let date = null;
    for (const m of t.matchAll(SMS_DATE)) {
      date = parseLooseDate(m[1].replace(/(\d)([A-Za-z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2'));
      if (date) break;
    }
    return { amount, type, merchant: merchant || 'Bank SMS', date: date || todayISO, raw: t.slice(0, 160) };
  }
  /** Many SMS pasted together (blank-line or one-per-line). */
  function parseSmsBatch(text, todayISO) {
    const src = String(text || '').trim();
    if (!src) return [];
    let chunks = src.split(/\n\s*\n/);
    if (chunks.length === 1) {
      const lines = src.split(/\n/).map(s => s.trim()).filter(Boolean);
      if (lines.length > 1 && lines.filter(l => new RegExp(CUR_RE + '\\s*\\d', 'i').test(l)).length >= lines.length - 1) chunks = lines;
    }
    return chunks.map(c => parseSms(c, todayISO)).filter(Boolean);
  }
  function parseCsv(text) {
    const rows = []; let row = [], cell = '', q = false;
    const s = String(text || '').replace(/^﻿/, '');
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) {
        if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') q = false;
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',' || ch === '\t' || ch === ';') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  /** "1,234.50", "(1,234.50)", "1234.50 Dr", "-500" → signed number (null if empty). */
  function amountCell(v) {
    let s = String(v || '').trim();
    if (!s || s === '-') return null;
    let sign = 1;
    if (/^\(.*\)$/.test(s)) { sign = -1; s = s.slice(1, -1); }
    if (/\bdr\.?$/i.test(s)) { sign = -1; s = s.replace(/\bdr\.?$/i, ''); }
    s = s.replace(/\bcr\.?$/i, '').replace(/[₹$€£¥₩₱₦฿₫]|rs\.?|inr/gi, '').trim();
    if (/^-?\d{1,3}(\.\d{3})*,\d{1,2}$/.test(s) || /^-?\d+,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');   // European 1.234,56
    s = s.replace(/[,\s]/g, '');
    if (s.startsWith('-')) { sign = -sign; s = s.slice(1); }
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    return sign * Number(s);
  }
  /** Bank statement CSV → [{ date, amount, type, merchant }]. Works with debit/credit or signed-amount layouts. */
  function parseStatementCsv(text) {
    const rows = parseCsv(text).filter(r => r.some(c => String(c).trim()));
    const h = rows.slice(0, 40).findIndex(r => r.some(c => /date/i.test(c)) && r.some(c => /(debit|withdraw|amount|credit|deposit|\bdr\b|\bcr\b)/i.test(c)));
    if (h < 0) return [];
    const head = rows[h].map(c => String(c).trim().toLowerCase());
    const find = (re, not = []) => head.findIndex((c, i) => re.test(c) && !not.includes(i));
    const iType = find(/^(dr\s*\/\s*cr|cr\s*\/\s*dr|type|debit\s*\/\s*credit|transaction type)$/);
    const iDate = find(/(txn|transaction|posting|value)?\s*date/);
    const iDesc = find(/(description|narration|particulars|details|remarks|merchant|payee|name)/);
    const iDebit = find(/(debit|withdraw|\bdr\b|paid out|money out)/, [iType]);
    const iCredit = find(/(credit|deposit|\bcr\b|paid in|money in)/, [iType, iDebit]);
    const iAmt = find(/^(amount|amt|transaction amount|amount \(.*\))$/);
    const out = [];
    for (const r of rows.slice(h + 1)) {
      const date = parseLooseDate(String(r[iDate] || ''));
      if (!date) continue;
      let debit = iDebit >= 0 ? amountCell(r[iDebit]) : null, credit = iCredit >= 0 ? amountCell(r[iCredit]) : null;
      if (debit !== null) debit = Math.abs(debit);
      if (credit !== null) credit = Math.abs(credit);
      if ((debit === null || debit === 0) && (credit === null || credit === 0) && iAmt >= 0) {
        const a = amountCell(r[iAmt]);
        if (a !== null) {
          const tp = iType >= 0 ? String(r[iType]).toLowerCase() : '';
          if (/^(dr|debit|d)/.test(tp)) debit = Math.abs(a); else if (/^(cr|credit|c)/.test(tp)) credit = Math.abs(a);
          else if (a < 0) debit = -a; else credit = a;
        }
      }
      const merchant = String(iDesc >= 0 ? r[iDesc] : '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Bank transaction';
      if (debit > 0) out.push({ date, amount: debit, type: 'debit', merchant });
      else if (credit > 0) out.push({ date, amount: credit, type: 'credit', merchant });
    }
    return out;
  }
  /** Bank statement PDF text lines → transactions. Uses the running balance to tell debits from credits. */
  function parseStatementLines(lines) {
    const out = [];
    let prevBal = null;
    const moneyRe = /(\d{1,3}(?:,\d{2,3})+\.\d{2}|\d+\.\d{2})(\s*(?:cr|dr)\b)?/gi;
    for (const raw of lines) {
      const line = String(raw).replace(/\s+/g, ' ').trim();
      if (/opening balance|balance b\/f|brought forward/i.test(line)) {
        const ms = [...line.matchAll(moneyRe)];
        if (ms.length) prevBal = toNum(ms[ms.length - 1][1]);
        continue;
      }
      const dm = /^(\d{1,2}[\/\-. ](?:\d{1,2}|[A-Za-z]{3,9})[\/\-. ]\d{2,4})\s+/.exec(line);
      if (!dm) continue;
      const date = parseLooseDate(dm[1]);
      if (!date) continue;
      let rest = line.slice(dm[0].length).replace(/^(\d{1,2}[\/\-. ](?:\d{1,2}|[A-Za-z]{3,9})[\/\-. ]\d{2,4})\s+/, '');
      const ms = [...rest.matchAll(moneyRe)];
      if (!ms.length) continue;
      const desc = rest.slice(0, ms[0].index).replace(/\s+/g, ' ').trim().slice(0, 60) || 'Bank transaction';
      const amtM = ms.length >= 2 ? ms[ms.length - 2] : ms[0];
      const amount = toNum(amtM[1]);
      const bal = ms.length >= 2 ? toNum(ms[ms.length - 1][1]) : null;
      let type;
      if (amtM[2]) type = /cr/i.test(amtM[2]) ? 'credit' : 'debit';
      else if (bal !== null && prevBal !== null && Math.abs(bal - prevBal) > 0.001) type = bal < prevBal ? 'debit' : 'credit';
      else type = CREDIT_WORDS.test(desc) || /\b(salary|neft cr|imps cr|interest)\b/i.test(desc) ? 'credit' : 'debit';
      if (bal !== null) prevBal = bal;
      if (amount > 0) out.push({ date, amount, type, merchant: desc });
    }
    return out;
  }
  const DEFAULT_RULES = [
    ['swiggy', 'Food'], ['zomato', 'Food'], ['blinkit', 'Food'], ['zepto', 'Food'], ['bigbasket', 'Food'], ['instamart', 'Food'], ['dominos', 'Food'], ['mcdonald', 'Food'], ['starbucks', 'Food'], ['kfc', 'Food'], ['dmart', 'Food'],
    ['uber', 'Transport'], ['ola', 'Transport'], ['rapido', 'Transport'], ['irctc', 'Transport'], ['metro', 'Transport'], ['petrol', 'Transport'], ['fuel', 'Transport'], ['hpcl', 'Transport'], ['iocl', 'Transport'], ['bpcl', 'Transport'], ['fastag', 'Transport'], ['redbus', 'Transport'], ['indigo', 'Transport'],
    ['netflix', 'Subscriptions'], ['spotify', 'Subscriptions'], ['prime', 'Subscriptions'], ['hotstar', 'Subscriptions'], ['youtube', 'Subscriptions'], ['icloud', 'Subscriptions'], ['jiocinema', 'Subscriptions'],
    ['jio', 'Bills'], ['airtel', 'Bills'], ['bescom', 'Bills'], ['tsspdcl', 'Bills'], ['electricity', 'Bills'], ['broadband', 'Bills'], ['recharge', 'Bills'],
    ['rent', 'Rent'], ['amazon', 'Fun'], ['flipkart', 'Fun'], ['myntra', 'Fun'], ['bookmyshow', 'Fun'], ['pvr', 'Fun'], ['inox', 'Fun'], ['steam', 'Fun'], ['emi', 'EMIs'], ['loan', 'EMIs']
  ];
  /** Category name for a merchant/description: your rules first, then built-in ones. Matches at word starts. */
  DEFAULT_RULES.push(
    ['uber eats', 'Food'], ['doordash', 'Food'], ['grubhub', 'Food'], ['deliveroo', 'Food'], ['just eat', 'Food'], ['instacart', 'Food'], ['walmart', 'Food'], ['tesco', 'Food'], ['sainsbury', 'Food'],
    ['aldi', 'Food'], ['lidl', 'Food'], ['costco', 'Food'], ['kroger', 'Food'], ['whole foods', 'Food'], ['trader joe', 'Food'], ['carrefour', 'Food'], ['woolworths', 'Food'], ['coles', 'Food'], ['talabat', 'Food'], ['grabfood', 'Food'], ['foodpanda', 'Food'], ['subway', 'Food'], ['chipotle', 'Food'], ['burger king', 'Food'],
    ['lyft', 'Transport'], ['bolt', 'Transport'], ['grab', 'Transport'], ['gojek', 'Transport'], ['careem', 'Transport'], ['shell', 'Transport'], ['exxon', 'Transport'], ['chevron', 'Transport'], ['esso', 'Transport'], ['tfl', 'Transport'], ['parking', 'Transport'], ['transit', 'Transport'],
    ['disney', 'Subscriptions'], ['hulu', 'Subscriptions'], ['hbo', 'Subscriptions'], ['apple.com', 'Subscriptions'], ['audible', 'Subscriptions'], ['adobe', 'Subscriptions'], ['chatgpt', 'Subscriptions'], ['openai', 'Subscriptions'], ['patreon', 'Subscriptions'],
    ['verizon', 'Bills'], ['at&t', 'Bills'], ['t-mobile', 'Bills'], ['vodafone', 'Bills'], ['comcast', 'Bills'], ['xfinity', 'Bills'], ['etisalat', 'Bills'], ['water', 'Bills'], ['utility', 'Bills'], ['insurance', 'Bills'],
    ['mortgage', 'Rent'], ['ebay', 'Fun'], ['etsy', 'Fun'], ['target', 'Fun'], ['ikea', 'Fun'], ['shein', 'Fun'], ['temu', 'Fun'], ['cinema', 'Fun']);
  function categorize(text, userRules) {
    const t = String(text || '').toLowerCase();
    const hit = m => { const k = String(m).toLowerCase().trim(); if (!k) return false; const i = t.indexOf(k); return i >= 0 && (i === 0 || !/[a-z0-9]/.test(t[i - 1])); };
    for (const [m, name] of userRules || []) if (hit(m)) return { name, source: 'rule' };
    for (const [m, name] of DEFAULT_RULES) if (hit(m)) return { name, source: 'built-in' };
    return null;
  }

  /* ---------- Receipts: total, date and shop from OCR text ---------- */
  const RECEIPT_MONEY = /(?:[€£$¥₹₩₱₦฿₫]|rs\.?|inr|usd|eur|gbp|aed|sgd|cad|aud|rm|rp)?\s*(\d{1,3}(?:[,.]\d{3})+[.,]\d{2}|\d+[.,]\d{2})(?!\d)/gi;
  function receiptAmounts(line) {
    const out = [];
    let m;
    RECEIPT_MONEY.lastIndex = 0;
    while ((m = RECEIPT_MONEY.exec(line))) { const v = toNum(m[1]); if (v > 0) out.push(v); }
    return out;
  }
  function parseReceipt(input) {
    const lines = (Array.isArray(input) ? input : String(input || '').split(/\r?\n/)).map(l => String(l).trim()).filter(Boolean);
    const TOTAL = [/grand\s*total/i, /total\s*(amount\s*)?(due|payable|paid|to\s*pay)/i, /amount\s*(due|payable|paid)/i, /balance\s*due/i, /net\s*(amount|total|payable)/i, /\btotal\b/i, /\bamount\b/i];
    const SKIP = /sub\s*-?\s*total|total\s*(tax|vat|gst|savings|saved|discount|items?|qty|quantity|excl)|tax\s*total|you\s*saved|change\s*(due)?\b|\bcash\b|tendered|\btip\b/i;
    let total = null, found = false;
    for (const pat of TOTAL) {
      for (let i = 0; i < lines.length && !found; i++) {
        if (!pat.test(lines[i]) || SKIP.test(lines[i])) continue;
        let a = receiptAmounts(lines[i]);
        if (!a.length && i + 1 < lines.length) a = receiptAmounts(lines[i + 1]);   // amount printed on the next line
        if (a.length) { total = a[a.length - 1]; found = true; }
      }
      if (found) break;
    }
    if (!found) {   // no "total" line: fall back to the biggest amount on the receipt
      const all = lines.filter(l => !SKIP.test(l)).flatMap(receiptAmounts);
      if (all.length) total = Math.max(...all);
    }
    let date = null;
    for (const l of lines) {
      const d = parseLooseDate(l.replace(/(\d)([A-Za-z])/g, '$1 $2'));
      if (d) { date = d; break; }
    }
    const BAD = /receipt|invoice|\btax\b|gst|vat|\btel\b|phone|www\.|http|@|order|table|cashier|server|welcome|thank|date|time|\bno\.?\b|#/i;
    let merchant = '';
    for (const l of lines.slice(0, 6)) {
      const letters = (l.match(/[A-Za-z]/g) || []).length;
      if (letters >= 3 && letters >= l.replace(/\s/g, '').length * 0.5 && !BAD.test(l)) { merchant = l.replace(/[^\w&'’ .-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40); break; }
    }
    return { total, date, merchant, found: { total: found, date: !!date, merchant: !!merchant } };
  }

  /* ---------- Money weather: where this month is heading ---------- */
  function monthForecast({ today, needs, wants, savings, income }) {
    const dim = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const frac = today.getDate() / dim;
    const pace = wants.actual / Math.max(1, today.getDate()) * dim;
    const wantsProj = Math.max(wants.actual, pace * frac + (wants.planned > 0 ? wants.planned : pace) * (1 - frac));
    const projected = Math.max(needs.planned, needs.actual) + wantsProj + Math.max(savings.planned, savings.actual);
    const ref = income > 0 ? income : needs.planned + wants.planned + savings.planned;
    const ratio = ref > 0 ? projected / ref : 0;
    const [icon, label] = ratio <= 0.9 ? ['☀️', 'Sunny'] : ratio <= 1 ? ['⛅', 'Mostly sunny'] : ratio <= 1.1 ? ['🌧️', 'Showers'] : ['⛈️', 'Storm warning'];
    return { projected, ref, diff: ref - projected, ratio, icon, label, daysLeft: dim - today.getDate() };
  }

  /* ---------- XP levels, bill splits, 52-week challenge ---------- */
  const LEVELS = [[0, 'Broke'], [100, 'Scraper'], [300, 'Budgeter'], [700, 'Saver'], [1500, 'Strategist'], [3000, 'Investor'], [6000, 'Baller']];
  function levelFor(xp) {
    let i = 0;
    while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1][0]) i++;
    const min = LEVELS[i][0], next = i + 1 < LEVELS.length ? LEVELS[i + 1][0] : null;
    return { index: i, name: LEVELS[i][1], min, next, progress: next ? (xp - min) / (next - min) : 1 };
  }
  /** Split a total into n shares that add up exactly (to the paisa/cent). */
  function splitShares(total, n) {
    if (!(n > 0) || !(total >= 0)) return [];
    const cents = Math.round(total * 100), base = Math.floor(cents / n), extra = cents - base * n;
    return Array.from({ length: n }, (_, i) => (base + (i < extra ? 1 : 0)) / 100);
  }
  const week52Total = unit => unit * 52 * 53 / 2;

  /** Due dates of a repeating payment after `afterISO` (exclusive) up to `toISO` (inclusive). Monthly keeps the start day (clamped to short months). */
  function recurringDue(item, afterISO, untilISO, cap = 24) {
    const start = parseDate(item.start);
    const to = parseDate(untilISO);
    if (!start || !to) return [];
    const after = afterISO ? parseDate(afterISO) : null;
    const out = [];
    const day = start.getDate();
    for (let k = 0; k < 2000 && out.length < cap; k++) {
      let d;
      if (item.freq === 'weekly') d = addDays(start, 7 * k);
      else if (item.freq === 'yearly') { const y = start.getFullYear() + k; d = new Date(y, start.getMonth(), Math.min(day, new Date(y, start.getMonth() + 1, 0).getDate())); }
      else { const base = new Date(start.getFullYear(), start.getMonth() + k, 1); d = new Date(base.getFullYear(), base.getMonth(), Math.min(day, new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate())); }
      if (d > to) break;
      if (!after || d > after) out.push(toISO(d));
    }
    return out;
  }

  /* ---------- Student money math: Safe-to-spend, Run-out forecast, Semester plan ---------- */
  /**
   * Safe-to-spend today: (current balance - upcoming bills before next allowance) / days until next allowance.
   * Thresholds:
   *  - 'green' (on track): perDay >= 65% of monthly baseline daily allowance
   *  - 'amber' (tight): 0 < perDay < 65% of baseline
   *  - 'red' (danger/over): perDay <= 0 or balance <= upcoming bills
   */
  function safeToSpend({ balance, upcomingBills = 0, daysLeft = 1, monthlyAllowance = 0 }) {
    const bal = isNum(balance) ? balance : 0;
    const bills = isNum(upcomingBills) && upcomingBills > 0 ? upcomingBills : 0;
    const allowance = isNum(monthlyAllowance) && monthlyAllowance > 0 ? monthlyAllowance : 0;
    const available = bal - bills;
    const days = isNum(daysLeft) && daysLeft > 0 ? Math.round(daysLeft) : 1;
    const perDay = available > 0 ? available / days : 0;
    const baselineDaily = (allowance > 0 ? allowance : Math.max(bal, 1)) / Math.max(days, 30);

    let status = 'green';
    let reason = 'On track until your next allowance';
    if (bal <= 0 || available <= 0) {
      status = 'red';
      reason = 'Money runs out before your next allowance';
    } else if (perDay < 0.65 * baselineDaily) {
      status = 'amber';
      reason = 'Below what is needed to last comfortably';
    }

    return {
      available,
      perDay,
      daysLeft: days,
      baselineDaily,
      status,
      reason,
      willLast: available > 0 && status !== 'red'
    };
  }

  /**
   * Run-out forecast: day-by-day projected balance from today to the next allowance.
   */
  function forecastRunOut({ currentBalance, daysLeft = 30, dailySpendByCategory = {}, sliderAdjustments = {}, startDate = null }) {
    const start = startDate ? (parseDate(startDate) || new Date()) : new Date();
    const days = Math.max(1, Math.round(daysLeft));
    let bal = isNum(currentBalance) ? currentBalance : 0;

    let totalDailySpend = 0;
    const allCats = new Set([...Object.keys(dailySpendByCategory || {}), ...Object.keys(sliderAdjustments || {})]);
    for (const cat of allCats) {
      const base = isNum(dailySpendByCategory[cat]) ? dailySpendByCategory[cat] : 0;
      const adj = isNum(sliderAdjustments[cat]) ? sliderAdjustments[cat] : 0;
      totalDailySpend += Math.max(0, base + adj);
    }
    if (totalDailySpend <= 0 && bal > 0) {
      totalDailySpend = bal / days;
    }

    const points = [];
    let runOutDay = null;
    let runOutDayIndex = null;

    points.push({ dayIndex: 0, date: toISO(start), balance: bal, dailySpend: 0 });

    for (let i = 1; i <= days; i++) {
      bal -= totalDailySpend;
      const d = addDays(start, i);
      const dateStr = toISO(d);
      const currBal = Math.round(bal * 100) / 100;
      points.push({ dayIndex: i, date: dateStr, balance: currBal, dailySpend: totalDailySpend });
      if (currBal <= 0 && runOutDay === null) {
        runOutDay = dateStr;
        runOutDayIndex = i;
      }
    }

    const endBalance = points[points.length - 1].balance;
    const willMakeIt = endBalance >= 0;

    return {
      points,
      runOutDay,
      runOutDayIndex,
      endBalance,
      willMakeIt,
      dailySpend: totalDailySpend
    };
  }

  /**
   * Semester planner: track semester start/end, heavy months (fees, exams, trips) and buffer.
   */
  function semesterPlan({ start, end, monthlyIncome = 0, monthlyBaseExpenses = 0, heavyMonths = [], currentSaved = 0 }) {
    const sDate = parseDate(start) || new Date();
    const eDate = parseDate(end) || addMonths(sDate, 5);
    const months = Math.max(1, Math.round(daysBetween(sDate, eDate) / 30.4375));
    const income = (isNum(monthlyIncome) && monthlyIncome > 0 ? monthlyIncome : 0) * months;
    const baseExpenses = (isNum(monthlyBaseExpenses) && monthlyBaseExpenses > 0 ? monthlyBaseExpenses : 0) * months;
    const heavyTotal = (heavyMonths || []).reduce((s, h) => s + (isNum(h.amount) && h.amount > 0 ? h.amount : 0), 0);
    const totalNeeded = baseExpenses + heavyTotal;
    const saved = isNum(currentSaved) && currentSaved > 0 ? currentSaved : 0;
    const surplus = (income + saved) - totalNeeded;
    const monthlyBufferNeeded = months > 0 ? Math.max(0, (heavyTotal - saved) / months) : 0;
    const onTrack = surplus >= 0;

    return {
      months,
      totalIncome: income,
      baseExpenses,
      heavyTotal,
      totalNeeded,
      saved,
      surplus,
      monthlyBufferNeeded,
      onTrack,
      diff: Math.abs(surplus)
    };
  }

  /* ---------- Afford check: "Can I afford X on date Y?" ---------- */
  /**
   * @param {Object} opts
   * @param {number} opts.balance          - current available balance
   * @param {number} opts.daysLeft         - days until next allowance
   * @param {number} opts.amount           - cost of the thing
   * @param {number} opts.eventDayOffset   - days from today until the event (0 = today)
   * @param {number} opts.dailySpend       - average daily spend rate
   * @param {number} opts.monthlyAllowance - for baseline comparison
   * @param {Object} opts.topCategory      - { name, dailyCost } biggest flexible category
   * @returns {{ verdict:'yes'|'tight'|'no', perDayAfter, balanceAtEvent, balanceAfter, fix }}
   */
  function affordCheck({ balance = 0, daysLeft = 1, amount = 0, eventDayOffset = 0, dailySpend = 0, monthlyAllowance = 0, topCategory = null }) {
    const bal = isNum(balance) ? balance : 0;
    const days = isNum(daysLeft) && daysLeft > 0 ? Math.round(daysLeft) : 1;
    const cost = isNum(amount) && amount > 0 ? amount : 0;
    const offset = isNum(eventDayOffset) && eventDayOffset >= 0 ? Math.round(eventDayOffset) : 0;
    const daily = isNum(dailySpend) && dailySpend > 0 ? dailySpend : 0;
    const allowance = isNum(monthlyAllowance) && monthlyAllowance > 0 ? monthlyAllowance : 0;

    // Balance projected to the event day
    const balanceAtEvent = bal - (daily * offset);
    // Balance after buying
    const balanceAfter = balanceAtEvent - cost;
    // Days remaining after the event day
    const daysAfter = Math.max(1, days - offset);
    // Daily rate after buying
    const perDayAfter = balanceAfter > 0 ? balanceAfter / daysAfter : 0;
    // Baseline daily (what you'd normally have)
    const baselineDaily = (allowance > 0 ? allowance : Math.max(bal, 1)) / Math.max(days, 30);

    let verdict = 'yes';
    if (balanceAfter <= 0) {
      verdict = 'no';
    } else if (perDayAfter < 0.65 * baselineDaily) {
      verdict = 'tight';
    }

    // Generate a concrete fix from their top spending category
    let fix = '';
    if (verdict !== 'yes' && topCategory && topCategory.dailyCost > 0) {
      const catName = topCategory.name;
      const catDaily = topCategory.dailyCost;
      // How many days of skipping this category would cover the shortfall?
      const shortfall = verdict === 'no' ? cost - Math.max(0, balanceAtEvent) : cost * 0.4;
      const skipDays = Math.ceil(shortfall / catDaily);
      if (skipDays <= 14) {
        fix = `Skip ${skipDays} ${catName.toLowerCase()} ${skipDays === 1 ? 'order' : 'orders'} this week and you can`;
      } else {
        const perWeek = Math.ceil(shortfall / catDaily / 2);
        fix = `Cut ${catName.toLowerCase()} by ${perWeek} orders a week for 2 weeks and you can`;
      }
    }

    return { verdict, perDayAfter, balanceAtEvent, balanceAfter, daysAfter, fix };
  }

  /* ---------- What-if forecast: "What if I change habit X?" ---------- */
  /**
   * Like forecastRunOut but with explicit category changes (e.g. "stop ordering on weekends" = -2/7 of food daily)
   * @param {Object} opts
   * @param {number} opts.currentBalance
   * @param {number} opts.daysLeft
   * @param {Object} opts.dailySpendByCategory  - { Food: 150, Fun: 80 }
   * @param {Object} opts.categoryChanges        - { Food: -40 } (absolute daily change)
   * @param {string} opts.startDate
   * @returns {{ ...forecastRunOut result, savedPerDay, savedTotal }}
   */
  function whatIfForecast({ currentBalance, daysLeft = 30, dailySpendByCategory = {}, categoryChanges = {}, startDate = null }) {
    // Calculate baseline (no changes)
    const baseline = forecastRunOut({ currentBalance, daysLeft, dailySpendByCategory, sliderAdjustments: {}, startDate });
    // Calculate with changes
    const adjusted = forecastRunOut({ currentBalance, daysLeft, dailySpendByCategory, sliderAdjustments: categoryChanges, startDate });

    const savedPerDay = baseline.dailySpend - adjusted.dailySpend;
    const savedTotal = savedPerDay * Math.max(1, Math.round(daysLeft));

    return Object.assign({}, adjusted, {
      savedPerDay,
      savedTotal,
      baselineRunOutDay: baseline.runOutDay,
      baselineEndBalance: baseline.endBalance,
      baselineWillMakeIt: baseline.willMakeIt,
      daysGained: (adjusted.runOutDayIndex || daysLeft) - (baseline.runOutDayIndex || daysLeft)
    });
  }

  /* ---------- Bill item extraction & Proportional Split ---------- */
  /**
   * Parse a bill's line items, tax, service charge and grand total from text/OCR lines.
   * @param {string[]|string} input
   * @returns {{ items: Array<{id: string, name: string, price: number, qty: number}>, tax: number, serviceCharge: number, total: number, merchant: string, date: string }}
   */
  function parseBillItems(input) {
    const lines = (Array.isArray(input) ? input : String(input || '').split(/\r?\n/)).map(l => String(l).trim()).filter(Boolean);
    const items = [];
    let tax = 0;
    let serviceCharge = 0;
    let grandTotal = null;

    const TAX_PAT = /\b(gst|cgst|sgst|igst|vat|sales\s*tax|service\s*tax|tax)\b/i;
    const SC_PAT = /\b(service\s*(charge|chg)|sc\b|cov\s*charge)/i;
    const TOTAL_PAT = /\b(grand\s*total|net\s*(amount|payable|total)|total\s*(amount|due|payable|paid)|balance\s*due|\btotal\b)\b/i;
    const SKIP_PAT = /\b(sub\s*-?\s*total|table|order|cashier|server|welcome|thank|date|time|card|cash|change|discount|saved|token|upi|fssai|gstin)\b/i;

    let idCounter = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const amounts = receiptAmounts(line);
      if (!amounts.length) continue;

      const amt = amounts[amounts.length - 1];
      if (amt <= 0) continue;

      if (TOTAL_PAT.test(line) && !SKIP_PAT.test(line)) {
        grandTotal = amt;
      } else if (TAX_PAT.test(line)) {
        tax += amt;
      } else if (SC_PAT.test(line)) {
        serviceCharge += amt;
      } else if (!SKIP_PAT.test(line)) {
        // Line item
        let cleanName = line
          .replace(new RegExp(`[₹$€£]?\\s*${amt.toFixed(2)}|[₹$€£]?\\s*${amt}`, 'g'), '')
          .replace(/\b\d+(\.\d+)?\s*(x|qty|pc|pcs|nos|kg|gm)?\b/gi, '')
          .replace(/[^a-zA-Z0-9\s&'’/-]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (cleanName.length >= 2 && !/^\d+$/.test(cleanName)) {
          // Check for quantity in line
          let qty = 1;
          const qtyMatch = line.match(/\b(\d+)\s*(?:x|\*|qty|nos|pcs)\b/i) || line.match(/^(\d+)\s+[a-zA-Z]/);
          if (qtyMatch && Number(qtyMatch[1]) > 0 && Number(qtyMatch[1]) <= 50) {
            qty = Number(qtyMatch[1]);
          }
          items.push({ id: 'item_' + (idCounter++), name: cleanName.slice(0, 60), price: amt, qty });
        }
      }
    }

    const itemsTotal = items.reduce((s, it) => s + it.price, 0);
    if (!grandTotal) {
      grandTotal = itemsTotal > 0 ? (itemsTotal + tax + serviceCharge) : 0;
    }

    let date = null;
    for (const l of lines) {
      const d = parseLooseDate(l.replace(/(\d)([A-Za-z])/g, '$1 $2'));
      if (d) { date = d; break; }
    }

    let merchant = '';
    const BAD = /receipt|invoice|\btax\b|gst|vat|\btel\b|phone|www\.|http|@|order|table|cashier|server|welcome|thank|date|time|\bno\.?\b|#/i;
    for (const l of lines.slice(0, 6)) {
      const letters = (l.match(/[A-Za-z]/g) || []).length;
      if (letters >= 3 && letters >= l.replace(/\s/g, '').length * 0.5 && !BAD.test(l)) {
        merchant = l.replace(/[^\w&'’ .-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
        break;
      }
    }

    return { items, tax, serviceCharge, total: grandTotal, merchant, date };
  }

  /**
   * Split bill items with proportional tax and service charge + exact paise reconciliation.
   * @param {Object} opts
   * @param {Array<{id: string, name: string, price: number}>} opts.items
   * @param {number} opts.tax
   * @param {number} opts.serviceCharge
   * @param {Array<{id: string, name: string}>} opts.people
   * @param {Object.<string, string[]>} opts.assignments - itemId -> array of personIds
   * @returns {{ itemsTotal: number, tax: number, serviceCharge: number, grandTotal: number, shares: Array<{ personId: string, name: string, itemSubtotal: number, tax: number, serviceCharge: number, total: number, items: Array<{ name: string, share: number }> }> }}
   */
  function splitBillExact({ items = [], tax = 0, serviceCharge = 0, people = [], assignments = {} }) {
    if (!people.length) return { itemsTotal: 0, tax: 0, serviceCharge: 0, grandTotal: 0, shares: [] };

    const cleanTax = Math.max(0, isNum(tax) ? tax : 0);
    const cleanSC = Math.max(0, isNum(serviceCharge) ? serviceCharge : 0);
    const itemsTotal = items.reduce((s, it) => s + (isNum(it.price) ? it.price : 0), 0);

    const personMap = {};
    people.forEach(p => {
      personMap[p.id] = {
        personId: p.id,
        name: p.name,
        itemSubtotal: 0,
        items: []
      };
    });

    // Assign items
    items.forEach(it => {
      const price = Math.max(0, isNum(it.price) ? it.price : 0);
      let assigned = assignments[it.id];
      // Default unassigned items to split evenly across all people
      if (!Array.isArray(assigned) || !assigned.length) {
        assigned = people.map(p => p.id);
      }
      const validAssigned = assigned.filter(pid => personMap[pid]);
      const splitWith = validAssigned.length ? validAssigned : people.map(p => p.id);
      const sharePrice = price / splitWith.length;

      splitWith.forEach(pid => {
        personMap[pid].itemSubtotal += sharePrice;
        personMap[pid].items.push({ name: it.name, share: sharePrice });
      });
    });

    const activeTotal = people.reduce((s, p) => s + personMap[p.id].itemSubtotal, 0);
    const divisor = activeTotal > 0 ? activeTotal : 1;
    const grandTotal = Math.round((itemsTotal + cleanTax + cleanSC) * 100) / 100;
    const grandTotalPaise = Math.round(grandTotal * 100);

    const rawShares = people.map(p => {
      const entry = personMap[p.id];
      const sub = entry.itemSubtotal;
      const ratio = sub / divisor;
      const pTax = ratio * cleanTax;
      const pSC = ratio * cleanSC;
      const rawTotal = sub + pTax + pSC;
      const paise = Math.floor(rawTotal * 100);
      const remainder = (rawTotal * 100) - paise;
      return {
        personId: p.id,
        name: p.name,
        itemSubtotal: Math.round(sub * 100) / 100,
        tax: Math.round(pTax * 100) / 100,
        serviceCharge: Math.round(pSC * 100) / 100,
        rawTotal,
        paise,
        remainder,
        items: entry.items
      };
    });

    // Distribute remaining odd paise based on largest fractional remainders
    let allocatedPaise = rawShares.reduce((s, r) => s + r.paise, 0);
    let diffPaise = grandTotalPaise - allocatedPaise;

    // Sort index by remainder descending
    const order = rawShares.map((r, i) => ({ i, rem: r.remainder })).sort((a, b) => b.rem - a.rem);
    for (let k = 0; k < Math.abs(diffPaise); k++) {
      const idx = order[k % order.length].i;
      rawShares[idx].paise += (diffPaise > 0 ? 1 : -1);
    }

    const finalShares = rawShares.map(r => ({
      personId: r.personId,
      name: r.name,
      itemSubtotal: r.itemSubtotal,
      tax: r.tax,
      serviceCharge: r.serviceCharge,
      total: r.paise / 100,
      items: r.items
    }));

    return {
      itemsTotal: Math.round(itemsTotal * 100) / 100,
      tax: Math.round(cleanTax * 100) / 100,
      serviceCharge: Math.round(cleanSC * 100) / 100,
      grandTotal,
      shares: finalShares
    };
  }

  /* ---------- UPI Deep-Link & Top-Up Helpers ---------- */
  /**
   * Build a standard UPI payment link with proper URL encoding.
   * Format: upi://pay?pa=<UPI_ID>&pn=<NAME>&am=<AMOUNT>&cu=INR&tn=<NOTE>
   * @param {Object} opts
   * @param {string} opts.pa - VPA / UPI ID
   * @param {string} opts.pn - Payee name
   * @param {number|string} opts.am - Amount
   * @param {string} [opts.cu='INR'] - Currency
   * @param {string} opts.tn - Transaction note
   * @returns {string} Encoded UPI URL
   */
  function buildUpiUrl({ pa, pn, am, cu = 'INR', tn = '' }) {
    const cleanPa = String(pa || '').trim();
    const cleanPn = String(pn || '').trim();
    const cleanAm = Number(am || 0).toFixed(2);
    const cleanCu = String(cu || 'INR').trim();
    const cleanTn = String(tn || '').trim();

    return `upi://pay?pa=${encodeURIComponent(cleanPa)}&pn=${encodeURIComponent(cleanPn)}&am=${encodeURIComponent(cleanAm)}&cu=${encodeURIComponent(cleanCu)}&tn=${encodeURIComponent(cleanTn)}`;
  }

  /**
   * Draft an honest, polite top-up request message for parents.
   * @param {Object} opts
   * @param {number} opts.neededAmount
   * @param {number} opts.daysLeft
   * @param {string} [opts.nextDate]
   * @param {Array<{name: string, spent: number}>} [opts.topCategories=[]]
   * @param {string} [opts.cutCategory='']
   * @param {string} [opts.tone='casual'] - 'casual' or 'formal'
   * @returns {string}
   */
  function generateTopUpDraft({ neededAmount = 0, daysLeft = 1, nextDate = '', topCategories = [], cutCategory = '', tone = 'casual' }) {
    const amtStr = '₹' + Math.round(neededAmount).toLocaleString('en-IN');
    const dStr = `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`;
    const datePart = nextDate ? ` (until ${nextDate})` : '';

    const breakdownLines = topCategories.slice(0, 3)
      .map(c => `• ${c.name}: ₹${Math.round(c.spent).toLocaleString('en-IN')}`)
      .join('\n');

    const cutPart = cutCategory
      ? `To make sure this lasts, I will cut back on ${cutCategory.toLowerCase()} for the rest of the month.`
      : 'I am cutting back on non-essential spending for the rest of the month.';

    if (tone === 'formal') {
      return `Dear Mom and Dad,\n\nI hope you are doing well. My monthly allowance has run short for the remaining ${dStr}${datePart}, and I need ${amtStr} to cover basic expenses.\n\nMain expenses this month:\n${breakdownLines}\n\n${cutPart}\n\nCould you please send a top-up of ${amtStr} when possible? Thank you for your support.`;
    }

    return `Hey Mom and Dad, quick update on my hostel budget. I'm running low on funds for the next ${dStr}${datePart}, and I'm short by about ${amtStr}.\n\nWhere most of it went:\n${breakdownLines}\n\n${cutPart}\n\nCould you send a top-up of ${amtStr}? Thank you!`;
  }

  return {
    PAY_FREQUENCIES, MAX_MONTHS,
    toMonthly, netFromGross, monthlyRate, emi, amortizationSchedule, neverPaysOff, monthsToPayoff,
    payoffOrder, simulatePayoff, requiredMonthlySaving, futureValue, monthsToReachGoal, projectBalance,
    parseDate, toISO, startOfDay, addDays, addMonths, daysBetween, monthsBetween, nextPayday, nextAnnualOccurrence,
    roundUpAmount, ruleOf72, daysLeftInMonth, streaks, taxYear, parsePayslip, parseLooseDate,
    parseSms, parseSmsBatch, parseCsv, parseStatementCsv, parseStatementLines, categorize, DEFAULT_RULES,
    monthForecast, LEVELS, levelFor, splitShares, week52Total, recurringDue, setDateOrder, parseReceipt,
    safeToSpend, forecastRunOut, semesterPlan, affordCheck, whatIfForecast,
    parseBillItems, splitBillExact, buildUpiUrl, generateTopUpDraft
  };
})();

