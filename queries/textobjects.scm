; Definitions and closures.
(def_binding (expression) @function.inside) @function.around
(closure (block (block_body) @function.inside)) @function.around
(closure) @function.around
(impl_member (expression) @function.inside) @function.around
(type_binding (type_initializer) @class.inside) @class.around
(trait_binding) @class.around
(impl_binding) @class.around
; Comma-delimited arguments and parameters.
(parameters ((parameter) @parameter.inside . ","? @parameter.around) @parameter.around)
(arguments ((expression) @parameter.inside . ","? @parameter.around) @parameter.around)
(type_parameters ((type_parameter) @parameter.inside . ","? @parameter.around) @parameter.around)
(type_arguments ((type_argument) @parameter.inside . ","? @parameter.around) @parameter.around)
; Collection and model entries.
(array_item) @entry.around
(dict_field (expression) @entry.inside) @entry.around
(struct_initializer_field (expression) @entry.inside) @entry.around
(enum_initializer_variant) @entry.around
(match_arm (expression) @entry.inside) @entry.around
(let_binding (expression) @entry.inside) @entry.around
(comment) @comment.inside
(comment)+ @comment.around
