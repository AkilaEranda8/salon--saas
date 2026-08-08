import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Light salon palette — soft cream surfaces + blush accent (no dark chrome).
class AppColors {
  static const ink = Color(0xFF3D342F);
  static const inkSoft = Color(0xFF6B5E55);
  static const muted = Color(0xFF9A8F86);
  static const line = Color(0xFFEDE6DF);
  static const surface = Color(0xFFFFFCF9);
  static const card = Color(0xFFFFFFFF);
  static const blush = Color(0xFFD4898B);
  static const blushDeep = Color(0xFFB86B6E);
  static const blushSoft = Color(0xFFF9EEEE);
  static const washTop = Color(0xFFF8F1EB);
  static const washBottom = Color(0xFFFFFCF9);
  static const success = Color(0xFF3D7A5C);
  static const successSoft = Color(0xFFEAF5EF);
  static const warning = Color(0xFFB07D3A);
  static const warningSoft = Color(0xFFF9F1E6);
  static const danger = Color(0xFFC45A5A);
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
        brightness: Brightness.light,
        primary: AppColors.blush,
        onPrimary: Colors.white,
        secondary: AppColors.inkSoft,
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
        fillColor: Colors.white,
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
        backgroundColor: AppColors.inkSoft,
        contentTextStyle: body.bodyMedium?.copyWith(color: Colors.white),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }
}
