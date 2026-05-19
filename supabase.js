/* ============================================
   Supabase Mailing List — Form Handler
   ============================================ */
(function () {
  'use strict';

  const EDGE_FN_URL = 'https://mndumzkkhdtggcgmddbv.supabase.co/functions/v1/subscribe';

  // Determine environment source based on hostname
  function getSource() {
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host.includes('dev') || host.includes('preview')) {
      return 'website-dev';
    }
    return 'website-prod';
  }

  document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('mailing-list-form');
    if (!form) return;

    const emailInput = document.getElementById('mailing-email');
    const nameInput  = document.getElementById('mailing-name');
    const submitBtn  = document.getElementById('mailing-submit-btn');
    const statusEl   = document.getElementById('mailing-status');

    form.addEventListener('submit', async function (e) {
      e.preventDefault();

      const email = (emailInput.value || '').trim();
      const name  = (nameInput.value || '').trim();

      if (!email) {
        showStatus('Please enter your email address.', 'error');
        return;
      }

      // Disable button + show spinner
      submitBtn.disabled = true;
      submitBtn.classList.add('loading');
      statusEl.textContent = '';
      statusEl.className = 'form-status';

      try {
        const res = await fetch(EDGE_FN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, name: name || undefined, source: getSource() }),
        });

        const data = await res.json();

        if (res.ok && data.message) {
          showStatus(data.message, 'success');
          form.reset();
        } else {
          showStatus(data.error || 'Something went wrong. Please try again.', 'error');
        }
      } catch (err) {
        console.error('Mailing list error:', err);
        showStatus('Network error — please check your connection and try again.', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.classList.remove('loading');
      }
    });

    function showStatus(msg, type) {
      statusEl.textContent = msg;
      statusEl.className = 'form-status ' + type;
    }
  });
})();
