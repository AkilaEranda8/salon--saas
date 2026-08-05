import 'package:flutter/material.dart';

import '../models/recurring_template_option.dart';

/// Toggle + reminder date/time + SMS/WhatsApp template checkboxes.
class RecurringBookingSection extends StatelessWidget {
  const RecurringBookingSection({
    required this.enabled,
    required this.nextDate,
    required this.selectedTemplateIds,
    required this.templates,
    required this.onEnabledChanged,
    required this.onNextDateChanged,
    required this.onTemplateIdsChanged,
    this.smsTime = '08:00',
    this.onSmsTimeChanged,
    this.loadingTemplates = false,
    this.accentColor = const Color(0xFF2563EB),
    this.minDate,
    this.label = 'Recurring reminder',
    super.key,
  });

  final bool enabled;
  final String nextDate;
  final String smsTime;
  final List<String> selectedTemplateIds;
  final List<RecurringTemplateOption> templates;
  final ValueChanged<bool> onEnabledChanged;
  final ValueChanged<String> onNextDateChanged;
  final ValueChanged<List<String>> onTemplateIdsChanged;
  final ValueChanged<String>? onSmsTimeChanged;
  final bool loadingTemplates;
  final Color accentColor;
  final DateTime? minDate;
  final String label;

  Future<void> _pickDate(BuildContext context) async {
    final initial = DateTime.tryParse(nextDate) ?? DateTime.now().add(const Duration(days: 7));
    final first = minDate ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      firstDate: DateTime(first.year, first.month, first.day),
      lastDate: DateTime(2035),
      initialDate: initial.isBefore(first) ? first : initial,
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: ColorScheme.light(
            primary: accentColor,
            onPrimary: Colors.white,
            surface: Colors.white,
          ),
        ),
        child: child!,
      ),
    );
    if (picked == null) return;
    final y = picked.year.toString().padLeft(4, '0');
    final m = picked.month.toString().padLeft(2, '0');
    final d = picked.day.toString().padLeft(2, '0');
    onNextDateChanged('$y-$m-$d');
  }

  Future<void> _pickTime(BuildContext context) async {
    if (onSmsTimeChanged == null) return;
    final parts = smsTime.split(':');
    final initial = TimeOfDay(
      hour: int.tryParse(parts.isNotEmpty ? parts[0] : '8') ?? 8,
      minute: int.tryParse(parts.length > 1 ? parts[1] : '0') ?? 0,
    );
    final picked = await showTimePicker(
      context: context,
      initialTime: initial,
    );
    if (picked == null) return;
    final h = picked.hour.toString().padLeft(2, '0');
    final m = picked.minute.toString().padLeft(2, '0');
    onSmsTimeChanged!('$h:$m');
  }

  void _toggleTemplate(RecurringTemplateOption template) {
    final id = template.id;
    final selected = List<String>.from(selectedTemplateIds);
    if (selected.contains(id)) {
      selected.remove(id);
      onTemplateIdsChanged(selected);
      return;
    }
    final sameChannelIds = templates
        .where((t) => t.channel == template.channel)
        .map((t) => t.id)
        .toSet();
    selected.removeWhere(sameChannelIds.contains);
    selected.add(id);
    onTemplateIdsChanged(selected);
  }

  @override
  Widget build(BuildContext context) {
    final light = Color.lerp(accentColor, Colors.white, 0.88) ?? const Color(0xFFEFF6FF);
    final border = Color.lerp(accentColor, Colors.white, 0.55) ?? const Color(0xFFBFDBFE);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: enabled ? light : const Color(0xFFF9FAFB),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: enabled ? border : const Color(0xFFE5E7EB)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label.toUpperCase(),
                      style: const TextStyle(
                        color: Color(0xFF6B7280),
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.5,
                      ),
                    ),
                    const SizedBox(height: 2),
                    const Text(
                      'SMS reminder only — does not book an appointment',
                      style: TextStyle(color: Color(0xFF9CA3AF), fontSize: 11.5),
                    ),
                  ],
                ),
              ),
              Switch.adaptive(
                value: enabled,
                activeThumbColor: accentColor,
                activeTrackColor: accentColor.withValues(alpha: 0.4),
                onChanged: onEnabledChanged,
              ),
            ],
          ),
          if (enabled) ...[
            const SizedBox(height: 10),
            const Text(
              'REMINDER DATE',
              style: TextStyle(
                color: Color(0xFF6B7280),
                fontSize: 11.5,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.5,
              ),
            ),
            const SizedBox(height: 6),
            InkWell(
              onTap: () => _pickDate(context),
              borderRadius: BorderRadius.circular(12),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFE5E7EB)),
                ),
                child: Row(
                  children: [
                    Icon(Icons.event_rounded, color: accentColor, size: 18),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        nextDate.isEmpty ? 'Select date' : nextDate,
                        style: const TextStyle(
                          color: Color(0xFF111827),
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    const Icon(Icons.chevron_right_rounded, color: Color(0xFF9CA3AF)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 10),
            const Text(
              'SMS SEND TIME',
              style: TextStyle(
                color: Color(0xFF6B7280),
                fontSize: 11.5,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.5,
              ),
            ),
            const SizedBox(height: 6),
            InkWell(
              onTap: onSmsTimeChanged == null ? null : () => _pickTime(context),
              borderRadius: BorderRadius.circular(12),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFE5E7EB)),
                ),
                child: Row(
                  children: [
                    Icon(Icons.schedule_rounded, color: accentColor, size: 18),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        smsTime.isEmpty ? '08:00' : smsTime,
                        style: const TextStyle(
                          color: Color(0xFF111827),
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    const Icon(Icons.chevron_right_rounded, color: Color(0xFF9CA3AF)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 4),
            const Text(
              'Message is sent at this time on the reminder date (Sri Lanka time).',
              style: TextStyle(color: Color(0xFF9CA3AF), fontSize: 11.5),
            ),
            const SizedBox(height: 12),
            const Text(
              'REMINDER MESSAGES',
              style: TextStyle(
                color: Color(0xFF6B7280),
                fontSize: 11.5,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.5,
              ),
            ),
            const SizedBox(height: 6),
            if (loadingTemplates)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: LinearProgressIndicator(minHeight: 2),
              )
            else if (templates.isEmpty)
              const Text(
                'No saved templates yet — add them in Notifications → Message Templates → Recurring Visit Reminder.',
                style: TextStyle(color: Color(0xFF9CA3AF), fontSize: 12),
              )
            else
              ...templates.map((template) {
                final checked = selectedTemplateIds.contains(template.id);
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: InkWell(
                    onTap: () => _toggleTemplate(template),
                    borderRadius: BorderRadius.circular(10),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 9),
                      decoration: BoxDecoration(
                        color: checked ? light : Colors.white,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: checked ? accentColor : const Color(0xFFDCE6F3),
                        ),
                      ),
                      child: Row(
                        children: [
                          SizedBox(
                            width: 22,
                            height: 22,
                            child: Checkbox(
                              value: checked,
                              activeColor: accentColor,
                              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                              visualDensity: VisualDensity.compact,
                              onChanged: (_) => _toggleTemplate(template),
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            template.channelLabel,
                            style: const TextStyle(
                              color: Color(0xFF1E293B),
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          Expanded(
                            child: Text(
                              ' — ${template.name}',
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Color(0xFF1E293B),
                                fontSize: 13,
                              ),
                            ),
                          ),
                          if (template.isDefault)
                            Text(
                              'default',
                              style: TextStyle(
                                color: accentColor,
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                );
              }),
            if (templates.isNotEmpty)
              const Text(
                'Tick one SMS and one WhatsApp template to send both. Leave all unticked to use the default recurring messages.',
                style: TextStyle(color: Color(0xFF9CA3AF), fontSize: 12),
              ),
          ],
        ],
      ),
    );
  }
}
