/* YOKO! Student · Hindi and Telugu screen text.
   Classic script: shares one global scope with the other js/ files (see README-AGENTS.md).
   How it works: the app is written in English. When the language is set to Hindi or Telugu, every piece of
   screen text that exactly matches a phrase below is swapped as it appears. Amounts, names and longer
   sentences stay in English for now. Each entry is [Hindi, Telugu]. */
'use strict';
const LANGS = [['en', 'English'], ['hi', 'हिन्दी (Hindi)'], ['te', 'తెలుగు (Telugu)']];
const I18N = {
  // navigation and pages
  'Home': ['होम', 'హోమ్'], 'Dashboard': ['डैशबोर्ड', 'డాష్‌బోర్డ్'], 'Spend': ['खर्च', 'ఖర్చు'], 'Budget': ['बजट', 'బడ్జెట్'],
  'Split': ['बाँटें', 'పంచుకో'], 'Goals': ['लक्ष्य', 'లక్ష్యాలు'], 'Debt': ['कर्ज़', 'అప్పు'], 'Settings': ['सेटिंग्स', 'సెట్టింగ్‌లు'],
  'Split & Roommates': ['बँटवारा और रूममेट्स', 'పంపకం & రూమ్‌మేట్స్'], 'Goals & Savings': ['लक्ष्य और बचत', 'లక్ష్యాలు & పొదుపు'],
  'Debt & Loans': ['कर्ज़ और लोन', 'అప్పులు & లోన్లు'], 'Budget Planner': ['बजट प्लानर', 'బడ్జెట్ ప్లానర్'],
  'Debt Payoff Planner': ['कर्ज़ चुकाने की योजना', 'అప్పు తీర్చే ప్లాన్'], 'Commands': ['कमांड', 'కమాండ్లు'],
  // tabs
  'Overview': ['सारांश', 'సారాంశం'], 'Run-out forecast': ['पैसा कब तक चलेगा', 'డబ్బు ఎంతకాలం సరిపోతుంది'], 'Semester': ['सेमेस्टर', 'సెమిస్టర్'],
  'Calendar': ['कैलेंडर', 'క్యాలెండర్'], 'Charts': ['चार्ट', 'చార్ట్‌లు'], 'Expense log': ['खर्च की सूची', 'ఖర్చుల జాబితా'],
  'Categories': ['श्रेणियाँ', 'కేటగిరీలు'], 'Insights & Heatmap': ['जानकारी और हीटमैप', 'విశ్లేషణ & హీట్‌మ్యాప్'], 'Recurring': ['हर महीने के', 'పునరావృత'],
  'Cash': ['नकद', 'నగదు'], 'Plan': ['योजना', 'ప్లాన్'], 'Where did it go?': ['पैसा कहाँ गया?', 'డబ్బు ఎక్కడికి వెళ్లింది?'],
  'Yearly / Semester fees': ['सालाना / सेमेस्टर फीस', 'వార్షిక / సెమిస్టర్ ఫీజులు'], 'History': ['इतिहास', 'చరిత్ర'],
  'IOUs & Roommates': ['उधार और रूममेट्स', 'అప్పులు & రూమ్‌మేట్స్'], 'Live Groups': ['लाइव ग्रुप', 'లైవ్ గ్రూపులు'], 'Settled': ['चुकता', 'తీర్చినవి'],
  'Savings': ['बचत', 'పొదుపు'], 'Wishlist': ['विशलिस्ट', 'విష్‌లిస్ట్'], 'Challenges': ['चैलेंज', 'ఛాలెంజ్‌లు'], 'Gifts': ['तोहफ़े', 'బహుమతులు'],
  'Debts': ['कर्ज़', 'అప్పులు'], 'Payoff plan': ['चुकाने की योजना', 'తీర్చే ప్లాన్'], 'Loan calculator': ['लोन कैलकुलेटर', 'లోన్ కాలిక్యులేటర్'],
  // home
  'Safe to spend today': ['आज खर्च करने लायक', 'ఈరోజు ఖర్చు చేయగలిగేది'], 'On track': ['सही रास्ते पर', 'సరైన దారిలో'], '✓ On track': ['✓ सही रास्ते पर', '✓ సరైన దారిలో'], 'Tight pace': ['थोड़ा तेज़ खर्च', 'ఖర్చు కొంచెం ఎక్కువ'], 'Overspent': ['ज़्यादा खर्च', 'ఎక్కువ ఖర్చు'],
  'On track until your next allowance': ['अगली पॉकेट मनी तक सब ठीक', 'తదుపరి పాకెట్ మనీ వరకు సరిపోతుంది'],
  'Daily limit:': ['रोज़ की सीमा:', 'రోజువారీ పరిమితి:'], 'This week:': ['इस हफ़्ते:', 'ఈ వారం:'],
  'Log expense': ['खर्च जोड़ें', 'ఖర్చు నమోదు'], 'Edit allowance': ['पॉकेट मनी बदलें', 'పాకెట్ మనీ మార్చు'], 'Add bank balance': ['बैंक बैलेंस जोड़ें', 'బ్యాంక్ బ్యాలెన్స్ జోడించు'],
  'Monthly allowance': ['महीने की पॉकेट मनी', 'నెలవారీ పాకెట్ మనీ'], 'Left until payday': ['अगली पॉकेट मनी तक बचा', 'తదుపరి డబ్బు వచ్చే వరకు మిగిలింది'],
  'Left this month': ['इस महीने बचा', 'ఈ నెల మిగిలింది'], 'No-spend streak': ['बिना खर्च की लगातार', 'ఖర్చులేని వరుస రోజులు'],
  'Your savings': ['आपकी बचत', 'మీ పొదుపు'], 'Total saved': ['कुल बचत', 'మొత్తం పొదుపు'], 'This month': ['इस महीने', 'ఈ నెల'], 'Savings rate': ['बचत दर', 'పొదుపు రేటు'],
  'of this month’s income': ['इस महीने की आय का', 'ఈ నెల ఆదాయంలో'], 'Your spending habits': ['आपकी खर्च की आदतें', 'మీ ఖర్చు అలవాట్లు'],
  '(drag to see what changes)': ['(खींचकर देखें क्या बदलता है)', '(లాగి ఏమి మారుతుందో చూడండి)'], 'Edit habits': ['आदतें बदलें', 'అలవాట్లు మార్చు'],
  'Semester plan': ['सेमेस्टर योजना', 'సెమిస్టర్ ప్లాన్'], 'Edit semester': ['सेमेस्टर बदलें', 'సెమిస్టర్ మార్చు'], 'Coming up': ['आने वाला', 'రాబోయేవి'],
  'Bill calendar': ['बिल कैलेंडर', 'బిల్లుల క్యాలెండర్'], 'Scan receipt': ['रसीद स्कैन करें', 'రసీదు స్కాన్ చేయి'], 'Full tutorial': ['पूरा ट्यूटोरियल', 'పూర్తి ట్యుటోరియల్'],
  'Money Wrapped': ['मनी रैप्ड', 'మనీ ర్యాప్డ్'], 'Subscription check-in': ['सब्सक्रिप्शन जाँच', 'సబ్‌స్క్రిప్షన్ తనిఖీ'], 'Worth cancelling?': ['बंद करना चाहिए?', 'రద్దు చేయాలా?'],
  'Cancel it': ['बंद करें', 'రద్దు చేయి'], 'Keep': ['रखें', 'ఉంచు'], 'Enable alerts': ['अलर्ट चालू करें', 'అలర్ట్‌లు ఆన్ చేయి'], 'Not now': ['अभी नहीं', 'ఇప్పుడు కాదు'],
  'Remove sample data': ['सैंपल डेटा हटाएँ', 'నమూనా డేటా తీసేయి'], 'Set allowance': ['पॉकेट मनी सेट करें', 'పాకెట్ మనీ సెట్ చేయి'], 'Send': ['भेजें', 'పంపు'],
  'Spending by category': ['श्रेणी के अनुसार खर्च', 'కేటగిరీ వారీగా ఖర్చు'], 'Savings goal progress': ['बचत लक्ष्य की प्रगति', 'పొదుపు లక్ష్య పురోగతి'],
  // spend
  'Left to spend today': ['आज खर्च के लिए बचा', 'ఈరోజు ఖర్చుకు మిగిలింది'], 'Left this period': ['इस अवधि में बचा', 'ఈ వ్యవధిలో మిగిలింది'],
  'Spent today': ['आज खर्च हुआ', 'ఈరోజు ఖర్చు'], 'Left this week': ['इस हफ़्ते बचा', 'ఈ వారం మిగిలింది'], 'In your bank': ['आपके बैंक में', 'మీ బ్యాంక్‌లో'],
  'Add expense': ['खर्च जोड़ें', 'ఖర్చు జోడించు'], 'Add an expense': ['खर्च जोड़ें', 'ఖర్చు జోడించు'], 'Search expenses': ['खर्च खोजें', 'ఖర్చులు వెతుకు'], 'Filters': ['फ़िल्टर', 'ఫిల్టర్లు'],
  'Category': ['श्रेणी', 'కేటగిరీ'], 'Date': ['तारीख़', 'తేదీ'], 'Note': ['नोट', 'నోట్'], 'Amount': ['रकम', 'మొత్తం'],
  'Ghost spending': ['छुपा खर्च', 'కనిపించని ఖర్చు'], 'Spending heatmap': ['खर्च का हीटमैप', 'ఖర్చు హీట్‌మ్యాప్'], 'Time-of-day habits': ['दिन के किस समय खर्च', 'రోజులో ఏ సమయంలో ఖర్చు'], 'Small payments': ['छोटे भुगतान', 'చిన్న చెల్లింపులు'],
  'Recurring payments': ['हर महीने के भुगतान', 'పునరావృత చెల్లింపులు'], 'Cash in hand': ['हाथ में नकद', 'చేతిలో నగదు'],
  // budget
  'Monthly income': ['महीने की आय', 'నెలవారీ ఆదాయం'], 'Log income': ['आय जोड़ें', 'ఆదాయం నమోదు'], 'Remaining this month': ['इस महीने बचा', 'ఈ నెల మిగిలింది'],
  'Daily allowance': ['रोज़ का खर्च', 'రోజువారీ పరిమితి'], 'Income this month': ['इस महीने की आय', 'ఈ నెల ఆదాయం'], 'Add category': ['श्रेणी जोड़ें', 'కేటగిరీ జోడించు'],
  '+ Add category': ['+ श्रेणी जोड़ें', '+ కేటగిరీ జోడించు'], 'Planned': ['तय', 'ప్లాన్'], 'Spent': ['खर्च', 'ఖర్చు'], 'Left': ['बचा', 'మిగిలింది'],
  'Bucket': ['हिस्सा', 'భాగం'], 'Type': ['प्रकार', 'రకం'], 'Total': ['कुल', 'మొత్తం'], 'Needs': ['ज़रूरतें', 'అవసరాలు'], 'Wants': ['इच्छाएँ', 'కోరికలు'],
  'Need': ['ज़रूरत', 'అవసరం'], 'Want': ['इच्छा', 'కోరిక'], 'Saving': ['बचत', 'పొదుపు'], 'Set my budgets for me': ['मेरा बजट बना दो', 'నా బడ్జెట్ సెట్ చేయి'],
  'Where did my money go?': ['मेरा पैसा कहाँ गया?', 'నా డబ్బు ఎక్కడికి వెళ్లింది?'], 'Yearly bills': ['सालाना बिल', 'వార్షిక బిల్లులు'], 'Month by month': ['महीने दर महीने', 'నెల వారీగా'],
  // split
  'You are owed': ['आपको मिलना है', 'మీకు రావాల్సింది'], 'You owe': ['आपको देना है', 'మీరు ఇవ్వాల్సింది'], 'Running balances': ['चालू हिसाब', 'నడుస్తున్న లెక్కలు'],
  'Owes you': ['आपका देनदार', 'మీకు ఇవ్వాలి'], 'Settle up': ['हिसाब चुकाएँ', 'లెక్క తీర్చు'], 'Settle': ['चुकाएँ', 'తీర్చు'], 'Split a bill': ['बिल बाँटें', 'బిల్లు పంచు'],
  'IOUs': ['उधार', 'అప్పులు'], 'Live Shared Budgets': ['लाइव साझा बजट', 'లైవ్ షేర్డ్ బడ్జెట్‌లు'], 'Create group': ['ग्रुप बनाएँ', 'గ్రూప్ సృష్టించు'],
  'Join with code': ['कोड से जुड़ें', 'కోడ్‌తో చేరు'], 'Who pays who': ['कौन किसे देगा', 'ఎవరు ఎవరికి ఇవ్వాలి'], 'Pay with UPI': ['UPI से भुगतान', 'UPI తో చెల్లించు'],
  'Ask to pay': ['भुगतान माँगें', 'చెల్లించమని అడుగు'], 'Settled history': ['चुकता इतिहास', 'తీర్చిన చరిత్ర'],
  // goals
  'Add goal': ['लक्ष्य जोड़ें', 'లక్ష్యం జోడించు'], 'Add money': ['पैसे जोड़ें', 'డబ్బు జోడించు'], 'Edit goal': ['लक्ष्य बदलें', 'లక్ష్యం మార్చు'],
  'Target': ['लक्ष्य रकम', 'లక్ష్య మొత్తం'], 'Saved': ['बचाया', 'పొదుపు చేసింది'], 'Progress': ['प्रगति', 'పురోగతి'], 'Deadline': ['समय सीमा', 'గడువు'],
  'Should I buy it?': ['क्या मैं इसे खरीदूँ?', 'ఇది కొనాలా?'], 'Add gift': ['तोहफ़ा जोड़ें', 'బహుమతి జోడించు'],
  // debt
  'Add debt': ['कर्ज़ जोड़ें', 'అప్పు జోడించు'], 'Debt-free by': ['कर्ज़-मुक्त होंगे', 'అప్పు తీరే తేదీ'], 'Your debts': ['आपके कर्ज़', 'మీ అప్పులు'],
  'Balance': ['बकाया', 'బకాయి'], 'Rate': ['ब्याज दर', 'వడ్డీ రేటు'], 'Minimum': ['न्यूनतम', 'కనీసం'], 'Log a payment': ['भुगतान जोड़ें', 'చెల్లింపు నమోదు'],
  'Monthly plan': ['महीने की योजना', 'నెలవారీ ప్లాన్'], 'What if I paid more?': ['अगर मैं ज़्यादा भरूँ तो?', 'ఎక్కువ కడితే ఏమవుతుంది?'],
  // menus and common buttons
  'Cancel': ['रद्द करें', 'రద్దు'], 'Close': ['बंद करें', 'మూసివేయి'], 'Save': ['सेव करें', 'సేవ్ చేయి'], 'Save changes': ['बदलाव सेव करें', 'మార్పులు సేవ్ చేయి'],
  'Add': ['जोड़ें', 'జోడించు'], 'Edit': ['बदलें', 'మార్చు'], 'Delete': ['हटाएँ', 'తొలగించు'], 'Next': ['आगे', 'తర్వాత'], 'Back': ['पीछे', 'వెనక్కి'],
  'Money in and out': ['पैसा आया और गया', 'వచ్చిన & పోయిన డబ్బు'], 'Expense': ['खर्च', 'ఖర్చు'], 'Scan a receipt': ['रसीद स्कैन करें', 'రసీదు స్కాన్ చేయి'],
  'Split an expense': ['खर्च बाँटें', 'ఖర్చు పంచు'], 'Paste a bank message': ['बैंक मैसेज चिपकाएँ', 'బ్యాంక్ మెసేజ్ పేస్ట్ చేయి'], 'Cash in / out': ['नकद आया / गया', 'నగదు లోపలికి / బయటికి'],
  'Income received': ['आय मिली', 'ఆదాయం వచ్చింది'], 'Pocket money / Allowance': ['पॉकेट मनी', 'పాకెట్ మనీ'], 'Plans': ['योजनाएँ', 'ప్లాన్‌లు'],
  'Recurring payment': ['हर महीने का भुगतान', 'పునరావృత చెల్లింపు'], 'Yearly / Semester fee': ['सालाना / सेमेस्टर फीस', 'వార్షిక / సెమిస్టర్ ఫీజు'],
  'Goal': ['लक्ष्य', 'లక్ష్యం'], 'Gift': ['तोहफ़ा', 'బహుమతి'], 'Subscription': ['सब्सक्रिप्शन', 'సబ్‌స్క్రిప్షన్'], 'IOU': ['उधार', 'అప్పు'], 'Transport': ['आना-जाना', 'ప్రయాణం'],
  'Other': ['अन्य', 'ఇతర'], 'Tour this page': ['इस पेज का टूर', 'ఈ పేజీ టూర్'], 'Load demo data': ['डेमो डेटा लोड करें', 'డెమో డేటా లోడ్ చేయి'],
  'Remove demo data': ['डेमो डेटा हटाएँ', 'డెమో డేటా తీసేయి'], 'Print or save as PDF': ['प्रिंट या PDF सेव', 'ప్రింట్ లేదా PDF సేవ్'],
  'Nothing here yet': ['अभी यहाँ कुछ नहीं', 'ఇక్కడ ఇంకా ఏమీ లేదు'],
  // settings
  'Basics': ['बुनियादी', 'ప్రాథమికం'], 'Money': ['पैसा', 'డబ్బు'], 'Account': ['खाता', 'ఖాతా'], 'Data': ['डेटा', 'డేటా'], 'Help': ['मदद', 'సహాయం'],
  'Country and currency': ['देश और मुद्रा', 'దేశం & కరెన్సీ'], 'Country': ['देश', 'దేశం'], 'Currency': ['मुद्रा', 'కరెన్సీ'], 'Language': ['भाषा', 'భాష'],
  'Theme and sound': ['थीम और आवाज़', 'థీమ్ & శబ్దం'], 'Chart colors': ['चार्ट के रंग', 'చార్ట్ రంగులు'], 'Privacy and pet': ['प्राइवेसी और पेट', 'గోప్యత & పెట్'], 'Tutorials': ['ट्यूटोरियल', 'ట్యుటోరియల్స్'],
  'Your data': ['आपका डेटा', 'మీ డేటా'], 'Backups': ['बैकअप', 'బ్యాకప్‌లు'], 'Reset': ['रीसेट', 'రీసెట్']
};
/** Current screen language: 'en', 'hi' or 'te'. */
const uiLang = () => (typeof state !== 'undefined' && state && state.settings && ['hi', 'te'].includes(state.settings.lang) ? state.settings.lang : 'en');
function translateNode(root) {
  const li = { hi: 0, te: 1 }[uiLang()];
  if (li === undefined || !root) return;
  const walk = node => {
    if (node.nodeType === 3) {
      const raw = node.nodeValue, key = raw.trim();
      if (key && I18N[key]) node.nodeValue = raw.replace(key, I18N[key][li]);
      return;
    }
    if (node.nodeType !== 1 || node.tagName === 'SCRIPT' || node.tagName === 'STYLE' || node.tagName === 'TEXTAREA') return;
    if (node.tagName === 'OPTION' && I18N[node.textContent.trim()]) { node.textContent = I18N[node.textContent.trim()][li]; return; }
    for (const c of node.childNodes) walk(c);
  };
  walk(root);
}
/** Translate everything now, then keep translating whatever the app draws next. */
function startI18n() {
  document.documentElement.lang = uiLang();
  if (uiLang() === 'en') return;
  translateNode(document.body);
  new MutationObserver(list => { for (const m of list) for (const n of m.addedNodes) translateNode(n); })
    .observe(document.body, { childList: true, subtree: true });
}
