class StaffMember {
  StaffMember({
    required this.id,
    required this.name,
    required this.branchId,
    this.email,
  });

  final String id;
  final String name;
  final String branchId;
  final String? email;

  factory StaffMember.fromJson(Map<String, dynamic> json) {
    return StaffMember(
      id: '${json['id'] ?? ''}',
      name: '${json['name'] ?? ''}',
      branchId: '${json['branch_id'] ?? ''}',
      email: json['email'] != null ? '${json['email']}' : null,
    );
  }
}
