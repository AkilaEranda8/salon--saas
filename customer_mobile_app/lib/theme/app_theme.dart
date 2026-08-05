import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Quiet salon palette — charcoal ink + muted blush accent.
class AppColors {
  static const ink = Color(0xFF1A1614);
  static const inkSoft = Color(0xFF4A433C);
  static const muted = Color(0xFF8A8278);
  static const line = Color(0xFFE8E2DA);
  static const surface = Color(0xFFFFFBF7);
  static const card = Color(0xFFFFFFFF);
  static const blush = Color(0xFFC4787A);
  static const blushDeep = Color(0xFFA85D60);
  static const blushSoft = Color(0xFFF7E8E8);
  static const washTop = Color(0xFFF3EBE4);
  static const washBottom = Color(0xFFFFFBF7);
  static const success = Color(0xFF2F6B4F);
  static const successSoft = Color(0xFFE8F3EC);
  static const warning = Color(0xFF9A6B2F);
  static const warningSoft = Color(0xFFF8F0E4);
  static const danger = Color(0xFFA33B3B);
}

class AppTheme {
  static ThemeData light() {
    final display = GoogleFonts.frauncesTextTheme();
    final body = GoogleFonts.dmSansTextTheme();

    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: AppColors.surface,
      colorScheme: ColorScheme.fromSeed(
        seedColor: AppColors.blush,
        primary: AppColors.blush,
        onPrimary: Colors.white,
        secondary: AppColors.ink,
        surface: AppColors.surface,
        error: AppColors.danger,
      ),
    );

    return base.copyWith(
      textTheme: body.copyWith(
        displayLarge: display.displayLarge?.copyWith(
          color: AppColors.ink,
          fontWeight: FontWeight.w600,
        ),
        displayMedium: display.displayMedium?.copyWith(
          color: AppColors.ink,
          fontWeight: FontWeight.w600,
        ),
        headlineLarge: display.headlineLarge?.copyWith(
          color: AppColors.ink,
          fontWeight: FontWeight.w600,
          fontSize: 28,
        ),
        headlineMedium: display.headlineMedium?.copyWith(
          color: AppColors.ink,
          fontWeight: FontWeight.w600,
          fontSize: 22,
        ),
        headlineSmall: display.headlineSmall?.copyWith(
          color: AppColors.ink,
          fontWeight: FontWeight.w600,
          fontSize: 18,
        ),
        titleLarge: body.titleLarge?.copyWith(
          color: AppColors.ink,
          fontWeight: FontWeight.w700,
        ),
        titleMedium: body.titleMedium?.copyWith(
          color: AppColors.ink,
          fontWeight: FontWeight.w600,
        ),
        bodyLarge: body.bodyLarge?.copyWith(color: AppColors.inkSoft, height: 1.45),
        bodyMedium: body.bodyMedium?.copyWith(color: AppColors.inkSoft, height: 1.4),
        bodySmall: body.bodySmall?.copyWith(color: AppColors.muted),
        labelLarge: body.labelLarge?.copyWith(
          color: AppColors.ink,
          fontWeight: FontWeight.w700,
        ),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        foregroundColor: AppColors.ink,
        titleTextStyle: display.titleLarge?.copyWith(
          color: AppColors.ink,
          fontWeight: FontWeight.w600,
          fontSize: 20,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white.withValues(alpha: 0.85),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.blush, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.danger),
        ),
        labelStyle: const TextStyle(color: AppColors.muted),
        hintStyle: const TextStyle(color: AppColors.muted),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: Colors.white,
        selectedItemColor: AppColors.blushDeep,
        unselectedItemColor: AppColors.muted,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppColors.ink,
        contentTextStyle: body.bodyMedium?.copyWith(color: Colors.white),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }
}
