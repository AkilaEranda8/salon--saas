'use strict';

const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { getIO } = require('../socket');
const { normalizeTenantId } = require('../utils/whatsappTenantAccess');

const SESSIONS_ROOT = path.resolve(path.join(__dirname, '../uploads/whatsapp_sessions'));
const activeSockets = new Map();
const runtimeStatus = new Map();

function sessionDir(tenantId) {
  const id = normalizeTenantId(tenantId);
  const dir = path.join(SESSIONS_ROOT, String(id));
  const resolved = path.resolve(dir);
  if (!resolved.startsWith(SESSIONS_ROOT + path.sep) && resolved !== SESSIONS_ROOT) {
    throw new Error('Invalid session path');
  }
  return resolved;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function phoneFromJid(jid = '') {
  const raw = String(jid).split('@')[0].split(':')[0];
  return raw.replace(/\D/g, '') || null;
}

function toJid(phone) {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('0')) digits = `94${digits.slice(1)}`;
  return `${digits}@s.whatsapp.net`;
}

function getModels() {
  return require('../models');
}

async function upsertConnection(tenantId, patch) {
  const { WhatsAppConnection } = getModels();
  let row = await WhatsAppConnection.findOne({ where: { tenant_id: tenantId } });
  if (!row) {
    row = await WhatsAppConnection.create({ tenant_id: tenantId, ...patch });
  } else {
    await row.update(patch);
  }
  return row;
}

function emitTenant(tenantId, event, payload) {
  const io = getIO();
  if (!io) return;
  io.to(`whatsapp_tenant_${tenantId}`).emit(event, payload);
}

async function qrToDataUrl(qr) {
  if (!qr) return null;
  return QRCode.toDataURL(qr, { margin: 1, width: 280 });
}

function setRuntime(tenantId, patch) {
  const prev = runtimeStatus.get(tenantId) || {};
  const next = { ...prev, ...patch, tenant_id: tenantId };
  runtimeStatus.set(tenantId, next);
  return next;
}

function getRuntime(tenantId) {
  return runtimeStatus.get(tenantId) || { tenant_id: tenantId, status: 'disconnected' };
}

async function storeMessage({
  tenantId, direction, phone, jid, body, status, event_type, customer_name, wa_message_id,
}) {
  try {
    const { WhatsAppMessage } = getModels();
    await WhatsAppMessage.create({
      tenant_id: tenantId,
      direction,
      phone,
      jid,
      body: String(body || '').slice(0, 4000),
      status,
      event_type: event_type || null,
      customer_name: customer_name || null,
      wa_message_id: wa_message_id || null,
    });
    emitTenant(tenantId, 'whatsapp:message', {
      direction, phone, body, status, createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[WhatsApp] storeMessage failed:', err.message);
  }
}

async function startSession(tenantId, audit = {}) {
  const tid = normalizeTenantId(tenantId);
  if (activeSockets.has(tid)) {
    const rt = getRuntime(tid);
    return rt;
  }

  ensureDir(SESSIONS_ROOT);
  ensureDir(sessionDir(tid));

  setRuntime(tid, { status: 'connecting', qr: null, qrImage: null });
  await upsertConnection(tid, { status: 'connecting', last_error: null });
  emitTenant(tid, 'whatsapp:status', { status: 'connecting' });
  console.log(`[WhatsApp] connect start tenant=${tid} by=${audit.username || audit.userId || 'system'}`);

  const baileys = await import('@whiskeysockets/baileys');
  const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
  } = baileys;

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir(tid));
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['HEXAONE', 'Chrome', '1.0.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  activeSockets.set(tid, sock);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const qrImage = await qrToDataUrl(qr);
      setRuntime(tid, { status: 'connecting', qr, qrImage });
      emitTenant(tid, 'whatsapp:qr', { qrImage });
      emitTenant(tid, 'whatsapp:status', { status: 'connecting', qrImage });
    }

    if (connection === 'open') {
      const me = sock.user;
      const phone = phoneFromJid(me?.id);
      const pushName = me?.name || me?.verifiedName || null;
      const connectedAt = new Date();
      setRuntime(tid, {
        status: 'connected', phone, push_name: pushName, qr: null, qrImage: null, connected_at: connectedAt,
      });
      await upsertConnection(tid, {
        status: 'connected', phone, push_name: pushName, connected_at: connectedAt, last_error: null,
      });
      emitTenant(tid, 'whatsapp:status', { status: 'connected', phone, push_name: pushName });
      console.log(`[WhatsApp] connected tenant=${tid} phone=${phone || 'unknown'}`);
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      activeSockets.delete(tid);

      if (code === DisconnectReason.loggedOut) {
        try {
          fs.rmSync(sessionDir(tid), { recursive: true, force: true });
        } catch { /* ignore */ }
        setRuntime(tid, { status: 'disconnected', phone: null, qr: null, qrImage: null });
        await upsertConnection(tid, {
          status: 'disconnected', phone: null, push_name: null, connected_at: null,
          last_error: 'Logged out from phone',
        });
        emitTenant(tid, 'whatsapp:status', { status: 'disconnected' });
        return;
      }

      const errMsg = lastDisconnect?.error?.message || 'Connection closed';
      setRuntime(tid, { status: 'disconnected', last_error: errMsg });
      await upsertConnection(tid, { status: 'disconnected', last_error: errMsg });
      emitTenant(tid, 'whatsapp:status', { status: 'disconnected', error: errMsg });

      if (shouldReconnect) {
        setTimeout(() => startSession(tid).catch(() => {}), 5000);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages || []) {
      if (!msg.message || msg.key.fromMe) continue;
      const jid = msg.key.remoteJid;
      if (!jid || jid.endsWith('@g.us')) continue;
      const body =
        msg.message.conversation
        || msg.message.extendedTextMessage?.text
        || msg.message.imageMessage?.caption
        || msg.message.videoMessage?.caption
        || '';
      if (!body) continue;
      const phone = phoneFromJid(jid);
      await storeMessage({
        tenantId: tid,
        direction: 'in',
        phone,
        jid,
        body,
        status: 'received',
        wa_message_id: msg.key.id,
      });

      // Feed CRM AI inbox when tenant has WhatsApp AI CRM (QR channel).
      try {
        const { Tenant } = getModels();
        const { hasTenantFeature } = require('../utils/tenantFeatures');
        const tenant = await Tenant.findByPk(tid);
        if (tenant && hasTenantFeature(tenant, 'whatsapp_ai_crm') && phone) {
          const { enqueueInboundTurn } = require('./crmInboundTurnService');
          await enqueueInboundTurn({
            tenantId: tid,
            phone,
            message: body,
            waMessageId: msg.key.id || `qr-${tid}-${Date.now()}`,
            name: msg.pushName || null,
            channel: 'qr',
            campaignSource: 'whatsapp_qr',
          });
        }
      } catch (err) {
        console.error('[WhatsApp] CRM inbound enqueue failed:', err.message);
      }
    }
  });

  return getRuntime(tid);
}

async function stopSession(tenantId, logout = true, audit = {}) {
  const tid = normalizeTenantId(tenantId);
  const sock = activeSockets.get(tid);
  if (sock) {
    try {
      if (logout) await sock.logout();
      else sock.end(undefined);
    } catch { /* ignore */ }
    activeSockets.delete(tid);
  }
  if (logout) {
    try {
      fs.rmSync(sessionDir(tid), { recursive: true, force: true });
    } catch { /* ignore */ }
  }
  setRuntime(tid, { status: 'disconnected', phone: null, qr: null, qrImage: null });
  await upsertConnection(tid, {
    status: 'disconnected', phone: null, push_name: null, connected_at: null, last_error: null,
  });
  emitTenant(tid, 'whatsapp:status', { status: 'disconnected' });
  console.log(`[WhatsApp] disconnected tenant=${tid} by=${audit.username || audit.userId || 'system'}`);
}

async function getStatus(tenantId) {
  const tid = normalizeTenantId(tenantId);
  const { WhatsAppConnection } = getModels();
  const row = await WhatsAppConnection.findOne({ where: { tenant_id: tid } });
  const rt = getRuntime(tid);
  return {
    status: rt.status || row?.status || 'disconnected',
    phone: rt.phone || row?.phone || null,
    push_name: rt.push_name || row?.push_name || null,
    connected_at: rt.connected_at || row?.connected_at || null,
    last_error: row?.last_error || rt.last_error || null,
    qrImage: rt.qrImage || null,
    provider: (rt.status === 'connected' || row?.status === 'connected') ? 'qr' : 'twilio',
  };
}

function isConnected(tenantId) {
  const tid = normalizeTenantId(tenantId);
  const rt = getRuntime(tid);
  return rt.status === 'connected' && activeSockets.has(tid);
}

async function sendViaQr(tenantId, phone, message, meta = {}) {
  const tid = normalizeTenantId(tenantId);
  if (meta.tenant_id != null && Number(meta.tenant_id) !== tid) {
    throw new Error('Tenant mismatch — message blocked for security.');
  }
  if (!isConnected(tid)) return { used: false };
  const sock = activeSockets.get(tid);
  const jid = toJid(phone);
  if (!jid || !sock) return { used: false };

  let status = 'sent';
  let errorMsg = null;
  try {
    await sock.sendMessage(jid, { text: message });
    await storeMessage({
      tenantId: tid,
      direction: 'out',
      phone: phoneFromJid(jid),
      jid,
      body: message,
      status: 'sent',
      event_type: meta.event_type || null,
      customer_name: meta.customer_name || null,
    });
  } catch (err) {
    status = 'failed';
    errorMsg = err.message;
    await storeMessage({
      tenantId: tid,
      direction: 'out',
      phone: phoneFromJid(jid),
      jid,
      body: message,
      status: 'failed',
      event_type: meta.event_type || null,
      customer_name: meta.customer_name || null,
    });
    throw err;
  }
  return { used: true, status, error: errorMsg };
}

async function listMessages(tenantId, { page = 1, limit = 50 } = {}) {
  const tid = normalizeTenantId(tenantId);
  const { WhatsAppMessage } = getModels();
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const offset = (safePage - 1) * safeLimit;
  const { count, rows } = await WhatsAppMessage.findAndCountAll({
    where: { tenant_id: tid },
    order: [['createdAt', 'DESC']],
    limit: safeLimit,
    offset,
  });
  return { total: count, page: safePage, limit: safeLimit, data: rows };
}

async function restoreSessionsOnBoot() {
  ensureDir(SESSIONS_ROOT);
  const { WhatsAppConnection } = getModels();
  const connected = await WhatsAppConnection.findAll({ where: { status: 'connected' } });
  for (const row of connected) {
    const dir = sessionDir(row.tenant_id);
    if (fs.existsSync(dir)) {
      startSession(row.tenant_id).catch((err) => {
        console.error(`[WhatsApp] restore tenant ${row.tenant_id} failed:`, err.message);
      });
    }
  }
}

module.exports = {
  startSession,
  stopSession,
  getStatus,
  isConnected,
  sendViaQr,
  listMessages,
  restoreSessionsOnBoot,
  toJid,
};
