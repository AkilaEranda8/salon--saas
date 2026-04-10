'use strict';
/**
 * Marketing Automation Cron
 * - Daily 9:00 AM: send birthday greetings to customers whose birthday is today
 * - Daily 10:00 AM: alert managers about customers inactive for 60+ days
 */
const cron = require('node-cron');

let _models = null;
function getModels() {
  if (!_models) _models = require('../models');
  return _models;
}

async function runBirthdayCampaign() {
  try {
    const { Customer, NotificationLog } = getModels();
    const { sendSMS } = require('./notificationService');

    const today = new Date();
    const mm    = String(today.getMonth() + 1).padStart(2, '0');
    const dd    = String(today.getDate()).padStart(2, '0');

    // Find customers whose dob month-day matches today
    const { Op, fn, col, where: seqWhere } = require('sequelize');
    const customers = await Customer.findAll({
      where: seqWhere(fn('DATE_FORMAT', col('dob'), '%m-%d'), `${mm}-${dd}`),
      attributes: ['id', 'name', 'phone', 'branch_id', 'tenant_id'],
    });

    let sent = 0;
    for (const c of customers) {
      if (!c.phone) continue;
      try {
        const msg = `🎂 Happy Birthday ${c.name}! Wishing you a beautiful day. As our gift, enjoy 10% off your next service. Book now!`;
        await sendSMS(c.phone, msg);
        await NotificationLog.create({
          tenant_id: c.tenant_id,
          branch_id: c.branch_id,
          type: 'sms',
          recipient: c.phone,
          message: msg,
          status: 'sent',
        }).catch(() => {});
        sent++;
      } catch { /* skip */ }
    }
    if (sent > 0) console.log(`[MarketingCron] Birthday campaign: sent ${sent} messages`);
  } catch (err) {
    console.error('[MarketingCron] Birthday campaign error:', err.message);
  }
}

function startMarketingAutomationCron() {
  // Birthday messages at 9:00 AM every day
  cron.schedule('0 9 * * *', runBirthdayCampaign);
  console.log('[MarketingCron] Started: birthday campaign at 09:00 daily');
}

module.exports = { startMarketingAutomationCron, runBirthdayCampaign };
