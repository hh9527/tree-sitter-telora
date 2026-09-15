# tree-sitter-telora

A [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) grammar used by
Telora's compiler frontend and editor highlighting.

## Layout

| Path | Purpose |
|------|---------|
| `grammar.js` | Syntax, precedence, named tokens and external declarations |
| `src/parser.c` | Generated lexer and parser |
| `src/scanner.c` | Section opener and stateful raw-string delimiters/content |
| `queries/highlights.scm` | Highlighting, including distinct escape sequences |
| `test/corpus/` | Complete and incomplete syntax trees |
| `bindings/rust/` | Rust binding and incremental/cancellation tests |

## Structural syntax

Ordinary strings contain `quote_start`, `string_text`,
`escape_sequence` and `quote_end`. Backtick strings keep text, escapes and
interpolations distinct. Unknown escapes retain their source range for compiler
diagnostics. A backslash followed by continuous Unicode whitespace forms one
escape sequence; the compiler ignores that entire sequence when decoding values.

Raw strings contain `raw_start`, `raw_text` and `raw_end`. The scanner records
the opening hash count (up to 255), serializes its state for incremental parsing,
and accepts only the matching terminator. Content is chunked so parsing can
check progress between scanner calls. Raw content does not interpret escapes.

Outside strings, spaces, tabs and newlines are named extras. The external scanner
does not skip them. Inside strings, whitespace remains content unless escaped.

The grammar preserves incomplete syntax rather than guessing replacement
expressions. Corpus tests specify missing delimiters and recovery ownership.
The compiler projects this CST iteratively into its flat semantic CST and
reports structural diagnostics before execution. Parsing a construct does not
itself grant execution permission: for example, top-level expression statements
remain visible for editor queries but are rejected by module admission.

## Expression structure

Operator precedence is specified in `grammar.js` and checked by the corpus.
Binary operators associate left: `a + b |> f` means `(a + b) |> f`.
Named struct/enum declarations use `type User = struct {...}` and
`type Option(T) = enum {None, Some(T)}`.

## Development

```sh
npm install
npm run generate
npx tree-sitter test
cargo test --lib
```

Commit generated parser files with grammar changes; do not patch generated C.
Compiler behavior is additionally checked by Telora's core, CLI and external
language tests. Invalid-input fixtures are expected to contain recovery nodes.
