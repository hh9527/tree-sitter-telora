; Highlight query for tree-sitter-telora.

; ---------------------------------------------------------------- keywords
[
  "let"
  "decl"
  "def"
  "native"
  "for"
  "type"
  "trait"
  "impl"
  "struct"
  "enum"
  "fn"
  "Fn"
  "interpreter"
  "if"
  "else"
  "match"
  "return"
  "mod"
  "use"
  "data"
  "import"
  "as"
] @keyword

(visibility) @keyword

; ---------------------------------------------------------------- literals
(int_expr) @number
(int_pattern) @number
(float_expr) @number
(float_pattern) @number

(string_expr) @string
(string_pattern) @string
(raw_string) @string
(concat_string) @string
(concat_fragment) @string
(escape_sequence) @string.escape
(bytes_expr) @string

(constructor_pattern (identifier) @constant)
(data_format) @constant.builtin

(comment) @comment

; ---------------------------------------------------------------- functions
(def_binding
  (identifier) @function)

(module_declaration
  (identifier) @module)

(data_binding
  (identifier) @variable)

(parameter
  (identifier) @parameter)

; ---------------------------------------------------------------- types
(type_binding
  (identifier) @type.definition)

(type_parameters
  (type_parameter
    (identifier) @type.parameter))

(trait_binding
  (identifier) @type.definition)

(trait_member
  (identifier) @function.method)

(impl_member
  (identifier) @function.method)

(contract_expr
  (identifier) @type)

(decorator "@" @punctuation.delimiter)

(decorator_path (identifier) @namespace)
((decorator_path (identifier) @type) (#match? @type "^[A-Z]"))
(decorator_path (identifier) @decorator .)

; ---------------------------------------------------------------- variables
(variable_expr
  (identifier) @variable)

; ---------------------------------------------------------------- operators
[
  "="
  "+"
  "-"
  "*"
  "/"
  "%"
  "&"
  "|"
  "^"
  "<"
  "<="
  ">"
  ">="
  "=="
  "!="
  "&&"
  "||"
  "|>"
  "<~"
  "->"
  "=>"
  "::"
  "!"
  "..."
] @operator

; ---------------------------------------------------------------- punctuation
[
  "("
  ")"
  "["
  "]"
  "{"
  "}"
] @punctuation.bracket

(section_lparen) @punctuation.bracket

[
  ","
  ":"
  ";"
  "."
] @punctuation.delimiter

; ---------------------------------------------------------------- intrinsics
(interpreter_intrinsic
  "interpreter" @keyword)
(named_intrinsic
  (identifier) @function.builtin)
(postfix_intrinsic_suffix
  (identifier) @function.builtin)
(legacy_interpreter_expr
  "interpreter" @keyword)

; ---------------------------------------------------------------- paths
(use_path (identifier) @namespace)
((use_path (identifier) @type) (#match? @type "^[A-Z]"))
(static_path (identifier) @namespace)
((static_path (identifier) @type) (#match? @type "^[A-Z]"))
(use_item (identifier) @namespace)
((use_item (identifier) @type) (#match? @type "^[A-Z]"))

; crate / self / super 是路径根，单独按关键字着色
((use_path (identifier) @keyword) (#any-of? @keyword "crate" "self" "super"))
((static_path (identifier) @keyword) (#any-of? @keyword "crate" "self" "super"))

; ---------------------------------------------------------------- errors
(ERROR) @error
