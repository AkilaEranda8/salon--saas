import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/axios';

const PRIMARY = '#1e3a8a';
const BLUE    = '#3b82f6';
const GOLD    = '#f59e0b';

// ── Star picker ───────────────────────────────────────────────────────────────
function StarPicker({ value, onChange, size = 36 }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          style={{
            fontSize: size,
            cursor: 'pointer',
            color: n <= (hover || value) ? GOLD : '#d1d5db',
            transition: 'color 0.1s, transform 0.1s',
            transform: n <= (hover || value) ? 'scale(1.15)' : 'scale(1)',
            display: 'inline-block',
          }}
        >
          ★
        </span>
      ))}
    </div>
  );
}

const labels = { 1: 'Poor 😞', 2: 'Fair 😐', 3: 'Good 🙂', 4: 'Very Good 😊', 5: 'Excellent 🤩' };

export default function ReviewFormPage() {
  const { token } = useParams();

  const [info,      setInfo]      = useState(null);   // { customer_name, service, staff }
  const [status,    setStatus]    = useState('loading'); // loading | ready | submitted | error | already
  const [message,   setMessage]   = useState('');

  const [svcRating,  setSvcRating]  = useState(0);
  const [staffRating, setStaffRating] = useState(0);
  const [comment,    setComment]    = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError,    setFormError]    = useState('');

  // ── Load form data ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) { setStatus('error'); setMessage('Invalid review link.'); return; }
    api.get(`/reviews/form/${token}`)
      .then((res) => {
        setInfo(res.data);
        setStatus('ready');
      })
      .catch((err) => {
        if (err.response?.status === 409) {
          setStatus('already');
        } else {
          setStatus('error');
          setMessage(err.response?.data?.message || 'Invalid or expired review link.');
        }
      });
  }, [token]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (svcRating === 0) { setFormError('Please rate the service.'); return; }
    setIsSubmitting(true);
    setFormError('');
    try {
      await api.post(`/reviews/submit/${token}`, {
        service_rating: svcRating,
        staff_rating:   staffRating || null,
        comment:        comment.trim() || null,
      });
      setStatus('submitted');
    } catch (err) {
      setFormError(err.response?.data?.message || 'Submission failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Layouts ───────────────────────────────────────────────────────────────
  const wrap = (children) => (
    <div style={{
      minHeight: '100vh', background: '#f4f7ff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px', fontFamily: "'DM Sans', 'Segoe UI', Arial, sans-serif",
    }}>
      <div style={{
        width: '100%', maxWidth: 520,
        background: '#ffffff', borderRadius: 20,
        boxShadow: '0 8px 40px rgba(0,0,0,0.10)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          background: `linear-gradient(135deg, ${PRIMARY} 0%, ${BLUE} 100%)`,
          padding: '28px 36px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>✂️</div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#fff', letterSpacing: 1 }}>Zane Salon</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: '#bfdbfe' }}>Customer Feedback</p>
        </div>
        <div style={{ padding: '32px 36px' }}>{children}</div>
      </div>
    </div>
  );

  if (status === 'loading') return wrap(
    <div style={{ textAlign: 'center', padding: '20px 0', color: '#64748b' }}>Loading your review form…</div>
  );

  if (status === 'error') return wrap(
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🔗</div>
      <h2 style={{ color: '#1e293b', margin: '0 0 8px' }}>Link Not Found</h2>
      <p style={{ color: '#64748b', margin: 0 }}>{message}</p>
    </div>
  );

  if (status === 'already') return wrap(
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
      <h2 style={{ color: '#1e293b', margin: '0 0 8px' }}>Already Submitted</h2>
      <p style={{ color: '#64748b', margin: 0 }}>You've already left a review for this visit. Thank you!</p>
    </div>
  );

  if (status === 'submitted') return wrap(
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
      <h2 style={{ color: '#1e293b', margin: '0 0 8px' }}>Thank You!</h2>
      <p style={{ color: '#64748b', margin: 0 }}>
        Your feedback means a lot to us. We look forward to seeing you again!
      </p>
      <div style={{ marginTop: 24, fontSize: 28 }}>💜</div>
    </div>
  );

  return wrap(
    <form onSubmit={handleSubmit}>
      <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: '#1e293b' }}>
        How was your experience?
      </h2>
      <p style={{ margin: '0 0 24px', fontSize: 14, color: '#64748b' }}>
        Hi <strong>{info?.customer_name}</strong>! We'd love your honest feedback.
      </p>

      {/* Service rating */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 10 }}>
          💇 Rate your {info?.service?.name || 'service'} experience *
        </label>
        <StarPicker value={svcRating} onChange={setSvcRating} />
        {svcRating > 0 && (
          <div style={{ marginTop: 8, fontSize: 13, color: GOLD, fontWeight: 600 }}>{labels[svcRating]}</div>
        )}
      </div>

      {/* Staff rating (optional) */}
      {info?.staff && (
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 10 }}>
            👤 Rate your stylist <em>{info.staff.name}</em> (optional)
          </label>
          <StarPicker value={staffRating} onChange={setStaffRating} size={30} />
          {staffRating > 0 && (
            <div style={{ marginTop: 8, fontSize: 13, color: GOLD, fontWeight: 600 }}>{labels[staffRating]}</div>
          )}
        </div>
      )}

      {/* Comment */}
      <div style={{ marginBottom: 28 }}>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
          ✍️ Comments (optional)
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          maxLength={500}
          placeholder="Tell us about your experience…"
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 10,
            border: '1.5px solid #e2e8f0', fontSize: 14, fontFamily: 'inherit',
            resize: 'vertical', outline: 'none', boxSizing: 'border-box',
            color: '#1e293b', background: '#f8faff',
          }}
        />
        <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'right', marginTop: 4 }}>
          {comment.length}/500
        </div>
      </div>

      {/* Error message */}
      {formError && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fee2e2', borderRadius: 8, fontSize: 14, color: '#991b1b' }}>
          {formError}
        </div>
      )}      <button
        type="submit"
        disabled={isSubmitting}
        style={{
          width: '100%', padding: '13px', borderRadius: 10, border: 'none',
          background: `linear-gradient(135deg, ${PRIMARY}, ${BLUE})`,
          color: '#fff', fontSize: 16, fontWeight: 700, cursor: isSubmitting ? 'not-allowed' : 'pointer',
          opacity: isSubmitting ? 0.7 : 1, fontFamily: 'inherit',
          transition: 'opacity 0.2s',
        }}
      >
        {isSubmitting ? 'Submitting…' : '✨ Submit Review'}
      </button>

      <p style={{ margin: '16px 0 0', fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
        This link is unique to your visit and can only be used once.
      </p>
    </form>
  );
}
