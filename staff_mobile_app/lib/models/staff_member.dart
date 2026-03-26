class StaffMember {
  StaffMember({required this.id, required this.name, required this.branchId});

  final String id;
  final String name;
  final String branchId;

  factory StaffMember.fromJson(Map<String, dynamic> json) {
    return StaffMember(
      id: '${json['id'] ?? ''}',
      name: '${json['name'] ?? ''}',
      branchId: '${json['branch_id'] ?? ''}',
    );
  }
}
