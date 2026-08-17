; Highlight query for tree-sitter-telora.

; ---------------------------------------------------------------- keywords
[
  "let"
  "decl"
  "def"
  "native"
  "option"
  "for"
  "type"
  "struct"
  "enum"
  "fn"
  "Fn"
  "interpreter"
  "if"
  "else"
  "match"
  "return"
  "import"
  "export"
  "as"
] @keyword

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
(bytes_expr) @string

(atom_expr) @constant
(atom_pattern) @constant
(tagged_pattern (atom_expr) @constant)

(comment) @comment

; ---------------------------------------------------------------- functions
(def_binding
  (identifier) @function)

(parameter
  (identifier) @parameter)

; ---------------------------------------------------------------- types
(type_binding
  (identifier) @type)

(type_parameters
  (identifier) @type.parameter)

(contract_expr
  (identifier) @type)

(decorator
  (decorator_path (identifier) @decorator))

(decorator "@" @punctuation.delimiter)

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
  "->"
  "=>"
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
  ","
  ":"
  ";"
  "."
  "@"
] @punctuation.bracket

(section_lparen) @punctuation.bracket

; ---------------------------------------------------------------- intrinsics
(interpreter_intrinsic
  "interpreter" @keyword)
(named_intrinsic
  (identifier) @function.builtin)
(postfix_intrinsic_suffix
  (identifier) @function.builtin)
(legacy_interpreter_expr
  "interpreter" @keyword)

; ---------------------------------------------------------------- errors
(ERROR) @error
