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

function isLidJid(jid = '') {
  return String(jid).includes('@lid');
}

function toJid(phone) {
  if (!phone) return null;
  const raw = String(phone).trim();
  if (raw.includes('@')) return raw; // already a JID (pn or lid)
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  // WhatsApp LID identifiers are long numeric IDs (not E.164 phones)
  if (digits.length >= 14) return `${digits}@lid`;
  if (digits.startsWith('0')) digits = `94${digits.slice(1)}`;
  // Local 9-digit mobiles (7xxxxxxxx) → LK country code
  if (digits.length === 9 && digits.startsWith('7')) digits = `94${digits}`;
  return `${digits}@s.whatsapp.net`;
}

/** Recent outbound payloads so Baileys can re-encrypt on decrypt-retry. */
const recentOutboundByKey = new Map(); // `${jid}|${id}` → message content
const RECENT_OUTBOUND_MAX = 200;

function cacheOutboundMessage(jid, id, content) {
  if (!jid || !id || !content) return;
  const key = `${jid}|${id}`;
  recentOutboundByKey.set(key, content);
  if (recentOutboundByKey.size > RECENT_OUTBOUND_MAX) {
    const first = recentOutboundByKey.keys().next().value;
    recentOutboundByKey.delete(first);
  }
}

function getCachedOutboundMessage(key) {
  if (!key?.remoteJid || !key?.id) return undefined;
  return recentOutboundByKey.get(`${key.remoteJid}|${key.id}`);
}

/**
 * Resolve a reliable send JID.
 *
 * CRITICAL: When the customer messaged us on @lid, replies MUST go back to that
 * same @lid. Rewriting LID → PN is a common cause of permanent
 * "Waiting for this message" placeholders on the recipient.
 *
 * For proactive outbound (no inbound reply JID), prefer verified PN via onWhatsApp.
 */
async function resolveSendJid(sock, phone, meta = {}) {
  // Inbound reply path — never rewrite away from the chat WhatsApp opened
  if (meta.replyToInbound && meta.replyJid) return meta.replyJid;
  if (meta.allowLid && meta.replyJid && isLidJid(meta.replyJid)) return meta.replyJid;

  if (meta.replyJid && !isLidJid(meta.replyJid)) return meta.replyJid;
  if (meta.jid && !isLidJid(meta.jid)) return meta.jid;

  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `94${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith('7')) digits = `94${digits}`;
  // Never treat LID numeric ids as phone numbers
  if (digits.length >= 14) digits = '';

  if (digits && sock?.onWhatsApp) {
    try {
      const results = await sock.onWhatsApp(digits);
      const hit = Array.isArray(results) ? results.find((r) => r?.exists && r?.jid) : null;
      if (hit?.jid) return hit.jid;
    } catch (err) {
      console.warn('[WhatsApp] onWhatsApp resolve failed:', err.message);
    }
  }

  // Last resort: known reply JID (even @lid) or constructed PN JID
  if (meta.replyJid) return meta.replyJid;
  if (meta.jid) return meta.jid;
  return toJid(phone);
}

/**
 * Resolve customer phone + reply JID from an inbound Baileys message.
 * WhatsApp now often delivers DMs as @lid; remoteJidAlt / senderPn holds the PN.
 */
async function resolveInboundPeer(sock, msg) {
  const key = msg?.key || {};
  const remoteJid = key.remoteJid || '';
  const altJid = key.remoteJidAlt || key.senderPn || key.participantAlt || null;

  let phoneJid = altJid || null;
  if (!phoneJid && isLidJid(remoteJid) && sock?.signalRepository?.lidMapping?.getPNForLID) {
    try {
      phoneJid = await sock.signalRepository.lidMapping.getPNForLID(remoteJid);
    } catch (_) { /* ignore */ }
  }
  if (!phoneJid && !isLidJid(remoteJid)) phoneJid = remoteJid;

  const phone = phoneFromJid(phoneJid || remoteJid);
  // Always reply to the JID WhatsApp addressed us on (works for both @lid and @s.whatsapp.net)
  const replyJid = remoteJid || phoneJid || toJid(phone);
  return { phone, replyJid, phoneJid: phoneJid || remoteJid };
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
    downloadMediaMessage,
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
    // Baileys 6.x: fetchProps/init queries often time out on WA Web — noise only,
    // but can flap reconnect. Skip non-essential init queries; chat still works.
    fireInitQueries: false,
    defaultQueryTimeoutMs: 60_000,
    // Lets Baileys re-send ciphertext when recipient requests decrypt retry
    // (reduces permanent "Waiting for this message" placeholders).
    getMessage: async (key) => getCachedOutboundMessage(key),
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

      // Unwrap ephemeral / view-once so image+caption still reach AI
      const content =
        msg.message.ephemeralMessage?.message
        || msg.message.viewOnceMessage?.message
        || msg.message.viewOnceMessageV2?.message
        || msg.message.viewOnceMessageV2Extension?.message
        || msg.message;

      const body =
        content.conversation
        || content.extendedTextMessage?.text
        || content.imageMessage?.caption
        || content.videoMessage?.caption
        || content.audioMessage?.caption
        // Quick-reply / button taps
        || content.buttonsResponseMessage?.selectedDisplayText
        || content.buttonsResponseMessage?.selectedButtonId
        || content.templateButtonReplyMessage?.selectedDisplayText
        || content.templateButtonReplyMessage?.selectedId
        || content.listResponseMessage?.title
        || content.listResponseMessage?.singleSelectReply?.selectedRowId
        || '';

      let images = [];
      let audio = null;
      const imageMsg = content.imageMessage;
      if (imageMsg && typeof downloadMediaMessage === 'function') {
        try {
          const buffer = await downloadMediaMessage(
            { ...msg, message: { imageMessage: imageMsg } },
            'buffer',
            {},
            { reuploadRequest: sock.updateMediaMessage }
          );
          const MAX_BYTES = Math.floor(3.5 * 1024 * 1024);
          if (buffer && Buffer.isBuffer(buffer) && buffer.length > 0 && buffer.length <= MAX_BYTES) {
            images = [{
              mimeType: String(imageMsg.mimetype || 'image/jpeg').split(';')[0] || 'image/jpeg',
              dataBase64: buffer.toString('base64'),
            }];
          } else if (buffer && buffer.length > MAX_BYTES) {
            console.warn(`[WhatsApp] inbound image too large for AI tenant=${tid} bytes=${buffer.length}`);
          }
        } catch (imgErr) {
          console.error('[WhatsApp] image download failed:', imgErr.message);
        }
      }

      // Voice notes / audio (PTT) — download for Gemini transcription
      const audioMsg = content.audioMessage;
      let audioDownloadFailed = false;
      if (audioMsg && typeof downloadMediaMessage === 'function') {
        try {
          const buffer = await downloadMediaMessage(
            { ...msg, message: { audioMessage: audioMsg } },
            'buffer',
            {},
            { reuploadRequest: sock.updateMediaMessage }
          );
          const MAX_AUDIO = Math.floor(4 * 1024 * 1024);
          if (buffer && Buffer.isBuffer(buffer) && buffer.length > 0 && buffer.length <= MAX_AUDIO) {
            audio = {
              mimeType: String(audioMsg.mimetype || 'audio/ogg').split(';')[0] || 'audio/ogg',
              dataBase64: buffer.toString('base64'),
              ptt: !!audioMsg.ptt,
              seconds: Number(audioMsg.seconds) || null,
            };
          } else if (buffer && buffer.length > MAX_AUDIO) {
            audioDownloadFailed = true;
            console.warn(`[WhatsApp] inbound audio too large tenant=${tid} bytes=${buffer.length}`);
          } else {
            audioDownloadFailed = true;
            console.warn(`[WhatsApp] inbound audio empty tenant=${tid}`);
          }
        } catch (audErr) {
          audioDownloadFailed = true;
          console.error('[WhatsApp] audio download failed:', audErr.message);
        }
      } else if (audioMsg && typeof downloadMediaMessage !== 'function') {
        audioDownloadFailed = true;
        console.error('[WhatsApp] audioMessage present but downloadMediaMessage unavailable');
      }

      // Text OR image OR voice required.
      // IMPORTANT: never silently drop a voice note when download fails — customer gets no reply.
      if (!body && !images.length && !audio && !audioMsg) continue;

      const storeBody = body
        || (audio || audioMsg ? '[Voice note]' : '')
        || (images.length ? '[Photo]' : '');
      const peer = await resolveInboundPeer(sock, msg);
      const phone = peer.phone;
      await storeMessage({
        tenantId: tid,
        direction: 'in',
        phone,
        jid: peer.replyJid || jid,
        body: storeBody,
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
          const voicePlaceholder = audioDownloadFailed
            ? 'I sent a voice note but it could not be downloaded — please ask me to type my request in text.'
            : '[Customer sent a voice note]';
          await enqueueInboundTurn({
            tenantId: tid,
            phone,
            message: body
              || (audio ? '[Customer sent a voice note]' : '')
              || (audioMsg ? voicePlaceholder : '')
              || '[Customer sent a photo]',
            waMessageId: msg.key.id || `qr-${tid}-${Date.now()}`,
            name: msg.pushName || null,
            channel: 'qr',
            campaignSource: 'whatsapp_qr',
            replyJid: peer.replyJid,
            images,
            audio: audio || undefined,
            audioDownloadFailed: audioDownloadFailed || undefined,
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
  // Live socket wins — stale DB "connecting" without an active socket is disconnected.
  const liveConnected = activeSockets.has(tid) && rt.status === 'connected';
  const status = liveConnected
    ? 'connected'
    : (rt.status === 'connecting' && rt.qrImage)
      ? 'connecting'
      : (activeSockets.has(tid) ? (rt.status || 'connecting') : 'disconnected');
  return {
    status,
    phone: rt.phone || row?.phone || null,
    push_name: rt.push_name || row?.push_name || null,
    connected_at: rt.connected_at || row?.connected_at || null,
    last_error: row?.last_error || rt.last_error || null,
    qrImage: rt.qrImage || null,
    provider: 'qr',
    has_session: sessionHasCreds(tid),
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
  if (!sock) return { used: false };

  // CRM AI replies always echo the inbound chat JID (often @lid)
  const inboundReply = !!(meta.replyJid || meta.replyToInbound);
  if (inboundReply && meta.replyJid && isLidJid(meta.replyJid)) {
    meta = { ...meta, allowLid: true, replyToInbound: true };
  }

  let jid = await resolveSendJid(sock, phone, meta);
  if (!jid) return { used: false };

  // Prefer PN only for proactive alerts (no inbound reply thread).
  // Never rewrite an inbound @lid reply target — that breaks E2E decrypt.
  if (isLidJid(jid) && !meta.allowLid && !meta.replyToInbound) {
    const verified = await resolveSendJid(sock, phone, {});
    if (verified && !isLidJid(verified)) {
      console.warn(`[WhatsApp] Replacing @lid with verified PN ${verified}`);
      jid = verified;
    } else {
      const pnFallback = toJid(phone);
      if (pnFallback && !isLidJid(pnFallback)) {
        console.warn(`[WhatsApp] Replacing @lid with constructed PN ${pnFallback}`);
        jid = pnFallback;
      }
    }
  }

  let status = 'sent';
  let errorMsg = null;
  let waMessageId = null;
  const buttons = Array.isArray(meta.buttons)
    ? meta.buttons
      .filter((b) => b && (b.text || b.id))
      .slice(0, 3)
      .map((b, i) => ({
        buttonId: String(b.id || `opt_${i + 1}`).slice(0, 256),
        buttonText: { displayText: String(b.text || b.id).slice(0, 25) },
        type: 1,
      }))
    : [];
  const content = buttons.length
    ? { conversation: String(message || ''), buttons }
    : { conversation: String(message || '') };
  try {
    // Warm session + typing indicator before send (feels faster to the customer)
    try {
      if (typeof sock.presenceSubscribe === 'function') {
        await sock.presenceSubscribe(jid);
      }
      if (typeof sock.sendPresenceUpdate === 'function') {
        await sock.sendPresenceUpdate('composing', jid);
      }
    } catch (_) { /* ignore */ }

    let sent;
    if (buttons.length >= 2) {
      try {
        sent = await sock.sendMessage(jid, {
          text: String(message || ''),
          footer: String(meta.footer || 'Tap a choice').slice(0, 60),
          buttons,
          headerType: 1,
        });
      } catch (btnErr) {
        console.warn(`[WhatsApp] buttons failed, text fallback:`, btnErr.message);
        const withHints = `${message}\n\n👉 ${buttons.map((b) => b.buttonText.displayText).join(' · ')}`;
        sent = await sock.sendMessage(jid, { text: withHints });
      }
    } else {
      sent = await sock.sendMessage(jid, { text: message });
    }
    try {
      if (typeof sock.sendPresenceUpdate === 'function') {
        await sock.sendPresenceUpdate('paused', jid);
      }
    } catch (_) { /* ignore */ }
    waMessageId = sent?.key?.id || null;
    if (waMessageId) {
      cacheOutboundMessage(jid, waMessageId, content);
      if (sent?.key?.remoteJid) {
        cacheOutboundMessage(sent.key.remoteJid, waMessageId, content);
      }
    }
    console.log(`[WhatsApp] sent tenant=${tid} to=${jid} id=${waMessageId || 'n/a'} lid=${isLidJid(jid)}`);
    await storeMessage({
      tenantId: tid,
      direction: 'out',
      phone: phoneFromJid(meta.phoneJid || phone || jid),
      jid,
      body: message,
      status: 'sent',
      event_type: meta.event_type || null,
      customer_name: meta.customer_name || null,
      wa_message_id: waMessageId,
    });
  } catch (err) {
    status = 'failed';
    errorMsg = err.message;
    await storeMessage({
      tenantId: tid,
      direction: 'out',
      phone: phoneFromJid(meta.phoneJid || phone || jid),
      jid,
      body: message,
      status: 'failed',
      event_type: meta.event_type || null,
      customer_name: meta.customer_name || null,
    });
    throw err;
  }
  return { used: true, status, error: errorMsg, jid, wa_message_id: waMessageId };
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

function sessionHasCreds(tenantId) {
  const dir = sessionDir(tenantId);
  try {
    if (!fs.existsSync(dir)) return false;
    // Baileys multi-file auth writes creds.json once paired.
    return fs.existsSync(path.join(dir, 'creds.json'));
  } catch {
    return false;
  }
}

/**
 * Re-open Baileys sockets after API restart.
 * Previously only rows with status=connected were restored — a crash mid-connect
 * left status=connecting forever and WhatsApp AI CRM stayed silent until manual QR.
 * Now restore any tenant that still has local creds (connected/connecting).
 */
async function restoreSessionsOnBoot() {
  ensureDir(SESSIONS_ROOT);
  const { WhatsAppConnection } = getModels();
  const rows = await WhatsAppConnection.findAll({
    where: { status: ['connected', 'connecting'] },
  });

  const seen = new Set();
  for (const row of rows) {
    const tid = Number(row.tenant_id);
    if (!tid || seen.has(tid)) continue;
    seen.add(tid);
    if (!sessionHasCreds(tid)) {
      // Stale connecting row without creds — mark disconnected so UI can re-pair.
      if (row.status === 'connecting') {
        await row.update({
          status: 'disconnected',
          last_error: 'Session expired — scan QR again',
        }).catch(() => {});
      }
      continue;
    }
    startSession(tid).catch((err) => {
      console.error(`[WhatsApp] restore tenant ${tid} failed:`, err.message);
    });
  }

  // Also pick up orphan session folders (creds on disk, no/odd DB row).
  try {
    const dirs = fs.readdirSync(SESSIONS_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => Number(d.name))
      .filter((n) => Number.isFinite(n) && n > 0);
    for (const tid of dirs) {
      if (seen.has(tid) || !sessionHasCreds(tid)) continue;
      seen.add(tid);
      startSession(tid).catch((err) => {
        console.error(`[WhatsApp] restore orphan tenant ${tid} failed:`, err.message);
      });
    }
  } catch (err) {
    console.warn('[WhatsApp] orphan session scan failed:', err.message);
  }
}

/**
 * Show WhatsApp "typing…" while AI is thinking (Baileys presence).
 * Fire-and-forget safe — never throws to caller.
 */
async function sendComposing(tenantId, phone, meta = {}) {
  const tid = normalizeTenantId(tenantId);
  const sock = activeSockets.get(tid);
  if (!sock) return false;
  try {
    let jid = meta.replyJid || meta.jid || null;
    if (!jid) jid = toJid(phone);
    if (!jid) return false;
    if (typeof sock.presenceSubscribe === 'function') {
      await sock.presenceSubscribe(jid).catch(() => {});
    }
    if (typeof sock.sendPresenceUpdate === 'function') {
      await sock.sendPresenceUpdate('composing', jid);
      return true;
    }
  } catch (err) {
    console.warn(`[WhatsApp] composing tenant=${tid}:`, err.message);
  }
  return false;
}

module.exports = {
  startSession,
  stopSession,
  getStatus,
  isConnected,
  sendViaQr,
  sendComposing,
  listMessages,
  restoreSessionsOnBoot,
  toJid,
};
