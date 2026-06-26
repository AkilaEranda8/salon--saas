const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { resolvePlanForInvoice } = require('../utils/planPricing');

const M = 40;
const LOGO_W = 150;
const LOGO_H = 100;

function resolveInvoiceLogoPath() {
  const candidates = [
    process.env.INVOICE_LOGO_PATH,
    path.join(__dirname, '../assets/hexaone-logo.png'),
    path.join(__dirname, '../assets/invoice-logo.png'),
    path.join(__dirname, '../../frontend/public/kogo.png'),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function drawCompanyLogo(doc, x, y, w = LOGO_W, h = LOGO_H) {
  const logoPath = resolveInvoiceLogoPath();
  if (!logoPath) {
    doc.roundedRect(x, y, w, h, 6).lineWidth(1).strokeColor('#1E40AF').stroke();
    doc.fillColor('#1E40AF').font('Helvetica-Bold').fontSize(10).text('HEXAONE', x + 12, y + h * 0.42);
    return;
  }
  doc.image(logoPath, x, y, { fit: [w, h], align: 'left', valign: 'center' });
}

function fullWidthHr(doc, y, pageW, color = '#E5E7EB', weight = 0.75) {
  doc.save().lineWidth(weight).strokeColor(color).moveTo(0, y).lineTo(pageW, y).stroke().restore();
}

function hr(doc, x, y, w, color = '#E5E7EB') {
  doc.save().lineWidth(0.75).strokeColor(color).moveTo(x, y).lineTo(x + w, y).stroke().restore();
}

function getCompanyProfile() {
  return {
    name: process.env.INVOICE_COMPANY_NAME || process.env.COMPANY_NAME || 'Hexalyte Innovation (PVT) LTD',
    tagline: process.env.INVOICE_COMPANY_TAGLINE || 'Salon Management Platform',
    address: process.env.INVOICE_COMPANY_ADDRESS || 'Colombo, Sri Lanka',
    phone: process.env.INVOICE_COMPANY_PHONE || '0703130100',
    email: process.env.INVOICE_COMPANY_EMAIL || process.env.INVOICE_SUPPORT_EMAIL || process.env.EMAIL_USER || 'billing@hexalyte.com',
    website: process.env.INVOICE_COMPANY_WEBSITE || 'www.hexalyte.com',
    regNo: process.env.INVOICE_COMPANY_REG || '',
  };
}

function formatLkr(amount) {
  return `LKR ${Number(amount || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatAmt(amount) {
  return Number(amount || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-LK', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatPeriod(start, end) {
  if (!start && !end) return '—';
  return `${start ? formatDate(start) : '—'} to ${end ? formatDate(end) : '—'}`;
}

function getEmailTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT, 10) || 587,
    secure: false,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
}

function statusStyle(status) {
  const s = String(status || 'issued').toLowerCase();
  if (s === 'paid') return { fill: '#ECFDF5', stroke: '#A7F3D0', text: '#047857' };
  if (s === 'overdue') return { fill: '#FEF2F2', stroke: '#FECACA', text: '#B91C1C' };
  if (s === 'draft') return { fill: '#F9FAFB', stroke: '#E5E7EB', text: '#6B7280' };
  return { fill: '#EFF6FF', stroke: '#BFDBFE', text: '#1D4ED8' };
}

function sectionLabel(doc, text, x, y) {
  doc.fillColor('#374151').font('Helvetica-Bold').fontSize(8).text(text, x, y, { characterSpacing: 0.6 });
}

function kvRow(doc, label, value, x, y, labelW, valueW, opts = {}) {
  doc.fillColor(opts.labelColor || '#374151').font('Helvetica-Bold').fontSize(9).text(label, x, y, { width: labelW });
  doc.fillColor(opts.valueColor || '#111827').font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
    .text(value, x + labelW, y, { width: valueW, align: 'right' });
}

async function generateInvoicePdfBuffer({ invoice, tenant }) {
  const company = getCompanyProfile();
  const planDetails = invoice.plan ? await resolvePlanForInvoice(invoice.plan) : null;
  const planLabel = planDetails?.label || invoice.plan || 'Subscription';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
    const chunks = [];
    const pageW = doc.page.width;
    const W = pageW - M * 2;
    const R = M + W;

    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const ink = '#111827';
    const sub = '#374151';
    const label = '#374151';
    const accent = '#1E40AF';
    const accentSoft = '#EFF6FF';

    const invoiceNo = invoice.invoice_number || `INV-${invoice.id}`;
    const base = Number(invoice.base_price ?? invoice.amount ?? 0);
    const extra = Number(invoice.additional_charges || 0);
    const discount = Number(invoice.discount || 0);
    const total = Number(invoice.amount ?? (base + extra - discount));
    const tenantName = tenant?.brand_name || tenant?.name || 'Customer';
    const status = String(invoice.status || 'issued');
    const st = statusStyle(status);

    const colQty = R - 178;
    const colUnit = R - 108;
    const colTotal = R - M;

    const LOGO_GAP = 16;
    const textX = M + LOGO_W + LOGO_GAP;
    const contactLines = [company.address, `Tel: ${company.phone}`, company.email, company.website];
    const textBlockH = 18 + 13 + contactLines.length * 12;
    const headerH = Math.max(LOGO_H + 16, textBlockH + 8);
    const logoY = M + (headerH - LOGO_H) / 2;
    const textY = M + (headerH - textBlockH) / 2;

    // ═══ LETTERHEAD ═══════════════════════════════════════════════════════
    drawCompanyLogo(doc, M, logoY, LOGO_W, LOGO_H);

    doc.fillColor(ink).font('Helvetica-Bold').fontSize(15).text(company.name, textX, textY, { width: W * 0.48 });
    doc.fillColor(sub).font('Helvetica').fontSize(8.5).text(company.tagline, textX, textY + 18);

    let coY = textY + 32;
    doc.font('Helvetica').fontSize(8.5).fillColor(sub);
    contactLines.forEach((t) => {
      doc.text(t, textX, coY, { width: W * 0.44 });
      coY += 12;
    });

    doc.fillColor(ink).font('Helvetica-Bold').fontSize(28).text('Invoice', R - 180, M, { width: 180, align: 'right' });

    const pillText = status.charAt(0).toUpperCase() + status.slice(1);
    const pillW = doc.widthOfString(pillText, { font: 'Helvetica-Bold', fontSize: 8 }) + 20;
    const pillY = M + 36;
    doc.roundedRect(R - pillW, pillY, pillW, 18, 9).fill(st.fill).stroke(st.stroke);
    doc.fillColor(st.text).font('Helvetica-Bold').fontSize(8)
      .text(pillText, R - pillW, pillY + 5, { width: pillW, align: 'center' });

    doc.fillColor(label).font('Helvetica-Bold').fontSize(9).text(`# ${invoiceNo}`, R - 180, pillY + 24, { width: 180, align: 'right' });

    let y = M + headerH + 14;
    fullWidthHr(doc, y, pageW, accent, 2.5);
    y += 22;

    // ═══ BILLED TO + INVOICE DETAILS ══════════════════════════════════════
    const colW = (W - 24) / 2;

    sectionLabel(doc, 'BILLED TO', M, y);
    sectionLabel(doc, 'INVOICE DETAILS', M + colW + 24, y);

    y += 14;
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(11).text(tenantName, M, y, { width: colW });
    doc.font('Helvetica').fontSize(9).fillColor(sub)
      .text(tenant?.name || tenantName, M, y + 16, { width: colW })
      .text(tenant?.email || '—', M, y + 30, { width: colW });

    const ix = M + colW + 24;
    const iLabelW = 96;
    const iValW = colW - iLabelW;
    let iy = y;
    [
      ['Invoice number', invoiceNo],
      ['Issue date', formatDate(invoice.issued_at || invoice.created_at || new Date())],
      ['Due date', formatDate(invoice.due_at)],
      ['Billing period', formatPeriod(invoice.billing_period_start, invoice.billing_period_end)],
      ['Currency', 'LKR — Sri Lankan Rupee'],
    ].forEach(([lbl, val]) => {
      kvRow(doc, lbl, val, ix, iy, iLabelW, iValW, { bold: lbl === 'Invoice number', labelColor: label });
      iy += 15;
    });

    y += 78;
    hr(doc, M, y, W);
    y += 20;

    // ═══ LINE ITEMS ═══════════════════════════════════════════════════════
    sectionLabel(doc, 'ITEMS', M, y);
    y += 14;

    doc.rect(M, y, W, 22).fill('#F9FAFB');
    hr(doc, M, y, W);
    hr(doc, M, y + 22, W);
    doc.fillColor(label).font('Helvetica-Bold').fontSize(8)
      .text('DESCRIPTION', M + 10, y + 7, { width: colQty - M - 16 })
      .text('QTY', colQty, y + 7, { width: 32, align: 'center' })
      .text('UNIT PRICE', colUnit, y + 7, { width: 62, align: 'right' })
      .text('AMOUNT', colTotal, y + 7, { width: 62, align: 'right' });

    y += 22;
    const itemTitle = `${planLabel} Plan — Monthly Subscription`;
    const itemSub = planDetails?.tagline || 'HexaSalon cloud platform access';
    const rowH = 52;

    doc.rect(M, y, W, rowH).fill('#FFFFFF');
    hr(doc, M, y + rowH, W);
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(10).text(itemTitle, M + 10, y + 12, { width: colQty - M - 20 });
    doc.fillColor(sub).font('Helvetica').fontSize(8.5).text(itemSub, M + 10, y + 28, { width: colQty - M - 20 });

    const rMid = y + rowH / 2 - 4;
    doc.fillColor(ink).font('Helvetica').fontSize(9)
      .text('1', colQty, rMid, { width: 32, align: 'center' })
      .text(formatAmt(base), colUnit, rMid, { width: 62, align: 'right' })
      .text(formatAmt(base), colTotal, rMid, { width: 62, align: 'right' });

    y += rowH + 18;

    // ═══ TOTALS ═══════════════════════════════════════════════════════════
    const sumW = 240;
    const sumX = R - sumW;
    const sumRows = [
      ['Subtotal', formatLkr(base)],
      ['Additional charges', formatLkr(extra)],
      ['Discount', discount > 0 ? `− ${formatLkr(discount)}` : formatLkr(0)],
    ];

    sumRows.forEach(([lbl, val], i) => {
      kvRow(doc, lbl, val, sumX, y + i * 17, 130, sumW - 130, { labelColor: label });
    });

    y += sumRows.length * 16 + 8;
    hr(doc, sumX, y, sumW);
    y += 10;

    doc.fillColor(ink).font('Helvetica-Bold').fontSize(10).text('Amount due', sumX, y);
    doc.fillColor(accent).font('Helvetica-Bold').fontSize(14)
      .text(formatLkr(total), sumX, y - 2, { width: sumW, align: 'right' });

    y += 28;

    // ═══ PAYMENT INFORMATION ══════════════════════════════════════════════
    sectionLabel(doc, 'PAYMENT INFORMATION', M, y);
    y += 14;

    const bankName = process.env.INVOICE_BANK_NAME || 'Commercial Bank';
    const bankAccount = process.env.INVOICE_BANK_ACCOUNT || '2000124779';
    const accountName = process.env.INVOICE_ACCOUNT_NAME || 'Akila Eranda Gankewela';
    const swiftCode = process.env.INVOICE_BANK_SWIFT || 'CCEYLKLX';

    doc.roundedRect(M, y, W, 88, 6).fill(accentSoft).stroke('#BFDBFE');
    doc.fillColor('#1E3A8A').font('Helvetica-Bold').fontSize(9)
      .text('Bank transfer — please use the invoice number as your payment reference.', M + 16, y + 12, { width: W - 32 });

    const payCol = (W - 32) / 2;
    const payY = y + 30;
    const payFields = [
      ['Account name', accountName],
      ['Bank', bankName],
      ['Account number', bankAccount],
      ['SWIFT / BIC', swiftCode],
    ];
    payFields.forEach(([lbl, val], i) => {
      const px = M + 16 + (i % 2) * payCol;
      const py = payY + Math.floor(i / 2) * 26;
      doc.fillColor(label).font('Helvetica-Bold').fontSize(8).text(lbl.toUpperCase(), px, py);
      doc.fillColor(ink).font('Helvetica-Bold').fontSize(9.5).text(val, px, py + 11, { width: payCol - 12 });
    });

    y += 102;

    // ═══ FOOTER ═══════════════════════════════════════════════════════════
    fullWidthHr(doc, y, pageW);
    y += 14;
    doc.fillColor(sub).font('Helvetica').fontSize(8.5)
      .text(
        'Thank you for choosing HexaSalon. If you have any questions about this invoice, please contact us.',
        M,
        y,
        { width: W, align: 'center', lineGap: 2 },
      );
    doc.fillColor(label).font('Helvetica-Bold').fontSize(8)
      .text(`${company.name}  ·  ${company.email}  ·  ${company.website}`, M, y + 22, { width: W, align: 'center' });

    doc.end();
  });
}

async function sendInvoiceEmail({ to, invoice, tenant, pdfBuffer }) {
  const company = getCompanyProfile();
  const transporter = getEmailTransporter();
  if (!transporter) throw new Error('Email configuration is missing (EMAIL_USER / EMAIL_PASS).');

  const subject = `Invoice ${invoice.invoice_number || `INV-${invoice.id}`} — ${formatLkr(invoice.amount)}`;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:520px;margin:0 auto;color:#111827">
      <div style="padding:28px 32px 24px;border-bottom:3px solid #1E40AF">
        <div style="font-size:11px;font-weight:600;color:#1E40AF;letter-spacing:0.06em;text-transform:uppercase">Hexalyte Innovation</div>
        <h1 style="margin:8px 0 0;font-size:22px;font-weight:700">${company.name}</h1>
      </div>
      <div style="padding:28px 32px">
        <p style="margin:0 0 16px;font-size:15px">Hello ${tenant?.name || 'there'},</p>
        <p style="margin:0 0 20px;font-size:14px;color:#6B7280;line-height:1.6">Your subscription invoice is attached. Summary below:</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px">
          <tr><td style="padding:8px 0;color:#9CA3AF;border-bottom:1px solid #F3F4F6">Invoice</td>
              <td style="padding:8px 0;text-align:right;font-weight:600;border-bottom:1px solid #F3F4F6">${invoice.invoice_number || `INV-${invoice.id}`}</td></tr>
          <tr><td style="padding:8px 0;color:#9CA3AF;border-bottom:1px solid #F3F4F6">Amount due</td>
              <td style="padding:8px 0;text-align:right;font-weight:700;color:#1E40AF;border-bottom:1px solid #F3F4F6">${formatLkr(invoice.amount)}</td></tr>
          <tr><td style="padding:8px 0;color:#9CA3AF">Due date</td>
              <td style="padding:8px 0;text-align:right;font-weight:600">${formatDate(invoice.due_at)}</td></tr>
        </table>
        <p style="margin:0;font-size:14px;color:#6B7280">Best regards,<br><strong style="color:#111827">${company.name}</strong></p>
      </div>
    </div>`;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || `${company.name} <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
    attachments: [{
      filename: `${invoice.invoice_number || `invoice-${invoice.id}`}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf',
    }],
  });
}

module.exports = {
  generateInvoicePdfBuffer,
  sendInvoiceEmail,
  formatLkr,
  getCompanyProfile,
};
