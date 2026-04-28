const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');

function formatMoney(amount, currency = 'USD') {
  const num = Number(amount || 0);
  return `${currency} ${num.toFixed(2)}`;
}

function formatDate(dateValue) {
  if (!dateValue) return '-';
  return new Date(dateValue).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function getEmailTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT, 10) || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

async function generateInvoicePdfBuffer({ invoice, tenant }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const navy = '#0F274B';
    const teal = '#64C9C6';
    const gray = '#4B5563';
    const lightGray = '#E5E7EB';

    const tenantName = tenant?.name || 'Salon';
    const invoiceNo = invoice.invoice_number || `INV-${invoice.id}`;
    const amount = Number(invoice.amount || 0);
    const tax = Number(invoice.additional_charges || 0);
    const discount = Number(invoice.discount || 0);
    const subtotal = amount + discount - tax;

    doc.rect(0, 0, doc.page.width, 28).fill(navy);
    doc.polygon([0, 28], [22, 28], [0, 50]).fill(teal);

    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(38).text('INVOICE', 40, 58);

    doc.roundedRect(350, 55, 36, 36, 8).fill('#F4C542');
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(20).text('z', 363, 63);
    doc.fillColor(teal).font('Helvetica-Bold').fontSize(20).text('Zane', 395, 61);
    doc.fillColor(navy).font('Helvetica-Bold').fontSize(20).text('Salon', 395, 83);

    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(13).text('Bill To:', 40, 130);
    doc.font('Helvetica').fontSize(11).fillColor(gray)
      .text(`Client Name: ${tenantName}`, 40, 155)
      .text(`Company Name: ${tenantName}`, 40, 173)
      .text(`Billing Address: ${tenant?.slug || '-'} / HEXA SALON`, 40, 191)
      .text(`Phone: ${tenant?.phone || '-'}`, 40, 209)
      .text(`Email: ${tenant?.email || '-'}`, 40, 227);

    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11)
      .text('Invoice Number:', 350, 165)
      .text('Invoice Date:', 350, 183)
      .text('Due Date:', 350, 201)
      .text('Plan:', 350, 219);

    doc.fillColor(gray).font('Helvetica').fontSize(11)
      .text(invoiceNo, 455, 165)
      .text(formatDate(invoice.issued_at || invoice.created_at || new Date()), 455, 183)
      .text(formatDate(invoice.due_at), 455, 201)
      .text(invoice.plan || '-', 455, 219);

    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(16).text('Service Details:', 40, 270);

    const tableTop = 298;
    const colX = [40, 80, 330, 420, 500];
    doc.rect(40, tableTop, 515, 22).fill('#E9B949');
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10)
      .text('No', colX[0] + 8, tableTop + 7)
      .text('Description of Service', colX[1], tableTop + 7)
      .text('Quantity', colX[2], tableTop + 7)
      .text('Rate', colX[3], tableTop + 7)
      .text('Total', colX[4], tableTop + 7);

    const rows = [
      {
        no: '1',
        desc: `Subscription - ${invoice.plan || 'Salon Plan'}`,
        qty: '1',
        rate: formatMoney(invoice.base_price || invoice.amount, invoice.currency || 'USD'),
        total: formatMoney(invoice.amount, invoice.currency || 'USD'),
      },
    ];

    rows.forEach((r, idx) => {
      const y = tableTop + 22 + idx * 22;
      doc.rect(40, y, 515, 22).fill(idx % 2 === 0 ? '#F9FAFB' : '#F3F4F6');
      doc.fillColor('#111827').font('Helvetica').fontSize(10)
        .text(r.no, colX[0] + 8, y + 7)
        .text(r.desc, colX[1], y + 7)
        .text(r.qty, colX[2], y + 7)
        .text(r.rate, colX[3], y + 7)
        .text(r.total, colX[4], y + 7);
    });

    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(12).text('Terms and Conditions:', 40, 395);
    doc.fillColor(gray).font('Helvetica').fontSize(10)
      .text('• Payment is due on receipt of this invoice.', 40, 417)
      .text('• Late payments may incur additional charges.', 40, 433)
      .text('• For support, contact HEXA SALON billing support.', 40, 449);

    doc.fillColor(gray).font('Helvetica').fontSize(11)
      .text('Subtotal', 330, 408)
      .text('Additional Charges', 330, 427)
      .text('Discount', 330, 446);

    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11)
      .text(formatMoney(subtotal, invoice.currency || 'USD'), 470, 408)
      .text(formatMoney(tax, invoice.currency || 'USD'), 470, 427)
      .text(`- ${formatMoney(discount, invoice.currency || 'USD')}`, 470, 446);

    doc.moveTo(330, 468).lineTo(555, 468).lineWidth(1).stroke('#6B7280');
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(12)
      .text('Total Amount Due', 330, 476)
      .text(formatMoney(amount, invoice.currency || 'USD'), 470, 476);

    doc.rect(0, 560, doc.page.width, 36).fill(navy);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(16)
      .text('Payment Information:', 40, 571);

    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11)
      .text('Payment Method: ', 40, 614)
      .text('Due Date: ', 40, 632)
      .text('Bank Account: ', 40, 650);

    doc.fillColor(gray).font('Helvetica').fontSize(11)
      .text('Bank Transfer', 130, 614)
      .text(formatDate(invoice.due_at), 100, 632)
      .text('1234-5678-9012-3456', 120, 650)
      .text(`Date: ${formatDate(invoice.issued_at || invoice.created_at || new Date())}`, 430, 650);

    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(14).text('Questions', 40, 684);
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10)
      .text('Email US:', 40, 706)
      .text('Call US:', 40, 724);
    doc.fillColor(gray).font('Helvetica').fontSize(10)
      .text(process.env.EMAIL_USER || 'billing@hexalyte.com', 92, 706)
      .text('+94 11 000 0000', 84, 724);

    doc.moveTo(430, 720).lineTo(535, 720).lineWidth(1).stroke('#6B7280');
    doc.fillColor('#111827').font('Helvetica').fontSize(10).text('Authorized Signatory', 435, 728);

    doc.polygon([doc.page.width, doc.page.height - 24], [doc.page.width - 24, doc.page.height], [doc.page.width, doc.page.height]).fill(teal);

    doc.end();
  });
}

async function sendInvoiceEmail({ to, invoice, tenant, pdfBuffer }) {
  const transporter = getEmailTransporter();
  if (!transporter) {
    throw new Error('Email configuration is missing (EMAIL_USER / EMAIL_PASS).');
  }

  const subject = `Invoice ${invoice.invoice_number || `INV-${invoice.id}`} - ${tenant?.name || 'HEXA SALON'}`;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.6">
      <h2 style="margin:0 0 8px;color:#0F274B">Invoice ${invoice.invoice_number || `INV-${invoice.id}`}</h2>
      <p>Hello,</p>
      <p>Please find your invoice attached as a PDF.</p>
      <p><strong>Amount:</strong> ${formatMoney(invoice.amount, invoice.currency || 'USD')}</p>
      <p><strong>Due Date:</strong> ${formatDate(invoice.due_at)}</p>
      <p>Thank you,<br/>HEXA SALON Billing</p>
    </div>
  `;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || `HEXA SALON <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
    attachments: [
      {
        filename: `${invoice.invoice_number || `invoice-${invoice.id}`}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });
}

module.exports = {
  generateInvoicePdfBuffer,
  sendInvoiceEmail,
};
