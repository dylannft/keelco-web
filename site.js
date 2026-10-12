/* Keel Co: industry tabs and the enquiry form */
// Industry tabs (arrow keys move between tabs).
(function () {
  var tabs = [].slice.call(document.querySelectorAll('[role="tab"]'));
  function select(t) {
    tabs.forEach(function (x) {
      var on = x === t;
      x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1;
      document.getElementById(x.getAttribute('aria-controls')).hidden = !on;
    });
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { select(t); });
    t.addEventListener('keydown', function (e) {
      var j = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : -1;
      if (j > -1) { e.preventDefault(); select(tabs[j]); tabs[j].focus(); }
    });
  });
})();

// Enquiry form: saved straight to the Keel Co database.
(function () {
  var form = document.getElementById('enquiry');
  var status = document.getElementById('form-status');
  if (!form) return;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = Object.fromEntries(new FormData(form).entries());
    status.className = 'form-status';
    if (!data.name || !data.name.trim()) { status.className = 'form-status err'; status.textContent = 'Add your name so we know who to reply to.'; form.name.focus(); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email || '')) { status.className = 'form-status err'; status.textContent = 'Check your email address. It needs an @ and a domain.'; form.email.focus(); return; }
    Object.keys(data).forEach(function (k) { data[k] = (data[k] || '').trim() || null; });
    var btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Sending…';
    var c = window.KEEL_CONFIG;
    fetch(c.supabaseUrl + '/rest/v1/leads', {
      method: 'POST',
      headers: { 'apikey': c.supabaseKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify(data)
    }).then(function (r) {
      if (!r.ok) throw new Error('status ' + r.status);
      form.reset();
      status.className = 'form-status ok';
      status.textContent = 'Thanks. We’ll be in touch within one business day.';
    }).catch(function () {
      status.className = 'form-status err';
      status.textContent = 'That didn’t send. Email us at ' + c.contactEmail + ' instead.';
    }).finally(function () { btn.disabled = false; btn.textContent = 'Send enquiry'; });
  });
})();
