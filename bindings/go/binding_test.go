package tree_sitter_telora_test

import (
	"testing"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_telora "github.com/tree-sitter/tree-sitter-telora/bindings/go"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_telora.Language())
	if language == nil {
		t.Errorf("Error loading Telora grammar")
	}
}
