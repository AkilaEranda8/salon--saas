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
      // Per-service eligible staff: { [serviceId]: Staff[] }
      staffByService: {},
      category: '',
      multiBooking: false,
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
      // Phone gate: known clients skip OTP; new numbers must verify
      phoneCheck: {
        status: 'idle', // idle | checking | known | needs_otp | otp_sent | verified | error
        message: '',
        otp: '',
        busy: false,
        busyAction: '', // send | verify | check
        checkedPhone: '',
        otpSentFor: '',
        otpRequestInFlight: false,
        lookupSeq: 0,
      },
      phoneTimer: null,
      submitting: false,
      result: null,
    };

    function digitsOnly(phone) {
      return String(phone || '').replace(/\D/g, '');
    }

    /** Wait until number looks complete so OTP is not sent mid-typing (e.g. at 9 digits then again at 10). */
    function phoneDigitsComplete(digits) {
      if (!digits || digits.length < 9) return false;
      if (digits.charAt(0) === '0') return digits.length >= 10;
      if (digits.indexOf('94') === 0) return digits.length >= 11;
      return digits.length >= 10;
    }

    function resetPhoneCheck(keepMessage) {
      state.phoneCheck = {
        status: 'idle',
        message: keepMessage || '',
        otp: '',
        busy: false,
        busyAction: '',
        checkedPhone: '',
        otpSentFor: '',
        otpRequestInFlight: false,
        lookupSeq: state.phoneCheck.lookupSeq || 0,
      };
    }

    function phoneLookupSettled(digits) {
      if (!digits) return false;
      // Any in-flight request must block duplicate OTP / lookup
      if (state.phoneCheck.busy || state.phoneCheck.otpRequestInFlight) return true;
      if (state.phoneCheck.otpSentFor === digits) return true;
      if (digits !== state.phoneCheck.checkedPhone) return false;
      var st = state.phoneCheck.status;
      return phoneReady() || st === 'otp_sent' || st === 'checking' || st === 'needs_otp';
    }

    function phoneReady() {
      var st = state.phoneCheck.status;
      return st === 'known' || st === 'verified';
    }

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
        return (
          phoneReady() &&
          state.form.customer_name.trim() &&
          phoneDigitsComplete(digitsOnly(state.form.phone)) &&
          !state.phoneCheck.busy
        );
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
        return Number(s.id);
      });

      bodyEl.innerHTML =
        '<div class="hsb-section-title">Select services</div>' +
        '<p class="hsb-section-copy">' +
        (state.multiBooking
          ? 'Choose one or more treatments for this visit.'
          : 'Choose a treatment for this visit.') +
        '</p>' +
        '<label class="hsb-multi-toggle">' +
        '<input type="checkbox" id="hsb-multi-booking"' +
        (state.multiBooking ? ' checked' : '') +
        ' />' +
        '<span>Book multiple services</span>' +
        '</label>' +
        filters +
        '<div class="hsb-grid">' +
        list
          .map(function (s) {
            var sel = selectedIds.indexOf(Number(s.id)) >= 0 ? ' is-selected' : '';
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

    function staffForService(serviceId) {
      var key = String(serviceId);
      var sid = Number(serviceId);
      // Prefer per-service API result (already filtered to assigned staff only).
      if (Array.isArray(state.staffByService[key])) {
        return state.staffByService[key];
      }
      // Fallback: client-side filter (strict — only linked services)
      return state.staff.filter(function (st) {
        var ids = Array.isArray(st.service_ids) ? st.service_ids.map(Number) : [];
        return ids.indexOf(sid) >= 0;
      });
    }

    function renderStaffTime() {
      if (!state.form.services.length) {
        bodyEl.innerHTML = emptyState('No services selected', 'Go back and choose at least one service.');
        return;
      }

      var cards = state.form.services
        .map(function (svc) {
          var a = getAssignment(svc.id);
          var eligibleStaff = staffForService(svc.id);
          var staffHtml = eligibleStaff.length
            ? eligibleStaff
                .map(function (st) {
                  var sel = a.staff && Number(a.staff.id) === Number(st.id) ? ' is-selected' : '';
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
            : emptyState(
              'No staff for this service',
              'Assign this service to staff in the salon admin (Staff → Assignable services).'
            );

          // Drop selected staff if they are no longer eligible for this service
          if (a.staff && !eligibleStaff.some(function (st) { return Number(st.id) === Number(a.staff.id); })) {
            a.staff = null;
            a.time = '';
            a.slots = [];
          }

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
        '<p class="hsb-section-copy">' +
        (state.form.services.length > 1
          ? 'Each service can use a different stylist and time.'
          : 'Pick a stylist and time for your service.') +
        '</p>' +
        '<div class="hsb-assign-list">' +
        cards +
        '</div>';
    }

    function phoneStatusHtml() {
      var pc = state.phoneCheck;
      if (pc.status === 'checking') {
        return '<p class="hsb-phone-status is-muted">Checking number…</p>';
      }
      if (pc.status === 'known') {
        return (
          '<p class="hsb-phone-status is-ok">' +
          esc(pc.message || 'Welcome back — your details were filled in. No OTP needed.') +
          '</p>'
        );
      }
      if (pc.status === 'verified') {
        return (
          '<p class="hsb-phone-status is-ok">' +
          esc(pc.message || 'Phone verified. You can complete your booking.') +
          '</p>'
        );
      }
      if (pc.status === 'error' && pc.message) {
        return '<p class="hsb-phone-status is-err">' + esc(pc.message) + '</p>';
      }
      if (pc.status === 'needs_otp' || pc.status === 'otp_sent') {
        return (
          '<p class="hsb-phone-status is-muted">' +
          esc(pc.message || 'New number — verify with the OTP sent to your phone.') +
          '</p>'
        );
      }
      return '';
    }

    function otpBlockHtml() {
      var pc = state.phoneCheck;
      if (pc.status !== 'needs_otp' && pc.status !== 'otp_sent') return '';
      var sendLabel = pc.status === 'otp_sent' ? 'Resend OTP' : 'Send OTP';
      if (pc.busy && pc.busyAction === 'send') sendLabel = 'Sending…';
      var verifyLabel = pc.busy && pc.busyAction === 'verify' ? 'Verifying…' : 'Verify';
      return (
        '<div class="hsb-otp-box">' +
        '<div class="hsb-otp-row">' +
        '<div class="hsb-field hsb-otp-code"><label for="hsb-otp">OTP code</label>' +
        '<input id="hsb-otp" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code" value="' +
        esc(pc.otp) +
        '" /></div>' +
        '<div class="hsb-otp-actions">' +
        '<button type="button" class="hsb-btn hsb-btn-ghost" data-hsb="send-otp"' +
        (pc.busy ? ' disabled' : '') +
        '>' +
        sendLabel +
        '</button>' +
        '<button type="button" class="hsb-btn hsb-btn-primary" data-hsb="verify-otp"' +
        (pc.busy || !String(pc.otp || '').trim() ? ' disabled' : '') +
        '>' +
        verifyLabel +
        '</button>' +
        '</div></div></div>'
      );
    }

    function renderDetails(opts) {
      opts = opts || {};
      var activeId = document.activeElement && document.activeElement.id;
      var keepFocusId = opts.keepFocusId || (activeId === 'hsb-phone' || activeId === 'hsb-otp' ? activeId : '');
      var selStart =
        keepFocusId && document.activeElement && typeof document.activeElement.selectionStart === 'number'
          ? document.activeElement.selectionStart
          : null;

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
      var showRest = phoneReady();
      bodyEl.innerHTML =
        '<div class="hsb-section-title">Your details</div>' +
        '<p class="hsb-section-copy">Enter your phone first. Returning clients are recognised automatically; new numbers need a one-time code.</p>' +
        '<dl class="hsb-summary">' +
        '<div><dt>Branch</dt><dd>' +
        esc(state.form.branch && state.form.branch.name) +
        '</dd></div>' +
        summary +
        '</dl>' +
        '<div class="hsb-row" style="margin-top:1rem">' +
        '<div class="hsb-field"><label for="hsb-phone">Phone *</label>' +
        '<input id="hsb-phone" type="tel" autocomplete="tel" value="' +
        esc(state.form.phone) +
        '" /></div>' +
        phoneStatusHtml() +
        otpBlockHtml() +
        (showRest
          ? '<div class="hsb-field"><label for="hsb-name">Your name *</label>' +
            '<input id="hsb-name" type="text" autocomplete="name" value="' +
            esc(state.form.customer_name) +
            '" /></div>' +
            '<div class="hsb-field"><label for="hsb-email">Email</label>' +
            '<input id="hsb-email" type="email" autocomplete="email" value="' +
            esc(state.form.email) +
            '" /></div>' +
            '<div class="hsb-field"><label for="hsb-notes">Notes</label>' +
            '<textarea id="hsb-notes" rows="3" placeholder="Anything we should know before your visit?">' +
            esc(state.form.notes) +
            '</textarea></div>'
          : '') +
        '</div>';

      if (keepFocusId) {
        var focusEl = document.getElementById(keepFocusId);
        if (focusEl) {
          focusEl.focus();
          if (selStart != null && typeof focusEl.setSelectionRange === 'function') {
            try {
              focusEl.setSelectionRange(selStart, selStart);
            } catch (e) { /* ignore */ }
          }
        }
      }
    }

    function checkPhoneLookup() {
      var phone = state.form.phone.trim();
      var digits = digitsOnly(phone);
      if (!phoneDigitsComplete(digits)) {
        if (digits.length > 0 && state.phoneCheck.status !== 'idle') {
          resetPhoneCheck();
          renderDetails();
          renderFooter();
        }
        return;
      }

      // Already handled / in-flight for this exact number — never re-send OTP
      if (phoneLookupSettled(digits)) {
        return;
      }

      var seq = ++state.phoneCheck.lookupSeq;
      state.phoneCheck.status = 'checking';
      state.phoneCheck.message = '';
      state.phoneCheck.busy = true;
      state.phoneCheck.busyAction = 'check';
      renderDetails({ keepFocusId: 'hsb-phone' });
      renderFooter();

      api('check_phone', { phone: phone }, { method: 'POST' })
        .then(function (data) {
          if (seq !== state.phoneCheck.lookupSeq) return; // stale response
          if (digitsOnly(state.form.phone) !== digits) return;

          state.phoneCheck.busy = false;
          state.phoneCheck.busyAction = '';
          state.phoneCheck.checkedPhone = digits;
          if (data && data.exists && !data.needs_otp) {
            state.phoneCheck.status = 'known';
            state.phoneCheck.message = 'Welcome back' + (data.name ? ', ' + data.name : '') + '. No OTP needed.';
            if (data.name) state.form.customer_name = data.name;
            if (data.email) state.form.email = data.email;
            renderDetails();
            renderFooter();
            return;
          }

          // New number: send OTP once only
          if (state.phoneCheck.otpSentFor === digits || state.phoneCheck.otpRequestInFlight) {
            state.phoneCheck.status = 'otp_sent';
            state.phoneCheck.message = 'OTP already sent. Enter the code, or tap Resend.';
            renderDetails();
            renderFooter();
            return;
          }

          state.phoneCheck.status = 'needs_otp';
          state.phoneCheck.message = 'New number — sending OTP…';
          renderDetails();
          renderFooter();
          sendBookingOtp(false);
        })
        .catch(function (err) {
          if (seq !== state.phoneCheck.lookupSeq) return;
          state.phoneCheck.busy = false;
          state.phoneCheck.busyAction = '';
          state.phoneCheck.status = 'error';
          state.phoneCheck.message = err.message || 'Could not check phone number.';
          renderDetails();
          renderFooter();
        });
    }

    function schedulePhoneLookup() {
      if (state.phoneTimer) clearTimeout(state.phoneTimer);
      state.phoneTimer = setTimeout(checkPhoneLookup, 900);
    }

    function sendBookingOtp(forceResend) {
      var phone = state.form.phone.trim();
      var digits = digitsOnly(phone);
      if (!phoneDigitsComplete(digits)) {
        showError('Enter a complete phone number first.');
        return;
      }
      if (state.phoneCheck.busy || state.phoneCheck.otpRequestInFlight) {
        return;
      }
      if (!forceResend && state.phoneCheck.otpSentFor === digits) {
        state.phoneCheck.status = 'otp_sent';
        state.phoneCheck.message = 'OTP already sent. Enter the code, or tap Resend.';
        renderDetails();
        renderFooter();
        return;
      }

      state.phoneCheck.otpRequestInFlight = true;
      state.phoneCheck.busy = true;
      state.phoneCheck.busyAction = 'send';
      renderDetails();
      renderFooter();
      api('request_otp', { phone: phone }, { method: 'POST' })
        .then(function (data) {
          state.phoneCheck.otpRequestInFlight = false;
          state.phoneCheck.busy = false;
          state.phoneCheck.busyAction = '';
          if (data && data.exists && !data.needs_otp) {
            state.phoneCheck.status = 'known';
            state.phoneCheck.checkedPhone = digits;
            state.phoneCheck.message = data.message || 'This number is already registered. No OTP needed.';
            if (data.name) state.form.customer_name = data.name;
            if (data.email) state.form.email = data.email;
          } else {
            state.phoneCheck.status = 'otp_sent';
            state.phoneCheck.checkedPhone = digits;
            state.phoneCheck.otpSentFor = digits;
            if (data && data.cooldown) {
              state.phoneCheck.message = data.message || 'OTP already sent. Please wait before requesting again.';
            } else {
              state.phoneCheck.message = data && data.message ? data.message : 'OTP sent. Enter the code below.';
            }
            if (data && data.debug_otp) {
              state.phoneCheck.message += ' (dev: ' + data.debug_otp + ')';
            }
          }
          renderDetails();
          renderFooter();
        })
        .catch(function (err) {
          state.phoneCheck.otpRequestInFlight = false;
          state.phoneCheck.busy = false;
          state.phoneCheck.busyAction = '';
          state.phoneCheck.status = 'error';
          state.phoneCheck.message = err.message || 'Failed to send OTP.';
          renderDetails();
          renderFooter();
          showError(err.message || 'Failed to send OTP.');
        });
    }

    function verifyBookingOtp() {
      var phone = state.form.phone.trim();
      var otp = String(state.phoneCheck.otp || '').trim();
      if (!otp) {
        showError('Enter the OTP code.');
        return;
      }
      if (state.phoneCheck.busy) return;
      state.phoneCheck.busy = true;
      state.phoneCheck.busyAction = 'verify';
      renderDetails();
      renderFooter();
      api('verify_otp', { phone: phone, otp: otp }, { method: 'POST' })
        .then(function (data) {
          state.phoneCheck.busy = false;
          state.phoneCheck.busyAction = '';
          state.phoneCheck.status = 'verified';
          state.phoneCheck.checkedPhone = digitsOnly(phone);
          state.phoneCheck.message = (data && data.message) || 'Phone verified successfully.';
          renderDetails();
          renderFooter();
        })
        .catch(function (err) {
          state.phoneCheck.busy = false;
          state.phoneCheck.busyAction = '';
          showError(err.message || 'Invalid OTP.');
          renderDetails({ keepFocusId: 'hsb-otp' });
          renderFooter();
        });
    }

    function renderDone() {
      var lines = state.form.services
        .map(function (s) {
          var a = getAssignment(s.id);
          return (
            esc(s.name) +
            ' — ' +
            esc(a.staff && a.staff.name) +
            ', ' +
            esc(a.date) +
            ' ' +
            esc(a.time)
          );
        })
        .join('<br />');
      bodyEl.innerHTML =
        '<div class="hsb-success"><div class="hsb-success-icon" aria-hidden="true">✓</div><h3>Booking requested</h3>' +
        '<p>We received your request. The salon will confirm shortly.</p>' +
        (lines ? '<p><strong>' + lines + '</strong></p>' : '') +
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
      state.staffByService = {};
      var branchId = state.form.branch.id;
      var services = state.form.services.slice();
      if (!services.length) {
        return api('staff', { branch_id: branchId }).then(function (data) {
          state.staff = Array.isArray(data) ? data : [];
        });
      }
      return Promise.all(
        services.map(function (svc) {
          return api('staff', { branch_id: branchId, service_id: svc.id }).then(function (data) {
            var list = Array.isArray(data) ? data : [];
            state.staffByService[String(svc.id)] = list;
            return list;
          });
        })
      ).then(function (lists) {
        var byId = {};
        lists.forEach(function (list) {
          list.forEach(function (st) {
            byId[String(st.id)] = st;
          });
        });
        state.staff = Object.keys(byId).map(function (k) {
          return byId[k];
        });
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
        duration: Math.max(5, Number(svc.duration_minutes) || 30),
        branch_id: state.form.branch && state.form.branch.id,
      }).then(function (data) {
        a.slots = Array.isArray(data) ? data : [];
        if (a.time && a.slots.indexOf(a.time) < 0) {
          a.time = '';
        }
      });
    }

    function submitBooking() {
      if (state.submitting) return;
      if (!phoneReady()) {
        showError('Please verify your phone number first.');
        return;
      }
      var items = [];
      for (var i = 0; i < state.form.services.length; i += 1) {
        var s = state.form.services[i];
        var a = getAssignment(s.id);
        if (!a.staff || !a.date || !a.time) {
          showError('Please complete staff and time for each service.');
          return;
        }
        items.push({
          service_id: s.id,
          staff_id: a.staff.id,
          date: a.date,
          time: a.time,
        });
      }
      if (!items.length) {
        showError('Please select a service.');
        return;
      }
      state.submitting = true;
      renderFooter();
      var payload = {
        branch_id: state.form.branch.id,
        customer_name: state.form.customer_name.trim(),
        phone: state.form.phone.trim(),
        email: state.form.email.trim(),
        notes: state.form.notes.trim(),
        items: items,
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
        state.staffByService = {};
        render();
        return;
      }

      if (act === 'toggle-service') {
        var sid = Number(btn.getAttribute('data-id'));
        var svc = state.services.find(function (s) {
          return Number(s.id) === sid;
        });
        if (!svc) return;
        var idx = state.form.services.findIndex(function (s) {
          return Number(s.id) === sid;
        });
        if (state.multiBooking) {
          if (idx >= 0) state.form.services.splice(idx, 1);
          else state.form.services.push(svc);
        } else {
          // Single booking: selecting another service replaces the current one
          if (idx >= 0) state.form.services = [];
          else state.form.services = [svc];
        }
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
        var eligible = staffForService(serviceId);
        assignment.staff = eligible.find(function (s) {
          return Number(s.id) === stid;
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

      if (act === 'send-otp') {
        sendBookingOtp(true);
        return;
      }

      if (act === 'verify-otp') {
        verifyBookingOtp();
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
          resetPhoneCheck();
          setStep(3);
          return;
        }
        if (state.step === 3) {
          if (!phoneReady()) {
            showError('Please verify your phone number first.');
            return;
          }
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
        state.multiBooking = false;
        resetPhoneCheck();
        state.result = null;
        setStep(1);
      }
    });

    root.addEventListener('error', function (e) {
      if (e.target && e.target.matches('.hsb-staff-avatar img')) {
        e.target.remove();
      }
    }, true);

    root.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || t.id !== 'hsb-multi-booking') return;
      state.multiBooking = !!t.checked;
      if (!state.multiBooking && state.form.services.length > 1) {
        state.form.services = [state.form.services[0]];
        syncAssignments();
      }
      render();
    });

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
      if (t.id === 'hsb-email') state.form.email = t.value;
      if (t.id === 'hsb-notes') state.form.notes = t.value;
      if (t.id === 'hsb-otp') {
        state.phoneCheck.otp = t.value;
        renderFooter();
        var actions = root.querySelector('.hsb-otp-actions');
        if (actions) {
          var verifyBtn = actions.querySelector('[data-hsb="verify-otp"]');
          if (verifyBtn) {
            verifyBtn.disabled = state.phoneCheck.busy || !String(state.phoneCheck.otp || '').trim();
          }
        }
        return;
      }
      if (t.id === 'hsb-phone') {
        var nextPhone = t.value;
        var prevDigits = digitsOnly(state.form.phone);
        var nextDigits = digitsOnly(nextPhone);
        state.form.phone = nextPhone;
        if (nextDigits !== prevDigits) {
          // Invalidate prior OTP / lookup only when the number actually changed
          if (
            nextDigits !== state.phoneCheck.checkedPhone ||
            nextDigits !== state.phoneCheck.otpSentFor
          ) {
            state.phoneCheck.lookupSeq += 1;
            if (
              phoneReady() ||
              state.phoneCheck.status === 'otp_sent' ||
              state.phoneCheck.status === 'needs_otp' ||
              state.phoneCheck.status === 'checking' ||
              state.phoneCheck.otpSentFor
            ) {
              resetPhoneCheck();
              var nameEl = document.getElementById('hsb-name');
              var emailEl = document.getElementById('hsb-email');
              var notesEl = document.getElementById('hsb-notes');
              if (nameEl) state.form.customer_name = nameEl.value;
              if (emailEl) state.form.email = emailEl.value;
              if (notesEl) state.form.notes = notesEl.value;
              renderDetails({ keepFocusId: 'hsb-phone' });
            }
          }
          schedulePhoneLookup();
        }
        renderFooter();
        return;
      }
      if (state.step === 3) renderFooter();
    });

    root.addEventListener('blur', function (e) {
      if (e.target && e.target.id === 'hsb-phone' && state.step === 3) {
        var digits = digitsOnly(state.form.phone);
        if (phoneLookupSettled(digits)) return;
        if (state.phoneTimer) clearTimeout(state.phoneTimer);
        checkPhoneLookup();
      }
    }, true);

    loadBranches();
  });
})();
