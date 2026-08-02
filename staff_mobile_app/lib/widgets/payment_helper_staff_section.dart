import 'package:flutter/material.dart';

import '../models/staff_member.dart';

/// Equal share of commission pool for each person (main + helpers).
double equalHelperPercent(int helperCount) {
  final n = helperCount < 1 ? 1 : helperCount;
  return double.parse((100 / (n + 1)).toStringAsFixed(2));
}

/// One helper staff row — API always equal-splits the pool (ignores % / fixed).
class PaymentHelperDraft {
  PaymentHelperDraft({this.staffId = ''});

  String staffId;

  Map<String, dynamic> toApiJson(double sharePct) => {
        'staff_id': int.tryParse(staffId) ?? staffId,
        'commission_type': 'percentage_of_main',
        'commission_value': sharePct,
      };
}

List<Map<String, dynamic>> helpersApiPayload(List<PaymentHelperDraft> helpers) {
  final list = helpers.where((h) => h.staffId.trim().isNotEmpty).toList();
  final pct = equalHelperPercent(list.isEmpty ? 1 : list.length);
  return list.map((h) => h.toApiJson(pct)).toList();
}

bool helpersDraftValid(List<PaymentHelperDraft> helpers) {
  if (helpers.isEmpty) return true;
  return helpers.every((h) => h.staffId.trim().isNotEmpty);
}

/// Main staff + optional helpers (pool always split equally).
class PaymentHelperStaffSection extends StatelessWidget {
  const PaymentHelperStaffSection({
    required this.staffOptions,
    required this.mainStaffId,
    required this.onMainStaffChanged,
    required this.helpers,
    required this.onHelpersChanged,
    this.requireMain = true,
    super.key,
  });

  final List<StaffMember> staffOptions;
  final String mainStaffId;
  final ValueChanged<String> onMainStaffChanged;
  final List<PaymentHelperDraft> helpers;
  final ValueChanged<List<PaymentHelperDraft>> onHelpersChanged;
  final bool requireMain;

  static const _green = Color(0xFF059669);
  static const _border = Color(0xFFE5EAF0);
  static const _muted = Color(0xFF667085);
  static const _ink = Color(0xFF101828);
  static const _soft = Color(0xFFF8FAFC);

  bool get _helpersOn => helpers.isNotEmpty;

  List<StaffMember> get _activeStaff =>
      staffOptions.where((s) => s.isActive).toList();

  @override
  Widget build(BuildContext context) {
    final mainId = mainStaffId.trim();
    final helperPct = equalHelperPercent(helpers.isEmpty ? 1 : helpers.length);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Staff & commission',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w800,
              color: _ink,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Main rate makes the commission pool. Helpers always split it equally '
            '(same for % or fixed). Example: pool Rs. 1000 → Rs. 500 each.',
            style: TextStyle(fontSize: 11.5, color: _muted, height: 1.35),
          ),
          const SizedBox(height: 12),
          const Text(
            'MAIN STAFF *',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: _muted,
              letterSpacing: 0.4,
            ),
          ),
          const SizedBox(height: 6),
          DropdownButtonFormField<String>(
            key: ValueKey('main-staff-$mainId'),
            initialValue: mainId.isEmpty ||
                    !_activeStaff.any((s) => s.id == mainId)
                ? null
                : mainId,
            decoration: _fieldDeco('Select main staff'),
            items: _activeStaff
                .map((s) => DropdownMenuItem(value: s.id, child: Text(s.name)))
                .toList(),
            onChanged: (v) {
              final next = v ?? '';
              onMainStaffChanged(next);
              if (next.isEmpty) {
                onHelpersChanged(const []);
                return;
              }
              onHelpersChanged(
                helpers.where((h) => h.staffId != next).toList(),
              );
            },
            validator: requireMain
                ? (v) => (v == null || v.isEmpty) ? 'Select main staff' : null
                : null,
          ),
          const SizedBox(height: 10),
          InkWell(
            onTap: mainId.isEmpty
                ? null
                : () {
                    if (_helpersOn) {
                      onHelpersChanged(const []);
                    } else {
                      onHelpersChanged([PaymentHelperDraft()]);
                    }
                  },
            borderRadius: BorderRadius.circular(10),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: _soft,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: _border),
              ),
              child: Row(
                children: [
                  SizedBox(
                    width: 22,
                    height: 22,
                    child: Checkbox(
                      value: _helpersOn,
                      activeColor: _green,
                      onChanged: mainId.isEmpty
                          ? null
                          : (v) {
                              if (v == true) {
                                onHelpersChanged([PaymentHelperDraft()]);
                              } else {
                                onHelpersChanged(const []);
                              }
                            },
                    ),
                  ),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(
                            text: 'Helper staff ',
                            style: TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 13,
                              color: _ink,
                            ),
                          ),
                          TextSpan(
                            text: '(optional · equal split)',
                            style: TextStyle(
                              fontWeight: FontWeight.w500,
                              fontSize: 13,
                              color: _muted,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (_helpersOn) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: _soft,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: _border),
              ),
              child: Text(
                'Each gets ${helperPct.toStringAsFixed(helperPct % 1 == 0 ? 0 : 2)}% of the pool '
                '(main + ${helpers.length} helper${helpers.length == 1 ? '' : 's'}).',
                style: const TextStyle(fontSize: 12, color: _muted, height: 1.35),
              ),
            ),
            const SizedBox(height: 10),
            ...helpers.asMap().entries.map((entry) {
              final idx = entry.key;
              final h = entry.value;
              final used = <String>{
                mainId,
                ...helpers
                    .asMap()
                    .entries
                    .where((e) => e.key != idx && e.value.staffId.isNotEmpty)
                    .map((e) => e.value.staffId),
              };
              final options = _activeStaff
                  .where((s) =>
                      s.id == h.staffId || !used.contains(s.id))
                  .toList();
              return Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: _soft,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: _border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          'Helper ${idx + 1}',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            color: _ink,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          '· ${helperPct.toStringAsFixed(helperPct % 1 == 0 ? 0 : 2)}% equal',
                          style: const TextStyle(fontSize: 12, color: _muted),
                        ),
                        const Spacer(),
                        GestureDetector(
                          onTap: () {
                            final next = [...helpers]..removeAt(idx);
                            onHelpersChanged(next);
                          },
                          child: const Text(
                            'Remove',
                            style: TextStyle(
                              color: Color(0xFFDC2626),
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<String>(
                      key: ValueKey('helper-staff-$idx-${h.staffId}'),
                      initialValue: h.staffId.isEmpty ||
                              !options.any((s) => s.id == h.staffId)
                          ? null
                          : h.staffId,
                      decoration: _fieldDeco('Select helper'),
                      items: options
                          .map((s) =>
                              DropdownMenuItem(value: s.id, child: Text(s.name)))
                          .toList(),
                      onChanged: (v) {
                        final next = [...helpers];
                        next[idx] = PaymentHelperDraft(staffId: v ?? '');
                        onHelpersChanged(next);
                      },
                    ),
                  ],
                ),
              );
            }),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: mainId.isEmpty
                    ? null
                    : () => onHelpersChanged([...helpers, PaymentHelperDraft()]),
                icon: const Icon(Icons.add, size: 18),
                label: const Text('Add another helper'),
                style: TextButton.styleFrom(
                  foregroundColor: _green,
                  textStyle: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  InputDecoration _fieldDeco(String hint) => InputDecoration(
        hintText: hint,
        filled: true,
        fillColor: Colors.white,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: _border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: _border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: _green, width: 1.5),
        ),
      );
}
