/*
 * tree-sitter grammar for Telora.
 *
 * DESIGN NOTES
 * -----------
 * This grammar serves editor tooling and the experimental compiler frontend.
 * It preserves lexical structure and incomplete syntax for structural
 * diagnostics. The compiler currently projects nodes into its flat semantic
 * CST vocabulary; see "node-name mapping" below for wrapper differences.
 *
 * TOKEN / SCANNER BOUNDARY
 * ------------------------
 * Tree-sitter token rules are regular expressions; the external scanner in
 * src/scanner.c handles:
 *
 *   section_lparen   '\('   -- a two-character token
 *   raw_start/text/end -- terminating '#' count must match the opening count.
 *                        The scanner serializes that count and chunks content.
 *
 * Everything else is a plain regex or anonymous token, including:
 *
 *   concat string    '`...`' -> anonymous backticks + text and escape tokens
 *                               + anonymous '\{' '}' interpolation markers.
 *   This mirrors how JS template literals work: the parser's LR states keep
 *   interpolation and nested braces/strings apart, with no scanner state.
 *   Raw string state changes only on accepted tokens, so speculative parsing
 *   can restore the previous scanner state.
 *
 * placeholders     -- '_' vs '_0' vs identifier (longest-match resolves)
 *
 * PRECEDENCE
 * ----------
 * Numeric precedences are defined in the expression rules; higher = tighter.
 *
 *   propagate '?'       30    field '.'         20
 *   call '()'           28    unary '-'         18
 *   type-apply '@[]'    26    '*' '/'           16
 *   section             22    '+' '-'           14
 *   index               24    '&' '^' '|'       12/11/10
 *                          '<~'                9
 *                          '<' '=='             8
 *                          '&&'                  6
 *                          '||'                  4
 *                          '|>'                  2
 *
 * So `a + b |> f` parses as `(a + b) |> f`. All binary ops are left-assoc.
 *
 * NODE-NAME MAPPING (compiler semantic CST)
 * ------------------------------------------
 *   program                        -> source_file (tree-sitter root requirement)
 *   body                           -> module_body
 *   concat_expression @string_expr -> concat_string (kept distinct so the
 *                                    interpolation children are visible)
 *   string_literal @string_expr    -> string_expr
 *   primary (leaf)                 -> primary is a hidden/choice layer; the
 *                                    expression kinds (int_expr, ...) are the
 *                                    produced node kinds
 *   '_' wildcard in a pattern      -> identifier_pattern
 */

module.exports = grammar({
  name: 'telora',

  // Comments are a named rule in extras: they are skipped by the parser but
  // still materialize as nodes so highlight/fold queries can see them.
  extras: $ => [
    $.comment,
    $.spaces,
    $.tabs,
    $.newline,
    /[\v\f]/,
  ],

  word: $ => $.identifier,

  // `{...}` is a dict when it can be; the same
  // brace sequence can also start a block. tree-sitter keeps both parses and
  // the first-listed alternative (dict_expr) wins.
  conflicts: $ => [
    [$.dict_expr, $.block],
    // Parenthesized trait contracts and generic impl parameters share a prefix.
    [$.type_parameter, $.contract_expr],
    // A use path may end before `::{...}` or continue through `::name`.
    [$.use_path],
  ],

  externals: $ => [
    $.section_lparen,   // '\(' — two-char token
    $.raw_start,
    $.raw_text,
    $.raw_end,
  ],

  supertypes: $ => [
    $.expression,
    $.binding,
    $.pattern,
  ],

  rules: {
    source_file: $ => optional($.module_body),

    module_body: $ => choice(
      seq(repeat1(choice($.module_binding, $.expression_statement)), optional($.expression)),
      $.expression,
    ),

    block_body: $ => choice(
      seq(repeat1(choice($.binding, $.expression_statement)), optional($.expression)),
      $.expression,
    ),

    expression_statement: $ => seq($.expression, ';'),

    // ---------------------------------------------------------------- lexical
    comment: $ => /#[^\r\n]*/,
    spaces: $ => / +/,
    tabs: $ => /\t+/,
    newline: $ => /\r\n|\r|\n/,

    identifier: $ => /[A-Za-z][A-Za-z0-9_]*|_[0-9]*[A-Za-z_][A-Za-z0-9_]*/,

    // '_' and '_N' must be declared before identifier so a lone '_' is not
    // swallowed by the identifier regex (tree-sitter prefers the earlier
    // rule on equal-length matches; longer matches win elsewhere).
    placeholder: $ => token(prec(1, '_')),
    indexed_placeholder: $ => token(prec(1, /_[0-9]+/)),

    // ---------------------------------------------------------------- bindings
    module_binding: $ => choice(
      $.let_binding,
      $.let_pattern_binding,
      $.let_else_binding,
      $.export_statement,
      $.decl_binding,
      $.def_binding,
      $.native_type_binding,
      $.native_binding,
      $.type_binding,
      $.trait_binding,
      $.impl_binding,
      $.module_declaration,
      $.use_binding,
      $.data_binding,
      $.import_binding,
    ),

    binding: $ => choice(
      $.export_statement,
      // Binding forms: else > pattern > plain.
      $.let_else_binding,
      $.let_pattern_binding,
      $.let_binding,
      $.decl_binding,
      $.def_binding,
      $.native_type_binding, // before native_binding ('native type' prefix)
      $.native_binding,
      $.type_binding,
      $.use_binding,
      $.import_binding,
      $.trait_binding,
      $.impl_binding,
    ),

    export_statement: $ => seq(
      'export',
      choice($.let_binding, $.let_pattern_binding, $.def_binding, $.type_binding, $.trait_binding, seq($.export_items, ';'), seq($.member_selector, ';')),
    ),
    export_items: $ => seq('{', optional(seq($.export_item, repeat(seq(',', $.export_item)), optional(','))), '}'),
    export_item: $ => seq($.identifier, optional(seq('as', $.identifier))),

    // Missing slots stay absent; structural diagnostics identify them later.
    let_binding: $ => prec(2, seq('let', optional($.identifier), optional(seq(':', $.expression)), '=', optional($.expression), ';')),
    let_pattern_binding: $ => seq('let', $.pattern, '=', $.expression, ';'),
    let_else_binding: $ => prec(2, seq('let', choice(seq($.identifier, optional(seq(':', $.expression))), $.pattern), '=', $.expression, 'else', $.block, ';')),

    decl_binding: $ => seq('decl', $.identifier, ':', $.type_scheme, ';'),
    def_binding: $ => seq('def', $.identifier, optional(seq(':', $.type_scheme)), '=', $.expression, ';'),
    native_binding: $ => seq('native', $.identifier, ':', $.type_scheme, ';'),
    native_type_binding: $ => seq('native', 'type', $.identifier, '@', $.int_expr, ';'),

    type_binding: $ => seq(repeat($.decorator), 'type', $.identifier, optional($.type_parameters), '=', $.type_initializer, ';'),
    type_initializer: $ => choice($.struct_initializer, $.enum_initializer, $.expression),
    struct_initializer: $ => seq(
      'struct',
      choice(seq('{',
      optional(seq($.struct_initializer_field, repeat(seq(',', $.struct_initializer_field)), optional(','))),
      '}'), seq('(', $.expression, ')')),
    ),
    struct_initializer_field: $ => seq(repeat($.decorator), $.identifier, ':', $.expression),
    enum_initializer: $ => seq(
      'enum',
      '{',
      optional(seq($.enum_initializer_variant, repeat(seq(',', $.enum_initializer_variant)), optional(','))),
      '}',
    ),
    enum_initializer_variant: $ => seq(repeat($.decorator), $.identifier, optional(seq('(', $.expression, ')'))),
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
      optional($.type_parameters),
      $.contract,
      'for',
      $.contract,
      '{',
      optional(seq($.impl_member, repeat(seq(',', $.impl_member)), optional(','))),
      '}',
      ';',
    ),
    impl_member: $ => seq($.identifier, ':', $.expression),

    module_declaration: $ => seq('mod', optional($.identifier), ';'),
    use_binding: $ => seq('use', $.use_path, optional($.use_selector), ';'),
    use_path: $ => seq($.identifier, repeat(seq('::', $.identifier))),
    use_selector: $ => seq('::', $.use_items),
    use_items: $ => seq('{', optional(seq($.use_item, repeat(seq(',', $.use_item)), optional(','))), '}'),
    use_item: $ => seq($.identifier, optional(seq('as', $.identifier))),

    data_binding: $ => seq(
      'data',
      optional($.identifier),
      optional(seq(':', $.type_scheme)),
      '=',
      $.data_import,
      ';',
    ),
    data_import: $ => seq(
      'import',
      optional(seq('(', $.data_format, ')')),
      optional($.string_literal),
    ),
    data_format: $ => choice('json', 'yaml', 'toml'),

    import_binding: $ => seq('import', choice(seq($.string_literal, $.import_selector), $.member_selector), ';'),
    member_selector: $ => seq($.identifier, repeat(seq('.', $.identifier)), '.', $.import_items),
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
    type_parameter: $ => prec(29, seq(
      $.identifier,
      optional(seq(':', $.trait_bound, repeat(seq('+', $.trait_bound)))),
    )),
    trait_bound: $ => seq(optional('?'), $.contract),
    contract: $ => choice(
      $.contract_expr, // listed first: 'Identifier ...' preferred over 'Fn'
      $.function_contract,
      $.unit_contract,
    ),
    contract_expr: $ => choice(
      prec.right(29, seq(
        $.static_path,
        optional(seq('(', optional(seq($.contract_argument, repeat(seq(',', $.contract_argument)), optional(','))), ')')),
      )),
      prec.right(29, seq(
        $.identifier,
        repeat(seq('.', $.identifier)),
        optional(seq('(', optional(seq($.contract_argument, repeat(seq(',', $.contract_argument)), optional(','))), ')')),
      )),
    ),
    contract_argument: $ => choice($.contract, $.contract_array),
    unit_contract: $ => seq('(', optional(seq($.contract, repeat(seq(',', $.contract)), optional(','))), ')'),
    contract_array: $ => seq('[', optional(seq($.contract, repeat(seq(',', $.contract)), optional(','))), ']'),
    function_contract: $ => prec.right(seq('Fn', '(', optional(seq(
      choice($.contract, $.invalid_function_parameter),
      repeat(seq(',', choice($.contract, $.invalid_function_parameter))), optional(','))),
      ')', optional(seq('->', $.contract)))),
    invalid_function_parameter: $ => $.contract_array,

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
      $.static_path_expr,
      $.primary,
    ),

    pipeline_expr: $ => prec.left(2, seq($.expression, '|>', $.expression)),

    binary_expr: $ => choice(
      prec.left(16, seq($.expression, choice('*', '/', '%'), $.expression)),
      prec.left(14, seq($.expression, choice('+', '-'), $.expression)),
      prec.left(12, seq($.expression, '&', $.expression)),
      prec.left(11, seq($.expression, '^', $.expression)),
      prec.left(10, seq($.expression, '|', $.expression)),
      prec.left(9, seq($.expression, '<~', $.expression)),
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
    dot_postfix_expr: $ => prec.right(20, seq($.expression, '.', optional(choice($.postfix_intrinsic_suffix, $.projection_suffix, $.metadata_suffix, $.field_projection_suffix)))),
    static_path_expr: $ => prec.right(21, $.static_path),
    static_path: $ => seq($.identifier, repeat1(seq('::', $.identifier))),
    field_projection_suffix: $ => seq('{', optional(seq($.field_projection_entry, repeat(seq(',', $.field_projection_entry)), optional(','))), '}'),
    field_projection_entry: $ => seq($.identifier, optional(seq('as', $.identifier))),
    metadata_suffix: $ => 'type',
    postfix_intrinsic_suffix: $ => seq($.identifier, '!', $.arguments),
    projection_suffix: $ => choice($.identifier, $.int_expr),

    primary: $ => choice(
      $.int_expr,
      $.float_expr,
      $.string_expr,
      $.concat_string,
      $.bytes_expr,
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
    float_expr: $ => /[0-9]+(\.[0-9]+([eE][+-]?[0-9]+)?|[eE][+-]?[0-9]+)/,
    string_expr: $ => $.string_literal,
    bytes_expr: $ => /b"([^"\\]|\\.)*"/,
    variable_expr: $ => $.identifier,

    named_intrinsic: $ => seq($.identifier, '!', '(', optional(seq($.expression, repeat(seq(',', $.expression)), optional(','))), ')'),
    interpreter_intrinsic: $ => seq('interpreter', '!', '(', optional(seq($.expression, repeat(seq(',', $.expression)), optional(','))), ')'),
    legacy_interpreter_expr: $ => seq('interpreter', '(', $.expression, ')'),

    paren_expr: $ => seq('(', optional(seq($.array_item, repeat(seq(',', $.array_item)), optional(','))), ')'),
    array_expr: $ => seq('[', optional(seq($.array_item, repeat(seq(',', $.array_item)), optional(','))), ']'),
    array_item: $ => choice($.spread_item, $.expression),
    spread_item: $ => seq('...', $.expression),

    dict_expr: $ => prec.dynamic(1, seq('{', optional(seq($.dict_item, repeat(seq(',', $.dict_item)), optional(','))), '}')),
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
    match_arm: $ => seq($.pattern, choice(seq('if', $.expression, '=>'), optional('=>')), $.expression),
    return_expr: $ => seq('return', $.expression, ';'),

    // ---------------------------------------------------------------- patterns
    pattern: $ => choice(
      $.identifier_pattern,
      $.int_pattern,
      $.float_pattern,
      $.string_pattern,
      $.constructor_pattern,
      $.tuple_pattern,
      $.struct_pattern,
    ),
    identifier_pattern: $ => choice($.identifier, $.placeholder),
    int_pattern: $ => /[0-9]+/,
    float_pattern: $ => /[0-9]+(\.[0-9]+([eE][+-]?[0-9]+)?|[eE][+-]?[0-9]+)/,
    string_pattern: $ => $.string_literal,
    constructor_pattern: $ => prec.right(1, seq($.identifier, choice(
      seq(repeat1(seq('.', $.identifier)), optional(seq('(', $.pattern, ')'))),
      seq('(', $.pattern, ')'),
    ))),
    tuple_pattern: $ => seq('(', optional(seq($.pattern, repeat(seq(',', $.pattern)), optional(','))), ')'),
    struct_pattern: $ => seq('{', optional(seq($.struct_pattern_field, repeat(seq(',', $.struct_pattern_field)), optional(','))), '}'),
    struct_pattern_field: $ => seq($.identifier, optional(seq(':', $.pattern))),

    // ---------------------------------------------------------------- strings
    // Keep lexical structure even when an escape is invalid. Validation and
    // decoding belong to later stages. Immediate tokens keep whitespace and
    // comment-like text inside the string rather than treating them as extras.
    string_literal: $ => choice(
      seq($.quote_start, repeat(choice($.string_text, $.escape_sequence)), $.quote_end),
      $.raw_string,
    ),
    quote_start: $ => '"',
    raw_string: $ => seq($.raw_start, repeat($.raw_text), $.raw_end),
    quote_end: $ => token.immediate('"'),
    string_text: $ => token.immediate(prec(1, /[^"\\]+/)),
    escape_sequence: $ => token.immediate(/\\(u\{[^}"\r\n]*\}?|x[0-9A-Fa-f]{0,2}|[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[^\r\n])?/),

    // backtick concatenation string. Anonymous '`' and '\{' '}' delimit the
    // segments; the fragment regex matches text/escapes and stops at the
    // structural boundaries (a bare '`' or an interpolation '\{'), so the
    // parser's states keep fragments, interpolations and the embedded
    // expressions apart without any external-scanner state.
    concat_string: $ => seq(
      '`',
      repeat(choice($.concat_fragment, alias($.concat_escape, $.escape_sequence), $.interpolation)),
      '`',
    ),
    concat_fragment: $ => token.immediate(prec(1, /[^`\\]+/)),
    concat_escape: $ => token.immediate(/\\(u\{[^}`\r\n]*\}?|x[0-9A-Fa-f]{0,2}|[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[^{\r\n])?/),
    interpolation: $ => seq('\\{', $.expression, '}'),
  },
});
