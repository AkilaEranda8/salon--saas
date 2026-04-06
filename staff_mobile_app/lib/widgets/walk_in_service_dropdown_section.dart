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

  SalonService? _serviceById(String id) {
    for (final s in widget.activeServices) {
      if (s.id == id) return s;
    }
    return null;
  }

  OutlineInputBorder _border(Color color, {double width = 1.0}) =>
      OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: color, width: width),
      );

  @override
  Widget build(BuildContext context) {
    final w      = widget;
    final accent = w.accentColor;
    final muted  = w.mutedColor;

    final labelWidget = Padding(
      padding: const EdgeInsets.only(bottom: 8),
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

    // ── Empty state ──────────────────────────────────────────────────────────
    if (w.activeServices.isEmpty) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          labelWidget,
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: w.bgColor,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: w.borderColor),
            ),
            child: Row(children: [
              Icon(Icons.spa_outlined, color: muted, size: 16),
              const SizedBox(width: 8),
              Text('No active services available',
                  style: TextStyle(color: muted, fontSize: 13)),
            ]),
          ),
        ],
      );
    }

    final primaryVal = w.primaryServiceId != null &&
            w.activeServices.any((s) => s.id == w.primaryServiceId)
        ? w.primaryServiceId
        : null;
    final hasPrimary = primaryVal != null;

    // Extra service ids (all except first)
    final extraIds = w.orderedServiceIds.length > 1
        ? w.orderedServiceIds.sublist(1)
        : <String>[];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [

        labelWidget,

        // ── Primary service dropdown ─────────────────────────────────────────
        DropdownButtonFormField<String>(
          initialValue: primaryVal,
          isExpanded: true,
          decoration: InputDecoration(
            hintText: 'Select service',
            hintStyle:
                const TextStyle(color: Color(0xFFB0B8B0), fontSize: 14),
            prefixIcon: Icon(Icons.spa_outlined, color: accent, size: 19),
            filled: true,
            fillColor: w.bgColor,
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
            border:        _border(w.borderColor),
            enabledBorder: _border(w.borderColor),
            focusedBorder: _border(accent, width: 1.8),
            errorBorder:   _border(const Color(0xFFF43F5E)),
          ),
          icon: Icon(Icons.keyboard_arrow_down_rounded,
              color: muted.withValues(alpha: 0.7), size: 22),
          items: w.activeServices.map((s) => DropdownMenuItem(
            value: s.id,
            child: Row(children: [
              Expanded(
                child: Text(s.name,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 14, fontWeight: FontWeight.w600)),
              ),
              Text('LKR ${s.price.toStringAsFixed(0)}',
                  style: TextStyle(
                      fontSize: 12,
                      color: muted,
                      fontWeight: FontWeight.w500)),
            ]),
          )).toList(),
          onChanged: w.onPrimaryChanged,
        ),

        // ── Extra service pills ──────────────────────────────────────────────
        if (extraIds.isNotEmpty) ...[
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: List.generate(extraIds.length, (i) {
              final s = _serviceById(extraIds[i]);
              if (s == null) return const SizedBox.shrink();
              return Container(
                padding: const EdgeInsets.fromLTRB(10, 6, 6, 6),
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                      color: accent.withValues(alpha: 0.25), width: 1.2),
                ),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Text(s.name,
                      style: TextStyle(
                          color: accent,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700)),
                  const SizedBox(width: 4),
                  Text('LKR ${s.price.toStringAsFixed(0)}',
                      style: TextStyle(
                          color: muted,
                          fontSize: 11,
                          fontWeight: FontWeight.w500)),
                  const SizedBox(width: 2),
                  GestureDetector(
                    onTap: () => w.onRemoveExtraAt(i),
                    child: Padding(
                      padding: const EdgeInsets.all(3),
                      child: Icon(Icons.close_rounded,
                          size: 13,
                          color: accent.withValues(alpha: 0.65)),
                    ),
                  ),
                ]),
              );
            }),
          ),
        ],

        // ── Add extra service ────────────────────────────────────────────────
        if (hasPrimary) ...[
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            key: ValueKey('extra_$_extraDropdownKey'),
            initialValue: null,
            isExpanded: true,
            decoration: InputDecoration(
              hintText: 'Add another service',
              hintStyle:
                  const TextStyle(color: Color(0xFFB0B8B0), fontSize: 13.5),
              prefixIcon: Icon(Icons.add_circle_outline_rounded,
                  color: accent.withValues(alpha: 0.6), size: 18),
              filled: true,
              fillColor: w.bgColor,
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
              border:        _border(w.borderColor),
              enabledBorder: _border(w.borderColor),
              focusedBorder: _border(accent, width: 1.5),
              errorBorder:   _border(const Color(0xFFF43F5E)),
            ),
            icon: Icon(Icons.keyboard_arrow_down_rounded,
                color: muted.withValues(alpha: 0.55), size: 20),
            items: w.activeServices.map((s) => DropdownMenuItem(
              value: s.id,
              child: Row(children: [
                Expanded(
                  child: Text(s.name,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 13.5, fontWeight: FontWeight.w600)),
                ),
                Text('LKR ${s.price.toStringAsFixed(0)}',
                    style: TextStyle(
                        fontSize: 12,
                        color: muted,
                        fontWeight: FontWeight.w500)),
              ]),
            )).toList(),
            onChanged: (id) {
              if (id == null) return;
              w.onAddExtra(id);
              setState(() => _extraDropdownKey++);
            },
          ),
        ],

        // ── Validation hint ──────────────────────────────────────────────────
        if (w.orderedServiceIds.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 6, left: 4),
            child: Text(
              'Select at least one service',
              style: TextStyle(
                  color: Colors.red.shade400, fontSize: 11.5),
            ),
          ),
      ],
    );
  }
}
