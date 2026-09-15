/*
 * External scanner for tree-sitter-telora.
 *
 * This scanner handles two lexical constructs:
 *
 *   SECTION_LPAREN  '\('   -- a two-character token
 *   RAW_START/TEXT/END -- the terminator must be `"` + the same number
 *                            of '#' as opened the literal (<= 255).
 *
 * Everything else (backtick concat strings with interpolation, strings,
 * numbers, ...) is handled by plain regex / anonymous tokens in
 * grammar.js.
 *
 * Whitespace outside raw content belongs to named grammar extras. The scanner
 * must not skip it, or its source range disappears from the Tree-sitter CST.
 * State is serialized after each accepted external token for speculative and
 * incremental parsing. Raw content is chunked to return control to the parser.
 */

#include "tree_sitter/parser.h"
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

enum TokenType {
  SECTION_LPAREN,
  RAW_START,
  RAW_TEXT,
  RAW_END,
};

typedef struct { uint8_t hashes; bool in_raw; } Scanner;

static bool scan_section_lparen(TSLexer *lexer) {
  if (lexer->lookahead != '\\') return false;
  lexer->advance(lexer, false);
  if (lexer->lookahead != '(') return false;
  lexer->advance(lexer, false);
  return true;
}

static bool scan_raw_start(Scanner *scanner, TSLexer *lexer) {
  /* assumes lookahead at 'r'. The header probe (r '#'* '"') may consume
   * chars even on failure; returning false makes tree-sitter re-lex the same
   * position with the regex tokens, so probing is safe. */
  lexer->advance(lexer, false);          /* r */
  uint8_t hashes = 0;
  while (lexer->lookahead == '#') {
    lexer->advance(lexer, false);
    if (hashes == 255) return false;
    hashes++;
  }
  if (lexer->lookahead != '"') return false;
  lexer->advance(lexer, false);
  scanner->hashes = hashes;
  scanner->in_raw = true;
  lexer->result_symbol = RAW_START;
  return true;
}

static bool scan_raw_content(Scanner *scanner, TSLexer *lexer) {
  bool content = false;
  unsigned steps = 0;
  lexer->mark_end(lexer);
  for (;;) {
    // Bound each scanner call so the parser can regain control and check its
    // progress callback. A delimiter probe costs at most 256 extra characters.
    if (steps++ == 1024 && content) {
      lexer->result_symbol = RAW_TEXT;
      return true;
    }
    if (lexer->eof(lexer)) {
      lexer->result_symbol = RAW_TEXT;
      return content;
    }
    if (lexer->lookahead == '"') {
      /* Consume the first matching delimiter, like the Telora lexer.
       * Any following '#' belongs to the next token (a comment). */
      lexer->advance(lexer, false);      /* consume '"' */
      uint8_t seen = 0;
      while (lexer->lookahead == '#' && seen < scanner->hashes) {
        lexer->advance(lexer, false);
        seen++;
      }
      if (seen == scanner->hashes) {
        if (content) {
          // Leave the matching delimiter for the next token.
          lexer->result_symbol = RAW_TEXT;
        } else {
          lexer->mark_end(lexer);
          lexer->result_symbol = RAW_END;
          scanner->in_raw = false;
        }
        return true;
      }
      content = true;
      lexer->mark_end(lexer);
      continue;                          /* not a terminator; keep scanning */
    }
    lexer->advance(lexer, false);
    content = true;
    lexer->mark_end(lexer);
  }
}

void *tree_sitter_telora_external_scanner_create(void) {
  return calloc(1, sizeof(Scanner));
}

void tree_sitter_telora_external_scanner_destroy(void *payload) {
  free(payload);
}

unsigned tree_sitter_telora_external_scanner_serialize(
    void *payload, char *buffer) {
  Scanner *scanner = payload;
  buffer[0] = scanner->hashes;
  buffer[1] = scanner->in_raw;
  return 2;
}

void tree_sitter_telora_external_scanner_deserialize(
    void *payload, const char *buffer, unsigned length) {
  Scanner *scanner = payload;
  scanner->hashes = length == 2 ? (uint8_t)buffer[0] : 0;
  scanner->in_raw = length == 2 && buffer[1] != 0;
}

bool tree_sitter_telora_external_scanner_scan(
    void *payload, TSLexer *lexer, const bool *valid_symbols) {
  Scanner *scanner = payload;
  // Recovery can enable every external token. Do not enter string mode there.
  if (valid_symbols[RAW_START] && valid_symbols[RAW_END]) return false;
  if (scanner->in_raw && (valid_symbols[RAW_TEXT] || valid_symbols[RAW_END])) {
    return scan_raw_content(scanner, lexer);
  }

  if (!valid_symbols[SECTION_LPAREN] && !valid_symbols[RAW_START]) {
    return false;
  }

  // Let the grammar retain named whitespace extras before external tokens.

  if (valid_symbols[SECTION_LPAREN] && lexer->lookahead == '\\') {
    if (scan_section_lparen(lexer)) {
      lexer->result_symbol = SECTION_LPAREN;
      return true;
    }
    return false;
  }

  if (valid_symbols[RAW_START] && lexer->lookahead == 'r') {
    return scan_raw_start(scanner, lexer);
  }

  return false;
}
