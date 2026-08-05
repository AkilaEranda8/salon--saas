import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../../models/models.dart';
import '../../state/app_state.dart';
import '../../theme/app_motion.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common.dart';

class BookFlowPage extends StatefulWidget {
  const BookFlowPage({super.key});

  @override
  State<BookFlowPage> createState() => _BookFlowPageState();
}

class _BookFlowPageState extends State<BookFlowPage> {
  int _step = 1;
  List<SalonService> _services = [];
  List<SalonStaff> _staff = [];
  List<String> _slots = [];
  String? _category;
  SalonService? _service;
  SalonStaff? _staffMember;
  DateTime _day = DateTime.now().add(const Duration(days: 1));
  String? _slot;
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _otp = TextEditingController();
  bool _needsOtp = false;
  bool _otpVerified = false;
  bool _loading = true;
  bool _busy = false;
  bool _success = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final p = AppStateScope.of(context).profile;
      if (p != null) {
        _name.text = p.name;
        _phone.text = p.phone;
      }
      _loadServices();
    });
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _otp.dispose();
    super.dispose();
  }

  Future<void> _loadServices() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final rows = await AppStateScope.of(context).api.getServices();
      if (!mounted) return;
      setState(() {
        _services = rows;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  List<String> get _categories {
    final set = <String>{};
    for (final s in _services) {
      final c = (s.category ?? '').trim();
      set.add(c.isEmpty ? 'Other' : c);
    }
    final list = set.toList()..sort();
    return list;
  }

  List<SalonService> get _filteredServices {
    if (_category == null) return _services;
    return _services.where((s) {
      final c = (s.category ?? '').trim();
      final label = c.isEmpty ? 'Other' : c;
      return label == _category;
    }).toList();
  }

  Future<void> _loadStaff() async {
    if (_service == null) return;
    setState(() {
      _busy = true;
      _error = null;
      _staff = [];
      _staffMember = null;
    });
    try {
      final date = DateFormat('yyyy-MM-dd').format(_day);
      final rows = await AppStateScope.of(context).api.getStaff(
            serviceId: _service!.id,
            date: date,
          );
      if (!mounted) return;
      setState(() {
        _staff = rows;
        _busy = false;
        _step = 2;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _loadSlots() async {
    if (_service == null || _staffMember == null) return;
    setState(() {
      _busy = true;
      _error = null;
      _slots = [];
      _slot = null;
    });
    try {
      final date = DateFormat('yyyy-MM-dd').format(_day);
      final rows = await AppStateScope.of(context).api.getAvailability(
            staffId: _staffMember!.id,
            date: date,
            duration: _service!.durationMinutes,
          );
      if (!mounted) return;
      setState(() {
        _slots = rows;
        _busy = false;
        _step = 3;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _prepareConfirm() async {
    setState(() {
      _step = 4;
      _error = null;
      _needsOtp = false;
      _otpVerified = false;
      _otp.clear();
    });
  }

  Future<void> _checkPhoneAndSubmit() async {
    final name = _name.text.trim();
    final phone = _phone.text.trim();
    if (name.isEmpty || phone.isEmpty) {
      setState(() => _error = 'Name and phone are required.');
      return;
    }
    if (_service == null || _staffMember == null || _slot == null) return;

    setState(() {
      _busy = true;
      _error = null;
    });

    final api = AppStateScope.of(context).api;
    try {
      if (!_otpVerified) {
        final check = await api.checkPhone(phone);
        final needs = check['needs_otp'] == true;
        if (needs && !_otpVerified) {
          if (!_needsOtp) {
            final otpRes = await api.requestBookingOtp(phone);
            if (!mounted) return;
            setState(() {
              _needsOtp = true;
              _busy = false;
              if (otpRes['debug_otp'] != null) {
                _error = 'Dev OTP: ${otpRes['debug_otp']}';
              }
            });
            return;
          }
          final otp = _otp.text.trim();
          if (otp.length < 4) {
            setState(() {
              _busy = false;
              _error = 'Enter the OTP sent to your phone.';
            });
            return;
          }
          await api.verifyBookingOtp(phone: phone, otp: otp);
          _otpVerified = true;
        } else {
          _otpVerified = true;
          if (check['name'] != null && _name.text.trim().isEmpty) {
            _name.text = '${check['name']}';
          }
        }
      }

      await api.createBooking(
        customerName: name,
        phone: phone,
        serviceId: _service!.id,
        staffId: _staffMember!.id,
        date: DateFormat('yyyy-MM-dd').format(_day),
        time: _slot!,
      );

      if (!mounted) return;
      setState(() {
        _busy = false;
        _success = true;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  void _reset() {
    setState(() {
      _step = 1;
      _service = null;
      _staffMember = null;
      _slot = null;
      _slots = [];
      _staff = [];
      _needsOtp = false;
      _otpVerified = false;
      _success = false;
      _error = null;
      _otp.clear();
      _day = DateTime.now().add(const Duration(days: 1));
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_success) {
      return _SuccessView(onDone: _reset);
    }

    if (_loading) {
      return ListView(
        padding: const EdgeInsets.all(20),
        children: const [
          SoftSkeleton(height: 28, width: 160),
          SizedBox(height: 16),
          SoftSkeleton(),
          SizedBox(height: 12),
          SoftSkeleton(),
          SizedBox(height: 12),
          SoftSkeleton(),
        ],
      );
    }

    if (_error != null && _services.isEmpty) {
      return EmptyState(
        title: 'Couldn’t load services',
        subtitle: _error!,
        actionLabel: 'Retry',
        onAction: _loadServices,
      );
    }

    return Column(
      children: [
        Expanded(
          child: AnimatedSwitcher(
            duration: AppMotion.normal,
            switchInCurve: AppMotion.easeOut,
            switchOutCurve: Curves.easeIn,
            child: KeyedSubtree(
              key: ValueKey(_step),
              child: _buildStep(),
            ),
          ),
        ),
        _footer(),
      ],
    );
  }

  Widget _buildStep() {
    switch (_step) {
      case 1:
        return _serviceStep();
      case 2:
        return _staffStep();
      case 3:
        return _timeStep();
      default:
        return _confirmStep();
    }
  }

  Widget _serviceStep() {
    final cats = _categories;
    final items = _filteredServices;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
      children: [
        const StepHeader(
          step: 1,
          total: 4,
          title: 'Choose a service',
          subtitle: 'All active salon services are listed below.',
        ),
        const SizedBox(height: 16),
        if (cats.length > 1)
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                _chip('All', _category == null, () => setState(() => _category = null)),
                ...cats.map((c) => _chip(c, _category == c, () => setState(() => _category = c))),
              ],
            ),
          ),
        const SizedBox(height: 12),
        ...List.generate(items.length, (i) {
          final s = items[i];
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: 1),
              duration: Duration(milliseconds: 220 + i * 40),
              curve: AppMotion.easeOut,
              builder: (context, t, child) => Opacity(
                opacity: t,
                child: Transform.translate(offset: Offset(0, (1 - t) * 10), child: child),
              ),
              child: ServiceTile(
                service: s,
                selected: _service?.id == s.id,
                onTap: () => setState(() => _service = s),
              ),
            ),
          );
        }),
      ],
    );
  }

  Widget _chip(String label, bool selected, VoidCallback onTap) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(label),
        selected: selected,
        onSelected: (_) => onTap(),
        selectedColor: AppColors.blushSoft,
        labelStyle: TextStyle(
          color: selected ? AppColors.blushDeep : AppColors.inkSoft,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Widget _staffStep() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
      children: [
        const StepHeader(
          step: 2,
          total: 4,
          title: 'Choose a stylist',
          subtitle: 'Only staff available for this service are shown.',
        ),
        const SizedBox(height: 16),
        if (_busy)
          const Center(child: Padding(
            padding: EdgeInsets.all(24),
            child: CircularProgressIndicator(color: AppColors.blush),
          ))
        else if (_staff.isEmpty)
          const EmptyState(
            title: 'No stylists available',
            subtitle: 'Try another service or a different day.',
            icon: Icons.person_off_outlined,
          )
        else
          ..._staff.map((s) {
            final selected = _staffMember?.id == s.id;
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Material(
                color: selected ? AppColors.blushSoft : Colors.white,
                borderRadius: BorderRadius.circular(18),
                child: InkWell(
                  borderRadius: BorderRadius.circular(18),
                  onTap: () => setState(() => _staffMember = s),
                  child: Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: selected ? AppColors.blush : AppColors.line),
                    ),
                    child: Row(
                      children: [
                        CircleAvatar(
                          backgroundColor: AppColors.washTop,
                          backgroundImage: s.photoUrl != null && s.photoUrl!.isNotEmpty
                              ? NetworkImage(s.photoUrl!)
                              : null,
                          child: s.photoUrl == null || s.photoUrl!.isEmpty
                              ? Text(s.name.isNotEmpty ? s.name[0].toUpperCase() : '?')
                              : null,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(s.name, style: Theme.of(context).textTheme.titleMedium),
                        ),
                        Icon(
                          selected ? Icons.check_circle : Icons.circle_outlined,
                          color: selected ? AppColors.blushDeep : AppColors.muted,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          }),
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(_error!, style: const TextStyle(color: AppColors.danger, fontSize: 13)),
        ],
      ],
    );
  }

  Widget _timeStep() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
      children: [
        const StepHeader(
          step: 3,
          total: 4,
          title: 'Pick a time',
          subtitle: 'Choose a date, then an open slot.',
        ),
        const SizedBox(height: 12),
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(DateFormat('EEEE, d MMM yyyy').format(_day)),
          trailing: const Icon(Icons.calendar_today_outlined),
          onTap: () async {
            final picked = await showDatePicker(
              context: context,
              initialDate: _day,
              firstDate: DateTime.now(),
              lastDate: DateTime.now().add(const Duration(days: 90)),
            );
            if (picked != null) {
              setState(() => _day = picked);
              await _loadSlots();
            }
          },
        ),
        if (_busy)
          const Padding(
            padding: EdgeInsets.all(24),
            child: Center(child: CircularProgressIndicator(color: AppColors.blush)),
          )
        else if (_slots.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Text('No open slots on this day. Try another date.'),
          )
        else
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _slots.map((s) {
              final selected = _slot == s;
              return ChoiceChip(
                label: Text(s),
                selected: selected,
                onSelected: (_) => setState(() => _slot = s),
                selectedColor: AppColors.blushSoft,
                labelStyle: TextStyle(
                  color: selected ? AppColors.blushDeep : AppColors.ink,
                  fontWeight: FontWeight.w600,
                ),
              );
            }).toList(),
          ),
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(_error!, style: const TextStyle(color: AppColors.danger, fontSize: 13)),
        ],
      ],
    );
  }

  Widget _confirmStep() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
      children: [
        const StepHeader(
          step: 4,
          total: 4,
          title: 'Confirm booking',
          subtitle: 'Review details and share your contact.',
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: AppColors.line),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _row('Service', _service?.name ?? '—'),
              _row('Stylist', _staffMember?.name ?? '—'),
              _row('When', '${DateFormat('EEE d MMM').format(_day)} · ${_slot ?? '—'}'),
            ],
          ),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _name,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(labelText: 'Your name'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _phone,
          keyboardType: TextInputType.phone,
          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9+\s]'))],
          decoration: const InputDecoration(labelText: 'Phone number'),
        ),
        if (_needsOtp) ...[
          const SizedBox(height: 12),
          TextField(
            controller: _otp,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: const InputDecoration(labelText: 'OTP verification'),
          ),
        ],
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(_error!, style: const TextStyle(color: AppColors.danger, fontSize: 13)),
        ],
      ],
    );
  }

  Widget _row(String k, String v) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 72, child: Text(k, style: const TextStyle(color: AppColors.muted))),
          Expanded(child: Text(v, style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.ink))),
        ],
      ),
    );
  }

  Widget _footer() {
    String label;
    VoidCallback? onPressed;
    VoidCallback? onBack;

    switch (_step) {
      case 1:
        label = 'Continue';
        onPressed = _service == null || _busy ? null : _loadStaff;
        break;
      case 2:
        label = 'Continue';
        onBack = () => setState(() => _step = 1);
        onPressed = _staffMember == null || _busy ? null : _loadSlots;
        break;
      case 3:
        label = 'Continue';
        onBack = () => setState(() => _step = 2);
        onPressed = _slot == null || _busy ? null : _prepareConfirm;
        break;
      default:
        label = _needsOtp && !_otpVerified ? 'Verify & book' : 'Confirm booking';
        onBack = () => setState(() => _step = 3);
        onPressed = _busy ? null : _checkPhoneAndSubmit;
    }

    return Container(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: AppColors.line)),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            if (onBack != null)
              IconButton(
                onPressed: _busy ? null : onBack,
                icon: const Icon(Icons.arrow_back),
              ),
            Expanded(
              child: AppButton(
                label: label,
                loading: _busy,
                onPressed: onPressed,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SuccessView extends StatefulWidget {
  const _SuccessView({required this.onDone});
  final VoidCallback onDone;

  @override
  State<_SuccessView> createState() => _SuccessViewState();
}

class _SuccessViewState extends State<_SuccessView> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: AppMotion.slow)..forward();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ScaleTransition(
              scale: CurvedAnimation(parent: _c, curve: Curves.elasticOut),
              child: Container(
                width: 88,
                height: 88,
                decoration: BoxDecoration(
                  color: AppColors.successSoft,
                  borderRadius: BorderRadius.circular(28),
                ),
                child: const Icon(Icons.check_rounded, size: 44, color: AppColors.success),
              ),
            ),
            const SizedBox(height: 22),
            Text('Booking requested', style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 8),
            Text(
              'Your appointment is pending confirmation. We’ll be in touch.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 24),
            AppButton(label: 'Book another', onPressed: widget.onDone, expand: false),
          ],
        ),
      ),
    );
  }
}
