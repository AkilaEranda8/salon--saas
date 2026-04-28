'use strict';

const PDFDocument = require('pdfkit');

const COMPANY = process.env.COMPANY_NAME || 'HEXA SALON';

/**
 * Build a PDF buffer for one staff member's payment rows for a calendar month.
 * @param {{ staff: object, payments: object[], year: number, month: number, totalCommission: number }} opts
 */
function buildStaffEarningsPdfBuffer({ staff, payments, year, month, totalCommission }) {
  const monthLabel = new Date(year, month - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Earnings ${year}-${month}` } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    doc.fontSize(16).font('Helvetica-Bold').text(COMPANY, { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(12).font('Helvetica').text('Monthly Earnings Report', { align: 'center' });
    doc.fontSize(11).text(monthLabel, { align: 'center' });
    doc.moveDown(1);

    doc.font('Helvetica-Bold').text('Staff member');
    doc.font('Helvetica').text(String(staff.name || ''));
    if (staff.role_title) doc.text(String(staff.role_title));
    if (staff.branch?.name) doc.text(`Branch: ${staff.branch.name}`);
    if (staff.email) doc.text(`Email: ${staff.email}`);
    doc.moveDown(0.6);

    const totalRev = payments.reduce((a, p) => a + parseFloat(p.total_amount || 0), 0);
    doc.font('Helvetica-Bold').text('Summary');
    doc.font('Helvetica').fontSize(10);
    doc.text(
      `Total revenue (period): Rs. ${totalRev.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    );
    doc.text(
      `Total commission (period): Rs. ${Number(totalCommission || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    );
    doc.text(`Payment lines: ${payments.length}`);
    doc.moveDown(0.6);

    if (!payments.length) {
      doc.font('Helvetica-Oblique').text('No payment records for this month.');
      doc.end();
      return;
    }

    doc.font('Helvetica-Bold').fontSize(10).text('Payment details');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(8);

    for (const p of payments) {
      if (doc.y > 700) doc.addPage();
      const d = p.date ? String(p.date) : '';
      const cust = String(p.customer_name || p.appointment?.customer_name || '—');
      const svc = String(p.service?.name || '—');
      const rev = parseFloat(p.total_amount || 0).toFixed(2);
      const com = parseFloat(p.commission_amount || 0).toFixed(2);
      doc.text(`${d}  |  ${cust}  |  ${svc}`, { width: 515 });
      doc.text(`Revenue: Rs. ${rev}    Commission: Rs. ${com}`, { width: 515 });
      doc.moveDown(0.35);
    }

    doc.end();
  });
}

module.exports = { buildStaffEarningsPdfBuffer, COMPANY };
