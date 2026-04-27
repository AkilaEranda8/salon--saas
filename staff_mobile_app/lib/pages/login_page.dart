import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../pages/dashboard_page.dart';
import '../state/app_state.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> with TickerProviderStateMixin {
  final _formKey = GlobalKey<FormState>();
  final _slugController     = TextEditingController();
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;
  bool _loading = false;
  String? _error;

  late AnimationController _entranceController;
  late AnimationController _logoController;
  late AnimationController _orbController;
  late AnimationController _buttonPulseController;

  late Animation<double> _fadeAnim;
  late Animation<Offset> _slideAnim;
  late Animation<double> _logoScaleAnim;
  late Animation<double> _logoRotateAnim;
  late Animation<double> _orbAnim;
  late Animation<double> _buttonPulseAnim;

  @override
  void initState() {
    super.initState();

    SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
    ));

    _orbController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 7),
    )..repeat(reverse: true);

    _logoController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    );

    _entranceController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );

    _buttonPulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat(reverse: true);

    _fadeAnim = CurvedAnimation(
      parent: _entranceController,
      curve: Curves.easeOut,
    );
    _slideAnim = Tween<Offset>(
      begin: const Offset(0, 0.4),
      end: Offset.zero,
    ).animate(
      CurvedAnimation(parent: _entranceController, curve: Curves.easeOutCubic),
    );
    _logoScaleAnim = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _logoController, curve: Curves.elasticOut),
    );
    _logoRotateAnim = Tween<double>(begin: -0.15, end: 0.0).animate(
      CurvedAnimation(parent: _logoController, curve: Curves.easeOutBack),
    );
    _orbAnim =
        CurvedAnimation(parent: _orbController, curve: Curves.easeInOut);
    _buttonPulseAnim = Tween<double>(begin: 0.95, end: 1.0).animate(
      CurvedAnimation(parent: _buttonPulseController, curve: Curves.easeInOut),
    );

    Future.delayed(const Duration(milliseconds: 150), () {
      if (mounted) {
        _logoController.forward();
        _entranceController.forward();
      }
    });
    _loadSavedSlug();
  }

  Future<void> _loadSavedSlug() async {
    final prefs = await SharedPreferences.getInstance();
    final slug = prefs.getString('salon_slug') ?? '';
    if (slug.isNotEmpty && mounted) {
      setState(() => _slugController.text = slug);
    }
  }

  @override
  void dispose() {
    _entranceController.dispose();
    _logoController.dispose();
    _orbController.dispose();
    _buttonPulseController.dispose();
    _slugController.dispose();
    _usernameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    if (!_formKey.currentState!.validate()) return;
    final slug = _slugController.text.trim().toLowerCase();
    if (slug.isEmpty) {
      setState(() => _error = 'Salon name is required');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    final appState = AppStateScope.of(context);
    appState.setSlug(slug);
    await appState.saveSlug(slug);
    final ok = await appState.loginStaff(
      _usernameController.text,
      _passwordController.text,
    );

    if (!ok) {
      setState(() {
        _loading = false;
        _error = appState.lastError ?? 'Login failed';
      });
      return;
    }

    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const DashboardPage()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;

    return Scaffold(
      resizeToAvoidBottomInset: true,
      body: Container(
        width: double.infinity,
        height: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Color(0xFF0D0912),
              Color(0xFF160E1E),
              Color(0xFF0B0910),
            ],
            stops: [0.0, 0.55, 1.0],
          ),
        ),
        child: Stack(
          children: [
            // Animated background orbs
            AnimatedBuilder(
              animation: _orbAnim,
              builder: (context, _) {
                final v = _orbAnim.value;
                return Stack(
                  children: [
                    Positioned(
                      top: -80 + (v * 40),
                      right: -100 + (v * 25),
                      child: _buildOrb(260, const Color(0x22C9956C)),
                    ),
                    Positioned(
                      top: -40 + (v * 20),
                      right: -50,
                      child: _buildOrb(140, const Color(0x15E8C96D)),
                    ),
                    Positioned(
                      bottom: size.height * 0.1 - (v * 30),
                      left: -120 + (v * 15),
                      child: _buildOrb(300, const Color(0x188B5CF6)),
                    ),
                    Positioned(
                      top: size.height * 0.42 + (v * 20),
                      right: -70,
                      child: _buildOrb(180, const Color(0x20C77D8B)),
                    ),
                    Positioned(
                      top: size.height * 0.22 + (v * 10),
                      left: -40 + (v * 20),
                      child: _buildOrb(110, const Color(0x12D4A574)),
                    ),
                  ],
                );
              },
            ),

            // Top decorative line
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: Container(
                height: 2,
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      Colors.transparent,
                      Color(0x80C9956C),
                      Color(0xFFC9956C),
                      Color(0x80C9956C),
                      Colors.transparent,
                    ],
                  ),
                ),
              ),
            ),

            // Main content
            SafeArea(
              child: FadeTransition(
                opacity: _fadeAnim,
                child: SingleChildScrollView(
                  physics: const BouncingScrollPhysics(),
                  padding: EdgeInsets.symmetric(
                    horizontal: 26,
                    vertical: size.height * 0.03,
                  ),
                  child: Column(
                    children: [
                      SizedBox(height: size.height * 0.04),

                      // Logo & brand
                      AnimatedBuilder(
                        animation: _logoController,
                        builder: (context, child) {
                          return Transform.scale(
                            scale: _logoScaleAnim.value,
                            child: Transform.rotate(
                              angle: _logoRotateAnim.value,
                              child: child,
                            ),
                          );
                        },
                        child: _buildBrand(),
                      ),

                      SizedBox(height: size.height * 0.055),

                      // Form card
                      SlideTransition(
                        position: _slideAnim,
                        child: FadeTransition(
                          opacity: _fadeAnim,
                          child: _buildFormCard(),
                        ),
                      ),

                      const SizedBox(height: 28),

                      // Footer
                      FadeTransition(
                        opacity: _fadeAnim,
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Container(
                              width: 16,
                              height: 1,
                              color: const Color(0x40C9956C),
                            ),
                            const SizedBox(width: 10),
                            Text(
                              '© ${DateTime.now().year} Hexa Salon',
                              style: const TextStyle(
                                color: Color(0x55F5EEE8),
                                fontSize: 11,
                                letterSpacing: 0.5,
                              ),
                            ),
                            const SizedBox(width: 10),
                            Container(
                              width: 16,
                              height: 1,
                              color: const Color(0x40C9956C),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildOrb(double size, Color color) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: color,
      ),
    );
  }

  Widget _buildBrand() {
    return Column(
      children: [
        // Logo image
        Container(
          width: 110,
          height: 110,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(30),
            boxShadow: const [
              BoxShadow(
                color: Color(0x70C9956C),
                blurRadius: 35,
                spreadRadius: 0,
                offset: Offset(0, 14),
              ),
              BoxShadow(
                color: Color(0x30E8C96D),
                blurRadius: 70,
                spreadRadius: 10,
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(30),
            child: Image.asset(
              'assets/images/logo.png',
              fit: BoxFit.cover,
            ),
          ),
        ),
        const SizedBox(height: 18),

        // Salon name
        const Text(
          'HEXA SALON',
          style: TextStyle(
            color: Color(0xFFF5EEE8),
            fontSize: 30,
            fontWeight: FontWeight.w800,
            letterSpacing: 5.0,
          ),
        ),
        const SizedBox(height: 8),

        // Badge
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 5),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: const Color(0x55C9956C), width: 1),
            color: const Color(0x15C9956C),
          ),
          child: const Text(
            'STAFF PORTAL',
            style: TextStyle(
              color: Color(0xFFC9956C),
              fontSize: 10.5,
              fontWeight: FontWeight.w700,
              letterSpacing: 3.0,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildFormCard() {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Colors.white.withValues(alpha: 0.09),
            Colors.white.withValues(alpha: 0.04),
          ],
        ),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.11),
          width: 1,
        ),
        boxShadow: const [
          BoxShadow(
            color: Color(0x50000000),
            blurRadius: 50,
            offset: Offset(0, 25),
          ),
        ],
      ),
      padding: const EdgeInsets.fromLTRB(26, 28, 26, 24),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Card header
            Row(
              children: [
                Container(
                  width: 4,
                  height: 32,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(2),
                    gradient: const LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [Color(0xFFE0B585), Color(0xFFC9956C)],
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Welcome Back',
                      style: TextStyle(
                        color: Color(0xFFF5EEE8),
                        fontSize: 22,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.3,
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'Sign in to your staff account',
                      style: TextStyle(
                        color: Color(0x80F5EEE8),
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ],
            ),

            const SizedBox(height: 26),

            // Salon slug field
            _buildInputField(
              controller: _slugController,
              label: 'Salon Name (e.g. xanesalon)',
              icon: Icons.store_outlined,
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Salon name is required' : null,
            ),
            const SizedBox(height: 14),

            // Username field
            _buildInputField(
              controller: _usernameController,
              label: 'Username',
              icon: Icons.person_outline_rounded,
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Username is required' : null,
            ),
            const SizedBox(height: 14),

            // Password field
            _buildInputField(
              controller: _passwordController,
              label: 'Password',
              icon: Icons.lock_outline_rounded,
              obscure: _obscurePassword,
              suffixIcon: IconButton(
                onPressed: () =>
                    setState(() => _obscurePassword = !_obscurePassword),
                icon: Icon(
                  _obscurePassword
                      ? Icons.visibility_outlined
                      : Icons.visibility_off_outlined,
                  color: const Color(0x70F5EEE8),
                  size: 20,
                ),
              ),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Password is required' : null,
            ),

            // Error message
            if (_error != null) ...[
              const SizedBox(height: 14),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                decoration: BoxDecoration(
                  color: const Color(0x20FF4D4D),
                  borderRadius: BorderRadius.circular(12),
                  border:
                      Border.all(color: const Color(0x55FF4D4D), width: 1),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.error_outline_rounded,
                        color: Color(0xFFFF7B7B), size: 17),
                    const SizedBox(width: 9),
                    Expanded(
                      child: Text(
                        _error!,
                        style: const TextStyle(
                          color: Color(0xFFFF7B7B),
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],

            const SizedBox(height: 26),

            // Login button
            _buildLoginButton(),

            const SizedBox(height: 20),

            // Divider
            Row(
              children: [
                Expanded(
                  child: Container(
                    height: 1,
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        colors: [Colors.transparent, Color(0x40F5EEE8)],
                      ),
                    ),
                  ),
                ),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 14),
                  child: Row(
                    children: [
                      Icon(Icons.shield_outlined,
                          color: Color(0x55C9956C), size: 13),
                      SizedBox(width: 5),
                      Text(
                        'Secure Access',
                        style: TextStyle(
                          color: Color(0x55F5EEE8),
                          fontSize: 11,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: Container(
                    height: 1,
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        colors: [Color(0x40F5EEE8), Colors.transparent],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInputField({
    required TextEditingController controller,
    required String label,
    required IconData icon,
    bool obscure = false,
    Widget? suffixIcon,
    String? Function(String?)? validator,
  }) {
    return TextFormField(
      controller: controller,
      obscureText: obscure,
      style: const TextStyle(
        color: Color(0xFFF5EEE8),
        fontSize: 15,
        letterSpacing: 0.3,
      ),
      validator: validator,
      decoration: InputDecoration(
        labelText: label,
        labelStyle: const TextStyle(
          color: Color(0x80F5EEE8),
          fontSize: 14,
        ),
        prefixIcon: Icon(icon, color: const Color(0xFFC9956C), size: 21),
        suffixIcon: suffixIcon,
        filled: true,
        fillColor: Colors.white.withValues(alpha: 0.055),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0x35F5EEE8), width: 1),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0xFFC9956C), width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0x70FF4D4D), width: 1),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0xFFFF7B7B), width: 1.5),
        ),
        errorStyle: const TextStyle(color: Color(0xFFFF7B7B), fontSize: 12),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 17),
      ),
    );
  }

  Widget _buildLoginButton() {
    return AnimatedBuilder(
      animation: _buttonPulseAnim,
      builder: (context, child) {
        return Transform.scale(
          scale: _loading ? 1.0 : _buttonPulseAnim.value,
          child: child,
        );
      },
      child: Container(
        height: 56,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: const LinearGradient(
            colors: [
              Color(0xFFE0B585),
              Color(0xFFC9956C),
              Color(0xFFAA7348),
            ],
          ),
          boxShadow: const [
            BoxShadow(
              color: Color(0x65C9956C),
              blurRadius: 24,
              offset: Offset(0, 10),
            ),
            BoxShadow(
              color: Color(0x30E8C96D),
              blurRadius: 50,
              spreadRadius: 0,
            ),
          ],
        ),
        child: Material(
          color: Colors.transparent,
          borderRadius: BorderRadius.circular(16),
          child: InkWell(
            onTap: _loading ? null : _handleLogin,
            borderRadius: BorderRadius.circular(16),
            splashColor: Colors.white.withValues(alpha: 0.2),
            child: Center(
              child: _loading
                  ? const SizedBox(
                      width: 23,
                      height: 23,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.5,
                        color: Colors.white,
                      ),
                    )
                  : const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          'Sign In',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 1.0,
                          ),
                        ),
                        SizedBox(width: 10),
                        Icon(
                          Icons.arrow_forward_rounded,
                          color: Colors.white,
                          size: 19,
                        ),
                      ],
                    ),
            ),
          ),
        ),
      ),
    );
  }
}
