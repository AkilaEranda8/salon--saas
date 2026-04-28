import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'add_customer_modal.dart';
import 'customer_history_page.dart';
import '../models/customer.dart';
import '../models/staff_user.dart';
import '../state/app_state.dart';

// ── Palette — mirrors dashboard tokens ───────────────────────────────────────
const Color _ink     = Color(0xFF111827);
const Color _forest  = Color(0xFF1B3A2D);
const Color _emerald = Color(0xFF2D6A4F);
const Color _canvas  = Color(0xFFF2F5F2);
const Color _surface = Color(0xFFFFFFFF);
const Color _border  = Color(0xFFE5E7EB);
const Color _muted   = Color(0xFF6B7280);

// ─────────────────────────────────────────────────────────────────────────────
class CustomersPage extends StatefulWidget {
  const CustomersPage({super.key});

  @override
  State<CustomersPage> createState() => _CustomersPageState();
}

class _CustomersPageState extends State<CustomersPage> {
  Future<List<Customer>>? _future;
  List<Customer> _all = [];
  List<Customer> _filtered = [];
  final _searchCtrl = TextEditingController();
  bool _searching = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _future ??= _load();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<List<Customer>> _load() async {
    final appState = AppStateScope.of(context);
    // Use cached list if already loaded; hit API only when empty or on refresh
    if (appState.customers.isNotEmpty) return appState.customers;
    return appState.loadCustomers();
  }

  void _refresh() {
    setState(() {
      // Force API reload by clearing search and calling loadCustomers directly
      _future = AppStateScope.of(context).loadCustomers();
      _searchCtrl.clear();
      _searching = false;
    });
  }

  void _onSearch(String q) {
    final lower = q.toLowerCase();
    setState(() {
      _filtered = _all.where((c) =>
        c.name.toLowerCase().contains(lower) ||
        c.phone.contains(lower) ||
        c.email.toLowerCase().contains(lower)).toList();
    });
  }

  Future<void> _showAdd() async {
    final appState = AppStateScope.of(context);
    List<Map<String, String>> branchOptions = const [];
    final fixedBranchId = appState.currentUser?.branchId;
    if (fixedBranchId == null || fixedBranchId.isEmpty) {
      try {
        if (appState.branches.isEmpty) await appState.loadBranches();
        branchOptions = appState.branches;
      } catch (_) {
        if (!mounted) return;
        _toast(appState.lastError ?? 'Failed to load branches');
        return;
      }
    } else {
      final existing = appState.branches.firstWhere(
        (b) => b['id'] == fixedBranchId,
        orElse: () => {'id': fixedBranchId, 'name': 'My Branch'},
      );
      branchOptions = [existing];
    }
    if (!mounted) return;

    final payload = await AddCustomerModal.show(
      context, branches: branchOptions, initialBranchId: fixedBranchId);
    if (payload == null || !mounted) return;

    final ok = await appState.addCustomer(
      name: payload.name, phone: payload.phone,
      email: payload.email, branchId: payload.branchId);
    if (!mounted) return;
    if (!ok) _toast(appState.lastError ?? 'Failed to add customer');
    _refresh();
  }

  void _toast(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        backgroundColor: _forest,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final appState = AppStateScope.of(context);
    final allowed  = appState.hasPermission(StaffPermission.canViewCustomers);

    if (!allowed) {
      return Scaffold(
        backgroundColor: _canvas,
        body: SafeArea(
          child: Center(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Container(
                width: 64, height: 64,
                decoration: BoxDecoration(
                  color: _forest.withValues(alpha: 0.08),
                  shape: BoxShape.circle),
                child: const Icon(Icons.lock_outline_rounded,
                    color: _forest, size: 28),
              ),
              const SizedBox(height: 16),
              const Text('No permission to view customers.',
                style: TextStyle(color: _muted, fontSize: 14)),
            ]),
          ),
        ),
      );
    }

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark,
      child: Scaffold(
        backgroundColor: _canvas,
        body: FutureBuilder<List<Customer>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return _buildLoading();
            }
            if (snapshot.hasError) {
              return _buildError();
            }
            _all = snapshot.data ?? [];
            final list = _searchCtrl.text.isEmpty ? _all : _filtered;
            return _buildBody(list);
          },
        ),
        floatingActionButton: Padding(
          padding: const EdgeInsets.only(bottom: 16, right: 4),
          child: GestureDetector(
            onTap: _showAdd,
            child: Container(
              height: 52,
              padding: const EdgeInsets.symmetric(horizontal: 20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [_forest, _emerald],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight),
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(
                    color: _forest.withValues(alpha: 0.35),
                    blurRadius: 16,
                    offset: const Offset(0, 6)),
                ],
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.person_add_rounded,
                      color: Colors.white, size: 18),
                  SizedBox(width: 8),
                  Text('Add Customer',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.1)),
                ],
              ),
            ),
          ),
        ),
        floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
      ),
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  Widget _buildLoading() => Column(children: [
    _Header(
      total: 0, loading: true,
      onBack: () => Navigator.of(context).maybePop(),
      onRefresh: null, onSearch: null,
      searchCtrl: _searchCtrl, searching: _searching,
      onSearchToggle: () {},
    ),
    const Expanded(
      child: Center(
        child: CircularProgressIndicator(color: _forest, strokeWidth: 2.5),
      ),
    ),
  ]);

  // ── Error ──────────────────────────────────────────────────────────────────
  Widget _buildError() => Column(children: [
    _Header(
      total: 0, loading: false,
      onBack: () => Navigator.of(context).maybePop(),
      onRefresh: _refresh, onSearch: null,
      searchCtrl: _searchCtrl, searching: _searching,
      onSearchToggle: () {},
    ),
    Expanded(
      child: Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 60, height: 60,
            decoration: BoxDecoration(
              color: const Color(0xFFFEF2F2),
              borderRadius: BorderRadius.circular(16)),
            child: const Icon(Icons.wifi_off_rounded,
                color: Color(0xFFDC2626), size: 26),
          ),
          const SizedBox(height: 14),
          const Text('Failed to load customers',
            style: TextStyle(color: _ink, fontWeight: FontWeight.w700, fontSize: 15)),
          const SizedBox(height: 6),
          GestureDetector(
            onTap: _refresh,
            child: const Text('Tap to retry',
              style: TextStyle(color: _emerald, fontSize: 13,
                  fontWeight: FontWeight.w600)),
          ),
        ]),
      ),
    ),
  ]);

  // ── Main body ──────────────────────────────────────────────────────────────
  Widget _buildBody(List<Customer> list) {
    return Column(children: [
      _Header(
        total: _all.length, loading: false,
        onBack: () => Navigator.of(context).maybePop(),
        onRefresh: _refresh,
        onSearch: _onSearch,
        searchCtrl: _searchCtrl, searching: _searching,
        onSearchToggle: () => setState(() {
          _searching = !_searching;
          if (!_searching) { _searchCtrl.clear(); _filtered = []; }
        }),
      ),
      Expanded(
        child: list.isEmpty
            ? _buildEmpty()
            : RefreshIndicator(
                color: _forest,
                onRefresh: () async => _refresh(),
                child: ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 88),
                  itemCount: list.length,
                  itemBuilder: (ctx, i) => GestureDetector(
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => CustomerHistoryPage(customer: list[i]))),
                    child: _CustomerCard(customer: list[i], index: i),
                  ),
                ),
              ),
      ),
    ]);
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  Widget _buildEmpty() {
    final searching = _searchCtrl.text.isNotEmpty;
    return Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: 72, height: 72,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [_forest.withValues(alpha: 0.12),
                       _emerald.withValues(alpha: 0.06)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight),
            shape: BoxShape.circle),
          child: Icon(
            searching ? Icons.search_off_rounded : Icons.people_outline_rounded,
            color: _forest, size: 30),
        ),
        const SizedBox(height: 16),
        Text(
          searching ? 'No customers match your search'
                    : 'No customers yet',
          style: const TextStyle(
            color: _ink, fontSize: 16, fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        Text(
          searching ? 'Try a different name or phone number'
                    : 'Tap + to add your first customer',
          style: const TextStyle(color: _muted, fontSize: 13)),
        if (!searching) ...[
          const SizedBox(height: 20),
          GestureDetector(
            onTap: _showAdd,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 11),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [_forest, _emerald],
                  begin: Alignment.centerLeft,
                  end: Alignment.centerRight),
                borderRadius: BorderRadius.circular(12),
                boxShadow: [BoxShadow(
                  color: _forest.withValues(alpha: 0.25),
                  blurRadius: 10, offset: const Offset(0, 4))],
              ),
              child: const Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(Icons.person_add_rounded, color: Colors.white, size: 16),
                SizedBox(width: 8),
                Text('Add Customer',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 14)),
              ]),
            ),
          ),
        ],
      ]),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// HEADER
// ═════════════════════════════════════════════════════════════════════════════
class _Header extends StatelessWidget {
  const _Header({
    required this.total, required this.loading,
    required this.onBack,
    required this.onRefresh, required this.onSearch,
    required this.searchCtrl, required this.searching,
    required this.onSearchToggle,
  });

  final int total;
  final bool loading, searching;
  final VoidCallback onBack;
  final VoidCallback? onRefresh;
  final ValueChanged<String>? onSearch;
  final TextEditingController searchCtrl;
  final VoidCallback onSearchToggle;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: _canvas,
      child: SafeArea(
        bottom: false,
        child: Column(children: [

          // ── Top bar ──────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 16, 8),
            child: Row(children: [
              // Back
              GestureDetector(
                onTap: onBack,
                child: Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: _surface,
                    boxShadow: [BoxShadow(
                      color: Colors.black.withValues(alpha: 0.07),
                      blurRadius: 8, offset: const Offset(0, 2))],
                  ),
                  child: const Icon(Icons.arrow_back_ios_new_rounded,
                      color: _forest, size: 15),
                ),
              ),
              const SizedBox(width: 12),
              // Title
              const Expanded(
                child: Row(children: [
                  Icon(Icons.people_rounded, color: _forest, size: 16),
                  SizedBox(width: 6),
                  Text('Customers',
                    style: TextStyle(
                      color: _forest,
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.3)),
                ]),
              ),
              // Actions
              if (onRefresh != null)
                _IconBtn(
                  icon: Icons.refresh_rounded,
                  onTap: onRefresh!,
                ),
              if (onSearch != null) ...[
                const SizedBox(width: 6),
                _IconBtn(
                  icon: searching
                      ? Icons.search_off_rounded
                      : Icons.search_rounded,
                  onTap: onSearchToggle,
                ),
              ],
            ]),
          ),

          // ── Search bar ───────────────────────────────────────────────
          AnimatedSize(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeInOut,
            child: searching
                ? Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                    child: Container(
                      height: 42,
                      decoration: BoxDecoration(
                        color: _surface,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: _border),
                        boxShadow: [BoxShadow(
                          color: Colors.black.withValues(alpha: 0.04),
                          blurRadius: 6, offset: const Offset(0, 2))],
                      ),
                      child: Row(children: [
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 12),
                          child: Icon(Icons.search_rounded,
                              color: _muted, size: 18),
                        ),
                        Expanded(
                          child: TextField(
                            controller: searchCtrl,
                            autofocus: true,
                            onChanged: onSearch,
                            style: const TextStyle(
                              color: _ink, fontSize: 14),
                            decoration: const InputDecoration(
                              border: InputBorder.none,
                              hintText: 'Search name, phone, email…',
                              hintStyle: TextStyle(
                                color: Color(0xFFB0B8B0), fontSize: 14)),
                          ),
                        ),
                        if (searchCtrl.text.isNotEmpty)
                          GestureDetector(
                            onTap: () {
                              searchCtrl.clear();
                              onSearch?.call('');
                            },
                            child: const Padding(
                              padding: EdgeInsets.symmetric(horizontal: 12),
                              child: Icon(Icons.close_rounded,
                                  color: _muted, size: 17),
                            ),
                          ),
                      ]),
                    ),
                  )
                : const SizedBox.shrink(),
          ),

          // ── Stats gradient card ──────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(18, 14, 18, 14),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [_forest, _emerald],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight),
                borderRadius: BorderRadius.circular(18),
                boxShadow: [BoxShadow(
                  color: _forest.withValues(alpha: 0.30),
                  blurRadius: 16, offset: const Offset(0, 6))],
              ),
              child: Row(children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Total Clients',
                        style: TextStyle(
                          color: Colors.white70,
                          fontSize: 12,
                          fontWeight: FontWeight.w600)),
                      const SizedBox(height: 4),
                      loading
                          ? Container(
                              width: 48, height: 24,
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(6)))
                          : Text('$total',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 26,
                                fontWeight: FontWeight.w900,
                                letterSpacing: -0.5)),
                      const SizedBox(height: 2),
                      const Text('registered customers',
                        style: TextStyle(
                          color: Colors.white54,
                          fontSize: 11.5,
                          fontWeight: FontWeight.w500)),
                    ],
                  ),
                ),
                Container(
                  width: 52, height: 52,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(14)),
                  child: const Icon(Icons.people_alt_rounded,
                      color: Colors.white, size: 24),
                ),
              ]),
            ),
          ),
        ]),
      ),
    );
  }
}

// ── Small icon button ─────────────────────────────────────────────────────────
class _IconBtn extends StatelessWidget {
  const _IconBtn({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      width: 36, height: 36,
      decoration: BoxDecoration(
        color: _surface,
        shape: BoxShape.circle,
        boxShadow: [BoxShadow(
          color: Colors.black.withValues(alpha: 0.07),
          blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Icon(icon, color: _forest, size: 17),
    ),
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CUSTOMER CARD
// ═════════════════════════════════════════════════════════════════════════════
class _CustomerCard extends StatelessWidget {
  const _CustomerCard({required this.customer, required this.index});
  final Customer customer;
  final int index;

  // Cycle through accent colours for avatars
  static const _avatarGradients = [
    [Color(0xFF1B3A2D), Color(0xFF2D6A4F)],   // forest green
    [Color(0xFF1E3A8A), Color(0xFF2563EB)],   // sapphire
    [Color(0xFF7C3AED), Color(0xFFA78BFA)],   // violet
    [Color(0xFF9D174D), Color(0xFFEC4899)],   // rose
    [Color(0xFF92400E), Color(0xFFC9956C)],   // amber/gold
    [Color(0xFF065F46), Color(0xFF059669)],   // emerald
  ];

  @override
  Widget build(BuildContext context) {
    final grad = _avatarGradients[index % _avatarGradients.length];
    final name = customer.name.trim();
    final initials = name.isNotEmpty
        ? name.split(' ').map((e) => e.isNotEmpty ? e[0].toUpperCase() : '')
              .take(2).join()
        : '?';

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _border),
        boxShadow: [BoxShadow(
          color: Colors.black.withValues(alpha: 0.05),
          blurRadius: 8, offset: const Offset(0, 3))],
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        child: Row(children: [

          // Avatar
          Container(
            width: 48, height: 48,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: grad,
                begin: Alignment.topLeft,
                end: Alignment.bottomRight),
              shape: BoxShape.circle,
              boxShadow: [BoxShadow(
                color: grad[0].withValues(alpha: 0.28),
                blurRadius: 8, offset: const Offset(0, 3))],
            ),
            child: Center(
              child: Text(initials,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.w800)),
            ),
          ),

          const SizedBox(width: 14),

          // Info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name.isNotEmpty ? name : 'Unknown',
                  style: const TextStyle(
                    color: _ink,
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.1)),
                const SizedBox(height: 5),
                if (customer.phone.isNotEmpty)
                  _InfoRow(
                    icon: Icons.phone_outlined,
                    text: customer.phone),
                if (customer.email.isNotEmpty)
                  _InfoRow(
                    icon: Icons.mail_outline_rounded,
                    text: customer.email),
              ],
            ),
          ),

          // Arrow
          Container(
            width: 28, height: 28,
            decoration: BoxDecoration(
              color: _forest.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(8)),
            child: const Icon(Icons.chevron_right_rounded,
                color: _forest, size: 17),
          ),

        ]),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 2),
    child: Row(children: [
      Icon(icon, size: 12, color: _muted),
      const SizedBox(width: 4),
      Expanded(
        child: Text(text,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            color: _muted,
            fontSize: 12.5,
            fontWeight: FontWeight.w500)),
      ),
    ]),
  );
}
