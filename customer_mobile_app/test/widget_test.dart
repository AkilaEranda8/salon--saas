import 'package:flutter_test/flutter_test.dart';
import 'package:customer_mobile_app/main.dart';

void main() {
  testWidgets('Customer app boots', (WidgetTester tester) async {
    await tester.pumpWidget(const CustomerApp());
    await tester.pump();
    expect(find.byType(CustomerApp), findsOneWidget);
  });
}
