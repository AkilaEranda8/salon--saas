import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../models/salon_service.dart';

/// Primary + additional services using searchable dropdowns.
/// Optional [priceControllers] show an inline LKR field beside each selected service.
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
    this.priceControllers,
    this.onPriceEdited,
    this.pricesEditable = false,
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

  /// When [pricesEditable] is true, each selected service shows this controller.
  final Map<String, TextEditingController>? priceControllers;
  final VoidCallback? onPriceEdited;
  final bool pricesEditable;

  @override
  State<WalkInServiceDropdownSection> createState() =>
      _WalkInServiceDropdownSectionState();
}

class _WalkInServiceDropdownSectionState
    extends State<WalkInServiceDropdownSection> {
  final _searchCtrl = TextEditingController();
  int _extraDropdownKey = 0;
  int _primaryDropdownKey = 0;

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant WalkInServiceDropdownSection oldWidget) {
    super.didUpdateWidget(oldWidget);
    final primaryChanged =
        oldWidget.primaryServiceId != widget.primaryServiceId;
    final orderedChanged = oldWidget.orderedServiceIds.join(',') !=
        widget.orderedServiceIds.join(',');
    if (primaryChanged || orderedChanged) {
      _primaryDropdownKey++;
      _extraDropdownKey++;
      if (_searchCtrl.text.isNotEmpty) {
        _searchCtrl.clear();
      }
    }
  }

  SalonService? _serviceById(String id) {
    for (final s in widget.activeServices) {
      if (s.id == id) return s;
    }
    return null;
  }

  List<SalonService> _filteredServices({String? keepId}) {
    final q = _searchCtrl.text.trim().toLowerCase();
    final list = q.isEmpty
        ? List<SalonService>.from(widget.activeServices)
        : widget.activeServices
            .where((s) {
              final name = s.name.toLowerCase();
              final cat = s.category.toLowerCase();
              return name.contains(q) || cat.contains(q);
            })
            .toList();

    if (keepId != null &&
        keepId.isNotEmpty &&
        !list.any((s) => s.id == keepId)) {
      final keep = _serviceById(keepId);
      if (keep != null) list.insert(0, keep);
    }
    return list;
  }

  OutlineInputBorder _border(Color color, {double width = 1.0}) =>
      OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: color, width: width),
      );

  InputDecoration _fieldDeco({
    required String hint,
    required IconData icon,
    required Color accent,
    required Color muted,
    required Color border,
    required Color bg,
    Widget? suffix,
  }) {
    return InputDecoration(
      hintText: hint,
      hintStyle: const TextStyle(color: Color(0xFFB0B8B0), fontSize: 14),
      prefixIcon: Icon(icon, color: accent, size: 19),
      suffixIcon: suffix,
      filled: true,
      fillColor: bg,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      border: _border(border),
      enabledBorder: _border(border),
      focusedBorder: _border(accent, width: 1.8),
      errorBorder: _border(const Color(0xFFF43F5E)),
    );
  }

  Widget _serviceItem(SalonService s, Color muted, {double nameSize = 14}) {
    final showListPrice = !widget.pricesEditable;
    return Row(children: [
      Expanded(
        child: Text(
          s.name,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(fontSize: nameSize, fontWeight: FontWeight.w600),
        ),
      ),
      if (showListPrice)
        Text(
          'LKR ${s.price.toStringAsFixed(0)}',
          style: TextStyle(
            fontSize: 12,
            color: muted,
            fontWeight: FontWeight.w500,
          ),
        ),
    ]);
  }

  Widget? _inlinePrice(String serviceId) {
    if (!widget.pricesEditable) return null;
    final ctrls = widget.priceControllers;
    if (ctrls == null) return null;
    final ctrl = ctrls[serviceId];
    if (ctrl == null) return null;
    final accent = widget.accentColor;
    return SizedBox(
      width: 108,
      child: TextField(
        controller: ctrl,
        keyboardType: TextInputType.number,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        textAlign: TextAlign.right,
        style: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w800,
          color: accent,
        ),
        onChanged: (_) => widget.onPriceEdited?.call(),
        decoration: InputDecoration(
          isDense: true,
          prefixText: 'Rs ',
          prefixStyle: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: accent.withValues(alpha: 0.85),
          ),
          hintText: '0',
          filled: true,
          fillColor: widget.bgColor,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
          border: _border(widget.borderColor),
          enabledBorder: _border(widget.borderColor),
          focusedBorder: _border(accent, width: 1.8),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final w = widget;
    final accent = w.accentColor;
    final muted = w.mutedColor;

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
              Text(
                'No active services available',
                style: TextStyle(color: muted, fontSize: 13),
              ),
            ]),
          ),
        ],
      );
    }

    final filtered = _filteredServices(keepId: w.primaryServiceId);
    final primaryVal = w.primaryServiceId;
    final hasPrimary = primaryVal != null && primaryVal.isNotEmpty;
    final primaryPrice =
        hasPrimary ? _inlinePrice(primaryVal) : null;
    final extraIds = w.orderedServiceIds.length > 1
        ? w.orderedServiceIds.sublist(1)
        : const <String>[];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        labelWidget,
        TextField(
          controller: _searchCtrl,
          onChanged: (_) => setState(() {}),
          decoration: _fieldDeco(
            hint: 'Search services…',
            icon: Icons.search_rounded,
            accent: accent,
            muted: muted,
            border: w.borderColor,
            bg: w.bgColor,
            suffix: _searchCtrl.text.isEmpty
                ? null
                : IconButton(
                    icon: Icon(Icons.close_rounded, size: 18, color: muted),
                    onPressed: () {
                      _searchCtrl.clear();
                      setState(() {});
                    },
                  ),
          ),
        ),
        if (_searchCtrl.text.trim().isNotEmpty) ...[
          const SizedBox(height: 6),
          Padding(
            padding: const EdgeInsets.only(left: 4),
            child: Text(
              filtered.isEmpty
                  ? 'No services match “${_searchCtrl.text.trim()}”'
                  : '${filtered.length} match${filtered.length == 1 ? '' : 'es'}',
              style: TextStyle(
                color: filtered.isEmpty ? Colors.red.shade400 : muted,
                fontSize: 11.5,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
        const SizedBox(height: 8),

        if (filtered.isEmpty)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: w.bgColor,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: w.borderColor),
            ),
            child: Text(
              'Try a different search',
              style: TextStyle(color: muted, fontSize: 13),
            ),
          )
        else
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  key: ValueKey('primary_$_primaryDropdownKey'),
                  initialValue: primaryVal != null &&
                          filtered.any((s) => s.id == primaryVal)
                      ? primaryVal
                      : null,
                  isExpanded: true,
                  decoration: _fieldDeco(
                    hint: 'Select service',
                    icon: Icons.spa_outlined,
                    accent: accent,
                    muted: muted,
                    border: w.borderColor,
                    bg: w.bgColor,
                  ),
                  icon: Icon(
                    Icons.keyboard_arrow_down_rounded,
                    color: muted.withValues(alpha: 0.7),
                    size: 22,
                  ),
                  items: filtered
                      .map(
                        (s) => DropdownMenuItem(
                          value: s.id,
                          child: _serviceItem(s, muted),
                        ),
                      )
                      .toList(),
                  onChanged: w.onPrimaryChanged,
                ),
              ),
              if (primaryPrice != null) ...[
                const SizedBox(width: 8),
                primaryPrice,
              ],
            ],
          ),

        if (extraIds.isNotEmpty) ...[
          const SizedBox(height: 8),
          ...List.generate(extraIds.length, (i) {
            final extraId = extraIds[i];
            final extraFiltered = _filteredServices(keepId: extraId);
            final extraVal = extraFiltered.any((s) => s.id == extraId)
                ? extraId
                : null;
            final price = _inlinePrice(extraId);
            return Padding(
              padding:
                  EdgeInsets.only(bottom: i == extraIds.length - 1 ? 0 : 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      key: ValueKey('extra_${_extraDropdownKey}_${i}_$extraId'),
                      initialValue: extraVal,
                      isExpanded: true,
                      decoration: _fieldDeco(
                        hint: 'Additional service',
                        icon: Icons.spa_outlined,
                        accent: accent.withValues(alpha: 0.75),
                        muted: muted,
                        border: w.borderColor,
                        bg: w.bgColor,
                      ).copyWith(
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 11,
                        ),
                      ),
                      icon: Icon(
                        Icons.keyboard_arrow_down_rounded,
                        color: muted.withValues(alpha: 0.7),
                        size: 22,
                      ),
                      items: extraFiltered
                          .map(
                            (s) => DropdownMenuItem(
                              value: s.id,
                              child: _serviceItem(s, muted, nameSize: 13),
                            ),
                          )
                          .toList(),
                      onChanged: (v) {
                        if (v == null || v == extraId) return;
                        w.onRemoveExtraAt(i);
                        w.onAddExtra(v);
                      },
                    ),
                  ),
                  if (price != null) ...[
                    const SizedBox(width: 8),
                    price,
                  ],
                  const SizedBox(width: 4),
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: IconButton(
                      tooltip: 'Remove',
                      onPressed: () => w.onRemoveExtraAt(i),
                      style: IconButton.styleFrom(
                        backgroundColor: accent.withValues(alpha: 0.08),
                        foregroundColor: accent,
                      ),
                      icon: const Icon(Icons.close_rounded, size: 18),
                    ),
                  ),
                ],
              ),
            );
          }),
        ],

        if (hasPrimary && filtered.isNotEmpty) ...[
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            key: ValueKey('extra_add_$_extraDropdownKey'),
            initialValue: null,
            isExpanded: true,
            decoration: _fieldDeco(
              hint: 'Add another service',
              icon: Icons.add_circle_outline_rounded,
              accent: accent.withValues(alpha: 0.6),
              muted: muted,
              border: w.borderColor,
              bg: w.bgColor,
            ).copyWith(
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
              hintStyle:
                  const TextStyle(color: Color(0xFFB0B8B0), fontSize: 13.5),
            ),
            icon: Icon(
              Icons.keyboard_arrow_down_rounded,
              color: muted.withValues(alpha: 0.55),
              size: 20,
            ),
            items: filtered
                .map(
                  (s) => DropdownMenuItem(
                    value: s.id,
                    child: _serviceItem(s, muted, nameSize: 13.5),
                  ),
                )
                .toList(),
            onChanged: (id) {
              if (id == null) return;
              w.onAddExtra(id);
              setState(() => _extraDropdownKey++);
            },
          ),
        ],

        if (w.orderedServiceIds.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 6, left: 4),
            child: Text(
              'Select at least one service',
              style: TextStyle(color: Colors.red.shade400, fontSize: 11.5),
            ),
          )
        else if (w.pricesEditable)
          Padding(
            padding: const EdgeInsets.only(top: 8, left: 4),
            child: Text(
              'Select a service, then change its price on the right.',
              style: TextStyle(
                color: muted.withValues(alpha: 0.85),
                fontSize: 11.5,
                fontWeight: FontWeight.w500,
              ),
            ),
          )
        else if (w.helperText.trim().isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8, left: 4),
            child: Text(
              w.helperText,
              style: TextStyle(
                color: muted.withValues(alpha: 0.85),
                fontSize: 11.5,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
      ],
    );
  }
}
