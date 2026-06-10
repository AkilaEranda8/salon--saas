class SalonService {
  SalonService({
    required this.id,
    required this.name,
    required this.category,
    required this.price,
    required this.durationMinutes,
    this.isActive = true,
    this.commissionType,
    this.commissionValue,
  });

  final String id;
  final String name;
  final String category;
  final double price;
  final int durationMinutes;
  final bool isActive;
  final String? commissionType;
  final double? commissionValue;

  factory SalonService.fromJson(Map<String, dynamic> json) {
    final rawComm = json['commission_value'];
    double? commVal;
    if (rawComm != null && '$rawComm'.trim().isNotEmpty) {
      commVal = rawComm is num
          ? rawComm.toDouble()
          : double.tryParse('$rawComm');
    }
    return SalonService(
      id: '${json['id']}',
      name: '${json['name'] ?? ''}',
      category: '${json['category'] ?? 'Other'}',
      price: double.tryParse('${json['price'] ?? 0}') ?? 0,
      durationMinutes: int.tryParse('${json['duration_minutes'] ?? 0}') ?? 0,
      isActive: json['is_active'] != false,
      commissionType: json['commission_type']?.toString(),
      commissionValue: commVal,
    );
  }
}
