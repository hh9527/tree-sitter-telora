//! This crate provides Telora language support for the [tree-sitter][] parsing library.
//!
//! Typically, you will use the [LANGUAGE][] constant to add this language to a
//! tree-sitter [Parser][], and then use the parser to parse some code:
//!
//! ```
//! let code = r#"
//! "#;
//! let mut parser = tree_sitter::Parser::new();
//! let language = tree_sitter_telora::LANGUAGE;
//! parser
//!     .set_language(&language.into())
//!     .expect("Error loading Telora parser");
//! let tree = parser.parse(code, None).unwrap();
//! assert!(!tree.root_node().has_error());
//! ```
//!
//! [Parser]: https://docs.rs/tree-sitter/*/tree_sitter/struct.Parser.html
//! [tree-sitter]: https://tree-sitter.github.io/

use tree_sitter_language::LanguageFn;

extern "C" {
    fn tree_sitter_telora() -> *const ();
}

/// The tree-sitter [`LanguageFn`][LanguageFn] for this grammar.
///
/// [LanguageFn]: https://docs.rs/tree-sitter-language/*/tree_sitter_language/struct.LanguageFn.html
pub const LANGUAGE: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_telora) };

/// The content of the [`node-types.json`][] file for this grammar.
///
/// [`node-types.json`]: https://tree-sitter.github.io/tree-sitter/using-parsers#static-node-types
pub const NODE_TYPES: &str = include_str!("../../src/node-types.json");

// NOTE: uncomment these to include any queries that this grammar contains:

// pub const HIGHLIGHTS_QUERY: &str = include_str!("../../queries/highlights.scm");
// pub const INJECTIONS_QUERY: &str = include_str!("../../queries/injections.scm");
// pub const LOCALS_QUERY: &str = include_str!("../../queries/locals.scm");
// pub const TAGS_QUERY: &str = include_str!("../../queries/tags.scm");

#[cfg(test)]
mod tests {
    #[test]
    fn raw_delimiter_edits_match_a_fresh_parse() {
        let mut source = std::fs::read_to_string(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("test/fixtures/raw-incremental.telora"),
        ).unwrap();
        let mut parser = tree_sitter::Parser::new();
        parser.set_language(&super::LANGUAGE.into()).unwrap();
        let mut tree = parser.parse(&source, None).unwrap();
        assert!(!tree.root_node().has_error());
        // First leave the first raw string unclosed, then repair its closer.
        for needle in ["r#", "one\"#"] {
            let offset = source.find(needle).unwrap() + needle.len();
            source.insert(offset, '#');
            tree.edit(&tree_sitter::InputEdit {
                start_byte: offset,
                old_end_byte: offset,
                new_end_byte: offset + 1,
                start_position: tree_sitter::Point::new(0, offset),
                old_end_position: tree_sitter::Point::new(0, offset),
                new_end_position: tree_sitter::Point::new(0, offset + 1),
            });
            tree = parser.parse(&source, Some(&tree)).unwrap();
            let mut fresh = tree_sitter::Parser::new();
            fresh.set_language(&super::LANGUAGE.into()).unwrap();
            let expected = fresh.parse(&source, None).unwrap();
            assert_eq!(tree.root_node().to_sexp(), expected.root_node().to_sexp());
        }
        assert!(!tree.root_node().has_error());
    }

    #[test]
    fn raw_content_is_chunked_and_parser_can_stop_between_chunks() {
        let mut parser = tree_sitter::Parser::new();
        parser.set_language(&super::LANGUAGE.into()).unwrap();
        let source = format!("r##\"{}\"##", "x".repeat(2 * 1024 * 1024));
        let mut calls = 0;
        let mut stop = |_: &tree_sitter::ParseState| {
            calls += 1;
            true
        };
        let tree = parser.parse_with_options(
            &mut |offset, _| &source.as_bytes()[offset..],
            None,
            Some(tree_sitter::ParseOptions::new().progress_callback(&mut stop)),
        );
        assert!(tree.is_none());
        assert!(calls > 0);
        parser.reset();
        let source = format!("r##\"{}\"##", "x".repeat(4097));
        let tree = parser.parse(&source, None).unwrap();
        assert!(!tree.root_node().has_error());
        let mut pending = vec![tree.root_node()];
        let mut lengths = vec![];
        while let Some(node) = pending.pop() {
            if node.kind() == "raw_text" { lengths.push(node.byte_range().len()); }
            let mut cursor = node.walk();
            pending.extend(node.children(&mut cursor));
        }
        assert_eq!(lengths.len(), 5);
        assert_eq!(lengths.iter().sum::<usize>(), 4097);
        assert!(lengths.iter().all(|length| *length <= 1024));
    }

    #[test]
    fn test_can_load_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE.into())
            .expect("Error loading Telora parser");
    }
}
