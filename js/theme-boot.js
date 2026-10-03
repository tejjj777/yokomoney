/* Apply the saved theme before first paint (loaded in <head>). */
try { var st = (JSON.parse(localStorage.getItem('yoko.student.v1') || '{}').settings || {}); var th = st.theme;
  if (['yoko', 'blue', 'red'].indexOf(th) < 0) th = 'yoko';
  document.documentElement.dataset.theme = th; } catch (e) { document.documentElement.dataset.theme = 'yoko'; }
