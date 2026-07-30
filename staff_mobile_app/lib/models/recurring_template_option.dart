class RecurringTemplateOption {
  const RecurringTemplateOption({
    required this.id,
    required this.name,
    required this.channel,
    this.isDefault = false,
  });

  final String id;
  final String name;
  final String channel;
  final bool isDefault;

  factory RecurringTemplateOption.fromJson(Map<String, dynamic> json) {
    return RecurringTemplateOption(
      id: '${json['id']}',
      name: '${json['name'] ?? 'Template'}',
      channel: '${json['channel'] ?? ''}',
      isDefault: json['is_default'] == true,
    );
  }

  String get channelLabel {
    switch (channel) {
      case 'whatsapp':
        return 'WhatsApp';
      case 'sms':
        return 'SMS';
      case 'email':
        return 'Email';
      default:
        return channel;
    }
  }
}

String defaultRecurringNextDate([String? baseDate]) {
  final parsed = DateTime.tryParse((baseDate ?? '').trim());
  final base = parsed ?? DateTime.now();
  final next = DateTime(base.year, base.month, base.day).add(const Duration(days: 7));
  final y = next.year.toString().padLeft(4, '0');
  final m = next.month.toString().padLeft(2, '0');
  final d = next.day.toString().padLeft(2, '0');
  return '$y-$m-$d';
}
