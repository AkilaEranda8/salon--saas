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

  function staffInitials(name) {
    return String(name || '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(function (part) {
        return part.charAt(0).toUpperCase();
      })
      .join('');
  }

  function staffAvatar(st) {
    var initials = esc(staffInitials(st.name) || '?');
    var photoUrl = String(st.photo_url || '').trim();
    if (!/^https?:\/\//i.test(photoUrl)) {
      return '<span class="hsb-staff-avatar hsb-staff-avatar-fallback" aria-hidden="true">' + initials + '</span>';
    }

    return (
      '<span class="hsb-staff-avatar hsb-staff-avatar-fallback" aria-hidden="true">' +
      initials +
      '<img src="' +
      esc(photoUrl) +
      '" alt="" loading="lazy" referrerpolicy="no-referrer" />' +
      '</span>'
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
      category: '',
      form: {
        branch: null,
        services: [],
        // Per-service booking: { [serviceId]: { staff, date, time, slots } }
        assignments: {},
        customer_name: '',
        phone: '',
        email: '',
        notes: '',
      },
      submitting: false,
      result: null,
    };

    function emptyAssignment() {
      return { staff: null, date: '', time: '', slots: [] };
    }

    function getAssignment(serviceId) {
      var key = String(serviceId);
      if (!state.form.assignments[key]) {
        state.form.assignments[key] = emptyAssignment();
      }
      return state.form.assignments[key];
    }

    function syncAssignments() {
      var next = {};
      state.form.services.forEach(function (s) {
        var key = String(s.id);
        next[key] = state.form.assignments[key] || emptyAssignment();
      });
      state.form.assignments = next;
    }

    function assignmentsReady() {
      if (!state.form.services.length) return false;
      return state.form.services.every(function (s) {
        var a = getAssignment(s.id);
        return !!(a.staff && a.date && a.time);
      });
    }

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
      if (state.step === 2) return assignmentsReady();
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
      if (!state.form.services.length) {
        bodyEl.innerHTML = emptyState('No services selected', 'Go back and choose at least one service.');
        return;
      }

      var cards = state.form.services
        .map(function (svc) {
          var a = getAssignment(svc.id);
          var staffHtml = state.staff.length
            ? state.staff
                .map(function (st) {
                  var sel = a.staff && a.staff.id === st.id ? ' is-selected' : '';
                  return (
                    '<button type="button" class="hsb-option hsb-staff-option' +
                    sel +
                    '" data-hsb="pick-staff" data-service="' +
                    svc.id +
                    '" data-id="' +
                    st.id +
                    '">' +
                    staffAvatar(st) +
                    '<span class="hsb-staff-copy"><strong>' +
                    esc(st.name) +
                    '</strong><span>' +
                    esc(st.role_title || 'Stylist') +
                    '</span></span></button>'
                  );
                })
                .join('')
            : emptyState('No staff available', 'No active staff are assigned to this branch.');

          var slotsHtml = !a.staff
            ? emptyState('Choose staff first', 'Pick a stylist for this service.')
            : !a.date
              ? emptyState('Choose a date', 'Select a date to see open times.')
              : !a.slots.length
                ? emptyState('No times available', 'Try another date or staff member.')
                : '<div class="hsb-slots">' +
                  a.slots
                    .map(function (t) {
                      var sel = a.time === t ? ' is-selected' : '';
                      return (
                        '<button type="button" class="hsb-slot' +
                        sel +
                        '" data-hsb="pick-time" data-service="' +
                        svc.id +
                        '" data-time="' +
                        esc(t) +
                        '">' +
                        esc(t) +
                        '</button>'
                      );
                    })
                    .join('') +
                  '</div>';

          var done = a.staff && a.date && a.time;
          return (
            '<div class="hsb-assign-card' +
            (done ? ' is-ready' : '') +
            '">' +
            '<div class="hsb-assign-head">' +
            '<div><strong>' +
            esc(svc.name) +
            '</strong><span>' +
            esc(svc.duration_minutes || 30) +
            ' min</span></div>' +
            (done
              ? '<em>' + esc(a.staff.name) + ' · ' + esc(a.date) + ' ' + esc(a.time) + '</em>'
              : '<em>Pick staff &amp; time</em>') +
            '</div>' +
            '<div class="hsb-panel-title">Staff</div>' +
            '<div class="hsb-grid hsb-staff-grid">' +
            staffHtml +
            '</div>' +
            '<div class="hsb-field" style="margin:1rem 0 0.85rem"><label for="hsb-date-' +
            svc.id +
            '">Date</label>' +
            '<input type="date" id="hsb-date-' +
            svc.id +
            '" data-hsb-date="' +
            svc.id +
            '" min="' +
            todayISO() +
            '" value="' +
            esc(a.date) +
            '" /></div>' +
            '<div class="hsb-panel-title">Available times</div>' +
            slotsHtml +
            '</div>'
          );
        })
        .join('');

      bodyEl.innerHTML =
        '<div class="hsb-section-title">Staff &amp; schedule</div>' +
        '<p class="hsb-section-copy">Each service can use a different stylist and time.</p>' +
        '<div class="hsb-assign-list">' +
        cards +
        '</div>';
    }

    function renderDetails() {
      var summary = state.form.services
        .map(function (s) {
          var a = getAssignment(s.id);
          return (
            '<div><dt>' +
            esc(s.name) +
            '</dt><dd>' +
            esc(a.staff && a.staff.name) +
            ' · ' +
            esc(a.date) +
            ' ' +
            esc(a.time) +
            ' · ' +
            esc(s.duration_minutes || 30) +
            ' min</dd></div>'
          );
        })
        .join('');
      bodyEl.innerHTML =
        '<div class="hsb-section-title">Your details</div>' +
        '<p class="hsb-section-copy">Review each booking, then leave your contact details.</p>' +
        '<dl class="hsb-summary">' +
        '<div><dt>Branch</dt><dd>' +
        esc(state.form.branch && state.form.branch.name) +
        '</dd></div>' +
        summary +
        '</dl>' +
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

    function loadSlotsForService(serviceId) {
      var svc = state.form.services.find(function (s) {
        return s.id === Number(serviceId);
      });
      var a = getAssignment(serviceId);
      if (!svc || !a.staff || !a.date) {
        a.slots = [];
        return Promise.resolve();
      }
      return api('availability', {
        staff_id: a.staff.id,
        date: a.date,
        duration: Math.max(30, Number(svc.duration_minutes) || 30),
        branch_id: state.form.branch && state.form.branch.id,
      }).then(function (data) {
        a.slots = Array.isArray(data) ? data : [];
        if (a.time && a.slots.indexOf(a.time) < 0) {
          a.time = '';
        }
      });
    }

    function submitBooking() {
      state.submitting = true;
      renderFooter();
      var payload = {
        branch_id: state.form.branch.id,
        customer_name: state.form.customer_name.trim(),
        phone: state.form.phone.trim(),
        email: state.form.email.trim(),
        notes: state.form.notes.trim(),
        items: state.form.services.map(function (s) {
          var a = getAssignment(s.id);
          return {
            service_id: s.id,
            staff_id: a.staff.id,
            date: a.date,
            time: a.time,
          };
        }),
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
        state.form.assignments = {};
        state.staff = [];
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
        syncAssignments();
        render();
        return;
      }

      if (act === 'cat') {
        state.category = btn.getAttribute('data-cat') || '';
        render();
        return;
      }

      if (act === 'pick-staff') {
        var serviceId = Number(btn.getAttribute('data-service'));
        var stid = Number(btn.getAttribute('data-id'));
        var assignment = getAssignment(serviceId);
        assignment.staff = state.staff.find(function (s) {
          return s.id === stid;
        }) || null;
        assignment.time = '';
        loadSlotsForService(serviceId).then(render).catch(function (err) {
          showError(err.message);
        });
        render();
        return;
      }

      if (act === 'pick-time') {
        var serviceForTime = Number(btn.getAttribute('data-service'));
        getAssignment(serviceForTime).time = btn.getAttribute('data-time') || '';
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
          syncAssignments();
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
          assignments: {},
          customer_name: '',
          phone: '',
          email: '',
          notes: '',
        };
        state.result = null;
        setStep(1);
      }
    });

    root.addEventListener('error', function (e) {
      if (e.target && e.target.matches('.hsb-staff-avatar img')) {
        e.target.remove();
      }
    }, true);

    root.addEventListener('input', function (e) {
      var t = e.target;
      var dateServiceId = t.getAttribute && t.getAttribute('data-hsb-date');
      if (dateServiceId) {
        var a = getAssignment(dateServiceId);
        a.date = t.value;
        a.time = '';
        loadSlotsForService(dateServiceId)
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
