import 'package:flutter/material.dart';
import 'package:lottie/lottie.dart';

import '../theme/app_theme.dart';

/// App loading animation (Lottie).
class AppLoading extends StatelessWidget {
  const AppLoading({
    super.key,
    this.size = 140,
    this.message,
  });

  final double size;
  final String? message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: size,
            height: size,
            child: Lottie.asset(
              'assets/lottie/loading.json',
              fit: BoxFit.contain,
              repeat: true,
            ),
          ),
          if (message != null) ...[
            const SizedBox(height: 12),
            Text(
              message!,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: AppColors.muted,
                  ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Full-screen splash / boot loading.
class AppLoadingScreen extends StatelessWidget {
  const AppLoadingScreen({super.key, this.message});

  final String? message;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surface,
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [AppColors.washTop, AppColors.surface],
          ),
        ),
        child: SafeArea(
          child: AppLoading(message: message),
        ),
      ),
    );
  }
}
