/*
 * External scanner for tree-sitter-telora.
 *
 * Telora has TWO non-regular lexical constructs:
 *
 *   SECTION_LPAREN  '\('   -- a two-character token
 *   RAW_STRING      r#"..."# -- the terminator must be `"` + the same number
 *                            of '#' as opened the literal (<= 255), matching
 *                            scan_raw_string in lexer.rs:271.
 *
 * Everything else (backtick concat strings with interpolation, strings,
 * atoms, numbers, ...) is handled by plain regex / anonymous tokens in
 * grammar.js.
 *
 * NOTE: tree-sitter does not re-invoke the external scanner after skipping
 * extras (whitespace), so the scanner consumes leading whitespace itself in
 * skip_whitespace(). Consumption is harmless when the token is rejected: if
 * the scanner returns false, tree-sitter resets to the original position and
 * the internal lexer takes over.
 */

#include "tree_sitter/parser.h"
#include <stdbool.h>
#include <stdint.h>
#include <string.h>

enum TokenType {
  SECTION_LPAREN,
  RAW_STRING,
};

static void skip_whitespace(TSLexer *lexer) {
  while (!lexer->eof(lexer)) {
    switch (lexer->lookahead) {
      case ' ':
      case '\t':
      case '\r':
      case '\n':
        lexer->advance(lexer, true);
        break;
      default:
        return;
    }
  }
}

static bool scan_section_lparen(TSLexer *lexer) {
  if (lexer->lookahead != '\\') return false;
  lexer->advance(lexer, false);
  if (lexer->lookahead != '(') return false;
  lexer->advance(lexer, false);
  return true;
}

static bool scan_raw_string(TSLexer *lexer) {
  /* assumes lookahead at 'r'. The header probe (r '#'* '"') may consume
   * chars even on failure; returning false makes tree-sitter re-lex the same
   * position with the regex tokens, so probing is safe. */
  lexer->advance(lexer, false);          /* r */
  uint8_t hashes = 0;
  while (lexer->lookahead == '#') {
    lexer->advance(lexer, false);
    hashes++;
  }
  if (lexer->lookahead != '"') return false;
  lexer->advance(lexer, false);
  if (hashes > 255) return false;        /* matches scan_raw_string lexer.rs:273 */
  for (;;) {
    if (lexer->eof(lexer)) return false; /* unterminated: let error recovery */
    if (lexer->lookahead == '"') {
      /* a terminator is `"` + exactly `hashes` '#' not followed by '#' */
      lexer->advance(lexer, false);      /* consume '"' */
      uint8_t seen = 0;
      while (lexer->lookahead == '#' && seen < hashes) {
        lexer->advance(lexer, false);
        seen++;
      }
      if (seen == hashes && lexer->lookahead != '#') {
        return true;
      }
      continue;                          /* not a terminator; keep scanning */
    }
    lexer->advance(lexer, false);
  }
}

void *tree_sitter_telora_external_scanner_create(void) {
  return NULL;
}

void tree_sitter_telora_external_scanner_destroy(void *payload) {
  (void)payload;
}

unsigned tree_sitter_telora_external_scanner_serialize(
    void *payload, char *buffer) {
  (void)payload;
  (void)buffer;
  return 0;
}

void tree_sitter_telora_external_scanner_deserialize(
    void *payload, const char *buffer, unsigned length) {
  (void)payload;
  (void)buffer;
  (void)length;
}

bool tree_sitter_telora_external_scanner_scan(
    void *payload, TSLexer *lexer, const bool *valid_symbols) {
  (void)payload;

  if (!valid_symbols[SECTION_LPAREN] && !valid_symbols[RAW_STRING]) {
    return false;
  }

  skip_whitespace(lexer);

  if (valid_symbols[SECTION_LPAREN] && lexer->lookahead == '\\') {
    if (scan_section_lparen(lexer)) {
      lexer->result_symbol = SECTION_LPAREN;
      return true;
    }
    return false;
  }

  if (valid_symbols[RAW_STRING] && lexer->lookahead == 'r') {
    if (scan_raw_string(lexer)) {
      lexer->result_symbol = RAW_STRING;
      return true;
    }
    return false;
  }

  return false;
}
