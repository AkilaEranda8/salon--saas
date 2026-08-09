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
  final List<SalonService> _selectedServices = [];
  SalonStaff? _staffMember;
  DateTime _day = DateTime.now().add(const Duration(days: 1));
  String? _slot;
  bool _showCalendar = false;
  DateTime _calendarMonth = DateTime(DateTime.now().year, DateTime.now().month);
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _otp = TextEditingController();
  bool _needsOtp = false;
  bool _otpVerified = false;
  bool _loading = true;
  bool _busy = false;
  bool _success = false;
  String? _error;

  static const _maxServices = 6;

  bool get _hasSelection => _selectedServices.isNotEmpty;

  int get _totalDuration =>
      _selectedServices.fold<int>(0, (sum, s) => sum + (s.durationMinutes > 0 ? s.durationMinutes : 30));

  double get _totalPrice =>
      _selectedServices.fold<double>(0, (sum, s) => sum + (s.price ?? 0));

  String get _servicesLabel {
    if (_selectedServices.isEmpty) return '—';
    if (_selectedServices.length == 1) return _selectedServices.first.name;
    return _selectedServices.map((s) => s.name).join(', ');
  }

  void _toggleService(SalonService s) {
    setState(() {
      final i = _selectedServices.indexWhere((e) => e.id == s.id);
      if (i >= 0) {
        _selectedServices.removeAt(i);
      } else {
        if (_selectedServices.length >= _maxServices) {
          _error = 'You can select up to $_maxServices services.';
          return;
        }
        _selectedServices.add(s);
        _error = null;
      }
    });
  }

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
    if (!_hasSelection) return;
    setState(() {
      _busy = true;
      _error = null;
      _staff = [];
      _staffMember = null;
    });
    try {
      final date = DateFormat('yyyy-MM-dd').format(_day);
      // Load all online staff for the day, then keep those who can do every selected service.
      final rows = await AppStateScope.of(context).api.getStaff(date: date);
      if (!mounted) return;
      final needed = _selectedServices.map((s) => s.id).toSet();
      final matched = rows.where((st) {
        if (st.serviceIds.isEmpty) return false;
        return needed.every(st.serviceIds.contains);
      }).toList();
      setState(() {
        _staff = matched;
        _busy = false;
        _step = 2;
        if (matched.isEmpty) {
          _error = 'No stylist can do all selected services. Try fewer services.';
        }
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
    if (!_hasSelection || _staffMember == null) return;
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
            duration: _totalDuration,
          );
      if (!mounted) return;
      setState(() {
        _slots = rows;
        _busy = false;
        if (_step < 3) _step = 3;
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
    if (!_hasSelection || _staffMember == null || _slot == null) return;

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
        serviceIds: _selectedServices.map((s) => s.id).toList(),
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
      _selectedServices.clear();
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
    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const StepHeader(
                  step: 1,
                  total: 4,
                  title: 'Choose services',
                  subtitle: 'Tap to select one or more treatments.',
                ),
                if (_hasSelection) ...[
                  const SizedBox(height: 12),
                  _SelectedSummary(
                    count: _selectedServices.length,
                    minutes: _totalDuration,
                    price: _totalPrice,
                  ),
                ],
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
                const SizedBox(height: 14),
              ],
            ),
          ),
        ),
        if (items.isEmpty)
          const SliverFillRemaining(
            hasScrollBody: false,
            child: EmptyState(
              title: 'No services',
              subtitle: 'Try another category.',
              icon: Icons.content_cut_outlined,
            ),
          )
        else
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            sliver: SliverGrid(
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 0.72,
              ),
              delegate: SliverChildBuilderDelegate(
                (context, i) {
                  final s = items[i];
                  return TweenAnimationBuilder<double>(
                    tween: Tween(begin: 0, end: 1),
                    duration: Duration(milliseconds: 220 + i * 35),
                    curve: AppMotion.easeOut,
                    builder: (context, t, child) => Opacity(
                      opacity: t,
                      child: Transform.translate(
                        offset: Offset(0, (1 - t) * 12),
                        child: child,
                      ),
                    ),
                    child: ServiceTile(
                      service: s,
                      selected: _selectedServices.any((e) => e.id == s.id),
                      onTap: () => _toggleService(s),
                    ),
                  );
                },
                childCount: items.length,
              ),
            ),
          ),
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
          subtitle: 'Staff who can do all selected services.',
        ),
        if (_hasSelection) ...[
          const SizedBox(height: 10),
          Text(
            _servicesLabel,
            style: const TextStyle(
              color: AppColors.inkSoft,
              fontSize: 13,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
        const SizedBox(height: 16),
        if (_busy)
          const Center(child: Padding(
            padding: EdgeInsets.all(24),
            child: CircularProgressIndicator(color: AppColors.blush),
          ))
        else if (_staff.isEmpty)
          const EmptyState(
            title: 'No stylists available',
            subtitle: 'Try fewer services or another day.',
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
    final today = DateTime.now();
    final start = DateTime(today.year, today.month, today.day);
    final days = List<DateTime>.generate(14, (i) => start.add(Duration(days: i)));
    final groups = _groupSlots(_slots);

    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const StepHeader(
                  step: 3,
                  total: 4,
                  title: 'Pick a time',
                  subtitle: 'Choose a day, then an open slot.',
                ),
                const SizedBox(height: 14),
                _TimeMetaBar(
                  stylist: _staffMember?.name ?? 'Stylist',
                  minutes: _totalDuration,
                  serviceCount: _selectedServices.length,
                ),
                const SizedBox(height: 20),
                Row(
                  children: [
                    const Text(
                      'DATE',
                      style: TextStyle(
                        color: AppColors.muted,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.0,
                      ),
                    ),
                    const Spacer(),
                    Material(
                      color: _showCalendar ? AppColors.blushSoft : Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      child: InkWell(
                        onTap: () {
                          setState(() {
                            _showCalendar = !_showCalendar;
                            if (_showCalendar) {
                              _calendarMonth = DateTime(_day.year, _day.month);
                            }
                          });
                        },
                        borderRadius: BorderRadius.circular(12),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: _showCalendar ? AppColors.blush : AppColors.line,
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.calendar_month_rounded,
                                size: 16,
                                color: _showCalendar ? AppColors.blushDeep : AppColors.inkSoft,
                              ),
                              const SizedBox(width: 6),
                              Text(
                                _showCalendar ? 'Hide' : 'Calendar',
                                style: TextStyle(
                                  color: _showCalendar ? AppColors.blushDeep : AppColors.inkSoft,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
              ],
            ),
          ),
        ),
        if (_showCalendar)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: _MonthCalendar(
                month: _calendarMonth,
                selected: _day,
                firstDate: start,
                lastDate: start.add(const Duration(days: 90)),
                onMonthChanged: (m) => setState(() => _calendarMonth = m),
                onDaySelected: (d) async {
                  if (_sameDay(d, _day)) return;
                  setState(() {
                    _day = d;
                    _slot = null;
                    _slots = [];
                    _calendarMonth = DateTime(d.year, d.month);
                  });
                  await _loadSlots();
                },
              ),
            ),
          ),
        SliverToBoxAdapter(
          child: SizedBox(
            height: 84,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              scrollDirection: Axis.horizontal,
              itemCount: days.length,
              separatorBuilder: (_, _) => const SizedBox(width: 10),
              itemBuilder: (context, i) {
                final d = days[i];
                final selected = _sameDay(d, _day);
                return _DateChip(
                  day: d,
                  selected: selected,
                  onTap: () async {
                    if (selected) return;
                    setState(() {
                      _day = d;
                      _slot = null;
                      _slots = [];
                      _calendarMonth = DateTime(d.year, d.month);
                    });
                    await _loadSlots();
                  },
                );
              },
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 22, 20, 8),
            child: Row(
              children: [
                const Text(
                  'AVAILABLE TIMES',
                  style: TextStyle(
                    color: AppColors.muted,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.0,
                  ),
                ),
                const Spacer(),
                if (!_busy && _slots.isNotEmpty)
                  Text(
                    '${_slots.length} slots',
                    style: const TextStyle(
                      color: AppColors.inkSoft,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
              ],
            ),
          ),
        ),
        if (_busy)
          const SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(child: CircularProgressIndicator(color: AppColors.blush)),
            ),
          )
        else if (_slots.isEmpty)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 40),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(18, 22, 18, 22),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: AppColors.line),
                ),
                child: const Column(
                  children: [
                    Icon(Icons.event_busy_outlined, color: AppColors.muted, size: 32),
                    SizedBox(height: 10),
                    Text(
                      'No open slots this day',
                      style: TextStyle(
                        color: AppColors.ink,
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                      ),
                    ),
                    SizedBox(height: 4),
                    Text(
                      'Try another date above.',
                      style: TextStyle(color: AppColors.muted, fontSize: 13),
                    ),
                  ],
                ),
              ),
            ),
          )
        else
          ...groups.entries.map((entry) {
            return SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(entry.value.$1, size: 16, color: AppColors.blushDeep),
                        const SizedBox(width: 8),
                        Text(
                          entry.key,
                          style: const TextStyle(
                            color: AppColors.inkSoft,
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: entry.value.$2.map((s) {
                        final selected = _slot == s;
                        return _TimeSlotChip(
                          label: _formatSlotLabel(s),
                          selected: selected,
                          onTap: () => setState(() => _slot = s),
                        );
                      }).toList(),
                    ),
                  ],
                ),
              ),
            );
          }),
        if (_slot != null)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 0),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [AppColors.washTop, AppColors.blushSoft],
                  ),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.blush.withValues(alpha: 0.35)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.schedule_rounded, color: AppColors.blushDeep, size: 20),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        '${DateFormat('EEE, d MMM').format(_day)} · ${_formatSlotLabel(_slot!)}',
                        style: const TextStyle(
                          color: AppColors.blushDeep,
                          fontWeight: FontWeight.w700,
                          fontSize: 14,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        if (_error != null)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
              child: Text(_error!, style: const TextStyle(color: AppColors.danger, fontSize: 13)),
            ),
          ),
        const SliverToBoxAdapter(child: SizedBox(height: 28)),
      ],
    );
  }

  bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  /// Groups slots into Morning / Afternoon / Evening.
  Map<String, (IconData, List<String>)> _groupSlots(List<String> slots) {
    final morning = <String>[];
    final afternoon = <String>[];
    final evening = <String>[];
    for (final s in slots) {
      final mins = _slotMinutes(s);
      if (mins == null) {
        afternoon.add(s);
      } else if (mins < 12 * 60) {
        morning.add(s);
      } else if (mins < 17 * 60) {
        afternoon.add(s);
      } else {
        evening.add(s);
      }
    }
    final out = <String, (IconData, List<String>)>{};
    if (morning.isNotEmpty) out['Morning'] = (Icons.wb_sunny_outlined, morning);
    if (afternoon.isNotEmpty) out['Afternoon'] = (Icons.wb_twilight_outlined, afternoon);
    if (evening.isNotEmpty) out['Evening'] = (Icons.nights_stay_outlined, evening);
    return out;
  }

  int? _slotMinutes(String raw) {
    final m = RegExp(r'^(\d{1,2}):(\d{2})').firstMatch(raw.trim());
    if (m == null) return null;
    final h = int.tryParse(m.group(1)!);
    final min = int.tryParse(m.group(2)!);
    if (h == null || min == null) return null;
    return h * 60 + min;
  }

  String _formatSlotLabel(String raw) {
    final mins = _slotMinutes(raw);
    if (mins == null) return raw;
    final h24 = mins ~/ 60;
    final m = mins % 60;
    final period = h24 >= 12 ? 'PM' : 'AM';
    final h12 = h24 % 12 == 0 ? 12 : h24 % 12;
    return '$h12:${m.toString().padLeft(2, '0')} $period';
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
              _row(
                _selectedServices.length > 1 ? 'Services' : 'Service',
                _servicesLabel,
              ),
              _row('Duration', '$_totalDuration min'),
              if (_totalPrice > 0)
                _row(
                  'Total',
                  'Rs. ${_totalPrice % 1 == 0 ? _totalPrice.toInt() : _totalPrice.toStringAsFixed(0)}',
                ),
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
        label = _hasSelection
            ? 'Continue (${_selectedServices.length})'
            : 'Continue';
        onPressed = !_hasSelection || _busy ? null : _loadStaff;
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

class _MonthCalendar extends StatelessWidget {
  const _MonthCalendar({
    required this.month,
    required this.selected,
    required this.firstDate,
    required this.lastDate,
    required this.onMonthChanged,
    required this.onDaySelected,
  });

  final DateTime month;
  final DateTime selected;
  final DateTime firstDate;
  final DateTime lastDate;
  final ValueChanged<DateTime> onMonthChanged;
  final ValueChanged<DateTime> onDaySelected;

  bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  @override
  Widget build(BuildContext context) {
    final firstOfMonth = DateTime(month.year, month.month);
    // Monday-based week index: Mon=0 … Sun=6
    final lead = (firstOfMonth.weekday + 6) % 7;
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
    final cells = lead + daysInMonth;
    final rows = ((cells + 6) ~/ 7);
    final minMonth = DateTime(firstDate.year, firstDate.month);
    final maxMonth = DateTime(lastDate.year, lastDate.month);
    final canPrev = DateTime(month.year, month.month).isAfter(minMonth);
    final canNext = DateTime(month.year, month.month).isBefore(maxMonth);

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        children: [
          Row(
            children: [
              _CalNavBtn(
                icon: Icons.chevron_left_rounded,
                enabled: canPrev,
                onTap: canPrev
                    ? () => onMonthChanged(DateTime(month.year, month.month - 1))
                    : null,
              ),
              Expanded(
                child: Text(
                  DateFormat('MMMM yyyy').format(month),
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: AppColors.ink,
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                  ),
                ),
              ),
              _CalNavBtn(
                icon: Icons.chevron_right_rounded,
                enabled: canNext,
                onTap: canNext
                    ? () => onMonthChanged(DateTime(month.year, month.month + 1))
                    : null,
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: const ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
                .map(
                  (d) => Expanded(
                    child: Center(
                      child: Text(
                        d,
                        style: TextStyle(
                          color: AppColors.muted,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 8),
          for (var r = 0; r < rows; r++)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                children: List.generate(7, (c) {
                  final idx = r * 7 + c;
                  final dayNum = idx - lead + 1;
                  if (dayNum < 1 || dayNum > daysInMonth) {
                    return const Expanded(child: SizedBox(height: 40));
                  }
                  final date = DateTime(month.year, month.month, dayNum);
                  final enabled = !date.isBefore(firstDate) && !date.isAfter(lastDate);
                  final isSelected = _sameDay(date, selected);
                  final isToday = _sameDay(date, DateTime.now());
                  return Expanded(
                    child: Padding(
                      padding: const EdgeInsets.all(2),
                      child: Material(
                        color: isSelected
                            ? AppColors.blushDeep
                            : isToday
                                ? AppColors.blushSoft
                                : Colors.transparent,
                        shape: const CircleBorder(),
                        child: InkWell(
                          customBorder: const CircleBorder(),
                          onTap: enabled ? () => onDaySelected(date) : null,
                          child: SizedBox(
                            height: 40,
                            child: Center(
                              child: Text(
                                '$dayNum',
                                style: TextStyle(
                                  color: !enabled
                                      ? AppColors.line
                                      : isSelected
                                          ? Colors.white
                                          : AppColors.ink,
                                  fontWeight: isSelected || isToday
                                      ? FontWeight.w800
                                      : FontWeight.w600,
                                  fontSize: 13,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  );
                }),
              ),
            ),
        ],
      ),
    );
  }
}

class _CalNavBtn extends StatelessWidget {
  const _CalNavBtn({
    required this.icon,
    required this.enabled,
    required this.onTap,
  });

  final IconData icon;
  final bool enabled;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.washTop,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(
          width: 36,
          height: 36,
          child: Icon(
            icon,
            color: enabled ? AppColors.ink : AppColors.line,
            size: 22,
          ),
        ),
      ),
    );
  }
}

class _TimeMetaBar extends StatelessWidget {
  const _TimeMetaBar({
    required this.stylist,
    required this.minutes,
    required this.serviceCount,
  });

  final String stylist;
  final int minutes;
  final int serviceCount;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.line),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppColors.blushSoft,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.person_outline_rounded, color: AppColors.blushDeep, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  stylist,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.ink,
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '$serviceCount service${serviceCount == 1 ? '' : 's'} · $minutes min',
                  style: const TextStyle(color: AppColors.muted, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DateChip extends StatelessWidget {
  const _DateChip({
    required this.day,
    required this.selected,
    required this.onTap,
  });

  final DateTime day;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final today = DateTime.now();
    final isToday =
        day.year == today.year && day.month == today.month && day.day == today.day;
    return Material(
      color: selected ? AppColors.blushDeep : Colors.white,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Container(
          width: 64,
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: selected ? AppColors.blushDeep : AppColors.line,
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                isToday ? 'Today' : DateFormat('E').format(day),
                style: TextStyle(
                  color: selected ? Colors.white.withValues(alpha: 0.85) : AppColors.muted,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '${day.day}',
                style: TextStyle(
                  color: selected ? Colors.white : AppColors.ink,
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  height: 1,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                DateFormat('MMM').format(day),
                style: TextStyle(
                  color: selected ? Colors.white.withValues(alpha: 0.8) : AppColors.inkSoft,
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TimeSlotChip extends StatelessWidget {
  const _TimeSlotChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.blushDeep : Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected ? AppColors.blushDeep : AppColors.line,
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: selected ? Colors.white : AppColors.ink,
              fontWeight: FontWeight.w700,
              fontSize: 13,
              letterSpacing: 0.1,
            ),
          ),
        ),
      ),
    );
  }
}

class _SelectedSummary extends StatelessWidget {
  const _SelectedSummary({
    required this.count,
    required this.minutes,
    required this.price,
  });

  final int count;
  final int minutes;
  final double price;

  @override
  Widget build(BuildContext context) {
    final priceLabel = price > 0
        ? ' · Rs. ${price % 1 == 0 ? price.toInt() : price.toStringAsFixed(0)}'
        : '';
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.blushSoft,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.blush.withValues(alpha: 0.35)),
      ),
      child: Text(
        '$count selected · $minutes min$priceLabel',
        style: const TextStyle(
          color: AppColors.blushDeep,
          fontWeight: FontWeight.w700,
          fontSize: 13,
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
