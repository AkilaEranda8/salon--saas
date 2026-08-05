import 'package:flutter/material.dart';

class AppMotion {
  static const Duration fast = Duration(milliseconds: 180);
  static const Duration normal = Duration(milliseconds: 280);
  static const Duration slow = Duration(milliseconds: 420);

  static const Curve easeOut = Curves.easeOutCubic;
  static const Curve easeInOut = Curves.easeInOutCubic;

  static Widget fadeSlide({
    required Animation<double> animation,
    required Widget child,
    Offset begin = const Offset(0.04, 0.06),
  }) {
    return FadeTransition(
      opacity: CurvedAnimation(parent: animation, curve: easeOut),
      child: SlideTransition(
        position: Tween<Offset>(begin: begin, end: Offset.zero).animate(
          CurvedAnimation(parent: animation, curve: easeOut),
        ),
        child: child,
      ),
    );
  }
}
