class AppItem {
  AppItem({
    required this.id,
    required this.title,
    required this.description,
    required this.createdBy,
  });

  final String id;
  final String title;
  final String description;
  final String createdBy;

  AppItem copyWith({
    String? title,
    String? description,
  }) {
    return AppItem(
      id: id,
      title: title ?? this.title,
      description: description ?? this.description,
      createdBy: createdBy,
    );
  }
}
