/**
 * Self-tests for the math above. Logs PASS/FAIL to the console and returns the results.
 */
function runSelfTests() {
  const F = FinMath;
  const results = [];
  const close = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
  const check = (name, ok, detail = '') => {
    results.push({ name, ok: !!ok, detail });
    (ok ? console.info : console.error)(`${ok ? 'PASS' : 'FAIL'} · ${name}${detail ? ' · ' + detail : ''}`);
  };

  // EMI
  const e = F.emi(100000, 12, 12);
  check('Loan payment: ₹1,00,000 at 12% for 12 months ≈ 8,884.88', close(e, 8884.88), e.toFixed(4));
  check('Loan payment: 0% interest splits evenly', close(F.emi(12000, 0, 12), 1000));
  check('Loan payment: 5,00,000 at 9.5% for 60 months ≈ 10,500.93', close(F.emi(500000, 9.5, 60), 10500.93), F.emi(500000, 9.5, 60).toFixed(4));

  // Amortization
  const a = F.amortizationSchedule(100000, 12, 12);
  const pSum = a.rows.reduce((s, r) => s + r.principal, 0);
  check('Amortization: 12 rows', a.rows.length === 12);
  check('Amortization: ends at zero balance', close(a.rows[a.rows.length - 1].balance, 0, 1e-6));
  check('Amortization: principal paid = loan', close(pSum, 100000, 1e-6));
  check('Amortization: first month interest = 1,000', close(a.rows[0].interest, 1000, 1e-9));
  check('Amortization: total interest = payment×n − P', close(a.totalInterest, e * 12 - 100000, 1e-6), a.totalInterest.toFixed(4));

  // Avalanche / snowball ordering
  const debts = [
    { id: 'A', balance: 5000, rate: 20, minPayment: 150 },
    { id: 'B', balance: 1000, rate: 10, minPayment: 50 },
    { id: 'C', balance: 3000, rate: 25, minPayment: 100 }
  ];
  check('Avalanche order: C → A → B', F.payoffOrder(debts, 'avalanche').join('') === 'CAB', F.payoffOrder(debts, 'avalanche').join(''));
  check('Snowball order: B → C → A', F.payoffOrder(debts, 'snowball').join('') === 'BCA', F.payoffOrder(debts, 'snowball').join(''));
  const av = F.simulatePayoff(debts, 300, 'avalanche');
  const sb = F.simulatePayoff(debts, 300, 'snowball');
  const mn = F.simulatePayoff(debts, 0, 'minimum');
  check('Simulation: both strategies pay off', av.paidOff && sb.paidOff);
  check('Avalanche interest ≤ snowball interest', av.totalInterest <= sb.totalInterest + 1e-9, `${av.totalInterest.toFixed(2)} vs ${sb.totalInterest.toFixed(2)}`);
  check('Snowball clears the smallest debt first', sb.payoffMonth.B <= Math.min(sb.payoffMonth.A, sb.payoffMonth.C));
  check('Avalanche clears the highest-rate debt before the lowest-rate one', av.payoffMonth.C <= av.payoffMonth.B);
  check('Extra payment beats minimums only', av.totalInterest < mn.totalInterest && av.months < mn.months);
  check('Simulation: principal + interest = total paid', close(av.startBalance + av.totalInterest, av.totalPaid, 1e-6));
  const single = F.simulatePayoff([{ id: 'X', balance: 100000, rate: 12, minPayment: F.emi(100000, 12, 12) }], 0, 'avalanche');
  check('Simulation matches loan schedule (12 months)', single.months === 12 && close(single.totalInterest, a.totalInterest, 1e-6));

  // Goal formula
  check('Goal PMT, 0%: (1,00,000 − 0)/10 = 10,000', close(F.requiredMonthlySaving(100000, 0, 0, 10), 10000));
  const pmt = F.requiredMonthlySaving(100000, 10000, 12, 24);
  check('Goal PMT with interest reaches target exactly', close(F.futureValue(10000, 12, pmt, 24), 100000, 1e-6), pmt.toFixed(4));
  check('Goal PMT with interest ≈ 3,236.61', close(pmt, 3236.61, 0.01), pmt.toFixed(4));
  check('Goal PMT is 0 when already reached', F.requiredMonthlySaving(5000, 6000, 5, 12) === 0);
  check('Reverse mode inverts PMT (24 months)', F.monthsToReachGoal(100000, 10000, 12, pmt) === 24);
  check('Reverse mode, 0%: 90,000 at 10,000/mo → 9 months', F.monthsToReachGoal(100000, 10000, 0, 10000) === 9);
  check('Reverse mode, nothing saved and 0% → never', F.monthsToReachGoal(1000, 0, 0, 0) === Infinity);

  // Pay frequency conversions
  check('Weekly × 52/12', close(F.toMonthly(1000, 'weekly'), 4333.3333, 1e-3));
  check('Every 2 weeks × 26/12', close(F.toMonthly(1000, 'biweekly'), 2166.6667, 1e-3));
  check('Twice a month × 2', F.toMonthly(1000, 'semimonthly') === 2000);
  check('Monthly × 1', F.toMonthly(1000, 'monthly') === 1000);
  check('Yearly ÷ 12', close(F.toMonthly(12000, 'yearly'), 1000, 1e-9));
  check('Net from gross: 1,00,000 − 10% − 12,000 = 78,000', close(F.netFromGross(100000, [{ mode: 'percent', value: 10 }, { mode: 'amount', value: 12000 }]).net, 78000));

  // Never-pays-off case
  check('Payment = monthly interest → never pays off', F.neverPaysOff(100000, 24, 2000) === true);
  check('Payment < monthly interest → never pays off', F.neverPaysOff(100000, 24, 1500) === true);
  check('Payment > monthly interest → pays off', F.neverPaysOff(100000, 24, 2500) === false);
  check('monthsToPayoff returns Infinity when stuck', F.monthsToPayoff(100000, 24, 2000) === Infinity);
  const stuck = F.simulatePayoff([{ id: 'S', balance: 100000, rate: 24, minPayment: 2000 }], 0, 'minimum');
  check('Stuck simulation stops at 600 months, not paid off', stuck.months === 600 && stuck.paidOff === false);
  check('monthsToPayoff matches simulation', F.monthsToPayoff(5000, 20, 300) === F.simulatePayoff([{ id: 'Q', balance: 5000, rate: 20, minPayment: 300 }], 0, 'minimum').months);

  // Dates
  const t = new Date(2026, 8, 28);
  check('nextPayday rolls monthly anchor forward', FinMath.toISO(F.nextPayday(new Date(2026, 6, 1), 'monthly', t)) === '2026-10-01');
  check('addMonths clamps Jan 31 → Feb 28', FinMath.toISO(F.addMonths(new Date(2027, 0, 31), 1)) === '2027-02-28');

  // Fun-layer helpers
  check('Round-up: 1,850 → next 100 = 50', close(F.roundUpAmount(1850, 100), 50, 1e-9));
  check('Round-up: already round = 0', F.roundUpAmount(1900, 100) === 0);
  check('Round-up: 1,234.50 → next 10 = 5.50', close(F.roundUpAmount(1234.5, 10), 5.5, 1e-9));
  check('Rule of 72: 6% doubles in 12 years', F.ruleOf72(6) === 12);
  check('Days left in month: 28 Sep → 3', F.daysLeftInMonth(new Date(2026, 8, 28)) === 3);
  const sk = F.streaks(new Set(['2026-09-20', '2026-09-25']), new Date(2026, 8, 15), new Date(2026, 8, 28));
  check('Streaks: current 3, longest 5', sk.current === 3 && sk.longest === 5, JSON.stringify(sk));

  // Tax year
  const fy1 = F.taxYear(new Date(2026, 8, 28), 4), fy2 = F.taxYear(new Date(2027, 1, 15), 4), fy3 = F.taxYear(new Date(2026, 8, 28), 1);
  check('Tax year (April start): Sep 2026 → Apr 2026–Mar 2027', F.toISO(fy1.start) === '2026-04-01' && F.toISO(fy1.end) === '2027-03-31');
  check('Tax year (April start): Feb 2027 → same year', F.toISO(fy2.start) === '2026-04-01');
  check('Tax year (January start) = calendar year', F.toISO(fy3.start) === '2026-01-01' && F.toISO(fy3.end) === '2026-12-31');

  // Payslip parsing: Indian layout
  const pIn = F.parsePayslip([
    'Acme Technologies Pvt Ltd', 'Payslip for the month of September 2026', 'PF No: MH/BAN/0012345/000/0001234   UAN: 100200300400',
    'Pay Date: 30/09/2026   Days Worked: 30', 'Basic   40,000.00   Provident Fund   4,800.00', 'HRA   20,000.00   Professional Tax   200.00',
    'Special Allowance   40,000.00   Income Tax   6,200.00', 'Total Earnings   1,00,000.00   Total Deductions   11,200.00', 'Net Pay   88,800.00']);
  check('Payslip (India): gross 1,00,000 · net 88,800', pIn.gross === 100000 && pIn.net === 88800, JSON.stringify([pIn.gross, pIn.net]));
  check('Payslip (India): tax 6,200 · PF 4,800 · PT 200', pIn.tax === 6200 && pIn.pf === 4800 && pIn.pt === 200, JSON.stringify([pIn.tax, pIn.pf, pIn.pt]));
  check('Payslip (India): month, pay date, employer', pIn.month === '2026-09' && pIn.payDate === '2026-09-30' && pIn.employer === 'Acme Technologies Pvt Ltd');
  check('Payslip (India): ignores the PF account number', pIn.pf !== 12345);
  // US layout, no "total deductions" line
  const pUs = F.parsePayslip('Globex Corporation\nPay Period: 09/01/2026 - 09/15/2026    Pay Date: 09/19/2026\nGross Pay   4,200.00\nFederal Income Tax   520.00\nState Tax   180.00\n401(k)   210.00\nHealth Insurance   95.00\nNet Pay   3,195.00');
  check('Payslip (US): gross, net, tax, 401(k), insurance', pUs.gross === 4200 && pUs.net === 3195 && pUs.tax === 520 && pUs.pf === 210 && pUs.esi === 95);
  check('Payslip (US): state tax counts as a payroll tax', Math.abs(pUs.pt - 180) < 0.01 && pUs.other === 0, JSON.stringify([pUs.pt, pUs.other]));
  const pUk = F.parsePayslip(['Globex UK Ltd', 'Pay date: 30/09/2026', 'Gross pay   3,500.00', 'PAYE Tax   458.20', 'National Insurance   183.60', 'Pension   175.00', 'Net pay   2,683.20']);
  check('Payslip (UK): PAYE, National Insurance, pension', pUk.tax === 458.2 && Math.abs(pUk.pt - 183.6) < 0.01 && pUk.pf === 175 && pUk.esi === null && pUk.net === 2683.2, JSON.stringify([pUk.tax, pUk.pt, pUk.pf, pUk.esi]));
  const smUs = F.parseSms('Chase: Your card ending 1234 was charged $24.50 at STARBUCKS on 09/27/2026.', '2026-09-28');
  check('Bank alert in dollars', smUs && smUs.amount === 24.5 && smUs.type === 'debit' && smUs.merchant === 'STARBUCKS', JSON.stringify(smUs));
  const smEu = F.parseSms('Kartenzahlung 12,50 EUR bei REWE am 27.09.2026', '2026-09-28');
  check('European decimal comma: 12,50 EUR', smEu && smEu.amount === 12.5, JSON.stringify(smEu));
  F.setDateOrder('mdy');
  const mdy = F.parseLooseDate('03/04/2026');
  F.setDateOrder('dmy');
  check('Dates: 03/04 is 4 March in the US, 3 April elsewhere', mdy === '2026-03-04' && F.parseLooseDate('03/04/2026') === '2026-04-03');
  const rc = F.parseReceipt(['FRESH MART', '123 Main Street', 'Date: 27/09/2026 14:02', 'Milk 2L   3.49', 'Bread   2.10', 'Subtotal   5.59', 'Tax   0.45', 'TOTAL   6.04', 'Cash   10.00', 'Change   3.96']);
  check('Receipt: shop, date and total (not subtotal or change)', rc.total === 6.04 && rc.date === '2026-09-27' && rc.merchant === 'FRESH MART', JSON.stringify(rc));
  check('Receipt: no total line → biggest amount', F.parseReceipt(['Cafe Luna', '1 Latte 4.50', '1 Cake 5.25']).total === 5.25);
  check('Payslip (US): month-first pay date', pUs.payDate === '2026-09-19' && pUs.month === '2026-09');
  const pNone = F.parsePayslip('');
  check('Payslip: empty text finds nothing', pNone.gross === null && pNone.net === null);


  // Bank SMS, statements and auto-categorising
  const sm1 = F.parseSms('Sent Rs.250.00 From HDFC Bank A/C *1234 To SWIGGY On 27/09/26 Ref 123456789012', '2026-09-28');
  check('SMS: HDFC UPI debit → 250 at SWIGGY on 27 Sep', sm1 && sm1.amount === 250 && sm1.type === 'debit' && sm1.merchant === 'SWIGGY' && sm1.date === '2026-09-27', JSON.stringify(sm1));
  const sm2 = F.parseSms('Rs.85,000.00 credited to your A/c XX1234 on 30-09-26 by NEFT from ACME TECHNOLOGIES. Avl Bal Rs 1,00,000.00', '2026-09-28');
  check('SMS: salary credit is money in, not an expense', sm2 && sm2.type === 'credit' && sm2.amount === 85000);
  const sm3 = F.parseSms('Dear UPI user A/C X1234 debited by 250.0 on date 28Sep26 trf to SWIGGY Refno 123456789', '2026-01-01');
  check('SMS: SBI style “250.0 … 28Sep26”', sm3 && sm3.amount === 250 && sm3.date === '2026-09-28' && sm3.merchant === 'SWIGGY', JSON.stringify(sm3));
  const stc = F.parseStatementCsv('Date,Narration,Ref,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance\n28/09/26,UPI-SWIGGY,1,28/09/26,250.00,,9750.00\n27/09/26,"SALARY, ACME",,27/09/26,,"85,000.00",10000.00');
  check('Statement CSV: withdrawal and deposit columns', stc.length === 2 && stc[0].type === 'debit' && stc[0].amount === 250 && stc[1].type === 'credit' && stc[1].amount === 85000);
  const stl = F.parseStatementLines(['Opening Balance 10,000.00', '01/09/2026 UPI/SWIGGY 250.00 9,750.00', '02/09/2026 NEFT SALARY 85,000.00 94,750.00']);
  check('Statement PDF: running balance tells debit from credit', stl.length === 2 && stl[0].type === 'debit' && stl[1].type === 'credit');
  check('Categorise: matches word starts only (“Coca cola” isn’t Ola)', F.categorize('ola cabs').name === 'Transport' && F.categorize('Coca cola') === null);

  // Recurring payments
  const rdue = F.recurringDue({ start: '2026-01-31', freq: 'monthly' }, '', '2026-04-30');
  check('Recurring: the 31st clamps to short months', rdue.join() === '2026-01-31,2026-02-28,2026-03-31,2026-04-30', rdue.join());
  check('Recurring: nothing re-posted after the last posting', F.recurringDue({ start: '2026-01-31', freq: 'monthly' }, '2026-04-30', '2026-04-30').length === 0);

  // Split, challenges, levels, forecast
  const shr = F.splitShares(1000, 3);
  check('Split: 1,000 three ways adds up exactly', shr.length === 3 && close(shr[0] + shr[1] + shr[2], 1000, 1e-9) && shr[0] === 333.34);
  check('52-week challenge: 10 × week number totals 13,780', F.week52Total(10) === 13780);
  check('Levels: 0 XP Broke, 350 XP Budgeter, 99,999 XP Baller', F.levelFor(0).name === 'Broke' && F.levelFor(350).name === 'Budgeter' && F.levelFor(99999).name === 'Baller');
  const wfc = F.monthForecast({ today: new Date(2026, 8, 15), needs: { planned: 40000, actual: 30000 }, wants: { planned: 20000, actual: 15000 }, savings: { planned: 15000, actual: 0 }, income: 85000 });
  check('Money weather: mid-month forecast 80,000 of 85,000 → mostly sunny', close(wfc.projected, 80000) && wfc.label === 'Mostly sunny', String(wfc.projected));

  // Student money math: Safe-to-spend
  const stsNormal = F.safeToSpend({ balance: 4500, upcomingBills: 500, daysLeft: 10, monthlyAllowance: 12000 });
  check('Safe-to-spend (normal on track): (4,500 - 500) / 10 = ₹400/day (green)', stsNormal.available === 4000 && close(stsNormal.perDay, 400) && stsNormal.status === 'green');

  const stsAmber = F.safeToSpend({ balance: 1200, upcomingBills: 200, daysLeft: 10, monthlyAllowance: 12000 });
  check('Safe-to-spend (tight pace): ₹100/day < 65% of baseline (amber)', stsAmber.available === 1000 && close(stsAmber.perDay, 100) && stsAmber.status === 'amber');

  const stsZero = F.safeToSpend({ balance: 0, upcomingBills: 0, daysLeft: 10, monthlyAllowance: 10000 });
  check('Safe-to-spend (zero balance): ₹0/day (red)', stsZero.available === 0 && stsZero.perDay === 0 && stsZero.status === 'red');

  const stsOver = F.safeToSpend({ balance: 300, upcomingBills: 500, daysLeft: 5, monthlyAllowance: 10000 });
  check('Safe-to-spend (balance < bills): available negative → red', stsOver.available === -200 && stsOver.perDay === 0 && stsOver.status === 'red');

  const stsToday = F.safeToSpend({ balance: 10000, upcomingBills: 1000, daysLeft: 0, monthlyAllowance: 10000 });
  check('Safe-to-spend (allowance arriving today, daysLeft 0): no divide-by-zero', stsToday.available === 9000 && stsToday.perDay === 9000 && stsToday.daysLeft === 1);

  const stsIrregular = F.safeToSpend({ balance: 6000, upcomingBills: 0, daysLeft: 20, monthlyAllowance: 0 });
  check('Safe-to-spend (irregular allowance): 6,000 / 20 = ₹300/day', stsIrregular.available === 6000 && close(stsIrregular.perDay, 300) && stsIrregular.status === 'green');

  // Student money math: Run-out forecast & Sliders
  const fcLasts = F.forecastRunOut({ currentBalance: 6000, daysLeft: 20, dailySpendByCategory: { Food: 150, Outings: 50 }, startDate: '2026-10-01' });
  check('Forecast: 6,000 at 200/day lasts 20 days with 2,000 left', fcLasts.willMakeIt && close(fcLasts.endBalance, 2000) && fcLasts.points.length === 21);

  const fcRunsOut = F.forecastRunOut({ currentBalance: 3000, daysLeft: 20, dailySpendByCategory: { Food: 150, Outings: 50 }, startDate: '2026-10-01' });
  check('Forecast: 3,000 at 200/day runs out on day 15 (2026-10-16)', !fcRunsOut.willMakeIt && fcRunsOut.runOutDayIndex === 15 && fcRunsOut.runOutDay === '2026-10-16');

  const fcSlider = F.forecastRunOut({ currentBalance: 3000, daysLeft: 20, dailySpendByCategory: { Food: 150, Outings: 50 }, sliderAdjustments: { Food: -60 }, startDate: '2026-10-01' });
  check('Forecast with slider: saving 60/day makes 3,000 last 20 days with 200 left', fcSlider.willMakeIt && close(fcSlider.endBalance, 200));

  // Student money math: Semester view
  const semOnTrack = F.semesterPlan({ start: '2026-08-01', end: '2026-12-01', monthlyIncome: 10000, monthlyBaseExpenses: 6000, heavyMonths: [{ month: '2026-08', amount: 10000 }] });
  check('Semester plan (on track): 40k income covers 24k base + 10k fees', semOnTrack.onTrack && semOnTrack.surplus === 6000);

  const semBehind = F.semesterPlan({ start: '2026-08-01', end: '2026-12-01', monthlyIncome: 10000, monthlyBaseExpenses: 8000, heavyMonths: [{ month: '2026-08', amount: 15000 }], currentSaved: 1000 });
  check('Semester plan (behind): 41k total resources < 47k needed (6k behind)', !semBehind.onTrack && semBehind.surplus === -6000 && close(semBehind.monthlyBufferNeeded, 3500));

  // Student money math: Afford check
  const affYes = F.affordCheck({ balance: 5000, daysLeft: 10, amount: 500, eventDayOffset: 0, dailySpend: 100, monthlyAllowance: 12000 });
  check('Afford check (yes): buying 500 now leaves 4500 for 10 days = 450/day (green)', affYes.verdict === 'yes' && affYes.perDayAfter === 450);

  const affNo = F.affordCheck({ balance: 1000, daysLeft: 10, amount: 1500, eventDayOffset: 0, dailySpend: 100, monthlyAllowance: 12000 });
  check('Afford check (no): 1500 is more than 1000 balance', affNo.verdict === 'no' && affNo.perDayAfter === 0);

  const affTight = F.affordCheck({ balance: 1500, daysLeft: 10, amount: 1000, eventDayOffset: 0, dailySpend: 0, monthlyAllowance: 12000 });
  check('Afford check (tight): leaves 500 for 10 days = 50/day < 65% of baseline (400)', affTight.verdict === 'tight' && affTight.perDayAfter === 50);

  const affFix = F.affordCheck({ balance: 1000, daysLeft: 10, amount: 1500, eventDayOffset: 0, dailySpend: 100, monthlyAllowance: 12000, topCategory: { name: 'Food', dailyCost: 200 } });
  check('Afford check (fix): skip 3 food orders (200/day) to cover 500 shortfall', affFix.fix.includes('Skip 3 food orders'));

  // Student money math: What-if forecast
  const wiFore = F.whatIfForecast({ currentBalance: 3000, daysLeft: 20, dailySpendByCategory: { Food: 150, Fun: 50 }, categoryChanges: { Food: -50 }, startDate: '2026-10-01' });
  check('What-if forecast: saving 50/day (1000 total) pushes end balance from -1000 to 0', wiFore.savedPerDay === 50 && wiFore.savedTotal === 1000 && wiFore.willMakeIt && !wiFore.baselineWillMakeIt);

  // Student money math: Bill split proportional tax, service charge & paise rounding
  const testBill = F.splitBillExact({
    items: [
      { id: 'i1', name: 'Butter Chicken', price: 350 },
      { id: 'i2', name: 'Naan', price: 100 },
      { id: 'i3', name: 'Cold Drink', price: 65 }
    ],
    tax: 25.75,
    serviceCharge: 51.50,
    people: [
      { id: 'p1', name: 'Sam' },
      { id: 'p2', name: 'Rahul' },
      { id: 'p3', name: 'Aarav' }
    ],
    assignments: {
      'i1': ['p1', 'p2'],       // 350 split between Sam & Rahul = 175 each
      'i2': ['p1', 'p2', 'p3'], // 100 split 3 ways = 33.33 each
      'i3': ['p3']              // 65 to Aarav
    }
  });
  const sumOfShares = testBill.shares.reduce((s, sh) => s + sh.total, 0);
  const roundedSum = Math.round(sumOfShares * 100) / 100;
  check('Bill Split: 3 people with odd paise, 25.75 tax and 51.50 SC adds up exactly to grand total', roundedSum === testBill.grandTotal && testBill.grandTotal === 592.25);
  check('Bill Split: Proportional tax distributed higher to higher spenders', testBill.shares[0].tax > testBill.shares[2].tax);

  // Large group split stress test: 6 people, 15 items
  const people6 = Array.from({ length: 6 }, (_, i) => ({ id: `p${i + 1}`, name: `Friend ${i + 1}` }));
  const items15 = Array.from({ length: 15 }, (_, i) => ({ id: `it${i + 1}`, name: `Item ${i + 1}`, price: 45 + (i * 17.33) }));
  const assign15 = {};
  items15.forEach((it, i) => {
    // arbitrary overlapping assignments
    assign15[it.id] = [people6[i % 6].id, people6[(i + 1) % 6].id, people6[(i + 3) % 6].id];
  });
  const largeSplit = F.splitBillExact({ items: items15, tax: 123.45, serviceCharge: 67.89, people: people6, assignments: assign15 });
  const largeSum = Math.round(largeSplit.shares.reduce((s, sh) => s + sh.total, 0) * 100) / 100;
  check('Bill Split (6 people, 15 items): sum of shares matches grand total to exact paisa', largeSum === largeSplit.grandTotal && largeSplit.shares.length === 6);


  // Student money math: UPI Deep-Link URL encoding
  const upiUrl = F.buildUpiUrl({
    pa: 'rahul.sharma@okaxis',
    pn: 'Rahul & Friends + Co',
    am: 340.5,
    cu: 'INR',
    tn: 'Hostel Dinner / Friday Split & Snacks'
  });
  check('UPI URL: correct scheme and parameters', upiUrl.startsWith('upi://pay?pa=rahul.sharma%40okaxis&pn=Rahul%20%26%20Friends%20%2B%20Co&am=340.50&cu=INR&tn=Hostel%20Dinner%20%2F%20Friday%20Split%20%26%20Snacks'));
  check('UPI URL: spaces and symbols properly encoded', !upiUrl.includes(' ') && upiUrl.includes('%20%26%20') && upiUrl.includes('%2F'));

  // Student Money Wrapped & Insights: Ghost spending
  const ghostTest = F.calculateGhostSpending([
    { amount: 20 }, { amount: 45 }, { amount: 99 }, { amount: 100 }, { amount: 150 }, { amount: 1200 }
  ], 100);
  check('Ghost spending: 4 payments <= 100 add up to 264', ghostTest.count === 4 && ghostTest.total === 264);

  // Student Money Wrapped & Insights: Time of Day bands
  const timeTest = F.calculateTimeOfDayBands([
    { amount: 50, time: '08:30' },
    { amount: 120, time: '13:15' },
    { amount: 300, time: '20:00' },
    { amount: 450, time: '23:45' }
  ]);
  check('Time-of-day: all 4 bands correctly populated', timeTest.hasEnoughData && timeTest.bands.morning.total === 50 && timeTest.bands.afternoon.total === 120 && timeTest.bands.evening.total === 300 && timeTest.bands.lateNight.total === 450);

  // Student Money Wrapped & Insights: Spending Personalities
  const pLateNight = F.calculateSpendingPersonality({
    expenses: [{ amount: 400, time: '23:30' }, { amount: 200, time: '01:15' }, { amount: 100, time: '12:00' }],
    categories: [{ id: 'w1', name: 'Snacks', type: 'wants', actual: 700 }]
  });
  check('Spending personality: Late-night snacker rule', pLateNight.title === 'Late-night snacker');

  const pWeekend = F.calculateSpendingPersonality({
    expenses: [{ amount: 600, date: '2026-10-03' }, { amount: 400, date: '2026-10-04' }, { amount: 200, date: '2026-10-01' }], // Sat + Sun = 1000/1200
    categories: [{ id: 'w1', name: 'Fun', type: 'wants', actual: 1200 }]
  });
  check('Spending personality: Weekend spender rule', pWeekend.title === 'Weekend spender');

  const pChai = F.calculateSpendingPersonality({
    expenses: Array.from({ length: 9 }, (_, i) => ({ amount: 20, note: `Chai ${i + 1}`, date: '2026-10-02' })),
    categories: [{ id: 'w1', name: 'Snacks', type: 'wants', actual: 180 }]
  });
  check('Spending personality: Chai regular rule', pChai.title === 'Chai regular');

  // Student Hours-of-Work rate check
  const studentHourly = (partTimeAmt, weeklyHours) => {
    const monthlyHours = weeklyHours * (52 / 12);
    return monthlyHours > 0 ? partTimeAmt / monthlyHours : 0;
  };
  const testRate = studentHourly(6000, 10); // 6000 per month for 10h/week (43.33h/mo) = ~138.46/hr
  check('Hourly rate: 6000/mo at 10h/wk ≈ 138.46/hr', close(testRate, 138.46, 0.01));

  const passed = results.filter(r => r.ok).length;
  console.info(`Self-tests: ${passed}/${results.length} passed`);
  return { passed, total: results.length, results };
}
