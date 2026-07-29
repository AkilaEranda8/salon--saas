(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function todayISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function emptyState(title, copy) {
    return (
      '<div class="hsb-empty-state"><strong>' +
      esc(title) +
      '</strong><span>' +
      esc(copy) +
      '</span></div>'
    );
  }

  ready(function () {
    var root = document.getElementById('hsb-root');
    if (!root) return;

    var ajaxUrl = root.getAttribute('data-ajax-url');
    var nonce = root.getAttribute('data-nonce');
    var bodyEl = document.getElementById('hsb-body');
    var footerEl = document.getElementById('hsb-footer');
    var errorEl = document.getElementById('hsb-error');
    var stepEls = root.querySelectorAll('.hsb-steps li');

    var state = {
      step: 0,
      branches: [],
      services: [],
      staff: [],
      slots: [],
      category: '',
      form: {
        branch: null,
        services: [],
        staff: null,
        date: '',
        time: '',
        customer_name: '',
        phone: '',
        email: '',
        notes: '',
      },
      submitting: false,
      result: null,
    };

    function showError(msg) {
      if (!msg) {
        errorEl.hidden = true;
        errorEl.textContent = '';
        return;
      }
      errorEl.hidden = false;
      errorEl.textContent = msg;
    }

    function api(action, params, options) {
      options = options || {};
      var url = ajaxUrl + (ajaxUrl.indexOf('?') >= 0 ? '&' : '?') + 'action=hsb_proxy&hsb_action=' + encodeURIComponent(action) + '&nonce=' + encodeURIComponent(nonce);
      if (params && options.method !== 'POST') {
        Object.keys(params).forEach(function (k) {
          if (params[k] == null || params[k] === '') return;
          url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
        });
      }

      var opts = { method: options.method || 'GET', credentials: 'same-origin' };
      if (options.method === 'POST') {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = JSON.stringify(params || {});
      }

      return fetch(url, opts).then(function (res) {
        return res.text().then(function (text) {
          var payload = null;
          try {
            payload = text ? JSON.parse(text) : null;
          } catch (e) {
            throw new Error(res.ok ? 'Invalid response from booking server.' : 'Booking failed (HTTP ' + res.status + ').');
          }
          // WordPress wp_send_json_success / _error shape
          if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'success')) {
            if (!payload.success) {
              var errData = payload.data || {};
              throw new Error(errData.message || 'Request failed');
            }
            return payload.data;
          }
          if (!res.ok) {
            throw new Error((payload && payload.message) || 'Request failed');
          }
          return payload;
        });
      });
    }

    function durationTotal() {
      return state.form.services.reduce(function (sum, s) {
        return sum + (Number(s.duration_minutes) || 30);
      }, 0);
    }

    function setStep(n) {
      state.step = n;
      stepEls.forEach(function (li) {
        var s = Number(li.getAttribute('data-step'));
        li.classList.toggle('is-active', s === n);
        li.classList.toggle('is-done', s < n);
      });
      render();
    }

    function canContinue() {
      if (state.step === 0) return !!state.form.branch;
      if (state.step === 1) return state.form.services.length > 0;
      if (state.step === 2) return !!state.form.staff && !!state.form.date && !!state.form.time;
      if (state.step === 3) {
        return state.form.customer_name.trim() && state.form.phone.trim();
      }
      return false;
    }

    function renderFooter() {
      if (state.step >= 4) {
        footerEl.hidden = true;
        footerEl.innerHTML = '';
        return;
      }
      footerEl.hidden = false;
      var back = state.step > 0
        ? '<button type="button" class="hsb-btn hsb-btn-ghost" data-hsb="back">Back</button>'
        : '<span></span>';
      var nextLabel = state.step === 3 ? (state.submitting ? 'Booking…' : 'Confirm booking') : 'Continue';
      footerEl.innerHTML =
        back +
        '<button type="button" class="hsb-btn hsb-btn-primary" data-hsb="next"' +
        (canContinue() && !state.submitting ? '' : ' disabled') +
        '>' +
        nextLabel +
        '</button>';
    }

    function renderBranch() {
      if (!state.branches.length) {
        bodyEl.innerHTML = emptyState('No branches available', 'Ask the salon to activate at least one branch for online booking.');
        return;
      }
      bodyEl.innerHTML =
        '<div class="hsb-section-title">Choose a branch</div>' +
        '<p class="hsb-section-copy">Select where you would like to visit.</p>' +
        '<div class="hsb-grid">' +
        state.branches
          .map(function (b) {
            var sel = state.form.branch && state.form.branch.id === b.id ? ' is-selected' : '';
            return (
              '<button type="button" class="hsb-option' +
              sel +
              '" data-hsb="pick-branch" data-id="' +
              b.id +
              '"><strong>' +
              esc(b.name) +
              '</strong><span>' +
              esc(b.address || 'Salon location') +
              '</span></button>'
            );
          })
          .join('') +
        '</div>';
    }

    function categories() {
      var set = {};
      state.services.forEach(function (s) {
        if (s.category) set[s.category] = true;
      });
      return Object.keys(set).sort();
    }

    function renderServices() {
      var cats = categories();
      var filters =
        '<div class="hsb-filters">' +
        '<button type="button" class="hsb-chip' +
        (!state.category ? ' is-active' : '') +
        '" data-hsb="cat" data-cat="">All</button>' +
        cats
          .map(function (c) {
            return (
              '<button type="button" class="hsb-chip' +
              (state.category === c ? ' is-active' : '') +
              '" data-hsb="cat" data-cat="' +
              esc(c) +
              '">' +
              esc(c) +
              '</button>'
            );
          })
          .join('') +
        '</div>';

      var list = state.services.filter(function (s) {
        return !state.category || s.category === state.category;
      });

      if (!list.length) {
        bodyEl.innerHTML =
          filters +
          emptyState(
            'No services found',
            state.services.length
              ? 'Try another category.'
              : 'Check that services are active in the salon admin, and that the correct Tenant ID is saved in plugin settings.'
          );
        return;
      }

      var selectedIds = state.form.services.map(function (s) {
        return s.id;
      });

      bodyEl.innerHTML =
        '<div class="hsb-section-title">Select services</div>' +
        '<p class="hsb-section-copy">Choose one or more treatments for this visit.</p>' +
        filters +
        '<div class="hsb-grid">' +
        list
          .map(function (s) {
            var sel = selectedIds.indexOf(s.id) >= 0 ? ' is-selected' : '';
            return (
              '<button type="button" class="hsb-option' +
              sel +
              '" data-hsb="toggle-service" data-id="' +
              s.id +
              '"><strong>' +
              esc(s.name) +
              '</strong><div class="hsb-option-meta"><span>' +
              esc(s.duration_minutes || 30) +
              ' min</span></div></button>'
            );
          })
          .join('') +
        '</div>';
    }

    function renderStaffTime() {
      var staffHtml = state.staff.length
        ? state.staff
            .map(function (st) {
              var sel = state.form.staff && state.form.staff.id === st.id ? ' is-selected' : '';
              return (
                '<button type="button" class="hsb-option' +
                sel +
                '" data-hsb="pick-staff" data-id="' +
                st.id +
                '"><strong>' +
                esc(st.name) +
                '</strong><span>' +
                esc(st.role_title || 'Stylist') +
                '</span></button>'
              );
            })
            .join('')
        : emptyState('No staff available', 'No active staff are assigned to this branch.');

      var slotsHtml = !state.form.staff
        ? emptyState('Choose staff first', 'Pick a stylist to unlock available times.')
        : !state.form.date
          ? emptyState('Choose a date', 'Select a date to see open appointment times.')
          : !state.slots.length
            ? emptyState('No times available', 'Try another date or staff member.')
            : '<div class="hsb-slots">' +
              state.slots
                .map(function (t) {
                  var sel = state.form.time === t ? ' is-selected' : '';
                  return (
                    '<button type="button" class="hsb-slot' +
                    sel +
                    '" data-hsb="pick-time" data-time="' +
                    esc(t) +
                    '">' +
                    esc(t) +
                    '</button>'
                  );
                })
                .join('') +
              '</div>';

      bodyEl.innerHTML =
        '<div class="hsb-section-title">Staff &amp; schedule</div>' +
        '<p class="hsb-section-copy">Pick your stylist, then choose a date and time.</p>' +
        '<div class="hsb-row hsb-row-2">' +
        '<div><div class="hsb-panel-title">Staff</div><div class="hsb-grid">' +
        staffHtml +
        '</div></div>' +
        '<div>' +
        '<div class="hsb-field" style="margin-bottom:1rem"><label for="hsb-date">Date</label>' +
        '<input type="date" id="hsb-date" min="' +
        todayISO() +
        '" value="' +
        esc(state.form.date) +
        '" /></div>' +
        '<div class="hsb-panel-title">Available times</div>' +
        slotsHtml +
        '</div></div>';
    }

    function renderDetails() {
      var names = state.form.services
        .map(function (s) {
          return s.name;
        })
        .join(', ');
      bodyEl.innerHTML =
        '<div class="hsb-section-title">Your details</div>' +
        '<p class="hsb-section-copy">Review the visit, then leave your contact details.</p>' +
        '<dl class="hsb-summary">' +
        '<div><dt>Branch</dt><dd>' +
        esc(state.form.branch && state.form.branch.name) +
        '</dd></div>' +
        '<div><dt>Services</dt><dd>' +
        esc(names) +
        ' · ' +
        durationTotal() +
        ' min</dd></div>' +
        '<div><dt>Staff / when</dt><dd>' +
        esc(state.form.staff && state.form.staff.name) +
        ' · ' +
        esc(state.form.date) +
        ' ' +
        esc(state.form.time) +
        '</dd></div></dl>' +
        '<div class="hsb-row" style="margin-top:1rem">' +
        '<div class="hsb-field"><label for="hsb-name">Your name *</label>' +
        '<input id="hsb-name" type="text" autocomplete="name" value="' +
        esc(state.form.customer_name) +
        '" /></div>' +
        '<div class="hsb-field"><label for="hsb-phone">Phone *</label>' +
        '<input id="hsb-phone" type="tel" autocomplete="tel" value="' +
        esc(state.form.phone) +
        '" /></div>' +
        '<div class="hsb-field"><label for="hsb-email">Email</label>' +
        '<input id="hsb-email" type="email" autocomplete="email" value="' +
        esc(state.form.email) +
        '" /></div>' +
        '<div class="hsb-field"><label for="hsb-notes">Notes</label>' +
        '<textarea id="hsb-notes" rows="3" placeholder="Anything we should know before your visit?">' +
        esc(state.form.notes) +
        '</textarea></div></div>';
    }

    function renderDone() {
      bodyEl.innerHTML =
        '<div class="hsb-success"><div class="hsb-success-icon" aria-hidden="true">✓</div><h3>Booking requested</h3>' +
        '<p>We received your request. The salon will confirm shortly.</p>' +
        '<p><strong>' +
        esc(state.form.date) +
        ' at ' +
        esc(state.form.time) +
        '</strong></p>' +
        '<button type="button" class="hsb-btn hsb-btn-primary" style="margin-top:1.2rem" data-hsb="restart">Book another</button></div>';
    }

    function render() {
      showError('');
      if (state.step === 0) renderBranch();
      else if (state.step === 1) renderServices();
      else if (state.step === 2) renderStaffTime();
      else if (state.step === 3) renderDetails();
      else renderDone();
      renderFooter();
    }

    function loadBranches() {
      bodyEl.innerHTML = '<p class="hsb-loading">Loading branches…</p>';
      api('branches')
        .then(function (data) {
          state.branches = Array.isArray(data) ? data : [];
          render();
        })
        .catch(function (err) {
          bodyEl.innerHTML = '';
          showError(err.message || 'Failed to load branches');
        });
    }

    function loadServices() {
      return api('services').then(function (data) {
        state.services = Array.isArray(data) ? data : [];
      });
    }

    function loadStaff() {
      if (!state.form.branch) return Promise.resolve();
      return api('staff', { branch_id: state.form.branch.id }).then(function (data) {
        state.staff = Array.isArray(data) ? data : [];
      });
    }

    function loadSlots() {
      if (!state.form.staff || !state.form.date) {
        state.slots = [];
        return Promise.resolve();
      }
      return api('availability', {
        staff_id: state.form.staff.id,
        date: state.form.date,
        duration: Math.max(30, durationTotal() || 30),
        branch_id: state.form.branch && state.form.branch.id,
      }).then(function (data) {
        state.slots = Array.isArray(data) ? data : [];
        if (state.form.time && state.slots.indexOf(state.form.time) < 0) {
          state.form.time = '';
        }
      });
    }

    function submitBooking() {
      state.submitting = true;
      renderFooter();
      var payload = {
        branch_id: state.form.branch.id,
        service_ids: state.form.services.map(function (s) {
          return s.id;
        }),
        staff_id: state.form.staff.id,
        customer_name: state.form.customer_name.trim(),
        phone: state.form.phone.trim(),
        email: state.form.email.trim(),
        date: state.form.date,
        time: state.form.time,
        notes: state.form.notes.trim(),
      };
      api('book', payload, { method: 'POST' })
        .then(function (data) {
          state.result = data;
          state.submitting = false;
          setStep(4);
        })
        .catch(function (err) {
          state.submitting = false;
          renderFooter();
          showError(err.message || 'Booking failed');
        });
    }

    root.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-hsb]');
      if (!btn || !root.contains(btn)) return;
      var act = btn.getAttribute('data-hsb');

      if (act === 'pick-branch') {
        var bid = Number(btn.getAttribute('data-id'));
        state.form.branch = state.branches.find(function (b) {
          return b.id === bid;
        }) || null;
        state.form.staff = null;
        state.form.date = '';
        state.form.time = '';
        state.staff = [];
        state.slots = [];
        render();
        return;
      }

      if (act === 'toggle-service') {
        var sid = Number(btn.getAttribute('data-id'));
        var svc = state.services.find(function (s) {
          return s.id === sid;
        });
        if (!svc) return;
        var idx = state.form.services.findIndex(function (s) {
          return s.id === sid;
        });
        if (idx >= 0) state.form.services.splice(idx, 1);
        else state.form.services.push(svc);
        state.form.time = '';
        state.slots = [];
        render();
        return;
      }

      if (act === 'cat') {
        state.category = btn.getAttribute('data-cat') || '';
        render();
        return;
      }

      if (act === 'pick-staff') {
        var stid = Number(btn.getAttribute('data-id'));
        state.form.staff = state.staff.find(function (s) {
          return s.id === stid;
        }) || null;
        state.form.time = '';
        loadSlots().then(render).catch(function (err) {
          showError(err.message);
        });
        render();
        return;
      }

      if (act === 'pick-time') {
        state.form.time = btn.getAttribute('data-time') || '';
        render();
        return;
      }

      if (act === 'back') {
        setStep(Math.max(0, state.step - 1));
        return;
      }

      if (act === 'next') {
        if (!canContinue()) return;
        if (state.step === 0) {
          bodyEl.innerHTML = '<p class="hsb-loading">Loading services…</p>';
          loadServices()
            .then(function () {
              setStep(1);
            })
            .catch(function (err) {
              showError(err.message);
              render();
            });
          return;
        }
        if (state.step === 1) {
          bodyEl.innerHTML = '<p class="hsb-loading">Loading staff…</p>';
          loadStaff()
            .then(function () {
              setStep(2);
            })
            .catch(function (err) {
              showError(err.message);
              render();
            });
          return;
        }
        if (state.step === 2) {
          setStep(3);
          return;
        }
        if (state.step === 3) {
          submitBooking();
        }
        return;
      }

      if (act === 'restart') {
        state.form = {
          branch: state.form.branch,
          services: [],
          staff: null,
          date: '',
          time: '',
          customer_name: '',
          phone: '',
          email: '',
          notes: '',
        };
        state.slots = [];
        state.result = null;
        setStep(1);
      }
    });

    root.addEventListener('input', function (e) {
      var t = e.target;
      if (t.id === 'hsb-date') {
        state.form.date = t.value;
        state.form.time = '';
        loadSlots()
          .then(render)
          .catch(function (err) {
            showError(err.message);
            render();
          });
        return;
      }
      if (t.id === 'hsb-name') state.form.customer_name = t.value;
      if (t.id === 'hsb-phone') state.form.phone = t.value;
      if (t.id === 'hsb-email') state.form.email = t.value;
      if (t.id === 'hsb-notes') state.form.notes = t.value;
      if (state.step === 3) renderFooter();
    });

    loadBranches();
  });
})();
