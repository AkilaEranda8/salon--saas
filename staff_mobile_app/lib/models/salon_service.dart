class SalonService {
  SalonService({
    required this.id,
    required this.name,
    required this.category,
    required this.price,
    required this.durationMinutes,
    this.isActive = true,
  });

  final String id;
  final String name;
  final String category;
  final double price;
  final int durationMinutes;
  final bool isActive;

  factory SalonService.fromJson(Map<String, dynamic> json) {
    return SalonService(
      id: '${json['id']}',
      name: '${json['name'] ?? ''}',
      category: '${json['category'] ?? 'Other'}',
      price: double.tryParse('${json['price'] ?? 0}') ?? 0,
      durationMinutes: int.tryParse('${json['duration_minutes'] ?? 0}') ?? 0,
      isActive: json['is_active'] != false,
    );
  }
}
