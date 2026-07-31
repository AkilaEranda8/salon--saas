import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import './DocumentationPage.css';

const API_BASE = 'https://api.salon.hexalyte.com/api/public';
const PLUGIN_VERSION = '1.0.15';

const ENDPOINTS = [
  {
    method: 'GET',
    path: '/branches?tenantId={tenantId}',
    title: 'List active branches',
    description: 'Returns the branches customers can select during booking.',
    response: `[
  {
    "id": 12,
    "name": "Colombo Branch",
    "address": "123 Main Street",
    "phone": "0112345678",
    "color": "#2563EB"
  }
]`,
  },
  {
    method: 'GET',
    path: '/services?tenantId={tenantId}',
    title: 'List active services',
    description: 'Returns the service category, duration, and public description. Prices are not exposed by the public API.',
    response: `[
  {
    "id": 8,
    "name": "Hair Cut",
    "category": "Hair",
    "duration_minutes": 30,
    "description": "Professional cut and finish"
  }
]`,
  },
  {
    method: 'GET',
    path: '/staff?branchId={branchId}&tenantId={tenantId}',
    title: 'List available staff',
    description: 'Returns active staff assigned to a selected branch. When a staff member has a profile photo, photo_url is an absolute URL you can render directly; otherwise it is null.',
    response: `[
  {
    "id": 5,
    "name": "Nimali Perera",
    "role_title": "Senior Stylist",
    "photo_url": "https://api.salon.hexalyte.com/uploads/staff/28/staff-5-1785439863979.jpg"
  }
]`,
  },
  {
    method: 'GET',
    path: '/availability?staffId={staffId}&date=2026-08-01&duration=30&branchId={branchId}',
    title: 'Get available time slots',
    description: 'Returns conflict-free HH:MM slots for the selected staff member, date, and total service duration.',
    response: `["09:00", "09:30", "10:30", "11:00"]`,
  },
  {
    method: 'POST',
    path: '/bookings',
    title: 'Create a booking',
    description: 'Creates one pending appointment per item. Prefer items[] so each service can use its own staff member and time. The legacy single staff_id/date/time + service_ids payload still works and schedules services back-to-back on one staff member.',
    request: `{
  "tenantId": 28,
  "branch_id": 12,
  "customer_name": "Kasun Perera",
  "phone": "0771234567",
  "email": "kasun@example.com",
  "notes": "First visit",
  "items": [
    {
      "service_id": 8,
      "staff_id": 5,
      "date": "2026-08-01",
      "time": "10:30"
    },
    {
      "service_id": 11,
      "staff_id": 9,
      "date": "2026-08-01",
      "time": "14:00"
    }
  ]
}`,
    response: `{
  "message": "Booking created successfully",
  "ids": [1042, 1043],
  "count": 2
}`,
  },
];

const STATUS_CODES = [
  ['200', 'Request completed successfully.'],
  ['201', 'Booking created successfully.'],
  ['400', 'Missing fields, invalid values, or services exceed working hours.'],
  ['404', 'A selected service or resource was not found.'],
  ['409', 'The selected time has already been booked. Refresh availability and retry.'],
  ['500', 'Unexpected server error.'],
];

function useCopy() {
  const [copied, setCopied] = useState(false);

  const copy = async (text) => {
    const value = String(text ?? '');
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        // Clipboard API needs a secure context; fall back for plain-HTTP hosts.
        const helper = document.createElement('textarea');
        helper.value = value;
        helper.setAttribute('readonly', '');
        helper.style.position = 'fixed';
        helper.style.opacity = '0';
        document.body.appendChild(helper);
        helper.select();
        document.execCommand('copy');
        helper.remove();
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return { copied, copy };
}

function CodeBlock({ children }) {
  const { copied, copy } = useCopy();

  return (
    <div className="docs-code-wrap">
      <button type="button" className="docs-copy" onClick={() => copy(children)}>
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre><code>{children}</code></pre>
    </div>
  );
}

function CopyValue({ label, value, hint }) {
  const { copied, copy } = useCopy();

  return (
    <div className="docs-copy-value">
      <small>{label}</small>
      <div className="docs-copy-value-row">
        <code>{value}</code>
        <button
          type="button"
          onClick={() => copy(value)}
          aria-label={`Copy ${label}`}
          title={`Copy ${label}`}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {hint && <span className="docs-copy-value-hint">{hint}</span>}
    </div>
  );
}

function EndpointCard({ endpoint, tenantId }) {
  const path = endpoint.path.replaceAll('{tenantId}', tenantId || '{tenantId}');

  return (
    <article className="docs-endpoint">
      <div className="docs-endpoint-heading">
        <span className={`docs-method docs-method-${endpoint.method.toLowerCase()}`}>{endpoint.method}</span>
        <code>{path}</code>
      </div>
      <h3>{endpoint.title}</h3>
      <p>{endpoint.description}</p>
      {endpoint.request && (
        <>
          <h4>JSON request body</h4>
          <CodeBlock>{endpoint.request}</CodeBlock>
        </>
      )}
      <h4>Example response</h4>
      <CodeBlock>{endpoint.response}</CodeBlock>
    </article>
  );
}

export default function DocumentationPage() {
  const [state, setState] = useState({ loading: true, enabled: false, branding: null, failed: false });
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  useEffect(() => {
    let active = true;
    api.get('/branding/public')
      .then((response) => {
        if (!active) return;
        const branding = response.data?.data || {};
        setState({
          loading: false,
          enabled: branding.docs_page_enabled === true,
          branding,
          failed: false,
        });
      })
      .catch(() => {
        if (active) setState({ loading: false, enabled: false, branding: null, failed: true });
      });
    return () => { active = false; };
  }, []);

  const tenantId = String(state.branding?.id || '');
  const brandName = state.branding?.brand_name || state.branding?.name || 'Salon';
  const primary = state.branding?.primary_color || '#2563EB';
  const quickStart = useMemo(() => (
    `curl "${API_BASE}/branches?tenantId=${tenantId || '{tenantId}'}"`
  ), [tenantId]);

  const downloadPlugin = async () => {
    setDownloading(true);
    setDownloadError('');
    try {
      const response = await api.get('/branding/plugin-download', {
        responseType: 'blob',
        params: { t: Date.now() },
        headers: { 'Cache-Control': 'no-cache' },
      });
      const version = response.headers?.['x-plugin-version'] || PLUGIN_VERSION;
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `hexaone-salon-booking-${version}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadError('Plugin download failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  if (state.loading) {
    return <main className="docs-state"><div className="docs-spinner" /><p>Loading documentation…</p></main>;
  }

  if (!state.enabled) {
    return (
      <main className="docs-state">
        <div className="docs-state-icon">404</div>
        <h1>Documentation unavailable</h1>
        <p>
          {state.failed
            ? 'The documentation settings could not be loaded.'
            : 'This salon has not enabled its public developer documentation.'}
        </p>
        <Link to="/login">Return to sign in</Link>
      </main>
    );
  }

  return (
    <div className="docs-page" style={{ '--docs-primary': primary }}>
      <header className="docs-hero">
        <nav className="docs-nav">
          <div className="docs-brand">{brandName}</div>
          <div className="docs-nav-links">
            <a href="#api">API</a>
            <a href="#wordpress">WordPress</a>
            <a href="#troubleshooting">Help</a>
            <Link to="/booking">Book online</Link>
          </div>
        </nav>
        <div className="docs-hero-content">
          <span className="docs-eyebrow">DEVELOPER DOCUMENTATION</span>
          <h1>Booking API &amp; WordPress Plugin</h1>
          <p>
            Connect a website to {brandName}'s live services, staff availability, and appointment booking system.
          </p>
          <div className="docs-hero-pills">
            <span>REST + JSON</span>
            <span>No API key required</span>
            <span>Plugin v{PLUGIN_VERSION}</span>
          </div>
        </div>
      </header>

      <div className="docs-layout">
        <aside className="docs-sidebar" aria-label="Documentation navigation">
          <a href="#overview">Overview</a>
          <a href="#quick-start">Quick start</a>
          <a href="#api">API reference</a>
          <a href="#booking-rules">Booking rules</a>
          <a href="#errors">Status codes</a>
          <a href="#wordpress">WordPress plugin</a>
          <a href="#shortcodes">Shortcodes</a>
          <a href="#proxy">Proxy &amp; CORS</a>
          <a href="#troubleshooting">Troubleshooting</a>
        </aside>

        <main className="docs-content">
          <section id="overview">
            <span className="docs-kicker">Overview</span>
            <h2>Public booking integration</h2>
            <p>
              The public API lets a website read active branches, services, staff, and available times before
              creating a pending appointment. Responses use JSON over HTTPS. Public booking calls do not require
              a user login or bearer token.
            </p>
            <div className="docs-credentials">
              <CopyValue
                label="Tenant ID"
                value={tenantId}
                hint={`Identifies ${brandName} on every public request.`}
              />
              <CopyValue
                label="Base URL"
                value={API_BASE}
                hint="Prefix for all public booking endpoints."
              />
            </div>
            <div className="docs-info-grid">
              <div><small>Content type</small><code>application/json</code></div>
              <div><small>Rate limit</small><code>200 requests / minute / IP</code></div>
            </div>
            <div className="docs-note">
              Copy the tenant ID above and send it on branch, service, and staff requests so records are limited to this salon.
            </div>
          </section>

          <section id="quick-start">
            <span className="docs-kicker">Quick start</span>
            <h2>Test your first request</h2>
            <p>Run this command to retrieve the active booking branches for {brandName}.</p>
            <CodeBlock>{quickStart}</CodeBlock>
            <h3>Recommended booking sequence</h3>
            <ol className="docs-flow">
              <li><strong>Branches</strong><span>Choose the booking location.</span></li>
              <li><strong>Services</strong><span>Choose one or more services and total their duration.</span></li>
              <li><strong>Staff</strong><span>Load staff assigned to the selected branch.</span></li>
              <li><strong>Availability</strong><span>Request slots using staff, date, branch, and total duration.</span></li>
              <li><strong>Booking</strong><span>POST the selected IDs and customer details.</span></li>
            </ol>
          </section>

          <section id="api">
            <span className="docs-kicker">API reference</span>
            <h2>Booking endpoints</h2>
            <p>Replace values inside braces with IDs returned by the preceding request.</p>
            <div className="docs-endpoints">
              {ENDPOINTS.map((endpoint) => (
                <EndpointCard key={`${endpoint.method}-${endpoint.path}`} endpoint={endpoint} tenantId={tenantId} />
              ))}
            </div>
          </section>

          <section id="booking-rules">
            <span className="docs-kicker">Behaviour</span>
            <h2>Availability and booking rules</h2>
            <ul className="docs-list">
              <li>Availability starts at 09:00. A booking must finish no later than 18:30.</li>
              <li>The minimum availability duration is 30 minutes; duration also determines the slot interval.</li>
              <li>Pending, confirmed, and in-service appointments block overlapping slots.</li>
              <li>Use <code>items[]</code> to book multiple services with different staff and times in one request.</li>
              <li>Legacy payloads may still send <code>service_ids</code> with one <code>staff_id</code>/<code>date</code>/<code>time</code>; those services are scheduled consecutively.</li>
              <li>Name, phone, and at least one fully assigned service item are required.</li>
              <li>The server checks availability again inside a transaction to reduce double booking.</li>
              <li>When configured, the salon sends the customer an SMS after the booking is created.</li>
            </ul>
          </section>

          <section id="errors">
            <span className="docs-kicker">Responses</span>
            <h2>HTTP status codes</h2>
            <div className="docs-status-list">
              {STATUS_CODES.map(([code, text]) => (
                <div key={code}><code>{code}</code><span>{text}</span></div>
              ))}
            </div>
            <p>Error responses use a message field:</p>
            <CodeBlock>{`{ "message": "Selected time is no longer available. Please choose another slot." }`}</CodeBlock>
          </section>

          <section id="wordpress">
            <span className="docs-kicker">WordPress</span>
            <h2>Hexaone Salon Booking plugin</h2>
            <p>
              The plugin adds a responsive five-step booking form to any WordPress page. It loads live data
              through a WordPress server-side proxy, so visitors never call the salon API directly.
            </p>
            <div className="docs-download-row">
              <button type="button" onClick={downloadPlugin} disabled={downloading}>
                <span aria-hidden="true">↓</span>
                {downloading ? 'Preparing download…' : 'Download WordPress plugin'}
              </button>
              <small>ZIP package · v{PLUGIN_VERSION}</small>
            </div>
            {downloadError && <p className="docs-download-error" role="alert">{downloadError}</p>}
            <div className="docs-info-grid">
              <div><small>Plugin version</small><code>{PLUGIN_VERSION}</code></div>
              <div><small>WordPress</small><code>5.8 or newer</code></div>
              <div><small>PHP</small><code>7.4 or newer</code></div>
              <div><small>Package</small><code>hexaone-salon-booking-{PLUGIN_VERSION}.zip</code></div>
            </div>

            <h3>Installation</h3>
            <ol className="docs-numbered">
              <li>If an older Hexaone Salon Booking entry is listed, click <strong>Delete</strong>.</li>
              <li>Download the ZIP from this page (do not extract it on your computer).</li>
              <li>Open WordPress Admin → <strong>Plugins → Add New → Upload Plugin</strong>.</li>
              <li>Select <code>hexaone-salon-booking-{PLUGIN_VERSION}.zip</code>, install it, and click <strong>Activate</strong>.</li>
              <li>Open <strong>Settings → Salon Booking</strong>.</li>
              <li>Set the API base URL to <code>{API_BASE}</code>.</li>
              <li>Set Tenant ID to <code>{tenantId}</code>, then save the settings.</li>
              <li>Add <code>[salon_booking]</code> to a page and publish it.</li>
            </ol>
            <div className="docs-note">
              File Manager / FTP is not required. Upload the ZIP only through WordPress Admin.
              Version {PLUGIN_VERSION} installs into a fresh folder (<code>hexaone-booking</code>) so leftover broken folders do not block activation.
            </div>

            <h3>Values for Settings → Salon Booking</h3>
            <div className="docs-credentials">
              <CopyValue label="Public API base URL" value={API_BASE} />
              <CopyValue label="Tenant ID" value={tenantId} />
            </div>

            <h3>Plugin settings</h3>
            <div className="docs-table-wrap">
              <table>
                <thead><tr><th>Setting</th><th>Purpose</th><th>Example</th></tr></thead>
                <tbody>
                  <tr><td>Public API base URL</td><td>Salon public API endpoint</td><td><code>{API_BASE}</code></td></tr>
                  <tr><td>Tenant ID</td><td>Limits displayed records to this salon</td><td><code>{tenantId}</code></td></tr>
                  <tr><td>Widget title</td><td>Heading above the booking wizard</td><td>Book an Appointment</td></tr>
                  <tr><td>Accent color</td><td>Buttons, selected states, and highlights</td><td><code>#2563EB</code></td></tr>
                </tbody>
              </table>
            </div>

            <h3>Customer booking flow</h3>
            <div className="docs-plugin-flow">
              <span>Branch</span><i>→</i><span>Services</span><i>→</i><span>Staff &amp; time</span><i>→</i><span>Details</span><i>→</i><span>Done</span>
            </div>
            <p>
              The service step supports multiple selections and category filters. On the staff step, each
              selected service gets its own stylist, date, and time — so customers can book with different
              staff in one visit. Name and phone are required; email and notes are optional.
            </p>
          </section>

          <section id="shortcodes">
            <span className="docs-kicker">WordPress</span>
            <h2>Shortcodes and customization</h2>
            <p>Default shortcode:</p>
            <CodeBlock>{'[salon_booking]'}</CodeBlock>
            <p>Custom title and color:</p>
            <CodeBlock>{'[salon_booking title="Book now" accent="#7C3AED"]'}</CodeBlock>
            <p>The alias <code>[hexaone_booking]</code> accepts the same attributes.</p>
          </section>

          <section id="proxy">
            <span className="docs-kicker">Architecture</span>
            <h2>WordPress proxy and CORS</h2>
            <p>
              Browser requests go to WordPress <code>admin-ajax.php</code>. The plugin validates a WordPress nonce,
              allows only the branches, services, staff, availability, and booking actions, sanitizes input, and
              sends the request to the salon API from the WordPress server.
            </p>
            <div className="docs-diagram">
              <span>Visitor browser</span><b>→</b><span>WordPress AJAX proxy</span><b>→</b><span>Salon API</span>
            </div>
            <div className="docs-note">
              Because the proxy is same-origin with the WordPress site, no CORS allowlist change is required.
              Direct browser integrations from another domain require that domain to be approved by the API.
            </div>
          </section>

          <section id="troubleshooting">
            <span className="docs-kicker">Help</span>
            <h2>Troubleshooting</h2>
            <div className="docs-faq">
              <details>
                <summary>The widget says the plugin is not configured</summary>
                <p>Open Settings → Salon Booking and save both the API base URL and numeric Tenant ID.</p>
              </details>
              <details>
                <summary>No branches, services, or staff are displayed</summary>
                <p>Confirm those records are active in the salon admin, verify the Tenant ID, and check that staff are assigned to the selected branch.</p>
              </details>
              <details>
                <summary>No appointment times are available</summary>
                <p>Try another date or staff member. Existing pending, confirmed, and in-service appointments block overlapping time.</p>
              </details>
              <details>
                <summary>The booking returns HTTP 409</summary>
                <p>Another booking took the selected slot. Reload availability and ask the customer to select a new time.</p>
              </details>
              <details>
                <summary>WordPress cannot connect to the API</summary>
                <p>Confirm HTTPS works from the WordPress server and that outbound HTTP requests are not blocked by hosting or a security plugin.</p>
              </details>
            </div>
          </section>

          <footer className="docs-footer">
            <strong>{brandName}</strong>
            <span>Booking API and WordPress Plugin Documentation</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
