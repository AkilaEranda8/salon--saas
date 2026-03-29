import 'package:flutter/material.dart';

import '../models/salon_service.dart';

/// Primary + additional services using dropdowns (replaces chip grid).
class WalkInServiceDropdownSection extends StatefulWidget {
  const WalkInServiceDropdownSection({
    super.key,
    required this.activeServices,
    required this.primaryServiceId,
    required this.orderedServiceIds,
    required this.onPrimaryChanged,
    required this.onAddExtra,
    required this.onRemoveExtraAt,
    required this.label,
    required this.helperText,
    required this.accentColor,
    required this.borderColor,
    required this.bgColor,
    required this.mutedColor,
  });

  final List<SalonService> activeServices;
  final String? primaryServiceId;
  final List<String> orderedServiceIds;
  final ValueChanged<String?> onPrimaryChanged;
  final ValueChanged<String> onAddExtra;
  /// Index into the **extras** list only (0 = first row under primary).
  final ValueChanged<int> onRemoveExtraAt;
  final String label;
  final String helperText;
  final Color accentColor;
  final Color borderColor;
  final Color bgColor;
  final Color mutedColor;

  @override
  State<WalkInServiceDropdownSection> createState() =>
      _WalkInServiceDropdownSectionState();
}

class _WalkInServiceDropdownSectionState
    extends State<WalkInServiceDropdownSection> {
  int _extraDropdownKey = 0;

  InputDecoration _fieldDeco(String hint, IconData icon) {
    final a = widget.accentColor;
    final b = widget.borderColor;
    final bg = widget.bgColor;
    return InputDecoration(
      hintText: hint,
      hintStyle: const TextStyle(color: Color(0xFFB0B8B0), fontSize: 14),
      prefixIcon: Icon(icon, color: a, size: 19),
      filled: true,
      fillColor: bg,
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: b),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: b),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: a, width: 1.8),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFFF43F5E)),
      ),
    );
  }

  SalonService? _serviceById(String id) {
    for (final s in widget.activeServices) {
      if (s.id == id) return s;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final w = widget;
    final accent = w.accentColor;
    final muted = w.mutedColor;

    Widget labelRow() => Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: Text(
            w.label,
            style: TextStyle(
              color: muted,
              fontSize: 11.5,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.5,
            ),
          ),
        );

    if (w.activeServices.isEmpty) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          labelRow(),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: w.bgColor,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: w.borderColor),
            ),
            child: Text(
              'No active services available',
              style: TextStyle(color: muted, fontSize: 13),
            ),
          ),
        ],
      );
    }

    final primaryVal = w.primaryServiceId != null &&
            w.activeServices.any((s) => s.id == w.primaryServiceId)
        ? w.primaryServiceId
        : null;

    final hasPrimary = w.primaryServiceId != null &&
        w.primaryServiceId!.trim().isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        labelRow(),
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text(
            w.helperText,
            style: TextStyle(
              color: muted.withValues(alpha: 0.95),
              fontSize: 11.5,
              fontWeight: FontWeight.w500,
              height: 1.35,
            ),
          ),
        ),
        // Use DropdownButton (controlled) — FormField `initialValue` only applies
        // once and can stick after the first pick when the key does not change.
        InputDecorator(
          decoration: _fieldDeco('Select primary service', Icons.spa_outlined),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              isExpanded: true,
              value: primaryVal,
              hint: const Text(
                'Select primary service',
                overflow: TextOverflow.ellipsis,
              ),
              icon: Icon(Icons.arrow_drop_down_rounded,
                  color: muted.withValues(alpha: 0.85)),
              items: w.activeServices
                  .map(
                    (s) => DropdownMenuItem<String>(
                      value: s.id,
                      child: Text(
                        '${s.name} — LKR ${s.price.toStringAsFixed(0)}',
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  )
                  .toList(),
              onChanged: w.onPrimaryChanged,
            ),
          ),
        ),
        if (w.orderedServiceIds.length > 1) ...[
          const SizedBox(height: 8),
          ...List.generate(w.orderedServiceIds.length - 1, (extraIndex) {
            final id = w.orderedServiceIds[extraIndex + 1];
            final s = _serviceById(id);
            if (s == null) return const SizedBox.shrink();
            return Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Material(
                color: w.bgColor,
                borderRadius: BorderRadius.circular(10),
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Additional: ${s.name}',
                              style: TextStyle(
                                color: accent,
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            Text(
                              'LKR ${s.price.toStringAsFixed(0)}',
                              style: TextStyle(
                                color: muted,
                                fontSize: 11.5,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        visualDensity: VisualDensity.compact,
                        onPressed: () => w.onRemoveExtraAt(extraIndex),
                        icon: Icon(Icons.close_rounded,
                            size: 18, color: muted.withValues(alpha: 0.9)),
                        tooltip: 'Remove',
                      ),
                    ],
                  ),
                ),
              ),
            );
          }),
        ],
        if (hasPrimary && w.activeServices.isNotEmpty) ...[
          const SizedBox(height: 10),
          InputDecorator(
            decoration: _fieldDeco(
                'Add same or other service', Icons.add_circle_outline),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                key: ValueKey(_extraDropdownKey),
                isExpanded: true,
                value: null,
                hint: const Text(
                  'Add line (can repeat a service)',
                  overflow: TextOverflow.ellipsis,
                ),
                icon: Icon(Icons.arrow_drop_down_rounded,
                    color: muted.withValues(alpha: 0.85)),
                items: w.activeServices
                    .map(
                      (s) => DropdownMenuItem<String>(
                        value: s.id,
                        child: Text(
                          '${s.name} — LKR ${s.price.toStringAsFixed(0)}',
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    )
                    .toList(),
                onChanged: (id) {
                  if (id == null) return;
                  w.onAddExtra(id);
                  setState(() => _extraDropdownKey++);
                },
              ),
            ),
          ),
        ],
        if (w.orderedServiceIds.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 6, left: 2),
            child: Text(
              'Select at least one service',
              style: TextStyle(color: Colors.red.shade400, fontSize: 11.5),
            ),
          ),
      ],
    );
  }
}
