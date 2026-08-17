# tree-sitter-telora

A [tree-sitter](https://tree-sitter.github.io/tree-sitter/) grammar for the
Telora language — a *lossless, error-tolerant editor view* of the
authoritative [Lelwel CST](../crates/telora-core/src/syntax/telora/grammar.llw).

## Layout

| Path | Purpose |
|------|---------|
| `grammar.js` | The grammar (rules + precedence + externals declaration) |
| `src/scanner.c` | External scanner: the only two non-regular tokens |
| `queries/highlights.scm` | Syntax highlighting |
| `test/corpus/bindings.txt` | Parse-tree tests |

## Design decisions

### Node names mirror the Lelwel CST

Rule names in `grammar.js` match the Lelwel Rule names from
`grammar.llw` (`call_expr`, `binary_expr`, `section_expr`, `let_binding`,
`contract_expr`, ...) so query/tooling knowledge transfers. Deviations:

- `program` → `source_file` (tree-sitter root requirement)
- `body` → `module_body`
- Lelwel `concat_expression`/`string_literal` both produce `string_expr`;
  here `concat_string` is kept distinct so `interpolation` children are
  visible.
- `primary` is an LR layer and appears as a wrapper node; the Lelwel `@`
  tags (`int_expr`, ...) are the leaf node kinds.

### Precedence is taken from the real parser

Binding powers were read from the generated Pratt parser
(`fn rule_expression` in the telora build output), not guessed:

```
propagate '?'  24     field '.'      16
call '()'      22     unary '-'      14
type-apply '[]' 20    '*' '/'        12
section '\(...)' 18   '+' '-'        10
                      '<' '=='        8
                      '&&'            6
                      '||'            4
                      '|>'            2
```

So `a + b |> f` → `(a + b) |> f`; all binary ops are left-associative.
Corpus tests pin this down.

### Only two tokens need the external scanner

`'\('` (section token) and `r#"..."#` (raw string) — the only non-regular
lexemes. Everything else is a regex or anonymous token:

- **Backtick concat strings** (`\`...\``) use the JavaScript template-literal
  approach: anonymous `` ` `` and `\{`/`}` markers plus a regex
  `concat_fragment`. The parser's LR states keep fragments, interpolations
  and the embedded expressions apart — including nested braces and nested
  backtick strings inside an interpolation.

  A stateful scanner for this is *not* viable: tree-sitter discards
  scanner-state changes made when the scanner returns `false`, so a
  CONCAT/INTERPOLATION mode machine cannot persist across tokens.

- **Whitespace**: tree-sitter never re-invokes the external scanner after
  skipping extras, so the scanner consumes leading whitespace itself
  (`skip_whitespace`). Regular tokens are unaffected.

### Behavior matches Lelwel where it matters

- `{...}` is a dict when it can be (Lelwel `braced` priority `?1`);
  `{a}` / `{}` are dicts, `{ let ... }` falls back to a block.
- `let x = e` parses as `let_pattern_binding` (Lelwel `?3` beats the plain
  binding's `?0`); `let x : T = e` is the plain `let_binding`.
- `def` has no parameter list (`def name : scheme = expr`), so
  `def f(x) = ...` is a syntax error, as in the Lelwel grammar.
- Named Struct and Enum models use direct declaration initializers:
  `type User = struct {...}` and `type Option(T) = enum {'None, 'Some(T)}`.
  The removed `@struct` / `@enum` and callable constructors are not accepted.

## Development

```sh
npm install
npm run generate      # rebuild src/parser.c from grammar.js
npx tree-sitter test  # corpus tests
```

The grammar is validated against every `.telora` file in the repository
(`examples/`, `experiments/`, ...) — all parse without error nodes.
