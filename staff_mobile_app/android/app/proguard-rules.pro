# Flutter
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }

# Firebase
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }

# Local Auth (biometric)
-keep class androidx.biometric.** { *; }

# App entry
-keep class com.hexalyte.salonstaff.** { *; }

# Play Core (deferred components — not used, suppress R8 warnings)
-dontwarn com.google.android.play.core.**
