import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

import '../state/app_state.dart';

// ── Palette ───────────────────────────────────────────────────────────────────
const Color _forest  = Color(0xFF1B3A2D);
const Color _emerald = Color(0xFF2D6A4F);
const Color _canvas  = Color(0xFFF2F5F2);
const Color _surface = Color(0xFFFFFFFF);
const Color _border  = Color(0xFFE5E7EB);
const Color _ink     = Color(0xFF111827);
const Color _muted   = Color(0xFF6B7280);

// ── Quick suggestion prompts ──────────────────────────────────────────────────
const _suggestions = [
  ("Today's appointments",    Icons.event_note_rounded),
  ("Revenue this month",      Icons.account_balance_wallet_rounded),
  ("Pending confirmations",   Icons.pending_actions_rounded),
  ("Top services this week",  Icons.content_cut_rounded),
  ("Walk-in queue status",    Icons.directions_walk_rounded),
  ("Staff performance",       Icons.badge_rounded),
];

// ─────────────────────────────────────────────────────────────────────────────
class AiChatPage extends StatefulWidget {
  const AiChatPage({super.key});
  @override
  State<AiChatPage> createState() => _AiChatPageState();
}

class _AiChatPageState extends State<AiChatPage>
    with TickerProviderStateMixin {
  final _ctrl       = TextEditingController();
  final _scrollCtrl = ScrollController();
  final List<_Msg>  _msgs = [];
  bool _typing      = false;
  String? _sessionId;
  late AnimationController _dotCtrl;

  static const _aiBotUrl = 'https://api.salon.hexalyte.com/ai/chat';

  @override
  void initState() {
    super.initState();
    _dotCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900))
      ..repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _scrollCtrl.dispose();
    _dotCtrl.dispose();
    super.dispose();
  }

  void _send([String? override]) {
    final text = (override ?? _ctrl.text).trim();
    if (text.isEmpty || _typing) return;
    setState(() {
      _msgs.insert(0, _Msg(text: text, fromUser: true));
      _typing = true;
    });
    _ctrl.clear();
    _callBot(text);
  }

  Future<void> _callBot(String message) async {
    final token = AppStateScope.of(context).currentUser?.authToken;
    try {
      final response = await http.post(
        Uri.parse(_aiBotUrl),
        headers: {
          'Content-Type': 'application/json',
          if (token != null && token.isNotEmpty)
            'Authorization': 'Bearer $token',
        },
        body: jsonEncode({
          'message':    message,
          if (_sessionId != null) 'session_id': _sessionId,
        }),
      ).timeout(const Duration(seconds: 20));

      if (!mounted) return;
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        _sessionId = data['session_id'] as String?;
        final reply = data['reply'] as String? ?? 'No response from AI.';
        setState(() {
          _typing = false;
          _msgs.insert(0, _Msg(text: reply, fromUser: false));
        });
      } else {
        setState(() {
          _typing = false;
          _msgs.insert(0, _Msg(
            text: 'AI bot error (${response.statusCode}). Please try again.',
            fromUser: false,
            isError: true,
          ));
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _typing = false;
        _msgs.insert(0, _Msg(
          text: 'Could not reach AI bot. Check your connection.',
          fromUser: false,
          isError: true,
        ));
      });
    }
  }

  void _clear() {
    if (_msgs.isEmpty) return;
    setState(() { _msgs.clear(); _typing = false; });
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark,
      child: Scaffold(
        backgroundColor: _canvas,
        resizeToAvoidBottomInset: true,
        body: Column(children: [
          _buildHeader(),
          Expanded(
            child: _msgs.isEmpty && !_typing
                ? _buildWelcome()
                : _buildChat(),
          ),
          _buildInput(bottom),
        ]),
      ),
    );
  }

  // ── Header ─────────────────────────────────────────────────────────────────
  Widget _buildHeader() => Container(
    color: _canvas,
    child: SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 16, 12),
        child: Row(children: [
          GestureDetector(
            onTap: () => Navigator.of(context).maybePop(),
            child: Container(
              width: 36, height: 36,
              decoration: BoxDecoration(
                shape: BoxShape.circle, color: _surface,
                boxShadow: [BoxShadow(
                  color: Colors.black.withValues(alpha: 0.07),
                  blurRadius: 8, offset: const Offset(0, 2))],
              ),
              child: const Icon(Icons.arrow_back_ios_new_rounded,
                  color: _forest, size: 15),
            ),
          ),
          const SizedBox(width: 12),
          // AI avatar
          Container(
            width: 38, height: 38,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [_forest, _emerald],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight),
              shape: BoxShape.circle),
            child: const Icon(Icons.auto_awesome_rounded,
                color: Colors.white, size: 18),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Hexa Salon AI',
                  style: TextStyle(
                    color: _ink, fontSize: 15,
                    fontWeight: FontWeight.w800, letterSpacing: -0.2)),
                Row(children: [
                  Container(
                    width: 7, height: 7,
                    decoration: const BoxDecoration(
                      color: Color(0xFF22C55E), shape: BoxShape.circle)),
                  const SizedBox(width: 5),
                  const Text('Online',
                    style: TextStyle(
                      color: Color(0xFF22C55E), fontSize: 11.5,
                      fontWeight: FontWeight.w600)),
                ]),
              ],
            ),
          ),
          if (_msgs.isNotEmpty)
            GestureDetector(
              onTap: _clear,
              child: Container(
                width: 36, height: 36,
                decoration: BoxDecoration(
                  color: _surface, shape: BoxShape.circle,
                  boxShadow: [BoxShadow(
                    color: Colors.black.withValues(alpha: 0.07),
                    blurRadius: 8, offset: const Offset(0, 2))],
                ),
                child: const Icon(Icons.delete_outline_rounded,
                    color: _muted, size: 17),
              ),
            ),
        ]),
      ),
    ),
  );

  // ── Welcome / empty state ─────────────────────────────────────────────────
  Widget _buildWelcome() => SingleChildScrollView(
    padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
    child: Column(children: [
      const SizedBox(height: 12),
      // Hero icon
      Container(
        width: 80, height: 80,
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [_forest, _emerald],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight),
          shape: BoxShape.circle,
          boxShadow: [BoxShadow(
            color: _forest.withValues(alpha: 0.30),
            blurRadius: 20, offset: const Offset(0, 8))],
        ),
        child: const Icon(Icons.auto_awesome_rounded,
            color: Colors.white, size: 36),
      ),
      const SizedBox(height: 18),
      const Text('Hi! I\'m Hexa Salon AI',
        style: TextStyle(
          color: _ink, fontSize: 22,
          fontWeight: FontWeight.w900, letterSpacing: -0.5)),
      const SizedBox(height: 8),
      const Text(
        'Your intelligent salon assistant.\nAsk me anything about your business.',
        textAlign: TextAlign.center,
        style: TextStyle(
          color: _muted, fontSize: 14,
          fontWeight: FontWeight.w500, height: 1.5)),
      const SizedBox(height: 28),
      // Suggestion chips
      const Align(
        alignment: Alignment.centerLeft,
        child: Text('QUICK SUGGESTIONS',
          style: TextStyle(
            color: _muted, fontSize: 11,
            fontWeight: FontWeight.w700, letterSpacing: 0.6)),
      ),
      const SizedBox(height: 12),
      ..._suggestions.map((s) => _SuggestionTile(
        label: s.$1, icon: s.$2,
        onTap: () => _send(s.$1),
      )),
    ]),
  );

  // ── Chat list ─────────────────────────────────────────────────────────────
  Widget _buildChat() => ListView.builder(
    controller: _scrollCtrl,
    reverse: true,
    padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
    itemCount: _msgs.length + (_typing ? 1 : 0),
    itemBuilder: (ctx, i) {
      if (_typing && i == 0) return _TypingBubble(ctrl: _dotCtrl);
      final msg = _msgs[_typing ? i - 1 : i];
      return _ChatBubble(msg: msg);
    },
  );

  // ── Input bar ─────────────────────────────────────────────────────────────
  Widget _buildInput(double bottom) => Container(
    color: _surface,
    padding: EdgeInsets.fromLTRB(16, 10, 12, 10 + bottom),
    child: Row(children: [
      Expanded(
        child: Container(
          decoration: BoxDecoration(
            color: _canvas,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: _border),
          ),
          child: Row(children: [
            const SizedBox(width: 16),
            Expanded(
              child: TextField(
                controller: _ctrl,
                minLines: 1,
                maxLines: 4,
                textCapitalization: TextCapitalization.sentences,
                style: const TextStyle(color: _ink, fontSize: 14),
                decoration: const InputDecoration(
                  border: InputBorder.none,
                  hintText: 'Ask Hexa Salon AI anything…',
                  hintStyle: TextStyle(
                    color: Color(0xFFB0B8B0), fontSize: 14)),
                onSubmitted: (_) => _send(),
              ),
            ),
            const SizedBox(width: 8),
          ]),
        ),
      ),
      const SizedBox(width: 8),
      GestureDetector(
        onTap: _send,
        child: Container(
          width: 46, height: 46,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [_forest, _emerald],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight),
            shape: BoxShape.circle,
            boxShadow: [BoxShadow(
              color: _forest.withValues(alpha: 0.30),
              blurRadius: 10, offset: const Offset(0, 4))],
          ),
          child: const Icon(Icons.send_rounded,
              color: Colors.white, size: 18),
        ),
      ),
    ]),
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CHAT BUBBLE
// ═════════════════════════════════════════════════════════════════════════════
class _ChatBubble extends StatelessWidget {
  const _ChatBubble({required this.msg});
  final _Msg msg;

  @override
  Widget build(BuildContext context) {
    final isUser = msg.fromUser;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        mainAxisAlignment:
            isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          // AI avatar
          if (!isUser) ...[
            Container(
              width: 30, height: 30,
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [_forest, _emerald],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight),
                shape: BoxShape.circle),
              child: const Icon(Icons.auto_awesome_rounded,
                  color: Colors.white, size: 14),
            ),
            const SizedBox(width: 8),
          ],
          // Bubble
          Flexible(
            child: Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: 14, vertical: 11),
              decoration: BoxDecoration(
                gradient: isUser
                    ? const LinearGradient(
                        colors: [_forest, _emerald],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight)
                    : null,
                color: isUser ? null : (msg.isError ? const Color(0xFFFEF2F2) : _surface),
                borderRadius: BorderRadius.only(
                  topLeft:     const Radius.circular(18),
                  topRight:    const Radius.circular(18),
                  bottomLeft:  Radius.circular(isUser ? 18 : 4),
                  bottomRight: Radius.circular(isUser ? 4 : 18),
                ),
                border: isUser
                    ? null
                    : Border.all(color: msg.isError ? const Color(0xFFFECACA) : _border),
                boxShadow: [BoxShadow(
                  color: Colors.black.withValues(alpha: 0.05),
                  blurRadius: 6, offset: const Offset(0, 2))],
              ),
              child: Text(msg.text,
                style: TextStyle(
                  color: isUser ? Colors.white : (msg.isError ? const Color(0xFFB91C1C) : _ink),
                  fontSize: 14, height: 1.45,
                  fontWeight: FontWeight.w500)),
            ),
          ),
          // User avatar
          if (isUser) ...[
            const SizedBox(width: 8),
            Container(
              width: 30, height: 30,
              decoration: BoxDecoration(
                color: _forest.withValues(alpha: 0.12),
                shape: BoxShape.circle),
              child: const Icon(Icons.person_rounded,
                  color: _forest, size: 16),
            ),
          ],
        ],
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// TYPING INDICATOR
// ═════════════════════════════════════════════════════════════════════════════
class _TypingBubble extends StatelessWidget {
  const _TypingBubble({required this.ctrl});
  final AnimationController ctrl;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Container(
            width: 30, height: 30,
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [_forest, _emerald],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight),
              shape: BoxShape.circle),
            child: const Icon(Icons.auto_awesome_rounded,
                color: Colors.white, size: 14),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(
                horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
              color: _surface,
              borderRadius: const BorderRadius.only(
                topLeft:     Radius.circular(18),
                topRight:    Radius.circular(18),
                bottomRight: Radius.circular(18),
                bottomLeft:  Radius.circular(4),
              ),
              border: Border.all(color: _border),
              boxShadow: [BoxShadow(
                color: Colors.black.withValues(alpha: 0.05),
                blurRadius: 6, offset: const Offset(0, 2))],
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              _Dot(ctrl: ctrl, delay: 0),
              const SizedBox(width: 5),
              _Dot(ctrl: ctrl, delay: 0.28),
              const SizedBox(width: 5),
              _Dot(ctrl: ctrl, delay: 0.56),
            ]),
          ),
        ],
      ),
    );
  }
}

class _Dot extends StatelessWidget {
  const _Dot({required this.ctrl, required this.delay});
  final AnimationController ctrl;
  final double delay;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: ctrl,
      builder: (_, _) {
        final val = ((ctrl.value - delay) % 1.0);
        final opacity = val < 0.5
            ? 0.3 + val * 1.4
            : 1.0 - (val - 0.5) * 1.4;
        return Opacity(
          opacity: opacity.clamp(0.3, 1.0),
          child: Container(
            width: 8, height: 8,
            decoration: const BoxDecoration(
              color: _forest, shape: BoxShape.circle),
          ),
        );
      },
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SUGGESTION TILE
// ═════════════════════════════════════════════════════════════════════════════
class _SuggestionTile extends StatelessWidget {
  const _SuggestionTile({
    required this.label,
    required this.icon,
    required this.onTap,
  });
  final String label;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
      decoration: BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _border),
        boxShadow: [BoxShadow(
          color: Colors.black.withValues(alpha: 0.04),
          blurRadius: 6, offset: const Offset(0, 2))],
      ),
      child: Row(children: [
        Container(
          width: 36, height: 36,
          decoration: BoxDecoration(
            color: _forest.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(10)),
          child: Icon(icon, color: _forest, size: 17),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(label,
            style: const TextStyle(
              color: _ink, fontSize: 14,
              fontWeight: FontWeight.w600)),
        ),
        const Icon(Icons.arrow_forward_ios_rounded,
            size: 13, color: _muted),
      ]),
    ),
  );
}

// ── Model ─────────────────────────────────────────────────────────────────────
class _Msg {
  const _Msg({required this.text, required this.fromUser, this.isError = false});
  final String text;
  final bool fromUser;
  final bool isError;
}
