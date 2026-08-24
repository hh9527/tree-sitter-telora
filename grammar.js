/*
 * tree-sitter grammar for Telora.
 *
 * DESIGN NOTES
 * -----------
 * This grammar is a *lossless-tolerant editor view* of the authoritative
 * Lelwel CST (crates/telora-core/src/syntax/telora/grammar.llw). Node names
 * mirror the Lelwel Rule names (call_expr, binary_expr, section_expr, ...)
 * so tooling can be shared; see "node-name mapping" below for the few
 * deviations.
 *
 * TOKEN / SCANNER BOUNDARY
 * ------------------------
 * Tree-sitter token rules are regular expressions; Telora has two lexical
 * constructs that need the external scanner in src/scanner.c:
 *
 *   section_lparen   '\('   -- a two-character token
 *   raw_string       r#"..."# -- terminating '#' count must match the
 *                            opening count (see scan_raw_string in
 *                            lexer.rs:271), which is not regular
 *
 * Everything else is a plain regex or anonymous token, including:
 *
 *   concat string    '`...`' -> anonymous backticks + a regex fragment token
 *                               + anonymous '\{' '}' interpolation markers.
 *   This mirrors how JS template literals work: the parser's LR states keep
 *   interpolation and nested braces/strings apart, with no scanner state.
 *   (A stateful scanner cannot work here: tree-sitter discards scanner-state
 *   changes made when the scanner returns false, so mode machines cannot
 *   persist across tokens.)
 *
 * placeholders     -- '_' vs '_0' vs identifier (longest-match resolves)
 *
 * PRECEDENCE
 * ----------
 * Binding powers are taken from the generated Pratt parser
 * (fn rule_expression in the telora build output). Higher = tighter:
 *
 *   propagate '?'       24    field '.'         16
 *   call '()'           22    unary '-'         14
 *   type-apply '[]'     20    '*' '/'           12
 *   section '\(...)'    18    '+' '-'           10
 *                          '<' '=='             8
 *                          '&&'                  6
 *                          '||'                  4
 *                          '|>'                  2
 *
 * So `a + b |> f` parses as `(a + b) |> f`. All binary ops are left-assoc.
 *
 * NODE-NAME MAPPING (deviations from Lelwel)
 * ------------------------------------------
 *   program                        -> source_file (tree-sitter root requirement)
 *   body                           -> module_body
 *   concat_expression @string_expr -> concat_string (kept distinct so the
 *                                    interpolation children are visible)
 *   string_literal @string_expr    -> string_expr (matches Lelwel)
 *   primary (leaf)                 -> primary is a hidden/choice layer; the
 *                                    Lelwel @-tags (int_expr, ...) are the
 *                                    produced node kinds
 *   '_' wildcard in a pattern      -> identifier_pattern (Lelwel folds both)
 */

module.exports = grammar({
  name: 'telora',

  // Comments are a named rule in extras: they are skipped by the parser but
  // still materialize as nodes so highlight/fold queries can see them.
  extras: $ => [
    $.comment,
    /\s/,
  ],

  word: $ => $.identifier,

  // `{...}` is a dict when it can be (Lelwel braced priority ?1); the same
  // brace sequence can also start a block. tree-sitter keeps both parses and
  // the first-listed alternative (dict_expr) wins.
  conflicts: $ => [
    [$.dict_expr, $.block],
    // simple `let x = e` is a pattern binding in Lelwel (?3 > ?0); the plain
    // let_binding is only reachable via the type annotation (`let x : T = e`).
    [$.let_binding, $.identifier_pattern],
  ],

  externals: $ => [
    $.section_lparen,   // '\(' — two-char token
    $.raw_string,       // r#"..."# — hash-counted, needs the scanner
  ],

  supertypes: $ => [
    $.expression,
    $.binding,
    $.pattern,
  ],

  rules: {
    source_file: $ => optional($.module_body),

    module_body: $ => repeat1($.module_binding),

    block_body: $ => choice(
      seq(repeat1($.binding), optional($.expression)),
      $.expression,
    ),

    // ---------------------------------------------------------------- lexical
    comment: $ => /#[^\r\n]*/,

    identifier: $ => /[A-Za-z_][A-Za-z0-9_]*/,

    // '_' and '_N' must be declared before identifier so a lone '_' is not
    // swallowed by the identifier regex (tree-sitter prefers the earlier
    // rule on equal-length matches; longer matches win elsewhere).
    placeholder: $ => /_/,
    indexed_placeholder: $ => /_[0-9]+/,

    // ---------------------------------------------------------------- bindings
    module_binding: $ => choice(
      $.option_binding,
      $.export_statement,
      $.decl_binding,
      $.def_binding,
      $.native_type_binding,
      $.native_binding,
      $.type_binding,
      $.trait_binding,
      $.impl_binding,
      $.import_binding,
    ),

    binding: $ => choice(
      $.option_binding,
      $.export_statement,
      // ordered to mirror Lelwel ?N priorities (else > pattern > plain)
      $.let_else_binding,
      $.let_pattern_binding,
      $.let_binding,
      $.decl_binding,
      $.def_binding,
      $.native_type_binding, // before native_binding ('native type' prefix)
      $.native_binding,
      $.type_binding,
      $.import_binding,
    ),

    option_binding: $ => seq('option', $.string_literal, $.expression, ';'),

    export_statement: $ => seq(
      'export',
      choice($.def_binding, $.type_binding, $.trait_binding, seq($.export_items, ';')),
    ),
    export_items: $ => seq('{', optional(seq($.export_item, repeat(seq(',', $.export_item)), optional(','))), '}'),
    export_item: $ => seq($.identifier, optional(seq('as', $.identifier))),

    let_binding: $ => seq('let', $.identifier, optional(seq(':', $.expression)), '=', $.expression, ';'),
    let_pattern_binding: $ => seq('let', $.pattern, '=', $.expression, ';'),
    let_else_binding: $ => seq('let', $.pattern, '=', $.expression, 'else', $.block, ';'),

    decl_binding: $ => seq('decl', $.identifier, ':', $.type_scheme, ';'),
    def_binding: $ => seq('def', $.identifier, optional(seq(':', $.type_scheme)), '=', $.expression, ';'),
    native_binding: $ => seq('native', $.identifier, ':', $.type_scheme, ';'),
    native_type_binding: $ => seq('native', 'type', $.identifier, '@', /[0-9]+/, ';'),

    type_binding: $ => seq(repeat($.decorator), 'type', $.identifier, optional($.type_parameters), '=', $.type_initializer, ';'),
    type_initializer: $ => choice($.struct_initializer, $.enum_initializer, $.expression),
    struct_initializer: $ => seq(
      'struct',
      '{',
      optional(seq($.struct_initializer_field, repeat(seq(',', $.struct_initializer_field)), optional(','))),
      '}',
    ),
    struct_initializer_field: $ => seq(repeat($.decorator), $.identifier, ':', $.expression),
    enum_initializer: $ => seq(
      'enum',
      '{',
      optional(seq($.enum_initializer_variant, repeat(seq(',', $.enum_initializer_variant)), optional(','))),
      '}',
    ),
    enum_initializer_variant: $ => seq(repeat($.decorator), $.atom_expr, optional(seq('(', $.expression, ')'))),
    decorator: $ => seq('@', $.decorator_path, optional($.arguments)),
    decorator_path: $ => seq($.identifier, repeat(seq('.', $.identifier))),

    trait_binding: $ => seq(
      'trait',
      $.identifier,
      '{',
      optional(seq($.trait_member, repeat(seq(',', $.trait_member)), optional(','))),
      '}',
      ';',
    ),
    trait_member: $ => seq($.identifier, ':', $.contract),

    impl_binding: $ => seq(
      'impl',
      optional(seq('for', $.type_parameters)),
      $.contract,
      'for',
      $.contract,
      '{',
      optional(seq($.impl_member, repeat(seq(',', $.impl_member)), optional(','))),
      '}',
      ';',
    ),
    impl_member: $ => seq($.identifier, ':', $.expression),

    import_binding: $ => seq('import', $.string_literal, $.import_selector, ';'),
    import_selector: $ => choice(
      seq('as', $.identifier, optional(seq(',', choice('*', $.import_items)))),
      '*',
      $.import_items,
    ),
    import_items: $ => seq('{', optional(seq($.import_item, repeat(seq(',', $.import_item)), optional(','))), '}'),
    import_item: $ => seq($.identifier, optional(seq('as', $.identifier))),

    // ---------------------------------------------------------------- types
    type_scheme: $ => seq(optional(seq('for', $.type_parameters)), $.contract),
    type_parameters: $ => seq('(', $.type_parameter, repeat(seq(',', $.type_parameter)), optional(','), ')'),
    type_parameter: $ => seq(
      $.identifier,
      optional(seq(':', $.trait_bound, repeat(seq('+', $.trait_bound)))),
    ),
    trait_bound: $ => $.contract,
    contract: $ => choice(
      $.contract_expr, // listed first: 'Identifier ...' preferred over 'Fn'
      $.function_contract,
    ),
    contract_expr: $ => prec.left(1, seq(
      $.identifier,
      repeat(seq('.', $.identifier)),
      optional(seq('(', optional(seq($.contract_argument, repeat(seq(',', $.contract_argument)), optional(','))), ')')),
    )),
    contract_argument: $ => choice($.contract, $.contract_array),
    contract_array: $ => seq('[', optional(seq($.contract, repeat(seq(',', $.contract)), optional(','))), ']'),
    function_contract: $ => seq('Fn', '(', optional(seq($.contract, repeat(seq(',', $.contract)), optional(','))), ')', '->', $.contract),

    // ---------------------------------------------------------------- expression
    expression: $ => choice(
      // listed lowest-to-highest binding; precedence is carried by each rule
      $.pipeline_expr,
      $.binary_expr,
      $.unary_expr,
      $.propagate_expr,
      $.call_expr,
      $.type_apply_expr,
      $.index_expr,
      $.section_expr,
      $.dot_postfix_expr,
      $.primary,
    ),

    pipeline_expr: $ => prec.left(2, seq($.expression, '|>', $.expression)),

    binary_expr: $ => choice(
      prec.left(16, seq($.expression, choice('*', '/', '%'), $.expression)),
      prec.left(14, seq($.expression, choice('+', '-'), $.expression)),
      prec.left(12, seq($.expression, '&', $.expression)),
      prec.left(11, seq($.expression, '^', $.expression)),
      prec.left(10, seq($.expression, '|', $.expression)),
      prec.left(8, seq($.expression, choice('<', '<=', '>', '>=', '==', '!='), $.expression)),
      prec.left(6, seq($.expression, '&&', $.expression)),
      prec.left(4, seq($.expression, '||', $.expression)),
    ),

    unary_expr: $ => prec(18, seq(choice('-', '!'), $.expression)),

    // postfix chain: tighter-binding postfixes at the bottom so e.g.
    // `f(a).b` reduces call before field while `f.a(b)` shifts call first.
    propagate_expr: $ => prec(30, seq($.expression, '?')),
    call_expr: $ => prec(28, seq($.expression, $.arguments)),
    type_apply_expr: $ => prec(26, seq($.expression, '@', $.type_arguments)),
    index_expr: $ => prec(24, seq($.expression, '[', $.expression, ']')),
    section_expr: $ => prec(22, seq($.expression, $.section_arguments)),
    dot_postfix_expr: $ => prec(20, seq($.expression, '.', choice($.postfix_intrinsic_suffix, $.projection_suffix))),
    postfix_intrinsic_suffix: $ => seq($.identifier, '!', $.arguments),
    projection_suffix: $ => choice($.identifier, $.int_expr),

    primary: $ => choice(
      $.int_expr,
      $.float_expr,
      $.string_expr,
      $.concat_string,
      $.bytes_expr,
      $.atom_expr,
      $.named_intrinsic,
      $.variable_expr,
      $.interpreter_intrinsic,
      $.do_expr,
      $.if_let_expr,
      $.legacy_interpreter_expr,
      $.paren_expr,
      $.array_expr,
      prec(1, $.dict_expr), // before $.block: '{a}' / '{}' are dicts, '{ let ... }' falls back
      $.block,
      $.function_contract,
      $.closure,
      $.if_expr,
      $.match_expr,
      $.return_expr,
    ),

    int_expr: $ => /[0-9]+/,
    float_expr: $ => /[0-9]+\.[0-9]+/,
    string_expr: $ => $.string_literal,
    bytes_expr: $ => /b"([^"\\]|\\.)*"/,
    atom_expr: $ => /'[A-Za-z_][A-Za-z0-9_]*/,
    variable_expr: $ => $.identifier,

    named_intrinsic: $ => seq($.identifier, '!', '(', optional(seq($.expression, repeat(seq(',', $.expression)), optional(','))), ')'),
    interpreter_intrinsic: $ => seq('interpreter', '!', '(', optional(seq($.expression, repeat(seq(',', $.expression)), optional(','))), ')'),
    legacy_interpreter_expr: $ => seq('interpreter', '(', $.expression, ')'),

    paren_expr: $ => seq('(', optional(seq($.expression, repeat(seq(',', $.expression)), optional(','))), ')'),
    array_expr: $ => seq('[', optional(seq($.array_item, repeat(seq(',', $.array_item)), optional(','))), ']'),
    array_item: $ => choice($.spread_item, $.expression),
    spread_item: $ => seq('...', $.expression),

    dict_expr: $ => seq('{', optional(seq($.dict_item, repeat(seq(',', $.dict_item)), optional(','))), '}'),
    dict_item: $ => choice($.spread_item, $.dict_field),
    dict_field: $ => choice(
      prec(1, $.identifier), // shorthand `{name}` — preferred over a bare block expression
      seq(repeat($.decorator), choice($.identifier, $.string_literal), ':', $.expression),
    ),

    block: $ => seq('{', optional($.block_body), '}'),
    do_expr: $ => seq('do', $.block),

    closure: $ => seq('fn', $.parameters, optional(seq('->', $.expression)), $.block),
    parameters: $ => seq('(', optional(seq($.parameter, repeat(seq(',', $.parameter)), optional(','))), ')'),
    parameter: $ => seq($.identifier, optional(seq(':', $.expression))),

    arguments: $ => seq('(', optional(seq($.expression, repeat(seq(',', $.expression)), optional(','))), ')'),
    type_arguments: $ => seq('[', $.type_argument, repeat(seq(',', $.type_argument)), optional(','), ']'),
    type_argument: $ => choice($.expression, $.placeholder),
    section_arguments: $ => seq($.section_lparen, optional(seq($.argument, repeat(seq(',', $.argument)), optional(','))), ')'),
    argument: $ => choice($.expression, $.placeholder, $.indexed_placeholder),

    ctrl_block: $ => choice($.block, $.if_let_expr, $.if_expr, $.match_expr, $.return_expr),
    if_expr: $ => seq('if', $.expression, $.block, 'else', $.ctrl_block),
    if_let_expr: $ => seq('if', 'let', $.pattern, '=', $.expression, $.block, 'else', $.ctrl_block),
    match_expr: $ => seq('match', $.expression, '{', optional(seq($.match_arm, repeat(seq(',', $.match_arm)), optional(','))), '}'),
    match_arm: $ => seq($.pattern, optional(seq('if', $.expression)), '=>', $.expression),
    return_expr: $ => seq('return', $.expression, ';'),

    // ---------------------------------------------------------------- patterns
    pattern: $ => choice(
      $.identifier_pattern,
      $.int_pattern,
      $.float_pattern,
      $.string_pattern,
      $.tagged_pattern, // before $.atom_pattern: 'Tag(...) wins over bare 'Tag
      $.atom_pattern,
      $.tuple_pattern,
      $.struct_pattern,
    ),
    identifier_pattern: $ => choice($.identifier, $.placeholder),
    int_pattern: $ => /[0-9]+/,
    float_pattern: $ => /[0-9]+\.[0-9]+/,
    string_pattern: $ => $.string_literal,
    tagged_pattern: $ => seq($.atom_expr, '(', $.pattern, ')'),
    atom_pattern: $ => $.atom_expr,
    tuple_pattern: $ => seq('(', optional(seq($.pattern, repeat(seq(',', $.pattern)), optional(','))), ')'),
    struct_pattern: $ => seq('{', optional(seq($.struct_pattern_field, repeat(seq(',', $.struct_pattern_field)), optional(','))), '}'),
    struct_pattern_field: $ => seq($.identifier, optional(seq(':', $.pattern))),

    // ---------------------------------------------------------------- strings
    // double-quoted: no interpolation, regular token. escapes are opaque here;
    // splitting them into StringText/EscapeSequence parts is a future
    // refinement for escape-sequence highlighting.
    string_literal: $ => choice(
      /"([^"\\]|\\(0|[nrt"\\]|x[0-9A-Fa-f]{2}|u\{[0-9A-Fa-f]{1,6}\}|\r?\n[ \t\r\n]*))*"/,
      $.raw_string,
    ),

    // backtick concatenation string. Anonymous '`' and '\{' '}' delimit the
    // segments; the fragment regex matches text/escapes and stops at the
    // structural boundaries (a bare '`' or an interpolation '\{'), so the
    // parser's states keep fragments, interpolations and the embedded
    // expressions apart without any external-scanner state.
    concat_string: $ => seq(
      '`',
      repeat(choice($.concat_fragment, $.interpolation)),
      '`',
    ),
    concat_fragment: $ => /([^`\\]|\\(0|[nrt`\\]|x[0-9A-Fa-f]{2}|u\{[0-9A-Fa-f]{1,6}\}|\r?\n[ \t\r\n]*)|\\[^`{])+/,
    interpolation: $ => seq('\\{', $.expression, '}'),
  },
});
