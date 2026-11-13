const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { resolveSocketWhatsAppTenant } = require('./utils/whatsappTenantAccess');

let io;

function initSocket(httpServer, corsOptions) {
  io = new Server(httpServer, {
    cors: corsOptions,
  });

  // Authenticate every Socket.io connection — supports legacy JWT and KC access tokens
  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.cookie
        ?.split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('token='))
        ?.split('=')[1];

    if (!token) return next(new Error('Authentication required.'));

    // Try legacy JWT first
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
      if (socket.user.tenantId == null && socket.user.tenant_id != null) {
        socket.user.tenantId = socket.user.tenant_id;
      }
      return next();
    } catch { /* not a legacy token */ }

    // Fall back: decode KC/OIDC token without signature check (socket only sends refresh signals)
    try {
      const decoded = jwt.decode(token);
      if (!decoded) return next(new Error('Invalid token.'));
      socket.user = {
        id:       decoded.db_user_id ? Number(decoded.db_user_id) : null,
        username: decoded.preferred_username ?? null,
        role:     decoded.salon_role ?? null,
        branchId: decoded.branch_id  ? Number(decoded.branch_id)  : null,
        tenantId: decoded.tenant_id  ? Number(decoded.tenant_id)  : null,
      };
      return next();
    } catch {
      return next(new Error('Invalid or expired token.'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('join', ({ branchId }) => {
      // Only allow joining a branch the user belongs to (or superadmin/admin can join any)
      const userBranchId = socket.user?.branchId;
      const role = socket.user?.role;
      const allowedRoles = ['superadmin', 'admin'];
      if (!branchId) return;
      if (allowedRoles.includes(role) || String(userBranchId) === String(branchId)) {
        socket.join('branch_' + branchId);
      }
    });

    socket.on('whatsapp:join', (payload = {}) => {
      const tenantId = resolveSocketWhatsAppTenant(socket, payload);
      if (!tenantId) return;
      socket.whatsappTenantId = tenantId;
      socket.join(`whatsapp_tenant_${tenantId}`);
    });

    socket.on('crm:join', (payload = {}) => {
      const tenantId = resolveSocketWhatsAppTenant(socket, payload)
        || socket.user?.tenantId
        || socket.user?.tenant_id
        || null;
      if (!tenantId) return;
      // Staff inbox: any authenticated tenant user can join their CRM room
      if (socket.user?.role === 'platform_admin' && payload?.tenantId) {
        socket.join(`crm_tenant_${Number(payload.tenantId)}`);
        return;
      }
      socket.join(`crm_tenant_${Number(tenantId)}`);
    });
  });

  return io;
}

function emitQueueUpdate(branchId, data) {
  if (io) {
    io.to('branch_' + branchId).emit('queue:updated', data);
  }
}

function getIO() {
  return io;
}

module.exports = { initSocket, emitQueueUpdate, getIO };
