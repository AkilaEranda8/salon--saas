import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'add_service_modal.dart';
import '../models/salon_service.dart';
import '../state/app_state.dart';

// ── Palette ───────────────────────────────────────────────────────────────────
const Color _forest  = Color(0xFF1B3A2D);
const Color _emerald = Color(0xFF2D6A4F);
const Color _canvas  = Color(0xFFF2F5F2);
const Color _surface = Color(0xFFFFFFFF);
const Color _border  = Color(0xFFE5E7EB);
const Color _ink     = Color(0xFF111827);
const Color _muted   = Color(0xFF6B7280);

// ── Category colour map ───────────────────────────────────────────────────────
List<Color> _catColors(String cat) {
  final c = cat.toLowerCase();
  if (c.contains('hair')) { return [const Color(0xFF7C3AED), const Color(0xFFA78BFA)]; }
  if (c.contains('nail')) { return [const Color(0xFF9D174D), const Color(0xFFEC4899)]; }
  if (c.contains('skin') || c.contains('facial')) {
    return [const Color(0xFF92400E), const Color(0xFFC9956C)];
  }
  if (c.contains('massage') || c.contains('body')) {
    return [const Color(0xFF065F46), const Color(0xFF059669)];
  }
  if (c.contains('wax')) { return [const Color(0xFF1E3A8A), const Color(0xFF2563EB)]; }
  if (c.contains('brow') || c.contains('lash')) {
    return [const Color(0xFF831843), const Color(0xFFF43F5E)];
  }
  // default — forest green
  return [_forest, _emerald];
}

// ─────────────────────────────────────────────────────────────────────────────
class ServicesPage extends StatefulWidget {
  const ServicesPage({super.key});
  @override
  State<ServicesPage> createState() => _ServicesPageState();
}

class _ServicesPageState extends State<ServicesPage> {
  Future<void>? _future;
  final _searchCtrl = TextEditingController();
  bool _searching = false;
  String _query = '';

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

  Future<void> _load() => AppStateScope.of(context).loadServices();

  void _refresh() => setState(() {
    _future = _load();
    _searchCtrl.clear();
    _query = '';
    _searching = false;
  });

  Future<void> _addService() async {
    final appState = AppStateScope.of(context);
    final cats = <String>{};
    for (final s in appState.services) {
      final c = s.category.trim();
      if (c.isNotEmpty) cats.add(c);
    }
    if (cats.isEmpty) cats.add('Other');

    final showCommission =
        appState.isTenantFeatureEnabled('service_wise_commission');
    final payload = await AddServiceModal.show(
      context,
      categories: cats.toList()..sort(),
      showServiceWiseCommission: showCommission,
    );
    if (payload == null || !mounted) return;

    final ok = await appState.addService(
      name: payload.name,
      category: payload.category,
      durationMinutes: payload.durationMinutes,
      price: payload.price,
      description: payload.description,
      commissionType: payload.commissionType,
      commissionValue: payload.commissionValue,
    );
    if (!mounted) return;
    if (!ok) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(appState.lastError ?? 'Failed to save service'),
        behavior: SnackBarBehavior.floating,
        backgroundColor: _forest,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ));
      return;
    }
    setState(() => _future = _load());
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark,
      child: Scaffold(
        backgroundColor: _canvas,
      body: FutureBuilder<void>(
        future: _future,
        builder: (context, snapshot) {
            final appState = AppStateScope.of(context);
          if (snapshot.connectionState != ConnectionState.done) {
              return _buildLoading();
          }
          if (snapshot.hasError) {
              return _buildError();
            }
            final all = appState.services;
            final list = _query.isEmpty
                ? all
                : all.where((s) =>
                    s.name.toLowerCase().contains(_query) ||
                    s.category.toLowerCase().contains(_query)).toList();
            return _buildBody(
              all,
              list,
              showCommission: appState
                  .isTenantFeatureEnabled('service_wise_commission'),
            );
          },
        ),
        floatingActionButton: Padding(
          padding: const EdgeInsets.only(bottom: 16, right: 4),
          child: GestureDetector(
            onTap: _addService,
            child: Container(
              height: 52,
              padding: const EdgeInsets.symmetric(horizontal: 20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [_forest, _emerald],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight),
                borderRadius: BorderRadius.circular(16),
                boxShadow: [BoxShadow(
                  color: _forest.withValues(alpha: 0.35),
                  blurRadius: 16, offset: const Offset(0, 6))],
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.add_rounded, color: Colors.white, size: 20),
                  SizedBox(width: 7),
                  Text('Add Service',
                    style: TextStyle(
                      color: Colors.white, fontSize: 14,
                      fontWeight: FontWeight.w800, letterSpacing: 0.1)),
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
      total: 0, active: 0, loading: true,
      onBack: () => Navigator.of(context).maybePop(),
      onRefresh: null, searching: false,
      searchCtrl: _searchCtrl, onSearch: null, onSearchToggle: () {},
    ),
    const Expanded(
      child: Center(
        child: CircularProgressIndicator(color: _forest, strokeWidth: 2.5)),
    ),
  ]);

  // ── Error ──────────────────────────────────────────────────────────────────
  Widget _buildError() => Column(children: [
    _Header(
      total: 0, active: 0, loading: false,
      onBack: () => Navigator.of(context).maybePop(),
      onRefresh: _refresh, searching: false,
      searchCtrl: _searchCtrl, onSearch: null, onSearchToggle: () {},
    ),
    Expanded(child: Center(
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
        const Text('Failed to load services',
          style: TextStyle(color: _ink, fontWeight: FontWeight.w700, fontSize: 15)),
        const SizedBox(height: 6),
        GestureDetector(
          onTap: _refresh,
          child: const Text('Tap to retry',
            style: TextStyle(color: _emerald, fontSize: 13,
                fontWeight: FontWeight.w600)),
        ),
      ]),
    )),
  ]);

  // ── Body ──────────────────────────────────────────────────────────────────
  Widget _buildBody(
    List<SalonService> all,
    List<SalonService> list, {
    required bool showCommission,
  }) {
    final active = all.where((s) => s.isActive).length;
    return Column(children: [
      _Header(
        total: all.length, active: active, loading: false,
        onBack: () => Navigator.of(context).maybePop(),
        onRefresh: _refresh, searching: _searching,
        searchCtrl: _searchCtrl,
        onSearch: (q) => setState(() => _query = q.toLowerCase()),
        onSearchToggle: () => setState(() {
          _searching = !_searching;
          if (!_searching) { _searchCtrl.clear(); _query = ''; }
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
                  itemBuilder: (ctx, i) => _ServiceCard(
                    service: list[i],
                    showCommission: showCommission,
                  ),
                ),
              ),
      ),
    ]);
  }

  // ── Empty ──────────────────────────────────────────────────────────────────
  Widget _buildEmpty() {
    final searching = _query.isNotEmpty;
    return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
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
          searching ? Icons.search_off_rounded : Icons.content_cut_rounded,
          color: _forest, size: 30),
      ),
      const SizedBox(height: 16),
      Text(
        searching ? 'No services match your search' : 'No services yet',
        style: const TextStyle(
            color: _ink, fontSize: 16, fontWeight: FontWeight.w700)),
      const SizedBox(height: 6),
      Text(
        searching ? 'Try a different name or category'
                  : 'Tap + to add your first service',
        style: const TextStyle(color: _muted, fontSize: 13)),
    ]));
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// HEADER
// ═════════════════════════════════════════════════════════════════════════════
class _Header extends StatelessWidget {
  const _Header({
    required this.total, required this.active, required this.loading,
    required this.onBack, required this.onRefresh,
    required this.searching, required this.searchCtrl,
    required this.onSearch, required this.onSearchToggle,
  });

  final int total, active;
  final bool loading, searching;
  final VoidCallback onBack;
  final VoidCallback? onRefresh;
  final TextEditingController searchCtrl;
  final ValueChanged<String>? onSearch;
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
              GestureDetector(
                onTap: onBack,
                child: Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle, color: _surface,
                    boxShadow: [BoxShadow(
                      color: Colors.black.withValues(alpha: 0.07),
                      blurRadius: 8, offset: const Offset(0, 2))],
                  ),
                  child: const Icon(Icons.arrow_back_ios_new_rounded,
                      color: _forest, size: 15),
                ),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Row(children: [
                  Icon(Icons.content_cut_rounded, color: _forest, size: 16),
                  SizedBox(width: 6),
                  Text('Services',
                    style: TextStyle(
                      color: _forest, fontSize: 16,
                      fontWeight: FontWeight.w800, letterSpacing: -0.3)),
                ]),
              ),
              if (onRefresh != null)
                _IconBtn(icon: Icons.refresh_rounded, onTap: onRefresh!),
              if (onSearch != null) ...[
                const SizedBox(width: 6),
                _IconBtn(
                  icon: searching
                      ? Icons.search_off_rounded : Icons.search_rounded,
                  onTap: onSearchToggle),
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
                            style: const TextStyle(color: _ink, fontSize: 14),
                            decoration: const InputDecoration(
                              border: InputBorder.none,
                              hintText: 'Search name or category…',
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

          // ── Stats card ───────────────────────────────────────────────
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
                // Total
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Total Services',
                        style: TextStyle(
                            color: Colors.white70, fontSize: 12,
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
                                color: Colors.white, fontSize: 26,
                                fontWeight: FontWeight.w900,
                                letterSpacing: -0.5)),
                      const SizedBox(height: 2),
                      const Text('services & products',
                        style: TextStyle(
                            color: Colors.white54, fontSize: 11.5,
                            fontWeight: FontWeight.w500)),
                    ],
                  ),
                ),
                // Divider
                Container(
                  width: 1, height: 40,
                  color: Colors.white.withValues(alpha: 0.20),
                  margin: const EdgeInsets.symmetric(horizontal: 16)),
                // Active
                Column(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    const Text('Active',
                      style: TextStyle(
                          color: Colors.white70, fontSize: 11,
                          fontWeight: FontWeight.w600)),
                    const SizedBox(height: 4),
                    loading
                        ? Container(
                            width: 32, height: 20,
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(6)))
                        : Text('$active',
                            style: const TextStyle(
                              color: Colors.white, fontSize: 20,
                              fontWeight: FontWeight.w800)),
                  ],
                ),
                const SizedBox(width: 16),
                Container(
                  width: 48, height: 48,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(14)),
                  child: const Icon(Icons.content_cut_rounded,
                      color: Colors.white, size: 22),
                ),
              ]),
            ),
          ),

        ]),
      ),
    );
  }
}

// ── Icon button ───────────────────────────────────────────────────────────────
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
        color: _surface, shape: BoxShape.circle,
        boxShadow: [BoxShadow(
          color: Colors.black.withValues(alpha: 0.07),
          blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Icon(icon, color: _forest, size: 17),
    ),
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SERVICE CARD
// ═════════════════════════════════════════════════════════════════════════════
class _ServiceCard extends StatelessWidget {
  const _ServiceCard({
    required this.service,
    this.showCommission = false,
  });
  final SalonService service;
  final bool showCommission;

  String? _commissionLabel() {
    if (!showCommission) return null;
    final v = service.commissionValue;
    if (v == null) return null;
    if (service.commissionType == 'fixed') {
      return 'Comm Rs.${v.toStringAsFixed(0)}';
    }
    return 'Comm ${v.toStringAsFixed(v.truncateToDouble() == v ? 0 : 1)}%';
  }

  @override
  Widget build(BuildContext context) {
    final grad = _catColors(service.category);

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

          // Icon circle
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
            child: const Icon(Icons.content_cut_rounded,
                color: Colors.white, size: 20),
          ),

          const SizedBox(width: 14),

          // Info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Expanded(
                    child: Text(service.name,
                      style: const TextStyle(
                        color: _ink, fontSize: 15,
                        fontWeight: FontWeight.w800, letterSpacing: -0.1)),
                  ),
                  // Active badge
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: service.isActive
                          ? const Color(0xFFDCFCE7)
                          : const Color(0xFFF3F4F6),
                      borderRadius: BorderRadius.circular(6)),
                    child: Text(
                      service.isActive ? 'Active' : 'Inactive',
                      style: TextStyle(
                        color: service.isActive
                            ? const Color(0xFF14532D)
                            : _muted,
                        fontSize: 10.5,
                        fontWeight: FontWeight.w700)),
                  ),
                ]),
                const SizedBox(height: 5),
                Row(children: [
                  // Category chip
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 7, vertical: 3),
                    decoration: BoxDecoration(
                      color: grad[0].withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(6)),
                    child: Text(service.category,
                      style: TextStyle(
                        color: grad[0],
                        fontSize: 11,
                        fontWeight: FontWeight.w700)),
                  ),
                  const SizedBox(width: 8),
                  // Duration
                  const Icon(Icons.schedule_rounded,
                      size: 12, color: _muted),
                  const SizedBox(width: 3),
                  Text('${service.durationMinutes} min',
                    style: const TextStyle(
                        color: _muted, fontSize: 12,
                        fontWeight: FontWeight.w500)),
                  if (_commissionLabel() != null) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 7, vertical: 3),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFFFBEB),
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(
                            color: const Color(0xFFFDE68A)),
                      ),
                      child: Text(
                        _commissionLabel()!,
                        style: const TextStyle(
                          color: Color(0xFFB45309),
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ]),
              ],
            ),
          ),

          const SizedBox(width: 10),

          // Price
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('LKR',
                style: TextStyle(
                  color: _forest.withValues(alpha: 0.60),
                  fontSize: 10,
                  fontWeight: FontWeight.w700)),
              Text(service.price.toStringAsFixed(0),
                style: const TextStyle(
                  color: _forest,
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                  letterSpacing: -0.5)),
            ],
          ),

        ]),
      ),
    );
  }
}
